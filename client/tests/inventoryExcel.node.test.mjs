import test from 'node:test'
import assert from 'node:assert/strict'
import {makeInventoryXlsx, INVENTORY_HEADERS, asInventoryRow} from '../src/utils/inventoryExcel.mjs'
import {preflightInventoryExcel} from '../src/utils/inventoryExcelValidation.mjs'

const rooms=[{id:1,name:'Main Stockroom',is_active:1},{id:2,name:'Dermatology Room',is_active:1}]
const suppliers=[{id:17,name:'JAS',category:'medical,derma',is_active:1}]
const record={id:55,name:'Facial Cleanser',category:'derma',barcode:'DRM-00055',selling_price:250,threshold:5,stock:12,default_location_id:2,supplier_id:17,supplier:'JAS',item_type:'medicine',batches:[{quantity:12,expiration_date:'2027-03-01'}]}
const row=(overrides={})=>({'Item Name':'Acne Lotion','Selling Price':'300','Initial Stock':'5',Quantity:'5','Expiration Date':'2027-11-30',Category:'Dermatology','Stock Room':'Dermatology Room','Low Stock Alert':'5',Supplier:'JAS','Item ID':'',Barcode:'',_excelRow:2,...overrides})
const options={items:[record],stockRooms:rooms,suppliers}
test('XLSX writer outputs a valid ZIP header and stable columns',async()=>{
  assert.deepEqual(INVENTORY_HEADERS.slice(0,8),['Item Name','Selling Price','Initial Stock','Quantity','Expiration Date','Category','Stock Room','Low Stock Alert'])
  const bytes=new Uint8Array(await makeInventoryXlsx([['Acne Lotion',300,5,5,'2027-11-30','Dermatology','Dermatology Room',5,'JAS','','']]).arrayBuffer())
  assert.equal(bytes[0],0x50);assert.equal(bytes[1],0x4B)
  assert.ok(bytes.length>1800)
})
test('new item validates and maps JAS and room to DB ids',()=>{
  const out=preflightInventoryExcel([row()],options)[0]
  assert.deepEqual(out.errors,[]);assert.equal(out.action,'create');assert.equal(out.payload.supplier_id,17)
  assert.equal(out.payload.default_location_id,2);assert.equal(out.payload.stock,5)
})
test('default low stock threshold is five',()=>assert.equal(preflightInventoryExcel([row({'Low Stock Alert':''})],options)[0].payload.threshold,5))
test('opening stock requires expiry',()=>assert.ok(preflightInventoryExcel([row({'Expiration Date':''})],options)[0].errors.some(s=>s.includes('expiry'))))
test('duplicate names cannot be imported twice',()=>assert.ok(preflightInventoryExcel([row(),row({_excelRow:3})],options)[1].errors.some(s=>s.includes('Duplicate'))))
test('unknown stock room blocked',()=>assert.ok(preflightInventoryExcel([row({'Stock Room':'Unknown'})],options)[0].errors.some(s=>s.includes('Stock Room'))))
test('existing item matches stable ID and edits metadata only',()=>{
  const r=row({'Item ID':'55',Barcode:'DRM-00055','Item Name':'Facial Cleanser','Initial Stock':'','Expiration Date':'',Quantity:'12','Selling Price':'280'})
  const out=preflightInventoryExcel([r],options)[0]
  assert.deepEqual(out.errors,[]);assert.equal(out.action,'update');assert.equal(out.payload.stock,undefined)
  assert.equal(out.payload.expiration_date,undefined);assert.equal(out.changed,true)
})
test('existing item cannot import edited Initial Stock',()=>assert.ok(preflightInventoryExcel([row({'Item ID':'55','Initial Stock':'5'})],options)[0].errors.some(s=>s.includes('Initial Stock'))))
test('existing item cannot import batch expiry updates',()=>assert.ok(preflightInventoryExcel([row({'Item ID':'55'})],options)[0].errors.some(s=>s.includes('expiry'))))
test('existing item Quantity changes are rejected rather than silently ignored',()=>{
  const out=preflightInventoryExcel([row({'Item ID':'55',Barcode:'DRM-00055','Item Name':'Facial Cleanser','Initial Stock':'','Expiration Date':'',Quantity:'999'})],options)[0]
  assert.equal(out.payload.stock,undefined)
  assert.ok(out.errors.some(s=>s.includes('Quantity is read-only')))
})
test('bulk export excludes batch expiry and initial stock',()=>{
  const exported=asInventoryRow(record,rooms,'edit')
  assert.equal(exported[2],'');assert.equal(exported[4],'');assert.equal(exported[9],55)
})
