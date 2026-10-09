const db = require('../db/connect')
const { getDoctorUnavailableDate } = require('./doctorAvailability')
const {
  parseTimeToMinutes,
  formatSlotLabel,
  getScheduleWindow,
  getDateDayName,
} = require('./scheduleWindows')
const { addDaysDateOnly } = require('./date')
const {
  DEFAULT_BOOKING_START_INTERVAL_MINUTES,
  roundReservedDurationMinutes,
  isOnlineAppointmentStartAllowed,
} = require('./bookingPolicy')

const ACTIVE_SLOT_STATUSES = ['pending', 'confirmed', 'rescheduled', 'in-progress']

const clinicMatchesDoctor = (clinicType, doctor) => {
  const assignedClinic = String(doctor?.clinic_type || '').trim()
  return ['medical', 'derma'].includes(assignedClinic) && clinicType === assignedClinic
}

const dateSerialDay = (date) => {
  const [year, month, day] = String(date || '').split('-').map(Number)
  if (!year || !month || !day) return null
  return Math.floor(Date.UTC(year, month - 1, day) / 86400000)
}

const dateOffsetDays = (fromDate, toDate) => {
  const from = dateSerialDay(fromDate)
  const to = dateSerialDay(toDate)
  return from === null || to === null ? null : to - from
}

const normalizeDuration = (value) => {
  const parsed = Number(value)
  if (Number.isFinite(parsed) && parsed > 0) return Math.max(1, Math.round(parsed))
  return 60
}

const getAppointmentReservedDuration = (row = {}) => {
  if (Number(row.reserved_duration_minutes_snapshot) > 0) return normalizeDuration(row.reserved_duration_minutes_snapshot)
  if (Number(row.requested_service_duration_minutes_snapshot) > 0) {
    return roundReservedDurationMinutes(row.requested_service_duration_minutes_snapshot)
  }
  return 60
}

const mergeIntervals = (intervals = []) => {
  const sorted = [...intervals]
    .filter((item) => Number.isFinite(item.start) && Number.isFinite(item.end) && item.end > item.start)
    .sort((a, b) => a.start - b.start)
  const merged = []
  for (const interval of sorted) {
    const last = merged[merged.length - 1]
    if (!last || interval.start > last.end) {
      merged.push({ ...interval })
    } else {
      last.end = Math.max(last.end, interval.end)
    }
  }
  return merged
}

const buildScheduleCoverageIntervals = (date, schedules = []) => {
  const rows = Array.isArray(schedules) ? schedules.filter((row) => Number(row?.is_active) !== 0) : []
  const intervals = []
  for (const offset of [-1, 0, 1]) {
    const anchorDate = addDaysDateOnly(date, offset)
    const dayName = getDateDayName(anchorDate)
    const schedule = rows.find((row) => row.day_of_week === dayName)
    const window = schedule ? getScheduleWindow(schedule) : null
    if (!window) continue
    intervals.push({
      start: (offset * 1440) + window.start,
      end: (offset * 1440) + window.end,
      schedule,
    })
  }
  return mergeIntervals(intervals)
}

const findCoverageForWindow = ({ startMinutes, durationMinutes, intervals }) => {
  const endMinutes = startMinutes + durationMinutes
  return (intervals || []).find((interval) => startMinutes >= interval.start && endMinutes <= interval.end) || null
}

const isStartAligned = ({ startMinutes, intervalMinutes, coverageStart }) => {
  const interval = Math.max(1, Number(intervalMinutes) || DEFAULT_BOOKING_START_INTERVAL_MINUTES)
  const diff = startMinutes - coverageStart
  return diff >= 0 && diff % interval === 0
}

const loadActiveAppointmentWindows = async ({ doctorId, date, excludeAppointmentId = null, executor = db }) => {
  const startDate = addDaysDateOnly(date, -1)
  const endDate = addDaysDateOnly(date, 1)
  const params = [Number(doctorId), startDate, endDate]
  let sql = `SELECT id, DATE_FORMAT(appointment_date, '%Y-%m-%d') AS appointment_date, appointment_time,
                    reserved_duration_minutes_snapshot, requested_service_duration_minutes_snapshot
             FROM appointments
             WHERE doctor_id = ?
               AND appointment_date BETWEEN ? AND ?
               AND status IN ('pending','confirmed','rescheduled','in-progress')`
  if (Number(excludeAppointmentId) > 0) {
    sql += ' AND id <> ?'
    params.push(Number(excludeAppointmentId))
  }
  const [rows] = await executor.query(sql, params)
  return rows.map((row) => {
    const offset = dateOffsetDays(date, row.appointment_date)
    const timeMinutes = parseTimeToMinutes(row.appointment_time)
    if (offset === null || timeMinutes === null) return null
    const start = (offset * 1440) + timeMinutes
    const duration = getAppointmentReservedDuration(row)
    return { id: row.id, start, end: start + duration, duration }
  }).filter(Boolean)
}

