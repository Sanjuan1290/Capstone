'use strict'
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm')
const {test}=require('node:test'),assert=require('node:assert/strict')
const root=path.resolve(__dirname,'..')
const billingSource=fs.readFileSync(path.join(root,'utils/billing.js'),'utf8')
function harness(){
  const defaults=[
    {id:1,billing_service_id:17,inventory_id:7,material_name:'Wash',quantity:1,unit_label:'unit',sort_order:1},
    {id:2,billing_service_id:17,inventory_id:8,material_name:'Cream',quantity:1,unit_label:'unit',sort_order:2},
  ]
  const rawService={id:17,branch_id:1,service_name:'Facial',clinic_type:'derma',default_price:455,consultation_fee:350,is_active:1}
  const executor={query:async sql=>{
    if(sql.includes('FROM billing_service_catalog bsc'))return [[rawService]]
    if(sql.includes('FROM billing_service_materials m'))return [defaults]
    if(sql.includes('FROM inventory\n'))return [[
      {id:7,name:'Wash',unit:'unit',selling_price:40},
      {id:8,name:'Cream',unit:'unit',selling_price:65},
      {id:9,name:'Other',unit:'unit',selling_price:80},
    ]]
    throw Error('Unexpected query: '+sql.slice(0,120))
  }}
  const imports={
    './billingCalculation':require('../utils/billingCalculation'),
    '../db/connect':executor,
    './supplyQuantity':require(path.join(root,'utils/supplyQuantity')),
    './consultationMaterialPricing':require(path.join(root,'utils/consultationMaterialPricing')),
    './inputValidation':{
      normalizeText:(value)=>String(value||''),
      normalizeOptionalText:(value)=>value==null?null:String(value),
      normalizeNumber:(value)=>Number(value),
      makeValidationError:(message)=>new Error(message)
    }
  }
  const module={exports:{}}
  vm.runInNewContext(billingSource,{module,exports:module.exports,require:n=>{if(!(n in imports))throw Error('Unknown import '+n);return imports[n]}},{filename:'billing.js'})
  return {billing:module.exports,executor}
}
test('real billing normalization reduces a service after cream removed',async()=>{
  const {billing,executor}=harness()
  const rows=await billing.normalizeBillingItems([{item_type:'service',catalog_service_id:17,source_type:'consultation',quantity:1,materials:[{inventory_id:7,quantity:1,material_name:'Wash'}]}],executor,1)
  assert.equal(rows[0].unit_price,390)
  assert.equal(rows[0].line_total,390)
  assert.equal(JSON.parse(rows[0].details_json).pricing.material_adjustment_amount,-65)
})
test('real billing normalization preserves price if all default items actually used',async()=>{
  const {billing,executor}=harness()
  const rows=await billing.normalizeBillingItems([{item_type:'service',catalog_service_id:17,source_type:'consultation',quantity:1,materials:[{inventory_id:7,quantity:1,material_name:'Wash'},{inventory_id:8,quantity:1,material_name:'Cream'}]}],executor,1)
  assert.equal(rows[0].unit_price,455)
})
