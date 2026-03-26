const BASE = '/api/patient'

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

export const bookAppointment = async (payload) => {
  const res = await fetch(`${BASE}/appointments`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    credentials: 'include',
    body: JSON.stringify(payload),
  })
  const data = await res.json()
  if (!res.ok) throw new Error(data.message || 'Booking failed')
  return data
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