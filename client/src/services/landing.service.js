export const getPublicLandingPage = async () => {
  const res = await fetch('/api/auth/landing-page')
  const data = await res.json()
  if (!res.ok) throw new Error(data.message || 'Failed to load landing page.')
  return data
}

const getLandingAdminBase = () => (typeof window !== 'undefined' && (window.location.pathname.startsWith('/staff') || sessionStorage.getItem('auth_role') === 'staff') ? '/api/staff/admin-access' : '/api/admin')

export const getAdminLandingPage = async () => {
  const res = await fetch(`${getLandingAdminBase()}/landing-page`, { credentials: 'include' })
  const data = await res.json()
  if (!res.ok) throw new Error(data.message || 'Failed to load landing page.')
  return data
}

export const saveAdminLandingPage = async (payload) => {
  const res = await fetch(`${getLandingAdminBase()}/landing-page`, {
    method: 'PUT',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  })
  const data = await res.json()
  if (!res.ok) throw new Error(data.message || 'Failed to save landing page.')
  return data
}
