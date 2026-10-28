const {test}=require('node:test')
const assert=require('node:assert/strict')
const Module=require('node:module')
const targetInventory=require.resolve('../../routers/branchInventoryItems')
const targetCatalog=require.resolve('../../routers/branchCatalogWrites')
const targetAppointment=require.resolve('../../routers/branchAppointmentWrites')
function loadTarget(target,dbOverrides={}){
  const original=Module._load
  const db={query:async()=>{throw Error('Unexpected unscoped query')},getConnection:()=>{throw Error('Unexpected connection')},...dbOverrides}
  const common={
    '../db/connect':db,'../utils/audit':{writeAuditLog:async()=>{}},
    '../utils/inventoryBatches':{receiveInventoryBatch:async()=>{throw Error('Stock must not be received')},syncInventorySnapshot:async()=>{},attachBatchesToInventory:async rows=>rows},
    '../utils/barcodes':{nextInventoryBarcode:async()=>{throw Error('Unexpected barcode generation')}},
    '../utils/inventoryLocations':{resolveMainStockroom:async()=>({id:1})},
    '../utils/billing':{getBillingCatalogServiceById:async()=>null,normalizeServiceMaterials:rows=>rows},
    '../utils/bookingPolicy':{validateAverageDurationMinutes:x=>Number(x)||60,loadBookingSettings:async()=>({booking_start_interval_minutes:30}),roundReservedDurationMinutes:v=>v},
    '../utils/appointmentSecurity':{withAppointmentSlotLock:async(_,f)=>f(),validateAppointmentSlot:async()=>{}},
    '../utils/date':{getTodayDateOnly:()=> '2026-10-15'},
    '../utils/appointmentPolicies':{getLastNoShowAppointment:async()=>null,makeNoShowWarningResponse:()=>({})},
    '../utils/notifications':{notifyRoles:async()=>{}},'../utils/sse':{broadcast:()=>{}},
  }
  try{
    Module._load=function(name,parent,isMain){if(parent?.filename===target && Object.hasOwn(common,name))return common[name];return original.apply(this,arguments)}
    delete require.cache[target];return require(target)
  }finally{Module._load=original;delete require.cache[target]}
}
const response=()=>({code:200,body:null,status(n){this.code=n;return this},json(v){this.body=v;return this}})
const conn=(query)=>{
 let committed=false,rolledBack=false
 return {query,beginTransaction:async()=>{},commit:async()=>{committed=true},rollback:async()=>{rolledBack=true},release:()=>{},get committed(){return committed},get rolledBack(){return rolledBack}}
}
const body={name:'Gloves',category:'medical',item_type:'supplies',threshold:10,selling_price:50,location_type_id:10,stock:0,supplier_id:17,barcode:'A-1'}
test('foreign inventory id is rejected before any update and rolls back',async()=>{
 const queries=[]
 const c=conn(async(sql,params)=>{queries.push([sql,params]);return [[]]})
 const h=loadTarget(targetInventory,{getConnection:async()=>c}).updateItem
 const res=response();await h({params:{id:'99'},branchId:2,user:{id:1},body:{...body,stock:undefined}},res)
 // A client must never supply any stock-related edit fields.
 assert.equal(res.code,400);assert.equal(c.rolledBack,false)
 const r2=response();const valid={...body};delete valid.stock
 await h({params:{id:'99'},branchId:2,user:{id:1},body:valid},r2)
 assert.equal(r2.code,404);assert.equal(c.rolledBack,true);assert.equal(c.committed,false)
 assert.match(queries[0][0],/id=\? AND branch_id=\? FOR UPDATE/)
 assert.deepEqual(queries[0][1],['99',2])
})
test('inventory edit never permits a stock overwrite even with same quantity',async()=>{
 const h=loadTarget(targetInventory).updateItem
 const res=response();await h({params:{id:'77'},branchId:1,user:{id:1},body:{...body,stock:0}},res)
 assert.equal(res.code,400);assert.equal(res.body.code,'STOCK_EDIT_DENIED')
})
test('inventory item creation must verify supplier and location within branch',async()=>{
 const statements=[]
 const c=conn(async(sql,args)=>{statements.push([sql,args]);return [[]]})
 const h=loadTarget(targetInventory,{getConnection:async()=>c}).createItem
 const res=response();await h({branchId:2,user:{id:1},body:{...body,item_type:'medicine'}},res)
 assert.equal(res.code,400)
 assert.equal(res.body.code,'INVALID_LOCATION_TYPE')
 assert.equal(c.rolledBack,true)
 assert.match(statements[0][0],/branch_id=\?/)
 assert.deepEqual(statements[0][1],[10,2])
})
test('foreign service ID cannot be updated',async()=>{
 const queries=[]
 const c=conn(async(sql,params)=>{queries.push([sql,params]);return [[]]})
 const h=loadTarget(targetCatalog,{getConnection:async()=>c}).saveService
 const res=response();await h({params:{serviceId:'53'},branchId:3,user:{id:1},body:{service_name:'Consultation',clinic_type:'medical',category_id:1,consultation_fee:100,materials:[]}},res)
 assert.equal(res.code,404);assert.equal(c.rolledBack,true)
 assert.match(queries[0][0],/branch_id=\? FOR UPDATE/);assert.deepEqual(queries[0][1],[53,3])
})
test('foreign discount ID cannot be changed',async()=>{
 const c=conn(async(sql,params)=>{assert.match(sql,/branch_id=\?/);assert.deepEqual(params,[14,3]);return [[]]})
 const h=loadTarget(targetCatalog,{getConnection:async()=>c}).saveDiscount
 const res=response();await h({params:{id:'14'},branchId:3,user:{id:1},body:{label:'Promo',discount_type:'fixed',value:10}},res)
 assert.equal(res.code,404);assert.equal(c.rolledBack,true)
})
test('appointment validates the doctor and service inside the requested branch transaction',async()=>{
 const calls=[]
 const c=conn(async(sql,args)=>{
   calls.push([sql,args]);
   if(sql.includes('FROM patients'))return [[{id:9,full_name:'Patient'}]]
   return [[]]
 })
 const h=loadTarget(targetAppointment,{getConnection:async()=>c}).createAppointment
 const res=response();await h({branchId:2,user:{id:1},body:{patient_id:9,doctor_id:27,clinic_type:'medical',requested_service_id:4,appointment_date:'2026-10-20',appointment_time:'10:00 AM'}},res)
 assert.equal(res.code,404);assert.equal(c.rolledBack,true)
 assert.ok(calls.some(([sql,args])=>sql.includes('FROM doctors')&&sql.includes('branch_id=?')&&args[1]===2))
 assert.ok(calls.some(([sql,args])=>sql.includes('FROM billing_service_catalog')&&sql.includes('branch_id=?')&&args[1]===2))
})
