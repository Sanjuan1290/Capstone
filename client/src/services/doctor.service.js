// client/src/services/doctor.service.js
const BASE = '/api/doctor'

export const getDoctors = () =>
  fetch(`${BASE}s`, { credentials: 'include' }).then(r => r.json())

export const getDashboard = () =>
  fetch(`${BASE}/dashboard`, { credentials: 'include' }).then(r => r.json())

export const getDailyAppointments = (date) =>
  fetch(`${BASE}/appointments/daily${date ? `?date=${date}` : ''}`, { credentials: 'include' }).then(r => r.json())

export const startConsultation = (id) =>
  fetch(`${BASE}/appointments/${id}/start`, { method: 'PATCH', credentials: 'include' }).then(r => r.json())

export const saveConsultation = (appointmentId, payload) =>
  fetch(`${BASE}/consultations/${appointmentId}`, {
    method: 'POST', credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  }).then(r => r.json())

// NEW: fetch a saved consultation (works even after status = completed)
export const getConsultation = (appointmentId) =>
  fetch(`${BASE}/consultations/${appointmentId}`, { credentials: 'include' }).then(r => r.json())

// NEW: edit a saved consultation
export const updateConsultation = (appointmentId, payload) =>
  fetch(`${BASE}/consultations/${appointmentId}`, {
    method: 'PATCH', credentials: 'include',
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

export const getDoctorSchedule = (doctorId) =>
  fetch(`/api/patient/doctors/${doctorId}/schedule`, { credentials: 'include' }).then(r => r.json())

export const getMySchedule = () =>
  fetch(`${BASE}/schedule`, { credentials: 'include' }).then(r => r.json())

export const getMyScheduleAll = () =>
  fetch(`${BASE}/schedule/all`, { credentials: 'include' }).then(r => r.json())

export const saveMyScheduleDay = (payload) =>
  fetch(`${BASE}/schedule`, {
    method: 'PUT', credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  }).then(r => r.json())

// NEW: get today's walk-in queue for the logged-in doctor
export const getMyQueue = () =>
  fetch(`${BASE}/queue`, { credentials: 'include' }).then(r => r.json())

// NEW: mark current patient done and call next
export const callNextPatient = () =>
  fetch(`${BASE}/queue/call-next`, { method: 'PATCH', credentials: 'include' }).then(r => r.json())

// NEW: mark a specific queue entry as done
export const markQueueEntryDone = (id) =>
  fetch(`${BASE}/queue/${id}/done`, { method: 'PATCH', credentials: 'include' }).then(r => r.json())