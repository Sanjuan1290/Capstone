// client/src/components/PatientAuthRoute.jsx
import { Navigate, useSearchParams } from 'react-router-dom'
import { patientReturnPath } from '../utils/patientReturnPath.mjs'
import { useAuth } from '../context/AuthContext'

const PatientAuthRoute = ({ children }) => {
  const [params] = useSearchParams()
  const { user, role, ready } = useAuth()
  if (!ready) return (
    <div className="flex items-center justify-center h-screen">
      <div className="w-8 h-8 border-4 border-slate-200 border-t-emerald-500 rounded-full animate-spin" />
    </div>
  )
  if (user && role === 'patient') return <Navigate to={patientReturnPath(params.get('next'))} replace />
  return children
}

export default PatientAuthRoute

