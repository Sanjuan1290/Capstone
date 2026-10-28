const db = require('../db/connect')
const { getTodayDateOnly } = require('./date')

const ACTIVE_APPOINTMENT_STATUSES = ['pending', 'confirmed', 'rescheduled', 'in-progress']

const activeStatusPlaceholders = ACTIVE_APPOINTMENT_STATUSES.map(() => '?').join(', ')

const formatPolicyAppointment = (row = {}) => ({
  id: row.id,
  status: row.status,
  clinic_type: row.clinic_type,
  reason: row.reason,
  appointment_date: row.appointment_date,
  appointment_time: row.appointment_time,
  doctor_id: row.doctor_id,
  doctor_name: row.doctor_name,
})

const getActiveAppointmentConflict = async (patientId, options = {}, executor = db) => {
  if (!patientId) return null

  const fromDate = options.fromDate || getTodayDateOnly()
  const params = [patientId, ...ACTIVE_APPOINTMENT_STATUSES, fromDate]
  let excludeClause = ''

  if (options.excludeAppointmentId) {
    excludeClause = 'AND a.id <> ?'
    params.push(options.excludeAppointmentId)
  }

  const [rows] = await executor.query(
    `SELECT
       a.id,
       a.status,
       a.clinic_type,
       a.reason,
       DATE_FORMAT(a.appointment_date, '%Y-%m-%d') AS appointment_date,
       a.appointment_time,
       d.id AS doctor_id,
       d.full_name AS doctor_name
     FROM appointments a
     JOIN doctors d ON d.id = a.doctor_id
     WHERE a.patient_id = ?
       AND a.status IN (${activeStatusPlaceholders})
       AND a.appointment_date >= ?
       ${excludeClause}
     ORDER BY a.appointment_date ASC, a.appointment_time ASC, a.id ASC
     LIMIT 1`,
    params
  )

  return rows[0] ? formatPolicyAppointment(rows[0]) : null
}

const getLastNoShowAppointment = async (patientId, executor = db) => {
  if (!patientId) return null

  const [rows] = await executor.query(
    `SELECT
       a.id,
       a.status,
       a.clinic_type,
       a.reason,
       DATE_FORMAT(a.appointment_date, '%Y-%m-%d') AS appointment_date,
       a.appointment_time,
       d.id AS doctor_id,
       d.full_name AS doctor_name
     FROM appointments a
     JOIN doctors d ON d.id = a.doctor_id
     WHERE a.patient_id = ?
       AND a.status = 'no_show'
     ORDER BY a.appointment_date DESC, a.appointment_time DESC, a.id DESC
     LIMIT 1`,
    [patientId]
  )

  return rows[0] ? formatPolicyAppointment(rows[0]) : null
}

const makeNoShowWarningResponse = (appointment) => ({
  code: 'NO_SHOW_WARNING',
  message: 'This patient did not show up in their last online appointment. Review the booking policy before confirming.',
  last_no_show: appointment,
  policy: 'Patients who miss an online booking should contact the clinic before booking again. Repeated no-shows or fake bookings may be cancelled by staff.',
})

module.exports = {
  ACTIVE_APPOINTMENT_STATUSES,
  getActiveAppointmentConflict,
  getLastNoShowAppointment,
  makeNoShowWarningResponse,
}
