const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const vm = require('node:vm')
const path = require('node:path')
const file = path.join(__dirname,'..','utils','clinicalInventoryReservations.js')
const load = (data)=>{
 const source=fs.readFileSync(file,'utf8')
 const mock={
  loadLocationBatches:async(id,loc)=>({locationId:loc==='Treatment Room'?5:6,locationName:loc,rows:data[loc]||[]}),
  syncInventorySnapshot:async()=>{},syncLocationSnapshot:async()=>{}
 }
 const sandbox={module:{exports:{}},require:(name)=>name==='./inventoryBatches'?mock:null,process:{env:{UNIFIED_BILLING_STOCKOUT:'1'}},Number,Math,Error,String,Set}
 vm.runInNewContext(source,sandbox,{filename:file})
 return sandbox.module.exports
}
test('pending usage checks available stock and picks the next stockroom if needed',async()=>{
 const {planClinicalInventoryReservation}=load({
  'Treatment Room':[{id:11,location_quantity:1,clinic_quantity:7}],
  'Main Stockroom':[{id:12,location_quantity:4,clinic_quantity:4}]
 })
 const reserved=await planClinicalInventoryReservation({inventoryId:1,packageQuantity:3,preferredLocation:'Treatment Room',fallbackLocation:'Main Stockroom',itemName:'Test Medicine'},{} )
 assert.equal(reserved.length,2)
 assert.equal(reserved[0].quantity,1)
 assert.equal(reserved[1].quantity,2)
})
test('pending usage refuses an item without enough stock',async()=>{
 const {planClinicalInventoryReservation}=load({'Treatment Room':[{id:11,location_quantity:1,clinic_quantity:1}]})
 await assert.rejects(planClinicalInventoryReservation({inventoryId:1,packageQuantity:3,preferredLocation:'Treatment Room',itemName:'Test Medicine'},{}),{code:'INVENTORY_INSUFFICIENT'})
})
test('deferred stock-out is disabled unless explicitly enabled',()=>{
 const source=fs.readFileSync(file,'utf8')
 const sandbox={module:{exports:{}},require:()=>({}),process:{env:{}},Number,Math,Error,String,Set}
 vm.runInNewContext(source,sandbox,{filename:file})
 assert.equal(sandbox.module.exports.isUnifiedBillingStockOut(),false)
})
