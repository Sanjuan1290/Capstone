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

export const getAppointmentReasons = async (clinicType = '') => {
  const query = clinicType ? `?clinic_type=${encodeURIComponent(clinicType)}` : ''
  const res = await fetch(`${BASE}/appointment-reasons${query}`, { credentials: 'include' })
  if (!res.ok) throw new Error('Failed to fetch appointment reasons')
  return res.json()
}

export const getDoctors = async () => {
  const res = await fetch(`${BASE}/doctors`, { credentials: 'include' })
  if (!res.ok) throw new Error('Failed to fetch doctors')
  return res.json()
}

export const getDoctorSchedule = async (doctorId) => {
  const res = await fetch(`${BASE}/doctors/${doctorId}/schedule`, { credentials: 'include' })
  if (!res.ok) throw new Error('Failed to fetch schedule')
  return res.json()
}

export const getDoctorUnavailableDates = async (doctorId, params = {}) => {
  const search = new URLSearchParams()
  if (params.startDate) search.set('start_date', params.startDate)
  if (params.endDate) search.set('end_date', params.endDate)
  const query = search.toString()
  const res = await fetch(`${BASE}/doctors/${doctorId}/unavailable-dates${query ? `?${query}` : ''}`, { credentials: 'include' })
  if (!res.ok) throw new Error('Failed to fetch unavailable dates')
  return res.json()
}

export const getDoctorTakenSlots = async (doctorId, date, options = {}) => {
  const params = new URLSearchParams({ date })
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

export const cancelAppointment = async (appointmentId) => {
  const res = await fetch(`${BASE}/appointments/${appointmentId}/cancel`, {
    method: 'PATCH',
    credentials: 'include',
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
