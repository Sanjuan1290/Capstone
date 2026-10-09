// Real, explicitly branch-scoped read models for the original Admin UI.
// Do not forward these requests to unfiltered single-clinic controllers.
const db = require('../db/connect')
const { getBillingRecordWithItems } = require('../utils/billing')
const { groupTransferRows } = require('../utils/supplyTransfers')

const dateOnly = (value) => /^\d{4}-\d{2}-\d{2}$/.test(String(value || '')) ? String(value) : ''
const pageOptions = (query) => {
  const page = Math.max(1, Math.min(100000, Number(query.page) || 1))
  const limit = Math.max(1, Math.min(100, Number(query.limit) || 10))
  return { page, limit, offset: (page-1)*limit }
}

async function readBills(req,res) {
  const { page,limit,offset }=pageOptions(req.query)
  const statuses=String(req.query.status||'').split(',').map(s=>s.trim()).filter(Boolean).slice(0,10)
  const conditions=['b.branch_id=?'];const args=[req.branchId]
  if (statuses.length){conditions.push(`b.status IN (${statuses.map(()=>'?').join(',')})`);args.push(...statuses)}
  const search=String(req.query.search||'').trim().slice(0,120)
  if (search){conditions.push('(p.full_name LIKE ? OR d.full_name LIKE ? OR CAST(b.id AS CHAR) LIKE ?)');args.push(...Array(3).fill(`%${search}%`))}
  const from=dateOnly(req.query.date_from),to=dateOnly(req.query.date_to)
  if(from){conditions.push('a.appointment_date>=?');args.push(from)}
  if(to){conditions.push('a.appointment_date<=?');args.push(to)}
  const where=`WHERE ${conditions.join(' AND ')}`
  const joins=`FROM billing_records b
     JOIN appointments a ON a.id=b.appointment_id AND a.branch_id=b.branch_id
     JOIN patients p ON p.id=b.patient_id
     JOIN doctors d ON d.id=b.doctor_id AND d.branch_id=b.branch_id
     LEFT JOIN (SELECT billing_id,COALESCE(SUM(CASE WHEN status='completed' THEN amount-COALESCE(refund_amount,0) ELSE 0 END),0) AS paid_amount,
         GROUP_CONCAT(DISTINCT CASE WHEN status='completed' THEN payment_method END SEPARATOR ',') AS payment_methods
       FROM billing_payments GROUP BY billing_id) pay ON pay.billing_id=b.id`
  const [[count]]=await db.query(`SELECT COUNT(*) AS total ${joins} ${where}`,args)
  const [rows]=await db.query(`SELECT b.id,b.appointment_id,b.status,b.version,b.subtotal,b.total_amount,b.discount_amount,b.discount_type,b.discount_label,b.payment_method,b.created_at,b.updated_at,b.finalized_at,
     COALESCE(pay.paid_amount,0) AS paid_amount,GREATEST(0,b.total_amount-COALESCE(pay.paid_amount,0)) AS balance_amount,COALESCE(pay.payment_methods,'') AS payment_methods,
     DATE_FORMAT(a.appointment_date,'%Y-%m-%d') AS appointment_date,a.appointment_time,a.reason AS appointment_reason,a.clinic_type,a.appointment_source,
     p.full_name AS patient_name,p.phone AS patient_phone,d.full_name AS doctor_name,d.specialty AS doctor_specialty
     ${joins} ${where} ORDER BY b.created_at DESC,b.id DESC LIMIT ? OFFSET ?`,[...args,limit,offset])
  // Summary is branch-scoped regardless of page and the requested status tab.
  const [[summary]]=await db.query(`SELECT COUNT(*) AS total,
     SUM(b.status IN ('draft','pending')) AS draft,SUM(b.status='ready') AS ready,SUM(b.status='partially_paid') AS partially_paid,SUM(b.status='paid') AS paid,
     COALESCE(SUM(CASE WHEN b.status IN ('draft','pending','ready','partially_paid') THEN GREATEST(0,b.total_amount-COALESCE(pay.paid_amount,0)) ELSE 0 END),0) AS outstanding,
     COALESCE(SUM(COALESCE(pay.paid_amount,0)),0) AS collected
     ${joins} WHERE b.branch_id=?`,[req.branchId])
  const total=Number(count?.total||0),totalPages=Math.max(1,Math.ceil(total/limit))
  return res.json({items:rows.map(r=>({...r,paid_amount:Number(r.paid_amount||0),balance_amount:Number(r.balance_amount||0),payment_methods:String(r.payment_methods||'').split(',').filter(Boolean)})),
    pagination:{page,limit,total,totalPages,hasPrev:page>1,hasNext:page<totalPages},
    summary:{total:Number(summary.total||0),draft:Number(summary.draft||0),pending:Number(summary.draft||0),ready:Number(summary.ready||0),partially_paid:Number(summary.partially_paid||0),paid:Number(summary.paid||0),outstanding:Number(summary.outstanding||0),collected:Number(summary.collected||0)}})
}

