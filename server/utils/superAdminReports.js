'use strict'
const { availableStockSql } = require('./inventoryReportStock')
// Privileged, aggregate-only organization reports. Every historical query uses
// a branch predicate when one is selected; inactive branches remain reportable.
const {loadCollectionLedger} = require('./reportMetrics')

const numeric = value => Number(value || 0)
const single = async (db, sql, params) => {
  const [rows] = await db.query(sql, params)
  return n(rows[0] || {})
}
const list = async (db, sql, params) => {
  const [rows] = await db.query(sql, params)
  return rows.map(n)
}
const scope = (branchId, alias) => ({
  sql: branchId == null ? '' : ` AND ${alias}.branch_id = ?`,
  args: branchId == null ? [] : [branchId],
})
const todayInClinic = now => new Intl.DateTimeFormat('en-CA', {
  timeZone:'Asia/Manila', year:'numeric',month:'2-digit',day:'2-digit',
}).format(now)
const plusDays = (iso, days) => {
  const d = new Date(`${iso}T00:00:00Z`)
  d.setUTCDate(d.getUTCDate() + days)
  return d.toISOString().slice(0,10)
}
// mysql2 returns DECIMAL/SUM values as strings. Normalize only metric columns;
// numeric-looking human names and date labels must retain their original text.
const numericFields = new Set(['actions','cancelled','appointments','unique_patients','completed','no_show','arrived_or_no_show','pending','outstanding','low_stock','out_of_stock','no_show_rate','gross_billed','discounts','promotion_discounts','net_billed','bills','gross_received','voided','collected','refunded','net_collected','promotional_bills','promotion_savings','amount','transactions','gross','net','count','quantity','products','units_on_hand','estimated_selling_value','expired','expiring_soon','doctor_id','branch_id','service_id','promotion_id','is_active','patients','items'])
const n = obj => Object.fromEntries(Object.entries(obj || {}).map(([key,val])=>[key, numericFields.has(key) && val != null ? numeric(val) : val]))
const sum = (rows,key) => rows.reduce((a,row)=>a+numeric(row[key]),0)

