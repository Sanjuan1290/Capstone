import { useAuth } from '../context/AuthContext'
import { Navigate } from 'react-router-dom'

const StaffRoute = ({ children }) => {
  const { user, role, loading } = useAuth()

  if (loading) return (
    <div className="flex items-center justify-center min-h-screen">
      <div className="w-8 h-8 border-4 border-sky-500 border-t-transparent rounded-full animate-spin" />
    </div>
  )

  if (!user || role !== 'staff') return <Navigate to="/staff/login" replace />
  return <>{children}</>
}

export default StaffRoute