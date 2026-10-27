'use strict'
const test=require('node:test')
const assert=require('node:assert/strict')
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm')
const source=fs.readFileSync(path.resolve(__dirname,'../../routers/paymongoGateway.js'),'utf8')
function setup({amount=12500,actualAmount=12500,providerStatus='succeeded',mode='test',attemptMode=mode,
 intentId='pi_test123',retrievedIntentId=intentId,intentAmount=amount,intentCurrency='PHP',intentLive=mode==='live',intentPayments=[]}={}) {
 const live = mode === 'live'
 const attempt={id:101,branch_id:3,billing_id:500,amount_centavos:amount,payment_intent_id:intentId,status:'pending',mode:attemptMode,age_seconds:240,is_expired:0}
 const eventRows=new Map(), transactions=[]
 let paymentCount=0, receiptCount=0, inventoryMovementCount=0
 const idempotencyKeys=new Set()
 const db={ query:async (sql,params=[])=>{
  const q=String(sql)
  if(q.includes('FROM payment_gateway_attempts WHERE payment_intent_id='))return [[attempt]]
  if(q.includes('TIMESTAMPDIFF(SECOND,a.created_at,NOW())'))return [[attempt]]
  if(q.startsWith('INSERT IGNORE INTO payment_gateway_webhook_events')) {if(!eventRows.has(params[0]))eventRows.set(params[0],'received');return [{affectedRows:1}]}
  if(q.includes('FROM payment_gateway_webhook_events WHERE event_id='))return [[{status:eventRows.get(params[0])}]]
  if(q.includes('UPDATE payment_gateway_webhook_events SET status=')){eventRows.set(params[0],'processed');return [{affectedRows:1}]}
  if(q.startsWith("UPDATE payment_gateway_attempts SET status='expired'")){attempt.status='expired';attempt.active_bill_id=null;return [{affectedRows:1}]}
  if(q.startsWith('UPDATE payment_gateway_attempts')){attempt.status='succeeded';attempt.provider_payment_id=params[0];return [{affectedRows:1}]}
  if(q.includes('FROM payment_gateway_attempts WHERE id=?'))return [[attempt]]
  if(q.includes('FROM billing_payments WHERE billing_id='))return [[{id:803}]]
  throw Error('Unexpected database SQL: '+sql)
 }}
 const staff={ payBill:async(req,res)=>{
  assert.equal(req.branchId,3);assert.equal(req.params.id,'500');assert.equal(req.body.payment_method,'qrph')
  assert.equal(req.gatewayVerified.intentId,intentId)
  assert.equal(req.body.idempotency_key,`paymongo:${req.gatewayVerified.paymentId}`)
  paymentCount++
  if(!idempotencyKeys.has(req.body.idempotency_key)){
   idempotencyKeys.add(req.body.idempotency_key)
   receiptCount++
   inventoryMovementCount++
  }
  res.json({status:'paid'})
 }}
 const fakeExpress={Router:()=>({get(){},post(){}})}
 const dependencies={
  express:fakeExpress,'../db/connect':db,
  '../utils/paymongoClient':{retrieveIntent:async id=>({id:retrievedIntentId,attributes:{status:providerStatus,amount:intentAmount,livemode:intentLive,currency:intentCurrency,payments:intentPayments}})},
  '../utils/paymongoMode':{configuredMode:()=>mode,expectedLive:()=>live,supportsMode:x=>['test','live'].includes(x),isLiveCollectionEnabled:()=>true,sameConfiguredMode:a=>String(a.mode||'test')===mode},
  '../utils/paymongoWebhookSignature':{verifyPaymongoSignature:()=>true},
  '../utils/paymongoRefundVerification':{assertVerifiedQrRefund:()=>({})},
  '../utils/billing':{getBillingRecordWithItems:()=>({})},
  '../utils/audit':{writeAuditLog:()=>{}},
  '../controllers/staff.controller':staff,'../utils/sse':{broadcast:()=>{}},
 }
 const module={exports:{}}
 vm.runInNewContext(source,{require:moduleName=>{if(!(moduleName in dependencies))throw Error('Missing mock: '+moduleName);return dependencies[moduleName]},module,exports:module.exports,Buffer,URL,console,process:{env:{PAYMONGO_MODE:mode}}})
 const event=(id,{type='payment.paid',paymentId='pay_123456',paymentStatus='paid',paymentAmount=actualAmount,paymentLive=live,currency='PHP',sourceType='qrph'}={})=>({data:{id,attributes:{type,livemode:live,data:{id:paymentId,attributes:{
    payment_intent_id:intentId,amount:paymentAmount,livemode:paymentLive,status:paymentStatus,currency,source:{type:sourceType}
 }}}}})
 return {handle:module.exports.handleWebhookEvent,reconcile:module.exports.reconcileAttempt,event,attempt,getPaymentCount:()=>paymentCount,
  getReceiptCount:()=>receiptCount,getInventoryMovementCount:()=>inventoryMovementCount,eventRows}
}
test('verified paid event posts a single QR Ph payment and duplicate event is ignored',async()=>{
 const {handle,event,attempt,getPaymentCount,eventRows}=setup()
 assert.equal((await handle(event('evt_ABC12345'))).processed,true)
 assert.equal(attempt.status,'succeeded')
 assert.equal(getPaymentCount(),1)
 assert.equal(eventRows.get('evt_ABC12345'),'processed')
 assert.equal((await handle(event('evt_ABC12345'))).duplicate,true)
 assert.equal(getPaymentCount(),1)
})
test('wrong amount is denied without recording payment',async()=>{
 const {handle,event,getPaymentCount}=setup({actualAmount:12000})
 await assert.rejects(handle(event('evt_DEF12345')),err=>err.code==='PAYMENT_AMOUNT_MISMATCH')
 assert.equal(getPaymentCount(),0)
})
test('unconfirmed provider intent never creates receipt',async()=>{
 const {handle,event,getPaymentCount}=setup({providerStatus:'awaiting_next_action'})
 await assert.rejects(handle(event('evt_GHI12345')),err=>err.code==='PAYMENT_NOT_CONFIRMED')
 assert.equal(getPaymentCount(),0)
})

