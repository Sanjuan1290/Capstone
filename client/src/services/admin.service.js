// client/src/services/admin.service.js
// FIX: getInventory — admin controller returns { items, logs }.
// Updated all callers to destructure accordingly.
// All other endpoints are correct.

const BASE = '/api/admin'

export const getDashboard = () =>
  fetch(`${BASE}/dashboard`, { credentials: 'include' }).then(r => r.json())

export const getAppointments = (params = '') =>
  fetch(`${BASE}/appointments${params}`, { credentials: 'include' }).then(r => r.json())

export const confirmAppointment = (id) =>
  fetch(`${BASE}/appointments/${id}/confirm`, { method: 'PATCH', credentials: 'include' }).then(r => r.json())

export const cancelAppointment = (id) =>
  fetch(`${BASE}/appointments/${id}/cancel`, { method: 'PATCH', credentials: 'include' }).then(r => r.json())

export const rescheduleAppointment = (id, payload) =>
  fetch(`${BASE}/appointments/${id}/reschedule`, {
    method: 'PATCH', credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  }).then(r => r.json())

export const createAppointment = (payload) =>
  fetch(`${BASE}/appointments`, {
    method: 'POST', credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  }).then(r => r.json())

export const getStaff = () =>
  fetch(`${BASE}/staff`, { credentials: 'include' }).then(r => r.json())

export const createStaff = (payload) =>
  fetch(`${BASE}/staff`, {
    method: 'POST', credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  }).then(r => r.json())

export const toggleStaff = (id) =>
  fetch(`${BASE}/staff/${id}/toggle`, { method: 'PATCH', credentials: 'include' }).then(r => r.json())

export const getDoctors = () =>
  fetch(`${BASE}/doctors`, { credentials: 'include' }).then(r => r.json())

export const createDoctor = (payload) =>
  fetch(`${BASE}/doctors`, {
    method: 'POST', credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  }).then(r => r.json())

export const toggleDoctor = (id) =>
  fetch(`${BASE}/doctors/${id}/toggle`, { method: 'PATCH', credentials: 'include' }).then(r => r.json())

export const getDoctorSchedules = (doctorId) =>
  fetch(`${BASE}/doctors/${doctorId}/schedules`, { credentials: 'include' }).then(r => r.json())

export const saveDaySchedule = (doctorId, payload) =>
  fetch(`${BASE}/doctors/${doctorId}/schedules`, {
    method: 'PUT', credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  }).then(r => r.json())

export const getReports = (period) =>
  fetch(`${BASE}/reports?period=${period}`, { credentials: 'include' }).then(r => r.json())

// FIX: admin controller returns { items, logs } — extract items in the page component
export const getInventory = () =>
  fetch(`${BASE}/inventory`, { credentials: 'include' }).then(r => r.json())

export const updateStock = (id, payload) =>
  fetch(`${BASE}/inventory/${id}/stock`, {
    method: 'PATCH', credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  }).then(r => r.json())

export const addInventoryItem = (payload) =>
  fetch(`${BASE}/inventory`, {
    method: 'POST', credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  }).then(r => r.json())

export const getSupplyRequests = () =>
  fetch(`${BASE}/supply-requests`, { credentials: 'include' }).then(r => r.json())

export const resolveSupplyRequest = (id, status) =>
  fetch(`${BASE}/supply-requests/${id}`, {
    method: 'PATCH', credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ status }),
  }).then(r => r.json())

export const getPatients = (search = '') =>
  fetch(`${BASE}/patients?search=${encodeURIComponent(search)}`, { credentials: 'include' }).then(r => r.json())

export const getQueue = (date = '') =>
  fetch(`${BASE}/queue${date ? `?date=${date}` : ''}`, { credentials: 'include' }).then(r => r.json())

export const addToQueue = (payload) =>
  fetch(`${BASE}/queue`, {
    method: 'POST', credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  }).then(r => r.json())

export const updateQueueStatus = (id, status) =>
  fetch(`${BASE}/queue/${id}/status`, {
    method: 'PATCH', credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ status }),
  }).then(r => r.json())