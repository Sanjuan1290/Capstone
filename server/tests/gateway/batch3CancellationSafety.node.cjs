'use strict'
const test=require('node:test'), assert=require('node:assert/strict')
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm')
const source=fs.readFileSync(path.join(__dirname,'../../routers/paymongoGateway.js'),'utf8')
function setup({providerStatus='awaiting_next_action',postCancelStatus='cancelled',attemptStatus='pending',paymentIntentId='pi_mock_12',featureFlag='true',mode='test',attemptMode=mode,providerError=false,paid=false}={}) {
 const row={id:77,billing_id:55,branch_id:3,active_bill_id:55,payment_intent_id:paymentIntentId,
   amount_centavos:12500,status:attemptStatus,mode:attemptMode,provider_payment_id:null,
   created_at:'2026-10-26',is_expired:1,age_seconds:1800}
 let state=providerStatus,cancelCalls=0,reads=0,updates=0,events=[],locks=0
 const conn={beginTransaction:async()=>{},commit:async()=>{},rollback:async()=>{},release:()=>{},query:async(sql,params)=>{
   if(sql.includes('FROM billing_records WHERE id=? AND branch_id=?') && sql.includes('FOR UPDATE')) {locks++;return [[{id:55}]]}
   if(sql.includes('FROM payment_gateway_attempts WHERE id=?') && sql.includes('FOR UPDATE'))return [[{...row}]]
   if(sql.includes("UPDATE payment_gateway_attempts SET status='cancelled'")){
     assert.equal(row.active_bill_id,55); assert.equal(row.provider_payment_id,null)
     row.status='cancelled';row.active_bill_id=null;row.qr_image=null;updates++
     return [{affectedRows:1}]
   }
   throw Error('Unexpected transactional query: '+sql)
 }}
 const db={getConnection:async()=>conn,query:async(sql,params=[])=>{
   if(sql.includes('TIMESTAMPDIFF(SECOND,a.created_at,NOW())'))return [[{...row}]]
   if(sql.includes('SELECT id FROM billing_records WHERE id=? AND branch_id=?'))return [[Number(params[1])===row.branch_id?{id:55}:undefined].filter(Boolean)]
   if(sql.includes('FROM payment_gateway_attempts WHERE id=?') && sql.includes('billing_id=?'))return [[{...row}]]
   if(sql.includes('FROM payment_gateway_attempts WHERE id=?'))return [[{...row}]]
   throw Error('Unexpected query: '+sql)
 }}
 const intent=()=>({id:paymentIntentId,attributes:{livemode:mode==='live',status:state,amount:12500,currency:'PHP',payments:paid?[{id:'pay_example',attributes:{status:'paid'}}]:[]}})
 const fakeRouter={post(){return this},get(){return this}}
 const deps={express:{Router:()=>fakeRouter},'../db/connect':db,
 '../utils/paymongoClient':{retrieveIntent:async()=>{reads++;if(providerError)throw Object.assign(new Error('timeout'),{code:'PAYMONGO_TIMEOUT'});return intent()},cancelIntent:async()=>{cancelCalls++;state=postCancelStatus;return intent()}},
 '../utils/paymongoMode':{configuredMode:()=>mode,expectedLive:()=>mode==='live',supportsMode:m=>['test','live'].includes(m),isLiveCollectionEnabled:()=>true,sameConfiguredMode:a=>a.mode===mode},
 '../utils/paymongoRefundVerification':{},'../utils/paymongoWebhookSignature':{},'../utils/billing':{},'../utils/audit':{writeAuditLog:async()=>{events.push('cancel')}},'../controllers/staff.controller':{},'../utils/sse':{broadcast:()=>{}}}
 const env={PAYMONGO_QR_CANCEL_ENABLED:featureFlag,PAYMONGO_MODE:mode,PAYMONGO_QR_CANCEL_LIVE_ENABLED:'false'}
 const module={exports:{}}
 vm.runInNewContext(source,{module,exports:module.exports,require:key=>{if(!(key in deps))throw Error('Unknown import '+key);return deps[key]},console,Date,process:{env},Buffer,URL}, {filename:'paymongoGateway.js'})
 const req={params:{id:'55',attemptId:'77'},branchId:3,user:{id:4,role:'staff'},body:{},ip:'127.0.0.1'}
 let statusCode=200,body=null
 const res={status(code){statusCode=code;return this},json(data){body=data;return this}}
 return {gateway:module.exports,req,res,row,stats:()=>({cancelCalls,reads,updates,locks,events,statusCode,body})}
}
test('provider-confirmed cancellation unlocks once after matching re-retrieval',async()=>{
 const x=setup();await x.gateway.requestCancel(x.req,x.res)
 assert.equal(x.row.status,'cancelled');assert.equal(x.row.active_bill_id,null)
 assert.equal(x.stats().cancelCalls,1);assert.equal(x.stats().reads,2)
 assert.equal(x.stats().updates,1);assert.equal(x.stats().locks,1)
 assert.equal(x.stats().body.can_collect_alternate,true)
 assert.equal(x.stats().body.can_request_cancel,false)
 assert.deepEqual(x.stats().events,['cancel'])
})
test('feature disabled by default rejects cancellation without provider call',async()=>{
 const x=setup({featureFlag:'false'});
 await assert.rejects(x.gateway.requestCancel(x.req,x.res),err=>err.code==='QR_CANCELLATION_DISABLED')
 assert.equal(x.row.active_bill_id,55);assert.equal(x.stats().cancelCalls,0)
})
test('processing and unknown provider states stay locked',async()=>{
 for (const providerStatus of ['processing','awaiting_capture','mystery']){
   const x=setup({providerStatus});await assert.rejects(x.gateway.requestCancel(x.req,x.res),err=>err.code==='QR_PROVIDER_PROCESSING')
   assert.equal(x.row.active_bill_id,55);assert.equal(x.stats().cancelCalls,0)
 }
})
test('provider cancel response cannot be trusted without subsequent terminal status',async()=>{
 const x=setup({postCancelStatus:'awaiting_next_action'});
 await assert.rejects(x.gateway.requestCancel(x.req,x.res),err=>err.code==='CANCELLATION_NOT_CONFIRMED')
 assert.equal(x.stats().cancelCalls,1);assert.equal(x.row.active_bill_id,55)
})
test('retrieval timeout preserves original active QR bill lock',async()=>{
 const x=setup({providerError:true});await assert.rejects(x.gateway.requestCancel(x.req,x.res),err=>err.code==='PAYMONGO_TIMEOUT')
 assert.equal(x.row.active_bill_id,55);assert.equal(x.stats().cancelCalls,0)
})
test('stale pending QR beyond 30-minute local expiry stays locked while provider is awaiting action',async()=>{
 const x=setup();await x.gateway.reconcileAttempt(77,{force:true});assert.equal(x.row.active_bill_id,55);assert.equal(x.stats().updates,0)
})
test('stale creating attempt with no recorded provider ID stays locked after 120 seconds',async()=>{
 const x=setup({attemptStatus:'creating',paymentIntentId:null});await x.gateway.reconcileAttempt(77,{force:true});assert.equal(x.row.active_bill_id,55);assert.equal(x.stats().updates,0)
})
test('provider-verified terminal intent can be safely released during reconciliation',async()=>{
 const x=setup({providerStatus:'cancelled'});await x.gateway.reconcileAttempt(77,{force:true})
 assert.equal(x.row.active_bill_id,null);assert.equal(x.stats().updates,1);assert.equal(x.stats().cancelCalls,0)
})
test('branch mismatches and mode mismatches cannot cancel another attempt',async()=>{
 const wrongBranch=setup();wrongBranch.req.branchId=8;
 await assert.rejects(wrongBranch.gateway.requestCancel(wrongBranch.req,wrongBranch.res),err=>err.code==='BILL_NOT_FOUND')
 assert.equal(wrongBranch.row.active_bill_id,55)
 const otherMode=setup({mode:'test',attemptMode:'live'});
 await assert.rejects(otherMode.gateway.requestCancel(otherMode.req,otherMode.res),err=>err.code==='PAYMONGO_MODE_MISMATCH')
 assert.equal(otherMode.row.active_bill_id,55)
 assert.match(source,/WHERE id=\? AND branch_id=\? LIMIT 1/)
 assert.match(source,/WHERE id=\? AND billing_id=\? AND branch_id=\? LIMIT 1/)
})
test('already succeeded intent must not be cancelled or unlocked for cash',async()=>{
 const x=setup({providerStatus:'succeeded'});
 await assert.rejects(x.gateway.requestCancel(x.req,x.res),err=>err.code==='PAYMENT_ALREADY_SUCCEEDED')
 assert.equal(x.row.active_bill_id,55);assert.equal(x.stats().cancelCalls,0)
})
test('live cancellation remains disabled without explicit separate live approval',async()=>{
 const x=setup({mode:'live'});
 await assert.rejects(x.gateway.requestCancel(x.req,x.res),err=>err.code==='QR_CANCELLATION_DISABLED')
})
test('server payment collection guard remains independent from the React pending flag',()=>{
 const staff=fs.readFileSync(path.join(__dirname,'../../controllers/staff.controller.js'),'utf8')
 assert.match(staff,/SELECT id,payment_intent_id FROM payment_gateway_attempts WHERE active_bill_id=\? LIMIT 1 FOR UPDATE/)
 assert.match(staff,/QR_PAYMENT_PENDING/)
})

