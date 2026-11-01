import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { authCheckOutcome } from '../src/utils/authCheckResponse.mjs'
import { patientReturnPath } from '../src/utils/patientReturnPath.mjs'
import {
  buildBookingPolicyUrl,
  buildPatientBookingUrl,
  changePolicyBranch,
} from '../src/utils/bookingPolicyNavigation.mjs'

const here = path.dirname(fileURLToPath(import.meta.url))
const read = (relative) => fs.readFileSync(path.join(here, relative), 'utf8')

test('auth checks distinguish a signed-in patient, a signed-out patient, and an unavailable API', () => {
  assert.equal(authCheckOutcome({ ok: true }, { authenticated: true, user: { id: 12 } }), 'authenticated')
  assert.equal(authCheckOutcome({ ok: true }, { authenticated: false }), 'unauthenticated')
  assert.equal(authCheckOutcome({ ok: false, status: 503 }, { code: 'UPSTREAM_UNAVAILABLE' }), 'unavailable')
  assert.equal(authCheckOutcome({ ok: true }, { message: 'unexpected response' }), 'unavailable')
  assert.equal(authCheckOutcome(null, null), 'unavailable')
})

test('the public booking policy route checks the patient session first in a new tab', () => {
  const source = read('../src/context/AuthContext.jsx')
  assert.match(source, /first === 'booking-policy' \|\| first === 'login'/)
  assert.match(source, /const orderedRoles = pathHint\s*\? \[pathHint\]/)
  assert.match(source, /credentials: 'include'/)
  assert.match(source, /cache: 'no-store'/)
})

test('auth checks do not clear a session after a failed request and ignore stale requests', () => {
  const source = read('../src/context/AuthContext.jsx')
  assert.match(source, /const authCheckRequestId = useRef\(0\)/)
  assert.match(source, /requestId !== authCheckRequestId\.current/)
  assert.match(source, /if \(hadUnavailableCheck\)/)
  assert.match(source, /Your session has not been cleared/)
  assert.match(source, /setUser\(null\)/)
  assert.match(source, /window\.addEventListener\('focus', revalidate\)/)
  assert.match(source, /window\.addEventListener\('pageshow', revalidate\)/)
  assert.match(source, /document\.addEventListener\('visibilitychange', revalidate\)/)
})

test('patient guards show a retry state when authentication cannot be checked', () => {
  const patientRoute = read('../src/components/PatientRoute.jsx')
  const guestRoute = read('../src/components/GuestOnlyRoute.jsx')
  assert.match(patientRoute, /authCheckError && role !== 'patient'/)
  assert.match(patientRoute, /AuthCheckFallback/)
  assert.match(guestRoute, /authCheckError && role !== roleForGuestPath\(pathname\)/)
  assert.match(guestRoute, /AuthCheckFallback/)
})

test('an already authenticated patient returns to the requested booking page after login handoff', () => {
  const source = read('../src/components/GuestOnlyRoute.jsx')
  assert.match(source, /patientReturnPath\(new URLSearchParams\(search\)\.get\('next'\)\)/)
  assert.equal(
    patientReturnPath('/patient/book?branch_id=1&clinic=derma&service_id=30001&doctor=44'),
    '/patient/book?branch_id=1&doctor=44&service_id=30001&clinic=derma',
  )
})

test('booking policy links carry the current branch, clinic, service and doctor', () => {
  assert.equal(
    buildBookingPolicyUrl({ branchId: 1, clinicType: 'derma', serviceId: 30001, doctorId: 44 }),
    '/booking-policy?branch_id=1&clinic=derma&service_id=30001&doctor=44',
  )
  const booking = read('../src/pages/patientPage/BookAppointment.jsx')
  assert.match(booking, /href=\{policyUrl\}/)
  assert.match(booking, /href=\{buildBookingPolicyUrl\(/)
})

test('the policy page returns to the original safe booking details', () => {
  const query = new URLSearchParams('branch_id=1&clinic=derma&service_id=30001&doctor=44&redirect=https://evil.example')
  assert.equal(
    buildPatientBookingUrl(query),
    '/patient/book?branch_id=1&doctor=44&service_id=30001&clinic=derma',
  )
  const page = read('../src/pages/shared/BookingPolicy.jsx')
  assert.match(page, /buildPatientBookingUrl\(searchParams\)/)
  assert.match(page, /changePolicyBranch\(searchParams, event\.target\.value\)/)
})

test('changing the selected policy branch removes IDs tied to the previous branch', () => {
  const current = new URLSearchParams('branch_id=1&clinic=derma&service_id=30001&doctor=44')
  assert.equal(
    changePolicyBranch(current, '2').toString(),
    'branch_id=2&clinic=derma',
  )
  assert.equal(
    changePolicyBranch(current, '1').toString(),
    'branch_id=1&clinic=derma&service_id=30001&doctor=44',
  )
})
