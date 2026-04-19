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
