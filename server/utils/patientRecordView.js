// Branch-scoped, read-only patient history for the Admin and Staff Patient Records pages.
// Uses existing appointment, consultation and billing tables. No schema changes.
const db = require('../db/connect')
const PHONE_SQL = "REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(p.phone, '+', ''), '-', ''), ' ', ''), '(', ''), ')', '')"
const validId = value => Number.isSafeInteger(Number(value)) && Number(value) > 0
const money = value => Math.round((Number(value) || 0) * 100) / 100

async function listBranchPatients({ branchId, search = '', page = 1, limit = 10, executor = db }) {
  const term = String(search || '').trim().slice(0, 100)
  const currentPage = Math.max(1, Math.min(100000, parseInt(page, 10) || 1))
  const pageSize = Math.max(5, Math.min(50, parseInt(limit, 10) || 10))
  const like = `%${term.replace(/[\\%_]/g, '\\$&')}%`
  const digits = term.replace(/\D/g, '')
  const phone = digits ? `%${digits}%` : '__NO_PHONE_MATCH__'
  const alternateDigits = digits.startsWith('0') ? `63${digits.slice(1)}` : digits.startsWith('63') ? `0${digits.slice(2)}` : digits
  const alternatePhone = digits ? `%${alternateDigits}%` : '__NO_PHONE_MATCH__'
  const searchSql = term ? ` AND (p.full_name LIKE ? OR p.email LIKE ? OR ${PHONE_SQL} LIKE ? OR ${PHONE_SQL} LIKE ?)` : ''
  const args = term ? [branchId, like, like, phone, alternatePhone] : [branchId]
  const base = `FROM patients p WHERE EXISTS (SELECT 1 FROM appointments a WHERE a.patient_id=p.id AND a.branch_id=?)${searchSql}`
  const [[count]] = await executor.query(`SELECT COUNT(*) AS total ${base}`, args)
  const total = Number(count?.total || 0)
  const [patients] = await executor.query(
    `SELECT p.id,p.full_name AS name,p.full_name,p.phone,p.email,DATE_FORMAT(p.birthdate,'%Y-%m-%d') AS birthdate,p.sex
     ${base} ORDER BY p.full_name,p.id LIMIT ? OFFSET ?`,
    [...args, pageSize, (currentPage - 1) * pageSize]
  )
  return { patients, page: currentPage, limit: pageSize, total, totalPages: Math.max(1, Math.ceil(total / pageSize)) }
}

