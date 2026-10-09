const fs = require('fs')
const path = require('path')

const read = (...parts) => fs.readFileSync(path.join(__dirname, '..', '..', '..', ...parts), 'utf8')

describe('September 29 Batch 6B — clinic assignment is authoritative', () => {
  it('matches appointment doctors strictly by clinic_type instead of specialty text', () => {
    const source = read('server', 'utils', 'appointmentSecurity.js')
    expect(source).toContain("const assignedClinic = String(doctor?.clinic_type || '').trim()")
    expect(source).toContain("clinicType === assignedClinic")
    expect(source).not.toContain("specialty || '').toLowerCase().includes('derm')")
  })

  it('builds patient doctor availability from clinic_type only', () => {
    const server = read('server', 'utils', 'doctorAvailabilitySummary.js')
    const booking = read('client', 'src', 'pages', 'patientPage', 'BookAppointment.jsx')
    const availability = read('client', 'src', 'pages', 'patientPage', 'DoctorAvailability.jsx')
    expect(server).toContain("const assignedClinic = String(doctor?.clinic_type || '').trim()")
    expect(server).not.toContain("specialty || '').toLowerCase().includes('derm')")
    expect(booking).toContain("const doctorClinic = (d) => String(d.clinic_type || '')")
    expect(booking).not.toContain("String(d.specialty || '').toLowerCase().includes('derm')")
    expect(availability).toContain('const clinicType = doctor.clinic_type')
  })

  it('filters Admin/Staff appointment doctor choices using clinic assignment', () => {
    const source = read('client', 'src', 'pages', 'shared', 'Appointments.jsx')
    expect(source).toContain("String(doctor.clinic_type || doctor.type || '') === form.clinic_type")
    expect(source).not.toContain("specialty.includes('derm')")
  })

  it('uses doctor clinic_type for stock-transfer destination selection', () => {
    const source = read('server', 'controllers', 'doctor.controller.js')
    expect(source).toContain("SELECT clinic_type FROM doctors WHERE id=? LIMIT 1")
    expect(source).toContain("const doctorClinic = String(doctorProfile?.clinic_type || '')")
    expect(source).not.toContain("doctorProfile?.specialty")
  })

  it('does not infer doctor account/schedule clinic from specialty text', () => {
    const accounts = read('client', 'src', 'pages', 'adminPage', 'Admin_DoctorAccount.jsx')
    const schedules = read('client', 'src', 'pages', 'adminPage', 'Admin_DoctorSchedules.jsx')
    expect(accounts).not.toContain("String(doctor?.specialty || '').toLowerCase().includes('derm')")
    expect(accounts).not.toContain("String(doctor.specialty || '').toLowerCase().includes('derm')")
    expect(schedules).toContain("(doctor?.clinic_type || doctor?.type) === 'derma'")
    expect(schedules).not.toContain("specialty || '').toLowerCase().includes('derm')")
  })
})

