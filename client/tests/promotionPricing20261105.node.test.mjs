import test from 'node:test'
import assert from 'node:assert/strict'
import {promotionQuote} from '../src/utils/promotionPricing.mjs'

test('service card price displays same percentage as the server',()=>{
  assert.deepEqual(promotionQuote(1550,{discount_type:'percentage',discount_value:25}),{original:1550,discount:387.5,current:1162.5})
})
test('fixed peso offer clips at original price',()=>{
  assert.deepEqual(promotionQuote(500,{discount_type:'fixed',discount_value:650}),{original:500,discount:500,current:0})
})
test('legacy informational offers keep original service price',()=>{
  assert.deepEqual(promotionQuote(1550,{discount_type:'none',discount_value:0}),{original:1550,discount:0,current:1550})
  assert.equal(promotionQuote(null,{discount_type:'percentage',discount_value:20}),null)
})
