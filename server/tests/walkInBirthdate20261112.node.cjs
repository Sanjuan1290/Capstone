const test = require('node:test'), assert = require('node:assert/strict')
const { validateBirthdate, validateWalkInBirthdate } = require('../utils/patientProfile')
const { harness } = require('./helpers/walkInBirthdateHarness.cjs')
const now = new Date('2026-11-11T16:30:00Z') // Nov 12 in Manila.
const response = () => ({ statusCode: 200, status(value) { this.statusCode = value; return this }, json(body) { this.body = body; return this } })

test('walk-in birthdate is mandatory, permits yesterday at age zero and rejects today/future/invalid dates', () => {
  assert.equal(validateWalkInBirthdate('2026-11-11', now), null)
  assert.equal(validateWalkInBirthdate('2015-02-01', now), null)
  assert.equal(validateWalkInBirthdate('1900-01-01', now), null)
  assert.equal(validateWalkInBirthdate('', now), 'Birthdate is required.')
  assert.equal(validateWalkInBirthdate('2026-11-12', now), 'Birthdate must be before today.')
  assert.equal(validateWalkInBirthdate('2026-11-13', now), 'Birthdate cannot be in the future.')
  for (const value of ['2026-02-30', '2026-11-11T00:00:00Z', 'invalid']) assert.equal(validateWalkInBirthdate(value, now), 'Enter a valid birthdate.')
  assert.match(validateBirthdate('2015-02-01', now), /18 years/)
  assert.equal(validateBirthdate('2000-01-01', now), null)
})

for (const role of ['admin', 'staff']) {
  test(`${role} walk-in registration saves a child birthdate and consent without a reported-age fallback`, async () => {
    const h = harness(role), res = response()
    await h.controller({ body: { full_name: 'Synthetic Child', phone: '09170000001', birthdate: '2026-11-11', reported_age: 90, sex: 'Female', consent_given: true }, user: { id: 8, role }, ip: '127.0.0.1' }, res)
    assert.equal(res.statusCode, 201)
    assert.equal(res.body.birthdate, '2026-11-11')
    const saved = h.calls.find(call => call.sql.includes('INSERT INTO patients'))
    assert.equal(saved.values[1], '2026-11-11'); assert.equal(saved.values[2], null)
    assert.ok(h.calls.some(call => call.sql.startsWith('INSERT INTO patient_consents')))
    assert.equal(h.audits[0].action, 'patient.walkin_registered')
  })
  test(`${role} refuses age-only registration and today's birthdate without creating patient records`, async () => {
    for (const birthdate of [undefined, '2026-11-12', '2026-11-13', '2026-02-30']) {
      const h = harness(role), res = response()
      await h.controller({ body: { full_name: 'Synthetic Child', phone: '09170000001', birthdate, reported_age: 30, sex: 'Female', consent_given: true }, user: { id: 8, role } }, res)
      assert.equal(res.statusCode, 400)
      assert.ok(h.calls.every(call => call.sql.startsWith('SELECT')))
      assert.equal(h.audits.length, 0)
    }
  })
}
