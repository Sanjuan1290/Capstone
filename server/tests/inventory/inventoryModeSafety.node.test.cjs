'use strict'
const {test}=require('node:test')
const assert=require('node:assert/strict')
const {readInventoryMode,assertLegacyBatchMode}=require('../../utils/inventoryModeSafety')
const connection=(hasTable=true,mode='batch')=>({query:async(sql)=>{
 if(sql.includes('information_schema.TABLES'))return [[{n:hasTable?1:0}]]
 if(sql.includes('SELECT mode FROM inventory_stock_mode'))return [[{mode}]]
 throw Error(`Unexpected SQL ${sql}`)
}})
test('older database without mode marker stays in legacy batch mode',async()=>{
 assert.equal(await readInventoryMode(connection(false)),'batch')
})
test('current batch-mode database keeps legacy writer permitted',async()=>{
 assert.equal(await readInventoryMode(connection()),'batch')
 await assert.doesNotReject(()=>assertLegacyBatchMode(connection()))
})
test('location-canonical database blocks legacy writers even without a flag',async()=>{
 await assert.rejects(()=>assertLegacyBatchMode(connection(true,'location')),/LEGACY_BATCH_WRITER_BLOCKED/)
})
test('explicit location-mode deployment blocks legacy writes even with batch DB',async()=>{
 const old=process.env.CARAIT_INVENTORY_LOCATION_MODE
 process.env.CARAIT_INVENTORY_LOCATION_MODE='enabled'
 try{await assert.rejects(()=>assertLegacyBatchMode(connection(false)),/BATCH_WRITER_DISABLED/)}
 finally{if(old===undefined)delete process.env.CARAIT_INVENTORY_LOCATION_MODE;else process.env.CARAIT_INVENTORY_LOCATION_MODE=old}
})
