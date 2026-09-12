// client/src/services/staff.service.js
const BASE = '/api/staff'

const requestJson = async (url, options = {}) => {
  const res = await fetch(url, { credentials: 'include', ...options })
  const data = await res.json()
  if (!res.ok) {
    const err = new Error(data.message || 'Request failed.')
    Object.assign(err, data)
    throw err
  }
  return data
}

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

export const confirmAppointment = (id, payload = {}) =>
  requestJson(`${BASE}/appointments/${id}/confirm`, {
    method: 'PATCH',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  })

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

export const getQueue = (date) =>
  fetch(`${BASE}/queue${date ? `?date=${date}` : ''}`, { credentials: 'include' }).then(r => r.json())

export const getQueuePrecheck = (patientId) => requestJson(`${BASE}/queue/precheck/${patientId}`)

export const addToQueue = (payload) =>
  requestJson(`${BASE}/queue`, {
    method: 'POST', credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  })

export const updateQueueStatus = (id, status) =>
  fetch(`${BASE}/queue/${id}/status`, {
    method: 'PATCH', credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ status }),
  }).then(r => r.json())

export const getPatients = (search = '') =>
  fetch(`${BASE}/patients?search=${encodeURIComponent(search)}`, { credentials: 'include' }).then(r => r.json())

export const createWalkInPatient = (payload) =>
  requestJson(`${BASE}/patients/walk-in`, {
    method: 'POST',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  })

export const getPatientRecord = (id) =>
  fetch(`${BASE}/patients/${id}`, { credentials: 'include' }).then(r => r.json())

export const getBills = (params = {}) => {
  const normalized = typeof params === 'string' ? { status: params } : params
  const search = new URLSearchParams()
  Object.entries(normalized || {}).forEach(([key, value]) => {
    if (value !== undefined && value !== null && value !== '') search.set(key, value)
  })
  const query = search.toString()
  return requestJson(`${BASE}/billing${query ? `?${query}` : ''}`)
}

export const getBillingCatalog = (clinicType = '') => {
  const query = clinicType ? `?clinic_type=${encodeURIComponent(clinicType)}` : ''
  return requestJson(`${BASE}/billing/catalog${query}`)
}

export const getBillById = (id) =>
  requestJson(`${BASE}/billing/${id}`)

export const updateBill = (id, payload) =>
  requestJson(`${BASE}/billing/${id}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  })

export const getFinalizePreview = (id) =>
  requestJson(`${BASE}/billing/${id}/finalize-preview`)

export const finalizeBill = (id, expectedVersion) =>
  requestJson(`${BASE}/billing/${id}/finalize`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ expected_version: expectedVersion }),
  })

export const getDiscountPresets = () => requestJson(`${BASE}/billing/discount-presets`)

export const getBillingAdjustmentRequests = (id) => requestJson(`${BASE}/billing/${id}/adjustment-requests`)
export const requestBillingAdjustment = (id, payload) => requestJson(`${BASE}/billing/${id}/adjustment-requests`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) })
export const cancelBillingAdjustmentRequest = (id, requestId) => requestJson(`${BASE}/billing/${id}/adjustment-requests/${requestId}/cancel`, { method: 'PATCH' })

export const getCashierShiftStatus = () => requestJson(`${BASE}/billing/cashier-shift`)
export const closeCashierShift = (payload) => requestJson(`${BASE}/billing/cashier-close`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) })

export const confirmBillPayment = (id, payload) =>
  requestJson(`${BASE}/billing/${id}/confirm-payment`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  })

export const payBill = (id, payload) =>
  requestJson(`${BASE}/billing/${id}/pay`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  })

export const getBillingPaymentSettings = () =>
  requestJson(`${BASE}/billing-payment-settings`)

export const getInventory = () =>
  fetch(`${BASE}/inventory`, { credentials: 'include' }).then(r => r.json())

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

// FIX 2: Edit inventory item
export const updateInventoryItem = (id, payload) =>
  requestJson(`${BASE}/inventory/${id}`, {
    method: 'PUT', credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  })

// FIX 2: Delete inventory item
export const deleteInventoryItem = (id) =>
  fetch(`${BASE}/inventory/${id}`, {
    method: 'DELETE', credentials: 'include',
  }).then(r => r.json())

export const getDoctors = () =>
  fetch(`${BASE}/doctors`, { credentials: 'include' }).then(r => r.json())

export const getDoctorSchedules = (doctorId) =>
  fetch(`${BASE}/doctors/${doctorId}/schedules`, { credentials: 'include' }).then(r => r.json())

export const getDoctorUnavailableDates = (doctorId, params = {}) => {
  const search = new URLSearchParams()
  if (params.startDate) search.set('start_date', params.startDate)
  if (params.endDate) search.set('end_date', params.endDate)
  const query = search.toString()
  return requestJson(`${BASE}/doctors/${doctorId}/unavailable-dates${query ? `?${query}` : ''}`)
}

export const getSupplyRequests = () =>
  fetch(`${BASE}/supply-requests`, { credentials: 'include' }).then(r => r.json())

export const resolveSupplyRequest = (id, status, note = '') =>
  requestJson(`${BASE}/supply-requests/${id}`, {
    method: 'PATCH', credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ status, note }),
  })



