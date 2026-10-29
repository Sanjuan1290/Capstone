import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { resolve, dirname } from 'node:path'
import { INVENTORY_HEADERS, INVENTORY_BULK_EDIT_HEADERS, makeInventoryXlsx, asInventoryRow } from '../src/utils/inventoryExcel.mjs'
import { preflightInventoryExcel } from '../src/utils/inventoryExcelValidation.mjs'
const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const ui = readFileSync(resolve(root,'src/components/system/InventoryExcelTools.jsx'),'utf8')
const rooms=[{id:2,name:'Dermatology Room',is_active:1}]
const suppliers=[{id:1,name:'JAS',category:'derma',is_active:1}]
const row={'Item Name':'Test Gel','Selling Price':'0','Initial Stock':'12','Quantity':'9','Expiration Date':'2028-12-01','Category':'Dermatology','Stock Room':'Dermatology Room','Low Stock Alert':'5','Supplier':'JAS','Item ID':'','Barcode':'',_excelRow:2}
test('Template and bulk-edit exports intentionally have different widths',()=>{assert.equal(INVENTORY_HEADERS.length,9);assert.equal(INVENTORY_BULK_EDIT_HEADERS.length,11);assert.equal(INVENTORY_BULK_EDIT_HEADERS[9],'Item ID')})
test('October MADE vs REMAINING difference is allowed, Quantity becomes opening balance',()=>{const r=preflightInventoryExcel([{...row,'Selling Price':'150'}],{stockRooms:rooms,suppliers})[0];assert.deepEqual(r.errors,[]);assert.equal(r.payload.stock,9)})
test('Zero selling prices fail preflight instead of creating unsafe billable items',()=>{const r=preflightInventoryExcel([row],{stockRooms:rooms,suppliers})[0];assert.ok(r.errors.some(e=>e.includes('Selling Price')))})
test('Unknown supplier blocks import before any mutation',()=>{const r=preflightInventoryExcel([{...row,'Selling Price':'150'}],{stockRooms:rooms,suppliers:[]})[0];assert.ok(r.errors.some(e=>e.includes('Supplier JAS')))})
test('Export Snapshot carries no record IDs while bulk edit retains IDs',()=>{const item={id:34,name:'Test Gel',category:'derma',stock:9,selling_price:150,supplier:'JAS',default_location_id:2};assert.equal(asInventoryRow(item,rooms).length,9);assert.equal(asInventoryRow(item,rooms,'edit')[9],34)})
test('Generated XLSX template has a valid ZIP magic header',async()=>{const raw=new Uint8Array(await makeInventoryXlsx([]).arrayBuffer());assert.equal(raw[0],0x50);assert.equal(raw[1],0x4B)})
test('Persistent dialog shows parse errors, row errors and save failures',()=>{assert.match(ui,/Inventory Excel error/);assert.match(ui,/Download all errors \(CSV\)/);assert.match(ui,/Import stopped after/);assert.match(ui,/setResults\(summary\)/);assert.match(ui,/preview\.rows\.length\} rows were validated/);assert.match(ui,/do not close this window/i)})
test('Failed row-by-row import cannot be blindly resubmitted',()=>{assert.match(ui,/results\?\.failed\?\.length/);assert.match(ui,/Do not click Import again with the same file/)})
