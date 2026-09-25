// client/src/services/staff.service.js
const BASE = '/api/staff'

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

// Alias — Staff_Dashboard.jsx imports this name
export const getDashboardStats = getDashboard

export const getAppointments = (dateOrParams = '') => {
  const query = dateOrParams
    ? (String(dateOrParams).startsWith('?') ? dateOrParams : `?date=${dateOrParams}`)
    : ''
  return requestJson(`${BASE}/appointments${query}`)
}

export const confirmAppointment = (id, payload = {}) =>
  requestJson(`${BASE}/appointments/${id}/confirm`, {
    method: 'PATCH',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  })

export const cancelAppointment = (id) => requestJson(`${BASE}/appointments/${id}/cancel`, { method: 'PATCH' })

export const markAppointmentNoShow = (id) => requestJson(`${BASE}/appointments/${id}/no-show`, { method: 'PATCH' })

export const rescheduleAppointment = (id, payload) =>
  requestJson(`${BASE}/appointments/${id}/reschedule`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  })

export const createAppointment = (payload) =>
  requestJson(`${BASE}/appointments`, {
    method: 'POST', credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  })


export const getAppointmentReasons = (clinicType = '') => {
  const query = clinicType ? `?clinic_type=${encodeURIComponent(clinicType)}` : ''
  return requestJson(`${BASE}/appointment-reasons${query}`)
}

export const getWalkInAvailableDoctors = (clinicType) =>
  requestJson(`${BASE}/walk-in/doctors?clinic_type=${encodeURIComponent(clinicType || '')}`)

export const getQueue = (date) => requestJson(`${BASE}/queue${date ? `?date=${date}` : ''}`)

export const getQueuePrecheck = (patientId) => requestJson(`${BASE}/queue/precheck/${patientId}`)

export const addToQueue = (payload) =>
  requestJson(`${BASE}/queue`, {
    method: 'POST', credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  })

export const updateQueueStatus = (id, status) =>
  requestJson(`${BASE}/queue/${id}/status`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ status }),
  })

export const getPatients = (search = '') =>
  requestJson(`${BASE}/patients?search=${encodeURIComponent(search)}`)

export const createWalkInPatient = (payload) =>
  requestJson(`${BASE}/patients/walk-in`, {
    method: 'POST',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  })

export const getPatientRecord = (id) =>
  requestJson(`${BASE}/patients/${id}`)

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
  requestJson(`${BASE}/inventory`)

export const getInventoryMasterData = (category = '') =>
  requestJson(`${BASE}/inventory/master-data${category ? `?category=${encodeURIComponent(category)}` : ''}`)

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
  requestJson(`${BASE}/inventory/${id}`, {
    method: 'DELETE', credentials: 'include',
  })

export const getDoctors = () =>
  requestJson(`${BASE}/doctors`)

export const getDoctorSchedules = (doctorId) =>
  requestJson(`${BASE}/doctors/${doctorId}/schedules`)

export const getDoctorAvailability = (doctorId, { startDate = '', days = 14 } = {}) => {
  const search = new URLSearchParams()
  if (startDate) search.set('start_date', startDate)
  search.set('days', String(days))
  return requestJson(`${BASE}/doctors/${doctorId}/availability?${search.toString()}`)
}

export const getDoctorUnavailableDates = (doctorId, params = {}) => {
  const search = new URLSearchParams()
  if (params.startDate) search.set('start_date', params.startDate)
  if (params.endDate) search.set('end_date', params.endDate)
  const query = search.toString()
  return requestJson(`${BASE}/doctors/${doctorId}/unavailable-dates${query ? `?${query}` : ''}`)
}

export const getSupplyRequests = () =>
  requestJson(`${BASE}/supply-requests`)

export const resolveSupplyRequest = (id, status, note = '') =>
  requestJson(`${BASE}/supply-requests/${id}`, {
    method: 'PATCH', credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ status, note }),
  })

export const createInventoryLocation = (payload) => requestJson(`${BASE}/inventory/locations`, { method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify(payload) })
export const updateInventoryLocation = (id,payload) => requestJson(`${BASE}/inventory/locations/${id}`, { method:'PUT', headers:{'Content-Type':'application/json'}, body:JSON.stringify(payload) })

export const getInventoryLocations = () => requestJson(`${BASE}/inventory/locations`)


