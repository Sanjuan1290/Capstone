import AppointmentCreatePage from '../shared/AppointmentCreatePage'
import { staffServices } from './Staff_Appointments'

export default function Staff_NewAppointment() {
  return <AppointmentCreatePage services={staffServices} />
}
