const { test } = require('node:test')
const assert = require('node:assert/strict')
const Module = require('node:module')
const fs = require('node:fs')
const vm = require('node:vm')
const path = require('node:path')
const root = path.resolve(__dirname, '..')
const modulePath = path.join(root, 'utils/doctorConfirmationNotifications.js')

function setup(overrides={}) {
  let settings = {send_email:1,send_sms:0,updated_at:'2026-11-11'}
  let calls = {email:[],sms:[],queries:[]}
  const db = {
    async query(sql,args=[]) {
      calls.queries.push({sql,args})
      if (/SELECT send_email,send_sms/i.test(sql)) return [[settings]]
      if (/UPDATE system_doctor_confirmation/i.test(sql)) {
        settings={...settings,send_email:args[0],send_sms:args[1]}
        return [{affectedRows:1}]
      }
      if (/FROM doctors/i.test(sql)) return [[{full_name:'Dr. Alex',email:'doctor@example.test',phone:'09171234567'}]]
      if (/FROM clinic_branches/i.test(sql)) return [[{name:'South Clinic'}]]
      throw new Error(`Unexpected query: ${sql}`)
    },
  }
  const oldLoad = Module._load
  Module._load = function(request,parent,isMain){
    if(parent?.filename===modulePath) {
      if(request==='../db/connect') return db
      if(request==='./resendEmail') return {sendResendEmail:async (...args)=>{calls.email.push(args);return 'email123'}}
      if(request==='./smsService') return {sendDoctorAppointmentSms:async (args)=>{calls.sms.push(args);return {sent:true}}}
      if(request==='./emailService') return {formatAppointmentDate:d=>d}
    }
    return oldLoad.call(this,request,parent,isMain)
  }
  delete require.cache[modulePath]
  try {return {module:require(modulePath),calls,db,getSettings:()=>settings,setSettings:v=>{settings=v}}}
  finally {Module._load=oldLoad; delete require.cache[modulePath]}
}
const appointment={appointmentId:31,doctorId:5,appointmentDate:'2026-11-20',appointmentTime:'10:00 AM',clinicType:'derma',branchId:2}

test('global switches accept boolean only',()=>{
  const {module:m}=setup()
  assert.equal(m.parseSwitch(true,'email'),1)
  assert.equal(m.parseSwitch(false,'sms'),0)
  assert.throws(()=>m.parseSwitch('true','sms'),{code:'INVALID_NOTIFICATION_SETTING'})
  assert.throws(()=>m.parseSwitch(undefined,'sms'),{code:'INVALID_NOTIFICATION_SETTING'})
})

test('default sends doctor email without SMS',async()=>{
  const {module:m,calls}=setup()
  const result=await m.notifyDoctorOnConfirmation(appointment)
  assert.deepEqual(result,{email:'sent',sms:'disabled'})
  assert.equal(calls.email.length,1)
  assert.equal(calls.sms.length,0)
})

test('switches can turn on SMS and turn off email',async()=>{
  const {module:m,calls,db}=setup()
  await m.saveSettings({send_email:false,send_sms:true},12)
  const result=await m.notifyDoctorOnConfirmation(appointment,db)
  assert.deepEqual(result,{email:'disabled',sms:'sent'})
  assert.equal(calls.email.length,0)
  assert.equal(calls.sms.length,1)
  assert.equal(calls.sms[0].branchName,'South Clinic')
})

test('disabled channels do not retrieve doctor contact or send',async()=>{
  const {module:m,calls,db}=setup()
  await m.saveSettings({send_email:false,send_sms:false},12)
  const result=await m.notifyDoctorOnConfirmation(appointment,db)
  assert.deepEqual(result,{email:'disabled',sms:'disabled'})
  assert.equal(calls.email.length+calls.sms.length,0)
  assert.equal(calls.queries.filter(x=>/FROM doctors/.test(x.sql)).length,0)
})

test('provider failure does not throw or block the confirmation',async()=>{
  const {module:m,db}=setup()
  const result=await m.notifyDoctorOnConfirmation(appointment,db,{sendEmail:async()=>{throw Object.assign(new Error('provider offline'),{code:'OUTAGE'})}})
  assert.deepEqual(result,{email:'failed',sms:'disabled'})
})

test('both confirmation controllers notify only after the successful status update',()=>{
  for(const name of ['admin','staff']) {
    const text=fs.readFileSync(path.join(root,`controllers/${name}.controller.js`),'utf8')
    const confirm=text.slice(text.indexOf('const confirmAppointment = async'),text.indexOf('const cancelAppointment = async'))
    assert.ok(confirm.includes('notifyDoctorOnConfirmation('),name)
    assert.ok(confirm.indexOf('assertAppointmentMutationApplied(updated')<confirm.indexOf('notifyDoctorOnConfirmation('),name)
  }
})

test('configuration routes are Super Admin only',()=>{
  const text=fs.readFileSync(path.join(root,'routers/admin.router.js'),'utf8')
  for(const verb of ['get','put']) assert.match(text,new RegExp(`router\\.${verb}\\('/system-setup/doctor-notifications', \\.\\.\\.auth`))
})

