const db = require('../db/connect')

const toDateOnly = (value) => String(value || '').trim().slice(0, 10)
const isValidDateOnly = (value) => /^\d{4}-\d{2}-\d{2}$/.test(value)

const getDoctorUnavailableDates = async (doctorId, options = {}, executor = db) => {
  const filters = ['doctor_id = ?']
  const params = [doctorId]

  if (options.startDate && isValidDateOnly(options.startDate)) {
    filters.push('unavailable_date >= ?')
    params.push(options.startDate)
  }

  if (options.endDate && isValidDateOnly(options.endDate)) {
    filters.push('unavailable_date <= ?')
    params.push(options.endDate)
  }

  const [rows] = await executor.query(
    `SELECT id, doctor_id, unavailable_date, reason, created_by_role, created_by_user_id, created_at
     FROM doctor_unavailable_dates
     WHERE ${filters.join(' AND ')}
     ORDER BY unavailable_date ASC`,
    params
  )

  return rows
}

const getDoctorUnavailableDate = async (doctorId, date, executor = db) => {
  const normalizedDate = toDateOnly(date)
  if (!isValidDateOnly(normalizedDate)) return null

  const [rows] = await executor.query(
    `SELECT id, doctor_id, unavailable_date, reason, created_by_role, created_by_user_id, created_at
     FROM doctor_unavailable_dates
     WHERE doctor_id = ? AND unavailable_date = ?
     LIMIT 1`,
    [doctorId, normalizedDate]
  )

  return rows[0] || null
}

const assertDoctorIsAvailableOnDate = async (doctorId, date, executor = db) => {
  const blocked = await getDoctorUnavailableDate(doctorId, date, executor)
  if (!blocked) return null

  const err = new Error(blocked.reason || 'The doctor is unavailable on the selected date.')
  err.statusCode = 409
  err.code = 'DOCTOR_UNAVAILABLE_DATE'
  err.blockedDate = blocked
  throw err
}

const countActiveAppointmentsOnDate = async (doctorId, date, executor = db) => {
  const normalizedDate = toDateOnly(date)
  if (!isValidDateOnly(normalizedDate)) return 0

  const [[row]] = await executor.query(
    `SELECT COUNT(*) AS count
     FROM appointments
     WHERE doctor_id = ?
       AND appointment_date = ?
       AND status IN ('pending', 'confirmed', 'rescheduled', 'in-progress')`,
    [doctorId, normalizedDate]
  )

  return Number(row?.count || 0)
}

module.exports = {
  toDateOnly,
  isValidDateOnly,
  getDoctorUnavailableDates,
  getDoctorUnavailableDate,
  assertDoctorIsAvailableOnDate,
  countActiveAppointmentsOnDate,
}
