import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { patientEmailIsVerified, isEditingDifferentEmail, getVerifiedPatientAccount } from '../src/utils/patientEmailVerification.mjs'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const read = rel => fs.readFileSync(path.join(root, rel), 'utf8')

test('only a persisted verified timestamp means the email is verified', () => {
  assert.equal(patientEmailIsVerified({email:'x@example.test',email_verified_at:'2026-11-01T05:00:00Z'}),true)
  assert.equal(patientEmailIsVerified({email:'x@example.test',email_verified_at:null}),false)
  assert.equal(patientEmailIsVerified({email:'',email_verified_at:'2026-11-01T05:00:00Z'}),false)
  assert.equal(patientEmailIsVerified(null),false)
})
test('verified status belongs to the signed-in patient only', () => {
  assert.equal(getVerifiedPatientAccount({id:7,email:'x@example.test',email_verified_at:'2026-11-01'},7),'verified')
  assert.equal(getVerifiedPatientAccount({id:7,email:'x@example.test',email_verified_at:null},7),'unverified')
  assert.throws(()=>getVerifiedPatientAccount({id:8,email:'x@example.test',email_verified_at:'2026-11-01'},7), /could not confirm verification/i)
  assert.throws(()=>getVerifiedPatientAccount(null,7), /could not confirm verification/i)
})
test('editing email removes verified appearance until saved and re-verified', () => {
  assert.equal(isEditingDifferentEmail('new@example.test','old@example.test'),true)
  assert.equal(isEditingDifferentEmail(' OLD@example.test ','old@example.test'),false)
})
test('booking refreshes server status on entry and focus and stops on status lookup error', () => {
  const s = read('src/pages/patientPage/BookAppointment.jsx')
  assert.match(s,/const current = await getSettings\('patient'\)/)
  assert.match(s,/getVerifiedPatientAccount\(current, patientId\)/)
  assert.match(s,/emailStatus !== 'verified'/)
  assert.match(s,/setEmailStatus\('error'\)/)
  assert.match(s,/visibilitychange/)
  assert.match(s,/addEventListener\('focus'/)
  assert.match(s,/emailVerificationNotice/)
  assert.doesNotMatch(s,/!user\?\.email_verified_at/)
})
test('patient Settings displays status adjacent to email in view and edit mode', () => {
  const s = read('src/pages/shared/SettingsPage.jsx')
  assert.match(s,/label === 'Email' && form.email/)
  assert.match(s,/emailVerified \? 'Verified' : 'Not Verified'/)
  assert.match(s,/Save the new email address/)
  assert.match(s,/const saved = await getSettings\('patient'\)/)
  assert.match(s,/isSamePatientAccount\(data, current\?\.id\)/)
  assert.doesNotMatch(s,/const verifiedAt = result\?\.email_verified_at \|\| new Date/)
})
test('server retains database enforcement and invalidates changed email', () => {
  const controller = fs.readFileSync(path.resolve(root,'../server/controllers/patient.controller.js'),'utf8')
  const settings = fs.readFileSync(path.resolve(root,'../server/utils/accountSettings.js'),'utf8')
  assert.match(controller,/if \(!patient\.email_verified_at\) return res.status\(403\)/)
  assert.match(settings,/emailChanged \? null : current.email_verified_at/)
})