async function getBranchPatientRecord({ branchId, patientId, canViewBilling = true, executor = db }) {
  if (!validId(branchId) || !validId(patientId)) return null
  const [[patient]] = await executor.query(
    `SELECT p.id,p.full_name,p.email,p.phone,p.sex,p.address,
            DATE_FORMAT(p.birthdate,'%Y-%m-%d') AS birthdate
     FROM patients p WHERE p.id=? AND EXISTS
       (SELECT 1 FROM appointments a WHERE a.patient_id=p.id AND a.branch_id=?)`,
    [patientId, branchId]
  )
  if (!patient) return null

  const [appointments] = await executor.query(
    `SELECT a.id,a.patient_id,a.doctor_id,a.branch_id,a.status,a.reason,a.clinic_type AS type,
            DATE_FORMAT(a.appointment_date,'%Y-%m-%d') AS date,a.appointment_time AS time,
            a.requested_service_name_snapshot,a.requested_service_price_snapshot,
            d.full_name AS doctor_name,d.specialty,
            c.id AS consultation_id,c.status AS consultation_status,
            c.diagnosis,c.prescription,c.prescription_status,c.notes AS consultation_notes
     FROM appointments a
     JOIN doctors d ON d.id=a.doctor_id
     LEFT JOIN consultations c ON c.appointment_id=a.id AND c.branch_id=a.branch_id
     WHERE a.patient_id=? AND a.branch_id=?
     ORDER BY a.appointment_date DESC,a.appointment_time DESC,a.id DESC LIMIT 501`,
    [patientId, branchId]
  )
  const historyHasMore = appointments.length > 500
  const history = appointments.slice(0, 500)
  // Recorded service names remain visible to clinical-record viewers, without
  // granting access to charges, refunds, or individual payment receipts.
  const [serviceRows] = await executor.query(
    `SELECT b.appointment_id,i.id,i.service_name,i.quantity
     FROM billing_items i JOIN billing_records b ON b.id=i.billing_id
     WHERE b.patient_id=? AND b.branch_id=? AND i.item_type='service'
     ORDER BY b.appointment_id,i.sort_order,i.id`,
    [patientId, branchId]
  )
  const servicesByVisit = new Map()
  for (const row of serviceRows) {
    if (!servicesByVisit.has(Number(row.appointment_id))) servicesByVisit.set(Number(row.appointment_id), [])
    servicesByVisit.get(Number(row.appointment_id)).push({id:row.id,service_name:row.service_name,quantity:row.quantity})
  }
  const historyWithServices = history.map(visit => ({...visit, recorded_services:servicesByVisit.get(Number(visit.id)) || []}))
  if (!canViewBilling) return { patient, history: historyWithServices, history_has_more: historyHasMore, billing: [], can_view_billing: false }

  const [bills] = await executor.query(
    `SELECT b.id,b.appointment_id,b.consultation_id,b.branch_id,b.status,b.subtotal,b.discount_label,
            b.discount_amount,b.total_amount,b.paid_at,b.created_at,
            a.reason AS appointment_reason,DATE_FORMAT(a.appointment_date,'%Y-%m-%d') AS appointment_date,
            d.full_name AS doctor_name
     FROM billing_records b
     JOIN appointments a ON a.id=b.appointment_id AND a.branch_id=b.branch_id
     JOIN doctors d ON d.id=b.doctor_id
     WHERE b.patient_id=? AND b.branch_id=?
     ORDER BY a.appointment_date DESC,b.id DESC`,
    [patientId, branchId]
  )
  if (!bills.length) return { patient, history: historyWithServices, history_has_more: historyHasMore, billing: [], can_view_billing: true }

  // Fetch each financial child collection in one query; don't create an N+1 query per visit.
  const [items] = await executor.query(
    `SELECT i.id,i.billing_id,i.item_type,i.service_name,i.quantity,i.unit_price,i.line_total
     FROM billing_items i JOIN billing_records b ON b.id=i.billing_id
     WHERE b.patient_id=? AND b.branch_id=? ORDER BY i.billing_id,i.sort_order,i.id`,
    [patientId, branchId]
  )
  const [payments] = await executor.query(
    `SELECT pay.id,pay.billing_id,pay.amount,pay.payment_method,pay.reference_number,
            pay.receipt_number,pay.status,pay.paid_at,pay.voided_at,pay.void_reason,
            pay.refunded_at,pay.refund_amount,pay.refund_reason
     FROM billing_payments pay JOIN billing_records b ON b.id=pay.billing_id
     WHERE b.patient_id=? AND b.branch_id=? ORDER BY pay.paid_at DESC,pay.id DESC`,
    [patientId, branchId]
  )
  const itemsByBill = new Map(), paymentsByBill = new Map()
  for (const item of items) {
    if (!itemsByBill.has(Number(item.billing_id))) itemsByBill.set(Number(item.billing_id), [])
    itemsByBill.get(Number(item.billing_id)).push(item)
  }
  for (const payment of payments) {
    if (!paymentsByBill.has(Number(payment.billing_id))) paymentsByBill.set(Number(payment.billing_id), [])
    paymentsByBill.get(Number(payment.billing_id)).push(payment)
  }
  const billing = bills.map(bill => {
    const billPayments = paymentsByBill.get(Number(bill.id)) || []
    const paid = money(billPayments.filter(payment => payment.status === 'completed')
      .reduce((sum, payment) => sum + money(payment.amount) - money(payment.refund_amount), 0))
    return {
      ...bill, patient_name: patient.full_name,
      paid_amount: paid,
      balance_amount: ['voided', 'refunded'].includes(bill.status) ? 0 : Math.max(0, money(money(bill.total_amount) - paid)),
      items: itemsByBill.get(Number(bill.id)) || [],
      payments: billPayments,
    }
  })
  const [[receiptClinic]] = await executor.query(
    `SELECT cb.name AS clinic_name,cb.address,cb.phone,cs.receipt_title,cs.receipt_footer
     FROM clinic_branches cb LEFT JOIN clinic_settings cs ON cs.id=1 WHERE cb.id=?`, [branchId]
  )
  return { patient, history: historyWithServices, history_has_more: historyHasMore,
    billing, can_view_billing: true, receipt_clinic: receiptClinic || {} }
}

module.exports = { listBranchPatients, getBranchPatientRecord }
