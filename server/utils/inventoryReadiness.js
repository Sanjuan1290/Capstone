const db = require('../db/connect')
const { getBillingCatalogServiceById, collectInventoryUsageFromBillingItems } = require('./billing')

const MAIN_STOCKROOM = 'Main Stockroom'

const treatmentRoomForClinic = (clinicType) => (
  String(clinicType || '').toLowerCase() === 'derma' ? 'Dermatology Room' : 'General Medicine Room'
)

const mergeRequirements = (requirements = []) => {
  const byInventory = new Map()
  for (const entry of Array.isArray(requirements) ? requirements : []) {
    const inventoryId = Number(entry?.inventory_id || 0)
    const quantity = Math.max(0, Number(entry?.quantity || 0))
    if (!inventoryId || quantity <= 0) continue
    const existing = byInventory.get(inventoryId) || {
      inventory_id: inventoryId,
      quantity: 0,
      unit_label: entry?.unit_label || null,
      labels: [],
    }
    existing.quantity = Math.round((existing.quantity + quantity) * 10000) / 10000
    if (!existing.unit_label && entry?.unit_label) existing.unit_label = entry.unit_label
    for (const label of Array.isArray(entry?.labels) ? entry.labels : [entry?.label]) {
      if (label && !existing.labels.includes(label)) existing.labels.push(label)
    }
    byInventory.set(inventoryId, existing)
  }
  return Array.from(byInventory.values())
}

const assessInventoryRequirements = async (requirements = [], { clinicType, executor = db } = {}) => {
  const normalized = mergeRequirements(requirements)
  const treatmentRoom = treatmentRoomForClinic(clinicType)
  if (!normalized.length) {
    return {
      status: 'no_consumables',
      treatment_room: treatmentRoom,
      has_requirements: false,
      ready: true,
      lines: [],
      summary: { ready: 0, transfer_needed: 0, shortage: 0 },
    }
  }

  const ids = normalized.map((entry) => entry.inventory_id)
  const placeholders = ids.map(() => '?').join(',')
  const [stockRows] = await executor.query(
    `SELECT i.id, i.name, COALESCE(i.uom,i.base_unit,i.unit,'unit') AS unit,
            COALESCE(SUM(CASE WHEN ib.id IS NOT NULL AND il.name=? THEN ilb.quantity ELSE 0 END),0) AS treatment_room_stock,
            COALESCE(SUM(CASE WHEN ib.id IS NOT NULL AND il.name=? THEN ilb.quantity ELSE 0 END),0) AS main_stockroom_stock
     FROM inventory i
     LEFT JOIN inventory_location_batches ilb ON ilb.inventory_id=i.id AND ilb.quantity>0
     LEFT JOIN inventory_locations il ON il.id=ilb.location_id
     LEFT JOIN inventory_batches ib ON ib.id=ilb.batch_id
       AND ib.inventory_id=i.id
       AND ib.quantity>0
       AND ib.archived_at IS NULL
       AND (ib.expiration_date IS NULL OR ib.expiration_date>=CURDATE())
     WHERE i.id IN (${placeholders}) AND i.archived_at IS NULL
     GROUP BY i.id, i.name, i.uom, i.base_unit, i.unit`,
    [treatmentRoom, MAIN_STOCKROOM, ...ids]
  )
  const stockMap = new Map(stockRows.map((row) => [Number(row.id), row]))

  const lines = normalized.map((entry) => {
    const row = stockMap.get(entry.inventory_id)
    const required = Number(entry.quantity || 0)
    const roomStock = Number(row?.treatment_room_stock || 0)
    const mainStock = Number(row?.main_stockroom_stock || 0)
    const clinicStock = roomStock + mainStock
    const roomShortage = Math.max(0, required - roomStock)
    const suggestedTransfer = Math.min(roomShortage, mainStock)
    const clinicShortage = Math.max(0, required - clinicStock)
    const status = roomShortage <= 0.0001 ? 'ready' : clinicShortage <= 0.0001 ? 'transfer_needed' : 'shortage'
    return {
      inventory_id: entry.inventory_id,
      name: row?.name || `Inventory #${entry.inventory_id}`,
      unit: entry.unit_label || row?.unit || 'unit',
      required,
      treatment_room_stock: roomStock,
      main_stockroom_stock: mainStock,
      clinic_usable_stock: clinicStock,
      room_shortage: roomShortage,
      suggested_transfer: suggestedTransfer,
      clinic_shortage: clinicShortage,
      status,
      labels: entry.labels || [],
    }
  })

  const summary = {
    ready: lines.filter((line) => line.status === 'ready').length,
    transfer_needed: lines.filter((line) => line.status === 'transfer_needed').length,
    shortage: lines.filter((line) => line.status === 'shortage').length,
  }
  const status = summary.shortage > 0 ? 'shortage' : summary.transfer_needed > 0 ? 'transfer_needed' : 'ready'
  return {
    status,
    treatment_room: treatmentRoom,
    has_requirements: true,
    ready: status === 'ready',
    lines,
    summary,
  }
}

