const {test} = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const Module = require('node:module')
const securityPath = require.resolve('../../utils/appointmentSecurity')
const originalLoad = Module._load
Module._load = function(request, parent, isMain) {
  if(parent?.filename?.includes('/utils/') && request === '../db/connect') return {query: async () => [[]]}
  if(parent?.filename === securityPath && request === './doctorAvailability')return {getDoctorUnavailableDate: async()=>null}
  return originalLoad.apply(this,arguments)
}
let security
try { delete require.cache[securityPath]; security = require(securityPath) }
finally { Module._load = originalLoad }

const now = new Date('2026-10-26T02:00:00.000Z') // 10 AM in Manila
const fakeExec = {
  query: async(sql) => {
    if(sql.includes('FROM doctors')) return [[{id:21,full_name:'Doctor A',clinic_type:'medical'}]]
    if(sql.includes('FROM doctor_schedules'))return [[{day_of_week:'Monday', start_time:'08:00:00',end_time:'17:00:00', slot_duration_mins:30,is_active:1,spans_next_day:0,is_24_hours:0}]]
    if(sql.includes('FROM appointments'))return [[]]
    throw new Error(`Unexpected query ${sql}`)
  }
}
test('non-past start uses clinic instant independent of online lead time', () => {
  assert.equal(security.isFutureAppointmentStart({date:'2026-10-26',time:'8:00 AM',now}),false)
  assert.equal(security.isFutureAppointmentStart({date:'2026-10-26',time:'10:00 AM',now}),false)
  assert.equal(security.isFutureAppointmentStart({date:'2026-10-26',time:'10:30 AM',now}),true)
  assert.equal(security.isFutureAppointmentStart({date:'2026-10-25',time:'11:30 PM',now}),false)
  assert.equal(security.isFutureAppointmentStart({date:'2026-10-27',time:'8:00 AM',now}),true)
  assert.throws(()=>security.assertFutureAppointmentStart({date:'2026-10-26',time:'8:00 AM',now}),{code:'APPOINTMENT_START_IN_PAST',statusCode:409})
})
test('expired same-day slots are never listed for admin even if enforceLeadTime is false', async () => {
  const slots = await security.getAvailableAppointmentSlots({doctorId:21,clinicType:'medical',date:'2026-10-26',now,executor:fakeExec})
  assert.ok(slots.includes('10:30 AM'))
  assert.ok(!slots.includes('8:00 AM'))
  assert.ok(!slots.includes('10:00 AM'))
})
test('server rejects direct past-time submission while allowing later scheduled time', async () => {
  await assert.rejects(security.validateAppointmentSlot({doctorId:21,clinicType:'medical',date:'2026-10-26',time:'8:00 AM',now,executor:fakeExec}),{code:'APPOINTMENT_START_IN_PAST',statusCode:409})
  const accepted = await security.validateAppointmentSlot({doctorId:21,clinicType:'medical',date:'2026-10-26',time:'11:00 AM',now,executor:fakeExec})
  assert.equal(accepted.normalizedTime,'11:00 AM')
})
test('booking catalog preserves setup mode while filtering medical and dermatology lookups',()=>{
  const src=fs.readFileSync(path.resolve(__dirname,'../../routers/branches.router.js'),'utf8')
  const handler=src.slice(src.indexOf('const originalServices='),src.indexOf('const originalInventory='))
  assert.match(handler,/clinicType.*'medical'.*'derma'/)
  assert.match(handler,/is_active=1 AND clinic_type IN/)
  assert.match(handler,/branch_id=\?/)
  assert.match(handler,/clinicType \? \[req.branchId,clinicType\]/)
})
test('branch slot read allows appointment privilege but not doctor schedule modification',()=>{
  const src=fs.readFileSync(path.resolve(__dirname,'../../routers/branches.router.js'),'utf8')
  assert.match(src,/available-slots`,\.\.\.middle,allowAnyPermission\('appointments','doctor_schedules'\)/)
  assert.match(src,/put\(`\$\{prefix\}\/doctors\/:id\/schedules`,afterSuccessfulMutation\('schedule.updated'\),\.\.\.ownedPerson\('doctors','doctor_schedules'/)
})
test('walk-in mode uses existing authorized queue endpoint and receipt instead of scheduled booking',()=>{
  const ui=fs.readFileSync(path.resolve(__dirname,'../../../client/src/pages/shared/Appointments.jsx'),'utf8')
  assert.match(ui,/Walk-in Now/)
  assert.match(ui,/services\.getQueuePrecheck\(patientId\)/)
  assert.match(ui,/services\.addToQueue\(\{/)
  assert.match(ui,/check_in_appointment_id:existing\.id/)
  assert.match(ui,/queueReceipt\.queue_number/)
})


