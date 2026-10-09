const db = require('../db/connect')
const { syncInventorySnapshot } = require('./inventoryBatches')
const { getClinicDateTimeSql } = require('./date')
const { appointmentStartUtc } = require('./bookingPolicy')

const syncInventoryBaseStock = async (inventoryId) => syncInventorySnapshot(inventoryId, db)

const getNoShowGraceMinutes = () => {
  const configured = Number(process.env.APPOINTMENT_NO_SHOW_GRACE_MINUTES)
  return Number.isFinite(configured) && configured >= 0 ? Math.min(configured, 240) : 15
}

const getBranchNoShowGraceMinutes = async (branchId, executor = db) => {
  if (!Number.isSafeInteger(Number(branchId)) || Number(branchId) <= 0) return getNoShowGraceMinutes()
  const [[row]] = await executor.query('SELECT no_show_grace_minutes FROM branch_booking_settings WHERE branch_id=?', [Number(branchId)])
  return row && Number.isInteger(Number(row.no_show_grace_minutes)) ? Number(row.no_show_grace_minutes) : getNoShowGraceMinutes()
}
// Manual no-show follows the same per-branch grace rule as the scheduler.
const canMarkNoShow = (appointment, now = new Date()) => {
  const { appointment_date, appointment_time, checked_in_at } = appointment
  const start = appointmentStartUtc(appointment_date, appointment_time)
  return Boolean(start && !checked_in_at && now.getTime() >= start.getTime() + (Number.isInteger(Number(appointment.no_show_grace_minutes)) ? Number(appointment.no_show_grace_minutes) : getNoShowGraceMinutes()) * 60000)
}

// This function is intentionally called by the reminder/scheduler path, not by
// read-only list/dashboard endpoints. A GET request must never silently mutate
// clinic workflow state merely because somebody opened a page.
const markOverdueAppointments = async () => {
  const clinicNow = getClinicDateTimeSql()
  const graceMinutes = getNoShowGraceMinutes()
  const [result] = await db.query(
    `UPDATE appointments a
     LEFT JOIN branch_booking_settings bbs ON bbs.branch_id = a.branch_id
     SET a.status = 'no_show'
     WHERE a.status IN ('confirmed', 'rescheduled')
       AND a.checked_in_at IS NULL
       AND COALESCE(a.appointment_source, 'online') <> 'walk_in'
       AND TIMESTAMP(
         a.appointment_date,
         DATE_FORMAT(STR_TO_DATE(a.appointment_time, '%h:%i %p'), '%H:%i:%s')
       ) <= DATE_SUB(?, INTERVAL COALESCE(bbs.no_show_grace_minutes, ?) MINUTE)`,
    [clinicNow, graceMinutes]
  )
  return Number(result?.affectedRows || 0)
}

module.exports = {
  syncInventoryBaseStock,
  markOverdueAppointments,
  getNoShowGraceMinutes,
  getBranchNoShowGraceMinutes,
  canMarkNoShow,
}


