import { makeSecurityScanError, waitForSecurityScan } from './cloudinaryScan'
// client/src/services/admin.service.js

const getAdminApiBase = () => (typeof window !== 'undefined' && (window.location.pathname.startsWith('/staff') || sessionStorage.getItem('auth_role') === 'staff') ? '/api/staff/admin-access' : '/api/admin')

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

export const getDashboard = () => requestJson(`${getAdminApiBase()}/dashboard`)

export const getAppointments = (params = '') => requestJson(`${getAdminApiBase()}/appointments${params}`)

export const confirmAppointment = (id, payload = {}) =>
  requestJson(`${getAdminApiBase()}/appointments/${id}/confirm`, {
    method: 'PATCH',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  })

export const cancelAppointment = (id) => requestJson(`${getAdminApiBase()}/appointments/${id}/cancel`, { method: 'PATCH' })

export const markAppointmentNoShow = (id) => requestJson(`${getAdminApiBase()}/appointments/${id}/no-show`, { method: 'PATCH' })

export const rescheduleAppointment = (id, payload) =>
  requestJson(`${getAdminApiBase()}/appointments/${id}/reschedule`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  })

export const createAppointment = (payload) =>
  requestJson(`${getAdminApiBase()}/appointments`, {
    method: 'POST', credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  })

export const getAppointmentReasons = () =>
  requestJson(`${getAdminApiBase()}/appointment-reasons`)

export const createAppointmentReason = (payload) =>
  requestJson(`${getAdminApiBase()}/appointment-reasons`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  })

export const updateAppointmentReason = (id, payload) =>
  requestJson(`${getAdminApiBase()}/appointment-reasons/${id}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  })

export const deleteAppointmentReason = (id) =>
  requestJson(`${getAdminApiBase()}/appointment-reasons/${id}`, {
    method: 'DELETE',
  })

export const getBills = (params = {}) => {
  const search = new URLSearchParams()
  Object.entries(params).forEach(([key, value]) => { if (value !== undefined && value !== null && value !== '') search.set(key, value) })
  const query = search.toString()
  return requestJson(`${getAdminApiBase()}/billing${query ? `?${query}` : ''}`)
}

export const getBillById = (id) => requestJson(`${getAdminApiBase()}/billing/${id}`)
export const getBillingReconciliation = (date = '') => requestJson(`${getAdminApiBase()}/billing/reconciliation${date ? `?date=${encodeURIComponent(date)}` : ''}`)
export const voidBillingPayment = (paymentId, payload) => requestJson(`${getAdminApiBase()}/billing/payments/${paymentId}/void`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) })
export const refundBillingPayment = (paymentId, payload) => requestJson(`${getAdminApiBase()}/billing/payments/${paymentId}/refund`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) })
export const confirmBillingPaymentAction = (paymentId, code) => requestJson(`${getAdminApiBase()}/billing/payments/${paymentId}/action/confirm`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ code }) })
export const getBillingAdjustmentRequests = (params = {}) => {
  const search = new URLSearchParams()
  Object.entries(params).forEach(([key, value]) => { if (value !== undefined && value !== null && value !== '') search.set(key, value) })
  const query = search.toString()
  return requestJson(`${getAdminApiBase()}/billing/adjustment-requests${query ? `?${query}` : ''}`)
}
export const resolveBillingAdjustmentRequest = (id, payload) => requestJson(`${getAdminApiBase()}/billing/adjustment-requests/${id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) })

export const getDiscountPresets = () => requestJson(`${getAdminApiBase()}/billing/discount-presets`)
export const saveDiscountPreset = (payload, id = null) => requestJson(`${getAdminApiBase()}/billing/discount-presets${id ? `/${id}` : ''}`, { method: id ? 'PUT' : 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) })

export const getBillingCatalog = (params = {}) => {
  const search = new URLSearchParams()
  if (params.clinicType) search.set('clinic_type', params.clinicType)
  if (params.includeInactive) search.set('include_inactive', '1')
  const query = search.toString()
  return requestJson(`${getAdminApiBase()}/billing/catalog${query ? `?${query}` : ''}`)
}

