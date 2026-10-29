const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const root=path.resolve(__dirname,'../..');
const read=(file)=>fs.readFileSync(path.join(root,file),'utf8');
test('branch item edit persists the verified physical room instead of legacy type',()=>{
 const s=read('routers/branchInventoryItems.js');
 assert.match(s,/default_location_id=\? WHERE id=\? AND branch_id=\?/);
 assert.match(s,/p\.default_location_id,prior\.id,req\.branchId/);
 assert.doesNotMatch(s,/p\.location_type_id,prior\.id,req\.branchId/);
});
test('doctor clinical use reads each inventory item preferred room',()=>{
 const s=read('controllers/doctor.controller.js');
 assert.match(s,/inventory\.default_location_id/);
 assert.match(s,/ITEM_STOCK_ROOM_UNAVAILABLE/);
 assert.match(s,/SELECT id,name FROM inventory_locations WHERE id=\? AND branch_id=\? AND is_active=1/);
 assert.match(s,/TRANSFER_DESTINATION_REQUIRED/);
});
test('clinical readiness is based on item-assigned rooms',()=>{
 const s=read('utils/inventoryReadiness.js');
 assert.match(s,/COALESCE\(i\.default_location_id,\?\)/);
 assert.match(s,/Item-assigned Stock Room/);
});
test('global legacy admin inventory write paths reject new mutations',()=>{
 const s=read('routers/admin.router.js');
 assert.match(s,/BRANCH_INVENTORY_API_REQUIRED/);
 assert.match(s,/res\.status\(410\)/);
});
test('branch payment setting and gateway never enable QR Ph automatically',()=>{
 const s=read('routers/branchPaymentSettingsWrites.js');
 assert.match(s,/qrph_enabled/);
 assert.match(s,/RETIRED_PAYMENT_METHOD/);
 const p=read('routers/paymongoGateway.js');
 assert.match(p,/CARAIT_ENFORCE_QRPH_BRANCH_TOGGLE/);
});
test('add item loads Stock Rooms without needing to open Move Stock',()=>{
 const s=fs.readFileSync(path.join(root,'../client/src/pages/shared/Inventory.jsx'),'utf8');
 assert.match(s,/getInventoryLocations\s*\?\s*getInventoryLocations\(\)/);
 assert.match(s,/setStockLocations\(Array\.isArray\(rooms\)/);
});
test('new stockroom migration is additive and separated for TiDB',()=>{
 const s=read('migrations/MANUAL_2026-10-29-stock-rooms-qrph-followup.STAGING_ONLY.sql');
 assert.match(s,/ALTER TABLE inventory ADD COLUMN default_location_id INT NULL/);
 assert.match(s,/ALTER TABLE branch_payment_settings ADD COLUMN qrph_enabled TINYINT\(1\) NOT NULL DEFAULT 0/);
 assert.doesNotMatch(s.split('\n').filter(line=>!line.trim().startsWith('--')).join('\n'),/^\s*(?:DROP\b|TRUNCATE\b|DELETE\s+FROM\b|UPDATE\s+\w+\s+SET\b)/im);
});
