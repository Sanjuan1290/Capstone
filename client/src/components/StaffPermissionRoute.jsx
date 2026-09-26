import { Navigate, useLocation } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { hasStaffPermission } from '../config/staffPermissions'

const StaffPermissionRoute = ({ permission, children }) => {
  const { user, role, ready } = useAuth()
  const location = useLocation()
  if (!ready) return <div className="flex h-64 items-center justify-center"><div className="h-8 w-8 animate-spin rounded-full border-4 border-slate-200 border-t-sky-500" /></div>
  if (!user || role !== 'staff') return <Navigate to="/staff/login" replace />
  if (!hasStaffPermission(user, permission)) {
    return (
      <div className="mx-auto max-w-2xl rounded-3xl border border-amber-200 bg-amber-50 p-8 text-center shadow-sm">
        <p className="text-xs font-black uppercase tracking-widest text-amber-600">Access Restricted</p>
        <h1 className="mt-2 text-xl font-black text-slate-900">You do not have access to this feature.</h1>
        <p className="mt-2 text-sm leading-relaxed text-slate-600">Your Staff permissions do not include this area. Contact an Administrator if your role requires access.</p>
        <p className="mt-4 text-xs text-slate-400">Requested page: {location.pathname}</p>
      </div>
    )
  }
  return children
}
export default StaffPermissionRoute
