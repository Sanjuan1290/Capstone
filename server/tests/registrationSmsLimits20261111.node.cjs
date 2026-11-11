const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const vm = require('node:vm')
const path = require('node:path')
const Module = require('node:module')
const file = path.join(__dirname, '..', 'utils', 'registrationSmsLimits.js')
const createService = (conn, env = {}) => {
  const source = fs.readFileSync(file, 'utf8')
  const sandbox = {
    module: { exports: {} },
    exports: {},
    process: { env: { SMS_RATE_LIMIT_SECRET: 'test-secret-of-32-characters-long-for-sms', ...env } },
    Date, Number, String, Error, Math, console,
    require: (name) => name === '../db/connect' ? {getConnection: async () => conn} : Module.createRequire(file)(name)
  }
  vm.runInNewContext(source,sandbox,{filename:file})
  return sandbox.module.exports
}
const mockDb = ({dateStrings=false,offsetMinutes=480} = {}) => {
  const rows = new Map()
  // mysql2 writes Date values in its configured offset and returns DATETIME strings.
  const stored = value => dateStrings && value instanceof Date
    ? new Date(value.getTime()+offsetMinutes*60*1000).toISOString().slice(0,19).replace('T',' ')
    : value
  return {
    async beginTransaction(){}, async commit(){}, async rollback(){}, release(){},
    async query(sql,args){
      if(sql.includes('INSERT IGNORE INTO registration_sms_limits')){
        const [hash,now] = args
        if(!rows.has(hash)) rows.set(hash,{window_start:stored(now),send_count:0,last_sent_at:null})
        return [{affectedRows:1}]
      }
      if(sql.startsWith('SELECT window_start')) return [[rows.get(args[0])]]
      if(sql.startsWith('UPDATE registration_sms_limits')){
        const [start,count,last,hash] = args
        rows.set(hash,{window_start:stored(start),send_count:count,last_sent_at:stored(last)})
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

test('SQL dateStrings enforce the same cooldown/hour on UTC and Manila Node hosts',async()=>{
 const previous=process.env.TZ
 try{
  for(const host of ['UTC','Asia/Manila']){
   process.env.TZ=host
   const {claimRegistrationSms}=createService(mockDb({dateStrings:true}))
   const at=seconds=>new Date(Date.UTC(2026,10,11,1,0,0)+seconds*1000)
   const phone='+639171234567'
   await claimRegistrationSms(phone,{now:at(0)})
   await assert.rejects(claimRegistrationSms(phone,{now:at(1)}),error=>error.code==='SMS_LIMIT_REACHED'&&error.retryAfterSeconds===59)
   await claimRegistrationSms(phone,{now:at(60)})
   await claimRegistrationSms(phone,{now:at(120)})
   await assert.rejects(claimRegistrationSms(phone,{now:at(180)}),error=>error.code==='SMS_LIMIT_REACHED'&&error.retryAfterSeconds===3420)
   assert.equal((await claimRegistrationSms(phone,{now:at(3600)})).remaining,2)
  }
 }finally{if(previous===undefined)delete process.env.TZ;else process.env.TZ=previous}
})

test('SQL dateStrings follow a custom DB_TIME_ZONE rather than a hard-coded offset',async()=>{
 const previous=process.env.TZ
 process.env.TZ='UTC'
 try{
  for(const [zone,offsetMinutes] of [['+00:00',0],['-05:30',-330],['+05:45',345]]){
   const {claimRegistrationSms}=createService(mockDb({dateStrings:true,offsetMinutes}),{DB_TIME_ZONE:zone})
   const now=new Date('2026-11-11T01:00:00Z')
   await claimRegistrationSms('+639171234567',{now})
   await assert.rejects(claimRegistrationSms('+639171234567',{now:new Date(now.getTime()+1000)}),error=>error.code==='SMS_LIMIT_REACHED'&&error.retryAfterSeconds===59)
   await claimRegistrationSms('+639171234567',{now:new Date(now.getTime()+60000)})
  }
 }finally{if(previous===undefined)delete process.env.TZ;else process.env.TZ=previous}
})