async function readBill(req,res){
  const billId=Number(req.params.id)
  if(!Number.isSafeInteger(billId)||billId<1)return res.status(400).json({message:'Invalid bill number.'})
  const [[owner]]=await db.query('SELECT id FROM billing_records WHERE id=? AND branch_id=?',[billId,req.branchId])
  if(!owner)return res.status(404).json({message:'Bill not found for this branch.'})
  const bill=await getBillingRecordWithItems(owner.id)
  return bill?res.json(bill):res.status(404).json({message:'Bill not found.'})
}

async function readCashDrawer(req,res){
  const date=dateOnly(req.query.date) || new Date().toISOString().slice(0,10)
  const cashierId=req.user.id
  const [[payments]]=await db.query(`SELECT COUNT(*) AS transactions,
      COALESCE(SUM(IF(bp.payment_method='cash',bp.amount,0)),0) AS cash_received,
      COALESCE(SUM(IF(bp.payment_method<>'cash',bp.amount,0)),0) AS non_cash_collected
      FROM billing_payments bp JOIN billing_records br ON br.id=bp.billing_id
      WHERE br.branch_id=? AND bp.received_by_admin_id=? AND bp.status='completed' AND DATE(bp.paid_at)=?`,[req.branchId,cashierId,date])
  const [[refunds]]=await db.query(`SELECT COALESCE(SUM(r.amount),0) AS cash_refunds FROM billing_payment_refunds r
      JOIN billing_payments bp ON bp.id=r.payment_id JOIN billing_records br ON br.id=bp.billing_id
      WHERE br.branch_id=? AND bp.received_by_admin_id=? AND COALESCE(r.payment_method,bp.payment_method)='cash' AND DATE(r.refunded_at)=?`,[req.branchId,cashierId,date])
  const [[closing]]=await db.query(`SELECT * FROM cashier_closings WHERE branch_id=? AND cashier_role='admin' AND staff_id=? AND closing_date=? LIMIT 1`,[req.branchId,cashierId,date])
  const cash=Number(payments.cash_received||0),refund=Number(refunds.cash_refunds||0)
  res.json({date,transactions:Number(payments.transactions||0),cash_received:cash,cash_refunds:refund,expected_cash:Math.round((cash-refund)*100)/100,non_cash_collected:Number(payments.non_cash_collected||0),closing:closing||null})
}

