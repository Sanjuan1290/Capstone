const BASE = '/api/doctor'

export const getDashboard = () =>
  fetch(`${BASE}/dashboard`, { credentials: 'include' }).then(r => r.json())

export const getDailyAppointments = (date) =>
  fetch(`${BASE}/appointments/daily${date ? `?date=${date}` : ''}`, { credentials: 'include' }).then(r => r.json())

export const startConsultation = (appointmentId) =>
  fetch(`${BASE}/appointments/${appointmentId}/start`, {
    method: 'PATCH', credentials: 'include',
  }).then(r => r.json())

export const saveConsultation = (appointmentId, payload) =>
  fetch(`${BASE}/consultations/${appointmentId}`, {
    method: 'POST', credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  }).then(r => r.json())

export const getPatientHistory = (patientId) =>
  fetch(`${BASE}/patients/${patientId}/history`, { credentials: 'include' }).then(r => r.json())

export const getInventoryItems = () =>
  fetch(`${BASE}/inventory`, { credentials: 'include' }).then(r => r.json())

export const getMyRequests = () =>
  fetch(`${BASE}/requests`, { credentials: 'include' }).then(r => r.json())

export const submitRequest = (payload) =>
  fetch(`${BASE}/requests`, {
    method: 'POST', credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  }).then(r => r.json())

export const getMySchedule = () =>
  fetch(`${BASE}/schedule`, { credentials: 'include' }).then(r => r.json())