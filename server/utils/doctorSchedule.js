const db = require('../db/connect')
const { getTodayDateOnly } = require('./date')
const { writeAuditLog } = require('./audit')
const { validateSchedulePayload, isTimeCoveredByWeeklySchedule } = require('./scheduleWindows')

const ACTIVE_APPOINTMENT_STATUSES = ['pending', 'confirmed', 'rescheduled', 'in-progress']

const findScheduleConflicts = async ({ doctorId, proposedSchedule, executor = db }) => {
  const [scheduleRows] = await executor.query(
    `SELECT day_of_week, start_time, end_time, slot_duration_mins, is_active,
            COALESCE(spans_next_day,0) AS spans_next_day,
            COALESCE(is_24_hours,0) AS is_24_hours
     FROM doctor_schedules
     WHERE doctor_id = ?`,
    [doctorId]
  )
  const currentWeekly = scheduleRows.map((row) => ({ ...row }))
  const proposedWeekly = scheduleRows.filter((row) => row.day_of_week !== proposedSchedule.day_of_week)
  proposedWeekly.push(proposedSchedule)

  const [appointments] = await executor.query(
    `SELECT a.id, DATE_FORMAT(a.appointment_date,'%Y-%m-%d') AS appointment_date,
            a.appointment_time, a.status, a.clinic_type,
            p.full_name AS patient_name
     FROM appointments a
     JOIN patients p ON p.id = a.patient_id
     WHERE a.doctor_id = ?
       AND a.appointment_date >= ?
       AND a.status IN (${ACTIVE_APPOINTMENT_STATUSES.map(() => '?').join(',')})
     ORDER BY a.appointment_date ASC, a.appointment_time ASC, a.id ASC`,
    [doctorId, getTodayDateOnly(), ...ACTIVE_APPOINTMENT_STATUSES]
  )

  // Only warn about appointments that the schedule change itself would invalidate.
  // Pre-existing exceptions (appointments already outside the weekly template) must not
  // block an unrelated weekday edit. Overnight schedules can affect the following day,
  // so comparing current coverage with proposed coverage is safer than filtering by day.
  return appointments.filter((appointment) => {
    const wasCovered = isTimeCoveredByWeeklySchedule({
      date: appointment.appointment_date,
      time: appointment.appointment_time,
      schedules: currentWeekly,
    })
    if (!wasCovered) return false
    return !isTimeCoveredByWeeklySchedule({
      date: appointment.appointment_date,
      time: appointment.appointment_time,
      schedules: proposedWeekly,
    })
  })
}

const saveDoctorScheduleDay = async ({ doctorId, body = {}, actorRole, actorId, ipAddress, executor = db }) => {
  const payload = validateSchedulePayload(body)
  const allowConflicts = body.allow_conflicts === true || Number(body.allow_conflicts) === 1
  const [doctorRows] = await executor.query('SELECT id, full_name FROM doctors WHERE id = ? LIMIT 1', [doctorId])
  if (!doctorRows[0]) {
    const error = new Error('Doctor not found.')
    error.statusCode = 404
    throw error
  }

  const conflicts = await findScheduleConflicts({ doctorId, proposedSchedule: payload, executor })
  if (conflicts.length && !allowConflicts) {
    const error = new Error(`${conflicts.length} active appointment${conflicts.length === 1 ? '' : 's'} fall outside this schedule.`)
    error.statusCode = 409
    error.code = 'SCHEDULE_CONFLICTS'
    error.conflicts = conflicts.slice(0, 20)
    error.conflict_count = conflicts.length
    error.doctor_name = doctorRows[0].full_name
    throw error
  }

  const [existingRows] = await executor.query(
    `SELECT id, start_time, end_time, slot_duration_mins, is_active,
            COALESCE(spans_next_day,0) AS spans_next_day,
            COALESCE(is_24_hours,0) AS is_24_hours
     FROM doctor_schedules
     WHERE doctor_id = ? AND day_of_week = ?`,
    [doctorId, payload.day_of_week]
  )

  if (existingRows.length) {
    await executor.query(
      `UPDATE doctor_schedules
       SET start_time=?, end_time=?, slot_duration_mins=?, is_active=?, spans_next_day=?, is_24_hours=?
       WHERE doctor_id=? AND day_of_week=?`,
      [payload.start_time, payload.end_time, payload.slot_duration_mins, payload.is_active, payload.spans_next_day, payload.is_24_hours, doctorId, payload.day_of_week]
    )
  } else {
    await executor.query(
      `INSERT INTO doctor_schedules
       (doctor_id, day_of_week, start_time, end_time, slot_duration_mins, is_active, spans_next_day, is_24_hours)
       VALUES (?,?,?,?,?,?,?,?)`,
      [doctorId, payload.day_of_week, payload.start_time, payload.end_time, payload.slot_duration_mins, payload.is_active, payload.spans_next_day, payload.is_24_hours]
    )
  }

  await writeAuditLog({
    userId: actorId,
    userRole: actorRole,
    action: 'schedule.updated',
    entityType: 'doctor_schedule',
    entityId: `${doctorId}:${payload.day_of_week}`,
    oldValues: existingRows[0] || null,
    newValues: { doctor_id: Number(doctorId), doctor_name: doctorRows[0].full_name, ...payload, conflicts_preserved: conflicts.length },
    ipAddress: ipAddress || null,
  }, executor).catch(() => {})

  return { message: 'Schedule saved.', schedule: payload, conflicts_preserved: conflicts.length }
}

module.exports = { ACTIVE_APPOINTMENT_STATUSES, findScheduleConflicts, saveDoctorScheduleDay }

