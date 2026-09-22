const db = require('../db/connect')
const { getDoctorUnavailableDate } = require('./doctorAvailability')
const { parseTimeToMinutes, formatSlotLabel, isTimeCoveredByWeeklySchedule } = require('./scheduleWindows')

const ACTIVE_SLOT_STATUSES = ['pending', 'confirmed', 'rescheduled', 'in-progress']

const clinicMatchesDoctor = (clinicType, doctor) => {
  const explicit = String(doctor?.clinic_type || '').trim()
  if (['medical','derma'].includes(explicit)) return clinicType === explicit
  const isDerma = String(doctor?.specialty || '').toLowerCase().includes('derm')
  return clinicType === 'derma' ? isDerma : clinicType === 'medical' ? !isDerma : false
}

const validateAppointmentSlot = async ({ doctorId, clinicType, date, time, excludeAppointmentId = null, executor = db }) => {
  const id = Number(doctorId)
  if (!id) throw Object.assign(new Error('Select a valid doctor.'), { statusCode: 400 })
  if (!['medical', 'derma'].includes(clinicType)) throw Object.assign(new Error('Select a valid clinic type.'), { statusCode: 400 })
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(date || ''))) throw Object.assign(new Error('Select a valid appointment date.'), { statusCode: 400 })

  const [doctorRows] = await executor.query('SELECT id, full_name, specialty, clinic_type FROM doctors WHERE id = ? AND is_active = 1 LIMIT 1', [id])
  const doctor = doctorRows[0]
  if (!doctor) throw Object.assign(new Error('The selected doctor is unavailable.'), { statusCode: 409 })
  if (!clinicMatchesDoctor(clinicType, doctor)) throw Object.assign(new Error('The selected doctor does not accept this clinic type.'), { statusCode: 409 })

  const blocked = await getDoctorUnavailableDate(id, date, executor)
  if (blocked) throw Object.assign(new Error(blocked.reason || 'The doctor is unavailable on the selected date.'), { statusCode: 409 })

  const [scheduleRows] = await executor.query(
    `SELECT day_of_week, start_time, end_time, slot_duration_mins, is_active,
            COALESCE(spans_next_day,0) AS spans_next_day,
            COALESCE(is_24_hours,0) AS is_24_hours
     FROM doctor_schedules
     WHERE doctor_id = ? AND is_active = 1`,
    [id]
  )
  if (!scheduleRows.length || !isTimeCoveredByWeeklySchedule({ date, time, schedules: scheduleRows })) {
    throw Object.assign(new Error('The selected time is outside the doctor’s available appointment slots.'), { statusCode: 409 })
  }

  const requestedMinutes = parseTimeToMinutes(time)
  if (requestedMinutes === null) throw Object.assign(new Error('Select a valid appointment time.'), { statusCode: 400 })

  const params = [id, date]
  let sql = `SELECT id, appointment_time FROM appointments
             WHERE doctor_id = ? AND appointment_date = ?
               AND status IN ('pending','confirmed','rescheduled','in-progress')`
  if (Number(excludeAppointmentId) > 0) { sql += ' AND id <> ?'; params.push(Number(excludeAppointmentId)) }
  const [activeAppointments] = await executor.query(sql, params)
  const conflict = activeAppointments.find((row) => parseTimeToMinutes(row.appointment_time) === requestedMinutes)
  if (conflict) throw Object.assign(new Error('That time slot is already taken.'), { statusCode: 409 })
  return { doctor, schedules: scheduleRows, normalizedTime: formatSlotLabel(requestedMinutes) }
}

const withAppointmentSlotLock = async ({ doctorId, date, time }, fn, executor = db) => {
  const parsedTime = parseTimeToMinutes(time)
  const normalizedTime = parsedTime === null ? String(time) : formatSlotLabel(parsedTime)
  const lockName = `carait:appt:${Number(doctorId)}:${String(date)}:${normalizedTime}`.slice(0, 64)

  // MySQL named locks are connection-scoped. A pool-level GET_LOCK followed by
  // a pool-level RELEASE_LOCK can run on different connections, leaving the lock
  // held until that pooled connection is eventually closed. Pin the lock to one
  // dedicated connection whenever the shared pool is used.
  const ownsConnection = executor === db && typeof db.getConnection === 'function'
  const lockExecutor = ownsConnection ? await db.getConnection() : executor
  try {
    const [[lockRow]] = await lockExecutor.query('SELECT GET_LOCK(?, 5) AS acquired', [lockName])
    if (Number(lockRow?.acquired) !== 1) {
      throw Object.assign(new Error('This appointment slot is being booked. Please try again.'), { statusCode: 409 })
    }
    try {
      return await fn()
    } finally {
      await lockExecutor.query('SELECT RELEASE_LOCK(?)', [lockName]).catch(() => {})
    }
  } finally {
    if (ownsConnection) lockExecutor.release()
  }
}

const ALLOWED_TRANSITIONS = {
  pending: new Set(['confirmed', 'cancelled', 'rescheduled']),
  confirmed: new Set(['in-progress', 'rescheduled', 'cancelled', 'no_show']),
  rescheduled: new Set(['confirmed', 'cancelled', 'no_show', 'in-progress']),
  'in-progress': new Set(['completed']),
  completed: new Set(), cancelled: new Set(), no_show: new Set(),
}

const assertAppointmentTransition = (from, to) => {
  if (from === to) return
  if (!ALLOWED_TRANSITIONS[from]?.has(to)) {
    const err = new Error(`Appointment cannot move from ${from || 'unknown'} to ${to}.`)
    err.statusCode = 409
    throw err
  }
}

module.exports = { ACTIVE_SLOT_STATUSES, parseTimeToMinutes, validateAppointmentSlot, withAppointmentSlotLock, assertAppointmentTransition }

