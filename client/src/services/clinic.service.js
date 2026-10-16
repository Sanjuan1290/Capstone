export const getClinicSettings = async () => {
  const res = await fetch('/api/auth/clinic-settings')
  const data = await res.json()
  if (!res.ok) throw new Error(data.message || 'Failed to load clinic settings.')
  return data
}



