const db = require('../db/connect')

const roundMoney = (value) => Math.round((Number(value) || 0) * 100) / 100
const roundQty = (value) => Math.round((Number(value) || 0) * 10000) / 10000

// Stock that physically left the clinic for a patient:
//   clinical_use  = used by the doctor during a consultation
//   dispensed     = handed to the patient at Checkout after full payment
// Returns of either kind are netted out so a correction does not inflate usage.
const USAGE_OUT_TYPES = ['clinical_use', 'dispensed']
const USAGE_RETURN_TYPES = ['clinical_return', 'dispense_return']

/**
 * Most used medicines (or supplies) for a date range, ranked by net quantity used.
 * itemType: 'medicine' (default), 'supplies', or 'all'.
 */
const loadMostUsedMedicines = async ({ startDate, endDate, itemType = 'medicine', limit = 10 } = {}, executor = db) => {
  const typeFilter = itemType === 'all'
    ? ''
    : itemType === 'supplies'
      ? "AND COALESCE(i.item_type,'medicine') <> 'medicine'"
      : "AND COALESCE(i.item_type,'medicine') = 'medicine'"
  const safeLimit = Math.min(50, Math.max(1, Number(limit) || 10))

  const [rows] = await executor.query(
    `SELECT
       i.id AS inventory_id,
       i.name,
       i.category,
       COALESCE(i.item_type,'medicine') AS item_type,
       COALESCE(i.uom, i.base_unit, i.unit, 'unit') AS unit,
       COALESCE(SUM(CASE WHEN il.movement_type = 'clinical_use' THEN il.qty ELSE 0 END),0) AS used_in_consultation,
       COALESCE(SUM(CASE WHEN il.movement_type = 'dispensed' THEN il.qty ELSE 0 END),0) AS dispensed_at_checkout,
       COALESCE(SUM(CASE WHEN il.movement_type IN (${USAGE_RETURN_TYPES.map(() => '?').join(',')}) THEN il.qty ELSE 0 END),0) AS returned,
       COUNT(DISTINCT CASE WHEN il.movement_type = 'clinical_use' THEN CONCAT('c', il.reference_id)
                           WHEN il.movement_type = 'dispensed' THEN CONCAT('b', il.reference_id) END) AS visits,
       MAX(il.logged_at) AS last_used_at
     FROM inventory_logs il
     JOIN inventory i ON i.id = il.inventory_id
     WHERE il.movement_type IN (${[...USAGE_OUT_TYPES, ...USAGE_RETURN_TYPES].map(() => '?').join(',')})
       AND DATE(il.logged_at) BETWEEN ? AND ?
       ${typeFilter}
     GROUP BY i.id, i.name, i.category, i.item_type, i.uom, i.base_unit, i.unit`,
    [...USAGE_RETURN_TYPES, ...USAGE_OUT_TYPES, ...USAGE_RETURN_TYPES, startDate, endDate]
  )

  // Revenue from medicines sold as Checkout lines (and billed consultation extras) in the same period.
  const ids = rows.map((row) => Number(row.inventory_id)).filter(Boolean)
  const revenueMap = new Map()
  if (ids.length) {
    const [revenueRows] = await executor.query(
      `SELECT bi.source_inventory_id AS inventory_id,
              COALESCE(SUM(bi.quantity),0) AS billed_quantity,
              COALESCE(SUM(bi.line_total),0) AS billed_amount
       FROM billing_items bi
       JOIN billing_records br ON br.id = bi.billing_id AND br.status NOT IN ('draft','voided')
       WHERE bi.item_type = 'supply' AND bi.source_inventory_id IN (${ids.map(() => '?').join(',')})
         AND DATE(COALESCE(br.finalized_at, br.created_at)) BETWEEN ? AND ?
       GROUP BY bi.source_inventory_id`,
      [...ids, startDate, endDate]
    )
    revenueRows.forEach((row) => revenueMap.set(Number(row.inventory_id), row))
  }

  return rows
    .map((row) => {
      const consultation = roundQty(row.used_in_consultation)
      const dispensed = roundQty(row.dispensed_at_checkout)
      const returned = roundQty(row.returned)
      const revenue = revenueMap.get(Number(row.inventory_id))
      return {
        inventory_id: Number(row.inventory_id),
        name: row.name,
        category: row.category,
        item_type: row.item_type,
        unit: row.unit,
        used_in_consultation: consultation,
        dispensed_at_checkout: dispensed,
        returned,
        total_used: Math.max(0, roundQty(consultation + dispensed - returned)),
        visits: Number(row.visits || 0),
        billed_quantity: roundQty(revenue?.billed_quantity || 0),
        billed_amount: roundMoney(revenue?.billed_amount || 0),
        last_used_at: row.last_used_at || null,
      }
    })
    .filter((row) => row.total_used > 0)
    .sort((a, b) => b.total_used - a.total_used || b.visits - a.visits || a.name.localeCompare(b.name))
    .slice(0, safeLimit)
}

/**
 * Current inventory value from batch unit costs (what the clinic paid) and from the
 * current selling price (what it would bill). Batches received without a unit cost are
 * counted so the report can say the cost value is incomplete.
 */
