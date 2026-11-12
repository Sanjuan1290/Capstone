'use strict'
const { test } = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const vm = require('node:vm')
const path = require('node:path')
const root = path.resolve(__dirname, '..')
const read = relative => fs.readFileSync(path.join(root, relative), 'utf8')
const patientProfile = require('../utils/patientProfile')

const loadGuestBooking = () => {
  const dbReads = []
  const fakeDb = { query: async sql => { dbReads.push(sql); throw Error('REACHED_DATABASE') } }
  const stubs = {
    crypto: require('node:crypto'),
    '../db/connect': fakeDb,
    '../utils/phone': { normalizePhilippinePhone: () => '639170000001' },
    '../utils/patientProfile': patientProfile,
    '../utils/appointmentSecurity': {}, '../utils/bookingPolicy': {},
    '../utils/date': require('../utils/date'),
    '../utils/notifications': {}, '../utils/sse': {}, '../utils/audit': {},
    '../utils/bookingReadiness': {},
    '../utils/guestBookingPolicy': { verifiedPhone: () => '639170000001' },
  }
  const mod = { exports: {} }
  vm.runInNewContext(read('controllers/guestBooking.controller.js'), { module: mod, exports: mod.exports, require(name) {
    assert.ok(Object.hasOwn(stubs, name), 'Unexpected import: ' + name)
    return stubs[name]
  } }, { filename: 'guestBooking.controller.js' })
  return { create: mod.exports.create, dbReads }
}
const request = overrides => ({ body: {full_name:'Synthetic Guest',gender:'Female',phone:'09170000001',consent_given:true,
  branch_id:1,doctor_id:8,requested_service_id:77,clinic_type:'medical',appointment_date:'2027-02-01',appointment_time:'10:00 AM',reason:'Other',reason_details:'Synthetic follow-up',birthdate:'1990-01-01',...overrides} })
const code = expected => err => err.code === expected

test('server validates the exact 18th birthday with Philippine date', () => {
  const today = new Date('2026-11-12T03:00:00Z')
  assert.equal(patientProfile.validateBirthdate('2008-11-12', today), null)
  assert.equal(patientProfile.validateBirthdate('2008-11-13', today), 'Patients must be at least 18 years old.')
  assert.equal(patientProfile.validateBirthdate('2012-01-01', today), 'Patients must be at least 18 years old.')
  assert.equal(patientProfile.validateBirthdate('1890-01-01', today), 'Patient age cannot exceed 100 years.')
})
test('missing guest birthdate is rejected without accessing clinic records', async () => {
  const h = loadGuestBooking()
  await assert.rejects(h.create(request({ birthdate:'', reported_age:35 }), {}), code('BIRTHDATE_REQUIRED'))
  assert.equal(h.dbReads.length, 0)
})
test('guest cannot bypass the 18+ rule by sending a reported age', async () => {
  const h = loadGuestBooking()
  await assert.rejects(h.create(request({ birthdate:'2015-01-01', reported_age:45 }), {}), code('INVALID_BIRTHDATE'))
  assert.equal(h.dbReads.length, 0)
})
test('valid adult guest reaches the normal branch/service checks', async () => {
  const h = loadGuestBooking()
  await assert.rejects(h.create(request({ birthdate:'1990-01-01' }), {}), /REACHED_DATABASE/)
  assert.equal(h.dbReads.length, 1)
})
test('walk-in age validation requires 18+ at server level', () => {
  const staff = read('controllers/staff.controller.js')
  const admin = read('controllers/admin.controller.js')
  assert.match(staff, /age<18 \|\| age>120/)
  assert.match(admin, /patientAge < 18 \|\| patientAge > 120/)
  assert.match(admin, /reported_age, gender, sex, phone/)
})
test('consultation start requires confirmation, and unused ID upload routes are disabled', () => {
  const doctor = read('../client/src/pages/doctorPage/Doctor_Appointments.jsx')
  assert.match(doctor, /setPendingStart\(\{ appointment: appt, kind: 'scheduled' \}\)/)
  assert.match(doctor, /setPendingStart\(\{ entry, kind: 'walkin' \}\)/)
  assert.match(doctor, /title="Start Consultation\?"/)
  assert.equal((doctor.match(/await startConsultation\(/g)||[]).length,2)
  for(const router of ['routers/admin.router.js','routers/staff.router.js','routers/branchPaymentSettingsWrites.js']) {
    assert.doesNotMatch(read(router), /router\.post\([^\n]*billing\/discount-proof\/upload/)
  }
  for(const page of ['../client/src/components/billing/BillCheckout.jsx','../client/src/pages/adminPage/Admin_CheckoutDetail.jsx','../client/src/pages/staffPage/Staff_CheckoutDetail.jsx']) {
    assert.doesNotMatch(read(page), /<DiscountProofField/)
  }
})
test('server calculates legacy discount without requiring a new ID upload', async () => {
  const source = read('utils/billingSecurity.js')
  const mod = { exports:{} }
  vm.runInNewContext(source, {module:mod,exports:mod.exports,require(name){
    if(name==='../db/connect')return {query:()=>{throw Error('Unexpected default DB')}}
    if(name==='./billing')return {roundMoney: v=> Math.round(Number(v)*100)/100}
    throw Error('unexpected module '+name)
  }})
  const executor = { query: async () => [[{id:9,label:'PWD',discount_type:'percentage',value:20,requires_reference:1,requires_admin_approval:0,is_active:1}]] }
  const result = await mod.exports.resolveDiscountForDraft({billingId:8,subtotal:1000,presetId:9},executor,{allowDirectAdmin:true})
  assert.equal(result.amount,200)
})