async function loadOverview(db,{from,to,branchId,now}) {
  const a=scope(branchId,'a'), b=scope(branchId,'b'), i=scope(branchId,'i')
  const [appointments, outstanding, inventory, ledger] = await Promise.all([
    single(db,`SELECT COUNT(*) AS appointments, COUNT(DISTINCT a.patient_id) AS unique_patients,
      COALESCE(SUM(a.status='completed'),0) AS completed,
      COALESCE(SUM(a.status='no_show'),0) AS no_show,
      COALESCE(SUM(a.status IN ('completed','no_show')),0) AS arrived_or_no_show,
      COALESCE(SUM(a.status='pending'),0) AS pending
      FROM appointments a WHERE a.appointment_date BETWEEN ? AND ? ${a.sql}`,[from,to,...a.args]),
    single(db,`SELECT COALESCE(SUM(GREATEST(0,b.total_amount-COALESCE(p.paid_amount,0))),0) AS outstanding
      FROM billing_records b LEFT JOIN
      (SELECT billing_id,SUM(CASE WHEN status='completed' THEN amount-COALESCE(refund_amount,0) ELSE 0 END) AS paid_amount
       FROM billing_payments GROUP BY billing_id) p ON p.billing_id=b.id
      WHERE b.status IN ('ready','partially_paid') ${b.sql}`,b.args),
    single(db,`SELECT COUNT(*) AS items,
      COALESCE(SUM(${availableStockSql()}<=0),0) AS out_of_stock,
      COALESCE(SUM(${availableStockSql()}>0 AND ${availableStockSql()}<=i.threshold),0) AS low_stock
      FROM inventory i WHERE i.archived_at IS NULL ${i.sql}`,i.args),
    loadCollectionLedger({startDate:from,endDate:to,branchId},db),
  ])
  return {
    totals: { ...n(appointments), outstanding:numeric(outstanding.outstanding),
      net_collected:numeric(ledger.summary.net_collected), low_stock:numeric(inventory.low_stock),
      out_of_stock:numeric(inventory.out_of_stock),
      no_show_rate: numeric(appointments.arrived_or_no_show) ? 100*numeric(appointments.no_show)/numeric(appointments.arrived_or_no_show) : 0 },
    revenue_trend:ledger.trend,
    note:'Net collections use payment, void, and refund event dates. Stock and unpaid balances are current snapshots, not period totals.',
  }
}
async function loadAppointments(db,{from,to,branchId}) {
  const a=scope(branchId,'a')
  const bind=[from,to,...a.args]
  const [summary,status,source,department,firstVisit] = await Promise.all([
    single(db,`SELECT COUNT(*) AS appointments, COUNT(DISTINCT a.patient_id) AS unique_patients,
      COALESCE(SUM(a.status='completed'),0) AS completed,
      COALESCE(SUM(a.status='cancelled'),0) AS cancelled,
      COALESCE(SUM(a.status='no_show'),0) AS no_show,
      COALESCE(SUM(a.status='pending'),0) AS pending
      FROM appointments a WHERE a.appointment_date BETWEEN ? AND ? ${a.sql}`,bind),
    list(db,`SELECT a.status AS name, COUNT(*) AS count FROM appointments a
      WHERE a.appointment_date BETWEEN ? AND ? ${a.sql} GROUP BY a.status ORDER BY count DESC`,bind),
    list(db,`SELECT COALESCE(a.appointment_source,'online') AS name,COUNT(*) AS count FROM appointments a
      WHERE a.appointment_date BETWEEN ? AND ? ${a.sql}
      GROUP BY COALESCE(a.appointment_source,'online') ORDER BY count DESC`,bind),
    list(db,`SELECT a.clinic_type AS name,COUNT(*) AS count FROM appointments a
      WHERE a.appointment_date BETWEEN ? AND ? ${a.sql} GROUP BY a.clinic_type ORDER BY count DESC`,bind),
    single(db,`SELECT COUNT(*) AS unique_patients,
      COALESCE(SUM(first.first_date BETWEEN ? AND ? ${branchId == null ? '' : 'AND first.first_branch=?'}),0) AS new_patients
      FROM (SELECT DISTINCT a.patient_id FROM appointments a WHERE a.appointment_date BETWEEN ? AND ? ${a.sql}) scoped
      JOIN (SELECT patient_id,appointment_date AS first_date,branch_id AS first_branch FROM (
        SELECT patient_id,appointment_date,branch_id,
        ROW_NUMBER() OVER(PARTITION BY patient_id ORDER BY appointment_date,id) AS rn
        FROM appointments
      ) ranked WHERE ranked.rn=1) first ON first.patient_id=scoped.patient_id`,
      [from,to,...(branchId==null?[]:[branchId]),from,to,...a.args]),
  ])
  return { summary:{...n(summary),new_patients:numeric(firstVisit.new_patients),
    returning_patients:Math.max(0,numeric(firstVisit.unique_patients)-numeric(firstVisit.new_patients))},
    statuses:status,sources:source,departments:department,
    note:'A new patient has their first-ever recorded appointment in this period at a selected branch. Patients seen first at another branch are returning for the selected branch.' }
}
async function loadFinancial(db,{from,to,branchId}) {
  const b=scope(branchId,'b')
  const [[billing],ledger, [promotions], [outstanding]] = await Promise.all([
    db.query(`SELECT COALESCE(SUM(b.subtotal),0) AS gross_billed,
      COALESCE(SUM(b.discount_amount),0) AS discounts,
      COALESCE(SUM(b.promotion_discount_amount),0) AS promotion_discounts,
      COALESCE(SUM(b.total_amount),0) AS net_billed,
      COUNT(*) AS bills
      FROM billing_records b
      WHERE b.status NOT IN ('draft','pending','voided') AND DATE(COALESCE(b.finalized_at,b.created_at)) BETWEEN ? AND ? ${b.sql}`,[from,to,...b.args]),
    loadCollectionLedger({startDate:from,endDate:to,branchId},db),
    db.query(`SELECT COUNT(*) AS promotional_bills,COALESCE(SUM(b.promotion_discount_amount),0) AS promotion_savings
      FROM billing_records b WHERE b.promotion_discount_amount>0 AND b.status NOT IN ('draft','pending','voided')
      AND DATE(COALESCE(b.finalized_at,b.created_at)) BETWEEN ? AND ? ${b.sql}`,[from,to,...b.args]),
    db.query(`SELECT COALESCE(SUM(GREATEST(0,b.total_amount-COALESCE(p.paid_amount,0))),0) AS amount
      FROM billing_records b LEFT JOIN
      (SELECT billing_id,SUM(CASE WHEN status='completed' THEN amount-COALESCE(refund_amount,0) ELSE 0 END) AS paid_amount
       FROM billing_payments GROUP BY billing_id) p ON p.billing_id=b.id
      WHERE b.status IN ('ready','partially_paid') ${b.sql}`,b.args),
  ])
  return {billing:n(billing?.[0]), collections:ledger.summary,
    payments_by_method:ledger.byMethod, revenue_trend:ledger.trend,
    promotions:n(promotions?.[0]),outstanding:numeric(outstanding?.[0]?.amount),
    note:'Billed amounts use bill finalization date; collections use actual payment/void/refund dates. Outstanding is the current unpaid balance.'}
}
async function loadServices(db,{from,to,branchId}) {
  const a=scope(branchId,'a'),b=scope(branchId,'b')
  const [doctors,services,promotions] = await Promise.all([
    list(db,`SELECT a.doctor_id,a.branch_id,cb.name AS branch_name,d.full_name AS name,
      COUNT(*) AS appointments,COUNT(DISTINCT a.patient_id) AS patients,
      COALESCE(SUM(a.status='completed'),0) AS completed,
      COALESCE(SUM(a.status='no_show'),0) AS no_show
      FROM appointments a JOIN doctors d ON d.id=a.doctor_id
      JOIN clinic_branches cb ON cb.id=a.branch_id
      WHERE a.appointment_date BETWEEN ? AND ? ${a.sql}
      GROUP BY a.doctor_id,a.branch_id,cb.name,d.full_name
      ORDER BY completed DESC,appointments DESC LIMIT 50`,[from,to,...a.args]),
    list(db,`SELECT b.branch_id,cb.name AS branch_name,
      COALESCE(bi.catalog_service_id,0) AS service_id,bi.service_name AS name,
      COUNT(DISTINCT bi.billing_id) AS bills, COALESCE(SUM(bi.quantity),0) AS quantity,
      COALESCE(SUM(bi.line_total),0) AS gross_billed
      FROM billing_items bi JOIN billing_records b ON b.id=bi.billing_id
      JOIN clinic_branches cb ON cb.id=b.branch_id
      WHERE bi.item_type='service' AND b.status NOT IN ('draft','pending','voided')
      AND DATE(COALESCE(b.finalized_at,b.created_at)) BETWEEN ? AND ? ${b.sql}
      GROUP BY b.branch_id,cb.name,bi.catalog_service_id,bi.service_name
      ORDER BY gross_billed DESC LIMIT 50`,[from,to,...b.args]),
    list(db,`SELECT b.branch_id,cb.name AS branch_name,a.promotion_id,
      MAX(a.promotion_title_snapshot) AS name,COUNT(DISTINCT b.id) AS bills,
      COALESCE(SUM(b.promotion_discount_amount),0) AS discounts
      FROM billing_records b JOIN appointments a ON a.id=b.appointment_id
      JOIN clinic_branches cb ON cb.id=b.branch_id
      WHERE b.status NOT IN ('draft','pending','voided') AND b.promotion_discount_amount>0
      AND DATE(COALESCE(b.finalized_at,b.created_at)) BETWEEN ? AND ? ${b.sql}
      GROUP BY b.branch_id,cb.name,a.promotion_id
      ORDER BY discounts DESC LIMIT 50`,[from,to,...b.args]),
  ])
  return {doctors,services,promotions,
    note:'Doctor activity belongs to the branch of each appointment. Service values are line-item totals before bill-level discounts, not received payments.'}
}
async function loadInventory(db,{from,to,branchId,now}) {
  const i=scope(branchId,'i'),log=scope(branchId,'l'),batch=scope(branchId,'b'),room=scope(branchId,'loc')
  const today=todayInClinic(now), soon=plusDays(today,30)
  const [summary,byCategory,used,movements,expiry,stockrooms] = await Promise.all([
    single(db,`SELECT COUNT(*) AS products,
      COALESCE(SUM(i.stock),0) AS units_on_hand,
      COALESCE(SUM(${availableStockSql()}<=0),0) AS out_of_stock,
      COALESCE(SUM(${availableStockSql()}>0 AND ${availableStockSql()}<=i.threshold),0) AS low_stock,
      COALESCE(SUM(i.stock*COALESCE(i.selling_price,i.price,0)),0) AS estimated_selling_value
      FROM inventory i WHERE i.archived_at IS NULL ${i.sql}`,i.args),
    list(db,`SELECT COALESCE(i.category,'Uncategorized') AS name,COUNT(*) AS products,
      COALESCE(SUM(i.stock),0) AS quantity,
      COALESCE(SUM(i.stock*COALESCE(i.selling_price,i.price,0)),0) AS estimated_selling_value
      FROM inventory i WHERE i.archived_at IS NULL ${i.sql} GROUP BY i.category ORDER BY products DESC`,i.args),
    list(db,`SELECT l.branch_id,cb.name AS branch_name,i.name,COALESCE(NULLIF(i.uom,''),NULLIF(i.base_unit,''),NULLIF(i.unit,''),'unit') AS unit,
      COALESCE(SUM(CASE WHEN l.movement_type IN ('clinical_use','dispensed') THEN l.qty
        WHEN l.movement_type IN ('clinical_return','dispense_return') THEN -l.qty ELSE 0 END),0) AS quantity
      FROM inventory_logs l JOIN inventory i ON i.id=l.inventory_id JOIN clinic_branches cb ON cb.id=l.branch_id
      WHERE DATE(l.logged_at) BETWEEN ? AND ? AND l.movement_type IN
      ('clinical_use','dispensed','clinical_return','dispense_return') ${log.sql}
      GROUP BY l.branch_id,cb.name,l.inventory_id,i.name,i.unit,i.uom,i.base_unit
      HAVING quantity>0 ORDER BY quantity DESC LIMIT 30`,[from,to,...log.args]),
    list(db,`SELECT COALESCE(l.movement_type,IF(l.type='in','received','adjustment_out')) AS name,
      COUNT(*) AS actions,COALESCE(SUM(l.qty),0) AS quantity
      FROM inventory_logs l WHERE DATE(l.logged_at) BETWEEN ? AND ? ${log.sql}
      GROUP BY name ORDER BY actions DESC`,[from,to,...log.args]),
    single(db,`SELECT COALESCE(SUM(b.expiration_date<?),0) AS expired,
      COALESCE(SUM(b.expiration_date BETWEEN ? AND ?),0) AS expiring_soon
      FROM inventory_batches b JOIN inventory i ON i.id=b.inventory_id AND i.branch_id=b.branch_id AND i.archived_at IS NULL WHERE b.archived_at IS NULL AND b.quantity>0 ${batch.sql}`,
      [today,today,soon,...batch.args]),
    list(db,`SELECT loc.id,loc.branch_id,cb.name AS branch_name,loc.name,
      loc.location_type,loc.is_active,
      COUNT(DISTINCT i.id) AS products,
      COALESCE(SUM(CASE WHEN i.id IS NOT NULL THEN ils.quantity ELSE 0 END),0) AS quantity
      FROM inventory_locations loc JOIN clinic_branches cb ON cb.id=loc.branch_id
      LEFT JOIN inventory_location_stock ils ON ils.location_id=loc.id
      LEFT JOIN inventory i ON i.id=ils.inventory_id AND i.branch_id=loc.branch_id AND i.archived_at IS NULL
      WHERE 1=1 ${room.sql}
      GROUP BY loc.id,loc.branch_id,cb.name,loc.name,loc.location_type,loc.is_active
      ORDER BY cb.name,loc.is_main_stockroom DESC,loc.name`,room.args),
  ])
  return {summary:{...n(summary),...n(expiry)},categories:byCategory,most_used:used,movements,stockrooms,
    as_of:today,note:'Products count branch-item records; expiry figures count stocked batches. Stock alerts use available whole units; valuation uses physical stock. Stock totals are current, while movements and usage reflect the selected date range. Selling-value estimates are not purchase costs or profit. Different product units should not be compared as a single physical unit.'}
}

const SECTIONS = Object.freeze(['overview','appointments','financial','services','inventory'])
async function loadSuperAdminReport(db,{section,from,to,branchId=null,now=new Date()}) {
  if (!SECTIONS.includes(section)) { const e=new Error('Invalid report section');e.statusCode=400;throw e }
  const args={from,to,branchId,now}
  const handlers={overview:loadOverview,appointments:loadAppointments,financial:loadFinancial,services:loadServices,inventory:loadInventory}
  return {section,from,to,branch_id:branchId, data: await handlers[section](db,args)}
}
module.exports={loadSuperAdminReport,SECTIONS,todayInClinic,plusDays,scope}