export const createBillingCatalogService = (payload) =>
  requestJson(`${getAdminApiBase()}/billing/catalog`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  })

export const updateBillingCatalogService = (id, payload) =>
  requestJson(`${getAdminApiBase()}/billing/catalog/${id}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  })

export const deleteBillingCatalogService = (id) =>
  requestJson(`${getAdminApiBase()}/billing/catalog/${id}`, {
    method: 'DELETE',
  })

export const getBillingPaymentSettings = () =>
  requestJson(`${getAdminApiBase()}/billing/payment-settings`)

const uploadPaymentQrToServer = async (file, provider, scanMode = 'scan', bypassToken = '') => {
  const params = new URLSearchParams({ provider, scan_mode: scanMode })
  if (bypassToken) params.set('bypass_token', bypassToken)
  const response = await fetch(`${getAdminApiBase()}/billing/payment-settings/upload?${params}`, {
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
  requestJson(`${getAdminApiBase()}/billing/payment-settings/upload-status`, {
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
  requestJson(`${getAdminApiBase()}/billing/payment-settings`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  })

export const getStaff = () =>
  requestJson(`${getAdminApiBase()}/staff`)

export const createStaff = (payload) =>
  requestJson(`${getAdminApiBase()}/staff`, {
    method: 'POST', credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  })

export const updateStaff = (id, payload) =>
  requestJson(`${getAdminApiBase()}/staff/${id}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  })

export const toggleStaff = (id) =>
  requestJson(`${getAdminApiBase()}/staff/${id}/toggle`, { method: 'PATCH' })

export const getDoctors = () =>
  requestJson(`${getAdminApiBase()}/doctors`)

export const createDoctor = (payload) =>
  requestJson(`${getAdminApiBase()}/doctors`, {
    method: 'POST', credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  })

