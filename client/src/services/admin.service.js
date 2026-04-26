// client/src/services/admin.service.js

const BASE = '/api/admin'

const requestJson = async (url, options = {}) => {
  const res = await fetch(url, { credentials: 'include', ...options })
  const data = await res.json()
  if (!res.ok) throw new Error(data.message || 'Request failed.')
  return data
}

export const getDashboard = () =>
  fetch(`${BASE}/dashboard`, { credentials: 'include' }).then(r => r.json())

export const getAppointments = (params = '') =>
  fetch(`${BASE}/appointments${params}`, { credentials: 'include' }).then(r => r.json())

export const confirmAppointment = (id) =>
  fetch(`${BASE}/appointments/${id}/confirm`, { method: 'PATCH', credentials: 'include' }).then(r => r.json())

export const cancelAppointment = (id) =>
  fetch(`${BASE}/appointments/${id}/cancel`, { method: 'PATCH', credentials: 'include' }).then(r => r.json())

export const markAppointmentNoShow = (id) =>
  fetch(`${BASE}/appointments/${id}/no-show`, { method: 'PATCH', credentials: 'include' }).then(r => r.json())

export const rescheduleAppointment = (id, payload) =>
  fetch(`${BASE}/appointments/${id}/reschedule`, {
    method: 'PATCH', credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  }).then(r => r.json())

export const createAppointment = (payload) =>
  requestJson(`${BASE}/appointments`, {
    method: 'POST', credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  })

export const getStaff = () =>
  fetch(`${BASE}/staff`, { credentials: 'include' }).then(r => r.json())

export const createStaff = (payload) =>
  requestJson(`${BASE}/staff`, {
    method: 'POST', credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  })

export const updateStaff = (id, payload) =>
  requestJson(`${BASE}/staff/${id}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  })

export const toggleStaff = (id) =>
  fetch(`${BASE}/staff/${id}/toggle`, { method: 'PATCH', credentials: 'include' }).then(r => r.json())

export const getDoctors = () =>
  fetch(`${BASE}/doctors`, { credentials: 'include' }).then(r => r.json())

export const createDoctor = (payload) =>
  requestJson(`${BASE}/doctors`, {
    method: 'POST', credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  })

export const updateDoctor = (id, payload) =>
  requestJson(`${BASE}/doctors/${id}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  })

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

export const getInventoryLogs = (params = {}) => {
  const search = new URLSearchParams()
  Object.entries(params).forEach(([key, value]) => {
    if (value !== undefined && value !== null && value !== '') {
      search.set(key, value)
    }
  })
  const query = search.toString()
  return requestJson(`${BASE}/inventory/logs${query ? `?${query}` : ''}`)
}

export const updateStock = (id, payload) =>
  requestJson(`${BASE}/inventory/${id}/stock`, {
    method: 'PATCH', credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  })

export const addInventoryItem = (payload) =>
  requestJson(`${BASE}/inventory`, {
    method: 'POST', credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  })

// FIX 5: Edit inventory item (name, category, unit, threshold, price, supplier)
export const updateInventoryItem = (id, payload) =>
  requestJson(`${BASE}/inventory/${id}`, {
    method: 'PUT', credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  })

// FIX 5: Delete inventory item
export const deleteInventoryItem = (id) =>
  fetch(`${BASE}/inventory/${id}`, {
    method: 'DELETE', credentials: 'include',
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

export const createWalkInPatient = (payload) =>
  requestJson(`${BASE}/patients/walk-in`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  })

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
