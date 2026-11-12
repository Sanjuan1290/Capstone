'use strict'
const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const vm = require('node:vm')
const root = path.resolve(__dirname, '../../..')
const src = relative => fs.readFileSync(path.join(root, relative), 'utf8')
const identity = require('../../utils/doctorIdentity')

const testBatchHelper = ({ batchRow, branchId = 5 } = {}) => {
  const events = []
  let batch = batchRow === undefined ? { id: 22, batch_code:'B1-002', quantity:17, expiration_date:'2028-11-10', supplier_id:4, supplier_lot_number:null, unit_cost:0 } : batchRow
  const scope = {
    db:{}, MAIN_LOCATION:'Main Stockroom',
    assertLegacyBatchMode: async()=>{},
    toPositiveNumber: x=>Number(x)>0?Number(x):0,
    getInventoryBranchId: async()=>branchId,
    getInventoryLocationById: async(id, executor, branch)=> branch===5 ? {id:Number(id),name:'Treatment Room'} : null,
    resolveLocation: async()=>({id:1,name:'Main Stockroom'}),
    normalizeBatchCode: x=>String(x||'').trim()||null,
    normalizeSupplierLotNumber: x=>String(x||'').trim()||null,
    normalizeExpiryDate: x=>String(x||'').trim().slice(0,10)||null,
    syncLocationSnapshot: async()=>{events.push('syncLocationSnapshot')},
    generateNextBatchCode: async()=> 'B1-003',
    addInventoryBatch: async()=>{events.push('addInventoryBatch'); return 42},
  }
  const source=src('server/utils/inventoryBatches.js')
  const fn=source.slice(source.indexOf('const receiveInventoryBatch = async ('),source.indexOf('const loadLocationBatches = async ('))
  vm.runInNewContext(fn+'\n;globalThis.receive=receiveInventoryBatch',scope)
  const conn = {query: async(sql,args)=>{
    events.push({sql,args})
    if (sql.includes('FROM inventory_batches') && sql.includes('AND branch_id=?')) return [[batch]]
    if (sql.startsWith('UPDATE inventory_batches')) return [{affectedRows:1}]
    if (sql.startsWith('SELECT id, batch_code, expiration_date, quantity')) return [[null]]
    return [{affectedRows:1}]
  }}
  return {receive:(payload)=>scope.receive(9,payload,conn), events}
}

