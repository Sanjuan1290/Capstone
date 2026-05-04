const ALLOWED_GENDERS = new Set(['Male', 'Female', 'Other'])
const ALLOWED_CIVIL_STATUSES = new Set(['Single', 'Married', 'Widowed', 'Divorced'])

const toDateOnly = (value) => String(value || '').trim().slice(0, 10)
const isValidDateOnly = (value) => /^\d{4}-\d{2}-\d{2}$/.test(value)

const normalizePatientProfileInput = (payload = {}) => {
  const gender = String(payload.gender || payload.sex || '').trim()
  const civilStatus = String(payload.civil_status || '').trim()
  const birthdate = toDateOnly(payload.birthdate)
  const address = String(payload.address || '').trim()
  const email = String(payload.email || '').trim()

  return {
    birthdate: isValidDateOnly(birthdate) ? birthdate : null,
    gender: ALLOWED_GENDERS.has(gender) ? gender : null,
    sex: ALLOWED_GENDERS.has(gender) ? gender : null,
    civil_status: ALLOWED_CIVIL_STATUSES.has(civilStatus) ? civilStatus : null,
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

  if (!isValidDateOnly(birthdate)) missingFields.push('birthdate')
  if (!ALLOWED_GENDERS.has(gender)) missingFields.push('gender')
  if (!address) missingFields.push('address')

  return {
    is_profile_complete: missingFields.length === 0,
    missing_fields: missingFields,
  }
}

module.exports = {
  ALLOWED_GENDERS,
  ALLOWED_CIVIL_STATUSES,
  toDateOnly,
  isValidDateOnly,
  normalizePatientProfileInput,
  getPatientProfileStatus,
}
