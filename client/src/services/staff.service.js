// client/src/services/staff.service.js
const BASE = '/api/staff'

export const getDashboard = () =>
  fetch(`${BASE}/dashboard`, { credentials: 'include' }).then(r => r.json())

// Alias — Staff_Dashboard.jsx imports this name
export const getDashboardStats = getDashboard

export const getAppointments = (dateOrParams = '') => {
  const query = dateOrParams
    ? (String(dateOrParams).startsWith('?') ? dateOrParams : `?date=${dateOrParams}`)
    : ''
  return fetch(`${BASE}/appointments${query}`, { credentials: 'include' }).then(r => r.json())
}

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

export const getPatients = (search = '') =>
  fetch(`${BASE}/patients?search=${encodeURIComponent(search)}`, { credentials: 'include' }).then(r => r.json())

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

export const addInventoryItem = (payload) =>
  fetch(`${BASE}/inventory`, {
    method: 'POST', credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  }).then(r => r.json())

// FIX 2: Edit inventory item
export const updateInventoryItem = (id, payload) =>
  fetch(`${BASE}/inventory/${id}`, {
    method: 'PUT', credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  }).then(r => r.json())

// FIX 2: Delete inventory item
export const deleteInventoryItem = (id) =>
  fetch(`${BASE}/inventory/${id}`, {
    method: 'DELETE', credentials: 'include',
  }).then(r => r.json())

export const getDoctors = () =>
  fetch(`${BASE}/doctors`, { credentials: 'include' }).then(r => r.json())

export const getSupplyRequests = () =>
  fetch(`${BASE}/supply-requests`, { credentials: 'include' }).then(r => r.json())

export const resolveSupplyRequest = (id, status) =>
  fetch(`${BASE}/supply-requests/${id}`, {
    method: 'PATCH', credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ status }),
  }).then(r => r.json())