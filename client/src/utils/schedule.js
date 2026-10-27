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

const DAY_NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']

export const padTimePart = (value) => String(value).padStart(2, '0')

export const parseScheduleTime = (value) => {
  const match = String(value || '').trim().match(/^(\d{1,2}):(\d{2})(?::\d{2})?$/)
  if (!match) return null
  const hour = Number(match[1]); const minute = Number(match[2])
  if (hour < 0 || hour > 23 || minute < 0 || minute > 59) return null
  return hour * 60 + minute
}

export const formatScheduleTime = (value) => {
  const minutes = parseScheduleTime(value)
  if (minutes === null) return '—'
  const hour = Math.floor(minutes / 60)
  const minute = minutes % 60
  const period = hour >= 12 ? 'PM' : 'AM'
  return `${hour % 12 || 12}:${padTimePart(minute)} ${period}`
}

export const scheduleSummary = (schedule, dayLabel = '') => {
  if (!schedule || Number(schedule.is_active) === 0) return 'Unavailable'
  if (Number(schedule.is_24_hours) === 1) return 'Available 24 hours'
  const suffix = Number(schedule.spans_next_day) === 1 ? ' · ends next day' : ''
  return `${formatScheduleTime(schedule.start_time)} – ${formatScheduleTime(schedule.end_time)}${suffix}${dayLabel ? ` (${dayLabel})` : ''}`
}

export const buildUnavailableDateSet = (items = []) => (
  new Set(
    (Array.isArray(items) ? items : [])
      .map((item) => String(item?.unavailable_date || item?.date || '').slice(0, 10))
      .filter(Boolean)
  )
)

const getScheduleWindow = (schedule = {}) => {
  const start = parseScheduleTime(schedule.start_time)
  const end = parseScheduleTime(schedule.end_time)
  if (start === null || end === null) return null
  const is24 = Number(schedule.is_24_hours || 0) === 1
  const spans = is24 || Number(schedule.spans_next_day || 0) === 1
  if (is24) return { start: 0, end: 1440, spansNextDay: true }
  const absoluteEnd = spans ? end + 1440 : end
  if (absoluteEnd <= start || absoluteEnd - start > 1440) return null
  return { start, end: absoluteEnd, spansNextDay: spans }
}

const dayNameForDate = (dateString) => {
  const selected = new Date(`${dateString}T00:00:00`)
  return Number.isNaN(selected.getTime()) ? null : DAY_NAMES[selected.getDay()]
}

const previousDayName = (dayName) => {
  const index = DAY_NAMES.indexOf(dayName)
  return index < 0 ? null : DAY_NAMES[(index + 6) % 7]
}

export const getScheduleSegmentsForDate = (dateString, schedules = []) => {
  const dayName = dayNameForDate(dateString)
  if (!dayName) return []
  const previous = previousDayName(dayName)
  const active = (Array.isArray(schedules) ? schedules : []).filter((row) => Number(row?.is_active) !== 0)
  const segments = []
  const today = active.find((row) => row.day_of_week === dayName)
  const todayWindow = today ? getScheduleWindow(today) : null
  if (today && todayWindow) {
    const sameDayEnd = Math.min(todayWindow.end, 1440)
    if (sameDayEnd > todayWindow.start) segments.push({ schedule: today, start: todayWindow.start, end: sameDayEnd, anchor: 'current' })
  }
  const prior = active.find((row) => row.day_of_week === previous)
  const priorWindow = prior ? getScheduleWindow(prior) : null
  if (prior && priorWindow?.spansNextDay && priorWindow.end > 1440) {
    const tailEnd = Math.min(priorWindow.end - 1440, 1440)
    if (tailEnd > 0) segments.push({ schedule: prior, start: 0, end: tailEnd, anchor: 'previous', originalStart: priorWindow.start, absoluteEnd: priorWindow.end })
  }
  return segments
}

export const isDoctorAvailableOnDate = (dateString, schedules = [], unavailableDates = []) => {
  if (!dateString || buildUnavailableDateSet(unavailableDates).has(dateString)) return false
  return getScheduleSegmentsForDate(dateString, schedules).length > 0
}

const makeSlotLabel = (minutes) => {
  const hour = Math.floor(minutes / 60)
  const minute = minutes % 60
  const period = hour >= 12 ? 'PM' : 'AM'
  return `${hour % 12 || 12}:${padTimePart(minute)} ${period}`
}

export const buildSlotsForScheduleDate = (
  dateString,
  schedules = [],
  { takenSlots = [], unavailableDates = [] } = {}
) => {
  if (!dateString || !isDoctorAvailableOnDate(dateString, schedules, unavailableDates)) return []

  const taken = new Set(takenSlots || [])
  const slots = []
  const seen = new Set()

  for (const segment of getScheduleSegmentsForDate(dateString, schedules)) {
    const duration = Number(segment.schedule.slot_duration_mins) || 60
    const window = getScheduleWindow(segment.schedule)
    if (!window) continue

    if (segment.anchor === 'current') {
      for (let cursor = window.start; cursor + duration <= Math.min(window.end, 1440); cursor += duration) {
        if (cursor < segment.start || cursor >= segment.end) continue
        const label = makeSlotLabel(cursor)
        if (!taken.has(label) && !seen.has(label)) { seen.add(label); slots.push({ label, minutes: cursor }) }
      }
    } else {
      for (let cursor = window.start; cursor + duration <= window.end; cursor += duration) {
        if (cursor < 1440) continue
        const local = cursor - 1440
        if (local < segment.start || local >= segment.end) continue
        const label = makeSlotLabel(local)
        if (!taken.has(label) && !seen.has(label)) { seen.add(label); slots.push({ label, minutes: local }) }
      }
    }
  }

  slots.sort((a, b) => a.minutes - b.minutes)
  let labels = slots.map((slot) => slot.label)
  if (dateString !== getLocalDateOnly()) return labels

  const now = new Date()
  const cutoffMinutes = now.getHours() * 60 + now.getMinutes() + 5
  labels = slots.filter((slot) => slot.minutes > cutoffMinutes).map((slot) => slot.label)
  return labels
}

