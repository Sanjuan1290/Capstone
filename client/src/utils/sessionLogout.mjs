const ENDPOINTS = {
  superadmin: '/api/admin/logout?portal=superadmin', admin: '/api/admin/logout',
  staff: '/api/staff/logout', doctor: '/api/doctor/logout', patient: '/api/patient/logout',
}

// Clear local identity only after the server confirms cookie/session invalidation.
export async function logoutRoleSession(role) {
  if (!ENDPOINTS[role]) return
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), 15000)
  try {
    const response = await fetch(ENDPOINTS[role], { method: 'POST', credentials: 'include', signal: controller.signal })
    if (!response.ok) throw new Error('Could not confirm sign out. Please try again.')
  } finally { clearTimeout(timeout) }
}