test('doctor PRC and email identifiers normalize before persistence',()=>{
  assert.equal(identity.normalizePrcLicense(' prc-01234 '),'PRC-01234')
  assert.equal(identity.normalizeDoctorEmail(' Doc@Example.com '),'doc@example.com')
})
test('doctor duplicate email, phone and PRC checked across all branches', async()=>{
  for (const [field,matched] of [['email',{email:'DOC@EXAMPLE.COM',phone:'639999999999',prc_license:'PRC-888'}],['phone',{email:'other@example.com',phone:'639123456789',prc_license:'PRC-888'}],['prc_license',{email:'other@example.com',phone:'639999999999',prc_license:'prc-01234'}]]) {
    let args; const db={query:async(sql,params)=>{assert.match(sql,/FROM doctors/);assert.match(sql,/id <> \?/);args=params;return [[{id:99,...matched}]]}}
    const conflict=await identity.findDoctorIdentityConflict(db,{email:'doc@example.com',phone:'639123456789',prc_license:'PRC-01234'},10)
    assert.equal(conflict.field,field);assert.equal(args[0],10)
  }
})
test('doctor unique index concurrency conflicts become a readable 409',()=>{
  const response={statusCode:200,status(n){this.statusCode=n;return this},json(d){this.body=d;return this}}
  assert.equal(identity.handleDoctorUniqueIndexError({code:'ER_DUP_ENTRY',sqlMessage:"Duplicate entry 'PRC-01234' for key 'uniq_doctors_prc_license'"},response),true)
  assert.equal(response.statusCode,409)
  assert.equal(response.body.field,'prc_license')
})
test('stock-in to existing batch increments exact batch and selected room only',async()=>{
  const {receive,events}=testBatchHelper()
  const result=await receive({quantity:3,existing_batch_id:22,location_id:7})
  assert.equal(result.existing,true)
  assert.equal(result.batch_id,22)
  assert.equal(result.previous_quantity,17)
  assert.equal(result.new_quantity,20)
  const update=events.find(x=>x.sql?.startsWith('UPDATE inventory_batches'))
  assert.deepEqual(Array.from(update.args),[3,22,9,5])
  assert.match(update.sql,/branch_id=\?/)
  const location=events.find(x=>x.sql?.includes('INSERT INTO inventory_location_batches'))
  assert.deepEqual(Array.from(location.args),[7,9,22,3])
  assert.equal(events.includes('addInventoryBatch'),false)
  assert.equal(events.includes('syncLocationSnapshot'),true)
})
test('stock-in rejects foreign, archived or expired batch by strict selection',async()=>{
  const {receive,events}=testBatchHelper({batchRow:undefined,branchId:7})
  await assert.rejects(receive({quantity:2,existing_batch_id:22,location_id:7}),/location is unavailable|location is unavailable|Selected storage location is unavailable/i)
  assert.equal(events.some(x=>x.sql?.startsWith('UPDATE inventory_batches')),false)
  const blocked=testBatchHelper({batchRow:null})
  await assert.rejects(blocked.receive({quantity:1,existing_batch_id:22,location_id:7}),/archived, expired, or not available/)
})
test('stock-in rejects attempts to overwrite the original expiry or supplier',async()=>{
  const h=testBatchHelper()
  await assert.rejects(h.receive({quantity:2,existing_batch_id:22,location_id:7,expiration_date:'2029-03-01'}),/codes and expiry cannot be changed/)
  await assert.rejects(h.receive({quantity:2,existing_batch_id:22,location_id:7,supplier_id:55}),/different supplier/)
  assert.equal(h.events.some(x=>x.sql?.startsWith('UPDATE inventory_batches')),false)
})
test('fresh receipts still generate a distinct new batch',async()=>{
  const h=testBatchHelper()
  const result=await h.receive({quantity:4,location_id:7,expiration_date:'2028-12-01',supplier_id:4})
  assert.equal(result.existing,false)
  assert.equal(result.batch_id,42)
  assert.equal(h.events.includes('addInventoryBatch'),true)
})
test('manual stock-in requires original batch for returned unused items', async()=>{
  const source=src('server/utils/manualInventoryMovement.js')
  assert.match(source,/RETURN_REQUIRES_EXISTING_BATCH/)
  assert.match(source,/stock_in_mode/)
  assert.match(source,/receiveInventoryBatch\(inventoryId/)
  assert.match(source,/existing_batch_id: isExisting \? existingBatchId : null/)
  assert.doesNotMatch(source,/Every Stock In is a new receipt/)
})
test('inventory setup hides internal codes and per-reason checkbox',()=>{
  const ui=src('client/src/pages/adminPage/Admin_SystemSetup.jsx')
  assert.doesNotMatch(ui,/Internal code:/)
  assert.doesNotMatch(ui,/Require exact batch selection/)
  assert.doesNotMatch(ui,/>Batch Rule</)
  const inventory=src('client/src/pages/shared/Inventory.jsx')
  assert.match(inventory,/Create New Batch/)
  assert.match(inventory,/Add to Existing Batch/)
  assert.match(inventory,/Receiving Stock Room/)
  assert.match(inventory,/existing_batch_id: stockInMode/)
  assert.doesNotMatch(inventory,/Correct Quantity/)
})
test('doctor migration keeps existing doctor records and adds database uniqueness',()=>{
  const migration=src('server/migrations/manual/20261112_doctor_identity_unique_FIX11.STAGING_ONLY.sql')
  assert.match(migration,/ADD UNIQUE KEY uniq_doctors_phone/)
  assert.match(migration,/ADD UNIQUE KEY uniq_doctors_prc_license/)
  assert.doesNotMatch(migration,/DROP TABLE|DELETE FROM doctors/i)
})

test('manual returned-unused stock-in skips new expiry/supplier entry and links original batch', async()=>{
  const source=src('server/utils/manualInventoryMovement.js')
  const segment=source.slice(source.indexOf('const resolveConfiguredMovementReason = async'),source.indexOf('module.exports ='))
  const calls=[]
  const scope={
    MAIN_LOCATION:'Main Stockroom',
    normalizeStockMovementType:(_type,reason)=>reason,
    normalizeNumber:value=>Number(value),
    normalizeOptionalText:value=>String(value||'').trim(),
    resolveManualStockOutSelection:()=>{throw Error('Stock Out path not expected')},
    receiveInventoryBatch:async(_item,payload)=>{calls.push({received:payload});return {batch_id:33,batch_code:'B33-001',supplier_id:8,expiration_date:'2028-10-10',location:'Treatment Room',existing:true,previous_quantity:5,new_quantity:7}},
    syncInventorySnapshot:async()=>{calls.push('syncInventory')},
    syncLocationSnapshot:async()=>{calls.push('syncLocation')},
    writeAuditLog:async()=>{calls.push('audit')},
    getInventoryLocationById:async()=>({id:10,name:'Treatment Room'}),
    consumeInventoryFromLocationByBatches:()=>{throw Error('Stock Out path not expected')},
  }
  vm.runInNewContext(segment+';globalThis.manual=applyManualInventoryMovement',scope)
  const conn={query:async(sql,args)=>{
    calls.push({sql,args})
    if(sql.startsWith('SELECT id, name, category'))return [[{id:41,name:'Cleanser',category:'derma',item_type:'medicine',selling_price:50,archived_at:null}]]
    if(sql.includes('FROM inventory_movement_reasons'))return [[{name:'Returned Unused Item',code:'b7_returned_unused_item',movement_type:'in'}]]
    if(sql.includes('FROM inventory_locations'))return [[{id:10}]]
    return [{affectedRows:1}]
  }}
  const movement=await scope.manual({branchId:7,inventoryId:41,body:{type:'in',qty:2,stock_in_mode:'existing',existing_batch_id:33,storage_location_id:10,movement_reason:'b7_returned_unused_item'},actorRole:'admin',actorId:11,executor:conn})
  assert.equal(movement.movement.existing_batch,true)
  assert.equal(movement.movement.batch_id,33)
  const payload=calls.find(x=>x.received)?.received
  assert.equal(payload.existing_batch_id,33)
  assert.equal(payload.expiration_date,null)
  assert.equal(payload.supplier_id,null)
  const log=calls.find(x=>x.sql?.includes('INSERT INTO inventory_logs'))
  assert.equal(log.args[5],33)
  await assert.rejects(scope.manual({branchId:7,inventoryId:41,body:{type:'in',qty:2,stock_in_mode:'new',movement_reason:'b7_returned_unused_item'},actorRole:'admin',actorId:11,executor:conn}),/original existing batch/)
})
