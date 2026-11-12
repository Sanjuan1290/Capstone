const test = require('node:test'), assert = require('node:assert/strict')
const { harness } = require('./helpers/appointmentContactsHarness.cjs')
const response = () => ({ statusCode: 200, status(value) { this.statusCode = value; return this }, json(body) { this.body = body; return this } })

test('branch appointment read returns stored phone/email for guest appointments without widening branch scope', async () => {
  const h = harness(), res = response()
  await h.handler({ branchId: 1, query: {} }, res)
  assert.equal(res.body.length, 1)
  assert.equal(res.body[0].patient_phone, '639170000011')
  assert.equal(res.body[0].patient_email, 'guest@example.test')
  assert.equal(res.body[0].appointment_source, 'guest_online')
  assert.deepEqual(Array.from(h.calls[0].values), [1])
})

test('appointment contact read preserves date binding and rejects invalid dates before querying', async () => {
  const h = harness(), res = response()
  await h.handler({ branchId: 2, query: { date: '2026-11-13' } }, res)
  assert.deepEqual(Array.from(h.calls[0].values), [2, '2026-11-13'])
  assert.equal(res.body[0].patient_phone, '639170000012')
  const invalid = response()
  await h.handler({ branchId: 2, query: { date: 'invalid' } }, invalid)
  assert.equal(invalid.statusCode, 400)
  assert.equal(h.calls.length, 1)
})
