'use strict'

const test = require('node:test')
const assert = require('node:assert/strict')
const path = require('node:path')
const fs = require('node:fs')
const {
  DEFAULT_BOOKING_POLICY_DOCUMENT,
  normalizeBookingPolicyDocument,
  parseStoredBookingPolicyDocument,
} = require('../../utils/bookingPolicyDocument')

const root = path.resolve(__dirname, '../../..')
const read = (relativePath) => fs.readFileSync(path.join(root, relativePath), 'utf8')

test('default appointment policy is readable without selecting a branch', () => {
  assert.equal(DEFAULT_BOOKING_POLICY_DOCUMENT.title, 'Appointment Booking Policy')
  assert.ok(DEFAULT_BOOKING_POLICY_DOCUMENT.sections.length >= 4)
  assert.equal(normalizeBookingPolicyDocument(DEFAULT_BOOKING_POLICY_DOCUMENT).sections.length, DEFAULT_BOOKING_POLICY_DOCUMENT.sections.length)
})

test('policy content validation rejects empty and oversized fields', () => {
  assert.throws(() => normalizeBookingPolicyDocument({ title: '', introduction: 'Intro', sections: [{ heading: 'A', body: 'B' }] }))
  assert.throws(() => normalizeBookingPolicyDocument({ title: 'Policy', introduction: 'Intro', sections: [] }))
  assert.throws(() => normalizeBookingPolicyDocument({ title: 'Policy', introduction: 'Intro', sections: [{ heading: 'A', body: 'x'.repeat(1501) }] }))
})

test('malformed stored JSON never becomes public policy content', () => {
  assert.equal(parseStoredBookingPolicyDocument('{broken json'), null)
  assert.equal(parseStoredBookingPolicyDocument(JSON.stringify({ title: 'Missing sections' })), null)
})

test('public policy endpoint is registered before patient authentication', () => {
  const router = read('server/routers/patient.router.js')
  const publicRoute = router.indexOf("router.get('/booking-policy'")
  const protectedMiddleware = router.indexOf("router.use(verifyToken('patient_token')")
  assert.ok(publicRoute >= 0)
  assert.ok(protectedMiddleware > publicRoute)
  assert.match(router, /WHERE cb\.id=\? AND cb\.is_active=1/)
  assert.match(router, /d\.branch_id=cb\.id/)
})

test('branch administrators can only edit their own branch policy with System Setup permission', () => {
  const router = read('server/routers/branches.router.js')
  assert.match(router, /booking-policy\/content`,\.\.\.middle,requirePermission\('system_setup'\),getBookingPolicyContent/)
  assert.match(router, /booking-policy\/content`,\.\.\.middle,requirePermission\('system_setup'\),afterSuccessfulMutation\('settings\.updated'\),saveBookingPolicyContent/)
  assert.match(router, /FROM branch_booking_policy_documents WHERE branch_id=\?/) 
})

test('staff System Setup routes use the same branch-scoped policy editor permission', () => {
  const router = read('server/routers/staff.router.js')
  assert.match(router, /booking-policy\/content', \.\.\.auth, can\('system_setup'\), readBookingPolicyContent/)
  assert.match(router, /booking-policy\/content', \.\.\.auth, can\('system_setup'\), writeBookingPolicyContent/)
  assert.match(router, /FROM branch_booking_policy_documents WHERE branch_id=\?/) 
})

test('new additive migration stores draft and published policy separately', () => {
  const migrations = read('server/scripts/branchMigrations.js')
  const sql = read('server/db/migrations/2026-11-01-booking-policy-content.sql')
  assert.ok(migrations.includes("'2026-11-01-booking-policy-content.sql'"))
  assert.match(sql, /CREATE TABLE IF NOT EXISTS branch_booking_policy_documents/)
  assert.match(sql, /draft_document LONGTEXT NULL/)
  assert.match(sql, /published_document LONGTEXT NULL/)
  assert.match(sql, /FOREIGN KEY \(branch_id\) REFERENCES clinic_branches\(id\) ON DELETE RESTRICT/)
  assert.doesNotMatch(sql, /DROP\s+TABLE/i)
})

test('public page is routed, linked from the footer, and opened from the booking flow', () => {
  const app = read('client/src/App.jsx')
  const layout = read('client/src/components/layouts/Layout.jsx')
  const booking = read('client/src/pages/patientPage/BookAppointment.jsx')
  const page = read('client/src/pages/shared/BookingPolicy.jsx')
  assert.ok(app.includes("path='/booking-policy'"))
  assert.ok(layout.includes('Appointment Booking Policy'))
  assert.ok(booking.includes('/booking-policy?branch_id='))
  assert.ok(!booking.includes('Read full online booking policy'))
  assert.ok(page.includes('View policy for a clinic branch (optional)'))
  assert.ok(page.includes('General policy — all branches'))
})

test('System Setup provides draft, publish, and unpublish controls', () => {
  const page = read('client/src/pages/adminPage/Admin_PatientBooking.jsx')
  const service = read('client/src/services/admin.service.js')
  assert.ok(page.includes('Policy Patients Can Read'))
  assert.ok(page.includes('Save Draft'))
  assert.ok(page.includes('Publish Policy'))
  assert.ok(page.includes('Unpublish'))
  assert.ok(service.includes('/system-setup/booking-policy/content'))
})
