const BASE = '/api/staff'

export const getDashboardStats  = () =>
  fetch(`${BASE}/dashboard`, { credentials: 'include' }).then(r => r.json())

export const getAppointments = (date) =>
  fetch(`${BASE}/appointments${date ? `?date=${date}` : ''}`, { credentials: 'include' }).then(r => r.json())

export const confirmAppointment = (id) =>
  fetch(`${BASE}/appointments/${id}/confirm`, { method: 'PATCH', credentials: 'include' }).then(r => r.json())

export const cancelAppointment = (id) =>
  fetch(`${BASE}/appointments/${id}/cancel`, { method: 'PATCH', credentials: 'include' }).then(r => r.json())

export const getQueue = (date) =>
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

export const getPatients = (search) =>
  fetch(`${BASE}/patients${search ? `?search=${encodeURIComponent(search)}` : ''}`, { credentials: 'include' }).then(r => r.json())

export const getPatientRecord = (id) =>
  fetch(`${BASE}/patients/${id}`, { credentials: 'include' }).then(r => r.json())

export const getInventory = () =>
  fetch(`${BASE}/inventory`, { credentials: 'include' }).then(r => r.json())

export const updateStock = (id, payload) =>
  fetch(`${BASE}/inventory/${id}/stock`, {
    method: 'PATCH', credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  }).then(r => r.json())

export const getDoctors = () =>
  fetch(`${BASE}/doctors`, { credentials: 'include' }).then(r => r.json())