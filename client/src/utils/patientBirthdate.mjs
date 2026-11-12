// Patient date-only fields use the clinic calendar, not UTC or the browser locale.
export const getClinicToday = (now = new Date()) => {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Manila', year: 'numeric', month: '2-digit', day: '2-digit',
  }).formatToParts(now)
  const values = Object.fromEntries(parts.map(({ type, value }) => [type, value]))
  return `${values.year}-${values.month}-${values.day}`
}

export const isValidPatientDate = (date) => {
  if (typeof date !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(date)) return false
  const [year, month, day] = date.split('-').map(Number)
  if (year < 1 || month < 1 || month > 12 || day < 1) return false
  const leap = year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0)
  return day <= [31, leap ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31][month - 1]
}

export const MIN_PATIENT_AGE = 18

// Latest acceptable date of birth for an adult patient in the clinic time zone.
export const getMaxPatientBirthdate = (now = new Date()) => {
  const today = getClinicToday(now)
  const [year, month, day] = today.split('-').map(Number)
  const birthYear = year - MIN_PATIENT_AGE
  // February 29 has no same-day anniversary in a non-leap year.
  const lastDay = new Date(Date.UTC(birthYear, month, 0)).getUTCDate()
  return `${birthYear}-${String(month).padStart(2, '0')}-${String(Math.min(day, lastDay)).padStart(2, '0')}`
}

export const getMinPatientBirthdate = (now = new Date()) => {
  const today = getClinicToday(now)
  return `${String(Number(today.slice(0, 4)) - 100).padStart(4, '0')}${today.slice(4)}`
}

export const getMaxWalkInBirthdate = (now = new Date()) =>
  new Date(Date.parse(`${getClinicToday(now)}T12:00:00Z`) - 86400000).toISOString().slice(0, 10)
export const getMinWalkInBirthdate = () => '1000-01-01'

export const validatePatientBirthdate = (value, now = new Date()) => {
  if (!value) return 'Birthdate is required.'
  if (!isValidPatientDate(value)) return 'Enter a valid birthdate.'
  const today = getClinicToday(now)
  if (value > today) return 'Birthdate cannot be in the future.'
  const [year, month, day] = value.split('-').map(Number)
  const [todayYear, todayMonth, todayDay] = today.split('-').map(Number)
  const age = todayYear - year - (todayMonth < month || (todayMonth === month && todayDay < day) ? 1 : 0)
  if (age < MIN_PATIENT_AGE) return 'Patients must be at least 18 years old.'
  if (age > 100) return 'Patient age cannot exceed 100 years.'
  return ''
}

export const validateWalkInBirthdate = (value, now = new Date()) => {
  if (!value) return 'Birthdate is required.'
  if (!isValidPatientDate(value) || value < getMinWalkInBirthdate()) return 'Enter a valid birthdate.'
  const today = getClinicToday(now)
  if (value === today) return 'Birthdate must be before today.'
  if (value > today) return 'Birthdate cannot be in the future.'
  return ''
}

