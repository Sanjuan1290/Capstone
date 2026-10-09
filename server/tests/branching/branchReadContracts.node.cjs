const { test } = require('node:test')
const assert = require('node:assert/strict')
const Module = require('node:module')
const path = require('node:path')
const root = path.resolve(__dirname,'../..')
const readsFile=path.join(root,'routers/branchOperationalReads.js')

function loadWithFakeDb(responses) {
  const queries=[]
  const fakeDb={query:async (sql,args=[])=>{
    queries.push({sql,args})
    const value=responses.shift()
    if(value === undefined)throw Error(`Unexpected query: ${sql.slice(0,100)}`)
    return value
  }}
  const original=Module._load
  Module._load=function(request,parent,isMain){
    if (parent?.filename===readsFile && request==='../db/connect')return fakeDb
    if (parent?.filename===readsFile && request==='../utils/billing')return {getBillingRecordWithItems:async id=>({id})}
    if (parent?.filename===readsFile && request==='../utils/supplyTransfers')return {groupTransferRows:rows=>rows}
    return original.apply(this,arguments)
  }
  try { delete require.cache[readsFile];return {api:require(readsFile),queries} } finally { Module._load=original }
}
function response(){return {code:0,body:null,status(n){this.code=n;return this},json(x){this.body=x;return this}}}
test('billing list and summary strictly include requested physical branch',async()=>{
  const x=loadWithFakeDb([[[{total:1}]],[[{id:7,paid_amount:10,payment_methods:'cash',balance_amount:0}]],[[{total:1,draft:0,ready:0,partially_paid:0,paid:1,outstanding:0,collected:10}]]])
  const out=response()
  await x.api.readBills({branchId:2,query:{status:'paid',page:1,limit:10}},out)
  assert.equal(out.body.items.length,1)
  assert.equal(out.body.summary.collected,10)
  assert.equal(x.queries.length,3)
  for(const [i,q] of x.queries.entries()){
    assert.match(q.sql,/b\.branch_id=\?/)
    assert.match(q.sql,/d\.branch_id=b\.branch_id/)
    assert.equal(q.args[0],2)
  }
})
test('cash drawer filters payments, refunds and closing by branch and cashier',async()=>{
  const x=loadWithFakeDb([[[{transactions:2,cash_received:100,non_cash_collected:25}]],[[{cash_refunds:10}]],[[null]]])
  const out=response()
  await x.api.readCashDrawer({branchId:3,user:{id:13},query:{date:'2026-10-09'}},out)
  assert.equal(out.body.expected_cash,90)
  assert.equal(out.body.non_cash_collected,25)
  assert.equal(x.queries.length,3)
  for(const q of x.queries){assert.match(q.sql,/branch_id=\?/);assert.equal(q.args[0],3);assert.equal(q.args[1],13)}
})
test('stock requests are confined to the requested branch',async()=>{
  const x=loadWithFakeDb([[[]]])
  const out=response()
  await x.api.readTransferGroups({branchId:9},out)
  assert.deepEqual(out.body,[])
  assert.equal(x.queries[0].args[0],9)
  assert.match(x.queries[0].sql,/g\.branch_id=\?/)
  assert.match(x.queries[0].sql,/i\.branch_id=g\.branch_id/)
  assert.match(x.queries[0].sql,/d\.branch_id=g\.branch_id/)
  assert.match(x.queries[0].sql,/loc\.branch_id=g\.branch_id/)
})
test('system setup scopes clinical and physical resources while allowing shared reference directories',async()=>{
  const responses=Array.from({length:7},()=>[[]])
  const x=loadWithFakeDb(responses)
  const out=response()
  await x.api.readSystemSetup({branchId:8},out)
  assert.equal(x.queries.length,7)
  for(let i of [0,1,2,5]){assert.match(x.queries[i].sql,/branch_id=\?/);assert.equal(x.queries[i].args[0],8)}
  assert.deepEqual(Object.keys(out.body),['visit_reasons','cancellation_reasons','service_categories','uoms','suppliers','location_types','movement_reasons'])
})
test('separate admin cookies and branch-specific API gateway are present',()=>{
  const fs=require('node:fs')
  const auth=fs.readFileSync(path.join(root,'middlewares/auth.middleware.js'),'utf8')
  const ses=fs.readFileSync(path.join(root,'utils/sessionSecurity.js'),'utf8')
  const router=fs.readFileSync(path.join(root,'routers/branches.router.js'),'utf8')
  assert.match(ses,/account\.account_role === 'superadmin' \? 'superadmin' : 'admin'/)
  assert.match(auth,/authenticate\.adminContext/)
  assert.match(router,/BRANCH_OPERATION_NOT_READY/)
  assert.match(router,/!req\.path\.startsWith\('\/my'\)/)
})
