import { slotDisplayState } from './doctorAvailabilityPresentation.mjs'

// Dates are always clinic-local YYYY-MM-DD strings; do not parse at local midnight.
export const monthKeyFromDate = (date) => String(date || '').slice(0, 7)
export const makeDateOnly = (year, monthIndex, day) => new Date(Date.UTC(year, monthIndex, day)).toISOString().slice(0, 10)
export const shiftMonth = (monthKey, months) => {
  const [year, month] = String(monthKey).split('-').map(Number)
  return makeDateOnly(year, month - 1 + months, 1).slice(0, 7)
}
export const monthDateList = (monthKey) => {
  const [year, month] = String(monthKey).split('-').map(Number)
  if (!year || month < 1 || month > 12) return []
  const totalDays = new Date(Date.UTC(year, month, 0)).getUTCDate()
  return Array.from({ length: totalDays }, (_, index) => makeDateOnly(year, month - 1, index + 1))
}
export const monthSundayOffset = (monthKey) => {
  const first = monthDateList(monthKey)[0]
  if (!first) return 0
  return new Date(`${first}T12:00:00Z`).getUTCDay() // Calendar begins on Sunday.
}
// The existing endpoint only accepts up to 14 days per request. Split months
// rather than change appointment scheduling or silently lose calendar days.
export const monthAvailabilityRequests = (monthKey) => {
  const dates = monthDateList(monthKey)
  const chunks = []
  for (let index = 0; index < dates.length; index += 14) {
    chunks.push({ startDate: dates[index], days: Math.min(14, dates.length - index) })
  }
  return chunks
}
export const availableSlotsForDay = (day) => (Array.isArray(day?.slots) ? day.slots : [])
  .filter(slot => slotDisplayState(slot) === 'available')

export const calendarDayState = (date, day, today) => {
  if (date < today) return 'past'
  if (!day) return 'unknown'
  if (day.unavailable_reason) return 'blocked'
  if (availableSlotsForDay(day).length) return 'available'
  return 'unavailable'
}

export const unavailableDayReason = (date, day, today) => {
  if (date < today) return 'This date has passed.'
  if (!day) return 'Availability has not loaded for this date. Please retry.'
  if (day.unavailable_reason) return day.unavailable_reason
  const slots = Array.isArray(day.slots) ? day.slots : []
  if (!slots.length) return 'The doctor has no scheduled clinic hours on this date.'
  if (slots.every(slot => slotDisplayState(slot) === 'booked')) return 'All appointment times are booked for this date.'
  if (slots.some(slot => slotDisplayState(slot) === 'booked')) return 'No open appointment times remain for this date.'
  return 'No available appointment times for this date.'
}
