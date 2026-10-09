const test=require('node:test')
const assert=require('node:assert/strict')
const path=require('node:path')
const Module=require('node:module')
const root=path.resolve(__dirname,'../..')
function loadMock(file, replacements){
 const absolute=path.join(root,file)
 const real=Module._load
 Module._load=function(id,parent){if(parent?.filename===absolute && Object.prototype.hasOwnProperty.call(replacements,id)) return replacements[id];return real.apply(this,arguments)}
 try {delete require.cache[absolute];return require(absolute)}finally{Module._load=real}
}
test('Super Admin and Branch Admin cookies are independent and validated by role',async()=>{
 const saved=[]
 const jwt={sign:()=>'signedjwt',verify:()=>({id:1,role:'admin',session_version:1})}
 const db={query:async (sql,args)=>[[{id:args[0],session_version:1,account_role:args[0]===1?'superadmin':'admin',branch_id:args[0]===1?null:2}]]}
 const mod=loadMock('utils/sessionSecurity.js',{'jsonwebtoken':jwt,'../db/connect':db,'./generateCookie':(res,token,role)=>saved.push({role,token})})
 await mod.issueSession({},'admin',1)
 await mod.issueSession({},'admin',2)
 assert.deepEqual(saved.map(s=>s.role),['superadmin','admin'])
 const superUser=await mod.verifySessionToken('signedjwt','admin')
 assert.equal(superUser.account_role,'superadmin')
})
test('Appointment notification inherits its physical branch, not the legacy default',async()=>{
 const queries=[]
 const db={query:async(sql,args)=>{queries.push({sql,args});if(sql.includes('SELECT branch_id'))return [[{branch_id:2}]];return [{insertId:34}]}}
 const mod=loadMock('utils/notifications.js',{'../db/connect':db,'./sse':{broadcast:()=>{}}})
 const created=await mod.createNotification({target_role:'admin',type:'appointment_booked',title:'Booked',message:'New appointment',reference_type:'appointment',reference_id:123})
 assert.equal(created.branch_id,2)
 assert.equal(queries[1].args.at(-1),2)
})
test('Notifications without branch or owned reference remain global, not Branch 1',async()=>{
 const queries=[]
 const db={query:async(sql,args)=>{queries.push({sql,args});return [{insertId:3}]}}
 const mod=loadMock('utils/notifications.js',{'../db/connect':db,'./sse':{broadcast:()=>{}}})
 await mod.createNotification({target_role:'admin',type:'status',title:'Status',message:'Update'})
 assert.equal(queries[0].args.at(-1),0)
})
test('reference-data mutation rejects an ID from a different branch',async()=>{
 const queries=[]
 const db={query:async(sql,args)=>{queries.push({sql,args});return [[]]}}
 const handlers=loadMock('routers/branchSystemWrites.js',{'../db/connect':db,'../utils/audit':{writeAuditLog:async()=>{}}})
 const out={status(n){this.code=n;return this},json(v){this.body=v;return this}}
 await handlers.saveCancellation({branchId:2,params:{id:'44'},body:{label:'Travel conflict'}},out)
 assert.equal(out.code,404)
 assert.equal(queries.length,1)
 assert.match(queries[0].sql,/WHERE id=\? AND branch_id=\?/)
 assert.deepEqual(queries[0].args,[44,2])
})
test('creating branch cancellation reason writes the explicit branch',async()=>{
 const queries=[]
 const db={query:async(sql,args)=>{queries.push({sql,args});return [{insertId:61}]}}
 const handlers=loadMock('routers/branchSystemWrites.js',{'../db/connect':db,'../utils/audit':{writeAuditLog:async()=>{}}})
 const out={status(n){this.code=n;return this},json(v){this.body=v;return this}}
 await handlers.saveCancellation({branchId:4,params:{},body:{label:'Transport problem'},user:{id:9},adminContext:{account_role:'admin'}},out)
 assert.equal(out.code,201)
 assert.equal(out.body.id,61)
 assert.match(queries[0].sql,/branch_id\)/)
 assert.deepEqual(queries[0].args,['Transport problem',1,4])
})
