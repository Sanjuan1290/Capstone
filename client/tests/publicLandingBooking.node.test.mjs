import test from 'node:test'
import assert from 'node:assert/strict'
import { patientReturnPath } from '../src/utils/patientReturnPath.mjs'

test('only known patient paths survive sign in', () => {
  assert.equal(patientReturnPath('/patient/book?branch_id=3&doctor=8&clinic=derma'), '/patient/book?branch_id=3&doctor=8&clinic=derma')
  assert.equal(patientReturnPath('/patient/book?service_id=25&clinic=medical&branch_id=4'), '/patient/book?branch_id=4&service_id=25&clinic=medical')
  assert.equal(patientReturnPath('//evil.com'), '/patient')
  assert.equal(patientReturnPath('/patient/login'), '/patient')
  assert.equal(patientReturnPath('https://evil.example'), '/patient')
  assert.equal(patientReturnPath('/patient/book?clinic=invalid&branch_id=%2F'), '/patient/book')
})
