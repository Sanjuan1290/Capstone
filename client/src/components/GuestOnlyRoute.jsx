import { Navigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { destinationForAuthenticatedUser } from '../utils/guestNavigation.mjs'

// Never render a sign-in form until existing cookie sessions have been checked.
const GuestOnlyRoute = ({ children }) => {
  const { user, role, ready } = useAuth()
  if (!ready) return <div className="flex min-h-screen items-center justify-center" role="status">Checking session…</div>
  const destination = destinationForAuthenticatedUser(role, user)
  return destination ? <Navigate to={destination} replace /> : children
}
export default GuestOnlyRoute
