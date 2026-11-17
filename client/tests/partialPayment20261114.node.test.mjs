import test from 'node:test'
import assert from 'node:assert/strict'
import {calculateBalancePaymentPreview} from '../src/utils/paymentPreview.mjs'
test('checkout collects the full balance even if a stale draft contains partial payment fields',()=>{
 const result=calculateBalancePaymentPreview({bill:{balance_amount:3099},draft:{partial_payment:true,payment_amount:1000,payment_method:'cash',amount_received:3500}})
 assert.equal(result.valid,true);assert.equal(result.amount,3099);assert.equal(result.change,401);assert.equal(result.balanceAfter,0)
})
test('a later exact electronic payment settles only the outstanding balance',()=>{
 const result=calculateBalancePaymentPreview({bill:{balance_amount:2099},draft:{partial_payment:true,payment_amount:2099,payment_method:'gcash'}})
 assert.equal(result.valid,true);assert.equal(result.change,null);assert.equal(result.balanceAfter,0)
})
test('full payment ignores editable amount fields and insufficient cash cannot be submitted',()=>{
 assert.equal(calculateBalancePaymentPreview({bill:{balance_amount:100},draft:{payment_amount:10,payment_method:'gcash'}}).amount,100)
 assert.equal(calculateBalancePaymentPreview({bill:{balance_amount:100},draft:{partial_payment:true,payment_amount:10,payment_method:'cash',amount_received:50}}).valid,false)
})
