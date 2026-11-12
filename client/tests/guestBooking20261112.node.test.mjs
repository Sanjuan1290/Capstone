import test from 'node:test'
import assert from 'node:assert/strict'
import { normalizeGuestPhone, guestPatientError, normalizeGuestServices } from '../src/utils/guestBookingFlow.mjs'
import { guestPost, guestRequest } from '../src/services/guestBooking.service.js'
test('guest phone variants normalize to the same verified identity', () => {
  for (const value of ['09170000001', '+63 917 000 0001', '639170000001']) assert.equal(normalizeGuestPhone(value), '639170000001')
  for (const value of ['', '0917000000', 'abc', '08170000001']) assert.equal(normalizeGuestPhone(value), '')
})
test('guest details require consent and valid age or birthdate while email stays optional', () => {
  const patient = { full_name: 'Synthetic Guest', gender: 'Female', reported_age: '35', consent_given: true }
  assert.equal(guestPatientError(patient), '')
  assert.match(guestPatientError({ ...patient, consent_given: false }), /privacy/)
  for (const age of ['', '-1', '121', '1.5']) assert.match(guestPatientError({ ...patient, reported_age: age }), /age/)
  assert.equal(guestPatientError({ ...patient, reported_age: '0' }), '')
  assert.match(guestPatientError({ ...patient, email: 'invalid' }), /email/)
  assert.match(guestPatientError({ ...patient, birthdate: '2999-01-01' }), /birthdate|birth|future/i)
})
test('guest service presentation strips offers without changing regular prices or patient service data', () => {
  const registered = { id: 77, default_price: 650, current_offer: { id: 5 }, promotions: [{}], discount_amount: 100 }
  assert.deepEqual(normalizeGuestServices([registered]), [{ id: 77, default_price: 650 }])
  assert.equal(registered.current_offer.id, 5)
})
test('guest verification and booking requests carry their HttpOnly proof cookie', async t => {
  const original = globalThis.fetch
  t.after(() => { globalThis.fetch = original })
  const calls = []
  globalThis.fetch = async (url, options) => { calls.push({ url, options }); return { ok: true, json: async () => ({ verified: true }) } }
  await guestPost('phone/verify-code', { phone: '639170000001', code: '123456' })
  await guestRequest('phone/status')
  assert.ok(calls.every(call => call.options.credentials === 'same-origin'))
  assert.equal(calls[0].options.method, 'POST')
  assert.equal(JSON.parse(calls[0].options.body).code, '123456')
})
test('quota and SMS errors retain server codes, remaining quota and retry timing', async t => {
  const original = globalThis.fetch
  t.after(() => { globalThis.fetch = original })
  globalThis.fetch = async () => ({ ok: false, status: 429, headers: new Headers({ 'Retry-After': '60' }), json: async () => ({ code: 'GUEST_DAILY_LIMIT', message: 'Daily limit reached', details: { remaining: 0 } }) })
  await assert.rejects(guestPost('appointments', {}), error => error.code === 'GUEST_DAILY_LIMIT' && error.status === 429 && error.details.remaining === 0 && error.retryAfter === 60)
})
