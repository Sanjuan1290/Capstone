import { Navigate } from 'react-router-dom'
import { useAuth } from '../../context/AuthContext'
import { hasStaffPermission } from '../../config/staffPermissions'
import Staff_Dashboard from './Staff_Dashboard'

const PRIORITY = [
  ['appointments', '/staff/appointments'],
  ['patient_records', '/staff/patient-records'],
  ['checkout', '/staff/checkout'],
  ['billing', '/staff/billing'],
  ['doctor_schedules', '/staff/doctor-schedules'],
  ['inventory', '/staff/inventory'],
  ['stock_transfers', '/staff/supply-requests'],
  ['accounts', '/staff/accounts'],
  ['system_setup', '/staff/system-setup'],
  ['reports', '/staff/reports'],
  ['audit_logs', '/staff/audit-logs'],
  ['landing_page', '/staff/landingpage'],
]

const Staff_Home = () => {
  const { user } = useAuth()
  if (hasStaffPermission(user, 'dashboard')) return <Staff_Dashboard />
  const next = PRIORITY.find(([permission]) => hasStaffPermission(user, permission))
  return next ? <Navigate to={next[1]} replace /> : <Navigate to="/staff/settings" replace />
}
export default Staff_Home
