const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm')
const {loadActivity}=require('../helpers/inventoryActivityHarness.cjs')
function harness({auditFails=false}={}) {
 let state={batches:[{id:1,quantity:8,archived_at:null},{id:2,quantity:4,archived_at:null}],rooms:{'1:1':8,'1:2':4,'2:1':0,'2:2':0},logs:[],audits:[]},draft=structuredClone(state)
 const activity=loadActivity(async entry=>{if(auditFails)throw Error('Audit write failed');draft.audits.push(entry)})
 const executor={
  beginTransaction:async()=>{draft=structuredClone(state)},commit:async()=>{state=draft},rollback:async()=>{draft=structuredClone(state)},
  async query(sql,args=[]){
   if(sql==='SELECT id FROM inventory WHERE id=? FOR UPDATE')return [[{id:1}]]
   if(sql.startsWith('SELECT quantity FROM inventory_batches'))return [draft.batches.filter(b=>!b.archived_at).map(b=>({quantity:b.quantity}))]
   if(sql.startsWith('UPDATE inventory_location_batches SET quantity = quantity - ?')){const key=`${args[1]}:${args[2]}`;if(draft.rooms[key]<args[0])return [{affectedRows:0}];draft.rooms[key]-=args[0];return [{affectedRows:1}]}
   if(sql.startsWith('UPDATE inventory_batches SET quantity = quantity - ?')){const b=draft.batches.find(b=>b.id===args[1]);if(b.quantity<args[0])return [{affectedRows:0}];b.quantity-=args[0];return [{affectedRows:1}]}
   if(sql.startsWith('UPDATE inventory_batches SET quantity = quantity + ?')){draft.batches.find(b=>b.id===args[1]).quantity+=args[0];return [{affectedRows:1}]}
   if(sql.startsWith('SELECT id, batch_code, archived_at FROM inventory_batches'))return [[draft.batches.find(b=>b.id===args[0])]]
   if(sql.startsWith('INSERT INTO inventory_location_batches')){const key=`${args[0]}:${args[2]}`;draft.rooms[key]=(draft.rooms[key]||0)+args[3];return [{affectedRows:1}]}
   if(sql.startsWith('INSERT INTO inventory_logs')){draft.logs.push({quantity:args[1],before:args.at(-2),after:args.at(-1)});return [{insertId:draft.logs.length}]}
   throw Error('Unexpected SQL '+sql)
  },
 }
 const scope={readPhysicalInventoryQuantity:activity.readPhysicalInventoryQuantity,db:executor,MAIN_LOCATION:'Main Stockroom',
  assertLegacyBatchMode:async()=>{},toPositiveNumber:value=>Number(value),ensureInventoryLocationAllocations:async()=>{},
  loadLocationBatches:async(id,name)=>({locationId:name==='Treatment Room'?2:1,locationName:name,rows:draft.batches.map(b=>({...b,clinic_quantity:b.quantity,location_quantity:draft.rooms[`${name==='Treatment Room'?2:1}:${b.id}`]||0}))}),
  syncInventorySnapshot:async()=>{},syncLocationSnapshot:async()=>{},getInventoryBranchId:async()=>1,
  getInventoryLocationById:async id=>({id,name:id===1?'Main Stockroom':'Treatment Room'}),resolveMainStockroom:async()=>({id:1,name:'Main Stockroom'}),getLocationId:async name=>name==='Treatment Room'?2:1,
 }
 const source=fs.readFileSync(require.resolve('../../utils/inventoryBatches'),'utf8')
 const ranges=[['const consumeInventoryFromLocationFEFO =','const consumeInventoryFromLocationByBatches ='],['const transferInventoryBatchesFEFO =','// Puts a quantity back'],['const returnQuantityToBatch =','const moveBatchBetweenLocations =']]
 const functions=ranges.map(([start,end])=>source.slice(source.indexOf(start),source.indexOf(end)))
 vm.runInNewContext(functions.join('\n')+'\n globalThis.api={consumeInventoryFromLocationFEFO,transferInventoryBatchesFEFO,returnQuantityToBatch}',scope)
 const write=async(batch,type='out',movement='clinical_use')=>activity.writeInventoryActivity(executor,`INSERT INTO inventory_logs (inventory_id,qty,type,movement_type,branch_id,batch_id) VALUES (?,?,'${type}','${movement}',?,?)`,[1,batch.quantity,1,batch.batch_id],batch)
 return {api:scope.api,executor,write,activity,get state(){return state}}
}
test('multi-batch clinical use records sequential item totals and an audit event for every movement',async()=>{
 const h=harness();await h.executor.beginTransaction()
 const result=await h.api.consumeInventoryFromLocationFEFO(1,10,'Main Stockroom',h.executor)
 assert.equal(result.ok,true)
 for(const batch of result.consumed)await h.write(batch)
 await h.executor.commit()
 assert.deepEqual(h.state.logs,[{quantity:8,before:12,after:4},{quantity:2,before:4,after:2}])
 assert.equal(h.state.audits.length,2);assert.equal(h.state.audits[0].oldValues.quantity,12);assert.equal(h.state.audits[1].newValues.quantity,2)
 assert.ok(h.state.audits.every(row=>row.branchId===1&&row.entityType==='inventory_item'))
})
test('same-batch returns increase item totals; room transfers leave the item total unchanged',async()=>{
 const h=harness();await h.executor.beginTransaction()
 const moved=await h.api.transferInventoryBatchesFEFO(1,3,'Main Stockroom','Treatment Room',h.executor)
 for(const batch of moved.transferred)await h.write(batch,'out','transfer_out')
 const returned=await h.api.returnQuantityToBatch(1,1,1,2,h.executor)
 await h.write(returned,'in','clinical_return');await h.executor.commit()
 assert.deepEqual(h.state.logs,[{quantity:3,before:12,after:12},{quantity:2,before:12,after:14}])
 assert.equal(h.state.rooms['2:1'],3)
})
test('an audit failure rolls back stock and movement records in the same transaction',async()=>{
 const h=harness({auditFails:true});await h.executor.beginTransaction()
 const result=await h.api.consumeInventoryFromLocationFEFO(1,1,'Main Stockroom',h.executor)
 await assert.rejects(h.write(result.consumed[0]),/Audit write failed/);await h.executor.rollback()
 assert.equal(h.state.batches[0].quantity,8);assert.equal(h.state.logs.length,0);assert.equal(h.state.audits.length,0)
})
test('movement logging rejects missing bounds or branch before inserting an activity',async()=>{
 const h=harness()
 await assert.rejects(h.activity.writeInventoryActivity(h.executor,"INSERT INTO inventory_logs (inventory_id,type,qty,branch_id) VALUES (?,'in',?,?)",[1,2,1]),/before\/after/)
 await assert.rejects(h.activity.writeInventoryActivity(h.executor,"INSERT INTO inventory_logs (inventory_id,type,qty) VALUES (?,'in',?)",[1,2],{quantityBefore:0,quantityAfter:2}),/Verified branch/)
 assert.equal(h.state.logs.length,0)
})
test('nullable historical balance columns are verified, added once and never rewritten',async()=>{
 const columns=new Map(),writes=[]
 const db={query:async(sql,args)=>{if(sql.startsWith('SELECT COLUMN_TYPE'))return [columns.has(args[1])?[columns.get(args[1])]:[]];writes.push(sql);columns.set(/ADD COLUMN (\w+)/.exec(sql)[1],{COLUMN_TYPE:'decimal(12,2)',IS_NULLABLE:'YES'});return [{affectedRows:1}]}}
 const {ensureInventoryActivityColumns}=loadActivity()
 await ensureInventoryActivityColumns(db,true);await ensureInventoryActivityColumns(db,true);await ensureInventoryActivityColumns(db)
 assert.equal(writes.length,2);assert.ok(writes.every(sql=>sql.startsWith('ALTER TABLE inventory_logs ADD COLUMN')))
 columns.set('quantity_before',{COLUMN_TYPE:'int',IS_NULLABLE:'YES'})
 await assert.rejects(ensureInventoryActivityColumns(db,true),/Incompatible/)
})
test('deferred clinical stock posting records exact sequential balances and the collecting actor',async()=>{
 const batches=[{id:1,quantity:8},{id:2,quantity:4}],logs=[],audits=[]
 const pending=batches.map((batch,index)=>({id:index+1,inventory_id:1,batch_id:batch.id,location_id:1,package_quantity:index?2:3,usage_quantity:index?2:3,recorded_by_doctor_id:42,consultation_usage_id:index+1,source_location:'Main Stockroom',unit_label:'unit'}))
 const activity=loadActivity(async row=>audits.push(row))
 const executor={query:async(sql,args=[])=>{
  if(sql.includes('FROM clinical_inventory_reservations r'))return [pending]
  if(sql.startsWith('SELECT id FROM inventory'))return [[{id:1}]]
  if(sql.startsWith('SELECT quantity FROM inventory_batches'))return [batches]
  if(sql.startsWith('UPDATE inventory_batches SET quantity=quantity-?')){batches.find(row=>row.id===args[1]).quantity-=args[0];return [{affectedRows:1}]}
  if(sql.startsWith('UPDATE inventory_location_batches'))return [{affectedRows:1}]
  if(sql.startsWith('INSERT INTO inventory_logs')){logs.push({quantity:args[4],before:args.at(-2),after:args.at(-1)});return [{insertId:logs.length}]}
  if(sql.startsWith('INSERT INTO consultation_inventory_usage_batches')||sql.startsWith('UPDATE clinical_inventory_reservations')||sql.startsWith('UPDATE billing_records'))return [{affectedRows:1}]
  throw Error('Unexpected posting SQL '+sql)
 }}
 const module={exports:{}},deps={'./inventoryActivity':activity,'./inventoryBatches':{syncInventorySnapshot:async()=>{},syncLocationSnapshot:async()=>{}}}
 vm.runInNewContext(fs.readFileSync(require.resolve('../../utils/clinicalInventoryReservations'),'utf8'),{module,require:name=>{assert.ok(name in deps,name);return deps[name]},process:{env:{UNIFIED_BILLING_STOCKOUT:'1'}}})
 assert.equal(await module.exports.postClinicalReservations({billId:1,branchId:1,actorRole:'staff',actorId:77,executor}),2)
 assert.deepEqual(logs,[{quantity:3,before:12,after:9},{quantity:2,before:9,after:7}])
 assert.equal(batches.reduce((sum,row)=>sum+row.quantity,0),7)
 assert.ok(audits.every(row=>row.userRole==='staff'&&row.userId===77&&row.branchId===1))
})
