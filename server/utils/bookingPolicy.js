const db = require('../db/connect')
const {
  CLINIC_TIMEZONE,
  getClinicDateTimeSql,
  zonedDateTimeToUtc,
} = require('./date')
const { parseTimeToMinutes } = require('./scheduleWindows')

const DEFAULT_ONLINE_MIN_LEAD_MINUTES = 120
const DEFAULT_PENDING_CONFIRMATION_CUTOFF_MINUTES = 60
const DEFAULT_BOOKING_START_INTERVAL_MINUTES = 30
const MIN_SERVICE_DURATION_MINUTES = 15
const MAX_SERVICE_DURATION_MINUTES = 8 * 60
const SERVICE_DURATION_STEP_MINUTES = 15

const normalizePositiveInt = (value, fallback, min, max) => {
  const parsed = Number(value)
  if (!Number.isInteger(parsed)) return fallback
  return Math.min(max, Math.max(min, parsed))
}

const normalizeBookingSettings = (row = {}) => ({
  online_min_lead_minutes: normalizePositiveInt(
    row.online_min_lead_minutes,
    DEFAULT_ONLINE_MIN_LEAD_MINUTES,
    0,
    24 * 60
  ),
  pending_confirmation_cutoff_minutes: normalizePositiveInt(
    row.pending_confirmation_cutoff_minutes,
    DEFAULT_PENDING_CONFIRMATION_CUTOFF_MINUTES,
    0,
    24 * 60
  ),
  booking_start_interval_minutes: DEFAULT_BOOKING_START_INTERVAL_MINUTES,
})

const validateBookingSettings = (input = {}) => {
  const normalized = normalizeBookingSettings(input)
  const notice = Number(normalized.online_min_lead_minutes)
  const cutoff = Number(normalized.pending_confirmation_cutoff_minutes)

  if (!Number.isInteger(notice) || notice < 30 || notice > 24 * 60 || notice % 30 !== 0) {
    const error = new Error('Minimum online booking notice must be 30 minutes to 24 hours in 30-minute increments.')
    error.statusCode = 400
    error.code = 'BOOKING_POLICY_INVALID'
    throw error
  }
  if (!Number.isInteger(cutoff) || cutoff < 30 || cutoff > 24 * 60 || cutoff % 30 !== 0) {
    const error = new Error('Pending confirmation cutoff must be 30 minutes to 24 hours in 30-minute increments.')
    error.statusCode = 400
    error.code = 'BOOKING_POLICY_INVALID'
    throw error
  }
  if (cutoff >= notice) {
    const error = new Error('Pending confirmation cutoff must be earlier than the minimum online booking notice so Staff has time to review the request.')
    error.statusCode = 400
    error.code = 'BOOKING_POLICY_INVALID'
    throw error
  }
  return normalized
}

const loadBookingSettings = async (executor = db) => {
  const [rows] = await executor.query(
    `SELECT online_min_lead_minutes, pending_confirmation_cutoff_minutes, booking_start_interval_minutes
     FROM booking_settings WHERE id = 1 LIMIT 1`
  ).catch((error) => {
    if (['ER_NO_SUCH_TABLE', 'ER_BAD_FIELD_ERROR'].includes(error.code)) return [[]]
    throw error
  })
  return normalizeBookingSettings(rows?.[0] || {})
}

const saveBookingSettings = async (input = {}, { role = null, userId = null, executor = db } = {}) => {
  const settings = validateBookingSettings(input)
  await executor.query(
    `INSERT INTO booking_settings
       (id, online_min_lead_minutes, pending_confirmation_cutoff_minutes, booking_start_interval_minutes, updated_by_role, updated_by_user_id)
     VALUES (1, ?, ?, ?, ?, ?)
     ON DUPLICATE KEY UPDATE
       online_min_lead_minutes = VALUES(online_min_lead_minutes),
       pending_confirmation_cutoff_minutes = VALUES(pending_confirmation_cutoff_minutes),
       booking_start_interval_minutes = VALUES(booking_start_interval_minutes),
       updated_by_role = VALUES(updated_by_role),
       updated_by_user_id = VALUES(updated_by_user_id)`,
    [
      settings.online_min_lead_minutes,
      settings.pending_confirmation_cutoff_minutes,
      settings.booking_start_interval_minutes,
      role,
      userId,
    ]
  )
  return settings
}

const validateAverageDurationMinutes = (value, { fallback = null } = {}) => {
  const parsed = Number(value)
  if ((!Number.isInteger(parsed) || parsed <= 0) && fallback !== null) return Number(fallback)
  if (!Number.isInteger(parsed)
      || parsed < MIN_SERVICE_DURATION_MINUTES
      || parsed > MAX_SERVICE_DURATION_MINUTES
      || parsed % SERVICE_DURATION_STEP_MINUTES !== 0) {
    const error = new Error('Average Duration must be between 15 minutes and 8 hours in 15-minute increments.')
    error.statusCode = 400
    error.code = 'SERVICE_DURATION_INVALID'
    throw error
  }
  return parsed
}

const roundReservedDurationMinutes = (averageMinutes, intervalMinutes = DEFAULT_BOOKING_START_INTERVAL_MINUTES) => {
  const average = validateAverageDurationMinutes(averageMinutes, { fallback: 60 })
  const interval = Math.max(1, Number(intervalMinutes) || DEFAULT_BOOKING_START_INTERVAL_MINUTES)
  return Math.ceil(average / interval) * interval
}

const appointmentStartUtc = (date, time, timeZone = CLINIC_TIMEZONE) => {
  const [year, month, day] = String(date || '').split('-').map(Number)
  const minutes = parseTimeToMinutes(time)
  if (!year || !month || !day || minutes === null) return null
  return zonedDateTimeToUtc({
    year,
    month,
    day,
    hour: Math.floor(minutes / 60),
    minute: minutes % 60,
    second: 0,
  }, timeZone)
}

const isOnlineAppointmentStartAllowed = ({ date, time, minLeadMinutes, now = new Date(), timeZone = CLINIC_TIMEZONE }) => {
  const start = appointmentStartUtc(date, time, timeZone)
  if (!start) return false
  return start.getTime() >= now.getTime() + (Math.max(0, Number(minLeadMinutes) || 0) * 60 * 1000)
}

const buildConfirmationDeadlineSql = ({ date, time, cutoffMinutes, timeZone = CLINIC_TIMEZONE }) => {
  const start = appointmentStartUtc(date, time, timeZone)
  if (!start) return null
  const deadline = new Date(start.getTime() - (Math.max(0, Number(cutoffMinutes) || 0) * 60 * 1000))
  return getClinicDateTimeSql(deadline, timeZone)
}

module.exports = {
  DEFAULT_ONLINE_MIN_LEAD_MINUTES,
  DEFAULT_PENDING_CONFIRMATION_CUTOFF_MINUTES,
  DEFAULT_BOOKING_START_INTERVAL_MINUTES,
  MIN_SERVICE_DURATION_MINUTES,
  MAX_SERVICE_DURATION_MINUTES,
  SERVICE_DURATION_STEP_MINUTES,
  normalizeBookingSettings,
  validateBookingSettings,
  loadBookingSettings,
  saveBookingSettings,
  validateAverageDurationMinutes,
  roundReservedDurationMinutes,
  appointmentStartUtc,
  isOnlineAppointmentStartAllowed,
  buildConfirmationDeadlineSql,
}
