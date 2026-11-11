const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const vm = require('node:vm')
const path = require('node:path')
const Module = require('node:module')
const file = path.join(__dirname, '..', 'utils', 'registrationSmsLimits.js')
const createService = (conn) => {
  const source = fs.readFileSync(file, 'utf8')
  const sandbox = {
    module: { exports: {} },
    exports: {},
    process: { env: { SMS_RATE_LIMIT_SECRET: 'test-secret-of-32-characters-long-for-sms' } },
    Date, Number, String, Error, Math, console,
    require: (name) => name === '../db/connect' ? {getConnection: async () => conn} : Module.createRequire(file)(name)
  }
  vm.runInNewContext(source,sandbox,{filename:file})
  return sandbox.module.exports
}
const mockDb = () => {
  const rows = new Map()
  return {
    async beginTransaction(){}, async commit(){}, async rollback(){}, release(){},
    async query(sql,args){
      if(sql.includes('INSERT IGNORE INTO registration_sms_limits')){
        const [hash,now] = args
        if(!rows.has(hash)) rows.set(hash,{window_start:now,send_count:0,last_sent_at:null})
        return [{affectedRows:1}]
      }
      if(sql.startsWith('SELECT window_start')) return [[rows.get(args[0])]]
      if(sql.startsWith('UPDATE registration_sms_limits')){
        const [start,count,last,hash] = args
        rows.set(hash,{window_start:start,send_count:count,last_sent_at:last})
        return [{affectedRows:1}]
      }
      throw new Error('Unexpected SQL: '+sql)
    }
  }
}
test('SMS registration and resend share a 3/hour limit with a 60-second pause',async()=>{
  const conn=mockDb()
  const {claimRegistrationSms}=createService(conn)
  const phone='+639171234567'
  const at=(ms)=>new Date(Date.UTC(2026,10,11,1,0,0)+ms)
  await claimRegistrationSms(phone,{now:at(0)})
  await assert.rejects(claimRegistrationSms(phone,{now:at(1000)}), {code:'SMS_LIMIT_REACHED'})
  await claimRegistrationSms(phone,{now:at(61_000)})
  await claimRegistrationSms(phone,{now:at(122_000)})
  await assert.rejects(claimRegistrationSms(phone,{now:at(183_000)}), {code:'SMS_LIMIT_REACHED'})
  await claimRegistrationSms(phone,{now:at(3_601_000)})
})
