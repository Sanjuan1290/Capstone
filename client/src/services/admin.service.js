import { makeSecurityScanError, waitForSecurityScan } from './cloudinaryScan'
// client/src/services/admin.service.js

const BASE = '/api/admin'

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

export const getAppointments = (params = '') =>
  fetch(`${BASE}/appointments${params}`, { credentials: 'include' }).then(r => r.json())

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

export const getAppointmentReasons = () =>
  requestJson(`${BASE}/appointment-reasons`)

export const createAppointmentReason = (payload) =>
  requestJson(`${BASE}/appointment-reasons`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  })

export const updateAppointmentReason = (id, payload) =>
  requestJson(`${BASE}/appointment-reasons/${id}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  })

export const deleteAppointmentReason = (id) =>
  requestJson(`${BASE}/appointment-reasons/${id}`, {
    method: 'DELETE',
  })

export const getBills = (params = {}) => {
  const search = new URLSearchParams()
  Object.entries(params).forEach(([key, value]) => { if (value !== undefined && value !== null && value !== '') search.set(key, value) })
  const query = search.toString()
  return requestJson(`${BASE}/billing${query ? `?${query}` : ''}`)
}

export const getBillById = (id) => requestJson(`${BASE}/billing/${id}`)
export const getBillingReconciliation = (date = '') => requestJson(`${BASE}/billing/reconciliation${date ? `?date=${encodeURIComponent(date)}` : ''}`)
export const reopenCashierShift = (id, reason) => requestJson(`${BASE}/billing/cashier-closings/${id}/reopen`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ reason }) })
export const voidBillingPayment = (paymentId, reason) => requestJson(`${BASE}/billing/payments/${paymentId}/void`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ reason }) })
export const refundBillingPayment = (paymentId, payload) => requestJson(`${BASE}/billing/payments/${paymentId}/refund`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) })
export const getBillingAdjustmentRequests = (params = {}) => {
  const search = new URLSearchParams()
  Object.entries(params).forEach(([key, value]) => { if (value !== undefined && value !== null && value !== '') search.set(key, value) })
  const query = search.toString()
  return requestJson(`${BASE}/billing/adjustment-requests${query ? `?${query}` : ''}`)
}
export const resolveBillingAdjustmentRequest = (id, payload) => requestJson(`${BASE}/billing/adjustment-requests/${id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) })

export const getDiscountPresets = () => requestJson(`${BASE}/billing/discount-presets`)
export const saveDiscountPreset = (payload, id = null) => requestJson(`${BASE}/billing/discount-presets${id ? `/${id}` : ''}`, { method: id ? 'PUT' : 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) })

export const getBillingCatalog = (params = {}) => {
  const search = new URLSearchParams()
  if (params.clinicType) search.set('clinic_type', params.clinicType)
  if (params.includeInactive) search.set('include_inactive', '1')
  const query = search.toString()
  return requestJson(`${BASE}/billing/catalog${query ? `?${query}` : ''}`)
}

export const createBillingCatalogService = (payload) =>
  requestJson(`${BASE}/billing/catalog`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  })

