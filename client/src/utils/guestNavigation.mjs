// Shared guest-only login redirect rules. Client guard only; server auth remains authoritative.
const HOME = { superadmin: '/superadmin', admin: '/admin', staff: '/staff', doctor: '/doctor', patient: '/patient' }
// A login form belongs to a specific portal. An authenticated session from a
// different portal must never hijack the visitor's intended login/registration.
const GUEST_PORTALS = Object.freeze({
  '/login': 'patient',
  '/patient/login': 'patient',
  '/patient/register': 'patient',
  '/staff/login': 'staff',
  '/doctor/login': 'doctor',
  '/admin/login': 'admin',
  '/superadmin/login': 'superadmin',
})

export const guestPortalForPath = (pathname = '') =>
  GUEST_PORTALS[String(pathname || '').replace(/\/+$/, '') || '/'] || null

export const isSamePortalGuestRoute = (pathname, authenticatedRole) =>
  Boolean(authenticatedRole && guestPortalForPath(pathname) === authenticatedRole)

export const destinationForAuthenticatedUser = (role, user = {}) => {
  if (!user || !HOME[role]) return null
  if (role === 'admin' && user.account_role === 'superadmin') return HOME.superadmin
  if (role === 'superadmin' && user.account_role !== 'superadmin') return HOME.admin
  if (user.must_change_password && ['admin', 'staff', 'doctor'].includes(role))
    return `/${role}/change-password-required`
  return HOME[role]
}


