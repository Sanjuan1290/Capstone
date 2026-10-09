const fs = require('fs')
const path = require('path')

const read = (...parts) => fs.readFileSync(path.join(__dirname, '..', '..', '..', ...parts), 'utf8')

describe('Batch 6E online booking readiness', () => {
  it('builds one shared readiness summary from clinic assignment, schedules, services, and visit reasons', () => {
    const source = read('server', 'utils', 'bookingReadiness.js')
    expect(source).toContain("d.clinic_type = clinic.clinic_type")
    expect(source).toContain('JOIN doctor_schedules ds')
    expect(source).toContain("bsc.clinic_type = clinic.clinic_type OR bsc.clinic_type = 'all'")
    expect(source).toContain("aro.clinic_type = clinic.clinic_type OR aro.clinic_type = 'all'")
    expect(source).toContain('bookable: issues.length === 0')
    expect(source).toContain("warnings.push('NO_VISIT_REASON')")
  })

  it('exposes patient readiness and includes the same readiness in the admin dashboard response', () => {
    const patientRouter = read('server', 'routers', 'patient.router.js')
    const patientController = read('server', 'controllers', 'patient.controller.js')
    const adminController = read('server', 'controllers', 'admin.controller.js')
    expect(patientRouter).toContain("router.get('/booking-readiness'")
    // Patient readiness is now evaluated for the selected physical branch.
    expect(patientController).toContain('getOnlineBookingReadiness(db,branch.id)')
    expect(patientController).toContain('validatePatientBranch(req,res)')
    expect(adminController).toContain('const bookingReadiness = await getOnlineBookingReadiness()')
    expect(adminController).toContain('bookingReadiness,')
  })

  it('prevents patients from entering a clinic booking flow when its configuration is incomplete', () => {
    const source = read('client', 'src', 'pages', 'patientPage', 'BookAppointment.jsx')
    expect(source).toContain("status.issue_messages?.[0]")
    expect(source).toContain("'Setup incomplete'")
    expect(source).toContain('Boolean(bookingReadiness?.[form.clinicType]?.bookable)')
    expect(source).toContain('disabled={disabled}')
  })

  it('shows administrators the booking readiness status and direct setup actions', () => {
    const source = read('client', 'src', 'pages', 'adminPage', 'Admin_Dashboard.jsx')
    expect(source).toContain('Online Booking Readiness')
    expect(source).toContain('Configure Services')
    expect(source).toContain('Configure Visit Reasons')
    expect(source).toContain('Manage Doctors')
    expect(source).toContain('Manage Schedules')
  })
})

