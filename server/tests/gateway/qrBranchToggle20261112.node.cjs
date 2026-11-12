const test=require('node:test'),assert=require('node:assert/strict'),vm=require('node:vm'),fs=require('node:fs')
function setup({mode='test',enabled=0,lockedEnabled=enabled,attempt=null}={}) {
 const routes={},calls=[];let created=0,reads=0,transactions=0,rolledBack=false
 const db={query:async(sql,args=[])=>{
   calls.push({sql,args})
   if(sql.includes('FROM branch_payment_settings'))return [enabled==null?[]:[{qrph_enabled:enabled}]]
   if(sql.includes('SELECT id FROM billing_records'))return [[{id:6}]]
   if(sql.includes('SELECT a.id FROM payment_gateway_attempts'))return [[]]
   if(sql.includes('FROM payment_gateway_attempts'))return [attempt?[attempt]:[]]
   if(sql.startsWith('UPDATE payment_gateway_attempts'))return [{affectedRows:1}]
   throw Error('Unexpected SQL '+sql)
 },getConnection:async()=>({
   beginTransaction:async()=>{transactions++},commit:async()=>{},rollback:async()=>{rolledBack=true},release:()=>{},
   query:async(sql,args)=>{
     calls.push({sql,args})
     if(sql.startsWith('SET TRANSACTION'))return [[]]
     if(sql.includes('FROM billing_records'))return [[{id:6,branch_id:1,status:'ready',version:2}]]
     if(sql.includes('FROM branch_payment_settings'))return [[{qrph_enabled:lockedEnabled}]]
     if(sql.startsWith('SELECT'))return [[]]
     if(sql.startsWith('INSERT INTO payment_gateway_attempts'))return [{insertId:12}]
     throw Error('Unexpected transactional SQL '+sql)
   },
 })}
 const router={get:(path,fn)=>{routes['GET '+path]=fn},post:(path,fn)=>{routes['POST '+path]=fn}}
 const deps={express:{Router:()=>router},'../db/connect':db,
  '../utils/paymongoClient':{credentials:()=>({mode}),createQr:async()=>{created++;return {intentId:'pi_12'}},retrieveIntent:async()=>{reads++;return {id:'pi_12',attributes:{livemode:mode==='live',status:'awaiting_next_action',currency:'PHP',amount:40500}}}},
  '../utils/paymongoMode':{configuredMode:()=>mode,isLiveCollectionEnabled:()=>true,expectedLive:()=>mode==='live',sameConfiguredMode:row=>row.mode===mode},
  '../utils/paymongoRefundVerification':{},'../utils/paymongoWebhookSignature':{},'../utils/billing':{getBillingRecordWithItems:async()=>({balance_amount:405})},'../utils/audit':{},'../controllers/staff.controller':{},'../utils/sse':{},
 }
 const module={exports:{}}
 vm.runInNewContext(fs.readFileSync(require.resolve('../../routers/paymongoGateway'),'utf8'),{module,require:key=>{assert.ok(key in deps,key);return deps[key]},process:{env:{PAYMONGO_WEBHOOK_SECRET:'whsk_synthetic'}},console,Date,Map,URL,Buffer})
 return {calls,stats:()=>({created,reads,transactions,rolledBack}),async call(key){let error,body;const res={status(){return this},json(value){body=value;return this}}
   await routes[key]({params:{id:'6'},branchId:1,user:{id:8,role:'staff'},query:{reconcile:'1'}},res,e=>{error=e})
   return {error,body}
 }}
}
for(const mode of ['test','live'])test(`${mode}: disabled or missing branch setting blocks new QR before gateway calls`,async()=>{
 for(const enabled of [0,null]){
  const h=setup({mode,enabled});const result=await h.call('POST /:id/qr-payment')
  assert.equal(result.error?.code,'QRPH_DISABLED');assert.equal(h.stats().created,0);assert.equal(h.stats().transactions,0)
  const status=await h.call('GET /:id/qr-payment/status');assert.equal(status.body.enabled,false)
 }
})
test('settings switched off during creation are rechecked under transaction lock',async()=>{
 const h=setup({enabled:1,lockedEnabled:0});const result=await h.call('POST /:id/qr-payment')
 assert.equal(result.error?.code,'QRPH_DISABLED');assert.equal(h.stats().rolledBack,true);assert.equal(h.stats().created,0)
 assert.ok(h.calls.some(call=>call.sql.includes('branch_payment_settings')&&call.sql.endsWith('FOR UPDATE')))
})
test('enabled branch creates a QR and advertises availability',async()=>{
 const h=setup({enabled:1,attempt:{id:12,billing_id:6,branch_id:1,status:'pending',mode:'test',active_bill_id:6,payment_intent_id:'pi_12',amount_centavos:40500}})
 const result=await h.call('POST /:id/qr-payment');assert.ifError(result.error)
 assert.equal(h.stats().created,1);assert.equal(result.body.enabled,true)
})
test('turning QR off still reconciles an existing pending attempt and retains the alternate-payment lock',async()=>{
 const h=setup({enabled:0,attempt:{id:12,billing_id:6,branch_id:1,status:'pending',mode:'test',active_bill_id:6,payment_intent_id:'pi_12',amount_centavos:40500}})
 const result=await h.call('GET /:id/qr-payment/status');assert.ifError(result.error)
 assert.equal(h.stats().reads,1);assert.equal(result.body.enabled,false)
 assert.equal(result.body.status,'pending');assert.equal(result.body.can_collect_alternate,false)
})
