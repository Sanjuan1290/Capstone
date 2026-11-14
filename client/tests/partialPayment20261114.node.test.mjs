import test from 'node:test'
import assert from 'node:assert/strict'
import {calculateBalancePaymentPreview} from '../src/utils/paymentPreview.mjs'
test('cash partial payment retains tender, change and remaining balance',()=>{
 const result=calculateBalancePaymentPreview({bill:{balance_amount:3099},draft:{partial_payment:true,payment_amount:1000,payment_method:'cash',amount_received:1500}})
 assert.equal(result.valid,true);assert.equal(result.amount,1000);assert.equal(result.change,500);assert.equal(result.balanceAfter,2099)
})
test('a later exact electronic payment settles only the outstanding balance',()=>{
 const result=calculateBalancePaymentPreview({bill:{balance_amount:2099},draft:{partial_payment:true,payment_amount:2099,payment_method:'gcash'}})
 assert.equal(result.valid,true);assert.equal(result.change,null);assert.equal(result.balanceAfter,0)
})
test('full payment remains the default and invalid partial amounts cannot be submitted',()=>{
 assert.equal(calculateBalancePaymentPreview({bill:{balance_amount:100},draft:{payment_amount:10,payment_method:'gcash'}}).amount,100)
 for(const payment_amount of [0,101,-1,1.001])assert.equal(calculateBalancePaymentPreview({bill:{balance_amount:100},draft:{partial_payment:true,payment_amount,payment_method:'gcash'}}).valid,false)
})
