import { useAuth } from '../context/AuthContext'
import { Navigate } from 'react-router-dom'

const PatientAuthRoute = ({ children }) => {
  const { user, role, loading } = useAuth()

  if (loading) return (
    <div className="flex items-center justify-center min-h-screen">
      <div className="w-8 h-8 border-4 border-emerald-500 border-t-transparent rounded-full animate-spin" />
    </div>
  )

  if (user && role === 'patient') return <Navigate to="/patient" replace />

  return <>{children}</>
}

export default PatientAuthRoute