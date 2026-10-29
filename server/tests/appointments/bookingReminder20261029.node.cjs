const {test}=require('node:test')
const assert=require('node:assert/strict')
const Module=require('module')
const original=Module._load
const path=require('node:path')
const securityPath=path.resolve(__dirname,'../../utils/appointmentSecurity.js')
const remindersPath=path.resolve(__dirname,'../../utils/appointmentReminders.js')
const dates=require('../../utils/date')
const queryCalls=[]
let patients=[]
const executor={query:async(sql,params=[])=>{
  queryCalls.push({sql,params})
  if(sql.includes('FROM appointments')&&sql.includes('patient_id=?'))return [sql.includes('AND id <> ?') ? patients.filter(row=>Number(row.id)!==Number(params[3])) : patients]
  if(sql.includes('GET_LOCK'))return [[{acquired:1}]]
  if(sql.includes('RELEASE_LOCK'))return [[{released:1}]]
  return [[]]
}}
const fakeDb={query:executor.query,getConnection:async()=>({...executor,release:()=>{}})}
Module._load=function(request,parent,isMain){
 if(request==='../db/connect' && parent?.filename?.includes('/server/utils/'))return fakeDb
 if(parent?.filename===securityPath&&request==='./doctorAvailability')return {getDoctorUnavailableDate:async()=>null}
 if(parent?.filename===remindersPath&&request==='../db/connect')return fakeDb
 if(parent?.filename===remindersPath&&request==='./emailService')return {sendAppointmentReminder:async()=>{}}
 if(parent?.filename===remindersPath&&request==='./smsService')return {sendPatientAppointmentReminderSms:async()=>{},isSmsConfigured:()=>true}
 return original.apply(this,arguments)
}
const sec=require('../../utils/appointmentSecurity')
const reminders=require('../../utils/appointmentReminders')
Module._load=original
const d='2026-11-12'
const appt=(time,minutes,day=d)=>({id:1,appointment_date:day,appointment_time:time,reserved_duration_minutes_snapshot:minutes})
test('same time with another doctor is rejected for the same patient',async()=>{
 patients=[appt('2:00 PM',60)]
 await assert.rejects(()=>sec.assertPatientAppointmentAvailable({patientId:5,date:d,time:'2:00 PM',durationMinutes:60,executor}),{code:'PATIENT_APPOINTMENT_CONFLICT'})
})
test('overlapping interval with a different start is rejected',async()=>{
 patients=[appt('2:00 PM',60)]
 await assert.rejects(()=>sec.assertPatientAppointmentAvailable({patientId:5,date:d,time:'2:30 PM',durationMinutes:60,executor}),{code:'PATIENT_APPOINTMENT_CONFLICT'})
})
test('consecutive appointments do not overlap',async()=>{
 patients=[appt('2:00 PM',60)]
 await sec.assertPatientAppointmentAvailable({patientId:5,date:d,time:'3:00 PM',durationMinutes:60,executor})
})
test('reschedule excludes the appointment being moved',async()=>{
 patients=[appt('2:00 PM',60)]
 await sec.assertPatientAppointmentAvailable({patientId:5,date:d,time:'2:00 PM',durationMinutes:60,excludeAppointmentId:1,executor})
})
test('overnight overlap prevents next morning booking',async()=>{
 patients=[appt('11:30 PM',120,'2026-11-11')]
 await assert.rejects(()=>sec.assertPatientAppointmentAvailable({patientId:5,date:d,time:'12:30 AM',durationMinutes:30,executor}),{code:'PATIENT_APPOINTMENT_CONFLICT'})
})
test('patient booking lock acquires doctor then patient and releases reverse order',async()=>{
 queryCalls.length=0
 const result=await sec.withAppointmentSlotLock({doctorId:9,patientId:5},async()=>42,executor)
 assert.equal(result,42)
 const names=queryCalls.filter(q=>q.sql.includes('GET_LOCK')).map(q=>q.params[0])
 assert.deepEqual(names,['carait:appt:doctor:9','carait:appt:patient:5'])
 assert.deepEqual(queryCalls.filter(q=>q.sql.includes('RELEASE_LOCK')).map(q=>q.params[0]),names.slice().reverse())
})
test('lock timeout fails closed',async()=>{
 const bad={query:async()=>[[{acquired:0}]]}
 await assert.rejects(()=>sec.withAppointmentSlotLock({doctorId:7,patientId:5},async()=>{},bad),{code:'APPOINTMENT_LOCK_TIMEOUT'})
})
test('new duration validation rejects 15-min increments but preserves historical',()=>{
 const {validateAverageDurationMinutes,roundReservedDurationMinutes}=require('../../utils/bookingPolicy')
 assert.equal(validateAverageDurationMinutes(30),30)
 assert.equal(validateAverageDurationMinutes(90),90)
 assert.throws(()=>validateAverageDurationMinutes(45),{code:'SERVICE_DURATION_INVALID'})
 assert.equal(validateAverageDurationMinutes(45,{unchangedLegacyMinutes:45}),45)
 assert.equal(roundReservedDurationMinutes(45),60)
})
test('reminder settings validate timing and at least one channel',()=>{
 assert.equal(reminders.checkSettings({enabled:true,lead_hours:3,email_enabled:true}).lead_hours,3)
 assert.throws(()=>reminders.checkSettings({enabled:true,lead_hours:5,email_enabled:true}),{code:'REMINDER_LEAD_INVALID'})
 assert.throws(()=>reminders.checkSettings({enabled:true,lead_hours:3,email_enabled:false,sms_enabled:false}),{code:'REMINDER_CHANNEL_REQUIRED'})
})
test('no reminder after cancellation, and silence cannot cancel a confirmed appointment',()=>{
 const future=dates.addDaysDateOnly(d,1)
 assert.equal(reminders.isEligible({status:'cancelled',consent_given:1,appointment_date:future,appointment_time:'2:00 PM'},new Date('2026-11-12T00:00:00Z')),false)
 assert.equal(reminders.isEligible({status:'confirmed',consent_given:1,appointment_date:future,appointment_time:'2:00 PM'},new Date('2026-11-12T00:00:00Z')),true)
})
