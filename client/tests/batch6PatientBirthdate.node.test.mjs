import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { getClinicToday, getMinPatientBirthdate, isValidPatientDate, validatePatientBirthdate } from '../src/utils/patientBirthdate.mjs'
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const midnight = new Date('2026-10-25T16:30:00.000Z')

test('patient form uses the Manila date at local midnight', () => {
  assert.equal(getClinicToday(midnight), '2026-10-26')
  assert.equal(getMinPatientBirthdate(midnight), '1926-10-26')
  assert.equal(validatePatientBirthdate('2026-10-26', midnight), '')
  assert.equal(validatePatientBirthdate('2026-10-27', midnight), 'Birthdate cannot be in the future.')
})
test('rejects calendar rollover, malformed strings and timestamps', () => {
  assert.equal(isValidPatientDate('2000-02-29'), true)
  for (const value of ['1900-02-29', '2026-02-31', '2026-04-31', '0000-01-01', '2026-12-32', '2026-10-26T00:00:00Z']) {
    assert.equal(isValidPatientDate(value), false, value)
    assert.equal(validatePatientBirthdate(value, midnight), 'Enter a valid birthdate.', value)
  }
})
test('supports newborns and exact 100-year boundary', () => {
  assert.equal(validatePatientBirthdate('2026-10-25', midnight), '')
  assert.equal(validatePatientBirthdate('1926-10-26', midnight), '')
  assert.equal(validatePatientBirthdate('1925-10-26', midnight), 'Patient age cannot exceed 100 years.')
  assert.equal(validatePatientBirthdate('', midnight), 'Birthdate is required.')
})
test('registration, admin and staff intake use shared clinic-date bounds', () => {
  for(const rel of ['src/pages/auth/Patient/PatientRegister.jsx', 'src/pages/shared/Appointments.jsx','src/pages/staffPage/Staff_WalkInQueue.jsx']){
    const source=fs.readFileSync(path.join(root,rel),'utf8')
    assert.match(source,/patientBirthdate\.mjs/,rel)
    assert.match(source,/getClinicToday/,rel)
    assert.match(source,/getMinPatientBirthdate/,rel)
  }
})

