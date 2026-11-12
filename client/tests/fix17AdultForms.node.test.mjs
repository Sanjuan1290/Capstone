import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import path from 'node:path'
import { getMaxPatientBirthdate, validatePatientBirthdate } from '../src/utils/patientBirthdate.mjs'
import { guestPatientError } from '../src/utils/guestBookingFlow.mjs'
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const read = p => readFileSync(path.join(root,p),'utf8')

test('guest birthdate is mandatory and age-only submission is never accepted',()=>{
 const profile = {full_name:'Synthetic Guest',gender:'Female',consent_given:true,reported_age:'35'}
 assert.match(guestPatientError(profile),/Birthdate is required/)
 assert.match(guestPatientError({...profile,birthdate:'2012-01-01'}),/18 years old/)
 assert.equal(guestPatientError({...profile,birthdate:'1990-01-01'}),'')
 const page = read('src/pages/patientPage/GuestBookAppointment.jsx')
 assert.doesNotMatch(page,/label="Age \(required without birthdate\)"/)
 assert.match(page,/label="Birthdate \* \(18 years or older\)"/)
 assert.doesNotMatch(page,/\.\.\.patient, phone: normalizedPhone/)
 assert.match(page,/getMaxPatientBirthdate\(\)/)
})
test('birthdate control permits patients who turned 18 today, not tomorrow',()=>{
 const now=new Date('2026-11-12T04:30:00.000Z')
 assert.equal(getMaxPatientBirthdate(now),'2008-11-12')
 assert.equal(validatePatientBirthdate('2008-11-12',now),'')
 assert.match(validatePatientBirthdate('2008-11-13',now),/18 years old/)
})
test('registration and staff-assisted forms limit date selection, and age-only intake starts at 18',()=>{
 for(const p of ['src/pages/auth/Patient/PatientRegister.jsx','src/pages/shared/AppointmentCreatePage.jsx','src/pages/staffPage/Staff_WalkInQueue.jsx']) {
  assert.match(read(p),/getMaxPatientBirthdate/)
 }
 const staff=read('src/pages/shared/AppointmentCreatePage.jsx')
 assert.match(staff,/min="18" max="120"/)
 assert.match(staff,/Number\(patientFields\.reported_age\)>=18/)
})
