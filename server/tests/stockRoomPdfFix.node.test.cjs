'use strict'
const { test } = require('node:test')
const assert = require('node:assert/strict')
const { readFileSync } = require('node:fs')
const path=require('node:path')
const root=path.resolve(__dirname,'..')
const file=(name)=>readFileSync(path.join(root,name),'utf8')
const {getBranchStockRooms,BRANCH_STOCK_ROOMS_SQL}=require('../utils/branchStockRoomSummary')

test('room API returns numeric active item/batch/stock counts for the requested branch',async()=>{
 let called=0
 const db={query:async(sql,params)=>{
    called++
    assert.equal(sql,BRANCH_STOCK_ROOMS_SQL)
    assert.deepEqual(params,[7,7])
    return [[{id:3,branch_id:7,name:'Dermatology Room',item_count:'8',batch_count:'8',total_quantity:'400.00',default_item_count:'8',usage_count:'21'}]]
 }}
 const rooms=await getBranchStockRooms(db,7)
 assert.equal(called,1)
 assert.deepEqual(rooms.map(x=>[x.item_count,x.batch_count,x.total_quantity,x.default_item_count,x.usage_count]),[[8,8,400,8,21]])
})
test('room API rejects missing and invalid branch IDs without querying database',async()=>{
 const db={query:async()=>assert.fail('DB must not be queried')}
 for(const branch of [null,0,-1,'wrong',NaN]) await assert.rejects(()=>getBranchStockRooms(db,branch),/branch is required/)
})
test('room summary reads only positive allocated, nonarchived batches and is branch scoped',()=>{
 assert.match(BRANCH_STOCK_ROOMS_SQL,/FROM inventory_location_batches ilb/)
 assert.match(BRANCH_STOCK_ROOMS_SQL,/JOIN inventory i ON i.id=ilb.inventory_id AND i.branch_id=\?/)
 assert.match(BRANCH_STOCK_ROOMS_SQL,/JOIN inventory_batches ib ON ib.id=ilb.batch_id/)
 assert.match(BRANCH_STOCK_ROOMS_SQL,/ib.archived_at IS NULL/)
 assert.match(BRANCH_STOCK_ROOMS_SQL,/ilb.quantity > 0/)
 assert.match(BRANCH_STOCK_ROOMS_SQL,/COUNT\(DISTINCT ilb.inventory_id\)/)
 assert.match(BRANCH_STOCK_ROOMS_SQL,/SUM\(ilb.quantity\)/)
 assert.match(BRANCH_STOCK_ROOMS_SQL,/WHERE l.branch_id=\?/)
 assert.doesNotMatch(BRANCH_STOCK_ROOMS_SQL,/\b(?:UPDATE|DELETE FROM|INSERT INTO|TRUNCATE|CREATE TABLE)\b/i)
})
test('branch and Staff System Setup use the same physical stock allocation summary',()=>{
 const branch=file('routers/branchOperationalReads.js')
 const staff=file('routers/staff.router.js')
 assert.match(branch,/getBranchStockRooms\(db,req.branchId\)/)
 assert.match(staff,/getBranchStockRooms\(db, req.branchId\)/)
 assert.match(branch,/allowAnyPermission\('inventory','system_setup'\)/)
 assert.match(staff,/can\('system_setup'\)/)
})
test('branch admin movement reasons support branch-owned writes and shared reads, with permissions',()=>{
 const route=file('routers/branchSystemWrites.js')
 const read=file('routers/branchOperationalReads.js')
 for (const method of ['post','put','delete']) assert.ok(route.includes(`router.${method}(\`\${prefix}/system-setup/movement-reasons`),`${method} route is registered`)
 assert.match(route,/requirePermission\('system_setup'\)/)
 assert.match(route,/WHERE id=\? AND branch_id=\? FOR UPDATE/)
 assert.match(route,/Only reasons created for this branch can be edited/)
 assert.match(read,/r.branch_id IS NULL OR r.branch_id=\?/)
})
test('Excel opening stock writes exact selected location_id, does not count default location as stock',()=>{
 const importer=file('routers/branchInventoryItems.js')
 const batch=file('utils/inventoryBatches.js')
 assert.match(importer,/getValidReceivingRefs\(conn,req.branchId,p.category,batch\)/)
 assert.match(importer,/location_id:room.id/)
 assert.match(batch,/INSERT INTO inventory_location_batches \(location_id, inventory_id, batch_id, quantity\)/)
 assert.match(batch,/syncLocationSnapshot\(inventoryId, executor\)/)
})
test('UI no longer shows a Room Type control but preserves the internal stored type',()=>{
 const ui=readFileSync(path.join(root,'../client/src/components/system/StockRoomsManager.jsx'),'utf8')
 assert.doesNotMatch(ui,/Type \*/)
 assert.doesNotMatch(ui,/TYPE_OPTIONS/)
 assert.doesNotMatch(ui,/>Type<\/th>/)
 assert.match(ui,/location_type: editing\?\.id \? editing.location_type : 'room'/)
 assert.match(ui,/row.item_count/)
 assert.match(ui,/row.total_quantity/)
})
test('room writes keep internal type unchanged on edit and default new rooms internally',()=>{
 const route=file('routers/branchQueueInventoryWrites.js')
 assert.match(route,/const location_type='room' \/\/ Internal classification/)
 assert.match(route,/const location_type=prior.location_type \/\/ Keep stored type/)
 assert.match(route,/LOCATION_IN_USE/)
 assert.match(route,/MAIN_STOCKROOM_PROTECTED/)
})
test('Branch Admin sees an Add Branch Reason action, and shared reasons remain read-only',()=>{
 const ui=readFileSync(path.join(root,'../client/src/pages/adminPage/Admin_SystemSetup.jsx'),'utf8')
 assert.match(ui,/Add Branch Reason/)
 assert.match(ui,/Shared · read only/)
 assert.match(ui,/row.branch_id != null/)
 assert.match(ui,/You can add Stock In or Stock Out reasons for this clinic/)
})
