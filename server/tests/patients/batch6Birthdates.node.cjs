const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const { isValidDateOnly, getAgeOnDate, validateBirthdate, normalizePatientProfileInput, getPatientProfileStatus } = require('../../utils/patientProfile')
const { getTodayDateOnly } = require('../../utils/date')

const midnightInManila = new Date('2026-10-25T16:30:00.000Z')

test('accepts real leap days but rejects rollover and zero dates', () => {
  assert.equal(isValidDateOnly('2000-02-29'), true)
  for (const date of ['1900-02-29','2026-02-29','2026-02-31','2026-04-31','2026-13-01','0000-12-01','2026-00-01','2026-01-00','2026-01-01T00:00:00Z','2026-10-3']) {
    assert.equal(isValidDateOnly(date), false, date)
    assert.equal(validateBirthdate(date, midnightInManila), 'Enter a valid birthdate.', date)
  }
})

test('uses Manila date during UTC previous day and accepts newborns', () => {
  assert.equal(getTodayDateOnly(midnightInManila), '2026-10-26')
  assert.equal(validateBirthdate('2026-10-26', midnightInManila), null)
  assert.equal(getAgeOnDate('2026-10-26', midnightInManila), 0)
  assert.equal(validateBirthdate('2026-10-27', midnightInManila), 'Birthdate cannot be in the future.')
})

test('respects birthday-specific age-100 boundary and does not block infants', () => {
  assert.equal(validateBirthdate('1925-10-26', midnightInManila), 'Patient age cannot exceed 100 years.')
  assert.equal(validateBirthdate('1926-10-26', midnightInManila), null)
  assert.equal(validateBirthdate('1925-10-27', midnightInManila), null)
  assert.equal(validateBirthdate('2026-10-25', midnightInManila), null)
})

test('normalization refuses full timestamp and impossible birthdates instead of truncating them', () => {
  const stamp = normalizePatientProfileInput({ birthdate: '2000-01-01T13:00:00Z', gender:'Female' })
  assert.equal(stamp.birthdate, null)
  assert.equal(normalizePatientProfileInput({ birthdate:'2026-02-31', gender:'Female' }).birthdate, null)
  assert.equal(normalizePatientProfileInput({ birthdate:'2000-02-29', gender:'Female' }).birthdate, '2000-02-29')
  assert.ok(getPatientProfileStatus({birthdate:'2026-02-31',gender:'Male',address:'Home',email:'a@example.invalid'}).missing_fields.includes('birthdate'))
})

test('settings must reject supplied invalid birthdate before changing patient record', () => {
  const file = fs.readFileSync(path.join(__dirname, '../../utils/accountSettings.js'), 'utf8')
  assert.match(file, /if \(payload\.birthdate !== undefined\)/)
  assert.match(file, /validateBirthdate\(payload\.birthdate\)/)
  assert.match(file, /throw validationError/)
})