async function readTransferGroups(req,res){
  const [rows]=await db.query(`SELECT g.id AS request_group_id,g.doctor_id,d.full_name AS doctor_name,g.appointment_id,g.consultation_id,
      a.status AS appointment_status,DATE_FORMAT(a.appointment_date,'%Y-%m-%d') AS appointment_date,a.appointment_time,
      p.full_name AS patient_name,COALESCE(bsc.service_name,a.requested_service_name_snapshot) AS requested_service_name,
      g.destination_location_id,COALESCE(loc.name,g.destination_location) AS destination_location,g.reason AS group_reason,
      g.status AS group_status,g.requested_at AS group_requested_at,g.updated_at AS group_updated_at,g.resolved_at AS group_resolved_at,
      g.resolved_by_role,g.resolved_by_user_id,g.resolution_note AS group_resolution_note,
      sr.id AS line_id,sr.inventory_id,sr.qty_requested,i.name AS item_name,i.category,i.item_type,COALESCE(i.uom,i.base_unit,i.unit,'unit') AS unit,
      i.measurement_value,i.measurement_unit,
      COALESCE((SELECT SUM(ilb.quantity) FROM inventory_location_batches ilb JOIN inventory_locations stock ON stock.id=ilb.location_id
        JOIN inventory_batches batch ON batch.id=ilb.batch_id
        WHERE ilb.inventory_id=i.id AND stock.branch_id=g.branch_id AND stock.is_main_stockroom=1
        AND batch.branch_id=g.branch_id AND ilb.quantity>0 AND batch.archived_at IS NULL AND (batch.expiration_date IS NULL OR batch.expiration_date>=CURDATE())),0) AS main_stockroom_stock,
      COALESCE((SELECT SUM(ilb.quantity) FROM inventory_location_batches ilb JOIN inventory_batches batch ON batch.id=ilb.batch_id
        WHERE ilb.inventory_id=i.id AND ilb.location_id=g.destination_location_id AND batch.branch_id=g.branch_id AND ilb.quantity>0),0) AS destination_stock
      FROM supply_request_groups g JOIN supply_requests sr ON sr.request_group_id=g.id AND sr.branch_id=g.branch_id
      JOIN inventory i ON i.id=sr.inventory_id AND i.branch_id=g.branch_id
      JOIN doctors d ON d.id=g.doctor_id AND d.branch_id=g.branch_id
      LEFT JOIN appointments a ON a.id=g.appointment_id AND a.branch_id=g.branch_id
      LEFT JOIN patients p ON p.id=a.patient_id
      LEFT JOIN billing_service_catalog bsc ON bsc.id=a.requested_service_id AND bsc.branch_id=g.branch_id
      LEFT JOIN inventory_locations loc ON loc.id=g.destination_location_id AND loc.branch_id=g.branch_id
      WHERE g.branch_id=? ORDER BY FIELD(g.status,'pending','approved','rejected'),g.requested_at DESC,sr.id`,[req.branchId])
  res.json(groupTransferRows(rows))
}

async function readSystemSetup(req,res){
  const b=req.branchId
  const [visit,cancel,categories,uoms,suppliers,types,movements]=await Promise.all([
    db.query('SELECT id,label,clinic_type,is_active,sort_order,created_at FROM appointment_reason_options WHERE branch_id=? ORDER BY created_at,id',[b]),
    db.query(`SELECT r.id,r.label,r.is_active,r.created_at,r.updated_at,COUNT(a.id) AS appointment_count
      FROM appointment_cancellation_reasons r LEFT JOIN appointments a ON a.cancellation_reason_id=r.id AND a.branch_id=r.branch_id
      WHERE r.branch_id=? GROUP BY r.id ORDER BY r.created_at,r.id`,[b]),
    db.query(`SELECT c.id,c.name,c.clinic_type,c.is_active,COUNT(s.id) AS service_count FROM billing_service_categories c
      LEFT JOIN billing_service_catalog s ON s.category_id=c.id AND s.branch_id=c.branch_id
      WHERE c.branch_id=? GROUP BY c.id ORDER BY c.name`,[b]),
    db.query('SELECT id,name,allow_decimal_quantity,decimal_precision,is_active,sort_order FROM inventory_uoms ORDER BY sort_order,name'),
    db.query('SELECT id,name,contact_person,contact_number,address,category,is_active FROM inventory_suppliers ORDER BY name'),
    db.query('SELECT id,name,code,is_active,sort_order FROM inventory_location_types WHERE branch_id=? ORDER BY sort_order,name',[b]),
    db.query('SELECT id,name,code,movement_type,requires_batch,is_system,is_active,created_at FROM inventory_movement_reasons ORDER BY name'),
  ])
  res.json({visit_reasons:visit[0],cancellation_reasons:cancel[0],service_categories:categories[0],uoms:uoms[0],suppliers:suppliers[0],location_types:types[0],movement_reasons:movements[0]})
}

