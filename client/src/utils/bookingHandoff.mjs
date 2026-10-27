// A deep link is a prefill, not a reservation. Server-side booking slot checks remain authoritative.
export const buildSlotBookingPath = ({branchId,doctorId,clinicType,date='',time=''}) => {
  const params = new URLSearchParams({ branch_id: String(branchId), doctor: String(doctorId), clinic: String(clinicType) })
  if (/^\d{4}-\d{2}-\d{2}$/.test(date)) params.set('date', date)
  if (time) params.set('time', String(time))
  return `/patient/book?${params.toString()}`
}
export const readSlotPrefill = (params, nowDate) => {
  const date = params.get('date') || ''
  const time = params.get('time') || ''
  const validDate = /^\d{4}-\d{2}-\d{2}$/.test(date) && date >= nowDate
  return { date: validDate ? date : null, time: validDate && time.length <= 30 ? time : '' }
}


