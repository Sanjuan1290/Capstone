const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),path=require('node:path')
const tax=require('../../utils/billingTaxPolicy')
function harness({version=0,branchExists=true}={}){
 const writes=[],audits=[],events=[],conn={beginTransaction:async()=>events.push('begin'),commit:async()=>events.push('commit'),rollback:async()=>events.push('rollback'),release(){},query:async(sql,args)=>{
  if(sql.startsWith('SELECT id FROM clinic_branches'))return [branchExists?[{id:1}]:[]]
  writes.push({sql,args});return [{affectedRows:1}]
 }},module={exports:{}}
 vm.runInNewContext(fs.readFileSync(path.join(__dirname,'../../routers/branchBillingSettings.js'),'utf8'),{module,require:name=>name==='../db/connect'?{getConnection:async()=>conn}:name==='../utils/billingTaxPolicy'?{...tax,loadTaxSettings:async()=>({tax_name:'VAT',tax_percentage:0,version})}:name==='../utils/audit'?{writeAuditLog:async entry=>audits.push(entry)}:name==='../utils/clinicEvents'?{}:require(name)})
 return {...module.exports,writes,audits,events,request(role='admin'){return {branchId:1,user:{id:2,role},adminContext:{account_role:role},body:{tax_name:'VAT',tax_percentage:12,expected_version:version}}}}
}
const response=()=>({statusCode:200,status(n){this.statusCode=n;return this},json(value){this.body=value;return this}})
for(const role of ['admin','superadmin'])test(`${role} saves only tax name and percentage with branch version and audit`,async()=>{
 const h=harness(),res=response();await h.save(h.request(role),res)
 assert.equal(res.statusCode,200);assert.equal(res.body.version,1);assert.equal(h.writes.length,1)
 assert.equal(h.writes[0].args[0],1);assert.equal(h.audits[0].branchId,1)
 assert.deepEqual(JSON.parse(h.writes[0].args[1]),{tax_name:'VAT',tax_percentage:12})
 assert.equal(h.audits[0].action,'billing.tax_configuration_updated')
 assert.deepEqual(h.events,['begin','commit'])
 assert.ok(h.writes.every(row=>!row.sql.includes('UPDATE billing_records')))
})
test('configuration rejects stale versions without writing settings',async()=>{
 const h=harness({version:3}),res=response(),req=h.request();req.body.expected_version=2
 await h.save(req,res);assert.equal(res.statusCode,409);assert.equal(h.writes.length,0);assert.equal(h.audits.length,0)
})
test('a missing branch fails without writes or financial changes',async()=>{
 const h=harness({branchExists:false}),res=response();await h.save(h.request(),res)
 assert.equal(res.statusCode,404);assert.equal(h.writes.length,0);assert.ok(h.events.includes('rollback'))
})
test('obsolete configuration fields cannot enter stored tax settings',async()=>{
 const h=harness(),res=response(),req=h.request();Object.assign(req.body,{enabled:true,tax_mode:'exclusive',rules:[{kind:'inventory',id:8}],discount_categories:{1:'pwd'}})
 await h.save(req,res);assert.equal(res.statusCode,200)
 assert.deepEqual(JSON.parse(h.writes[0].args[1]),{tax_name:'VAT',tax_percentage:12})
})
test('allocation report is denied to Staff before database access',async()=>{
 const h=harness(),res=response();await h.report(h.request('staff'),res)
 assert.equal(res.statusCode,403);assert.equal(h.writes.length,0);assert.equal(h.events.length,0)
})
