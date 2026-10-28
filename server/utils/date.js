const CLINIC_TIMEZONE = process.env.CLINIC_TIMEZONE || 'Asia/Manila'
const pad = (value) => String(value).padStart(2, '0')

const getZonedParts = (value = new Date(), timeZone = CLINIC_TIMEZONE) => {
  const date = value instanceof Date ? value : new Date(value)
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(date)
  const map = Object.fromEntries(parts.map((part) => [part.type, part.value]))
  return {
    year: Number(map.year),
    month: Number(map.month),
    day: Number(map.day),
    hours: Number(map.hour),
    minutes: Number(map.minute),
    seconds: Number(map.second),
  }
}

const getTodayDateOnly = (value = new Date(), timeZone = CLINIC_TIMEZONE) => {
  const { year, month, day } = getZonedParts(value, timeZone)
  return `${year}-${pad(month)}-${pad(day)}`
}


const getClinicDateTimeSql = (value = new Date(), timeZone = CLINIC_TIMEZONE) => {
  const { year, month, day, hours, minutes, seconds } = getZonedParts(value, timeZone)
  return `${year}-${pad(month)}-${pad(day)} ${pad(hours)}:${pad(minutes)}:${pad(seconds)}`
}

const getCurrentTimeLabel = (value = new Date(), timeZone = CLINIC_TIMEZONE) => {
  const { hours, minutes } = getZonedParts(value, timeZone)
  const period = hours >= 12 ? 'PM' : 'AM'
  const hour12 = hours % 12 || 12
  return `${hour12}:${pad(minutes)} ${period}`
}


const getDateOnlyDayOfWeek = (dateOnly) => {
  const [year, month, day] = String(dateOnly || '').split('-').map(Number)
  if (!year || !month || !day) return null
  return new Date(Date.UTC(year, month - 1, day)).getUTCDay()
}

const isClinicOpenDate = (dateOnly) => {
  const dayOfWeek = getDateOnlyDayOfWeek(dateOnly)
  return dayOfWeek !== null && dayOfWeek >= 1 && dayOfWeek <= 6
}

const addDaysDateOnly = (dateOnly, days) => {
  const [year, month, day] = String(dateOnly || '').split('-').map(Number)
  if (!year || !month || !day) return null
  const date = new Date(Date.UTC(year, month - 1, day + Number(days || 0), 12, 0, 0))
  return `${date.getUTCFullYear()}-${pad(date.getUTCMonth() + 1)}-${pad(date.getUTCDate())}`
}

// Converts a local wall-clock time in the clinic timezone into a UTC Date.
// Intl is used to calculate the actual offset (including DST for future reuse).
const zonedDateTimeToUtc = ({ year, month, day, hour = 0, minute = 0, second = 0 }, timeZone = CLINIC_TIMEZONE) => {
  const naiveUtc = Date.UTC(year, month - 1, day, hour, minute, second)
  const probe = new Date(naiveUtc)
  const zoned = getZonedParts(probe, timeZone)
  const zonedAsUtc = Date.UTC(zoned.year, zoned.month - 1, zoned.day, zoned.hours, zoned.minutes, zoned.seconds)
  const offsetMs = zonedAsUtc - naiveUtc
  return new Date(naiveUtc - offsetMs)
}

const getNextClinicRunAt = (hour = 8, minute = 0, now = new Date(), timeZone = CLINIC_TIMEZONE) => {
  const current = getZonedParts(now, timeZone)
  let targetDate = `${current.year}-${pad(current.month)}-${pad(current.day)}`
  if (current.hours > hour || (current.hours === hour && current.minutes >= minute)) {
    targetDate = addDaysDateOnly(targetDate, 1)
  }
  const [year, month, day] = targetDate.split('-').map(Number)
  return zonedDateTimeToUtc({ year, month, day, hour, minute, second: 0 }, timeZone)
}

module.exports = {
  CLINIC_TIMEZONE,
  getZonedParts,
  getTodayDateOnly,
  getCurrentTimeLabel,
  getClinicDateTimeSql,
  getDateOnlyDayOfWeek,
  isClinicOpenDate,
  addDaysDateOnly,
  zonedDateTimeToUtc,
  getNextClinicRunAt,
}
