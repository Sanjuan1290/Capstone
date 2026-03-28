// client/src/components/AdminRoute.jsx
import { Navigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'

const AdminRoute = ({ children }) => {
  const { user, role, ready } = useAuth()
  if (!ready) return (
    <div className="flex items-center justify-center h-screen">
      <div className="w-8 h-8 border-4 border-slate-200 border-t-sky-500 rounded-full animate-spin" />
    </div>
  )
  if (!user || role !== 'admin') return <Navigate to="/admin/login" replace />
  return children
}

export default AdminRoute