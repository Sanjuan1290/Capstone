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

export const getMinPatientBirthdate = (now = new Date()) => {
  const today = getClinicToday(now)
  return `${String(Number(today.slice(0, 4)) - 100).padStart(4, '0')}${today.slice(4)}`
}

export const validatePatientBirthdate = (value, now = new Date()) => {
  if (!value) return 'Birthdate is required.'
  if (!isValidPatientDate(value)) return 'Enter a valid birthdate.'
  const today = getClinicToday(now)
  if (value > today) return 'Birthdate cannot be in the future.'
  const [year, month, day] = value.split('-').map(Number)
  const [todayYear, todayMonth, todayDay] = today.split('-').map(Number)
  const age = todayYear - year - (todayMonth < month || (todayMonth === month && todayDay < day) ? 1 : 0)
  if (age > 100) return 'Patient age cannot exceed 100 years.'
  return ''
}


