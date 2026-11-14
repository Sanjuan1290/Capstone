const test = require('node:test'), assert = require('node:assert/strict'), crypto = require('node:crypto')
const fs = require('node:fs'), vm = require('node:vm')
const jwt = require('jsonwebtoken'), express = require('express'), request = require('supertest')
require('express-async-errors')
const { harness } = require('./helpers/guestBookingHarness.cjs')
const phone = '639170000001'
const seed = () => ({ patients: [{ id: 1, phone, consent_method: 'guest_online' }, { id: 2, phone: '639170000002', consent_method: 'guest_online' }], appointments: [] })
const appointment = (id, values = {}) => ({ id, patient_id: 1, source: 'guest_online', status: 'pending', appointment_date: '2026-11-13', appointment_time: '10:00 AM', branch_id: 1, ...values })
const lookup = async (h, values = {}) => { const res = h.response(); await h.booking.lookup(h.request({ phone, ...values }), res); return res }
const status = async (h, id, token = '') => { const res = h.response(); await h.booking.status({ ...h.request(), params: { id }, get: () => token }, res); return res }
const codeIs = code => error => error.code === code

test('phone lookup requires matching, unexpired SMS proof before querying any appointments', async () => {
  const h = harness(seed())
  await assert.rejects(lookup(h), codeIs('GUEST_PHONE_VERIFICATION_REQUIRED'))
  assert.equal(h.calls.length, 0)
  await h.verified(phone)
  const before = h.calls.length
  await assert.rejects(lookup(h, { phone: '09170000002' }), codeIs('GUEST_PHONE_VERIFICATION_REQUIRED'))
  assert.equal(h.calls.length, before)
  h.cookies.guest_booking_phone = jwt.sign({ purpose: 'guest_booking_phone', phone }, 'synthetic-guest-test-secret-at-least-32-chars', { audience: 'guest-booking', expiresIn: -1 })
  await assert.rejects(lookup(h), codeIs('GUEST_PHONE_VERIFICATION_REQUIRED'))
  assert.equal(h.calls.length, before)
})

test('verified lookup returns only unfinished guest bookings for that mobile across branches', async () => {
  const fixture = seed()
  fixture.appointments = ['pending','confirmed','rescheduled','in-progress','completed','cancelled','rejected','no_show'].map((value, i) => appointment(i + 1, { status: value, branch_id: i + 1, branch_name: 'Branch ' + (i + 1), notes: 'Private clinical note' }))
  fixture.appointments.push(appointment(20, { patient_id: 2 }), appointment(21, { source: 'online' }))
  const h = harness(fixture); await h.verified(phone)
  const res = await lookup(h, { phone: '+63 917 000 0001' })
  assert.deepEqual(Array.from(res.body.items, row => row.id), [4,3,2,1])
  assert.equal(res.body.items[0].branch_name, 'Branch 4')
  assert.equal(res.body.items[0].reference, 'G-4')
  assert.equal(res.body.next_cursor, null)
  assert.match(res.headers['cache-control'], /private.*no-store/)
  for (const row of res.body.items) assert.deepEqual(Object.keys(row).sort(), ['appointment_date','appointment_time','branch_name','doctor_name','id','reference','service_name','status'].sort())
})

test('lookup paginates unfinished bookings without dropping or repeating rows', async () => {
  const h = harness({ ...seed(), appointments: Array.from({ length: 45 }, (_, i) => appointment(i + 1)) })
  await h.verified(phone)
  const first = (await lookup(h)).body, second = (await lookup(h, { before_id: first.next_cursor })).body, third = (await lookup(h, { before_id: second.next_cursor })).body
  assert.equal(first.items.length, 20); assert.equal(second.items.length, 20); assert.equal(third.items.length, 5)
  assert.equal(first.next_cursor, 26); assert.equal(second.next_cursor, 6); assert.equal(third.next_cursor, null)
  const ids = [...first.items, ...second.items, ...third.items].map(row => row.id)
  assert.equal(new Set(ids).size, 45)
  for (const before_id of [0, -1, 1.2, '1 OR 1=1', '']) await assert.rejects(lookup(h, { before_id }), codeIs('INVALID_APPOINTMENT_CURSOR'))
})

test('a verified number with no unfinished guest bookings receives an empty result', async () => {
  const h = harness({ ...seed(), appointments: [appointment(1, { status: 'completed' }), appointment(2, { patient_id: 2 })] })
  await h.verified(phone)
  assert.equal((await lookup(h)).body.items.length, 0)
})

