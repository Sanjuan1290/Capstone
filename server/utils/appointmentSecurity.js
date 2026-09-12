const db = require('../db/connect')
const { getDoctorUnavailableDate } = require('./doctorAvailability')

const ACTIVE_SLOT_STATUSES = ['pending', 'confirmed', 'rescheduled', 'in-progress']
const DAY_NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']

const parseTimeToMinutes = (value) => {
  const raw = String(value || '').trim()
  let match = raw.match(/^(\d{1,2}):(\d{2})(?::\d{2})?$/)
  if (match) return Number(match[1]) * 60 + Number(match[2])
  match = raw.match(/^(\d{1,2}):(\d{2})\s*(AM|PM)$/i)
  if (!match) return null
  let hour = Number(match[1])
  const minute = Number(match[2])
  const period = match[3].toUpperCase()
  if (hour < 1 || hour > 12 || minute > 59) return null
  if (period === 'PM' && hour !== 12) hour += 12
  if (period === 'AM' && hour === 12) hour = 0
  return hour * 60 + minute
}

const clinicMatchesDoctor = (clinicType, specialty) => {
  const isDerma = String(specialty || '').toLowerCase().includes('derm')
  return clinicType === 'derma' ? isDerma : clinicType === 'medical' ? !isDerma : false
}

const validateAppointmentSlot = async ({ doctorId, clinicType, date, time, excludeAppointmentId = null, executor = db }) => {
  const id = Number(doctorId)
  if (!id) throw Object.assign(new Error('Select a valid doctor.'), { statusCode: 400 })
  if (!['medical', 'derma'].includes(clinicType)) throw Object.assign(new Error('Select a valid clinic type.'), { statusCode: 400 })
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(date || ''))) throw Object.assign(new Error('Select a valid appointment date.'), { statusCode: 400 })

  const [doctorRows] = await executor.query('SELECT id, full_name, specialty FROM doctors WHERE id = ? AND is_active = 1 LIMIT 1', [id])
  const doctor = doctorRows[0]
  if (!doctor) throw Object.assign(new Error('The selected doctor is unavailable.'), { statusCode: 409 })
  if (!clinicMatchesDoctor(clinicType, doctor.specialty)) throw Object.assign(new Error('The selected doctor does not accept this clinic type.'), { statusCode: 409 })

  const blocked = await getDoctorUnavailableDate(id, date, executor)
  if (blocked) throw Object.assign(new Error(blocked.reason || 'The doctor is unavailable on the selected date.'), { statusCode: 409 })

  const selectedDate = new Date(`${date}T00:00:00`)
  const day = DAY_NAMES[selectedDate.getDay()]
  const [scheduleRows] = await executor.query(
    `SELECT start_time, end_time, slot_duration_mins FROM doctor_schedules
     WHERE doctor_id = ? AND day_of_week = ? AND is_active = 1 LIMIT 1`,
    [id, day]
  )
  const schedule = scheduleRows[0]
  if (!schedule) throw Object.assign(new Error('The doctor does not have an active schedule on the selected date.'), { statusCode: 409 })

  const requested = parseTimeToMinutes(time)
  const start = parseTimeToMinutes(schedule.start_time)
  const end = parseTimeToMinutes(schedule.end_time)
  const duration = Math.max(1, Number(schedule.slot_duration_mins) || 60)
  if (requested === null || start === null || end === null || requested < start || requested + duration > end || (requested - start) % duration !== 0) {
    throw Object.assign(new Error('The selected time is outside the doctor’s available appointment slots.'), { statusCode: 409 })
  }

  const params = [id, date, time]
  let sql = `SELECT id FROM appointments WHERE doctor_id = ? AND appointment_date = ? AND appointment_time = ? AND status IN ('pending','confirmed','rescheduled','in-progress')`
  if (Number(excludeAppointmentId) > 0) { sql += ' AND id <> ?'; params.push(Number(excludeAppointmentId)) }
  sql += ' LIMIT 1'
  const [conflicts] = await executor.query(sql, params)
  if (conflicts.length) throw Object.assign(new Error('That time slot is already taken.'), { statusCode: 409 })
  return { doctor, schedule }
}

const withAppointmentSlotLock = async ({ doctorId, date, time }, fn, executor = db) => {
  const lockName = `carait:appt:${Number(doctorId)}:${String(date)}:${String(time)}`.slice(0, 64)
  const [[lockRow]] = await executor.query('SELECT GET_LOCK(?, 5) AS acquired', [lockName])
  if (Number(lockRow?.acquired) !== 1) throw Object.assign(new Error('This appointment slot is being booked. Please try again.'), { statusCode: 409 })
  try { return await fn() } finally { await executor.query('SELECT RELEASE_LOCK(?)', [lockName]).catch(() => {}) }
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



