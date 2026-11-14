const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),path=require('node:path')
const {disabledPolicy,normalizePolicy,loadTaxPolicy}=require('../../utils/billingTaxPolicy')
const {normalizeTaxSettings,settingsFromStoredPolicy,loadTaxSettings}=require('../../utils/billingTaxPolicy')
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

test('current tax settings contain only a valid name and percentage',()=>{
 assert.deepEqual(normalizeTaxSettings({tax_name:' VAT ',tax_percentage:'12.50',enabled:true,rules:[1]}),{tax_name:'VAT',tax_percentage:12.5})
 for(const patch of [{tax_name:''},{tax_name:' '},{tax_name:{}},{tax_name:'<tax>'},{tax_percentage:''},{tax_percentage:null},{tax_percentage:101},{tax_percentage:-1},{tax_percentage:true},{tax_percentage:0.001}])assert.throws(()=>normalizeTaxSettings({tax_name:'VAT',tax_percentage:12,...patch}),{statusCode:400})
 assert.equal(normalizeTaxSettings({tax_name:'Tax',tax_percentage:0}).tax_percentage,0)
})

test('legacy disabled configurations stay at zero when reduced to two fields',()=>{
 assert.deepEqual(settingsFromStoredPolicy({...policy(),tax_rate:12,enabled:false}),{tax_name:'VAT',tax_percentage:0})
 assert.deepEqual(settingsFromStoredPolicy({...policy(),tax_rate:12,enabled:true}),{tax_name:'VAT',tax_percentage:12})
})

test('the settings API loads two values and concurrency metadata without catalog lists',async()=>{
 const queries=[]
 const settings=await loadTaxSettings(3,{query:async(sql,args)=>{queries.push({sql,args});return [[{policy_json:{tax_name:'Clinic Tax',tax_percentage:5},version:4}]]}})
 assert.deepEqual(settings,{tax_name:'Clinic Tax',tax_percentage:5,version:4});assert.equal(queries.length,1);assert.deepEqual(queries[0].args,[3])
})

test('new two-field tax policies use inclusive prices and preserve existing statutory preset identities',async()=>{
 const conn={query:async sql=>sql.startsWith('SELECT policy_json')?[[{policy_json:{tax_name:'VAT',tax_percentage:12},version:2}]]:[[{id:7,statutory_category:'pwd'}]]}
 const saved=await loadTaxPolicy(1,conn)
 assert.equal(saved.simple_tax,true);assert.equal(saved.tax_mode,'inclusive');assert.equal(saved.enabled,true);assert.equal(saved.tax_rate,12);assert.equal(saved.discount_categories[7],'pwd')
 const {calculateFinancialBill}=require('../../utils/billingCalculation')
 const bill=calculateFinancialBill({items:[{item_type:'custom',service_name:'Charge',quantity:1,unit_price:112,line_total:112}],policy:saved})
 assert.equal(bill.total_amount,112);assert.equal(bill.tax.amount,12);assert.equal(bill.tax.taxable_amount,100)
})
