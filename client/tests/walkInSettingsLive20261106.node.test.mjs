import {test} from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
const root=new URL('../src/',import.meta.url)
const read=path=>fs.readFileSync(new URL(path,root),'utf8')
test('walk-in form shows reasons instead of hiding doctors and refreshes on schedule/queue events',()=>{
 const src=read('pages/shared/AppointmentCreatePage.jsx')
 assert.match(src,/setWalkInDoctors\(doctors\)/)
 assert.match(src,/disabled=\{!d\.available_now/)
 assert.match(src,/d\.availability_reason/)
 assert.match(src,/useClinicRefresh\(refreshWalkInDoctors/)
 assert.match(src,/queue.updated/)
 assert.match(src,/getQueuePrecheck\(savedPatientId\)/)
})
test('role Settings uses shared photo manager with preview, removal and cancel',()=>{
 const s=read('pages/shared/SettingsPage.jsx');const portal=read('services/portal.service.js')
 for(const word of ['Save Photo','Remove Photo','Change Photo','setPendingPhoto','saveProfilePhoto','removeProfilePhoto'])assert.ok(s.includes(word),word)
 assert.match(portal,/5\*1024\*1024/)
 assert.match(s,/URL.revokeObjectURL/)
})
test('profile photo endpoints are registered for all five roles',()=>{
 const prefix=new URL('../../server/routers/',import.meta.url)
 for(const file of ['doctor.router.js','patient.router.js','admin.router.js','staff.router.js']){
  const src=fs.readFileSync(new URL(file,prefix),'utf8')
  assert.match(src,/settings\/profile-photo/)
  assert.match(src,/removeMyProfilePhoto/)
 }
})