const overlapsAny = (start, end, windows = []) => windows.some((window) => start < window.end && end > window.start)

const loadDoctorAndSchedules = async ({ doctorId, clinicType, executor = db }) => {
  const id = Number(doctorId)
  if (!id) throw Object.assign(new Error('Select a valid doctor.'), { statusCode: 400 })
  if (!['medical', 'derma'].includes(clinicType)) throw Object.assign(new Error('Select a valid clinic type.'), { statusCode: 400 })

  const [doctorRows] = await executor.query('SELECT id, full_name, specialty, clinic_type FROM doctors WHERE id = ? AND is_active = 1 LIMIT 1', [id])
  const doctor = doctorRows[0]
  if (!doctor) throw Object.assign(new Error('The selected doctor is unavailable.'), { statusCode: 409 })
  if (!clinicMatchesDoctor(clinicType, doctor)) throw Object.assign(new Error('The selected doctor does not accept this clinic type.'), { statusCode: 409 })

  const [scheduleRows] = await executor.query(
    `SELECT day_of_week, start_time, end_time, slot_duration_mins, is_active,
            COALESCE(spans_next_day,0) AS spans_next_day,
            COALESCE(is_24_hours,0) AS is_24_hours
     FROM doctor_schedules
     WHERE doctor_id = ? AND is_active = 1`,
    [id]
  )
  return { doctor, schedules: scheduleRows }
}

const validateAppointmentSlot = async ({
  doctorId,
  clinicType,
  date,
  time,
  durationMinutes = 60,
  startIntervalMinutes = DEFAULT_BOOKING_START_INTERVAL_MINUTES,
  excludeAppointmentId = null,
  enforceLeadTime = false,
  minLeadMinutes = 0,
  now = new Date(),
  executor = db,
}) => {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(date || ''))) throw Object.assign(new Error('Select a valid appointment date.'), { statusCode: 400 })
  const requestedMinutes = parseTimeToMinutes(time)
  if (requestedMinutes === null) throw Object.assign(new Error('Select a valid appointment time.'), { statusCode: 400 })

  const { doctor, schedules } = await loadDoctorAndSchedules({ doctorId, clinicType, executor })
  const blocked = await getDoctorUnavailableDate(Number(doctorId), date, executor)
  if (blocked) throw Object.assign(new Error(blocked.reason || 'The doctor is unavailable on the selected date.'), { statusCode: 409 })

  const duration = normalizeDuration(durationMinutes)
  const coverageIntervals = buildScheduleCoverageIntervals(date, schedules)
  const coverage = findCoverageForWindow({ startMinutes: requestedMinutes, durationMinutes: duration, intervals: coverageIntervals })
  if (!coverage) {
    throw Object.assign(new Error('There is not enough doctor availability for the full service duration at that start time.'), { statusCode: 409, code: 'APPOINTMENT_DURATION_OUTSIDE_SCHEDULE' })
  }
  if (!isStartAligned({ startMinutes: requestedMinutes, intervalMinutes: startIntervalMinutes, coverageStart: coverage.start })) {
    throw Object.assign(new Error(`Appointments must start on a ${startIntervalMinutes}-minute booking interval.`), { statusCode: 409, code: 'APPOINTMENT_START_INTERVAL_INVALID' })
  }

  if (enforceLeadTime && !isOnlineAppointmentStartAllowed({ date, time, minLeadMinutes, now })) {
    throw Object.assign(new Error(`Online appointments must be booked at least ${Math.ceil(Number(minLeadMinutes || 0) / 60)} hours in advance.`), { statusCode: 409, code: 'ONLINE_BOOKING_NOTICE_REQUIRED' })
  }

  const activeWindows = await loadActiveAppointmentWindows({ doctorId, date, excludeAppointmentId, executor })
  if (overlapsAny(requestedMinutes, requestedMinutes + duration, activeWindows)) {
    throw Object.assign(new Error('That start time overlaps another active appointment.'), { statusCode: 409, code: 'APPOINTMENT_TIME_CONFLICT' })
  }

  return {
    doctor,
    schedules,
    normalizedTime: formatSlotLabel(requestedMinutes),
    reservedDurationMinutes: duration,
  }
}

