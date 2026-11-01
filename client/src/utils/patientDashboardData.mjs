// Dates returned by the patient API are local clinic calendar dates (YYYY-MM-DD).
// Compare them in Philippine time, not the viewer's computer time zone.
export function clinicNow(now = new Date()) {
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Asia/Manila', year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', hourCycle: 'h23',
  }).formatToParts(now)
  const value = name => parts.find(part => part.type === name)?.value || '00'
  return { date: `${value('year')}-${value('month')}-${value('day')}`, minutes: Number(value('hour')) * 60 + Number(value('minute')) }
}

export function appointmentMinutes(time) {
  const match = /^\s*(\d{1,2}):(\d{2})\s*(AM|PM)\s*$/i.exec(String(time || ''))
  if (!match) return null
  const hour = Number(match[1]), minute = Number(match[2])
  if (hour < 1 || hour > 12 || minute > 59) return null
  return ((hour % 12) + (match[3].toUpperCase() === 'PM' ? 12 : 0)) * 60 + minute
}

const dateOf = appointment => String(appointment?.appointment_date || appointment?.date || '').slice(0, 10)
const timeOf = appointment => appointmentMinutes(appointment?.appointment_time || appointment?.time)

export function getPatientDashboardSummary(appointments, branchId, now = new Date()) {
  const current = clinicNow(now)
  const matching = (Array.isArray(appointments) ? appointments : []).filter(appointment =>
    branchId && String(appointment.branch_id) === String(branchId)
  )
  const active = matching.filter(appointment => {
    if (!['pending', 'confirmed', 'rescheduled'].includes(appointment.status)) return false
    const date = dateOf(appointment)
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || date < current.date) return false
    const minutes = timeOf(appointment)
    return date > current.date || minutes === null || minutes >= current.minutes
  }).sort((a, b) => dateOf(a).localeCompare(dateOf(b)) || (timeOf(a) ?? 0) - (timeOf(b) ?? 0))
  const completed = matching.filter(appointment => appointment.status === 'completed')
    .sort((a, b) => dateOf(b).localeCompare(dateOf(a)) || (timeOf(b) ?? 0) - (timeOf(a) ?? 0))
  return { upcoming: active[0] || null, upcomingCount: active.length, completedCount: completed.length, recentVisits: completed.slice(0, 2) }
}
