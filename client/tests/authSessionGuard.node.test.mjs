import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { authCheckOutcome } from '../src/utils/authCheckResponse.mjs'

const here = path.dirname(fileURLToPath(import.meta.url))
const read = (relative) => fs.readFileSync(path.join(here, relative), 'utf8')

test('auth check distinguishes a valid patient session from an explicit signed-out response', () => {
  assert.equal(authCheckOutcome({ ok: true }, { authenticated: true, user: { id: 12 } }), 'authenticated')
  assert.equal(authCheckOutcome({ ok: true }, { authenticated: false }), 'unauthenticated')
})

test('auth check treats API failures and malformed responses as unavailable, not logout', () => {
  assert.equal(authCheckOutcome({ ok: false, status: 503 }, { code: 'UPSTREAM_UNAVAILABLE' }), 'unavailable')
  assert.equal(authCheckOutcome({ ok: true }, { message: 'unexpected response' }), 'unavailable')
  assert.equal(authCheckOutcome(null, null), 'unavailable')
})

test('AuthContext preserves a session on unavailable checks and revalidates on tab return', () => {
  const source = read('../src/context/AuthContext.jsx')
  assert.match(source, /authCheckOutcome\(res, data\)/)
  assert.match(source, /if \(hadUnavailableCheck\)/)
  assert.match(source, /setAuthCheckError\(/)
  assert.match(source, /checkAuth\(\{ silent: true \}\)/)
  assert.match(source, /cache: 'no-store'/)
  assert.match(source, /const orderedRoles = hint \? \[hint\] : Object\.keys\(ENDPOINT_MAP\)/)
})

test('patient guards show a retry state instead of redirecting on an unavailable auth check', () => {
  const patientRoute = read('../src/components/PatientRoute.jsx')
  const guestRoute = read('../src/components/GuestOnlyRoute.jsx')
  assert.match(patientRoute, /authCheckError && !user/)
  assert.match(patientRoute, /AuthCheckFallback/)
  assert.match(guestRoute, /authCheckError && !user/)
  assert.match(guestRoute, /AuthCheckFallback/)
})

test('an authenticated patient is returned to the requested booking page after a login handoff', () => {
  const guestRoute = read('../src/components/GuestOnlyRoute.jsx')
  assert.match(guestRoute, /patientReturnPath\(new URLSearchParams\(search\)\.get\('next'\)\)/)
})
