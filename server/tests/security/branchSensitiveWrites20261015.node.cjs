'use strict'
const {test}=require('node:test')
const assert=require('node:assert/strict')
const {createHandlers}=require('../../routers/branchSensitiveWrites')
const response=()=>({statusCode:200,payload:null,status(n){this.statusCode=n;return this},json(p){this.payload=p;return this}})
const request=(params,body={})=>({params,body,branchId:2,user:{id:71},adminContext:{account_role:'admin'},ip:'127.0.0.1'})
function mockDb(query){const state={committed:false,rolledBack:false,calls:[]};const conn={
 query:async(sql,args)=>{state.calls.push({sql,args});return query(sql,args)},
 beginTransaction:async()=>{},commit:async()=>{state.committed=true},rollback:async()=>{state.rolledBack=true},release:()=>{}
 };return {getConnection:async()=>conn,state}}
const load=(db,audit=async()=>{},broadcast=()=>{})=>createHandlers({db,writeAuditLog:audit,broadcast})
test('adjustment foreign branch cannot be approved: no mutations, transaction rolled back',async()=>{
 const db=mockDb(async()=>[[]]),res=response()
 await load(db).resolveAdjustment(request({id:'93'},{status:'approved'}),res)
 assert.equal(res.statusCode,404);assert.equal(db.state.rolledBack,true);assert.equal(db.state.committed,false)
 assert.equal(db.state.calls.length,1)
 assert.match(db.state.calls[0].sql,/br\.branch_id=\? FOR UPDATE/)
 assert.deepEqual(db.state.calls[0].args,[93,2])
})
test('valid branch adjustment approves and audits inside transaction',async()=>{
 let events=0;const audited=[]
 const db=mockDb(async(sql,args)=>{
  if(sql.includes('FROM billing_records br'))return [[{id:19,status:'draft',version:4}]]
  if(sql.includes('FROM billing_adjustment_requests ar'))return [[{id:55,status:'pending',bill_version:4,billing_id:19}]]
  if(sql.includes('UPDATE billing_adjustment_requests'))return [{affectedRows:1}]
  throw Error('Unexpected query '+sql)
 })
 const res=response()
 await load(db,async(payload,conn)=>{assert.ok(conn);audited.push(payload)},()=>{events++}).resolveAdjustment(request({id:'55'},{status:'approved'}),res)
 assert.equal(res.statusCode,200);assert.equal(res.payload.id,55);assert.equal(db.state.committed,true)
 assert.equal(audited[0].branchId,2);assert.equal(audited[0].action,'billing.adjustment_approved');assert.equal(events,1)
 assert.ok(db.state.calls.some(c=>c.sql.includes('br.branch_id=?')&&c.args[0]===2))
})
test('concurrent version change expires an adjustment in owning branch',async()=>{
 const audited=[]
 const db=mockDb(async(sql)=>{
  if(sql.includes('FROM billing_records br'))return [[{id:19,status:'ready',version:5}]]
  if(sql.includes('FROM billing_adjustment_requests ar'))return [[{id:55,status:'pending',bill_version:4,billing_id:19}]]
  if(sql.includes('UPDATE billing_adjustment_requests'))return [{affectedRows:1}]
  throw Error('Unexpected query '+sql)
 })
 const res=response()
 await load(db,async payload=>audited.push(payload)).resolveAdjustment(request({id:'55'},{status:'rejected',admin_note:'Expired'}),res)
 assert.equal(res.statusCode,409);assert.equal(res.payload.code,'ADJUSTMENT_EXPIRED')
 assert.equal(db.state.committed,true);assert.equal(audited[0].branchId,2)
})
test('mixed or unowned archive is never deleted',async()=>{
 const db=mockDb(async(sql)=>{
  if(sql.startsWith('SELECT')&&sql.includes('FROM audit_log_archives'))return [[{id:7,archive_code:'ARC-7'}]]
  if(sql.includes('COUNT(*)'))return [[{total:5,owned:4}]]
  throw Error('Unexpected deletion '+sql)
 })
 const res=response();await load(db).deleteArchive(request({archiveId:'7'},{confirmation:'DELETE',reason:'Retention policy'}),res)
 assert.equal(res.statusCode,409);assert.equal(res.payload.code,'MIXED_BRANCH_ARCHIVE');assert.equal(db.state.rolledBack,true)
 assert.ok(!db.state.calls.some(c=>c.sql.startsWith('DELETE')))
})
test('branch-exclusive archive deletion checks affected rows and creates audit',async()=>{
 const audited=[]
 const db=mockDb(async(sql,args)=>{
  if(sql.startsWith('SELECT')&&sql.includes('FROM audit_log_archives'))return [[{id:7,archive_code:'ARC-7'}]]
  if(sql.includes('COUNT(*)'))return [[{total:2,owned:2}]]
  if(sql.startsWith('DELETE'))return [{affectedRows:sql.includes('audit_logs')?2:1}]
  throw Error('Unexpected '+sql)
 })
 const res=response();await load(db,async payload=>audited.push(payload)).deleteArchive(request({archiveId:'7'},{confirmation:'DELETE',reason:'Retention policy'}),res)
 assert.equal(res.statusCode,200);assert.equal(db.state.committed,true);assert.equal(audited[0].branchId,2)
 assert.match(db.state.calls.find(c=>c.sql.startsWith('DELETE FROM audit_logs')).sql,/branch_id=\?/)
})
test('payment approval and refund use branch predicates and branch-locked token',()=>{
 const fs=require('node:fs'),path=require('node:path')
 const src=fs.readFileSync(path.resolve(__dirname,'../../controllers/admin.controller.js'),'utf8')
 assert.match(src,/getBillingPaymentForProtectedAction\(paymentId, db, false, req\.branchId\)/)
 assert.match(src,/getBillingPaymentForProtectedAction\(paymentId, conn, true, req\.branchId\)/)
 assert.match(src,/AND br\.branch_id = \?/) 
 assert.match(src,/authorization\.branch_id\) !== Number\(payment\.billing_branch_id\)/)
 assert.match(src,/\{branchId:req\.branchId \|\| Number\(authorization\.branch_id\)\}/)
})


