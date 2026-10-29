'use strict'
// Zero-production-access verification of actual registered branch status handlers.
// Mocked database: this tests authorization, validation, ordering and transaction
// logic; it is NOT a substitute for real TiDB/HTTP integration testing.
const test=require('node:test')
const assert=require('node:assert/strict')
const fs=require('node:fs')
const path=require('node:path')
const vm=require('node:vm')
const src=fs.readFileSync(path.join(__dirname,'../../routers/branches.router.js'),'utf8')
const branchesUi=fs.readFileSync(path.join(__dirname,'../../../client/src/pages/superAdminPage/redesign/Branches.jsx'),'utf8')

function buildRouter({active=0,exists=true,pending=0}={}) {
 const state={active,pending,exists,selects:0,updates:[],audits:[],commits:0,rollbacks:0,releases:0}
 const routes=[]
 const router={}
 for(const method of ['use','get','post','put','patch','delete','all']) router[method]=function(path,...handlers){routes.push({method,path,handlers});return this}
 const db={
  getConnection:async()=>({
   beginTransaction:async()=>{},
   query:async(sql,args=[])=>{
    if(sql.startsWith('SELECT id,name,is_active FROM clinic_branches')) {state.selects++;return [[state.exists?{id:Number(args[0]),name:'Clinic A',is_active:state.active}:undefined]]}
    if(sql.startsWith('SELECT COUNT(*) AS total FROM appointments')) return [[{total:state.pending}]]
    if(sql.startsWith('UPDATE clinic_branches SET is_active=?')) {state.active=args[0];state.updates.push(args);return [{affectedRows:1}]}
    throw new Error('Unexpected SQL in status handler: '+sql)
   },
   commit:async()=>{state.commits++},rollback:async()=>{state.rollbacks++},release:()=>{state.releases++}
  }),
  query:async()=>{throw new Error('Unexpected pool query during status change')}
 }
 const routeExports={}
 const reqStub={
   get:()=>null,
 }
 const noOp=()=>{}
 const registerOnly=new Proxy({}, {get:(target,key)=>key==='apiRouter'?{}:noOp})
 const oldAdmin=new Proxy({}, {get:()=>noOp})
 function fakeRequire(moduleName){
  if(moduleName==='express')return {Router:()=>router}
  if(moduleName==='../db/connect')return db
  if(moduleName==='../middlewares/auth.middleware')return {adminContext:()=>noOp}
  if(moduleName==='../utils/audit')return {writeAuditLog:async(args)=>{state.audits.push(args)}}
  if(moduleName==='../utils/clinicEvents')return {afterSuccessfulMutation:()=>noOp}
  if(moduleName==='../utils/inventoryBatches')return {attachBatchesToInventory:noOp}
  if(moduleName==='../utils/bookingPolicy')return {validateBookingSettings:noOp}
  if(moduleName==='../utils/branchProvisioning')return {provisionBranch:noOp}
  if(moduleName==='../utils/securityCrypto')return {makeTemporaryPassword:noOp}
  if(moduleName==='../utils/emailService')return {sendTempPassword:noOp}
  if(moduleName==='../controllers/admin.controller')return oldAdmin
  if(moduleName.startsWith('./'))return registerOnly
  if(moduleName==='bcrypt')return {}
  return require(moduleName)
 }
 const mod={exports:routeExports}
 vm.runInNewContext('(function(require,module,exports){\n'+src+'\n})',{console,process,Buffer,setTimeout,clearTimeout},{filename:'branches.router.js'})(fakeRequire,mod,routeExports)
 const status=routes.find(r=>r.method==='patch'&&r.path==='/:branchId/status')
 assert.ok(status,'status patch route registered')
 assert.equal(status.handlers.length,2,'status handler must use Superadmin authorization and not active-only branchContext')
 const call=async({branchId='7',body={is_active:true},role='superadmin'}={})=>{
  const response={statusCode:200,payload:null,status(code){this.statusCode=code;return this},json(data){this.payload=data;return this}}
  const req={...reqStub,params:{branchId},body,user:{id:1},adminContext:{account_role:role},ip:'127.0.0.1'}
  let nextCalled=false
  await status.handlers[0](req,response,()=>{nextCalled=true})
  if(nextCalled)await status.handlers[1](req,response)
  return response
 }
 return {state,call,routes}
}

