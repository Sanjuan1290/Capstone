const test = require('node:test')
const assert = require('node:assert/strict')
const { getSemaphoreBalance } = require('../utils/semaphoreBalance')

test('Semaphore balance is cached and refresh requests respect provider rate limits', async () => {
  const originalKey=process.env.SEMAPHORE_API_KEY
  process.env.SEMAPHORE_API_KEY='TEST_KEY_DO_NOT_SEND'
  try {
    let lookups=0
    const lookup=async key=>{assert.equal(key,'TEST_KEY_DO_NOT_SEND');lookups++;return {credit_balance:42}}
    const one=await getSemaphoreBalance({now:1700000000000,lookup})
    assert.equal(one.credit_balance,42)
    assert.equal(one.cached,false)
    const two=await getSemaphoreBalance({now:1700000001000,refresh:true,lookup})
    assert.equal(two.cached,true)
    assert.equal(lookups,1)
    const three=await getSemaphoreBalance({now:1700000040000,refresh:true,lookup})
    assert.equal(three.credit_balance,42)
    assert.equal(lookups,2)
    const four=await getSemaphoreBalance({now:1700000140000,lookup:async()=>{throw new Error('PROVIDER SECRET DO NOT LEAK')}})
    assert.equal(four.stale,true)
    assert.equal(four.credit_balance,42)
    assert.equal(JSON.stringify(four).includes('PROVIDER SECRET'),false)
  } finally {if(originalKey===undefined)delete process.env.SEMAPHORE_API_KEY;else process.env.SEMAPHORE_API_KEY=originalKey}
})

test('Super Admin credits API is protected and never exposes key', () => {
  const fs=require('fs')
  const path=require('path')
  const src=fs.readFileSync(path.join(__dirname,'../routers/admin.router.js'),'utf8')
  const ui=fs.readFileSync(path.join(__dirname,'../../client/src/pages/superAdminPage/redesign/SystemSetup.jsx'),'utf8')
  assert.match(src,/router\.get\('\/system-setup\/sms-credits', \.\.\.auth, semaphoreBalance\.getCredits\)/)
  assert.match(ui,/Refresh Balance/)
  assert.match(ui,/Buy SMS Credits on Semaphore/)
  assert.doesNotMatch(ui,/SEMAPHORE_API_KEY/)
})
