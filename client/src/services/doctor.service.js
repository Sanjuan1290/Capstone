// client/src/services/doctor.service.js
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

// Active days only — used by dashboard
export const getMySchedule = () =>
  fetch(`${BASE}/schedule`, { credentials: 'include' }).then(r => r.json())

// ALL days including inactive — used by Doctor_Schedule page
export const getMyScheduleAll = () =>
  fetch(`${BASE}/schedule/all`, { credentials: 'include' }).then(r => r.json())

// Save one day of the doctor's own schedule
export const saveMyScheduleDay = (payload) =>
  fetch(`${BASE}/schedule`, {
    method: 'PUT', credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  }).then(r => r.json())