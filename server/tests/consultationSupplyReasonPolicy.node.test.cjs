const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const vm = require('node:vm')
const path = require('node:path')

// Run the actual controller validation function with only its DB lookups mocked.
const source = fs.readFileSync(path.join(__dirname,'../controllers/doctor.controller.js'),'utf8')
const start = source.indexOf('const enforceFixedCatalogConsumables = async ')
const stop = source.indexOf('\nconst buildConsultationPayload =',start)
assert.ok(start >= 0 && stop > start,'Controller supply validator must exist')
const code = source.slice(start,stop)
const db = {query: async()=> {throw new Error('Unexpected default DB connection')}}
const context = { db, validateSupplyQuantity:require('../utils/supplyQuantity').validateSupplyQuantity,
  getBillingCatalogServiceById: async(id, executor, branchId)=>branchId===1&&id===77?{
    id:77,service_name:'Wound Dressing',materials:[{inventory_id:7,quantity:1,unit_label:'unit'}]
  }:null,
  makeConsultationValidationError:(msg,code)=>Object.assign(new Error(msg),{code,statusCode:400})
}
const validate = vm.runInNewContext(code+'\nenforceFixedCatalogConsumables',context)
const executor={query:async(sql,args)=>{
  if(!sql.includes('FROM inventory'))throw new Error('Unexpected SQL')
  if(args[1]!==1)return [[]]
  const names={7:'Gloves',12:'Syringe'}
  return [names[args[0]]?[{id:args[0],name:names[args[0]],category:'medical',unit:'unit',base_unit:'unit',uom:'unit',archived_at:null}]:[]]
}}
const extra=(reason='')=>[{catalog_service_id:77,quantity:1,usage_change_reason:reason,
  materials:[{inventory_id:7,quantity:1,unit_label:'unit'},{inventory_id:12,quantity:1,unit_label:'unit',consultation_extra:true}]}]
test('incomplete supply reason may be saved in a draft',async()=>{
  const result=await validate(extra(),executor,1,{requireReason:false})
  assert.equal(result[0].materials[1].consultation_extra,true)
  assert.equal(result[0].usage_change_reason,null)
})
test('finalization still rejects missing clinical supply reason',async()=>{
  await assert.rejects(validate(extra(),executor,1),{code:'SUPPLY_CHANGE_REASON_REQUIRED'})
})
test('finalization allows a valid clinical supply reason',async()=>{
  const result=await validate(extra('Additional syringe used for treatment.'),executor,1)
  assert.equal(result[0].usage_change_reason,'Additional syringe used for treatment.')
})
test('draft rejects invalid inventory even without a reason',async()=>{
  await assert.rejects(validate([{catalog_service_id:77,materials:[{inventory_id:999,quantity:1}]}],executor,1,{requireReason:false}),{code:'INVENTORY_NOT_FOUND'})
})
test('draft and finalization are branch-scoped',async()=>{
  await assert.rejects(validate(extra(),executor,2,{requireReason:false}),{code:'SERVICE_NOT_FOUND'})
})
