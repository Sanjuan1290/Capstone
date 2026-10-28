const DAY_NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']

const parseTimeToMinutes = (value) => {
  const raw = String(value || '').trim()
  let match = raw.match(/^(\d{1,2}):(\d{2})(?::\d{2})?$/)
  if (match) {
    const hour = Number(match[1])
    const minute = Number(match[2])
    if (hour < 0 || hour > 23 || minute < 0 || minute > 59) return null
    return hour * 60 + minute
  }
  match = raw.match(/^(\d{1,2}):(\d{2})\s*(AM|PM)$/i)
  if (!match) return null
  let hour = Number(match[1])
  const minute = Number(match[2])
  const period = match[3].toUpperCase()
  if (hour < 1 || hour > 12 || minute < 0 || minute > 59) return null
  if (period === 'PM' && hour !== 12) hour += 12
  if (period === 'AM' && hour === 12) hour = 0
  return hour * 60 + minute
}

const formatSlotLabel = (minutes) => {
  const normalized = ((Number(minutes) % 1440) + 1440) % 1440
  const hours = Math.floor(normalized / 60)
  const mins = normalized % 60
  const period = hours >= 12 ? 'PM' : 'AM'
  return `${hours % 12 || 12}:${String(mins).padStart(2, '0')} ${period}`
}

const normalizeScheduleFlags = (schedule = {}) => {
  const is24Hours = Number(schedule.is_24_hours || 0) === 1 || schedule.is_24_hours === true
  const spansNextDay = is24Hours || Number(schedule.spans_next_day || 0) === 1 || schedule.spans_next_day === true
  return { is24Hours, spansNextDay }
}

const getScheduleWindow = (schedule = {}) => {
  const start = parseTimeToMinutes(schedule.start_time)
  const end = parseTimeToMinutes(schedule.end_time)
  const { is24Hours, spansNextDay } = normalizeScheduleFlags(schedule)
  if (start === null || end === null) return null

  if (is24Hours) {
    return { start: 0, end: 1440, duration: 1440, spansNextDay: true, is24Hours: true }
  }

  const absoluteEnd = spansNextDay ? end + 1440 : end
  const duration = absoluteEnd - start
  if (duration <= 0 || duration > 1440) return null
  return { start, end: absoluteEnd, duration, spansNextDay, is24Hours: false }
}

const validateSchedulePayload = (body = {}) => {
  const day = String(body.day_of_week || '').trim()
  if (!DAY_NAMES.includes(day)) {
    const error = new Error('Select a valid day of the week.')
    error.statusCode = 400
    throw error
  }

  const isActive = body.is_active === false || Number(body.is_active) === 0 ? 0 : 1
  const is24Hours = body.is_24_hours === true || Number(body.is_24_hours) === 1 ? 1 : 0
  let spansNextDay = body.spans_next_day === true || Number(body.spans_next_day) === 1 ? 1 : 0
  let startTime = String(body.start_time || '').trim()
  let endTime = String(body.end_time || '').trim()
  const slotDuration = Number(body.slot_duration_mins || 60)

  if (is24Hours) {
    startTime = '00:00'
    endTime = '00:00'
    spansNextDay = 1
  }

  if (!startTime || !endTime || parseTimeToMinutes(startTime) === null || parseTimeToMinutes(endTime) === null) {
    const error = new Error('Start time and end time are required.')
    error.statusCode = 400
    throw error
  }
  if (![15, 20, 30, 45, 60, 90].includes(slotDuration)) {
    const error = new Error('Select a valid appointment slot duration.')
    error.statusCode = 400
    throw error
  }

  const window = getScheduleWindow({ start_time: startTime, end_time: endTime, spans_next_day: spansNextDay, is_24_hours: is24Hours })
  if (!window) {
    const error = new Error(spansNextDay
      ? 'An overnight schedule must end at or before the start time and cannot exceed 24 hours.'
      : 'End time must be later than start time, or enable Ends next day for an overnight schedule.')
    error.statusCode = 400
    throw error
  }
  if (window.duration < slotDuration) {
    const error = new Error('The schedule window must be at least one appointment slot long.')
    error.statusCode = 400
    throw error
  }

  return {
    day_of_week: day,
    start_time: startTime,
    end_time: endTime,
    slot_duration_mins: slotDuration,
    is_active: isActive,
    spans_next_day: spansNextDay,
    is_24_hours: is24Hours,
  }
}

const getPreviousDayName = (dayName) => {
  const index = DAY_NAMES.indexOf(dayName)
  return index < 0 ? null : DAY_NAMES[(index + 6) % 7]
}

