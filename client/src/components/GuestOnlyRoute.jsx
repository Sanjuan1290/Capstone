import { Navigate, useLocation } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { destinationForAuthenticatedUser, isSamePortalGuestRoute } from '../utils/guestNavigation.mjs'
import { patientReturnPath } from '../utils/patientReturnPath.mjs'
import AuthCheckFallback from './AuthCheckFallback'

// Never render a sign-in form until existing cookie sessions have been checked.
const GuestOnlyRoute = ({ children }) => {
  const { user, role, ready, authCheckError, checkAuth } = useAuth()
  const { pathname, search } = useLocation()
  if (!ready) return <div className="flex min-h-screen items-center justify-center" role="status">Checking session…</div>
  if (authCheckError && !user) return <AuthCheckFallback onRetry={checkAuth} />

  // If an authenticated patient follows a sign-in link, return them to the
  // booking/appointment page they originally requested instead of the dashboard.
  const destination = isSamePortalGuestRoute(pathname, role)
    ? role === 'patient' && user
      ? patientReturnPath(new URLSearchParams(search).get('next'))
      : destinationForAuthenticatedUser(role, user)
    : null
  return destination ? <Navigate to={destination} replace /> : children
}
export default GuestOnlyRoute
