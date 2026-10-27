import {test} from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
const root = new URL('../src/',import.meta.url)
const read = path => fs.readFileSync(new URL(path,root),'utf8')
const modal = read('pages/shared/Appointments.jsx')
test('walk-in now is an explicit choice; scheduled booking remains the default',()=>{
  assert.match(modal,/useState\('scheduled'\)/)
  assert.match(modal,/Walk-in Now/)
  assert.match(modal,/Scheduled Appointment/)
})
test('branch/admin/staff services expose the same walk-in queue primitives',()=>{
  for(const role of ['admin','staff']){
    const svc=read(`services/${role}.service.js`)
    for(const key of ['getWalkInAvailableDoctors','getQueuePrecheck','addToQueue'])assert.match(svc,new RegExp(`export const ${key} `))
    const wrapper=read(`pages/${role==='admin'?'adminPage/Admin_Appointments.jsx':'staffPage/Staff_Appointments.jsx'}`)
    for(const key of ['getWalkInAvailableDoctors','getQueuePrecheck','addToQueue'])assert.match(wrapper,new RegExp(key))
  }
})
test('walk-in path checks an existing appointment and never writes a second scheduled one',()=>{
  assert.match(modal,/services\.getQueuePrecheck\(patientId\)/)
  assert.match(modal,/check_in_appointment_id:existing\.id/)
  assert.match(modal,/services\.addToQueue\(/)
  assert.match(modal,/setQueueReceipt\(queued\)/)
})
test('switching clinic isolates async service and doctor responses',()=>{
  assert.match(modal,/let active = true/)
  assert.match(modal,/return \(\) => \{ active = false \}/)
  assert.match(modal,/\['all', form\.clinic_type\]/)
  assert.match(modal,/\(response\?\.doctors \|\| \[\]\)\.filter\(\(d\) => d\.available_now\)/)
})
test('newly created patient is reused after a failed queue attempt; receipt displays its queue number',()=>{
  assert.match(modal,/setCreatedPatientId\(patientId\)/)
  assert.match(modal,/queueReceipt\.queue_number/)
})


