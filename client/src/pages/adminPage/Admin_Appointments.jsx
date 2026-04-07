// client/src/pages/adminPage/Admin_Appointments.jsx
// Thin wrapper — passes admin service functions to the shared Appointments component.
// Route stays: /admin/appointments

import Appointments from '../shared/Appointments'
import {
  getAppointments,
  confirmAppointment,
  cancelAppointment,
  rescheduleAppointment,
  createAppointment,
  getPatients,
  getDoctors,
} from '../../services/admin.service'

const adminServices = {
  getAppointments,
  confirmAppointment,
  cancelAppointment,
  rescheduleAppointment,
  createAppointment,
  getPatients,
  getDoctors,
}

const Admin_Appointments = () => <Appointments services={adminServices} />

export default Admin_Appointments