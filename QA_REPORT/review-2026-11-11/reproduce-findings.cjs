'use strict'
// Reproductions use synthetic values and in-memory executors only. No live DB/provider access.
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),Module=require('node:module'),assert=require('node:assert/strict')
process.env.TZ='UTC'
const root=path.resolve(__dirname,'../..'),results=[]
async function main(){
 const {applyServicePromotions}=require('../../server/utils/billingServicePromotions')
 const appointment={appointment_date:'2026-11-11',branch_id:1,promotion_id:9,promotion_selected_for_service_id:1,promotion_discount_amount_snapshot:100,promotion_title_snapshot:'Synthetic booked offer',promotion_discount_type_snapshot:'fixed',promotion_discount_value_snapshot:100}
 const item=()=>({item_type:'service',source_type:'consultation',catalog_service_id:1,service_name:'Synthetic service',line_total:400,details_json:'{}'})
 const executor={query:async()=>[[]]}
 const before=await applyServicePromotions([item()],appointment,executor,1)
 const after=await applyServicePromotions([item()],{...appointment,promotion_id:null},executor,1)
 assert.equal(before.total,100);assert.equal(after.total,0)
 results.push({finding:'Booked promotion is lost after the live offer is deleted',bugReproduced:true,savedSnapshotDiscount:100,discountBeforeDeletingOffer:before.total,discountAfterLiveIdBecomesNull:after.total,expectedTotal:300,observedTotal:400,reason:'The existing FK uses ON DELETE SET NULL while title/selected-service/discount snapshots remain.'})

 const file=path.join(root,'server/utils/registrationSmsLimits.js'),rows=new Map()
 const sqlDate=value=>value instanceof Date?new Date(value.getTime()+8*60*60*1000).toISOString().slice(0,19).replace('T',' '):value
 const conn={beginTransaction:async()=>{},commit:async()=>{},rollback:async()=>{},release:()=>{},query:async(sql,args)=>{
  if(sql.startsWith('INSERT IGNORE')){if(!rows.has(args[0]))rows.set(args[0],{window_start:sqlDate(args[1]),send_count:0,last_sent_at:null});return [{affectedRows:1}]}
  if(sql.startsWith('SELECT window_start'))return [[rows.get(args[0])]]
  if(sql.startsWith('UPDATE registration_sms_limits')){rows.set(args[3],{window_start:sqlDate(args[0]),send_count:args[1],last_sent_at:sqlDate(args[2])});return [{affectedRows:1}]}
  throw Error('Unexpected synthetic SQL')
 }}
 const context={module:{exports:{}},process:{env:{SMS_RATE_LIMIT_SECRET:'synthetic-review-secret-not-a-production-key'}},Date,Number,String,Error,Math,console,require:name=>name==='../db/connect'?{getConnection:async()=>conn}:Module.createRequire(file)(name)}
 vm.runInNewContext(fs.readFileSync(file,'utf8'),context,{filename:file})
 const attempts=[]
 for(let second=0;second<4;second++){
  try{await context.module.exports.claimRegistrationSms('+639171234567',{now:new Date(Date.UTC(2026,10,11,1,0,second))});attempts.push({elapsedSeconds:second,allowed:true})}
  catch(error){attempts.push({elapsedSeconds:second,allowed:false,code:error.code,retryAfterSeconds:error.retryAfterSeconds})}
 }
 assert.equal(attempts[1].allowed,true);assert.equal(attempts[2].allowed,true);assert.ok(attempts[3].retryAfterSeconds>8*60*60)
 results.push({finding:'SMS cooldown/window misreads Manila SQL date strings on a UTC Node host',bugReproduced:true,configuration:{nodeTimezone:'UTC',mysqlTimezone:'+08:00',dateStrings:true},expectedSecondAttemptAllowed:false,observed:attempts,reason:'Stored DATETIME values are strings without a timezone; new Date parses them in host time.'})
 const messages=[],emailFile=path.join(root,'server/utils/doctorConfirmationNotifications.js')
 const emailContext={module:{exports:{}},process:{env:{CLIENT_URL:'https://synthetic.example.invalid'}},console,Date,String,Number,Boolean,Error,Promise,require:name=>{
  if(name==='../db/connect')return {}
  if(name==='./resendEmail')return {sendResendEmail:async message=>{messages.push(message);return 'synthetic-message'}}
  if(name==='./smsService')return {}
  if(name==='./emailService')return {formatAppointmentDate:date=>date}
  throw Error('Unexpected synthetic dependency')
 }}
 vm.runInNewContext(fs.readFileSync(emailFile,'utf8'),emailContext,{filename:emailFile})
 const confirmation={email:'synthetic@qa.invalid',name:'Synthetic Doctor',date:'2026-11-11',time:'09:00',clinic:'medical',branch:'Synthetic branch',appointmentId:9}
 await emailContext.module.exports.sendDoctorConfirmationEmail(confirmation)
 await emailContext.module.exports.sendDoctorConfirmationEmail({...confirmation,date:'2026-11-12',time:'10:00'})
 assert.equal(messages[0].idempotencyKey,messages[1].idempotencyKey);assert.notEqual(messages[0].html,messages[1].html)
 results.push({finding:'A reconfirmed rescheduled appointment reuses the first confirmation email key',bugReproduced:true,keys:messages.map(message=>message.idempotencyKey),differentPayloads:true,providerCalls:0,providerBehaviorSource:'https://resend.com/docs/dashboard/emails/idempotency-keys',inference:'Within the provider retention period, reusing a key for a different payload rejects the second email. Only payload/key construction was reproduced locally; no delivery was attempted.'})
 fs.writeFileSync(path.join(__dirname,'reproductions.json'),JSON.stringify({productionQueries:0,providerCalls:0,applicationEdits:0,results},null,2))
 console.log(JSON.stringify(results,null,2))
}
main().catch(error=>{console.error(error.message);process.exitCode=1})