async function readReconciliation(req,res){
  const date=dateOnly(req.query.date)||new Date().toISOString().slice(0,10)
  const [methods]=await db.query(`SELECT bp.payment_method,COUNT(*) AS transactions,COALESCE(SUM(bp.amount),0) AS amount
       FROM billing_payments bp JOIN billing_records b ON b.id=bp.billing_id
       WHERE b.branch_id=? AND bp.status='completed' AND DATE(bp.paid_at)=? GROUP BY bp.payment_method`,[req.branchId,date])
  const [[gross]]=await db.query(`SELECT COUNT(*) AS transactions,COALESCE(SUM(bp.amount),0) AS gross_collected FROM billing_payments bp
       JOIN billing_records b ON b.id=bp.billing_id WHERE b.branch_id=? AND bp.status='completed' AND DATE(bp.paid_at)=?`,[req.branchId,date])
  const [[refund]]=await db.query('SELECT COALESCE(SUM(r.amount),0) AS refunded FROM billing_payment_refunds r JOIN billing_payments bp ON bp.id=r.payment_id JOIN billing_records b ON b.id=bp.billing_id WHERE b.branch_id=? AND DATE(r.refunded_at)=?',[req.branchId,date])
  const [[discount]]=await db.query("SELECT COALESCE(SUM(discount_amount),0) AS discounts FROM billing_records WHERE branch_id=? AND status<>'voided' AND DATE(COALESCE(finalized_at,created_at))=?",[req.branchId,date])
  const [[voids]]=await db.query("SELECT COUNT(*) AS total FROM billing_payments bp JOIN billing_records b ON b.id=bp.billing_id WHERE b.branch_id=? AND bp.status='voided' AND DATE(COALESCE(bp.voided_at,bp.paid_at))=?",[req.branchId,date])
  const [closings]=await db.query('SELECT * FROM cashier_closings WHERE branch_id=? AND closing_date=?',[req.branchId,date])
  const grossAmount=Number(gross.gross_collected||0),refundAmount=Number(refund.refunded||0)
  const byMethod=Object.fromEntries(methods.map(m=>[m.payment_method,{transactions:Number(m.transactions),amount:Number(m.amount)}]))
  res.json({date,methods:byMethod,summary:{transactions:Number(gross.transactions||0),gross_collected:grossAmount,voided:Number(voids.total||0),refunded:refundAmount,net_collected:grossAmount-refundAmount,discounts:Number(discount.discounts||0)},cashiers:[],closings})
}

async function readAdjustments(req,res){
  const {page,limit,offset}=pageOptions(req.query)
  const status=String(req.query.status||'').trim()
  const cond=['b.branch_id=?'];const args=[req.branchId]
  if(status){cond.push('r.status=?');args.push(status)}
  const where=`WHERE ${cond.join(' AND ')}`
  const [[total]]=await db.query(`SELECT COUNT(*) AS total FROM billing_adjustment_requests r JOIN billing_records b ON b.id=r.billing_id ${where}`,args)
  const [items]=await db.query(`SELECT r.*,s.full_name AS staff_name,p.full_name AS patient_name
     FROM billing_adjustment_requests r JOIN billing_records b ON b.id=r.billing_id
     JOIN staff s ON s.id=r.staff_id JOIN patients p ON p.id=b.patient_id ${where}
     ORDER BY r.created_at DESC,r.id DESC LIMIT ? OFFSET ?`,[...args,limit,offset])
  res.json({items,pagination:{page,limit,total:Number(total.total||0),totalPages:Math.max(1,Math.ceil(Number(total.total||0)/limit))}})
}

