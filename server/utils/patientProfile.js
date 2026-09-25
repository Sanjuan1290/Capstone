const ALLOWED_GENDERS = new Set(['Male', 'Female', 'Other'])

const toDateOnly = (value) => String(value || '').trim().slice(0, 10)
const isValidDateOnly = (value) => /^\d{4}-\d{2}-\d{2}$/.test(value)

const getAgeOnDate = (birthdate, now = new Date()) => {
  const value = toDateOnly(birthdate)
  if (!isValidDateOnly(value)) return null
  const [year, month, day] = value.split('-').map(Number)
  const birth = new Date(year, month - 1, day)
  if (Number.isNaN(birth.getTime())) return null
  let age = now.getFullYear() - birth.getFullYear()
  const beforeBirthday = now.getMonth() < birth.getMonth()
    || (now.getMonth() === birth.getMonth() && now.getDate() < birth.getDate())
  if (beforeBirthday) age -= 1
  return age
}

const validateBirthdate = (birthdate, now = new Date()) => {
  const value = toDateOnly(birthdate)
  if (!isValidDateOnly(value)) return 'Enter a valid birthdate.'
  const age = getAgeOnDate(value, now)
  if (age === null || age < 0) return 'Birthdate cannot be in the future.'
  if (age > 100) return 'Patient age cannot exceed 100 years.'
  return null
}

const normalizePatientProfileInput = (payload = {}) => {
  const gender = String(payload.gender || payload.sex || '').trim()
  const birthdate = toDateOnly(payload.birthdate)
  const address = String(payload.address || '').trim()
  const email = String(payload.email || '').trim().toLowerCase()

  return {
    birthdate: !validateBirthdate(birthdate) ? birthdate : null,
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

