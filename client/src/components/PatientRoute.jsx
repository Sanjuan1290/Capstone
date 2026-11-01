// client/src/components/PatientRoute.jsx
import { Navigate, useLocation } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'

const PatientRoute = ({ children }) => {
  const location = useLocation()
  const { user, role, ready } = useAuth()
  if (!ready) return (
    <div className="flex items-center justify-center h-screen">
      <div className="w-8 h-8 border-4 border-slate-200 border-t-emerald-500 rounded-full animate-spin" />
    </div>
  )
  if (!user || role !== 'patient') {
    const requested = location.pathname + location.search
    const next = requested.startsWith('/patient/book') ? `?next=${encodeURIComponent(requested)}` : ''
    return <Navigate to={`/patient/login${next}`} replace />
  }
  return children
}

export default PatientRoute

