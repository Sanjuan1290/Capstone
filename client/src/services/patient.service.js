const BASE = '/api/patient'

const parseJson = async (res) => {
  const data = await res.json()
  if (!res.ok) {
    const err = new Error(data.message || 'Request failed')
    Object.assign(err, data)
    throw err
  }
  return data
}

export const getMyAppointments = async () => {
  const res = await fetch(`${BASE}/appointments`, { credentials: 'include' })
  if (!res.ok) throw new Error('Failed to fetch appointments')
  return res.json()
}

export const getMyHistory = async () => {
  const res = await fetch(`${BASE}/appointments/history`, { credentials: 'include' })
  if (!res.ok) throw new Error('Failed to fetch history')
  return res.json()
}


export const getActiveBranches = async () => parseJson(await fetch(`${BASE}/branches`, {credentials:'include'}))

export const getBookingReadiness = async (branchId) => {
  const res = await fetch(`${BASE}/booking-readiness?branch_id=${encodeURIComponent(branchId)}`, { credentials: 'include' })
  return parseJson(res)
}

export const getCurrentPromotions = () => fetch(`${BASE}/promotions`, { credentials: 'include' }).then(parseJson)

export const getBookingServices = async (clinicType = '', branchId = '') => {
  const query = `?branch_id=${encodeURIComponent(branchId)}${clinicType?`&clinic_type=${encodeURIComponent(clinicType)}`:''}`
  const res = await fetch(`${BASE}/booking-services${query}`, { credentials: 'include' })
  if (!res.ok) throw new Error('Failed to fetch clinic services')
  return res.json()
}

export const getAppointmentReasons = async (clinicType = '', branchId = '') => {
  const query = `?branch_id=${encodeURIComponent(branchId)}${clinicType?`&clinic_type=${encodeURIComponent(clinicType)}`:''}`
  const res = await fetch(`${BASE}/appointment-reasons${query}`, { credentials: 'include' })
  if (!res.ok) throw new Error('Failed to fetch appointment reasons')
  return res.json()
}

export const getDoctors = async () => {
  const res = await fetch(`${BASE}/doctors`, { credentials: 'include' })
  if (!res.ok) throw new Error('Failed to fetch doctors')
  return res.json()
}

export const getDoctorsAvailability = async ({ clinicType = '', startDate = '', days = 7, branchId = '' } = {}) => {
  const params = new URLSearchParams()
  if (branchId) params.set('branch_id', String(branchId))
  if (clinicType) params.set('clinic_type', clinicType)
  if (startDate) params.set('start_date', startDate)
  params.set('days', String(days))
  const res = await fetch(`${BASE}/doctors/availability?${params.toString()}`, { credentials: 'include' })
  return parseJson(res)
}

export const getDoctorSchedule = async (doctorId, branchId) => {
  const res = await fetch(`${BASE}/doctors/${doctorId}/schedule?branch_id=${encodeURIComponent(branchId)}`, { credentials: 'include' })
  if (!res.ok) throw new Error('Failed to fetch schedule')
  return res.json()
}

export const getDoctorUnavailableDates = async (doctorId, params = {}) => {
  const search = new URLSearchParams()
  if (params.branchId) search.set('branch_id', String(params.branchId))
  if (params.startDate) search.set('start_date', params.startDate)
  if (params.endDate) search.set('end_date', params.endDate)
  const query = search.toString()
  const res = await fetch(`${BASE}/doctors/${doctorId}/unavailable-dates${query ? `?${query}` : ''}`, { credentials: 'include' })
  if (!res.ok) throw new Error('Failed to fetch unavailable dates')
  return res.json()
}

export const getDoctorAvailableSlots = async (doctorId, { date = '', serviceId = '', appointmentId = '', clinicType = '', branchId = '' } = {}) => {
  const params = new URLSearchParams()
  if (date) params.set('date', date)
  if (branchId) params.set('branch_id', String(branchId))
  if (serviceId) params.set('service_id', String(serviceId))
  if (appointmentId) params.set('appointment_id', String(appointmentId))
  if (clinicType) params.set('clinic_type', clinicType)
  const res = await fetch(`${BASE}/doctors/${doctorId}/available-slots?${params.toString()}`, { credentials: 'include' })
  return parseJson(res)
}

export const getDoctorTakenSlots = async (doctorId, date, options = {}) => {
  const params = new URLSearchParams({ date })
  if (options.branchId) params.set('branch_id', String(options.branchId))
  if (options.excludeAppointmentId) {
    params.set('exclude_appointment_id', String(options.excludeAppointmentId))
  }
  const res = await fetch(`${BASE}/doctors/${doctorId}/taken-slots?${params.toString()}`, { credentials: 'include' })
  if (!res.ok) throw new Error('Failed to fetch taken slots')
  return res.json()
}

export const bookAppointment = async (payload) => {
  const res = await fetch(`${BASE}/appointments`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    credentials: 'include',
    body: JSON.stringify(payload),
  })
  return parseJson(res)
}

export const getAppointmentCancellationReasons = async (branchId) => {
  const res = await fetch(`${BASE}/appointment-cancellation-reasons?branch_id=${encodeURIComponent(branchId)}`, { credentials: 'include' })
  return parseJson(res)
}

export const cancelAppointment = async (appointmentId, payload) => {
  const res = await fetch(`${BASE}/appointments/${appointmentId}/cancel`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    credentials: 'include',
    body: JSON.stringify(payload || {}),
  })
  const data = await res.json()
  if (!res.ok) throw new Error(data.message || 'Cancel failed')
  return data
}

export const rescheduleAppointment = async (appointmentId, payload) => {
  const res = await fetch(`${BASE}/appointments/${appointmentId}/reschedule`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    credentials: 'include',
    body: JSON.stringify(payload),
  })
  const data = await res.json()
  if (!res.ok) throw new Error(data.message || 'Reschedule failed')
  return data
}

export const getProfileStatus = async () => {
  const res = await fetch(`${BASE}/profile-status`, { credentials: 'include' })
  return parseJson(res)
}

export const updatePatientProfile = async (payload) => {
  const res = await fetch(`${BASE}/profile-status`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    credentials: 'include',
    body: JSON.stringify(payload),
  })
  return parseJson(res)
}