test('payment intent ID, mode, amount, and currency are independently verified',async()=>{
 for(const options of [
  {retrievedIntentId:'pi_other'},
  {intentLive:true},
  {intentAmount:12000},
  {intentCurrency:'USD'},
 ]){
  const {handle,event,getPaymentCount}=setup(options)
  await assert.rejects(handle(event('evt_INTENTCHECK1')),err=>err.code==='PAYMENT_NOT_CONFIRMED')
  assert.equal(getPaymentCount(),0)
 }
})

test('non-QR payment payload cannot settle a QR Ph bill',async()=>{
 const {handle,event,getPaymentCount}=setup()
 const forged=event('evt_FORGED99')
 forged.data.attributes.data.attributes.source.type='card'
 await assert.rejects(handle(forged),err=>err.code==='PAYMENT_AMOUNT_MISMATCH')
 assert.equal(getPaymentCount(),0)
})


test('live signed payment settles exactly once with matching live attempt',async()=>{
 const {handle,event,getPaymentCount}=setup({mode:'live'})
 assert.equal((await handle(event('evt_LIVE12345'))).processed,true)
 assert.equal((await handle(event('evt_LIVE12345'))).duplicate,true)
 assert.equal(getPaymentCount(),1)
})
test('cross-environment live event is rejected even when intent id matches',async()=>{
 const {handle,event,getPaymentCount}=setup({mode:'live',attemptMode:'test'})
 await assert.rejects(handle(event('evt_CROSS12345')),e=>e.code==='PAYMONGO_MODE_MISMATCH')
 assert.equal(getPaymentCount(),0)
})
test('test event is rejected when configured for live payment processing',async()=>{
 const {handle,event,getPaymentCount}=setup({mode:'live'})
 const wrong=event('evt_BADMODE45');wrong.data.attributes.livemode=false
 await assert.rejects(handle(wrong),e=>e.code==='INVALID_PAYMONGO_EVENT')
 assert.equal(getPaymentCount(),0)
})

test('failed payment and signed expiry alone cannot release an unresolved QR lock',async()=>{
 const failed=setup()
 assert.equal((await failed.handle(failed.event('evt_FAILED123',{type:'payment.failed',paymentStatus:'failed'}))).processed,true)
 assert.equal(failed.attempt.status,'pending')
 assert.equal(failed.getPaymentCount(),0)

 const expired=setup()
 assert.equal((await expired.handle(expired.event('evt_EXPIRED12',{type:'qrph.expired'}))).processed,true)
 assert.equal(expired.attempt.status,'pending')
 assert.notEqual(expired.attempt.active_bill_id,null)
 assert.equal(expired.getPaymentCount(),0)
})

test('concurrent duplicate deliveries use the same idempotency key and model one receipt and inventory effect',async()=>{
 const {handle,event,getPaymentCount,getReceiptCount,getInventoryMovementCount}=setup()
 const payload=event('evt_CONCURRENT1')
 await Promise.all([handle(payload),handle(payload)])
 assert.equal(getPaymentCount(),2)
 assert.equal(getReceiptCount(),1)
 assert.equal(getInventoryMovementCount(),1)
})

test('reconciliation settles a succeeded provider intent when no webhook was received',async()=>{
 const payment={id:'pay_123456',attributes:{payment_intent_id:'pi_test123',amount:12500,livemode:false,status:'paid',currency:'PHP',source:{type:'qrph'}}}
 const {reconcile,attempt,getPaymentCount,getReceiptCount,getInventoryMovementCount}=setup({intentPayments:[payment]})
 const result=await reconcile(101,{force:true})
 assert.equal(result.status,'succeeded')
 assert.equal(attempt.provider_payment_id,'pay_123456')
 assert.equal(getPaymentCount(),1)
 assert.equal(getReceiptCount(),1)
 assert.equal(getInventoryMovementCount(),1)
})