test('reactivates inactive branch, commits, records audit and releases connection',async()=>{
 const {state,call}=buildRouter({active:0})
 const res=await call({body:{is_active:true}})
 assert.equal(res.statusCode,200)
 assert.deepEqual(JSON.parse(JSON.stringify(res.payload)),{id:7,is_active:1,changed:true,message:'Branch is active.'})
 assert.equal(state.active,1);assert.equal(state.commits,1);assert.equal(state.rollbacks,0);assert.equal(state.releases,1)
 assert.deepEqual(JSON.parse(JSON.stringify(state.updates)),[[1,7]])
 assert.equal(state.audits[0].action,'branch.reactivated')
})
test('deactivation blocks upcoming appointments and leaves branch active',async()=>{
 const {state,call}=buildRouter({active:1,pending:2})
 const res=await call({body:{is_active:false}})
 assert.equal(res.statusCode,409)
 assert.equal(res.payload.code,'BRANCH_HAS_ACTIVE_APPOINTMENTS')
 assert.equal(state.active,1);assert.equal(state.updates.length,0)
 assert.equal(state.rollbacks,1);assert.equal(state.commits,0);assert.equal(state.audits.length,0)
 assert.equal(state.releases,1)
})
test('deactivation succeeds with no bookings and records audit',async()=>{
 const {state,call}=buildRouter({active:1,pending:0})
 const res=await call({body:{is_active:false}})
 assert.equal(res.statusCode,200)
 assert.equal(state.active,0)
 assert.equal(state.audits[0].action,'branch.deactivated')
})
test('staff and branch-admin accounts cannot change branch active status',async()=>{
 for (const role of ['admin','staff']) {
  const {state,call}=buildRouter({active:0})
  const res=await call({role,body:{is_active:true}})
  assert.equal(res.statusCode,403)
  assert.equal(state.updates.length,0)
  assert.equal(state.releases,0)
 }
})
test('invalid branch IDs are rejected without issuing updates',async()=>{
 for(const branchId of ['abc','0','-1']){
  const {state,call}=buildRouter()
  const res=await call({branchId})
  assert.equal(res.statusCode,400)
  assert.equal(state.releases,0)
 }
})
test('missing or invalid status is rejected',async()=>{
 for (const body of [{},{is_active:1},{is_active:'false'},{is_active:null}]) {
  const {state,call}=buildRouter()
  const res=await call({body})
  assert.equal(res.statusCode,400)
  assert.equal(state.updates.length,0)
 }
})
test('unknown branch returns 404 without creating records',async()=>{
 const {state,call}=buildRouter({exists:false})
 const res=await call()
 assert.equal(res.statusCode,404)
 assert.equal(state.updates.length,0);assert.equal(state.rollbacks,1);assert.equal(state.releases,1)
})
test('setting an already-matching status is idempotent',async()=>{
 const {state,call}=buildRouter({active:1})
 const res=await call({body:{is_active:true}})
 assert.equal(res.statusCode,200)
 assert.equal(res.payload.changed,false)
 assert.equal(state.updates.length,0)
 assert.equal(state.audits.length,0)
 assert.equal(state.commits,1)
})
test('inactive branch operational actions are disabled while status switch remains accessible',()=>{
 assert.match(branchesUi,/disabled\s+aria-label=\{`Manage \$\{b\.name\} \(inactive\)`\}/)
 assert.match(branchesUi,/SecondaryButton disabled=\{!Number\(b\.is_active\)\}/)
 assert.match(branchesUi,/disabled=\{saving\} checked=\{Boolean\(Number\(b\.is_active\)\)\}/)
 assert.match(branchesUi,/method:'PATCH',body:JSON\.stringify\(\{is_active:active\}\)/)
 assert.doesNotMatch(branchesUi,/:error\?null:displayed\.length\?/)
})
test('active/inactive status filter compares strings correctly',()=>{
 assert.match(branchesUi,/filter===\(Number\(b\.is_active\)\?'active':'inactive'\)/)
})
