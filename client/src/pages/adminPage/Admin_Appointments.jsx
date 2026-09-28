// client/src/pages/adminPage/Admin_Appointments.jsx
// Thin wrapper — passes admin service functions to the shared Appointments component.
// Route stays: /admin/appointments

import Appointments from '../shared/Appointments'
import {
  getAppointments,
  getAppointmentInventoryReadiness,
  confirmAppointment,
  cancelAppointment,
  markAppointmentNoShow,
  rescheduleAppointment,
  createAppointment,
  createWalkInPatient,
  getPatients,
  getDoctors,
  getDoctorSchedules,
  getAppointmentCancellationReasons,
} from '../../services/admin.service'

const adminServices = {
  getAppointments,
  getAppointmentInventoryReadiness,
  confirmAppointment,
  cancelAppointment,
  markAppointmentNoShow,
  rescheduleAppointment,
  createAppointment,
  createWalkInPatient,
  getPatients,
  getDoctors,
  getDoctorSchedules,
  getAppointmentCancellationReasons,
}

const Admin_Appointments = () => <Appointments services={adminServices} />

export default Admin_Appointments
