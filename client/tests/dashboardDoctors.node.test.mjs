import test from 'node:test'
import assert from 'node:assert/strict'
import { doctorAvailabilityLabel, doctorDisplayName, isDoctorAvailable } from '../src/pages/adminPage/dashboardDoctors.mjs'

test('dashboard reflects the branch API available/inactive contract', () => {
  const available = { full_name: 'A. Doctor', status: 'available' }
  const inactive = { full_name: 'B. Doctor', status: 'inactive' }

  assert.equal(isDoctorAvailable(available), true)
  assert.equal(isDoctorAvailable(inactive), false)
  assert.equal(doctorDisplayName(available), 'A. Doctor')
  assert.equal(doctorAvailabilityLabel(available), 'Available')
  assert.equal(doctorAvailabilityLabel(inactive), 'Inactive')
})

test('dashboard retains compatible handling for existing name and on-duty fields', () => {
  const onDuty = { name: 'C. Doctor', status: 'on-duty' }

  assert.equal(isDoctorAvailable(onDuty), true)
  assert.equal(doctorDisplayName(onDuty), 'C. Doctor')
  assert.equal(doctorAvailabilityLabel(onDuty), 'On duty')
})