export const updateDoctor = (id, payload) =>
  requestJson(`${getAdminApiBase()}/doctors/${id}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  })

export const toggleDoctor = (id) =>
  requestJson(`${getAdminApiBase()}/doctors/${id}/toggle`, { method: 'PATCH' })

export const getDoctorSchedules = (doctorId) =>
  requestJson(`${getAdminApiBase()}/doctors/${doctorId}/schedules`)

export const saveDaySchedule = (doctorId, payload) =>
  requestJson(`${getAdminApiBase()}/doctors/${doctorId}/schedules`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  })

export const getDoctorUnavailableDates = (doctorId, params = {}) => {
  const search = new URLSearchParams()
  if (params.startDate) search.set('start_date', params.startDate)
  if (params.endDate) search.set('end_date', params.endDate)
  const query = search.toString()
  return requestJson(`${getAdminApiBase()}/doctors/${doctorId}/unavailable-dates${query ? `?${query}` : ''}`)
}

export const saveDoctorUnavailableDate = (doctorId, payload) =>
  requestJson(`${getAdminApiBase()}/doctors/${doctorId}/unavailable-dates`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  })

export const deleteDoctorUnavailableDate = (doctorId, date) =>
  requestJson(`${getAdminApiBase()}/doctors/${doctorId}/unavailable-dates/${encodeURIComponent(date)}`, {
    method: 'DELETE',
  })

export const getAuditLogs = (params = {}, options = {}) => { const search = new URLSearchParams(); Object.entries(params).forEach(([k,v]) => { if (v !== undefined && v !== null && v !== '') search.set(k,v) }); const q=search.toString(); return requestJson(`${getAdminApiBase()}/audit-logs${q ? `?${q}` : ''}`, options) }
export const getClinicSettings = () => requestJson(`${getAdminApiBase()}/clinic-settings`)
export const updateClinicSettings = (payload) => requestJson(`${getAdminApiBase()}/clinic-settings`, { method:'PUT', headers:{'Content-Type':'application/json'}, body:JSON.stringify(payload) })

export const recordReportExport = (payload = {}) => requestJson(`${getAdminApiBase()}/reports/export-audit`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) })

export const getReports = (params = {}) => {
  const normalized = typeof params === 'string' ? { period: params } : params
  const search = new URLSearchParams()
  if (normalized.period) search.set('period', normalized.period)
  if (normalized.startDate) search.set('start_date', normalized.startDate)
  if (normalized.endDate) search.set('end_date', normalized.endDate)
  const query = search.toString()
  return requestJson(`${getAdminApiBase()}/reports${query ? `?${query}` : ''}`)
}

export const getInventory = () =>
  requestJson(`${getAdminApiBase()}/inventory`)

export const getInventoryLogs = (params = {}) => {
  const search = new URLSearchParams()
  Object.entries(params).forEach(([key, value]) => {
    if (value !== undefined && value !== null && value !== '') {
      search.set(key, value)
    }
  })
  const query = search.toString()
  return requestJson(`${getAdminApiBase()}/inventory/logs${query ? `?${query}` : ''}`)
}

export const updateStock = (id, payload) =>
  requestJson(`${getAdminApiBase()}/inventory/${id}/stock`, {
    method: 'PATCH', credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  })

export const addInventoryItem = (payload) =>
  requestJson(`${getAdminApiBase()}/inventory`, {
    method: 'POST', credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  })

// FIX 5: Edit inventory item (name, category, unit, threshold, price, supplier)
export const updateInventoryItem = (id, payload) =>
  requestJson(`${getAdminApiBase()}/inventory/${id}`, {
    method: 'PUT', credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  })

// FIX 5: Delete inventory item
export const deleteInventoryItem = (id) =>
  requestJson(`${getAdminApiBase()}/inventory/${id}`, {
    method: 'DELETE', credentials: 'include',
  })

export const getSupplyRequests = () =>
  requestJson(`${getAdminApiBase()}/supply-requests`)

export const resolveSupplyRequest = (id, status, note = '') =>
  requestJson(`${getAdminApiBase()}/supply-requests/${id}`, {
    method: 'PATCH', credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ status, note }),
  })

export const getPatients = (search = '') =>
  requestJson(`${getAdminApiBase()}/patients?search=${encodeURIComponent(search)}`)

export const getPatientRecord = (id) =>
  requestJson(`${getAdminApiBase()}/patients/${id}`)

export const createWalkInPatient = (payload) =>
  requestJson(`${getAdminApiBase()}/patients/walk-in`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  })

export const getQueue = (date = '') =>
  requestJson(`${getAdminApiBase()}/queue${date ? `?date=${encodeURIComponent(date)}` : ''}`)

export const getQueuePrecheck = (patientId) => requestJson(`${getAdminApiBase()}/queue/precheck/${patientId}`)

export const addToQueue = (payload) =>
  requestJson(`${getAdminApiBase()}/queue`, {
    method: 'POST', credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  })

export const updateQueueStatus = (id, status) =>
  requestJson(`${getAdminApiBase()}/queue/${id}/status`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ status }),
  })

export const getInventoryMasterData = (category = '') => requestJson(`${getAdminApiBase()}/inventory/master-data${category ? `?category=${encodeURIComponent(category)}` : ''}`)
export const createInventoryLocation = (payload) => requestJson(`${getAdminApiBase()}/inventory/locations`, { method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify(payload) })
export const createInventorySupplier = (payload) => requestJson(`${getAdminApiBase()}/inventory/suppliers`, { method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify(payload) })

export const getSystemSetup = () => requestJson(`${getAdminApiBase()}/system-setup`)
export const saveBillingServiceCategory = (payload, id = null) => requestJson(`${getAdminApiBase()}/system-setup/service-categories${id ? `/${id}` : ''}`, { method: id ? 'PUT' : 'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify(payload) })
export const deleteBillingServiceCategory = (id) => requestJson(`${getAdminApiBase()}/system-setup/service-categories/${id}`, { method:'DELETE' })
export const saveInventoryUom = (payload, id = null) => requestJson(`${getAdminApiBase()}/system-setup/uoms${id ? `/${id}` : ''}`, { method: id ? 'PUT' : 'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify(payload) })
export const deleteInventoryUom = (id) => requestJson(`${getAdminApiBase()}/system-setup/uoms/${id}`, { method:'DELETE' })
export const saveInventorySupplier = (payload, id = null) => requestJson(`${getAdminApiBase()}/system-setup/suppliers${id ? `/${id}` : ''}`, { method: id ? 'PUT' : 'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify(payload) })
export const saveInventoryLocationType = (payload, id = null) => requestJson(`${getAdminApiBase()}/system-setup/location-types${id ? `/${id}` : ''}`, { method: id ? 'PUT' : 'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify(payload) })
export const saveInventoryMovementReason = (payload, id = null) => requestJson(`${getAdminApiBase()}/system-setup/movement-reasons${id ? `/${id}` : ''}`, { method: id ? 'PUT' : 'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify(payload) })
export const getInventoryLocations = () => requestJson(`${getAdminApiBase()}/inventory/locations`)
export const updateInventoryLocation = (id,payload) => requestJson(`${getAdminApiBase()}/inventory/locations/${id}`, { method:'PUT', headers:{'Content-Type':'application/json'}, body:JSON.stringify(payload) })
export const deleteInventoryLocation = (id) => requestJson(`${getAdminApiBase()}/inventory/locations/${id}`, { method:'DELETE' })
export const getAuditArchives = (params = {}) => { const q=new URLSearchParams();Object.entries(params).forEach(([k,v])=>{if(v!==undefined&&v!==null&&v!=='')q.set(k,v)});return requestJson(`${getAdminApiBase()}/audit-logs/archive${q.toString()?`?${q}`:''}`) }
export const createAuditArchive = () => requestJson(`${getAdminApiBase()}/audit-logs/archive`, { method:'POST' })
export const getAuditArchiveDetail = (id,params={}) => { const q=new URLSearchParams();Object.entries(params).forEach(([k,v])=>{if(v!==undefined&&v!==null&&v!=='')q.set(k,v)});return requestJson(`${getAdminApiBase()}/audit-logs/archive/${id}${q.toString()?`?${q}`:''}`) }
export const deleteAuditArchive = (id,payload) => requestJson(`${getAdminApiBase()}/audit-logs/archive/${id}`, { method:'DELETE', headers:{'Content-Type':'application/json'}, body:JSON.stringify(payload) })


// Admin Checkout uses the same protected billing lifecycle as Staff, with direct Admin authority.
export const getAdminCheckoutBills = (params = {}) => {
  const search = new URLSearchParams()
  Object.entries(params || {}).forEach(([key,value]) => { if(value !== undefined && value !== null && value !== '') search.set(key,value) })
  return requestJson(`${getAdminApiBase()}/billing${search.toString() ? `?${search}` : ''}`)
}
export const getAdminCheckoutBill = (id) => requestJson(`${getAdminApiBase()}/billing/${id}`)
export const updateAdminCheckoutBill = (id,payload) => requestJson(`${getAdminApiBase()}/billing/${id}`, { method:'PUT', headers:{'Content-Type':'application/json'}, body:JSON.stringify(payload) })
export const getAdminFinalizePreview = (id) => requestJson(`${getAdminApiBase()}/billing/${id}/finalize-preview`)
export const finalizeAdminCheckoutBill = (id,expectedVersion) => requestJson(`${getAdminApiBase()}/billing/${id}/finalize`, { method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify({expected_version:expectedVersion}) })
export const payAdminCheckoutBill = (id,payload) => requestJson(`${getAdminApiBase()}/billing/${id}/pay`, { method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify(payload) })
export const getAdminBillAdjustmentRequests = (id) => requestJson(`${getAdminApiBase()}/billing/${id}/adjustment-requests`)
export const getAdminDiscountPresets = () => requestJson(`${getAdminApiBase()}/billing/discount-presets`)

export const getAdminCheckoutCatalog = (clinicType='') => getBillingCatalog({ clinicType })

export const requestInventoryBatchActionCode = (batchId, payload) =>
  requestJson(`${getAdminApiBase()}/inventory/batches/${batchId}/action/request-code`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  })

export const confirmInventoryBatchAction = (batchId, code) =>
  requestJson(`${getAdminApiBase()}/inventory/batches/${batchId}/action/confirm`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ code }),
  })

export const getInventoryBatchHistory = (batchId) =>
  requestJson(`${getAdminApiBase()}/inventory/batches/${batchId}/history`)
