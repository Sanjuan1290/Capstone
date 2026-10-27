import { Navigate, useLocation } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { destinationForAuthenticatedUser, isSamePortalGuestRoute } from '../utils/guestNavigation.mjs'

// Never render a sign-in form until existing cookie sessions have been checked.
const GuestOnlyRoute = ({ children }) => {
  const { user, role, ready } = useAuth()
  const { pathname } = useLocation()
  if (!ready) return <div className="flex min-h-screen items-center justify-center" role="status">Checking session…</div>
  // Redirect only if this session already belongs to the login page's portal.
  // A Superadmin cookie must not prevent signing in or registering as a patient.
  const destination = isSamePortalGuestRoute(pathname, role)
    ? destinationForAuthenticatedUser(role, user)
    : null
  return destination ? <Navigate to={destination} replace /> : children
}
export default GuestOnlyRoute

