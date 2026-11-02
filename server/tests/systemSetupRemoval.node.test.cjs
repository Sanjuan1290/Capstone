const test=require('node:test')
const assert=require('node:assert/strict')
const vm=require('node:vm')
const fs=require('node:fs')
const path=require('node:path')
const source=fs.readFileSync(path.join(__dirname,'../utils/systemSetupRemoval.js'),'utf8')
function harness({record={id:8,name:'Example',label:'Example',code:'ex',branch_id:2,is_system:0,is_active:1,created_at:'2026-11-02',clinic_type:'medical'},counts=[0],failCode=null}={}){
 const queries=[];let pos=0,commits=0,rollbacks=0;
 const connection={
  beginTransaction:async()=>{},
  rollback:async()=>{rollbacks++},
  commit:async()=>{commits++},
  release:()=>{},
  query:async(sql,args=[])=>{
   queries.push({sql,args})
   if(sql.startsWith('SELECT * FROM'))return [[record]]
   if(sql.includes('COUNT('))return [[{n:counts[pos++]??0}]]
   if(failCode && sql.startsWith('DELETE')){const e=new Error('FK');e.code=failCode;throw e}
   return [{affectedRows:1}]
  }
 }
 const mod={exports:{}}
 vm.runInNewContext(source,{module:mod,exports:mod.exports,require(id){if(id==='../db/connect')return {getConnection:async()=>connection};if(id==='./audit')return {writeAuditLog:async()=>{}};throw Error(id)}})
 let status=200,body
 const res={status(n){status=n;return this},json(b){body=b;return this}}
 const req={params:{id:'8'},branchId:2,user:{id:3},adminContext:{account_role:'admin'},ip:'127.0.0.1'}
 return {impl:mod.exports,req,res,queries,get status(){return status},get body(){return body},get commits(){return commits},get rollbacks(){return rollbacks}}
}
test('deletes an unused branch-owned category',async()=>{
 const h=harness();await h.impl.removeBranchReference(h.req,h.res,'service_categories')
 assert.equal(h.body.deleted,true);assert.equal(h.commits,1)
 assert(h.queries.some(x=>x.sql.startsWith('DELETE FROM billing_service_categories') && x.args[1]===2))
})
test('deactivates referenced cancellation reasons rather than deleting',async()=>{
 const h=harness({counts:[5]});await h.impl.removeBranchReference(h.req,h.res,'cancellation_reasons')
 assert.equal(h.body.deactivated,true);assert.equal(h.body.deleted,false)
 assert(h.queries.some(x=>x.sql.startsWith('UPDATE appointment_cancellation_reasons')))
 assert(!h.queries.some(x=>x.sql.startsWith('DELETE FROM appointment_cancellation_reasons')))
})
test('stock movement reason lookup includes inventory history',async()=>{
 const h=harness({counts:[1]});await h.impl.removeBranchReference(h.req,h.res,'movement_reasons')
 assert.equal(h.body.deactivated,true)
 assert(h.queries.some(x=>x.sql.includes('inventory_logs') && x.args[0]===2 && x.args[1]==='ex'))
})
test('protects cross-branch and system movement reasons',async()=>{
 const h=harness({record:{id:8,branch_id:2,is_system:1,is_active:1}});await h.impl.removeBranchReference(h.req,h.res,'movement_reasons')
 assert.equal(h.status,403);assert.equal(h.commits,0)
})
test('visit reasons default to preserving history when post-creation bookings exist',async()=>{
 const h=harness({counts:[0,1]});await h.impl.removeBranchReference(h.req,h.res,'visit_reasons')
 assert.equal(h.body.deactivated,true)
})
test('handles foreign key races without claiming deletion',async()=>{
 const h=harness({failCode:'ER_ROW_IS_REFERENCED_2'});await h.impl.removeBranchReference(h.req,h.res,'service_categories')
 assert.equal(h.status,409);assert.equal(h.commits,0);assert(h.rollbacks>0)
})
test('super admin cannot delete built-in movement reason',async()=>{
 const h=harness({record:{id:8,is_system:1,branch_id:null}});await h.impl.removeGlobalReference(h.req,h.res,'movement_reasons')
 assert.equal(h.status,409);assert.equal(h.commits,0)
})
