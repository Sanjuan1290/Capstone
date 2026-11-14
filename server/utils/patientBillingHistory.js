const publicFinancialCalculation = raw => {
  if(!raw)return null
  const parsed=typeof raw==='string'?JSON.parse(raw):raw
  return {...parsed,doctor_fees:(parsed.doctor_fees||[]).map(({clinic_base_share,...fee})=>fee),discounts:(parsed.discounts||[]).map(({approval,verification,...discount})=>discount)}
}
// Patient-owned, read-only billing history. Never accepts a patient ID from the URL.
// All queries bind the authenticated patient ID and use the recorded bill/payment snapshots.
const MAX_PAGE_SIZE = 50
const CENT = value => Math.round((Number(value) || 0) * 100) / 100
const safeInt = (value, fallback, max) => {
  const parsed = Number(value)
  return Number.isSafeInteger(parsed) && parsed > 0 ? Math.min(parsed, max) : fallback
}

// A refunded or voided payment is not credited as money the clinic still holds.
// billing_payments.refund_amount is maintained by the existing refund workflow.
const PAYMENT_AGGREGATE = `(
  SELECT billing_id,
         SUM(CASE WHEN status <> 'voided' AND voided_at IS NULL
             THEN GREATEST(0, amount - COALESCE(refund_amount, 0)) ELSE 0 END) AS paid_amount
  FROM billing_payments GROUP BY billing_id
)`
const MONEY_PAID = 'COALESCE(pay.paid_amount, 0)'
const DISPLAY_STATUS = `CASE
  WHEN b.status = 'voided' OR b.voided_at IS NOT NULL THEN 'voided'
  WHEN b.status = 'refunded' THEN 'refunded'
  WHEN b.status = 'draft' THEN 'preparing'
  WHEN b.total_amount <= 0 THEN 'paid'
  WHEN ${MONEY_PAID} >= b.total_amount - 0.005 THEN 'paid'
  WHEN ${MONEY_PAID} > 0 THEN 'partially_paid'
  ELSE 'unpaid' END`
const BILL_FROM = `FROM billing_records b
  JOIN appointments a ON a.id = b.appointment_id AND a.patient_id = b.patient_id AND a.branch_id = b.branch_id
  JOIN doctors d ON d.id = b.doctor_id
  JOIN clinic_branches cb ON cb.id = b.branch_id
  LEFT JOIN ${PAYMENT_AGGREGATE} pay ON pay.billing_id = b.id`
const validDate = value => /^\d{4}-\d{2}-\d{2}$/.test(String(value || '')) &&
  !Number.isNaN(Date.parse(`${String(value)}T00:00:00Z`)) &&
  new Date(`${String(value)}T00:00:00Z`).toISOString().slice(0, 10) === String(value)

function normalizeFilter(input = {}) {
  const page = safeInt(input.page, 1, 1000000)
  const pageSize = safeInt(input.limit, 10, MAX_PAGE_SIZE)
  const branchId = input.branch_id === undefined || input.branch_id === '' ? null : Number(input.branch_id)
  if (branchId !== null && (!Number.isSafeInteger(branchId) || branchId <= 0)) {
    throw Object.assign(new Error('Invalid clinic branch filter.'), { statusCode: 400 })
  }
  const status = String(input.status || 'all')
  if (!['all', 'preparing', 'unpaid', 'partially_paid', 'paid', 'voided', 'refunded'].includes(status)) {
    throw Object.assign(new Error('Invalid payment status filter.'), { statusCode: 400 })
  }
  const dateFrom = String(input.date_from || '')
  const dateTo = String(input.date_to || '')
  if ((dateFrom && !validDate(dateFrom)) || (dateTo && !validDate(dateTo)) || (dateFrom && dateTo && dateFrom > dateTo)) {
    throw Object.assign(new Error('Choose a valid date range.'), { statusCode: 400 })
  }
  return { page, pageSize, branchId, status, dateFrom, dateTo, search: String(input.search || '').trim().slice(0, 100) }
}

