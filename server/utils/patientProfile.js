const ALLOWED_GENDERS = new Set(['Male', 'Female', 'Other'])

const { getTodayDateOnly } = require('./date')

// Keep this display/SQL-date normalizer compatible with existing callers. Validation
// below deliberately checks the complete submitted value, not its first 10 chars.
const toDateOnly = (value) => String(value || '').trim().slice(0, 10)

const isValidDateOnly = (value) => {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false
  const [year, month, day] = value.split('-').map(Number)
  if (year < 1 || month < 1 || month > 12 || day < 1) return false
  const leapYear = year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0)
  const daysInMonth = [31, leapYear ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31]
  return day <= daysInMonth[month - 1]
}

const getAgeOnDate = (birthdate, now = new Date()) => {
  if (!isValidDateOnly(birthdate)) return null
  const [year, month, day] = birthdate.split('-').map(Number)
  const [todayYear, todayMonth, todayDay] = getTodayDateOnly(now).split('-').map(Number)
  let age = todayYear - year
  if (todayMonth < month || (todayMonth === month && todayDay < day)) age -= 1
  return age
}

const validateBirthdate = (birthdate, now = new Date()) => {
  if (!isValidDateOnly(birthdate)) return 'Enter a valid birthdate.'
  const age = getAgeOnDate(birthdate, now)
  if (age === null) return 'Enter a valid birthdate.'
  if (age < 0) return 'Birthdate cannot be in the future.'
  if (age > 100) return 'Patient age cannot exceed 100 years.'
  return null
}

const normalizePatientProfileInput = (payload = {}) => {
  const gender = String(payload.gender || payload.sex || '').trim()
  const birthdate = toDateOnly(payload.birthdate)
  const address = String(payload.address || '').trim()
  const email = String(payload.email || '').trim().toLowerCase()

  return {
    birthdate: !validateBirthdate(payload.birthdate) ? birthdate : null,
    gender: ALLOWED_GENDERS.has(gender) ? gender : null,
    sex: ALLOWED_GENDERS.has(gender) ? gender : null,
    address: address || null,
    email: email || null,
    receive_promotions: payload.receive_promotions === undefined
      ? undefined
      : Boolean(payload.receive_promotions),
  }
}

const getPatientProfileStatus = (patient = {}) => {
  const missingFields = []
  const birthdate = toDateOnly(patient.birthdate)
  const gender = String(patient.gender || patient.sex || '').trim()
  const address = String(patient.address || '').trim()
  const email = String(patient.email || '').trim()

  if (validateBirthdate(birthdate)) missingFields.push('birthdate')
  if (!ALLOWED_GENDERS.has(gender)) missingFields.push('gender')
  if (!address) missingFields.push('address')
  if (!email) missingFields.push('email')

  return {
    is_profile_complete: missingFields.length === 0,
    missing_fields: missingFields,
  }
}

module.exports = {
  ALLOWED_GENDERS,
  toDateOnly,
  isValidDateOnly,
  getAgeOnDate,
  validateBirthdate,
  normalizePatientProfileInput,
  getPatientProfileStatus,
}

