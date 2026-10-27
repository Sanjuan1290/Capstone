const fs = require('fs')
const path = require('path')

const read = (...parts) => fs.readFileSync(path.join(__dirname, '..', '..', '..', ...parts), 'utf8')

describe('Batch 6G visit reason fallback', () => {
  it('always exposes one system Other reason without requiring database seed data', () => {
    const helper = read('server', 'utils', 'appointmentReasons.js')
    const patient = read('server', 'controllers', 'patient.controller.js')
    const staff = read('server', 'controllers', 'staff.controller.js')
    expect(helper).toContain("id: 'system-other'")
    expect(helper).toContain("label: OTHER_VISIT_REASON_LABEL")
    expect(patient).toContain('withSystemOtherVisitReason(rows)')
    expect(staff).toContain('withSystemOtherVisitReason(rows)')
  })

  it('requires a patient explanation for Other and preserves it in the appointment reason snapshot', () => {
    const server = read('server', 'controllers', 'patient.controller.js')
    const client = read('client', 'src', 'pages', 'patientPage', 'BookAppointment.jsx')
    expect(server).toContain('reason_details')
    expect(server).toContain("field: 'Other reason explanation'")
    expect(server).toContain('storedReason = `Other — ${details}`')
    expect(client).toContain('Please Describe Your Reason')
    expect(client).toContain("form.reason !== 'Other' || form.reasonDetails.trim().length >= 2")
  })

  it('server-validates configured reasons so stale or forged values cannot be booked', () => {
    const server = read('server', 'controllers', 'patient.controller.js')
    expect(server).toContain("code: 'VISIT_REASON_UNAVAILABLE'")
    expect(server).toContain("LOWER(TRIM(label)) = LOWER(?)")
  })

  it('does not block online booking only because custom visit reasons are empty', () => {
    const readiness = read('server', 'utils', 'bookingReadiness.js')
    expect(readiness).toContain("warnings.push('NO_VISIT_REASON')")
    expect(readiness).not.toContain("issues.push('NO_VISIT_REASON')")
    expect(readiness).toContain("fallback_visit_reason: 'Other'")
  })

  it('prevents admins from creating a redundant configured Other option', () => {
    const admin = read('server', 'controllers', 'admin.controller.js')
    const ui = read('client', 'src', 'pages', 'adminPage', 'Admin_PatientBooking.jsx')
    expect(admin).toContain("code: 'SYSTEM_VISIT_REASON_RESERVED'")
    expect(ui).toContain('Built-in fallback: Other')
  })

  it('requires an explanation for Other in staff walk-in intake too', () => {
    const staffUi = read('client', 'src', 'pages', 'staffPage', 'Staff_WalkInQueue.jsx')
    expect(staffUi).toContain("form.reason === 'Other' && !form.reason_notes.trim()")
    expect(staffUi).toContain('Other remains available and requires an explanation.')
  })
})

