const {test}=require('node:test')
const assert=require('node:assert/strict')
const Module=require('node:module')
const path=require('node:path')
const fs=require('node:fs')
const remindersPath=path.resolve(__dirname,'../../utils/appointmentReminders.js')
const original=Module._load
const future='2026-11-12'
let patient={id:15,branch_id:1,status:'confirmed',consent_given:1,appointment_date:future,appointment_time:'2:00 PM',email:'test@example.com',email_verified_at:null,phone:'09123456789',phone_verified_at:null}
let settings={branch_id:1,enabled:1,email_enabled:1,sms_enabled:0,lead_hours:3}
let smsReady=true
const fakeDb={query:async(sql)=>{
  if(sql.includes('FROM appointments a JOIN patients'))return [[patient]]
  if(sql.includes('FROM branch_appointment_reminder_settings'))return [[settings]]
  if(sql.includes('appointment_reminder_deliveries')&&sql.includes('SELECT'))return [[null]]
  return [[]]
}}
Module._load=function(request,parent,isMain){
 if(parent?.filename===remindersPath){
  if(request==='../db/connect')return fakeDb
  if(request==='./bookingPolicy')return {appointmentStartUtc:()=>new Date('2026-11-12T06:00:00Z')}
  if(request==='./emailService')return {sendAppointmentReminder:async()=>{}}
  if(request==='./smsService')return {sendPatientAppointmentReminderSms:async()=>{},isSmsConfigured:()=>smsReady}
 }
 return original.apply(this,arguments)
}
const reminders=require('../../utils/appointmentReminders')
Module._load=original
const send=()=>reminders.sendManual({appointmentId:15,branchId:1,actor:{id:7,role:'admin'},channels:['email','sms'],executor:fakeDb})
test('manual reminder explains unverified email and disabled SMS, without sending',async()=>{
 patient={...patient,email_verified_at:null,phone_verified_at:null};settings={...settings,email_enabled:1,sms_enabled:0}
 const result=await send()
 assert.deepEqual(result,[{channel:'email',status:'skipped',reason:'patient_email_not_verified'},{channel:'sms',status:'skipped',reason:'sms_disabled_in_reminder_settings'}])
})
test('manual reminder explains unverified SMS number',async()=>{
 patient={...patient,email_verified_at:null,phone_verified_at:null};settings={...settings,email_enabled:0,sms_enabled:1}
 const result=await reminders.sendManual({appointmentId:15,branchId:1,actor:{id:7,role:'admin'},channels:['sms'],executor:fakeDb})
 assert.equal(result[0].reason,'patient_phone_not_verified')
})
test('manual reminder explains SMS provider unavailable',async()=>{
 patient={...patient,phone_verified_at:'2026-11-01'};settings={...settings,sms_enabled:1};smsReady=false
 const result=await reminders.sendManual({appointmentId:15,branchId:1,actor:{id:7,role:'admin'},channels:['sms'],executor:fakeDb})
 assert.equal(result[0].reason,'sms_provider_not_configured')
 smsReady=true
})
test('booking and reschedule source keep verified-email and explicit reschedule reason checks',()=>{
 const ctrl=fs.readFileSync(path.resolve(__dirname,'../../controllers/patient.controller.js'),'utf8')
 assert.match(ctrl,/EMAIL_VERIFICATION_REQUIRED/)
 assert.match(ctrl,/reschedule_requested_at = NOW\(\)/)
 assert.match(ctrl,/reschedule_reason = \?/)
 assert.match(ctrl,/RESCHEDULE_REASON_REQUIRED/)
})
test('patient settings does not require selected branch, and booking blocks same doctor before confirmation',()=>{
 const root=path.resolve(__dirname,'../../../client/src')
 const layout=fs.readFileSync(path.join(root,'components/layouts/PatientLayout.jsx'),'utf8')
 const book=fs.readFileSync(path.join(root,'pages/patientPage/BookAppointment.jsx'),'utf8')
 assert.match(layout,/pathname === '\/patient\/settings' \? <Outlet \/>/)
 assert.match(book,/matchingActiveDoctor\(doctor\)/)
 assert.match(book,/onChange=\{selectDoctorSafely\}/)
 assert.match(book,/role="alertdialog"/)
})
test('reschedule migration contains only additive statements',()=>{
 const sql=fs.readFileSync(path.resolve(__dirname,'../../db/migrations/MANUAL_2026-10-29-patient-reschedule-request-fields.STAGING_ONLY.sql'),'utf8')
 const statements=sql.split('\n').filter(line=>/^ALTER TABLE\b/i.test(line.trim()))
 assert.equal(statements.length,5)
 assert.ok(statements.every(line=>/^ALTER TABLE appointments ADD COLUMN /i.test(line)))
})
