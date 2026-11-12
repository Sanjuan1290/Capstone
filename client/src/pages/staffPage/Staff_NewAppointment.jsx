import { useAuth } from '../../context/AuthContext'
import { hasStaffPermission } from '../../config/staffPermissions'
import AppointmentCreatePage from '../shared/AppointmentCreatePage'
import { staffServices } from './Staff_Appointments'

export default function Staff_NewAppointment() {
  const { user } = useAuth()
  return <AppointmentCreatePage services={staffServices} walkInOnly={!hasStaffPermission(user,'appointments')} allowWalkIn={hasStaffPermission(user,'walk_in_queue')} />
}