const getAvailableAppointmentSlots = async ({
  doctorId,
  clinicType,
  date,
  durationMinutes = 60,
  startIntervalMinutes = DEFAULT_BOOKING_START_INTERVAL_MINUTES,
  excludeAppointmentId = null,
  enforceLeadTime = false,
  minLeadMinutes = 0,
  now = new Date(),
  executor = db,
}) => {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(date || ''))) return []
  const { schedules } = await loadDoctorAndSchedules({ doctorId, clinicType, executor })
  const blocked = await getDoctorUnavailableDate(Number(doctorId), date, executor)
  if (blocked) return []

  const duration = normalizeDuration(durationMinutes)
  const interval = Math.max(1, Number(startIntervalMinutes) || DEFAULT_BOOKING_START_INTERVAL_MINUTES)
  const coverageIntervals = buildScheduleCoverageIntervals(date, schedules)
  const activeWindows = await loadActiveAppointmentWindows({ doctorId, date, excludeAppointmentId, executor })
  const slots = []
  const seen = new Set()

  for (const coverage of coverageIntervals) {
    const visibleStart = Math.max(0, coverage.start)
    const visibleEnd = Math.min(1440, coverage.end)
    if (visibleEnd <= visibleStart) continue

    let cursor = coverage.start
    if (cursor < visibleStart) {
      cursor += Math.ceil((visibleStart - cursor) / interval) * interval
    }
    while (cursor < visibleEnd && cursor < 1440) {
      const end = cursor + duration
      if (end <= coverage.end) {
        const label = formatSlotLabel(cursor)
        const allowedByLead = !enforceLeadTime || isOnlineAppointmentStartAllowed({ date, time: label, minLeadMinutes, now })
        if (allowedByLead && !overlapsAny(cursor, end, activeWindows) && !seen.has(label)) {
          seen.add(label)
          slots.push({ label, minutes: cursor })
        }
      }
      cursor += interval
    }
  }

  return slots.sort((a, b) => a.minutes - b.minutes).map((slot) => slot.label)
}

const withAppointmentSlotLock = async ({ doctorId }, fn, executor = db) => {
  // Duration-aware appointments can conflict even when their start times differ.
  // Serialize booking changes per doctor so two overlapping requests cannot both
  // pass validation before either one is inserted.
  const lockName = `carait:appt:doctor:${Number(doctorId)}`.slice(0, 64)
  const ownsConnection = executor === db && typeof db.getConnection === 'function'
  const lockExecutor = ownsConnection ? await db.getConnection() : executor
  try {
    const [[lockRow]] = await lockExecutor.query('SELECT GET_LOCK(?, 5) AS acquired', [lockName])
    if (Number(lockRow?.acquired) !== 1) {
      throw Object.assign(new Error('This doctor’s schedule is being updated. Please try again.'), { statusCode: 409 })
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
  pending: new Set(['confirmed', 'cancelled', 'rescheduled', 'rejected']),
  confirmed: new Set(['in-progress', 'rescheduled', 'cancelled', 'no_show']),
  rescheduled: new Set(['confirmed', 'cancelled', 'no_show', 'in-progress']),
  'in-progress': new Set(['completed']),
  completed: new Set(), cancelled: new Set(), no_show: new Set(), rejected: new Set(),
}

const assertAppointmentMutationApplied = async (result, appointmentId, executor = db) => {
  if (Number(result?.affectedRows || 0) === 1) return
  const [[latest]] = await executor.query('SELECT status FROM appointments WHERE id = ? LIMIT 1', [appointmentId])
  const currentStatus = latest?.status || 'unavailable'
  const err = new Error(`This appointment changed while you were viewing it. Current status: ${currentStatus}. Refresh before taking another action.`)
  err.statusCode = 409
  err.code = 'APPOINTMENT_STATUS_CONFLICT'
  err.current_status = currentStatus
  throw err
}

const assertAppointmentTransition = (from, to) => {
  if (from === to) return
  if (!ALLOWED_TRANSITIONS[from]?.has(to)) {
    const err = new Error(`Appointment cannot move from ${from || 'unknown'} to ${to}.`)
    err.statusCode = 409
    throw err
  }
}

module.exports = {
  ACTIVE_SLOT_STATUSES,
  parseTimeToMinutes,
  getAppointmentReservedDuration,
  buildScheduleCoverageIntervals,
  validateAppointmentSlot,
  getAvailableAppointmentSlots,
  withAppointmentSlotLock,
  assertAppointmentTransition,
  assertAppointmentMutationApplied,
}