const getDateDayName = (dateString) => {
  const date = new Date(`${String(dateString)}T12:00:00Z`)
  return Number.isNaN(date.getTime()) ? null : DAY_NAMES[date.getUTCDay()]
}

const getCalendarDateScheduleSegments = (dateString, schedules = []) => {
  const dayName = getDateDayName(dateString)
  if (!dayName) return []
  const previousDay = getPreviousDayName(dayName)
  const active = (Array.isArray(schedules) ? schedules : []).filter((row) => Number(row?.is_active) !== 0)
  const segments = []

  const todaySchedule = active.find((row) => row.day_of_week === dayName)
  const todayWindow = todaySchedule ? getScheduleWindow(todaySchedule) : null
  if (todaySchedule && todayWindow) {
    const sameDayEnd = Math.min(todayWindow.end, 1440)
    if (sameDayEnd > todayWindow.start) {
      segments.push({ schedule: todaySchedule, start: todayWindow.start, end: sameDayEnd, anchor: 'current' })
    }
  }

  const previousSchedule = active.find((row) => row.day_of_week === previousDay)
  const previousWindow = previousSchedule ? getScheduleWindow(previousSchedule) : null
  if (previousSchedule && previousWindow?.spansNextDay && previousWindow.end > 1440) {
    const tailEnd = Math.min(previousWindow.end - 1440, 1440)
    if (tailEnd > 0) {
      segments.push({ schedule: previousSchedule, start: 0, end: tailEnd, anchor: 'previous', originalStart: previousWindow.start })
    }
  }

  return segments
}

const isTimeCoveredByWeeklySchedule = ({ date, time, schedules = [], slotDurationOverride = null }) => {
  const requested = parseTimeToMinutes(time)
  if (requested === null) return false
  const segments = getCalendarDateScheduleSegments(date, schedules)
  for (const segment of segments) {
    const duration = Math.max(1, Number(slotDurationOverride || segment.schedule.slot_duration_mins) || 60)
    if (requested < segment.start || requested + duration > segment.end) continue
    if (segment.anchor === 'current') {
      const base = getScheduleWindow(segment.schedule)?.start ?? segment.start
      if ((requested - base) % duration === 0) return true
    } else {
      const base = Number(segment.originalStart || 0)
      if ((requested + 1440 - base) % duration === 0) return true
    }
  }
  return false
}

const buildSlotsForCalendarDate = ({ date, schedules = [], takenSlots = [], unavailable = false, nowMinutes = null }) => {
  if (unavailable) return []
  const taken = new Set((Array.isArray(takenSlots) ? takenSlots : []).map((value) => String(value || '').trim()))
  const slots = []
  const seen = new Set()

  for (const segment of getCalendarDateScheduleSegments(date, schedules)) {
    const duration = Math.max(1, Number(segment.schedule.slot_duration_mins) || 60)
    const window = getScheduleWindow(segment.schedule)
    let cursor
    if (segment.anchor === 'current') {
      cursor = window?.start ?? segment.start
      while (cursor + duration <= Math.min(window?.end ?? segment.end, 1440)) {
        if (cursor >= segment.start && cursor < segment.end) {
          const label = formatSlotLabel(cursor)
          if (!seen.has(label)) {
            seen.add(label)
            const state = taken.has(label) ? 'booked' : (nowMinutes !== null && cursor <= nowMinutes) ? 'past' : 'available'
            slots.push({ time: label, available: state === 'available', state, minutes: cursor })
          }
        }
        cursor += duration
      }
    } else {
      cursor = window?.start ?? Number(segment.originalStart || 0)
      const end = window?.end ?? 1440
      while (cursor + duration <= end) {
        if (cursor >= 1440) {
          const localMinutes = cursor - 1440
          if (localMinutes >= segment.start && localMinutes < segment.end) {
            const label = formatSlotLabel(localMinutes)
            if (!seen.has(label)) {
              seen.add(label)
              const state = taken.has(label) ? 'booked' : (nowMinutes !== null && localMinutes <= nowMinutes) ? 'past' : 'available'
              slots.push({ time: label, available: state === 'available', state, minutes: localMinutes })
            }
          }
        }
        cursor += duration
      }
    }
  }

  return slots.sort((a, b) => a.minutes - b.minutes)
}

module.exports = {
  DAY_NAMES,
  parseTimeToMinutes,
  formatSlotLabel,
  normalizeScheduleFlags,
  getScheduleWindow,
  validateSchedulePayload,
  getPreviousDayName,
  getDateDayName,
  getCalendarDateScheduleSegments,
  isTimeCoveredByWeeklySchedule,
  buildSlotsForCalendarDate,
}
