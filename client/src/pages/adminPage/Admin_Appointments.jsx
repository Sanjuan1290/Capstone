// client/src/pages/adminPage/Admin_Appointments.jsx
// Thin wrapper — passes Admin appointment services to the shared Appointments component.

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
  getAppointmentAvailableSlots,
  getBookingServices,
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
  getAppointmentAvailableSlots,
  getBookingServices,
}

const Admin_Appointments = () => <Appointments services={adminServices} />

export default Admin_Appointments
