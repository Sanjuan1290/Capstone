const fs = require('fs')
const path = require('path')

const root = path.resolve(__dirname, '../../..')
const read = (rel) => fs.readFileSync(path.join(root, rel), 'utf8')

describe('Batch 5 appointment scheduling UI integration', () => {
  it('wires duration-aware booking services and slot lookup into Admin appointments', () => {
    const wrapper = read('client/src/pages/adminPage/Admin_Appointments.jsx')
    expect(wrapper).toContain('getBookingServices')
    expect(wrapper).toContain('getAppointmentAvailableSlots')
  })

  it('wires duration-aware booking services and slot lookup into Staff appointments', () => {
    const wrapper = read('client/src/pages/staffPage/Staff_Appointments.jsx')
    const router = read('server/routers/staff.router.js')
    expect(wrapper).toContain('getBookingServices')
    expect(wrapper).toContain('getAppointmentAvailableSlots')
    expect(router).toContain("router.get('/appointments/booking-services'")
    expect(router).toContain("can('appointments')")
  })

  it('shows appointment time ranges and reserved duration in shared appointment views', () => {
    const page = read('client/src/pages/shared/Appointments.jsx')
    expect(page).toContain('formatAppointmentRange')
    expect(page).toContain('Reserved Duration')
    expect(page).toContain('Confirmation Deadline')
  })

  it('shows duration-aware time ranges in Patient booking and appointment views', () => {
    const booking = read('client/src/pages/patientPage/BookAppointment.jsx')
    const myAppointments = read('client/src/pages/patientPage/MyAppointments.jsx')
    const history = read('client/src/pages/patientPage/History.jsx')
    const reschedule = read('client/src/pages/patientPage/ResheduleAppointment.jsx')
    expect(booking).toContain('formatAppointmentTimeRange')
    expect(myAppointments).toContain('formatAppointmentRange')
    expect(history).toContain('formatAppointmentRange')
    expect(reschedule).toContain('formatAppointmentTimeRange')
  })
})