test('reschedule confirmations use new email keys while retries keep the same key',async()=>{
 const {module:m,calls}=setup()
 const original={email:'doctor@example.test',name:'Dr. Alex',date:'2026-11-20',time:'10:00 AM',clinic:'derma',branch:'South Clinic',appointmentId:31,confirmationId:100}
 await m.sendDoctorConfirmationEmail(original)
 await m.sendDoctorConfirmationEmail(original)
 await m.sendDoctorConfirmationEmail({...original,date:'2026-11-21',time:'11:00 AM',confirmationId:101})
 await m.sendDoctorConfirmationEmail({...original,confirmationId:102})
 const sent=calls.email.map(([message])=>message)
 assert.equal(sent[0].idempotencyKey,sent[1].idempotencyKey)
 assert.notEqual(sent[0].idempotencyKey,sent[2].idempotencyKey)
 assert.notEqual(sent[0].idempotencyKey,sent[3].idempotencyKey,'A new confirmation back at the original slot is a new event')
 assert.ok(sent.every(message=>message.idempotencyKey.length<=256))
 assert.ok(sent.every(message=>!message.idempotencyKey.includes(original.email)))
})

test('email keys also distinguish changed payloads for callers without a confirmation event ID',async()=>{
 const {module:m,calls}=setup()
 const original={email:'doctor@example.test',name:'Dr. Alex',date:'2026-11-20',time:'10:00 AM',clinic:'derma',branch:'South Clinic',appointmentId:31}
 await m.sendDoctorConfirmationEmail(original)
 await m.sendDoctorConfirmationEmail(original)
 await m.sendDoctorConfirmationEmail({...original,date:'2026-11-21'})
 await m.sendDoctorConfirmationEmail({...original,email:'other@example.test'})
 const keys=calls.email.map(([message])=>message.idempotencyKey)
 assert.equal(keys[0],keys[1]);assert.notEqual(keys[0],keys[2]);assert.notEqual(keys[0],keys[3])
})

for(const role of ['admin','staff'])test(`${role} confirmation uses persisted events without repeating duplicate or concurrent notifications`,async()=>{
 const text=fs.readFileSync(path.join(root,`controllers/${role}.controller.js`),'utf8')
 const source=text.slice(text.indexOf('const confirmAppointment = async'),text.indexOf('const cancelAppointment = async'))
 const state={id:31,status:'pending',doctor_id:5,patient_id:7,patient_name:'Synthetic Patient',patient_email:'patient@qa.invalid',patient_phone:'+639171234567',doctor_name:'Synthetic Doctor',appointment_date:'2026-11-20',appointment_time:'10:00:00',clinic_type:'medical',branch_id:2}
 let nextNotificationId=0
 const sent=[],notifications=[]
 const sandbox={db:{query:async(sql,args)=>{
  if(sql.includes('SELECT a.id'))return [[{...state}]]
  if(sql.startsWith('UPDATE appointments')){if(state.status!==args[1])return [{affectedRows:0}];state.status='confirmed';return [{affectedRows:1}]}
  throw new Error('Unexpected synthetic confirmation query')
 }},expirePendingAppointments:async()=>{},getLastNoShowAppointment:async()=>null,
 assertAppointmentTransition:require('../utils/appointmentSecurity').assertAppointmentTransition,
 assertAppointmentMutationApplied:async updated=>assert.equal(updated.affectedRows,1),
 writeAuditLog:async()=>{},createNotification:async payload=>{const row={...payload,id:++nextNotificationId};notifications.push(row);return row},
 notifyDoctorOnConfirmation:async payload=>{sent.push(payload)},sendAppointmentStatusEmail:async()=>{},sendPatientAppointmentStatusSms:async()=>{},broadcast:()=>{},console}
 const confirm=vm.runInNewContext(source+';confirmAppointment',sandbox)
 const req={params:{id:'31'},body:{},user:{id:12,role:'admin'},ip:'127.0.0.1',branchId:2}
 const responses=[]
 const res={json:payload=>{responses.push(payload);return res},status:()=>res}
 await confirm(req,res)
 await confirm(req,res)
 assert.match(responses[1].message,/already confirmed/i)
 assert.equal(sent.length,1);assert.equal(notifications.length,2)
 state.status='pending';state.appointment_date='2026-11-21'
 await confirm(req,res)
 state.status='pending'
 const raced=await Promise.allSettled([confirm(req,res),confirm(req,res)])
 assert.equal(raced.filter(result=>result.status==='fulfilled').length,1)
 assert.equal(raced.filter(result=>result.status==='rejected').length,1)
 const doctorEvents=notifications.filter(row=>row.target_role==='doctor')
 assert.equal(sent.length,3);assert.equal(doctorEvents.length,3)
 assert.deepEqual(sent.map(payload=>payload.confirmationId),doctorEvents.map(row=>row.id))
 assert.notEqual(sent[0].confirmationId,sent[1].confirmationId)
})