async function readBillStockUsage(req,res){
 const billId=Number(req.params.id)
 if(!Number.isSafeInteger(billId)||billId<1)return res.status(400).json({message:'Invalid bill.'})
 const [[owner]]=await db.query('SELECT id FROM billing_records WHERE id=? AND branch_id=?',[billId,req.branchId])
 if(!owner)return res.status(404).json({message:'Bill not found in this branch.'})
 const [consultation]=await db.query(`SELECT ciub.id usage_batch_id,ciu.id usage_id,ciu.consultation_id,ciu.inventory_id,i.name item_name,COALESCE(i.uom,i.base_unit,i.unit,'unit') unit,ciub.batch_id,ib.batch_code,ib.expiration_date,ciub.package_quantity used_quantity,COALESCE(ciub.returned_quantity,0) returned_quantity,ciub.source_location,ciub.source_location_id,ciub.recorded_at,ciub.last_returned_at FROM consultation_inventory_usage ciu JOIN consultation_inventory_usage_batches ciub ON ciub.consultation_usage_id=ciu.id JOIN inventory i ON i.id=ciu.inventory_id AND i.branch_id=? LEFT JOIN inventory_batches ib ON ib.id=ciub.batch_id AND ib.branch_id=? WHERE ciu.billing_id=? ORDER BY i.name,ciub.id`,[req.branchId,req.branchId,billId])
 const [checkout]=await db.query(`SELECT u.id usage_id,u.billing_item_id,u.inventory_id,i.name item_name,COALESCE(i.uom,i.base_unit,i.unit,'unit') unit,u.batch_id,ib.batch_code,ib.expiration_date,u.package_quantity quantity,u.movement_type,u.source_location,u.source_location_id,u.recorded_at,u.returned_at,u.return_reason FROM billing_item_batch_usage u JOIN inventory i ON i.id=u.inventory_id AND i.branch_id=? LEFT JOIN inventory_batches ib ON ib.id=u.batch_id AND ib.branch_id=? WHERE u.billing_id=? ORDER BY u.id`,[req.branchId,req.branchId,billId])
 res.json({consultation,checkout:checkout.map(r=>({...r,quantity:Number(r.quantity||0),returned:Boolean(r.returned_at)}))})
}
async function readInventoryMasterData(req,res){
 const category=['medical','derma'].includes(String(req.query.category||''))?String(req.query.category):null
 const [suppliers]=await db.query(`SELECT id,name,contact_person,contact_number,address,category FROM inventory_suppliers WHERE is_active=1 ${category?"AND FIND_IN_SET(?,REPLACE(category,' ','')) > 0":''} ORDER BY name`,category?[category]:[])
 const [types]=await db.query('SELECT id,name,code,is_active,sort_order FROM inventory_location_types WHERE branch_id=? ORDER BY is_active DESC,sort_order,name',[req.branchId])
 const [reasons]=await db.query("SELECT id,name,code,movement_type,requires_batch,is_system FROM inventory_movement_reasons WHERE is_active=1 ORDER BY FIELD(movement_type,'in','out'),is_system DESC,name",[])
 res.json({suppliers,location_types:types,movement_reasons:reasons})
}
async function readInventoryLogs(req,res){
 const {page,limit,offset}=pageOptions(req.query)
 const conditions=['il.branch_id=?'];const args=[req.branchId]
 const from=dateOnly(req.query.start_date),to=dateOnly(req.query.end_date)
 if(from){conditions.push('DATE(il.logged_at)>=?');args.push(from)}
 if(to){conditions.push('DATE(il.logged_at)<=?');args.push(to)}
 for(const [param,column] of [['batch_id','batch_id'],['inventory_id','inventory_id']]){if(req.query[param]!==undefined){const id=Number(req.query[param]);if(!Number.isSafeInteger(id)||id<1)return res.status(400).json({message:`Invalid ${param}.`});conditions.push(`il.${column}=?`);args.push(id)}}
 const kind=String(req.query.kind||'all')
 const extra={all:"COALESCE(il.movement_type,'') <> 'transfer_in'",stock_in:"il.type='in' AND COALESCE(il.movement_type,'') NOT IN ('transfer_in','correction_in')",stock_out:"il.type='out' AND COALESCE(il.movement_type,'') NOT IN ('transfer_out','adjustment_out')",transfers:"il.movement_type='transfer_out'",corrections:"il.movement_type IN ('correction_in','adjustment_out')"}
 if(!(kind in extra))return res.status(400).json({message:'Invalid movement category.'})
 conditions.push(`(${extra[kind]})`)
 const where=`WHERE ${conditions.join(' AND ')}`
 const [[totalRow]]=await db.query(`SELECT COUNT(*) total FROM inventory_logs il ${where}`,args)
 const [items]=await db.query(`SELECT il.*,i.name item_name,ib.batch_code,ib.supplier_lot_number,COALESCE(st.full_name,ad.full_name,'System') performed_by,CASE WHEN il.admin_id IS NOT NULL THEN 'Admin' WHEN il.staff_id IS NOT NULL THEN 'Staff' ELSE 'System' END performed_by_role FROM inventory_logs il JOIN inventory i ON i.id=il.inventory_id AND i.branch_id=il.branch_id LEFT JOIN inventory_batches ib ON ib.id=il.batch_id AND ib.branch_id=il.branch_id LEFT JOIN staff st ON st.id=il.staff_id LEFT JOIN admins ad ON ad.id=il.admin_id ${where} ORDER BY il.logged_at DESC,il.id DESC LIMIT ? OFFSET ?`,[...args,limit,offset])
 const total=Number(totalRow.total||0),totalPages=Math.max(1,Math.ceil(total/limit))
 res.json({items,pagination:{page,limit,total,totalPages,hasPrev:page>1,hasNext:page<totalPages},filters:{start_date:from||'',end_date:to||'',batch_id:req.query.batch_id||'',inventory_id:req.query.inventory_id||''}})
}
async function readBatchHistory(req,res){
 const id=Number(req.params.batchId)
 if(!Number.isSafeInteger(id)||id<1)return res.status(400).json({message:'Invalid batch number.'})
 const [[b]]=await db.query(`SELECT ib.id,ib.inventory_id,i.name item_name,i.barcode item_barcode,ib.batch_code,ib.quantity,ib.expiration_date,ib.unit_cost,ib.note,ib.archived_at,ib.archive_reason FROM inventory_batches ib JOIN inventory i ON i.id=ib.inventory_id AND i.branch_id=ib.branch_id WHERE ib.id=? AND ib.branch_id=?`,[id,req.branchId])
 if(!b)return res.status(404).json({message:'Batch not found in this branch.'})
 const [movements]=await db.query(`SELECT il.*,i.name item_name,batch.batch_code,batch.supplier_lot_number,COALESCE(st.full_name,ad.full_name,'System') performed_by,CASE WHEN il.admin_id IS NOT NULL THEN 'Admin' WHEN il.staff_id IS NOT NULL THEN 'Staff' ELSE 'System' END performed_by_role FROM inventory_logs il JOIN inventory i ON i.id=il.inventory_id AND i.branch_id=il.branch_id JOIN inventory_batches batch ON batch.id=il.batch_id AND batch.branch_id=il.branch_id LEFT JOIN staff st ON st.id=il.staff_id LEFT JOIN admins ad ON ad.id=il.admin_id WHERE il.branch_id=? AND il.batch_id=? ORDER BY il.logged_at DESC,il.id DESC LIMIT 200`,[req.branchId,id])
 const [audit]=await db.query(`SELECT al.id,al.action,al.old_values,al.new_values,al.created_at,al.user_role,COALESCE(ad.full_name,'System') performed_by FROM audit_logs al LEFT JOIN admins ad ON al.user_role IN ('admin','superadmin') AND ad.id=al.user_id WHERE al.branch_id=? AND al.entity_type='inventory_batch' AND al.entity_id=? ORDER BY al.created_at DESC LIMIT 200`,[req.branchId,String(id)])
 const {sanitizeAuditValue}=require('../utils/audit')
 const parse=v=>{try{return sanitizeAuditValue(typeof v==='string'?JSON.parse(v):v)}catch{return '[REDACTED]'}}
 res.json({batch:{...b,quantity:Number(b.quantity||0),unit_cost:Number(b.unit_cost||0)},movements,audit:audit.map(row=>({...row,old_values:parse(row.old_values),new_values:parse(row.new_values)}))})
}

