const db = require('../db/connect')
const { syncInventorySnapshot } = require('./inventoryBatches')
const { getClinicDateTimeSql } = require('./date')
const { appointmentStartUtc } = require('./bookingPolicy')

const syncInventoryBaseStock = async (inventoryId) => syncInventorySnapshot(inventoryId, db)

const getNoShowGraceMinutes = () => {
  const configured = Number(process.env.APPOINTMENT_NO_SHOW_GRACE_MINUTES)
  return Number.isFinite(configured) && configured >= 0 ? Math.min(configured, 240) : 15
}

// Manual no-show must follow the same 15-minute grace rule as the scheduler.
const canMarkNoShow = ({ appointment_date, appointment_time, checked_in_at }, now = new Date()) => {
  const start = appointmentStartUtc(appointment_date, appointment_time)
  return Boolean(start && !checked_in_at && now.getTime() >= start.getTime() + getNoShowGraceMinutes() * 60000)
}

// This function is intentionally called by the reminder/scheduler path, not by
// read-only list/dashboard endpoints. A GET request must never silently mutate
// clinic workflow state merely because somebody opened a page.
const markOverdueAppointments = async () => {
  const clinicNow = getClinicDateTimeSql()
  const graceMinutes = getNoShowGraceMinutes()
  const [result] = await db.query(
    `UPDATE appointments
     SET status = 'no_show'
     WHERE status IN ('confirmed', 'rescheduled')
       AND checked_in_at IS NULL
       AND COALESCE(appointment_source, 'online') <> 'walk_in'
       AND TIMESTAMP(
         appointment_date,
         DATE_FORMAT(STR_TO_DATE(appointment_time, '%h:%i %p'), '%H:%i:%s')
       ) <= DATE_SUB(?, INTERVAL ? MINUTE)`,
    [clinicNow, graceMinutes]
  )
  return Number(result?.affectedRows || 0)
}

module.exports = {
  syncInventoryBaseStock,
  markOverdueAppointments,
  getNoShowGraceMinutes,
  canMarkNoShow,
}