export const updateBillingCatalogService = (id, payload) =>
  requestJson(`${BASE}/billing/catalog/${id}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  })

export const deleteBillingCatalogService = (id) =>
  requestJson(`${BASE}/billing/catalog/${id}`, {
    method: 'DELETE',
  })

export const getBillingPaymentSettings = () =>
  requestJson(`${BASE}/billing/payment-settings`)

const uploadPaymentQrToServer = async (file, provider, scanMode = 'scan', bypassToken = '') => {
  const params = new URLSearchParams({ provider, scan_mode: scanMode })
  if (bypassToken) params.set('bypass_token', bypassToken)
  const response = await fetch(`${BASE}/billing/payment-settings/upload?${params}`, {
    method: 'POST',
    credentials: 'include',
    headers: {
      'Content-Type': file.type,
      'X-File-Name': file.name || `${provider}-qr`,
    },
    body: file,
  })
  const data = await response.json()
  if (!response.ok) throw new Error(data.message || 'QR image upload failed.')
  return data
}

export const getPaymentQrUploadScanStatus = (provider, assetId, scanToken) =>
  requestJson(`${BASE}/billing/payment-settings/upload-status`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ provider, asset_id: assetId, scan_token: scanToken }),
  })

export const uploadPaymentQrImage = async (file, provider, { scanMode = 'scan', bypassToken = '', onStatus } = {}) => {
  if (!file) throw new Error('Select an image to upload.')
  if (!['image/png', 'image/jpeg', 'image/webp'].includes(file.type)) {
    throw new Error('QR image must be PNG, JPG, or WEBP.')
  }
  if (file.size > 5 * 1024 * 1024) {
    throw new Error('QR image must be 5 MB or smaller.')
  }

  onStatus?.({ phase: 'uploading', tone: 'info', message: scanMode === 'bypass' ? 'Uploading trusted image without malware scanning…' : 'Uploading image securely…' })
  const uploaded = await uploadPaymentQrToServer(file, provider, scanMode, bypassToken)

  if (uploaded.status === 'unavailable') {
    const limitReached = uploaded.reason === 'usage_limit_reached'
    throw makeSecurityScanError(
      limitReached ? 'SCAN_LIMIT_REACHED' : 'SCAN_UNAVAILABLE',
      uploaded.message || 'The malware scanner is currently unavailable.',
      { reason: uploaded.reason, bypass_token: uploaded.bypass_token }
    )
  }

  if (scanMode === 'bypass' || uploaded.status === 'bypassed') {
    onStatus?.({ phase: 'bypassed', tone: 'warning', message: 'Uploaded without malware scanning.' })
    return uploaded
  }

  if (!uploaded.asset_id || !uploaded.scan_token) throw new Error('The server did not return scan verification for this upload.')
  try {
    const scan = await waitForSecurityScan(
      () => getPaymentQrUploadScanStatus(provider, uploaded.asset_id, uploaded.scan_token),
      { onStatus }
    )
    return {
      url: scan.secure_url || uploaded.url,
      scan_status: 'approved',
      asset_id: uploaded.asset_id,
      public_id: scan.public_id || uploaded.public_id,
      security_token: scan.security_token,
      scan_token: uploaded.scan_token,
    }
  } catch (error) {
    error.asset_id = uploaded.asset_id
    error.public_id = uploaded.public_id
    error.url = uploaded.url
    error.scan_token = uploaded.scan_token
    throw error
  }
}

export const updateBillingPaymentSettings = (payload) =>
  requestJson(`${BASE}/billing/payment-settings`, {
    method: 'PUT',
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

export const getDoctorUnavailableDates = (doctorId, params = {}) => {
  const search = new URLSearchParams()
  if (params.startDate) search.set('start_date', params.startDate)
  if (params.endDate) search.set('end_date', params.endDate)
  const query = search.toString()
  return requestJson(`${BASE}/doctors/${doctorId}/unavailable-dates${query ? `?${query}` : ''}`)
}

export const saveDoctorUnavailableDate = (doctorId, payload) =>
  requestJson(`${BASE}/doctors/${doctorId}/unavailable-dates`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  })

export const deleteDoctorUnavailableDate = (doctorId, date) =>
  requestJson(`${BASE}/doctors/${doctorId}/unavailable-dates/${encodeURIComponent(date)}`, {
    method: 'DELETE',
  })

export const getAuditLogs = (params = {}) => { const search = new URLSearchParams(); Object.entries(params).forEach(([k,v]) => { if (v !== undefined && v !== null && v !== '') search.set(k,v) }); const q=search.toString(); return requestJson(`${BASE}/audit-logs${q ? `?${q}` : ''}`) }
export const getClinicSettings = () => requestJson(`${BASE}/clinic-settings`)
export const updateClinicSettings = (payload) => requestJson(`${BASE}/clinic-settings`, { method:'PUT', headers:{'Content-Type':'application/json'}, body:JSON.stringify(payload) })

export const recordReportExport = (payload = {}) => requestJson(`${BASE}/reports/export-audit`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) })

export const getReports = (params = {}) => {
  const normalized = typeof params === 'string' ? { period: params } : params
  const search = new URLSearchParams()
  if (normalized.period) search.set('period', normalized.period)
  if (normalized.startDate) search.set('start_date', normalized.startDate)
  if (normalized.endDate) search.set('end_date', normalized.endDate)
  const query = search.toString()
  return requestJson(`${BASE}/reports${query ? `?${query}` : ''}`)
}

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

export const resolveSupplyRequest = (id, status, note = '') =>
  requestJson(`${BASE}/supply-requests/${id}`, {
    method: 'PATCH', credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ status, note }),
  })

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



