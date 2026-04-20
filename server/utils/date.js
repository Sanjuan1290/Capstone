const pad = (value) => String(value).padStart(2, '0')

const getLocalDateParts = (value = new Date()) => {
  const date = value instanceof Date ? value : new Date(value)
  return {
    year: date.getFullYear(),
    month: date.getMonth() + 1,
    day: date.getDate(),
    hours: date.getHours(),
    minutes: date.getMinutes(),
  }
}

const getTodayDateOnly = (value = new Date()) => {
  const { year, month, day } = getLocalDateParts(value)
  return `${year}-${pad(month)}-${pad(day)}`
}

const getCurrentTimeLabel = (value = new Date()) => {
  const { hours, minutes } = getLocalDateParts(value)
  const period = hours >= 12 ? 'PM' : 'AM'
  const hour12 = hours % 12 || 12
  return `${hour12}:${pad(minutes)} ${period}`
}

module.exports = {
  getTodayDateOnly,
  getCurrentTimeLabel,
}
