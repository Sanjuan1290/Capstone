const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),path=require('node:path')
const source=fs.readFileSync(path.join(__dirname,'../../controllers/staff.controller.js'),'utf8')
const code=source.slice(source.indexOf('const finalizeBill ='),source.indexOf('// Used by both Staff and Admin checkout screens'))+';finalizeBill'
for(const role of ['admin','staff'])for(const kind of ['charge','discount','consultation'])test(`${role} cannot confirm with unresolved ${kind}`,async()=>{
 const log=[]
 const conn={beginTransaction:async()=>log.push('begin'),rollback:async()=>log.push('rollback'),release:()=>log.push('release'),query:async(sql,args)=>{
  log.push(sql)
  if(sql.startsWith('SELECT * FROM billing_records')){assert.deepEqual(Array.from(args),[6,1]);return [[{id:6,status:'draft',version:1,consultation_id:11}]]}
  if(sql.includes('FROM consultations'))return [[{status:kind==='consultation'?'draft':'finalized'}]]
  if(sql.includes('FROM billing_adjustment_requests'))return [[{count:kind==='discount'?1:0}]]
  if(sql.includes('FROM billing_charge_adjustments')){assert.deepEqual(Array.from(args),[6,1]);return [[{count:kind==='charge'?1:0}]]}
  throw new Error('Unexpected SQL '+sql)
 }}
 const finalize=vm.runInNewContext(code,{db:{getConnection:async()=>conn}})
 let status=200,payload
 await finalize({user:{id:8,role},branchId:1,params:{id:6},body:{expected_version:1}},{status(n){status=n;return this},json(v){payload=v;return this}})
 assert.equal(status,409);assert.equal(payload.code,kind==='consultation'?'CONSULTATION_NOT_COMPLETED':'PENDING_BILLING_APPROVAL');assert.ok(log.includes('rollback'));assert.equal(log.at(-1),'release');assert.equal(log.some(s=>s.startsWith('UPDATE ')),false)
})