test('looking up appointments is read-only and works after the booking quota is exhausted', async () => {
  const h = harness(); await h.verified(phone)
  for (let i = 0; i < 3; i++) { const res = h.response(); await h.booking.create(h.request(h.body({ full_name: 'Synthetic Guest', phone, doctor_id: 8 + i, submission_key: crypto.randomUUID() })), res) }
  const quota = await h.policy.readDailyQuota(h.db, phone)
  assert.equal(quota.remaining, 0)
  const saved = JSON.stringify(h.state), before = h.calls.length, sent = h.messages.length
  assert.equal((await lookup(h)).body.items.length, 3)
  assert.equal(JSON.stringify(h.state), saved)
  assert.equal(h.messages.length, sent)
  assert.ok(h.calls.slice(before).every(call => call.sql.startsWith('SELECT')))
})

test('SMS-authenticated detail checks ownership and shows the latest status including completion', async () => {
  const h = harness({ ...seed(), appointments: [appointment(1), appointment(2, { patient_id: 2 }), appointment(3, { source: 'online' })] })
  await h.verified(phone)
  assert.equal((await status(h, 1)).body.status, 'pending')
  h.state.appointments[0].status = 'completed'
  assert.equal((await status(h, 1)).body.status, 'completed')
  assert.equal((await status(h, 2)).statusCode, 404)
  assert.equal((await status(h, 3)).statusCode, 404)
  delete h.cookies.guest_booking_phone
  await assert.rejects(status(h, 1), codeIs('GUEST_PHONE_VERIFICATION_REQUIRED'))
})

test('existing private links still work without an SMS session and invalid links remain blocked', async () => {
  const token = crypto.randomBytes(32).toString('base64url')
  const h = harness({ ...seed(), appointments: [appointment(1, { status: 'cancelled' })], access: [{ appointment_id: 1, token_hash: crypto.createHash('sha256').update(token).digest('hex') }] })
  assert.equal((await status(h, 1, token)).body.status, 'cancelled')
  assert.equal((await status(h, 2, token)).statusCode, 404)
  assert.equal((await status(h, 1, 'invalid')).statusCode, 404)
  h.state.access[0].expires_at = '2000-01-01T00:00:00Z'
  assert.equal((await status(h, 1, token)).statusCode, 404)
  await h.verified(phone)
  assert.equal((await status(h, 1)).body.reference, 'G-1')
})

test('the actual guest router wires protected lookup and phone-authenticated status responses', async () => {
  const h = harness({ ...seed(), appointments: [appointment(1)] }); await h.verified(phone)
  const pass = (req,res,next) => next(), noop = (req,res) => res.json({}), callbacks = new Proxy({}, { get: () => noop })
  const dependencies = { express, '../utils/consultationFollowups':{listPatientFollowups:noop}, '../controllers/guestBooking.controller': h.booking, '../controllers/guestPhoneVerification.controller': h.phoneController, '../controllers/patient.controller': callbacks, '../controllers/common.controller': callbacks, '../controllers/promotions.controller': callbacks,
    '../middlewares/rateLimit.middleware': { otpRequestLimiter: pass, otpVerifyLimiter: pass, loginLimiter: pass, createRateLimiter: () => pass }, '../middlewares/auth.middleware': () => pass, '../middlewares/role.middleware': () => pass, '../db/connect': h.db }
  const module = { exports: {} }
  vm.runInNewContext(fs.readFileSync(require.resolve('../routers/patient.router.js'), 'utf8'), { module, require: name => dependencies[name] || {}, Date, console })
  const app = express(); app.use(express.json(), require('cookie-parser')()); app.use('/api/patient', module.exports)
  const cookie = 'guest_booking_phone=' + h.cookies.guest_booking_phone
  const denied = await request(app).post('/api/patient/guest/appointments/lookup').send({ phone }).expect(403)
  assert.equal(denied.body.code, 'GUEST_PHONE_VERIFICATION_REQUIRED')
  const found = await request(app).post('/api/patient/guest/appointments/lookup').set('Cookie', cookie).send({ phone }).expect(200)
  assert.equal(found.body.items[0].reference, 'G-1')
  assert.match(found.headers['cache-control'], /private.*no-store/)
  await request(app).post('/api/patient/guest/appointments/lookup').set('Cookie', cookie).send({ phone: '09170000002' }).expect(403)
  await request(app).get('/api/patient/guest/appointments/1').set('Cookie', cookie).expect(200)
  const detail = await request(app).get('/api/patient/guest/appointments/1').expect(403)
  assert.equal(detail.body.code, 'GUEST_PHONE_VERIFICATION_REQUIRED')
})
