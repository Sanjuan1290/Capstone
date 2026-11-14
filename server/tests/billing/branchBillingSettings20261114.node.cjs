const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),path=require('node:path')
const tax=require('../../utils/billingTaxPolicy')
function harness({version=0,owned=true,requiresApproval=false}={}){
 const writes=[],audits=[],events=[],conn={beginTransaction:async()=>events.push('begin'),commit:async()=>events.push('commit'),rollback:async()=>events.push('rollback'),release(){},query:async(sql,args)=>{
  if(sql.startsWith('SELECT id FROM clinic_branches'))return [[{id:1}]]
  if(sql.startsWith('SELECT id FROM billing_service_catalog'))return [owned?[{id:7}]:[]]
  if(sql.startsWith('SELECT id FROM inventory'))return [owned?[{id:8}]:[]]
  if(sql.startsWith('SELECT id,discount_type'))return [[{id:3,discount_type:'percentage',value:requiresApproval?10:20}]]
  writes.push({sql,args});return [{affectedRows:1}]
 }},module={exports:{}}
 vm.runInNewContext(fs.readFileSync(path.join(__dirname,'../../routers/branchBillingSettings.js'),'utf8'),{module,require:name=>name==='../db/connect'?{getConnection:async()=>conn}:name==='../utils/billingTaxPolicy'?{...tax,loadTaxPolicy:async()=>({...tax.disabledPolicy(),version})}:name==='../utils/audit'?{writeAuditLog:async entry=>audits.push(entry)}:name==='../utils/clinicEvents'?{}:require(name)})
 const policy={...tax.disabledPolicy(),enabled:true,tax_rate:12,rules:[{kind:'service_fee',id:7,treatment:'vat_exempt',statutory_eligible:true},{kind:'inventory',id:8,treatment:'taxable',statutory_eligible:false}],discount_categories:{'3':'senior'}}
 return {...module.exports,policy,writes,audits,events,request(role='admin'){return {branchId:1,user:{id:2,role},adminContext:{account_role:role},body:{policy,expected_version:version}}}}
}
const response=()=>({statusCode:200,status(n){this.statusCode=n;return this},json(value){this.body=value;return this}})
for(const role of ['admin','superadmin'])test(`${role} saves explicit classifications and audit with a branch version lock`,async()=>{
 const h=harness(),res=response();await h.save(h.request(role),res)
 assert.equal(res.statusCode,200);assert.equal(res.body.policy.version,1);assert.equal(h.writes.length,1)
 assert.equal(h.writes[0].args[0],1);assert.equal(h.audits[0].branchId,1)
 assert.equal(h.audits[0].action,'billing.tax_configuration_updated')
 assert.deepEqual(h.events,['begin','commit'])
 assert.ok(h.writes.every(row=>!row.sql.includes('UPDATE billing_records')))
})
test('configuration rejects stale versions without writing a policy',async()=>{
 const h=harness({version:3}),res=response(),req=h.request();req.body.expected_version=2
 await h.save(req,res);assert.equal(res.statusCode,409);assert.equal(h.writes.length,0);assert.equal(h.audits.length,0)
})
test('classification of another branch item fails without writes or financial changes',async()=>{
 const h=harness({owned:false}),res=response();await h.save(h.request(),res)
 assert.equal(res.statusCode,404);assert.equal(h.writes.length,0);assert.ok(h.events.includes('rollback'))
})
test('statutory presets must have the prescribed 20% value',async()=>{
 const h=harness({requiresApproval:true}),res=response();await h.save(h.request(),res)
 assert.equal(res.statusCode,400);assert.equal(h.writes.length,0)
})
test('allocation report is denied to Staff before database access',async()=>{
 const h=harness(),res=response();await h.report(h.request('staff'),res)
 assert.equal(res.statusCode,403);assert.equal(h.writes.length,0);assert.equal(h.events.length,0)
})
