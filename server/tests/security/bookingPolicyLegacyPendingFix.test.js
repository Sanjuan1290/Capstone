const fs = require('fs')
const path = require('path')

const root = path.resolve(__dirname, '../../..')
const read = (rel) => fs.readFileSync(path.join(root, rel), 'utf8')

describe('booking policy edit mode and legacy pending expiry fix', () => {
  it('keeps booking policy read-only until Edit Booking Policy is clicked and uses 30-minute choices', () => {
    const page = read('client/src/pages/adminPage/Admin_PatientBooking.jsx')
    expect(page).toContain('Edit Booking Policy')
    expect(page).toContain('Save Booking Policy')
    expect(page).toContain('disabled={!editingPolicy}')
    expect(page).toContain('BOOKING_POLICY_MINUTE_OPTIONS')
    expect(page).toContain('Adjustable values can only be changed in 30-minute increments.')
    expect(page).toContain('cutoff % 30 !== 0')
  })

  it('enforces 30-minute booking policy increments on the server', () => {
    const policy = read('server/utils/bookingPolicy.js')
    expect(policy).toContain('notice % 30 !== 0')
    expect(policy).toContain('cutoff % 30 !== 0')
    expect(policy).toContain('Pending confirmation cutoff must be 30 minutes to 24 hours in 30-minute increments.')
  })

  it('backfills missing confirmation deadlines before rejecting overdue legacy online bookings', () => {
    const expiry = read('server/utils/pendingAppointmentExpiry.js')
    expect(expiry).toContain('backfillMissingConfirmationDeadlines')
    expect(expiry).toContain("confirmation_deadline_at IS NULL")
    expect(expiry).toContain('buildConfirmationDeadlineSql')
    expect(expiry).toContain("status = 'rejected'")
    expect(expiry).toContain("rejection_reason = 'confirmation_timeout'")
  })

  it('syncs expiry before appointment lists are returned', () => {
    for (const controller of ['admin.controller.js', 'staff.controller.js', 'patient.controller.js']) {
      const source = read(`server/controllers/${controller}`)
      expect(source).toContain('await expirePendingAppointments().catch(() => {})')
    }
  })
})
