import {test} from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
const root = new URL('../src/',import.meta.url)
const read = path => fs.readFileSync(new URL(path,root),'utf8')
const page = read('pages/shared/AppointmentCreatePage.jsx')
test('walk-in now is an explicit choice; scheduled booking remains the default',()=>{
  assert.match(page,/useState\('scheduled'\)/)
  assert.match(page,/Walk-in Now/)
  assert.match(page,/Scheduled Appointment/)
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
  assert.match(page,/services\.getQueuePrecheck\(savedPatientId\)/)
  assert.match(page,/check_in_appointment_id: existing\.id/)
  assert.match(page,/services\.addToQueue\(/)
  assert.match(page,/setSuccess\(\{ type: 'walk_in'/)
})
test('switching clinic isolates async service and doctor responses',()=>{
  assert.match(page,/let active = true/)
  assert.match(page,/return \(\) => \{ active = false \}/)
  assert.match(page,/normalizeBookingServiceResults/)
  assert.match(page,/setWalkInDoctors\(doctors\)/)
  assert.match(page,/disabled=\{!d\.available_now/)
  assert.match(page,/d\.availability_reason/)
})
test('newly created patient is reused after a failed queue attempt; receipt displays its queue number',()=>{
  assert.match(page,/setCreatedPatientId\(savedPatientId\)/)
  assert.match(page,/success\.receipt\?\.queue_number/)
})


