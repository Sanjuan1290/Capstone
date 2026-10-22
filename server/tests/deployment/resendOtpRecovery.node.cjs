'use strict'
const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const vm = require('node:vm')
const path = require('node:path')

const source = fs.readFileSync(path.join(__dirname, '../../utils/accountSecurity.js'), 'utf8')

test('failed Resend MFA delivery does not leave a 60-second cooldown', async () => {
  let stored = null
  let attempts = 0
  const db = { query: async (sql, params) => {
    if (sql.includes('AS elapsed_seconds')) return [stored ? [{ elapsed_seconds: 0 }] : []]
    if (sql.startsWith('DELETE FROM account_security_codes')) {
      if (params.length === 3 || (stored && params[3] === stored.hash)) stored = null
      return [{affectedRows: 1}]
    }
    if (sql.includes('INSERT INTO account_security_codes')) {
      stored = {hash:params[3],sent:new Date()};return [{affectedRows: 1}]
    }
    throw new Error(`Unexpected SQL: ${sql}`)
  }}
  const dependencies = {
    '../db/connect': db,
    bcrypt: {compare:async()=>true,hash:async()=>'$2hash'},
    './emailService': {sendAdminMfaOtp:async()=>{attempts++;if(attempts===1) throw new Error('Provider rejected send')}},
    './smsService': {}, './phone':{},
    './securityCrypto': {makeNumericCode:()=> '452391',hashSecret:value=> `hashed-${value}`},
    './sessionSecurity': {},
  }
  const ctx={module:{exports:{}},exports:{},require:name=>dependencies[name]||require(name),console,Date,Number,String,JSON,process}
  vm.runInNewContext(source,ctx)
  const {requestAdminMfa}=ctx.module.exports
  const admin={id:12,email:'admin@example.test',full_name:'Admin'}
  await assert.rejects(()=>requestAdminMfa(admin),/Provider rejected send/)
  assert.equal(stored,null,'OTP from rejected send is cleared')
  await requestAdminMfa(admin)
  assert.equal(attempts,2)
  assert.ok(stored,'retry creates a new challenge')
})

