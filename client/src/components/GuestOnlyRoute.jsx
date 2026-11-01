import { Navigate, useLocation } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { destinationForAuthenticatedUser, isSamePortalGuestRoute } from '../utils/guestNavigation.mjs'
import { patientReturnPath } from '../utils/patientReturnPath.mjs'
import AuthCheckFallback from './AuthCheckFallback'

const roleForGuestPath = (pathname = '') => {
  if (pathname === '/login' || pathname.startsWith('/patient/')) return 'patient'
  if (pathname.startsWith('/superadmin/')) return 'superadmin'
  if (pathname.startsWith('/admin/')) return 'admin'
  if (pathname.startsWith('/staff/')) return 'staff'
  if (pathname.startsWith('/doctor/')) return 'doctor'
  return null
}

// Never render a sign-in form until existing cookie sessions have been checked.
const GuestOnlyRoute = ({ children }) => {
  const { user, role, ready, authCheckError, checkAuth } = useAuth()
  const { pathname, search } = useLocation()
  if (!ready) return <div className="flex min-h-screen items-center justify-center" role="status">Checking session…</div>
  if (authCheckError && role !== roleForGuestPath(pathname)) return <AuthCheckFallback onRetry={() => checkAuth()} />

  // An existing patient session should resume the requested booking page, not
  // send the patient to the dashboard and make them start the booking again.
  const destination = isSamePortalGuestRoute(pathname, role)
    ? role === 'patient' && user
      ? patientReturnPath(new URLSearchParams(search).get('next'))
      : destinationForAuthenticatedUser(role, user)
    : null
  return destination ? <Navigate to={destination} replace /> : children
}
export default GuestOnlyRoute
