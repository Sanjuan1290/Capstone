const fs = require('fs')
const path = require('path')

const read = (...parts) => fs.readFileSync(path.join(__dirname, '..', '..', '..', ...parts), 'utf8')

describe('Batch 6 final regression guard', () => {
  it('keeps patient registration SMS OTP but removes the redundant registration banner', () => {
    const register = read('client', 'src', 'pages', 'auth', 'Patient', 'PatientRegister.jsx')
    expect(register).toContain("verification_method: 'sms'")
    expect(register).toContain('Verify Mobile Number')
    expect(register).not.toContain('Registration no longer uses email verification.')
  })

  it('keeps doctor routing based on clinic_type rather than specialty text', () => {
    const booking = read('client', 'src', 'pages', 'patientPage', 'BookAppointment.jsx')
    const security = read('server', 'utils', 'appointmentSecurity.js')
    expect(booking).toContain("String(d.clinic_type || '')")
    expect(booking).not.toContain("specialty.includes('derm')")
    expect(security).not.toContain("specialty.includes('derm')")
  })

  it('keeps Doctor Accounts limited to the two clinic assignments', () => {
    const accounts = read('client', 'src', 'pages', 'adminPage', 'Admin_DoctorAccount.jsx')
    expect(accounts).toContain("{ value: 'medical', label: 'General Medicine' }")
    expect(accounts).toContain("{ value: 'derma', label: 'Dermatology' }")
    expect(accounts).not.toContain('Clinical Specialty')
  })

  it('keeps service readiness and fallback visit reasons logically consistent', () => {
    const readiness = read('server', 'utils', 'bookingReadiness.js')
    const booking = read('client', 'src', 'pages', 'patientPage', 'BookAppointment.jsx')
    expect(readiness).toContain("if (activeServices === 0) issues.push('NO_ACTIVE_SERVICE')")
    expect(readiness).toContain("warnings.push('NO_VISIT_REASON')")
    expect(booking).toContain('Choose Another Clinic')
    expect(booking).toContain('Other always available')
  })
})
