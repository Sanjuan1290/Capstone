import { getLocalDateOnly } from './date'

export const DAYS_MAP = {
  Sunday: 0,
  Monday: 1,
  Tuesday: 2,
  Wednesday: 3,
  Thursday: 4,
  Friday: 5,
  Saturday: 6,
}

export const padTimePart = (value) => String(value).padStart(2, '0')

export const buildUnavailableDateSet = (items = []) => (
  new Set(
    (Array.isArray(items) ? items : [])
      .map((item) => String(item?.unavailable_date || item?.date || '').slice(0, 10))
      .filter(Boolean)
  )
)

export const isDoctorAvailableOnDate = (dateString, schedules = [], unavailableDates = []) => {
  if (!dateString) return false
  if (buildUnavailableDateSet(unavailableDates).has(dateString)) return false

  const selected = new Date(`${dateString}T00:00:00`)
  if (Number.isNaN(selected.getTime())) return false

  return schedules.some((schedule) => (
    Number(schedule?.is_active) !== 0
    && DAYS_MAP[schedule.day_of_week] === selected.getDay()
  ))
}

export const buildSlotsForScheduleDate = (
  dateString,
  schedules = [],
  { takenSlots = [], unavailableDates = [] } = {}
) => {
  if (!dateString || !isDoctorAvailableOnDate(dateString, schedules, unavailableDates)) return []

  const selected = new Date(`${dateString}T00:00:00`)
  const daySchedule = schedules.find((schedule) => (
    Number(schedule?.is_active) !== 0
    && DAYS_MAP[schedule.day_of_week] === selected.getDay()
  ))

  if (!daySchedule?.start_time || !daySchedule?.end_time) return []

  const [startHour, startMinute] = daySchedule.start_time.split(':').map(Number)
  const [endHour, endMinute] = daySchedule.end_time.split(':').map(Number)
  const slotDuration = Number(daySchedule.slot_duration_mins) || 60
  const taken = new Set(takenSlots || [])
  const slots = []
  let currentMinutes = startHour * 60 + startMinute
  const endMinutes = endHour * 60 + endMinute

  while (currentMinutes + slotDuration <= endMinutes) {
    const hour = Math.floor(currentMinutes / 60)
    const minute = currentMinutes % 60
    const period = hour >= 12 ? 'PM' : 'AM'
    const hour12 = hour % 12 || 12
    const label = `${hour12}:${padTimePart(minute)} ${period}`
    if (!taken.has(label)) {
      slots.push(label)
    }
    currentMinutes += slotDuration
  }

  if (dateString !== getLocalDateOnly()) return slots

  const now = new Date()
  const cutoffMinutes = now.getHours() * 60 + now.getMinutes() + 5
  return slots.filter((slot) => {
    const [timePart, period] = slot.split(' ')
    let [hour, minute] = timePart.split(':').map(Number)
    if (period === 'PM' && hour !== 12) hour += 12
    if (period === 'AM' && hour === 12) hour = 0
    return hour * 60 + minute > cutoffMinutes
  })
}
