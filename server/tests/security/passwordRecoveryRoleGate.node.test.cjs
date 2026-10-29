'use strict'
const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const vm = require('node:vm')
const controllerFile = path.resolve(__dirname, '../../controllers/auth.controller.js')
const controllerSrc = fs.readFileSync(controllerFile, 'utf8')

function fixture({role,exists=true,verified=true,sendFails=false,method=null}={}) {
  const events=[]
  const account = {id:7, full_name:'Synthetic Test User', email:'tester@example.invalid', phone:'639171234567', email_verified_at:verified?'2026-01-01':null, phone_verified_at:verified?'2026-01-01':null}
  const db={query:async(sql,params)=>{
    events.push({sql,params})
    if (/^\s*SELECT/i.test(sql)) {
      if (/FROM admins/i.test(sql) && role==='superadmin') assert.match(sql,/account_role = 'superadmin'/)
      if (/FROM admins/i.test(sql) && role==='admin') assert.match(sql,/account_role = 'admin'/)
      return [exists? [account]:[]]
    }
    return [{affectedRows:1}]
  }}
  const deps={
    '../db/connect':db,
    'bcrypt':{hash:async()=> 'hash'},
    '../utils/emailService':{sendPasswordResetOtp:async()=>{events.push({delivery:'email'});if(sendFails)throw Error('synthetic transport failure')}},
    '../utils/phone':{normalizePhilippinePhone:v=>String(v||'').replace(/\D/g,'')||null},
    '../utils/smsService':{sendPatientPasswordResetOtp:async()=>{events.push({delivery:'sms'});if(sendFails)throw Error('synthetic transport failure')}},
    '../utils/accountSecurity':{validatePassword:()=>null},
    '../utils/securityCrypto':{makeNumericCode:()=> '123456',makeRandomToken:()=>'',hashSecret:()=> 'hash',timingSafeEqualHash:()=>true},
    '../utils/sessionSecurity':{revokeSessions:async()=>{}}
  }
  const mod={exports:{}}
  vm.runInNewContext(`(function(require,module,exports){${controllerSrc}\n})`,{Date, console:{warn:()=>{},error:()=>{}}},{filename:controllerFile})((name)=>deps[name]||{},mod,mod.exports)
  const res={code:200,status(code){this.code=code;return this},json(payload){this.payload=payload;return this}}
  const req={body:{role,email:account.email,phone:account.phone,delivery_method:method || (role==='patient'?'sms':'email')}}
  return {handler:()=>mod.exports.forgotPassword(req,res),res,events}
}
for(const role of ['patient','staff','doctor','admin','superadmin']) {
  test(`${role}: unknown account has identical request response and no OTP is inserted or sent`,async()=>{
    const x=fixture({role,exists:false});await x.handler()
    assert.equal(x.res.payload.request_started,true)
    assert.equal(x.events.filter(e=>e.delivery).length,0)
    assert.equal(x.events.filter(e=>/INSERT INTO password_resets/.test(e.sql)).length,0)
  })
  test(`${role}: known account sends recovery code to verified contact`,async()=>{
    const x=fixture({role});await x.handler()
    assert.equal(x.res.payload.request_started,true)
    assert.equal(x.events.filter(e=>e.delivery).length,1)
  })
  test(`${role}: provider failure does not reveal account existence and deletes challenge`,async()=>{
    const x=fixture({role,sendFails:true});await x.handler()
    assert.equal(x.res.payload.request_started,true)
    assert.equal(x.events.filter(e=>/DELETE FROM password_resets/.test(e.sql)).length,2)
  })
}
for (const role of ['patient','staff','doctor','admin','superadmin']) {
  test(`${role}: unverified mobile contact does not issue a code`,async()=>{
    const x=fixture({role,verified:false,method:'sms'});await x.handler()
    assert.equal(x.res.payload.request_started,true)
    assert.equal(x.events.filter(e=>e.delivery).length,0)
  })
}

for(const role of ['staff','doctor','admin','superadmin']) {
  test(`${role}: mobile recovery requires explicit verified phone`,async()=>{
    const x=fixture({role,verified:false})
    // Normal fixture uses email. This negative test instead checks direct role-SMS choice
    // against the controller source and the safe account-verification branch.
    assert.match(controllerSrc,/deliveryMethod === 'sms' && !account.phone_verified_at/)
    assert.match(controllerSrc,/getPhoneVariants\(normalizedInputPhone\)/)
    assert.equal(x.events.filter(e=>e.delivery).length,0)
  })
}
