const fs = require('fs')
const path = require('path')

const read = (...parts) => fs.readFileSync(path.join(__dirname, '..', '..', ...parts), 'utf8')
const readClient = (...parts) => fs.readFileSync(path.join(__dirname, '..', '..', '..', 'client', 'src', ...parts), 'utf8')

describe('appointment cancellation reasons', () => {
  it('creates configurable cancellation reasons and preserves historical snapshots', () => {
    const schema = read('utils', 'schema.js')
    expect(schema).toContain('CREATE TABLE IF NOT EXISTS appointment_cancellation_reasons')
    expect(schema).toContain("ensureColumn('appointments', 'cancellation_reason_id'")
    expect(schema).toContain("ensureColumn('appointments', 'cancellation_reason_snapshot'")
    expect(schema).toContain("ensureColumn('appointments', 'cancellation_details'")
    expect(schema).toContain("ensureColumn('appointments', 'cancelled_by_role'")
    expect(schema).toContain("fk_appointments_cancellation_reason")
  })

  it('requires a configured reason or an explained Other cancellation', () => {
    const helper = read('utils', 'appointmentCancellation.js')
    expect(helper).toContain('Select a reason for cancellation.')
    expect(helper).toContain('Please explain the cancellation reason when selecting Other.')
    expect(helper).toContain('WHERE id = ? AND is_active = 1')
  })

  it('records cancellation metadata for patient admin and staff actions', () => {
    for (const controller of ['patient.controller.js', 'admin.controller.js', 'staff.controller.js']) {
      const source = read('controllers', controller)
      expect(source).toContain('resolveCancellationInput(req.body)')
      expect(source).toContain('cancellation_reason_snapshot = ?')
      expect(source).toContain('cancelled_by_user_id = ?')
      expect(source).toContain('cancelled_at = NOW()')
    }
  })

  it('exposes Reason for Cancellation in System Setup and uses a real modal instead of browser confirm', () => {
    const tabs = readClient('components', 'system', 'SystemSetupTabs.jsx')
    const setup = readClient('pages', 'adminPage', 'Admin_SystemSetup.jsx')
    const modal = readClient('components', 'appointments', 'CancellationReasonModal.jsx')
    const patient = readClient('pages', 'patientPage', 'MyAppointments.jsx')
    const shared = readClient('pages', 'shared', 'Appointments.jsx')

    expect(tabs).toContain("label: 'Reason for Cancellation'")
    expect(setup).toContain('cancellation_reasons')
    expect(modal).toContain('Reason for Cancellation *')
    expect(modal).toContain('<option value="other">Other</option>')
    expect(patient).not.toContain("confirm('Cancel this appointment?')")
    expect(shared).not.toContain("window.confirm('Cancel this appointment?')")
  })
})