const classifyBill = bill => {
  const paid = CENT(bill.paid_amount)
  const total = CENT(bill.total_amount)
  const originalStatus = String(bill.status || '')
  const paymentStatus = bill.payment_status ||
    (originalStatus === 'voided' || bill.voided_at ? 'voided' : originalStatus === 'refunded' ? 'refunded' : originalStatus === 'draft' ? 'preparing' : total <= 0 || paid >= total - 0.005 ? 'paid' : paid > 0 ? 'partially_paid' : 'unpaid')
  const balance = ['voided', 'refunded'].includes(paymentStatus) ? 0 : Math.max(0, CENT(total - paid))
  return { ...bill, payment_status: paymentStatus, paid_amount: paid, balance_amount: balance }
}

async function listMyBillingHistory({ patientId, query = {}, executor }) {
  if (!Number.isSafeInteger(Number(patientId)) || Number(patientId) <= 0) throw Object.assign(new Error('Sign in to see your bills.'), { statusCode: 401 })
  const filters = normalizeFilter(query)
  const terms = ['b.patient_id = ?']
  const params = [Number(patientId)]
  if (filters.branchId) { terms.push('b.branch_id = ?'); params.push(filters.branchId) }
  if (filters.dateFrom) { terms.push('a.appointment_date >= ?'); params.push(filters.dateFrom) }
  if (filters.dateTo) { terms.push('a.appointment_date <= ?'); params.push(filters.dateTo) }
  if (filters.status !== 'all') { terms.push(`${DISPLAY_STATUS} = ?`); params.push(filters.status) }
  if (filters.search) {
    const like = `%${filters.search.replace(/[\\%_]/g, '\\$&')}%`
    terms.push(`(d.full_name LIKE ? OR cb.name LIKE ? OR CAST(b.id AS CHAR) LIKE ?
      OR EXISTS (SELECT 1 FROM billing_items i WHERE i.billing_id = b.id AND i.service_name LIKE ?)
      OR EXISTS (SELECT 1 FROM billing_payments p WHERE p.billing_id = b.id AND p.receipt_number LIKE ?))`)
    params.push(like, like, like, like, like)
  }
  const where = `WHERE ${terms.join(' AND ')}`
  const [[count]] = await executor.query(`SELECT COUNT(*) AS total ${BILL_FROM} ${where}`, params)
  const total = Number(count?.total || 0)
  const offset = (filters.page - 1) * filters.pageSize
  const [rows] = await executor.query(`SELECT b.id, b.appointment_id, b.branch_id, b.status,
       b.subtotal, b.discount_amount, b.discount_label, b.total_amount, b.created_at,
       b.paid_at, b.voided_at, b.refunded_at,
       DATE_FORMAT(a.appointment_date,'%Y-%m-%d') AS appointment_date,
       d.full_name AS doctor_name, cb.name AS branch_name,
       ${MONEY_PAID} AS paid_amount, ${DISPLAY_STATUS} AS payment_status,
       (SELECT bi.service_name FROM billing_items bi WHERE bi.billing_id=b.id ORDER BY bi.sort_order, bi.id LIMIT 1) AS service_name
       ${BILL_FROM} ${where}
       ORDER BY a.appointment_date DESC, b.id DESC LIMIT ? OFFSET ?`, [...params, filters.pageSize, offset])
  // Summary is across ALL of this patient's bills, not just the current filtered page.
  const [[summary]] = await executor.query(`SELECT COUNT(*) AS total_bills,
      COALESCE(SUM(CASE WHEN ${DISPLAY_STATUS} = 'paid' THEN 1 ELSE 0 END),0) AS paid_bills,
      COALESCE(SUM(CASE WHEN ${DISPLAY_STATUS} NOT IN ('voided','refunded','preparing')
        THEN GREATEST(0, b.total_amount - ${MONEY_PAID}) ELSE 0 END),0) AS outstanding_balance
      ${BILL_FROM} WHERE b.patient_id = ?`, [Number(patientId)])
  return {
    bills: rows.map(classifyBill), total,
    page: filters.page, limit: filters.pageSize,
    totalPages: Math.max(1, Math.ceil(total / filters.pageSize)),
    summary: {
      total_bills: Number(summary?.total_bills || 0),
      paid_bills: Number(summary?.paid_bills || 0),
      outstanding_balance: CENT(summary?.outstanding_balance),
    },
  }
}

