// Shared guest-only login redirect rules. Client guard only; server auth remains authoritative.
const HOME = { superadmin: '/superadmin', admin: '/admin', staff: '/staff', doctor: '/doctor', patient: '/patient' }
export const destinationForAuthenticatedUser = (role, user = {}) => {
  if (!user || !HOME[role]) return null
  if (role === 'admin' && user.account_role === 'superadmin') return HOME.superadmin
  if (role === 'superadmin' && user.account_role !== 'superadmin') return HOME.admin
  if (user.must_change_password && ['admin', 'staff', 'doctor'].includes(role))
    return `/${role}/change-password-required`
  return HOME[role]
}

