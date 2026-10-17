'use strict'
const test=require('node:test')
const assert=require('node:assert/strict')
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm')
const source=fs.readFileSync(path.resolve(__dirname,'../../routers/paymongoGateway.js'),'utf8')
function setup({amount=12500,actualAmount=12500,providerStatus='succeeded'}={}) {
 const attempt={id:101,branch_id:3,billing_id:500,amount_centavos:amount,payment_intent_id:'pi_test123',status:'pending'}
 const eventRows=new Map(), transactions=[]
 let paymentCount=0
 const db={ query:async (sql,params=[])=>{
  const q=String(sql)
  if(q.includes('FROM payment_gateway_attempts WHERE payment_intent_id='))return [[attempt]]
  if(q.startsWith('INSERT IGNORE INTO payment_gateway_webhook_events')) {if(!eventRows.has(params[0]))eventRows.set(params[0],'received');return [{affectedRows:1}]}
  if(q.includes('FROM payment_gateway_webhook_events WHERE event_id='))return [[{status:eventRows.get(params[0])}]]
  if(q.includes('UPDATE payment_gateway_webhook_events SET status=')){eventRows.set(params[0],'processed');return [{affectedRows:1}]}
  if(q.startsWith('UPDATE payment_gateway_attempts')){attempt.status='succeeded';attempt.provider_payment_id=params[0];return [{affectedRows:1}]}
  if(q.includes('FROM billing_payments WHERE billing_id='))return [[{id:803}]]
  throw Error('Unexpected database SQL: '+sql)
 }}
 const staff={ payBill:async(req,res)=>{
  assert.equal(req.branchId,3);assert.equal(req.params.id,'500');assert.equal(req.body.payment_method,'qrph')
  assert.equal(req.gatewayVerified.intentId,'pi_test123')
  paymentCount++
  res.json({status:'paid'})
 }}
 const fakeExpress={Router:()=>({get(){},post(){}})}
 const dependencies={
  express:fakeExpress,'../db/connect':db,
  '../utils/paymongoClient':{retrieveIntent:async id=>({id,attributes:{status:providerStatus,amount,livemode:false,currency:'PHP'}})},
  '../utils/paymongoWebhookSignature':{verifyPaymongoSignature:()=>true},
  '../utils/paymongoRefundVerification':{assertVerifiedQrRefund:()=>({})},
  '../utils/billing':{getBillingRecordWithItems:()=>({})},
  '../utils/audit':{writeAuditLog:()=>{}},
  '../controllers/staff.controller':staff,'../utils/sse':{broadcast:()=>{}},
 }
 const module={exports:{}}
 vm.runInNewContext(source,{require:moduleName=>{if(!(moduleName in dependencies))throw Error('Missing mock: '+moduleName);return dependencies[moduleName]},module,exports:module.exports,Buffer,URL,console,process})
 const event=id=>({data:{id,attributes:{type:'payment.paid',livemode:false,data:{id:'pay_123456',attributes:{
    payment_intent_id:'pi_test123',amount:actualAmount,livemode:false,status:'paid',currency:'PHP',source:{type:'qrph'}
 }}}}})
 return {handle:module.exports.handleWebhookEvent,event,attempt,getPaymentCount:()=>paymentCount,eventRows}
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

test('non-QR payment payload cannot settle a QR Ph bill',async()=>{
 const {handle,event,getPaymentCount}=setup()
 const forged=event('evt_FORGED99')
 forged.data.attributes.data.attributes.source.type='card'
 await assert.rejects(handle(forged),err=>err.code==='PAYMENT_AMOUNT_MISMATCH')
 assert.equal(getPaymentCount(),0)
})