const registerBranchOperationalReads = (router, { requireSuper, branchContext, requirePermission, allowAnyPermission }) => {
  for (const [prefix,middle] of [['/my/legacy',[branchContext]],['/workspace/:branchId/legacy',[requireSuper,branchContext]]]) {
    const reg=(path,permission,handler)=>router.get(`${prefix}${path}`,...middle,requirePermission(permission),handler)
    reg('/billing','billing',readBills)
    reg('/billing/cashier-closing','billing',readCashDrawer)
    reg('/billing/reconciliation','billing',readReconciliation)
    reg('/billing/adjustment-requests','billing',readAdjustments)
    reg('/supply-requests','stock_transfers',readTransferGroups)
    reg('/system-setup','system_setup',readSystemSetup)
    router.get(`${prefix}/billing/payment-settings`,...middle,allowAnyPermission('billing','system_setup'),async(req,res)=>{const [[settings]]=await db.query('SELECT * FROM clinic_payment_settings WHERE id=1');res.json(settings||{})})
    router.get(`${prefix}/clinic-settings`,...middle,allowAnyPermission('billing','system_setup'),async(req,res)=>{const [[settings]]=await db.query('SELECT * FROM clinic_settings WHERE id=1');res.json({...settings,clinic_name:req.branch.name,address:req.branch.address,phone:req.branch.phone,email:req.branch.email})})
    reg('/inventory/locations','inventory',async(req,res)=>{const [rows]=await db.query('SELECT * FROM inventory_locations WHERE branch_id=? ORDER BY name',[req.branchId]);res.json(rows)})
    reg('/inventory/master-data','inventory',readInventoryMasterData)
    reg('/inventory/logs','inventory',readInventoryLogs)
    reg('/inventory/batches/:batchId/history','inventory',readBatchHistory)
    reg('/billing/:id/stock-usage','billing',readBillStockUsage)
    // Explicit routes must precede the parameterized bill detail path.
    reg('/billing/:id','billing',readBill)
  }
}
module.exports={registerBranchOperationalReads,readBills,readCashDrawer,readTransferGroups,readSystemSetup}
