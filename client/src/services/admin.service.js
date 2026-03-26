const BASE = '/api/admin'

export const getDashboard = () =>
  fetch(`${BASE}/dashboard`, { credentials: 'include' }).then(r => r.json())

export const getAppointments = (params = '') =>
  fetch(`${BASE}/appointments${params}`, { credentials: 'include' }).then(r => r.json())

export const confirmAppointment = (id) =>
  fetch(`${BASE}/appointments/${id}/confirm`, { method: 'PATCH', credentials: 'include' }).then(r => r.json())

export const cancelAppointment = (id) =>
  fetch(`${BASE}/appointments/${id}/cancel`, { method: 'PATCH', credentials: 'include' }).then(r => r.json())

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