const getAppointmentInventoryReadiness = async (appointmentId, { doctorId = null, executor = db } = {}) => {
  const conditions = ['a.id=?']
  const params = [Number(appointmentId)]
  if (Number(doctorId)) {
    conditions.push('a.doctor_id=?')
    params.push(Number(doctorId))
  }
  const [rows] = await executor.query(
    `SELECT a.id, a.patient_id, a.doctor_id, a.clinic_type, a.status,
            DATE_FORMAT(a.appointment_date,'%Y-%m-%d') AS appointment_date,
            a.appointment_time, a.requested_service_id, a.requested_service_name_snapshot,
            p.full_name AS patient_name, d.full_name AS doctor_name
     FROM appointments a
     JOIN patients p ON p.id=a.patient_id
     JOIN doctors d ON d.id=a.doctor_id
     WHERE ${conditions.join(' AND ')} LIMIT 1`,
    params
  )
  if (!rows.length) return null
  const appointment = rows[0]
  const service = appointment.requested_service_id
    ? await getBillingCatalogServiceById(appointment.requested_service_id, executor)
    : null
  const requirements = Array.isArray(service?.materials)
    ? service.materials.map((material) => ({
        inventory_id: material.inventory_id,
        quantity: Number(material.quantity || 0),
        unit_label: material.unit_label || material.inventory_base_unit || material.inventory_unit || null,
        label: `${service.service_name}: ${material.material_name || material.inventory_name || 'Consumable'}`,
      }))
    : []
  const readiness = await assessInventoryRequirements(requirements, { clinicType: appointment.clinic_type, executor })
  return {
    ...readiness,
    appointment: {
      id: Number(appointment.id),
      patient_id: Number(appointment.patient_id),
      patient_name: appointment.patient_name,
      doctor_id: Number(appointment.doctor_id),
      doctor_name: appointment.doctor_name,
      clinic_type: appointment.clinic_type,
      status: appointment.status,
      appointment_date: appointment.appointment_date,
      appointment_time: appointment.appointment_time,
      requested_service_id: Number(appointment.requested_service_id || 0) || null,
      requested_service_name: service?.service_name || appointment.requested_service_name_snapshot || null,
    },
  }
}

const getBillingInventoryReadiness = async ({ billing, appointment, executor = db }) => {
  const usage = billing?.id && Array.isArray(billing.items)
    ? collectInventoryUsageFromBillingItems(billing.items)
    : []
  return assessInventoryRequirements(usage, { clinicType: appointment?.clinic_type, executor })
}

module.exports = {
  MAIN_STOCKROOM,
  treatmentRoomForClinic,
  mergeRequirements,
  assessInventoryRequirements,
  getAppointmentInventoryReadiness,
  getBillingInventoryReadiness,
}

