// client/src/pages/staffPage/Staff_Appointments.jsx
// Thin wrapper — passes Staff appointment services to the shared Appointments component.

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
} from '../../services/staff.service'

const staffServices = {
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

const Staff_Appointments = () => <Appointments services={staffServices} />

export default Staff_Appointments
