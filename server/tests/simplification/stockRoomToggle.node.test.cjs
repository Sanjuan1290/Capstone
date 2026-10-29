const test=require('node:test')
const assert=require('node:assert/strict')
const Module=require('node:module')
const target=require.resolve('../../routers/branchQueueInventoryWrites')
function harness({source,qtyBatch=0,qtyLocation=0,itemCount=0}={}){
 const calls=[];const activity={commits:0,rollbacks:0,releases:0,audits:0}
 const conn={beginTransaction:async()=>{},query:async(sql,params)=>{
   calls.push([sql,params])
   if(sql.includes('FROM inventory_locations')&&sql.includes('FOR UPDATE'))return [[source||null]]
   if(sql.includes('FROM inventory_location_batches'))return [[{qty:qtyBatch}]]
   if(sql.includes('FROM inventory_location_stock'))return [[{qty:qtyLocation}]]
   if(sql.includes('FROM inventory WHERE default_location_id'))return [[{n:itemCount}]]
   return [{affectedRows:1}]
 },commit:async()=>{activity.commits++},rollback:async()=>{activity.rollbacks++},release:()=>{activity.releases++}}
 const db={query:async()=>[[{id:5}]],getConnection:async()=>conn}
 const original=Module._load
 try{
   Module._load=function(name,parent,isMain){if(parent?.filename===target){
     if(name==='../db/connect')return db
     if(name==='../utils/audit')return {writeAuditLog:async()=>{activity.audits++}}
     if(name==='../utils/manualInventoryMovement')return {applyManualInventoryMovement:async()=>{}}
     if(name==='../utils/inventoryBatches')return {attachBatchesToInventory:async x=>x}
     if(name==='../utils/clinicEvents')return {afterSuccessfulMutation:()=> (_req,_res,next)=>next?.()}
     if(name==='../controllers/admin.controller')return {}
   }return original.apply(this,arguments)}
   delete require.cache[target]
   return {run:require(target).updateLocation,calls,activity}
 }finally{Module._load=original;delete require.cache[target]}
}
function reply(){return {code:200,data:null,status(c){this.code=c;return this},json(x){this.data=x;return this}}}
const req={branchId:2,params:{id:'5'},user:{id:1},ip:'127.0.0.1',body:{name:'Treatment Room',location_type:'room',is_active:0}}
const row={id:5,branch_id:2,name:'Treatment Room',location_type:'room',is_active:1,is_main_stockroom:0}
test('deactivation is denied if actual batch stock remains',async()=>{
 const h=harness({source:row,qtyBatch:3});const res=reply();await h.run(req,res)
 assert.equal(res.code,409);assert.equal(res.data.code,'LOCATION_IN_USE')
 assert.equal(h.activity.commits,0);assert.equal(h.activity.rollbacks,1)
})
test('deactivation denied if item has this default room, even with zero stock',async()=>{
 const h=harness({source:row,itemCount:1});const res=reply();await h.run(req,res)
 assert.equal(res.code,409);assert.equal(h.activity.commits,0)
})
test('Main Stockroom stays active',async()=>{
 const h=harness({source:{...row,is_main_stockroom:1,location_type:'stockroom'}});const res=reply();await h.run(req,res)
 assert.equal(res.code,409);assert.equal(res.data.code,'MAIN_STOCKROOM_PROTECTED')
})
test('empty room deactivation is committed and audited once',async()=>{
 const h=harness({source:row});const res=reply();await h.run(req,res)
 assert.equal(res.code,200);assert.equal(res.data.is_active,0)
 assert.equal(h.activity.commits,1);assert.equal(h.activity.audits,1)
 assert.equal(h.activity.releases,1)
 assert(h.calls.some(([sql])=>sql.includes('UPDATE inventory_locations SET')&&sql.includes('is_active=')))
})
