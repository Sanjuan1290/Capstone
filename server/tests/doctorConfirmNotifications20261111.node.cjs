const { test } = require('node:test')
const assert = require('node:assert/strict')
const Module = require('node:module')
const fs = require('node:fs')
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
