const test = require('node:test'), assert = require('node:assert/strict'), bcrypt = require('bcrypt')
const { harness, walkIn } = require('./helpers/patientRegistrationHarness.cjs')
const begin = async (h, values = {}) => h.call('register', h.body(values))
const verify = (h, code = h.messages.at(-1).code) => h.call('verifyRegistration', { phone: '09170000001', code })

test('walk-in email can register and SMS activation upgrades the same patient without changing visit or financial history', async () => {
  const h = harness([walkIn()]), history = JSON.stringify({ appointments: h.state.appointments, bills: h.state.bills })
  assert.equal((await begin(h)).statusCode, 200)
  assert.equal(h.state.patients[0].password, null)
  assert.equal(h.sessions.length, 0)
  const pending = h.state.pending[0], payload = JSON.parse(pending.payload)
  assert.equal(payload.linked_patient_id, 42)
  assert.notEqual(pending.otp_code, h.messages[0].code)
  assert.notEqual(payload.password, h.body().password)
  const result = await verify(h)
  assert.equal(result.statusCode, 201); assert.equal(result.body.user.id, 42)
  assert.equal(h.state.patients.length, 1)
  const row = h.state.patients[0]
  assert.equal(row.is_walk_in, 0); assert.equal(row.session_version, 8); assert.equal(row.civil_status, 'Single')
  assert.equal(row.consent_method, 'online_registration'); assert.ok(row.phone_verified_at)
  assert.equal(row.email_verified_at, null)
  assert.equal(await bcrypt.compare(h.body().password, row.password), true)
  assert.equal(h.state.pending.length, 0); assert.equal(h.state.consents[0].patient_id, 42)
  assert.equal(h.state.audits[0].action, 'patient.portal_account_activated')
  assert.deepEqual(h.sessions, [{ role: 'patient', id: 42 }])
  assert.equal(JSON.stringify({ appointments: h.state.appointments, bills: h.state.bills }), history)
})
test('registration normalizes case and phone formatting when linking the walk-in record', async () => {
  const h = harness([walkIn({ email: 'WalkIn@Example.Test', phone: '+63 917 000 0001', full_name: 'SYNTHETIC  WALK IN' })])
  assert.equal((await begin(h, { email: ' WALKIN@EXAMPLE.TEST ' })).statusCode, 200)
  assert.equal((await verify(h)).body.user.id, 42)
})
test('real patient accounts remain protected even when an old is_walk_in flag is still 1', async () => {
  for (const values of [{ is_walk_in: 0 }, { password: 'existing-password-hash' }]) {
    const h = harness([walkIn(values)])
    assert.equal((await begin(h)).statusCode, 409)
    assert.equal(h.messages.length, 0); assert.equal(h.sessions.length, 0)
  }
})
test('an email-only match with a different or missing mobile cannot claim a walk-in history', async () => {
  for (const storedPhone of ['09170000002', null]) {
    const h = harness([walkIn({ phone: storedPhone })])
    const result = await begin(h)
    assert.equal(result.statusCode, 409); assert.equal(result.body.code, 'WALK_IN_CONTACT_MISMATCH')
    assert.equal(h.messages.length, 0); assert.equal(h.state.patients[0].password, null)
  }
})
test('identity mismatches and banned walk-ins do not overwrite the patient record', async () => {
  for (const values of [{ full_name: 'Another Patient' }, { birthdate: '2000-01-01' }, { gender: 'Female' }, { is_banned: 1 }]) {
    const h = harness([walkIn(values)]), snapshot = JSON.stringify(h.state.patients)
    assert.ok([403,409].includes((await begin(h)).statusCode))
    assert.equal(h.messages.length, 0); assert.equal(JSON.stringify(h.state.patients), snapshot)
  }
})
test('a different registered patient owning the requested email blocks registration', async () => {
  const h = harness([walkIn({ email: 'old@example.test' }), walkIn({ id: 50, phone: '09170000002', is_walk_in: 0 })])
  const result = await begin(h)
  assert.equal(result.statusCode, 409); assert.equal(result.body.code, 'PATIENT_EMAIL_IN_USE')
  assert.equal(h.messages.length, 0)
})
test('invalid and expired OTPs do not activate credentials; five wrong attempts invalidate the code', async () => {
  const h = harness([walkIn()]); await begin(h)
  for (let i = 1; i <= 5; i++) {
    assert.equal((await verify(h, '000000')).statusCode, 400)
    assert.equal(h.state.patients[0].password, null)
    if (i < 5) assert.equal(h.state.pending[0].attempt_count, i)
  }
  assert.equal(h.state.pending.length, 0); assert.equal(h.sessions.length, 0)
  const expired = harness([walkIn()]); await begin(expired)
  expired.state.pending[0].expires_at = new Date(Date.now() - 1000)
  assert.equal((await verify(expired)).statusCode, 400); assert.equal(expired.state.patients[0].password, null)
})
test('verification rechecks credentials and email ownership changed after sending the OTP', async () => {
  const account = harness([walkIn()]); await begin(account)
  account.state.patients[0].password = 'newly-created-existing-password'
  assert.equal((await verify(account)).statusCode, 409)
  assert.equal(account.state.patients[0].password, 'newly-created-existing-password')
  const email = harness([walkIn({ email: 'old@example.test' })]); await begin(email)
  email.state.patients.push(walkIn({ id: 50, phone: '09170000002', is_walk_in: 0 }))
  assert.equal((await verify(email)).statusCode, 409); assert.equal(email.sessions.length, 0)
})
test('activation and OTP consumption roll back if consent, audit or uniqueness checks fail', async () => {
  for (const setting of ['failConsent','failAudit','failDuplicate']) {
    const h = harness([walkIn()]); await begin(h)
    h.settings[setting] = true
    if (setting === 'failDuplicate') assert.equal((await verify(h)).statusCode, 409)
    else await assert.rejects(verify(h), /Synthetic/)
    assert.equal(h.state.patients[0].password, null); assert.equal(h.state.pending.length, 1)
    assert.equal(h.state.consents.length, 0); assert.equal(h.state.audits.length, 0); assert.equal(h.sessions.length, 0)
  }
})
test('simultaneous verification cannot activate twice or issue a second session', async () => {
  const h = harness([walkIn()]); await begin(h)
  const results = await Promise.all([verify(h), verify(h)])
  assert.deepEqual(results.map(row => row.statusCode).sort(), [201,400])
  assert.equal(h.state.consents.length, 1); assert.equal(h.state.audits.length, 1); assert.equal(h.sessions.length, 1)
})
test('a new patient without a matching walk-in still registers normally', async () => {
  const h = harness()
  assert.equal((await begin(h)).statusCode, 200)
  assert.equal((await verify(h)).statusCode, 201)
  assert.equal(h.state.patients.length, 1); assert.equal(h.state.patients[0].is_walk_in, 0)
  assert.equal(h.state.patients[0].email_verified_at, null)
})
test('an unused email may replace the walk-in email only after verified mobile ownership', async () => {
  const h = harness([walkIn({ email: 'old@example.test', email_verified_at: '2026-01-01' })])
  await begin(h)
  assert.equal(h.state.patients[0].email, 'old@example.test')
  await verify(h)
  assert.equal(h.state.patients[0].email, 'walkin@example.test'); assert.equal(h.state.patients[0].email_verified_at, null)
})
test('missing legacy demographics can be completed while an unchanged verified email remains verified', async () => {
  const h = harness([walkIn({ birthdate: null, gender: null, sex: null, email_verified_at: '2026-01-01' })])
  await begin(h)
  assert.equal((await verify(h)).statusCode, 201)
  assert.equal(h.state.patients[0].birthdate, '2005-01-18')
  assert.equal(h.state.patients[0].email_verified_at, '2026-01-01')
})
test('a patient record introduced after the OTP request cannot silently change the activation target', async () => {
  const h = harness(); await begin(h)
  h.state.patients.push(walkIn())
  const result = await verify(h)
  assert.equal(result.statusCode, 409); assert.equal(result.body.code, 'PATIENT_RECORD_CHANGED')
  assert.equal(h.state.patients[0].password, null); assert.equal(h.sessions.length, 0)
})
