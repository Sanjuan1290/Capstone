const { test } = require('node:test')
const assert = require('node:assert/strict')
const Module = require('node:module')
const path = require('node:path')
const root = path.resolve(__dirname,'../..')
const readsFile=path.join(root,'routers/branchOperationalReads.js')

function loadWithFakeDb(responses) {
  const queries=[]
  const ledgerCalls=[]
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
    if (parent?.filename===readsFile && request==='../utils/reportMetrics')return {loadCollectionLedger:async options=>{ledgerCalls.push(options);return {rows:[],byMethod:[],summary:{gross_received:0,voided:0,refunded:0,net_collected:0}}},summarizeLedgerRows:()=>({net_collected:0})}
    return original.apply(this,arguments)
  }
  try { delete require.cache[readsFile];return {api:require(readsFile),queries,ledgerCalls} } finally { Module._load=original }
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
    if(i < 2){assert.match(q.sql,/b\.status IN/);assert.equal(q.args[1],'paid')}
    else {assert.doesNotMatch(q.sql,/b\.status IN \([^)]*\)\s*(?:AND|$)/);assert.deepEqual(q.args,[2])}
  }
})
test('transaction payment filters use the same completed payment for method and payment-date range',async()=>{
  const x=loadWithFakeDb([[[{total:4}]], [[]], [[{total:4,draft:0,ready:0,partially_paid:0,paid:4,outstanding:0,collected:80}]]])
  const out=response()
  await x.api.readBills({branchId:5,query:{status:'paid',payment_method:'GCASH',date_basis:'payment',date_from:'2026-10-01',date_to:'2026-10-20',page:2,limit:12}},out)
  const [count,rows,summary]=x.queries
  for(const q of [count,rows,summary]){
    assert.match(q.sql,/bpf\.billing_id=b\.id/)
    assert.match(q.sql,/bpf\.status='completed'/)
    assert.match(q.sql,/bpf\.payment_method=\?/)
    assert.match(q.sql,/DATE\(bpf\.paid_at\)>=\?/)
    assert.match(q.sql,/DATE\(bpf\.paid_at\)<=\?/)
    assert.deepEqual(q.args.slice(0,q===summary?4:5),q===summary?[5,'gcash','2026-10-01','2026-10-20']:[5,'paid','gcash','2026-10-01','2026-10-20'])
  }
  assert.doesNotMatch(summary.sql,/b\.status IN \(\?\)/)
  assert.deepEqual(summary.args,[5,'gcash','2026-10-01','2026-10-20'])
  assert.deepEqual(rows.args.slice(0,-2),count.args)
  assert.deepEqual(rows.args.slice(-2),[12,12])
  assert.equal(out.body.pagination.total,4)
  assert.equal(out.body.summary.total,4)
})
test('visit and finalized date bases filter their matching bill dates and summary totals',async()=>{
  for(const [date_basis,column] of [['visit','a.appointment_date'],['finalized','b.finalized_at']]){
    const x=loadWithFakeDb([[[{total:1}]], [[]], [[{total:1,draft:1,ready:0,partially_paid:0,paid:0,outstanding:30,collected:0}]]])
    const out=response()
    await x.api.readBills({branchId:6,query:{status:'draft',payment_method:'cash',date_basis,date_from:'2026-10-04',date_to:'2026-10-09'}},out)
    const [count,rows,summary]=x.queries
    for(const q of [count,rows,summary]){
      assert.match(q.sql,new RegExp(`DATE\\(${column.replace('.','\\.')}\\)>=\\?`))
      assert.match(q.sql,new RegExp(`DATE\\(${column.replace('.','\\.')}\\)<=\\?`))
      assert.match(q.sql,/bpm\.status='completed'/)
      assert.match(q.sql,/bpm\.payment_method=\?/)
      assert.deepEqual(q.args,[6,...(q===summary?[]:['draft']),'cash','2026-10-04','2026-10-09',...(q===rows?[10,0]:[])])
    }
    assert.equal(out.body.pagination.total,out.body.summary.total)
    assert.doesNotMatch(summary.sql,/b\.status IN \(\?\)/)
  }
})
test('checkout tiles remain stable when switching tabs while list rows remain status-filtered',async()=>{
  const aggregate={total:7,draft:2,pending:1,ready:1,partially_paid:1,paid:3,outstanding:100,collected:200}
  for(const status of ['draft,pending','ready','partially_paid','paid']){
    const x=loadWithFakeDb([[[{total:1}]],[[{id:4,paid_amount:0,payment_methods:'',balance_amount:100}]],[[aggregate]]])
    const out=response()
    await x.api.readBills({branchId:1,query:{status,search:'patient',page:1,limit:10}},out)
    assert.deepEqual([out.body.summary.draft,out.body.summary.pending,out.body.summary.ready,out.body.summary.partially_paid,out.body.summary.paid],[2,1,1,1,3])
    assert.equal(out.body.pagination.total,1)
    assert.match(x.queries[0].sql,/b\.status IN/)
    assert.match(x.queries[1].sql,/b\.status IN/)
    assert.doesNotMatch(x.queries[2].sql,/WHERE b\.branch_id=\? AND b\.status IN \(/)
    assert.deepEqual(x.queries[2].args,[1,'%patient%','%patient%','%patient%'])
    assert.deepEqual(x.queries[0].args.slice(0,-3),[1,...status.split(',')])
  }
})
test('clinic-local default is preserved during midnight rollover without changing an explicit date',async()=>{
  const originalDate=global.Date
  const fixed=new originalDate('2026-10-25T16:30:00.000Z')
  global.Date=class extends originalDate{
    constructor(...args){super(...(args.length?args:[fixed.getTime()]))}
    static now(){return fixed.getTime()}
  }
  try {
    for(const requestedDate of [undefined,'2026-10-12']){
      const x=loadWithFakeDb([[[{transactions:0,cash_received:0,non_cash_collected:0}]],[[{cash_refunds:0}]],[[null]]])
      const out=response()
      await x.api.readCashDrawer({branchId:7,user:{id:11},query:requestedDate?{date:requestedDate}:{}},out)
      const expected=requestedDate||'2026-10-26'
      assert.equal(out.body.date,expected)
      for(const q of x.queries)assert.equal(q.args.at(-1),expected)
    }
  }finally{global.Date=originalDate}
})
test('branch reconciliation defaults to Manila date and respects explicit date',async()=>{
  const originalDate=global.Date
  const fixed=new originalDate('2026-10-25T16:30:00.000Z')
  global.Date=class extends originalDate{
    constructor(...args){super(...(args.length?args:[fixed.getTime()]))}
    static now(){return fixed.getTime()}
  }
  try{
    for(const requestedDate of [undefined,'2026-10-15']){
      const x=loadWithFakeDb([[[{discounts:0}]],[[{total:0}]],[[]],[[]]])
      const routes=new Map()
      x.api.registerBranchOperationalReads({get:(name,...middlewares)=>routes.set(name,middlewares.at(-1))},{requireSuper:()=>{},branchContext:()=>{},requirePermission:()=>()=>{},allowAnyPermission:()=>()=>{}})
      const reconcile=routes.get('/my/legacy/billing/reconciliation')
      assert.equal(typeof reconcile,'function')
      const out=response()
      await reconcile({branchId:7,query:requestedDate?{date:requestedDate}:{}},out)
      const expected=requestedDate||'2026-10-26'
      assert.equal(out.body.date,expected)
      assert.deepEqual(x.ledgerCalls,[{startDate:expected,endDate:expected,branchId:7}])
      for(const q of x.queries){assert.equal(q.args[0],7);assert.equal(q.args.at(-1),expected)}
    }
  }finally{global.Date=originalDate}
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
  // /my* uses the Branch Admin cookie; /me does too unless the Super Admin portal header is sent; all else uses the Super Admin cookie.
  assert.match(router,/req\.path\.startsWith\('\/my'\) \|\| \(req\.path === '\/me' && req\.get\('x-admin-portal'\) !== 'superadmin'\)/)
  assert.match(router,/authenticate\.adminContext\(!usesBranchAdminCookie\(req\)\)/)
})



