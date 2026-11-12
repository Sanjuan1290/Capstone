const test = require('node:test'), assert = require('node:assert/strict'), crypto = require('node:crypto')
const { harness } = require('./helpers/guestBookingHarness.cjs')
const codeIs = code => error => error.code === code
const submit = async (h, overrides = {}) => { const res = h.response(); await h.booking.create(h.request(h.body({ submission_key: crypto.randomUUID(), ...overrides })), res); return res }

test('guest booking is rejected before database access unless the submitted mobile is SMS-verified', async () => {
  const h = harness()
  await assert.rejects(submit(h), codeIs('GUEST_PHONE_VERIFICATION_REQUIRED'))
  assert.equal(h.calls.length, 0)
  assert.equal(h.state.appointments.length, 0)
})

test('SMS verification hashes codes, consumes them once, and issues only an HttpOnly guest proof', async () => {
  const h = harness(), res = h.response()
  await h.phoneController.requestCode(h.request({ phone: '09170000001' }), res)
  const code = h.messages[0].code
  assert.match(code, /^\d{6}$/)
  assert.notEqual(h.state.codes[0].code, code)
  const verified = h.response()
  await h.phoneController.verifyCode(h.request({ phone: '09170000001', code }), verified)
  assert.equal(verified.body.phone, '639170000001')
  assert.equal(verified.cookieOptions.httpOnly, true)
  assert.equal(verified.cookieOptions.path, '/api/patient/guest')
  assert.deepEqual(Object.keys(h.cookies), ['guest_booking_phone'])
  assert.equal(h.state.codes.length, 0)
  await assert.rejects(h.phoneController.verifyCode(h.request({ phone: '09170000001', code }), h.response()), codeIs('INVALID_CODE'))
  assert.equal(h.state.appointments.length, 0)
})

test('five incorrect code attempts remain counted and invalidate the challenge', async () => {
  const h = harness()
  await h.phoneController.requestCode(h.request({ phone: '09170000001' }), h.response())
  const realCode = h.messages[0].code
  const wrongCode = realCode === '000000' ? '111111' : '000000'
  for (let attempt = 0; attempt < 5; attempt++) await assert.rejects(h.phoneController.verifyCode(h.request({ phone: '09170000001', code: wrongCode }), h.response()), codeIs('INVALID_CODE'))
  assert.equal(h.state.codes.length, 0)
  await assert.rejects(h.phoneController.verifyCode(h.request({ phone: '09170000001', code: realCode }), h.response()), codeIs('INVALID_CODE'))
  assert.equal(h.policy.verifiedPhone(h.request()), null)
})

test('expired codes and forged or expired phone proofs cannot authorize bookings', async () => {
  const h = harness()
  await h.phoneController.requestCode(h.request({ phone: '09170000001' }), h.response())
  h.state.codes[0].expires_at = new Date(Date.now() - 1000)
  await assert.rejects(h.phoneController.verifyCode(h.request({ phone: '09170000001', code: h.messages[0].code }), h.response()), codeIs('INVALID_CODE'))
  h.cookies.guest_booking_phone = 'forged'
  await assert.rejects(submit(h), codeIs('GUEST_PHONE_VERIFICATION_REQUIRED'))
  const jwt = require('jsonwebtoken'), secret = 'synthetic-guest-test-secret-at-least-32-chars'
  h.cookies.guest_booking_phone = jwt.sign({ phone: '639170000001', purpose: 'guest_booking_phone' }, secret, { audience: 'guest-booking', expiresIn: -1 })
  await assert.rejects(submit(h), codeIs('GUEST_PHONE_VERIFICATION_REQUIRED'))
  h.cookies.guest_booking_phone = jwt.sign({ phone: '639170000001', purpose: 'guest_booking_phone' }, secret, { audience: 'patient', expiresIn: 1800 })
  await assert.rejects(submit(h), codeIs('GUEST_PHONE_VERIFICATION_REQUIRED'))
  assert.equal(h.state.appointments.length, 0)
})

test('provider unavailability and delivery failure never mark a number verified', async () => {
  const h = harness()
  h.settings.smsAvailable = false
  await assert.rejects(h.phoneController.requestCode(h.request({ phone: '09170000001' }), h.response()), codeIs('SMS_UNAVAILABLE'))
  assert.equal(h.state.codes.length, 0)
  h.settings.smsAvailable = true; h.settings.failDelivery = true
  await assert.rejects(h.phoneController.requestCode(h.request({ phone: '09170000001' }), h.response()), codeIs('SMS_DELIVERY_FAILED'))
  assert.equal(h.state.codes.length, 0)
  assert.equal(h.policy.verifiedPhone(h.request()), null)
})

test('changing one mobile digit requires another SMS verification', async () => {
  const h = harness()
  await h.verified('09170000001')
  await assert.rejects(submit(h, { phone: '09170000002' }), codeIs('GUEST_PHONE_VERIFICATION_REQUIRED'))
  assert.equal(h.state.appointments.length, 0)
})

