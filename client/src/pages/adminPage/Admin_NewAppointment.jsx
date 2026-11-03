import AppointmentCreatePage from '../shared/AppointmentCreatePage'
import { adminServices } from './Admin_Appointments'

export default function Admin_NewAppointment() {
  return <AppointmentCreatePage services={adminServices} />
}
