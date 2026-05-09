const db = require('../db/connect')

const roundMoney = (value) => Math.round((Number(value) || 0) * 100) / 100

const normalizeBillingItems = (items = []) => (
  Array.isArray(items)
    ? items
      .map((item, index) => {
        const quantity = Math.max(0, Number(item?.quantity) || 0)
        const unitPrice = Math.max(0, Number(item?.unit_price ?? item?.default_price) || 0)
        const serviceName = String(item?.service_name || item?.name || '').trim()

        if (!serviceName || quantity <= 0) return null

        const lineTotal = roundMoney(quantity * unitPrice)

        return {
          catalog_service_id: item?.catalog_service_id ? Number(item.catalog_service_id) : item?.id ? Number(item.id) : null,
          category: String(item?.category || '').trim() || null,
          service_name: serviceName,
          quantity,
          unit_price: unitPrice,
          line_total: lineTotal,
          notes: String(item?.notes || '').trim() || null,
          sort_order: Number.isFinite(Number(item?.sort_order)) ? Number(item.sort_order) : index,
        }
      })
      .filter(Boolean)
    : []
)

const computeBillingTotals = ({ items = [], discount_amount = 0 }) => {
  const subtotal = roundMoney(items.reduce((sum, item) => sum + roundMoney(item.line_total), 0))
  const discountAmount = Math.max(0, roundMoney(discount_amount))
  const totalAmount = Math.max(0, roundMoney(subtotal - discountAmount))

  return {
    subtotal,
    discount_amount: discountAmount,
    total_amount: totalAmount,
  }
}

const listBillingCatalog = async (options = {}, executor = db) => {
  const filters = ['is_active = 1']
  const params = []

  if (options.clinicType) {
    filters.push('(clinic_type = ? OR clinic_type = "all")')
    params.push(options.clinicType)
  }

  const [rows] = await executor.query(
    `SELECT id, category, service_name, clinic_type, default_price, is_active, sort_order
     FROM billing_service_catalog
     WHERE ${filters.join(' AND ')}
     ORDER BY sort_order ASC, category ASC, service_name ASC`,
    params
  )

  return rows
}

const getBillingRecordWithItems = async (billingId, executor = db) => {
  const [records] = await executor.query(
    `SELECT
       b.*,
       DATE_FORMAT(a.appointment_date, '%Y-%m-%d') AS appointment_date,
       a.appointment_time,
       a.reason AS appointment_reason,
       a.clinic_type,
       p.full_name AS patient_name,
       p.phone AS patient_phone,
       d.full_name AS doctor_name,
       d.specialty AS doctor_specialty,
       s.full_name AS confirmed_by_staff_name
     FROM billing_records b
     JOIN appointments a ON a.id = b.appointment_id
     JOIN patients p ON p.id = b.patient_id
     JOIN doctors d ON d.id = b.doctor_id
     LEFT JOIN staff s ON s.id = b.confirmed_by_staff_id
     WHERE b.id = ?
     LIMIT 1`,
    [billingId]
  )

  if (records.length === 0) return null

  const [items] = await executor.query(
    `SELECT id, billing_id, catalog_service_id, category, service_name, quantity, unit_price, line_total, notes, sort_order
     FROM billing_items
     WHERE billing_id = ?
     ORDER BY sort_order ASC, id ASC`,
    [billingId]
  )

  return {
    ...records[0],
    items,
  }
}

const getBillingByAppointmentId = async (appointmentId, executor = db) => {
  const [rows] = await executor.query(
    'SELECT id FROM billing_records WHERE appointment_id = ? LIMIT 1',
    [appointmentId]
  )

  if (rows.length === 0) return null
  return getBillingRecordWithItems(rows[0].id, executor)
}

const saveBillingItems = async (billingId, items, executor = db) => {
  await executor.query('DELETE FROM billing_items WHERE billing_id = ?', [billingId])

  for (const item of items) {
    await executor.query(
      `INSERT INTO billing_items
       (billing_id, catalog_service_id, category, service_name, quantity, unit_price, line_total, notes, sort_order)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        billingId,
        item.catalog_service_id || null,
        item.category,
        item.service_name,
        item.quantity,
        item.unit_price,
        item.line_total,
        item.notes,
        item.sort_order,
      ]
    )
  }
}

const upsertDraftBillingForAppointment = async ({
  appointment,
  consultationId = null,
  items = [],
}, executor = db) => {
  const normalizedItems = normalizeBillingItems(items)
  const totals = computeBillingTotals({ items: normalizedItems, discount_amount: 0 })

  const [existingRows] = await executor.query(
    'SELECT id, status, discount_type, discount_label, discount_amount, payment_method, payment_notes, confirmed_by_staff_id, paid_at FROM billing_records WHERE appointment_id = ? LIMIT 1',
    [appointment.id]
  )

  if (existingRows.length > 0) {
    const existing = existingRows[0]
    if (existing.status === 'paid') {
      return getBillingRecordWithItems(existing.id, executor)
    }

    const computed = computeBillingTotals({
      items: normalizedItems,
      discount_amount: existing.discount_amount,
    })

    await executor.query(
      `UPDATE billing_records
       SET consultation_id = ?, subtotal = ?, total_amount = ?
       WHERE id = ?`,
      [consultationId, computed.subtotal, computed.total_amount, existing.id]
    )

    await saveBillingItems(existing.id, normalizedItems, executor)
    return getBillingRecordWithItems(existing.id, executor)
  }

  const [result] = await executor.query(
    `INSERT INTO billing_records
     (appointment_id, consultation_id, patient_id, doctor_id, status, subtotal, discount_type, discount_amount, total_amount)
     VALUES (?, ?, ?, ?, 'pending', ?, 'none', 0.00, ?)`,
    [
      appointment.id,
      consultationId,
      appointment.patient_id,
      appointment.doctor_id,
      totals.subtotal,
      totals.total_amount,
    ]
  )

  await saveBillingItems(result.insertId, normalizedItems, executor)
  return getBillingRecordWithItems(result.insertId, executor)
}

module.exports = {
  roundMoney,
  normalizeBillingItems,
  computeBillingTotals,
  listBillingCatalog,
  getBillingRecordWithItems,
  getBillingByAppointmentId,
  upsertDraftBillingForAppointment,
}
