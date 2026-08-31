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

export const uploadClinicalImageSigned = async (file, appointmentId) => {
  if (!file) throw new Error('Select an image to upload.')
  if (!appointmentId) throw new Error('A valid appointment is required before uploading a clinical image.')

  const signatureRes = await fetch('/api/doctor/uploads/clinical/signature', {
    method: 'POST',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ appointment_id: appointmentId }),
  })
  const signed = await signatureRes.json()
  if (!signatureRes.ok) throw new Error(signed.message || 'Could not authorize the clinical image upload.')

  const formData = new FormData()
  formData.append('file', file)
  formData.append('api_key', signed.api_key)
  formData.append('timestamp', String(signed.timestamp))
  formData.append('folder', signed.folder)
  formData.append('signature', signed.signature)

  const uploadRes = await fetch(`https://api.cloudinary.com/v1_1/${signed.cloud_name}/image/upload`, {
    method: 'POST',
    body: formData,
  })
  const uploaded = await uploadRes.json()
  if (!uploadRes.ok) throw new Error(uploaded.error?.message || 'Clinical image upload failed.')
  if (!uploaded.secure_url) throw new Error('Cloudinary did not return an image URL.')
  return uploaded.secure_url
}
