// client/src/services/doctor.service.js
const BASE = '/api/doctor'

const requestJson = async (url, options = {}) => {
  const res = await fetch(url, { credentials: 'include', ...options })
  const data = await res.json()
  if (!res.ok) {
    const reference = data.request_id ? ` Reference: ${data.request_id}` : ''
    const err = new Error(`${data.message || 'Request failed.'}${reference}`)
    Object.assign(err, data)
    throw err
  }
  return data
}

export const getDashboard = () => requestJson(`${BASE}/dashboard`)

export const getAppointments = (params = {}) => {
  const search = new URLSearchParams()
  if (params.scope) search.set('scope', params.scope)
  if (params.date) search.set('date', params.date)
  const query = search.toString()
  return requestJson(`${BASE}/appointments${query ? `?${query}` : ''}`)
}

export const getDailyAppointments = (date) => requestJson(`${BASE}/appointments/daily${date ? `?date=${date}` : ''}`)

export const startConsultation = (id) =>
  requestJson(`${BASE}/appointments/${id}/start`, { method: 'PATCH' })

export const saveConsultationDraft = (appointmentId, payload) =>
  requestJson(`${BASE}/consultations/${appointmentId}/draft`, {
    method: 'PUT', credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  })

export const finalizeConsultation = (appointmentId, payload) =>
  requestJson(`${BASE}/consultations/${appointmentId}/finalize`, {
    method: 'POST', credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  })

// Backwards-compatible alias for older callers. New code should use
// saveConsultationDraft() and finalizeConsultation() explicitly.
export const saveConsultation = finalizeConsultation

// NEW: fetch a saved consultation (works even after status = completed)
export const getConsultation = (appointmentId) =>
  requestJson(`${BASE}/consultations/${appointmentId}`)

// NEW: edit a saved consultation
export const updateConsultation = (appointmentId, payload) =>
  requestJson(`${BASE}/consultations/${appointmentId}`, {
    method: 'PATCH', credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  })

export const addConsultationAmendment = (appointmentId, payload) =>
  requestJson(`${BASE}/consultations/${appointmentId}/amendments`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  })

export const getBillingCatalog = (clinicType = '') =>
  requestJson(`${BASE}/billing/catalog${clinicType ? `?clinic_type=${encodeURIComponent(clinicType)}` : ''}`)

export const getPatientHistory = (patientId) => requestJson(`${BASE}/patients/${patientId}/history`)

export const getInventoryItems = () =>
  requestJson(`${BASE}/inventory`)

export const getInventoryLocations = () =>
  requestJson(`${BASE}/inventory/locations`)

export const getMyRequests = () =>
  requestJson(`${BASE}/requests`)

export const submitRequest = (payload) =>
  requestJson(`${BASE}/requests`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  })

// Doctors may only read their own schedule through the doctor-authenticated route.
export const getDoctorSchedule = () =>
  requestJson(`${BASE}/schedule`)

export const getMySchedule = () =>
  requestJson(`${BASE}/schedule`)

export const getMyScheduleAll = () =>
  requestJson(`${BASE}/schedule/all`)

export const saveMyScheduleDay = (payload) =>
  requestJson(`${BASE}/schedule`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  })

export const getMyUnavailableDates = (params = {}) => {
  const search = new URLSearchParams()
  if (params.startDate) search.set('start_date', params.startDate)
  if (params.endDate) search.set('end_date', params.endDate)
  const query = search.toString()
  return requestJson(`${BASE}/schedule/unavailable-dates${query ? `?${query}` : ''}`)
}

export const saveMyUnavailableDate = (payload) =>
  requestJson(`${BASE}/schedule/unavailable-dates`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  })

export const deleteMyUnavailableDate = (date) =>
  requestJson(`${BASE}/schedule/unavailable-dates/${encodeURIComponent(date)}`, {
    method: 'DELETE',
  })

// NEW: get today's walk-in queue for the logged-in doctor
export const getMyQueue = () =>
  requestJson(`${BASE}/queue`)

// NEW: mark current patient done and call next
export const callNextPatient = () =>
  requestJson(`${BASE}/queue/call-next`, { method: 'PATCH' })

// NEW: mark a specific queue entry as done
export const markQueueEntryDone = (id) =>
  requestJson(`${BASE}/queue/${id}/done`, { method: 'PATCH' })



