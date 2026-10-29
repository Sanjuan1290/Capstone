const db = require('../db/connect')
const {
  CLINIC_TIMEZONE,
  getClinicDateTimeSql,
  zonedDateTimeToUtc,
} = require('./date')
const { parseTimeToMinutes } = require('./scheduleWindows')

const DEFAULT_ONLINE_MIN_LEAD_MINUTES = 720
const DEFAULT_PENDING_CONFIRMATION_CUTOFF_MINUTES = 60
const DEFAULT_BOOKING_START_INTERVAL_MINUTES = 30
const MIN_SERVICE_DURATION_MINUTES = 30
const MAX_SERVICE_DURATION_MINUTES = 8 * 60
const SERVICE_DURATION_STEP_MINUTES = 30
// Explicit branch-scoped QA override, including on the production runtime.
// BOTH the flag and an exact branch ID in the allowlist are mandatory.
// Never enable zero notice for the global booking policy or for other branches.
const isZeroNoticeTestingEnabled = (branchId = null) => {
  const id = Number(branchId)
  if (process.env.CARAIT_ALLOW_ZERO_BOOKING_NOTICE_FOR_TESTS !== 'true'
      || !Number.isSafeInteger(id) || id <= 0) return false
  const configured = String(process.env.CARAIT_ZERO_BOOKING_NOTICE_TEST_BRANCH_IDS || '')
  return configured.split(',').some((candidate) => {
    const value = candidate.trim()
    return /^\d+$/.test(value) && Number(value) === id
  })
}

const withBookingTestingCapability = (settings, branchId = null) => ({
  ...settings,
  zero_notice_testing_enabled: isZeroNoticeTestingEnabled(branchId),
})

const normalizePositiveInt = (value, fallback, min, max) => {
  const parsed = Number(value)
  if (!Number.isInteger(parsed)) return fallback
  return Math.min(max, Math.max(min, parsed))
}

const normalizeBookingSettings = (row = {}, branchId = null) => {
  const existingZero = Number(row.online_min_lead_minutes) === 0
  const testingZero = isZeroNoticeTestingEnabled(branchId) && existingZero
  return {
    online_min_lead_minutes: testingZero ? 0 : normalizePositiveInt(
      row.online_min_lead_minutes,
      DEFAULT_ONLINE_MIN_LEAD_MINUTES,
      12 * 60,
      24 * 60
    ),
    pending_confirmation_cutoff_minutes: testingZero ? 0 : normalizePositiveInt(
      existingZero ? DEFAULT_PENDING_CONFIRMATION_CUTOFF_MINUTES : row.pending_confirmation_cutoff_minutes,
      DEFAULT_PENDING_CONFIRMATION_CUTOFF_MINUTES,
      30,
      24 * 60
    ),
    booking_start_interval_minutes: DEFAULT_BOOKING_START_INTERVAL_MINUTES,
  }
}

const policyError = (message, statusCode = 400) => {
  const error = new Error(message)
  error.statusCode = statusCode
  error.code = 'BOOKING_POLICY_INVALID'
  return error
}

const validateBookingSettings = (input = {}, branchId = null) => {
  // Do not silently coerce a requested zero to 720: return an actionable error.
  if (Number(input.online_min_lead_minutes) === 0) {
    if (!isZeroNoticeTestingEnabled(branchId)) {
      throw policyError('No minimum booking notice requires the QA flag and an explicitly allowlisted clinic branch.', 403)
    }
    if (Number(input.pending_confirmation_cutoff_minutes) !== 0) {
      throw policyError('For no-minimum testing, confirmation cutoff must be 0 minutes (at the appointment start).')
    }
    return normalizeBookingSettings(input, branchId)
  }
  const notice = Number(input.online_min_lead_minutes)
  const cutoff = Number(input.pending_confirmation_cutoff_minutes)
  if (!Number.isInteger(notice) || notice < 720 || notice > 1440 || notice % 30 !== 0) {
    throw policyError('Minimum online booking notice must be 12 to 24 hours in 30-minute increments.')
  }
  if (!Number.isInteger(cutoff) || cutoff < 30 || cutoff > 1440 || cutoff % 30 !== 0) {
    throw policyError('Pending confirmation cutoff must be 30 minutes to 24 hours in 30-minute increments.')
  }
  if (cutoff >= notice) {
    throw policyError('Pending confirmation cutoff must be earlier than the minimum online booking notice so Staff has time to review the request.')
  }
  return normalizeBookingSettings(input, branchId)
}

const loadBookingSettings = async (executor = db, branchId = null) => {
  if (Number.isSafeInteger(Number(branchId)) && Number(branchId) > 0) {
    const [branchRows] = await executor.query(
      `SELECT online_min_lead_minutes, pending_confirmation_cutoff_minutes, booking_start_interval_minutes FROM branch_booking_settings WHERE branch_id=?`, [Number(branchId)])
    return normalizeBookingSettings(branchRows?.[0] || {}, Number(branchId))
  }
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
  // Global policy is never eligible for the branch-specific QA override.
  const settings = validateBookingSettings(input, null)
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

const validateAverageDurationMinutes = (value, { fallback = null, unchangedLegacyMinutes = null } = {}) => {
  const parsed = Number(value)
  if ((!Number.isInteger(parsed) || parsed <= 0) && fallback !== null) return Number(fallback)
  if (Number(unchangedLegacyMinutes) === parsed && parsed >= 15 && parsed <= MAX_SERVICE_DURATION_MINUTES && parsed % 15 === 0) return parsed
  if (!Number.isInteger(parsed)
      || parsed < MIN_SERVICE_DURATION_MINUTES
      || parsed > MAX_SERVICE_DURATION_MINUTES
      || parsed % SERVICE_DURATION_STEP_MINUTES !== 0) {
    const error = new Error('Appointment length must be 30 minutes to 8 hours, in 30-minute steps.')
    error.statusCode = 400
    error.code = 'SERVICE_DURATION_INVALID'
    throw error
  }
  return parsed
}

const roundReservedDurationMinutes = (averageMinutes, intervalMinutes = DEFAULT_BOOKING_START_INTERVAL_MINUTES) => {
  const average = validateAverageDurationMinutes(averageMinutes, { fallback: 60, unchangedLegacyMinutes: averageMinutes })
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
  isZeroNoticeTestingEnabled,
  withBookingTestingCapability,
  validateBookingSettings,
  loadBookingSettings,
  saveBookingSettings,
  validateAverageDurationMinutes,
  roundReservedDurationMinutes,
  appointmentStartUtc,
  isOnlineAppointmentStartAllowed,
  buildConfirmationDeadlineSql,
}

