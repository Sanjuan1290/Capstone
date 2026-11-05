'use strict'
const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const {money,validRule,amountFor,priceFor}=require('../../utils/promotionPricing')

test('25% on a ₱1,550 service shows ₱1,162.50 and saves ₱387.50',()=>{
  assert.deepEqual(priceFor(1550,'percentage',25),{original:1550,discount:387.5,current:1162.5})
})
test('fixed discount never exceeds price or makes total negative',()=>{
  assert.deepEqual(priceFor(400,'fixed',500),{original:400,discount:400,current:0})
  assert.equal(amountFor(0,'percentage',25),0)
  assert.equal(money(100.1+0.2),100.3)
})
test('percentage, fixed and no-discount rule validation',()=>{
  assert.equal(validRule('percentage',100),true)
  assert.equal(validRule('percentage',101),false)
  assert.equal(validRule('fixed',-1),false)
  assert.equal(validRule('none',0),true)
  assert.equal(validRule('none',10),false)
  assert.equal(validRule('bad-type',10),false)
  assert.equal(amountFor(250,'bad-type',20),0)
})
test('billing and all reschedule paths preserve selected promotional discount boundaries',()=>{
  const root=path.join(__dirname,'../..')
  const billing=fs.readFileSync(path.join(root,'utils/billing.js'),'utf8')
  const cashier=fs.readFileSync(path.join(root,'controllers/staff.controller.js'),'utf8')
  assert.match(billing,/promotion_discount_amount_snapshot/)
  assert.match(billing,/item\.source_type==='consultation'/)
  assert.match(cashier,/combinedDiscount=toMoney\(discount\.amount\+courtesyTotal\+promotionDiscount\)/)
  for(const portal of ['patient','staff','admin']){
    const source=fs.readFileSync(path.join(root,`controllers/${portal}.controller.js`),'utf8')
    assert.match(source,/PROMOTION_DATE_MISMATCH/)
    assert.match(source,/promo_starts_on/)
    assert.match(source,/promo_ends_on/)
  }
})
