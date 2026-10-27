const fs = require('fs')
const path = require('path')

const root = path.resolve(__dirname, '../../..')
const read = (rel) => fs.readFileSync(path.join(root, rel), 'utf8')

describe('Batch 4 booking policy System Setup exposure', () => {
  it('exposes Admin booking policy endpoints', () => {
    const router = read('server/routers/admin.router.js')
    expect(router).toContain("router.get('/system-setup/booking-policy'")
    expect(router).toContain("router.put('/system-setup/booking-policy'")
  })

  it('exposes booking policy through Staff System Setup permission', () => {
    const router = read('server/routers/staff.router.js')
    expect(router).toContain("router.get('/admin-access/system-setup/booking-policy'")
    expect(router).toContain("router.put('/admin-access/system-setup/booking-policy'")
    expect(router).toContain("can('system_setup')")
  })

  it('shows the booking controls in Patient Visits', () => {
    const page = read('client/src/pages/adminPage/Admin_PatientBooking.jsx')
    expect(page).toContain('Online Booking Policy')
    expect(page).toContain('Minimum Online Booking Notice')
    expect(page).toContain('Pending Confirmation Cutoff')
    expect(page).toContain('Booking Start Interval')
    expect(page).toContain('30 minutes')
  })

  it('uses the booking policy service endpoints', () => {
    const service = read('client/src/services/admin.service.js')
    expect(service).toContain('getBookingPolicy')
    expect(service).toContain('updateBookingPolicy')
    expect(service).toContain('/system-setup/booking-policy')
  })
})
