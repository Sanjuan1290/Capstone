const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),path=require('node:path')
const {disabledPolicy,normalizePolicy,loadTaxPolicy}=require('../../utils/billingTaxPolicy')
const policy=()=>({...disabledPolicy(),rules:[{kind:'service_fee',id:1,treatment:'vat_exempt',statutory_eligible:true}]})
test('tax starts disabled without a rate assumption',async()=>{
 assert.equal(disabledPolicy().enabled,false);assert.equal(disabledPolicy().tax_rate,0)
 const loaded=await loadTaxPolicy(1,{query:async()=>[[]]});assert.equal(loaded.enabled,false)
})
test('configured inclusive/exclusive and explicit exempt classifications validate',()=>{
 for(const tax_mode of ['inclusive','exclusive'])assert.equal(normalizePolicy({...policy(),enabled:true,tax_rate:12,tax_mode}).tax_mode,tax_mode)
 assert.equal(normalizePolicy(policy()).rules[0].treatment,'vat_exempt')
})
test('rejects invalid rates, malformed rules and duplicate classifications',()=>{
 for(const patch of [{tax_rate:101},{tax_rate:-1},{tax_mode:'automatic'},{tax_name:{}},{enabled:true,rules:[]},{rules:[null]},{rules:[true]},{rules:[...policy().rules,{...policy().rules[0],id:'01'}]},{rules:[...policy().rules,...policy().rules]},{rules:[{kind:'service_fee',id:1,treatment:'medical',statutory_eligible:true}]},{discount_categories:{'1':'stack_all'}}])assert.throws(()=>normalizePolicy({...policy(),...patch}),{statusCode:400})
})
test('loading a stored policy preserves its saved version and classifications',async()=>{
 const loaded=await loadTaxPolicy(1,{query:async()=>[[{policy_json:JSON.stringify(policy()),version:7}]]})
 assert.equal(loaded.version,7);assert.equal(loaded.rules[0].statutory_eligible,true)
})
test('Staff cannot read or mutate restricted tax settings',async()=>{
 const module={exports:{}},writes=[]
 vm.runInNewContext(fs.readFileSync(path.join(__dirname,'../../routers/branchBillingSettings.js'),'utf8'),{module,require:name=>name==='../db/connect'?{query:async()=>{writes.push(1);throw Error('unexpected DB')}}:name==='../utils/billingTaxPolicy'?{normalizePolicy,loadTaxPolicy}:name==='../utils/audit'?{writeAuditLog(){}}:name==='../utils/clinicEvents'?{afterSuccessfulMutation(){}}:require(name)})
 for(const handler of ['read','save']){let code;await module.exports[handler]({user:{id:3,role:'staff'},adminContext:{account_role:'staff'}},{status(n){code=n;return this},json(){}});assert.equal(code,403)}
 assert.equal(writes.length,0)
})