test('three successful guest bookings reuse one guest and the fourth is rejected across branches', async () => {
  const h = harness()
  await h.verified('09170000001')
  for (let i = 0; i < 3; i++) {
    const result = await submit(h, { branch_id: i + 1, doctor_id: i + 8 })
    assert.equal(result.statusCode, 201)
    assert.equal(result.body.daily_limit.remaining, 2 - i)
  }
  await assert.rejects(submit(h, { branch_id: 4 }), codeIs('GUEST_DAILY_LIMIT'))
  assert.equal(h.state.patients.length, 1)
  assert.equal(h.state.appointments.length, 3)
  assert.ok(h.validations.every(row => row.patientId === 1))
  assert.equal(h.locks.size, 0)
})

test('parallel requests cannot race past the three-booking limit', async () => {
  const h = harness()
  await h.verified('09170000001')
  const results = await Promise.allSettled(Array.from({ length: 4 }, (_, i) => submit(h, { doctor_id: 8 + i })))
  assert.equal(results.filter(result => result.status === 'fulfilled').length, 3)
  assert.equal(results.find(result => result.status === 'rejected').reason.code, 'GUEST_DAILY_LIMIT')
  assert.equal(h.state.appointments.length, 3)
  assert.equal(h.state.patients.length, 1)
  assert.equal(h.locks.size, 0)
})

test('failed slot validation rolls back the patient and does not consume the daily quota', async () => {
  const h = harness()
  await h.verified('09170000001')
  h.settings.rejectSlot = true
  await assert.rejects(submit(h), codeIs('APPOINTMENT_TIME_CONFLICT'))
  assert.equal(h.state.appointments.length, 0)
  assert.equal(h.state.patients.length, 0)
  h.settings.rejectSlot = false
  assert.equal((await submit(h)).body.daily_limit.remaining, 2)
})

test('lost response retries return the same private token without another booking, quota use or notification', async () => {
  const h = harness(), key = crypto.randomUUID()
  await h.verified('09170000001')
  const lost = h.response(); lost.json = () => { throw Error('Synthetic response lost') }
  await assert.rejects(h.booking.create(h.request(h.body({ submission_key: key })), lost), /Synthetic response lost/)
  const retried = await submit(h, { submission_key: key })
  assert.equal(retried.statusCode, 200)
  assert.equal(retried.body.replayed, true)
  assert.equal(retried.body.daily_limit.used, 1)
  assert.equal(h.state.appointments.length, 1)
  assert.equal(h.notifications.length, 1)
  const recovered = h.response()
  await h.booking.recover(h.request({ phone: '09170000001', submission_key: key }), recovered)
  assert.equal(recovered.body.id, retried.body.id)
  assert.equal(recovered.body.access_token, retried.body.access_token)
})

test('idempotent recovery still works after the third booking fills the daily quota', async () => {
  const h = harness(), key = crypto.randomUUID()
  await h.verified('09170000001')
  await submit(h); await submit(h)
  const third = await submit(h, { submission_key: key })
  assert.equal(third.body.daily_limit.remaining, 0)
  const retry = await submit(h, { submission_key: key })
  assert.equal(retry.body.id, third.body.id)
  assert.equal(h.state.appointments.length, 3)
})

test('existing patient portal accounts are never reused or changed by guest booking', async () => {
  const h = harness({ patients: [{ id: 90, full_name: 'Existing Account', gender: 'Female', phone: '639170000001', password: 'synthetic-hash', consent_method: 'portal_registration' }] })
  const verified = await h.verified('09170000001')
  assert.equal(verified.body.requires_sign_in, true)
  assert.equal(verified.body.patient, null)
  await assert.rejects(submit(h), codeIs('EXISTING_PATIENT'))
  assert.equal(h.state.patients[0].full_name, 'Existing Account')
  assert.equal(h.state.appointments.length, 0)
})

test('guest promotion submissions are rejected and client-supplied prices never reduce regular prices', async () => {
  const h = harness()
  await h.verified('09170000001')
  for (const field of ['promotion_id', 'selected_promotion_id', 'promotion', 'discount_amount']) await assert.rejects(submit(h, { [field]: 100 }), codeIs('GUEST_PROMOTIONS_NOT_ALLOWED'))
  await submit(h, { default_price: 1, requested_service_price_snapshot: 1, notes: 'Saved clinical note' })
  assert.equal(h.state.appointments[0].price, 650)
  assert.equal(h.state.appointments[0].notes, 'Saved clinical note')
})

test('daily quota uses Philippine midnight and counts cancelled requests, with no IP or branch filter', async () => {
  const h = harness({ patients: [{ id: 1, phone: '639170000001' }], appointments: [{ patient_id: 1, source: 'guest_online', status: 'cancelled', created_at: '2026-11-12 23:59:59' }] })
  assert.equal((await h.policy.readDailyQuota(h.db, '639170000001', new Date('2026-11-12T15:59:59Z'))).used, 1)
  assert.equal((await h.policy.readDailyQuota(h.db, '639170000001', new Date('2026-11-12T16:00:00Z'))).used, 0)
  assert.equal(h.calls.at(-1).values[3], '2026-11-13 00:00:00')
  assert.equal(h.calls.at(-1).values[4], '2026-11-14 00:00:00')
  assert.doesNotMatch(h.calls.at(-1).sql, /branch_id|ip_address|status=/)
})

test('daily limits survive a new application instance reading the same stored bookings', async () => {
  const first = harness()
  await first.verified('09170000001')
  await submit(first); await submit(first); await submit(first)
  const restarted = harness(first.state)
  await restarted.verified('09170000001')
  await assert.rejects(submit(restarted), codeIs('GUEST_DAILY_LIMIT'))
})