async function getMyBillDetails({ patientId, billingId, executor }) {
  if (!Number.isSafeInteger(Number(patientId)) || Number(patientId) <= 0) throw Object.assign(new Error('Sign in to see this bill.'), { statusCode: 401 })
  if (!Number.isSafeInteger(Number(billingId)) || Number(billingId) <= 0) throw Object.assign(new Error('Invalid bill ID.'), { statusCode: 400 })
  const [[bill]] = await executor.query(`SELECT b.id, b.appointment_id, b.branch_id, b.status, b.version,
       b.subtotal, b.discount_type, b.discount_label, b.discount_amount,
       b.total_amount, b.paid_at, b.created_at, b.voided_at, b.refunded_at,
       bfs.calculation_json AS financial_calculation_json,
       DATE_FORMAT(a.appointment_date,'%Y-%m-%d') AS appointment_date,
       d.full_name AS doctor_name, p.full_name AS patient_name,
       cb.name AS branch_name, cb.address AS branch_address, cb.phone AS branch_phone,
       cs.clinic_name AS company_name, cs.receipt_title, cs.receipt_footer
       FROM billing_records b
       LEFT JOIN billing_financial_snapshots bfs ON bfs.billing_id=b.id AND bfs.branch_id=b.branch_id
       JOIN appointments a ON a.id = b.appointment_id AND a.patient_id = b.patient_id AND a.branch_id = b.branch_id
       JOIN doctors d ON d.id = b.doctor_id JOIN patients p ON p.id = b.patient_id
       JOIN clinic_branches cb ON cb.id = b.branch_id
       LEFT JOIN clinic_settings cs ON cs.id = 1
       WHERE b.id = ? AND b.patient_id = ? LIMIT 1`, [Number(billingId), Number(patientId)])
  if (!bill) return null
  const [items] = await executor.query(`SELECT id, item_type, service_name, quantity, unit_price, line_total, details_json
       FROM billing_items WHERE billing_id = ? ORDER BY sort_order, id`, [Number(billingId)])
  const [payments] = await executor.query(`SELECT id, amount, payment_method, reference_number,
       receipt_number, status, paid_at, voided_at, refund_amount, refunded_at, amount_received, change_amount
       FROM billing_payments WHERE billing_id = ? ORDER BY paid_at DESC, id DESC`, [Number(billingId)])
  const financialCalculation=publicFinancialCalculation(bill.financial_calculation_json)
  delete bill.financial_calculation_json
  const paidAmount = payments.filter(row => row.status !== 'voided' && !row.voided_at)
    .reduce((sum, row) => sum + Math.max(0, CENT(row.amount) - CENT(row.refund_amount)), 0)
  return {
    ...classifyBill({ ...bill, paid_amount: CENT(paidAmount) }),
    financial_calculation: financialCalculation,
    items: items.map(row => {
      let included_supplies = []
      if (row.item_type === 'service' && row.details_json) {
        try {
          const details = typeof row.details_json === 'string' ? JSON.parse(row.details_json) : row.details_json
          if (Array.isArray(details?.materials)) included_supplies = details.materials
            .map(m => ({ name: String(m.material_name || ''), quantity: Number(m.quantity || 0), unit: String(m.unit_label || '') }))
            .filter(m => m.name && m.quantity > 0)
        } catch { /* Older bills may contain unparseable optional detail fields. */ }
      }
      return { id: row.id, item_type: row.item_type, service_name: row.service_name, quantity: row.quantity, unit_price: row.unit_price, line_total: row.line_total, included_supplies }
    }),
    payments,
    receipt_clinic: {
      clinic_name: bill.company_name || bill.branch_name,
      address: bill.branch_address,
      phone: bill.branch_phone,
      receipt_title: bill.receipt_title,
      receipt_footer: bill.receipt_footer,
    },
  }
}
module.exports = { listMyBillingHistory, getMyBillDetails, classifyBill, normalizeFilter }
