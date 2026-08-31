const { getTodayDateOnly } = require('./date')

const toDateOnly = (value) => String(value || '').trim().slice(0, 10)
const isValidDateOnly = (value) => /^\d{4}-\d{2}-\d{2}$/.test(value)

const resolveReportRange = (query = {}, now = new Date()) => {
  const requestedEnd = toDateOnly(query.end_date)
  const endDate = isValidDateOnly(requestedEnd) ? requestedEnd : getTodayDateOnly(now)

  let startDate = toDateOnly(query.start_date)
  if (!isValidDateOnly(startDate)) {
    const fallbackMonths = query.period === '3months' ? 3 : 6
    const fallback = new Date(`${endDate}T00:00:00`)
    fallback.setMonth(fallback.getMonth() - fallbackMonths)
    startDate = getTodayDateOnly(fallback)
  }

  if (startDate > endDate) {
    const error = new Error('Start date cannot be after end date.')
    error.statusCode = 400
    throw error
  }

  return { startDate, endDate }
}

module.exports = { toDateOnly, isValidDateOnly, resolveReportRange }
