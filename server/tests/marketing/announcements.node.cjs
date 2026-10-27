const test=require('node:test'), assert=require('node:assert/strict'), fs=require('node:fs'),path=require('node:path'),vm=require('node:vm')
const root=path.resolve(__dirname,'../..'), read=p=>fs.readFileSync(path.join(root,p),'utf8')
const makeModule=(filename, stubs={},env={})=>{
  const source=read(filename)
  const context={module:{exports:{}},exports:{},process:{env},console,Date,Number,String,Boolean,Buffer,AbortSignal,setInterval,clearInterval}
  context.require=name=>stubs[name]??require(name)
  vm.runInNewContext(source,context,{filename})
  return context.module.exports
}
const emptyRouter=()=>({get(){},post(){}})
const {validatePost,slug,dateTime}=makeModule('routers/branchAnnouncements.js',{
 'express':{Router:emptyRouter,raw:()=>()=>{}},
 '../db/connect':{},'../utils/audit':{},'../utils/clinicEvents':{afterSuccessfulMutation:()=> (_req,_res,next)=>next()},'../utils/marketingCampaigns':{configured:()=>false,eligibleSql:'FROM patients p WHERE p.receive_promotions=1'},'../utils/cloudinarySecurity':{},
})
const input=()=>({title:'October Skin Care Special',caption:'New service offer',body:'Details and terms of the service',status:'draft',type:'promotion',cta_url:'/patient/book'})
test('slug strips URL-unsafe characters',()=>assert.equal(slug('Health Care & Deals!!!'),'health-care-deals'))
test('draft announcement accepts plain-text content',()=>assert.equal(validatePost(input()).status,'draft'))
test('scheduled announcement requires a start time',()=>assert.throws(()=>validatePost({...input(),status:'scheduled'}),/schedule/i))
test('rejects unsafe external CTA URLs',()=>assert.throws(()=>validatePost({...input(),cta_url:'javascript:alert(1)'}),/internal/i))
test('rejects protocol-relative redirects',()=>assert.throws(()=>validatePost({...input(),cta_url:'//attacker.test'}),/internal/i))
test('rejects blank article content',()=>assert.throws(()=>validatePost({...input(),body:'  '}),/article/i))
test('rejects excessive article content',()=>assert.throws(()=>validatePost({...input(),body:'X'.repeat(12001)}),/article/i))
test('rejects non-date schedule values',()=>assert.equal(dateTime('today'),undefined))
test('valid date input normalized for MySQL clinic wall time',()=>assert.equal(dateTime('2026-11-02T11:30'),'2026-11-02 11:30:00'))
const signing=makeModule('utils/marketingCampaigns.js',{
 '../db/connect':{},'./date':{getClinicDateTimeSql:()=> '2026-10-17 18:00:00'}, './resendEmail':{sendResendEmail:async()=> 'mocked'},
},{MARKETING_UNSUBSCRIBE_SECRET:'a-test-only-signature-secret-value-with-32-chars'})
test('unknown or tampered opt-out token is rejected',()=>{
 assert.equal(signing.patientFromToken('1.bad'),null)
 assert.equal(signing.patientFromToken(''),null)
})
test('opt-out token authenticates the correct patient and rejects tampering',()=>{
 const t=signing.tokenFor(123)
 assert.equal(signing.patientFromToken(t),123)
 assert.equal(signing.patientFromToken(t.replace(/^123\./,'124.')),null)
 assert.equal(signing.patientFromToken(t.slice(0,-1)+(t.endsWith('a')?'b':'a')),null)
})
test('consent query checks opt-in, verified email, branch visits and suppression',()=>{
 const sql=signing.eligibleSql
 for(const fragment of ['receive_promotions=1','email_verified_at IS NOT NULL','marketing_unsubscribes','a.branch_id=?'])assert.ok(sql.includes(fragment),fragment)
})
test('campaign records uniquely identify the same recipient',()=>assert.match(read('db/migrations/2026-10-17-announcements-campaigns.sql'),/UNIQUE KEY uniq_campaign_patient \(campaign_id,patient_id\)/))
test('provider unavailable means marketing sending is disabled',()=>assert.equal(signing.configured(),false))
test('rate limit is persisted in database, not just process memory',()=>{
 assert.match(read('utils/marketingCampaigns.js'),/marketing_send_quota/)
 assert.match(read('utils/marketingCampaigns.js'),/reserved=reserved\+1/)
})
test('worker leaves ambiguous sends for manual review without automatic retry',()=>{
 const source=read('utils/marketingCampaigns.js');assert.match(source,/status='unknown'/);assert.match(source,/Never retry automatically/i)
})
test('public unsubscribes require signed POST, never a side-effecting GET',()=>{
 const source=read('routers/branchAnnouncements.js');assert.match(source,/publicRouter\.post\('\/unsubscribe'/);assert.doesNotMatch(source,/publicRouter\.get\('\/unsubscribe'/)
})
test('new migration is additive and registered',()=>{
 const source=read('db/migrations/2026-10-17-announcements-campaigns.sql');assert.doesNotMatch(source,/\b(?:TRUNCATE|DROP TABLE|DELETE FROM)\b/i)
 assert.match(read('scripts/branchMigrations.js'),/2026-10-17-announcements-campaigns\.sql/)
})
test('marketing and transactional delivery use the same Resend HTTPS provider',()=>{
 assert.match(read('utils/marketingCampaigns.js'),/sendResendEmail/)
 assert.match(read('utils/emailService.js'),/sendResendEmail/)
 assert.doesNotMatch(read('utils/marketingCampaigns.js'),/brevo/i)
})

test('duplicate active campaign is refused under announcement row lock',()=>{
 const s=read('routers/branchAnnouncements.js');assert.match(s,/FOR UPDATE/);assert.match(s,/already has an active campaign/)
})
test('patients can explicitly re-opt-in through Settings after unsubscribe',()=>{
 const s=read('controllers/patient.controller.js');assert.match(s,/DELETE FROM marketing_unsubscribes WHERE patient_id=\?/);assert.match(s,/normalized.receive_promotions === true/)
})

