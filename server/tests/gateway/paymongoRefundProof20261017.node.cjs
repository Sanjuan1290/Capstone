'use strict'
const test=require('node:test')
const assert=require('node:assert/strict')
const {assertVerifiedQrRefund}=require('../../utils/paymongoRefundVerification')
const attempt={provider_payment_id:'pay_correct',amount_centavos:50000}
const confirmed={id:'ref_123456',attributes:{livemode:false,status:'succeeded',payment_id:'pay_correct',currency:'PHP',amount:50000}}
test('only a provider-confirmed full refund matches the exact test payment',()=>{
 assert.deepEqual(assertVerifiedQrRefund(confirmed,attempt),{refundId:'ref_123456',paymentId:'pay_correct',amountCentavos:50000})
})
test('admin notes, pending, mismatched, live and partial refunds cannot prove refund',()=>{
 for(const bad of [null, {id:'ref_bad',attributes:{...confirmed.attributes,status:'pending'}},
  {...confirmed,attributes:{...confirmed.attributes,payment_id:'pay_wrong'}},
  {...confirmed,attributes:{...confirmed.attributes,amount:1000}},
  {...confirmed,attributes:{...confirmed.attributes,livemode:true}}]){
  assert.throws(()=>assertVerifiedQrRefund(bad,attempt),/refund must be fully succeeded/i)
 }
})


test('a live refund matches only a live payment attempt',()=>{
 const live={...attempt,mode:'live'}
 const proof={...confirmed,attributes:{...confirmed.attributes,livemode:true}}
 assert.deepEqual(assertVerifiedQrRefund(proof,live),{refundId:'ref_123456',paymentId:'pay_correct',amountCentavos:50000})
 assert.throws(()=>assertVerifiedQrRefund(confirmed,live),/correct payment environment/)
})


