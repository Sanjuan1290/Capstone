// client/src/pages/staffPage/Staff_Appointments.jsx
// Thin wrapper — passes staff service functions to the shared Appointments component.
// Route stays: /staff/appointments

import Appointments from '../shared/Appointments'
import {
  getAppointments,
  confirmAppointment,
  cancelAppointment,
  markAppointmentNoShow,
  rescheduleAppointment,
  createAppointment,
  createWalkInPatient,
  getPatients,
  getDoctors,
} from '../../services/staff.service'

const staffServices = {
  getAppointments,
  confirmAppointment,
  cancelAppointment,
  markAppointmentNoShow,
  rescheduleAppointment,
  createAppointment,
  createWalkInPatient,
  getPatients,
  getDoctors,
}

const Staff_Appointments = () => <Appointments services={staffServices} />

export default Staff_Appointments
