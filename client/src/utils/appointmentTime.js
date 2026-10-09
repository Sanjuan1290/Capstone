const DEFAULT_RESERVED_DURATION_MINUTES = 60
const DEFAULT_BOOKING_INTERVAL_MINUTES = 30

export const parseAppointmentTimeMinutes = (value) => {
  const raw = String(value || '').trim()
  if (!raw) return null

  const twelveHour = raw.match(/^(\d{1,2}):(\d{2})(?::\d{2})?\s*(AM|PM)$/i)
  if (twelveHour) {
    let hour = Number(twelveHour[1])
    const minute = Number(twelveHour[2])
    if (hour < 1 || hour > 12 || minute < 0 || minute > 59) return null
    const meridiem = twelveHour[3].toUpperCase()
    if (meridiem === 'PM' && hour < 12) hour += 12
    if (meridiem === 'AM' && hour === 12) hour = 0
    return (hour * 60) + minute
  }

  const twentyFourHour = raw.match(/^(\d{1,2}):(\d{2})(?::\d{2})?$/)
  if (twentyFourHour) {
    const hour = Number(twentyFourHour[1])
    const minute = Number(twentyFourHour[2])
    if (hour < 0 || hour > 23 || minute < 0 || minute > 59) return null
    return (hour * 60) + minute
  }

  return null
}

export const formatClockMinutes = (minutes) => {
  const safe = ((Number(minutes) % 1440) + 1440) % 1440
  const hour24 = Math.floor(safe / 60)
  const minute = safe % 60
  const meridiem = hour24 >= 12 ? 'PM' : 'AM'
  const hour12 = hour24 % 12 || 12
  return `${hour12}:${String(minute).padStart(2, '0')} ${meridiem}`
}

export const formatDurationMinutes = (minutes, fallback = DEFAULT_RESERVED_DURATION_MINUTES) => {
  const total = Math.max(1, Number(minutes) || fallback)
  const hours = Math.floor(total / 60)
  const mins = total % 60
  const parts = []
  if (hours) parts.push(`${hours} hr${hours === 1 ? '' : 's'}`)
  if (mins) parts.push(`${mins} min`)
  return parts.join(' ') || `${total} min`
}

export const roundToBookingBlock = (minutes, intervalMinutes = DEFAULT_BOOKING_INTERVAL_MINUTES) => {
  const average = Math.max(1, Number(minutes) || DEFAULT_RESERVED_DURATION_MINUTES)
  const interval = Math.max(1, Number(intervalMinutes) || DEFAULT_BOOKING_INTERVAL_MINUTES)
  return Math.ceil(average / interval) * interval
}

export const getReservedDurationMinutes = (appointment, fallback = DEFAULT_RESERVED_DURATION_MINUTES) => {
  const explicit = Number(appointment?.reserved_duration_minutes_snapshot || 0)
  if (explicit > 0) return explicit
  const average = Number(appointment?.requested_service_duration_minutes_snapshot || appointment?.average_duration_minutes || 0)
  return average > 0 ? roundToBookingBlock(average) : fallback
}

export const formatAppointmentTimeRange = (startTime, durationMinutes = DEFAULT_RESERVED_DURATION_MINUTES) => {
  const start = parseAppointmentTimeMinutes(startTime)
  if (start === null) return startTime || '—'
  const duration = Math.max(1, Number(durationMinutes) || DEFAULT_RESERVED_DURATION_MINUTES)
  const end = start + duration
  return `${formatClockMinutes(start)} – ${formatClockMinutes(end)}${end >= 1440 ? ' (+1 day)' : ''}`
}

export const formatAppointmentRange = (appointment) => formatAppointmentTimeRange(
  appointment?.appointment_time || appointment?.time,
  getReservedDurationMinutes(appointment)
)

