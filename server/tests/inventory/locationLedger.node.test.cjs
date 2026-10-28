'use strict'
const { test } = require('node:test')
const assert = require('node:assert/strict')
const {applyLocationMovement,decimalToUnits,unitsToDecimal,manilaDateOnly}=require('../../utils/inventoryLocationStock')
const original=process.env.CARAIT_INVENTORY_LOCATION_MODE
process.env.CARAIT_INVENTORY_LOCATION_MODE='enabled'
// Deliberately synthetic transaction-bound SQL simulator. These tests validate
// arithmetic, request contracts and the SQL command shape, NOT real TiDB locks.
class FakeTransaction {
 constructor({medicine=false,expiry=null}={}){
  this.mode='location';this.item={id:17,branch_id:2,name:'Synthetic item',item_type:medicine?'medicine':'supplies',expiration_date:expiry,unit_size:'1.00',archived_at:null}
  this.loc={11:{id:11,name:'Main',location_type:'stockroom',is_active:1},12:{id:12,name:'Room',location_type:'room',is_active:1}}
  this.balances={11:'10.0000',12:'0.0000'};this.movements=[];this.stock='10.0000';this.eligibility='blocked';this.verifiedExpiry=expiry
 }
 async query(sql,values=[]){
  if(sql.includes('SELECT mode, cutover_verified_at'))return [[{mode:this.mode,cutover_verified_at:'2026-10-28 12:00:00'}]]
  if(sql.includes('FROM inventory WHERE id=? AND branch_id=? FOR UPDATE'))return [[Number(values[0])===17&&Number(values[1])===2?this.item:null]]
  if(sql.includes('FROM inventory_stock_movements WHERE idempotency_key'))return [[this.movements.find(m=>m.idempotency_key===values[0])??null]]
  if(sql.includes('FROM inventory_locations WHERE id=? AND branch_id=? FOR UPDATE'))return [[Number(values[1])===2?(this.loc[values[0]]??null):null]]
  if(sql.includes('FROM inventory_stock_eligibility'))return [[{eligibility:this.eligibility,verified_expiry:this.verifiedExpiry}]]
  if(sql.includes('SELECT quantity FROM inventory_location_stock'))return [[{quantity:this.balances[values[1]]??'0'}]]
  if(sql.includes('UPDATE inventory_location_stock SET quantity')){
   const [next,itemId,locationId,min]=values
   if(Number(itemId)!==17||decimalToUnits(this.balances[locationId]??'0',{allowZero:true})<decimalToUnits(min))return [{affectedRows:0}]
   this.balances[locationId]=next;return [{affectedRows:1}]
  }
  if(sql.includes('INSERT INTO inventory_location_stock')){const [itemId,locationId,qty]=values;assert.equal(Number(itemId),17);this.balances[locationId]=qty;return [{affectedRows:1}]}
  if(sql.includes('COALESCE(SUM(quantity),0) AS total'))return [[{total:unitsToDecimal(Object.values(this.balances).reduce((a,v)=>a+decimalToUnits(v,{allowZero:true}),0n))}]]
  if(sql.includes('UPDATE inventory SET stock=')){this.stock=values[0];return [{affectedRows:1}]}
  if(sql.includes('INSERT INTO inventory_stock_movements')){
   const [branch_id,inventory_id,movement_type,source_location_id,destination_location_id,quantity_stock,quantity_base,reason_code,reference_type,reference_id,actor_role,actor_id,idempotency_key]=values
   const row={id:this.movements.length+1,branch_id,inventory_id,movement_type,source_location_id,destination_location_id,quantity_stock,reason_code,idempotency_key,reference_type,reference_id,actor_role,actor_id}
   this.movements.push(row);return [{insertId:row.id}]
  }
  throw Error(`Unexpected SQL: ${sql.slice(0,135)}`)
 }
}
const command=(db,overrides={})=>({executor:db,branchId:2,inventoryId:17,type:'transfer',quantity:'4',sourceLocationId:11,destinationLocationId:12,reason:'Internal move',actorRole:'admin',actorId:55,idempotencyKey:'move-unique-00001',...overrides})
test('exact four-place decimal arithmetic (rejects unsupported precision)',()=>{
 assert.equal(decimalToUnits('0.0001'),1n);assert.equal(unitsToDecimal(10001n),'1.0001')
 assert.throws(()=>decimalToUnits('1.00001'),{code:'INVALID_STOCK_QUANTITY'})
 assert.throws(()=>decimalToUnits('-3'),{code:'INVALID_STOCK_QUANTITY'})
 assert.throws(()=>decimalToUnits('0'),{code:'INVALID_STOCK_QUANTITY'})
})
test('transfer keeps clinic total unchanged and creates one ledger event',async()=>{
 const db=new FakeTransaction();const out=await applyLocationMovement(command(db));assert.equal(out.stock,'10.0000')
 assert.equal(db.balances[11],'6.0000');assert.equal(db.balances[12],'4.0000');assert.equal(db.movements.length,1)
 assert.equal(db.movements[0].movement_type,'transfer')
})
test('idempotent same request replays without double-transfer',async()=>{
 const db=new FakeTransaction();await applyLocationMovement(command(db));const out=await applyLocationMovement(command(db));assert.equal(out.replayed,true)
 assert.equal(db.movements.length,1);assert.equal(db.balances[11],'6.0000')
})
test('reusing the idempotency key for different quantity rejects',async()=>{
 const db=new FakeTransaction();await applyLocationMovement(command(db));await assert.rejects(()=>applyLocationMovement(command(db,{quantity:3})),{code:'IDEMPOTENCY_KEY_CONFLICT'})
 assert.equal(db.movements.length,1)
})
test('stock out reduces only the source and the mirror',async()=>{
 const db=new FakeTransaction();await applyLocationMovement(command(db,{type:'issue',quantity:2,destinationLocationId:null,idempotencyKey:'issue-unique-000001'}))
 assert.equal(db.balances[11],'8.0000');assert.equal(db.balances[12],'0.0000');assert.equal(db.stock,'8.0000')
})
test('stock in increases only the destination',async()=>{
 const db=new FakeTransaction();await applyLocationMovement(command(db,{type:'receipt',quantity:3,sourceLocationId:null,destinationLocationId:12,idempotencyKey:'receipt-unique-001'}))
 assert.equal(db.balances[11],'10.0000');assert.equal(db.balances[12],'3.0000');assert.equal(db.stock,'13.0000')
})
test('out of stock rejects without mutation',async()=>{
 const db=new FakeTransaction();await assert.rejects(()=>applyLocationMovement(command(db,{quantity:11})),{code:'INSUFFICIENT_LOCATION_STOCK'})
 assert.equal(db.movements.length,0);assert.equal(db.balances[11],'10.0000')
})
test('invalid branch, location, archived item, and identical location rejected',async()=>{
 const db=new FakeTransaction();await assert.rejects(()=>applyLocationMovement(command(db,{branchId:3})),{code:'INVENTORY_NOT_FOUND'})
 await assert.rejects(()=>applyLocationMovement(command(db,{destinationLocationId:99})),{code:'LOCATION_NOT_ACTIVE'})
 await assert.rejects(()=>applyLocationMovement(command(db,{destinationLocationId:11})),{code:'SAME_LOCATION'})
 db.item.archived_at='2026-10-28';await assert.rejects(()=>applyLocationMovement(command(db)),{code:'INVENTORY_ARCHIVED'})
})
test('medicine with uncertain expiry is blocked',async()=>{
 const db=new FakeTransaction({medicine:true,expiry:'2026-10-25'})
 await assert.rejects(()=>applyLocationMovement(command(db)),{code:'MEDICINE_EXPIRY_UNVERIFIED'})
 db.item.expiration_date='2030-10-28'
 await assert.rejects(()=>applyLocationMovement(command(db)),{code:'MEDICINE_LOCATION_UNVERIFIED'})
 assert.equal(db.movements.length,0)
})
test('database marker stays in batch mode and blocks mutations',async()=>{
 const db=new FakeTransaction();db.mode='batch';await assert.rejects(()=>applyLocationMovement(command(db)),{code:'LOCATION_CUTOVER_NOT_VERIFIED'})
 assert.equal(db.movements.length,0)
})
test('feature gate blocks mutations even if marker is set',async()=>{
 const db=new FakeTransaction();process.env.CARAIT_INVENTORY_LOCATION_MODE='disabled'
 try{await assert.rejects(()=>applyLocationMovement(command(db)),{code:'LOCATION_MODE_DISABLED'})}
 finally{process.env.CARAIT_INVENTORY_LOCATION_MODE='enabled'}
})
test('returns/quarantine are forbidden until a linked event & safety policy exist',async()=>{
 const db=new FakeTransaction()
 for(const type of ['return','quarantine','release'])await assert.rejects(()=>applyLocationMovement(command(db,{type})),{code:'MOVEMENT_TYPE_INVALID'})
})
process.on('exit',()=>{if(original===undefined)delete process.env.CARAIT_INVENTORY_LOCATION_MODE;else process.env.CARAIT_INVENTORY_LOCATION_MODE=original})

test('MySQL DATE values represented as Date objects are normalized to Philippine date',()=>{
 assert.equal(manilaDateOnly(new Date('2030-10-28T00:00:00.000Z')),'2030-10-28')
 assert.equal(manilaDateOnly('2030-10-28'),'2030-10-28')
})
