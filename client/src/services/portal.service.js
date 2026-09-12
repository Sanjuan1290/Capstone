import { makeSecurityScanError, waitForSecurityScan } from './cloudinaryScan'
const request = async (role, path = '', options = {}) => {
  const res = await fetch(`/api/${role}${path}`, {
    credentials: 'include',
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...(options.headers || {}),
    },
  })

  const data = await res.json()
  if (!res.ok) throw new Error(data.message || 'Request failed')
  return data
}

export const getNotifications = (role) => request(role, '/notifications')
export const markNotificationRead = (role, id) => request(role, `/notifications/${id}/read`, { method: 'PATCH' })
export const readAllNotifications = (role) => request(role, '/notifications/read-all', { method: 'PATCH' })
export const getSettings = (role) => request(role, '/settings', { headers: {} })
export const updateSettings = (role, payload) => request(role, '/settings', { method: 'PUT', body: JSON.stringify(payload) })

export const uploadToCloudinary = async (file) => {
  const cloudName = import.meta.env.VITE_CLOUDINARY_CLOUD_NAME
  const uploadPreset = import.meta.env.VITE_CLOUDINARY_UPLOAD_PRESET

  if (!cloudName || !uploadPreset) {
    throw new Error('Cloudinary is not configured yet.')
  }

  const formData = new FormData()
  formData.append('file', file)
  formData.append('upload_preset', uploadPreset)

  const res = await fetch(`https://api.cloudinary.com/v1_1/${cloudName}/image/upload`, {
    method: 'POST',
    body: formData,
  })
  const data = await res.json()
  if (!res.ok) throw new Error(data.error?.message || 'Cloudinary upload failed')
  return data.secure_url
}

export const requestPatientPhoneChangeCode = (phone) =>
  request('patient', '/security/phone/request-code', {
    method: 'POST',
    body: JSON.stringify({ phone }),
  })

export const confirmPatientPhoneChange = (code) =>
  request('patient', '/security/phone/change', {
    method: 'POST',
    body: JSON.stringify({ code }),
  })

export const getClinicalImageScanStatus = async (appointmentId, assetId, scanToken) => {
  const response = await fetch('/api/doctor/uploads/clinical/status', {
    method: 'POST',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ appointment_id: appointmentId, asset_id: assetId, scan_token: scanToken }),
  })
  const data = await response.json()
  if (!response.ok) throw new Error(data.message || 'Could not check the clinical image security scan.')
  return data
}

const uploadClinicalImageToServer = async (file, appointmentId, scanMode = 'scan', bypassToken = '') => {
  const params = new URLSearchParams({ appointment_id: String(appointmentId), scan_mode: scanMode })
  if (bypassToken) params.set('bypass_token', bypassToken)
  const response = await fetch(`/api/doctor/uploads/clinical?${params}`, {
    method: 'POST',
    credentials: 'include',
    headers: {
      'Content-Type': file.type,
      'X-File-Name': file.name || 'clinical-image',
    },
    body: file,
  })
  const data = await response.json()
  if (!response.ok) throw new Error(data.message || 'Clinical image upload failed.')
  return data
}

export const uploadClinicalImageSigned = async (file, appointmentId, { scanMode = 'scan', bypassToken = '', onStatus } = {}) => {
  if (!file) throw new Error('Select an image to upload.')
  if (!appointmentId) throw new Error('A valid appointment is required before uploading a clinical image.')
  if (!['image/png', 'image/jpeg', 'image/webp'].includes(String(file.type || '').toLowerCase())) {
    throw new Error('Clinical image must be PNG, JPG, or WEBP.')
  }
  if (Number(file.size || 0) > 10 * 1024 * 1024) throw new Error('Clinical images must be 10 MB or smaller.')

  onStatus?.({ phase: 'uploading', tone: 'info', message: scanMode === 'bypass' ? 'Uploading trusted image without malware scanning…' : 'Uploading image securely…' })
  const uploaded = await uploadClinicalImageToServer(file, appointmentId, scanMode, bypassToken)

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
      () => getClinicalImageScanStatus(appointmentId, uploaded.asset_id, uploaded.scan_token),
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