const loadInventoryValuation = async (executor = db) => {
  const [[totals]] = await executor.query(
    `SELECT
       COALESCE(SUM(b.quantity * COALESCE(b.unit_cost,0)),0) AS cost_value,
       COALESCE(SUM(b.quantity * COALESCE(i.selling_price,0)),0) AS retail_value,
       COALESCE(SUM(CASE WHEN COALESCE(b.unit_cost,0) <= 0 THEN 1 ELSE 0 END),0) AS batches_without_cost,
       COUNT(*) AS batches_on_hand
     FROM inventory_batches b
     JOIN inventory i ON i.id = b.inventory_id AND i.archived_at IS NULL
     WHERE b.archived_at IS NULL AND b.quantity > 0`
  )
  const [byCategory] = await executor.query(
    `SELECT i.category,
            COALESCE(SUM(b.quantity * COALESCE(b.unit_cost,0)),0) AS cost_value,
            COALESCE(SUM(b.quantity * COALESCE(i.selling_price,0)),0) AS retail_value
     FROM inventory_batches b
     JOIN inventory i ON i.id = b.inventory_id AND i.archived_at IS NULL
     WHERE b.archived_at IS NULL AND b.quantity > 0
     GROUP BY i.category`
  )
  return {
    cost_value: roundMoney(totals?.cost_value),
    retail_value: roundMoney(totals?.retail_value),
    batches_without_cost: Number(totals?.batches_without_cost || 0),
    batches_on_hand: Number(totals?.batches_on_hand || 0),
    by_category: new Map(byCategory.map((row) => [String(row.category), { cost_value: roundMoney(row.cost_value), retail_value: roundMoney(row.retail_value) }])),
  }
}

// Every money movement is reported on the day it happened:
//   payment  +amount on paid_at (including payments that were later voided)
//   void     -amount on voided_at
//   refund   -amount on refunded_at (one row per refund in billing_payment_refunds)
// Closed periods therefore never change when a later void or refund is recorded.
const LEDGER_SQL = `
  SELECT bp.payment_method, DATE(bp.paid_at) AS event_date, DATE_FORMAT(bp.paid_at, '%Y-%m') AS ym,
         bp.amount AS amount, 'payment' AS kind, bp.received_by_staff_id AS staff_id, bp.received_by_admin_id AS admin_id
  FROM billing_payments bp
  WHERE bp.status IN ('completed','voided')
  UNION ALL
  SELECT bp.payment_method, DATE(COALESCE(bp.voided_at, bp.paid_at)), DATE_FORMAT(COALESCE(bp.voided_at, bp.paid_at), '%Y-%m'),
         bp.amount, 'void', bp.received_by_staff_id, bp.received_by_admin_id
  FROM billing_payments bp
  WHERE bp.status = 'voided'
  UNION ALL
  SELECT COALESCE(r.payment_method, bp.payment_method), DATE(r.refunded_at), DATE_FORMAT(r.refunded_at, '%Y-%m'),
         r.amount, 'refund', bp.received_by_staff_id, bp.received_by_admin_id
  FROM billing_payment_refunds r
  JOIN billing_payments bp ON bp.id = r.payment_id
`

const summarizeLedgerRows = (rows) => {
  const received = rows.filter((row) => row.kind === 'payment').reduce((sum, row) => sum + Number(row.amount || 0), 0)
  const voided = rows.filter((row) => row.kind === 'void').reduce((sum, row) => sum + Number(row.amount || 0), 0)
  const refunded = rows.filter((row) => row.kind === 'refund').reduce((sum, row) => sum + Number(row.amount || 0), 0)
  return {
    gross_received: roundMoney(received),
    voided: roundMoney(voided),
    collected: roundMoney(received - voided),
    refunded: roundMoney(refunded),
    net_collected: roundMoney(received - voided - refunded),
  }
}

const loadCollectionLedger = async ({ startDate, endDate }, executor = db) => {
  const [rows] = await executor.query(
    `SELECT payment_method, event_date, ym, amount, kind, staff_id, admin_id
     FROM (${LEDGER_SQL}) ledger
     WHERE event_date BETWEEN ? AND ?`,
    [startDate, endDate]
  ).catch((error) => {
    if (error.code === 'ER_NO_SUCH_TABLE') return [[]]
    throw error
  })

  const byMethodMap = new Map()
  const byMonthMap = new Map()
  for (const row of rows) {
    const method = row.payment_method || 'unknown'
    if (!byMethodMap.has(method)) byMethodMap.set(method, [])
    byMethodMap.get(method).push(row)
    if (!byMonthMap.has(row.ym)) byMonthMap.set(row.ym, [])
    byMonthMap.get(row.ym).push(row)
  }

  const byMethod = Array.from(byMethodMap.entries()).map(([payment_method, list]) => {
    const summary = summarizeLedgerRows(list)
    return {
      payment_method,
      transactions: list.filter((row) => row.kind === 'payment').length,
      gross: summary.gross_received,
      voided: summary.voided,
      refunded: summary.refunded,
      net: summary.net_collected,
      amount: summary.net_collected,
    }
  }).sort((a, b) => b.net - a.net)

  const monthLabel = (ym) => {
    const [year, month] = String(ym).split('-').map(Number)
    if (!year || !month) return ym
    return new Date(Date.UTC(year, month - 1, 1)).toLocaleString('en-US', { month: 'short', year: 'numeric', timeZone: 'UTC' })
  }
  const trend = Array.from(byMonthMap.entries()).sort(([a], [b]) => String(a).localeCompare(String(b))).map(([ym, list]) => ({
    ym,
    month: monthLabel(ym),
    transactions: list.filter((row) => row.kind === 'payment').length,
    revenue: summarizeLedgerRows(list).net_collected,
  }))

  return { summary: summarizeLedgerRows(rows), byMethod, trend, rows }
}

module.exports = {
  USAGE_OUT_TYPES,
  USAGE_RETURN_TYPES,
  loadMostUsedMedicines,
  loadInventoryValuation,
  loadCollectionLedger,
  summarizeLedgerRows,
  LEDGER_SQL,
}

