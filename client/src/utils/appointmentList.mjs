// Shared appointment-list presentation helpers. No changes to billing or appointment status.
export const APPOINTMENT_PAGE_SIZES = [10, 20, 50]
const CLOSED_STATUSES = new Set(['completed', 'cancelled', 'rejected', 'no_show'])
const UPCOMING_STATUSES = new Set(['confirmed', 'rescheduled', 'in-progress'])

export const visitDate = (appointment) => String(appointment?.date || appointment?.appointment_date || '').slice(0, 10)
export const isAwaitingAction = (appointment) => appointment?.status === 'pending'
export const hasRescheduleRequest = (appointment) => isAwaitingAction(appointment) && Boolean(appointment?.reschedule_requested_at)
export const isUpcomingVisit = (appointment, today) => UPCOMING_STATUSES.has(appointment?.status) && visitDate(appointment) >= today

export function appointmentStats(appointments, today) {
  const list = Array.isArray(appointments) ? appointments : []
  const byStatus = Object.fromEntries(list.reduce((map, appointment) => {
    const status = String(appointment.status || 'unknown')
    map.set(status, (map.get(status) || 0) + 1)
    return map
  }, new Map()))
  return {
    all: list.length,
    byStatus,
    needsAction: list.filter(isAwaitingAction).length,
    rescheduleRequests: list.filter(hasRescheduleRequest).length,
    today: list.filter((item) => visitDate(item) === today).length,
    upcoming: list.filter((item) => isUpcomingVisit(item, today)).length,
  }
}

const millis = (value) => {
  const timestamp = Date.parse(String(value || ''))
  return Number.isFinite(timestamp) ? timestamp : 0
}
const timeKey = (appointment) => {
  const value = String(appointment?.appointment_time || appointment?.time || '').trim()
  const match = value.match(/^(\d{1,2}):(\d{2})(?:\s*(AM|PM))?/i)
  if (!match) return 0
  let hour = Number(match[1])
  if (match[3]) hour = (hour % 12) + (match[3].toUpperCase() === 'PM' ? 12 : 0)
  return hour * 60 + Number(match[2])
}
const visitCompare = (a, b) => visitDate(a).localeCompare(visitDate(b)) || timeKey(a) - timeKey(b) || Number(a.id || 0) - Number(b.id || 0)
const newFirst = (a, b) => millis(b.created_at) - millis(a.created_at) || Number(b.id || 0) - Number(a.id || 0)
const changedFirst = (a, b) => millis(b.updated_at || b.created_at) - millis(a.updated_at || a.created_at) || newFirst(a, b)

// Outstanding requests always precede booked/finished visits, even when the booked date has passed.
const priorityGroup = (appointment, today) => {
  if (hasRescheduleRequest(appointment)) return 0
  if (isAwaitingAction(appointment)) return 1
  if (isUpcomingVisit(appointment, today)) return 2
  if (!CLOSED_STATUSES.has(appointment.status)) return 3
  return 4
}
export function sortAppointmentList(records, { tab = 'all', order = 'priority', today = '' } = {}) {
  const list = Array.isArray(records) ? records : []
  return [...list].sort((a, b) => {
    if (order === 'newest') return newFirst(a, b)
    if (order === 'soonest') {
      const aActive = visitDate(a) >= today && !CLOSED_STATUSES.has(a.status)
      const bActive = visitDate(b) >= today && !CLOSED_STATUSES.has(b.status)
      if (aActive !== bActive) return aActive ? -1 : 1
      return aActive ? visitCompare(a, b) : visitCompare(b, a)
    }
    if (tab === 'pending' || tab === 'needs_action') {
      if (hasRescheduleRequest(a) !== hasRescheduleRequest(b)) return hasRescheduleRequest(a) ? -1 : 1
      return newFirst(a, b)
    }
    if (tab === 'confirmed' || tab === 'rescheduled') return visitCompare(a, b)
    if (CLOSED_STATUSES.has(tab)) return changedFirst(a, b)
    const aGroup = priorityGroup(a, today)
    const bGroup = priorityGroup(b, today)
    if (aGroup !== bGroup) return aGroup - bGroup
    if (aGroup <= 1 || aGroup === 4) return aGroup === 4 ? changedFirst(a, b) : newFirst(a, b)
    return aGroup === 2 ? visitCompare(a, b) : visitCompare(b, a)
  })
}

export function filterAppointmentList(appointments, filters = {}) {
  const { tab = 'all', query = '', dateFrom = '', dateTo = '', clinicFilter = 'all', doctorFilter = 'all' } = filters
  const needle = String(query || '').trim().toLocaleLowerCase()
  return (Array.isArray(appointments) ? appointments : []).filter((appointment) => {
    if (tab !== 'all' && (tab === 'needs_action' ? !isAwaitingAction(appointment) : appointment.status !== tab)) return false
    const date = visitDate(appointment)
    if ((dateFrom && date < dateFrom) || (dateTo && date > dateTo)) return false
    if (clinicFilter !== 'all' && (appointment.clinic_type || appointment.type || '') !== clinicFilter) return false
    if (doctorFilter !== 'all' && appointment.doctor !== doctorFilter) return false
    if (!needle) return true
    return [appointment.patient_name, appointment.patient, appointment.patient_phone,
      appointment.patient_email, appointment.doctor, appointment.requested_service_name_snapshot,
      appointment.reason, appointment.cancellation_reason_snapshot, appointment.cancellation_details]
      .some((value) => String(value || '').toLocaleLowerCase().includes(needle))
  })
}

export function paginateAppointments(list, page, pageSize) {
  const safeSize = APPOINTMENT_PAGE_SIZES.includes(Number(pageSize)) ? Number(pageSize) : 10
  const total = Array.isArray(list) ? list.length : 0
  const totalPages = Math.max(1, Math.ceil(total / safeSize))
  const currentPage = Math.max(1, Math.min(totalPages, Math.floor(Number(page) || 1)))
  return {
    total,
    totalPages,
    currentPage,
    pageSize: safeSize,
    first: total ? (currentPage - 1) * safeSize + 1 : 0,
    last: Math.min(total, currentPage * safeSize),
    items: (Array.isArray(list) ? list : []).slice((currentPage - 1) * safeSize, currentPage * safeSize),
  }
}

export function visiblePageNumbers(page, totalPages) {
  const pages = Math.max(1, Math.floor(Number(totalPages) || 1))
  const safePage = Math.min(pages, Math.max(1, Math.floor(Number(page) || 1)))
  const start = Math.max(1, Math.min(safePage - 2, pages - 4))
  return Array.from({ length: Math.min(5, pages - start + 1) }, (_, index) => start + index)
}
