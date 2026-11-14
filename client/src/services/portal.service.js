import { uploadValidatedImage } from './imageUpload'
const request = async (role, path = '', options = {}) => {
  const apiRole = role === 'superadmin' ? 'admin' : role
  const notificationPath = role === 'admin' && path.startsWith('/notifications')
    ? `/api/branches/my${path}` : `/api/${apiRole}${path}`
  const res = await fetch(notificationPath, {
    credentials: 'include',
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...(role === 'superadmin' ? { 'X-Admin-Portal': 'superadmin' } : {}),
      ...(options.headers || {}),
    },
  })

  const contentType = res.headers.get('content-type') || ''
  if (!contentType.toLowerCase().includes('application/json')) throw new Error(res.status === 404 ? 'Settings endpoint is unavailable. Check the API server or proxy.' : 'Unable to load settings. The server did not return valid account information.')
  let data
  try { data = await res.json() } catch { throw new Error('Unable to read the server response. Please retry.') }
  if (!res.ok) {
    const reference = data.request_id ? ` Reference: ${data.request_id}` : ''
    const message = `${data.message || 'Request failed'}${reference}`
    throw Object.assign(new Error(message), data, { message, status: res.status })
  }
  return data
}

export const getNotifications = (role) => request(role, '/notifications')
export const getNotificationDestination = (role, id) => request(role, `/notifications/${id}/destination`)
export const markNotificationRead = (role, id) => request(role, `/notifications/${id}/read`, { method: 'PATCH' })
export const readAllNotifications = (role) => request(role, '/notifications/read-all', { method: 'PATCH' })
export const getSettings = (role) => request(role, '/settings', { headers: {} })
export const updateSettings = (role, payload) => request(role, '/settings', { method: 'PUT', body: JSON.stringify(payload) })

export const saveProfilePhoto = (role,url) => request(role,'/settings/profile-photo',{method:'PUT',body:JSON.stringify({profile_image_url:url})})
export const removeProfilePhoto = (role) => request(role,'/settings/profile-photo',{method:'DELETE'})

export const uploadToCloudinary = async (file) => {
  if (!file || !['image/jpeg','image/png','image/webp'].includes(file.type) || file.size > 5*1024*1024 || file.size===0) {
    throw new Error('Choose a JPG, PNG or WebP photo smaller than 5 MB.')
  }
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


export const requestPatientEmailVerificationCode = () =>
  request('patient', '/security/email/request-code', {
    method: 'POST',
  })

export const confirmPatientEmailVerification = (code) =>
  request('patient', '/security/email/verify', {
    method: 'POST',
    body: JSON.stringify({ code }),
  })

export const uploadClinicalImageSigned = (file,appointmentId,options={}) => {
  if(!Number(appointmentId))throw new Error('A valid appointment is required before uploading an image.')
  return uploadValidatedImage(file,`/api/doctor/uploads/clinical?${new URLSearchParams({appointment_id:String(appointmentId)})}`,{...options,maxBytes:10*1024*1024})
}
