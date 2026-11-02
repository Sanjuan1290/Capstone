import test from 'node:test'
import assert from 'node:assert/strict'
import {preflightInventoryCreate,preflightInventoryReceive} from '../src/utils/inventoryExcelValidation.mjs'
import {INVENTORY_CREATE_HEADERS,INVENTORY_OPENING_BATCH_HEADERS,INVENTORY_RECEIVE_HEADERS,makeInventoryOpeningWorkbook} from '../src/utils/inventoryExcel.mjs'
const rooms=[{id:1,name:'Main Stockroom',is_active:1}]
const suppliers=[{id:17,name:'Supplier A',category:'medical,derma',is_active:1}]
const item=(x={})=>({'Item Name':'Collagen',Category:'Dermatology','Selling Price':'55.00','Low Stock Alert':'5','Stock Room':'Main Stockroom',Supplier:'Supplier A','Initial Stock (calculated)':'',_excelRow:2,...x})
const batch=(x={})=>({'Item Name':'Collagen',Quantity:'60','Expiration Date':'2030-05-01','Supplier Lot Number':'ABC001','Unit Cost':'20.00','Stock Room':'Main Stockroom',Supplier:'Supplier A',_excelRow:2,...x})
test('new item template has two worksheets for item details and opening batches', async()=>{
 assert.ok(INVENTORY_CREATE_HEADERS.includes('Initial Stock (calculated)'))
 assert.ok(INVENTORY_OPENING_BATCH_HEADERS.includes('Quantity'))
 assert.ok(INVENTORY_RECEIVE_HEADERS.includes('Receipt Reference'))
 const bytes=new Uint8Array(await makeInventoryOpeningWorkbook().arrayBuffer())
 assert.equal(bytes[0],0x50);assert.equal(bytes[1],0x4b)
})
test('multiple batches calculate opening stock once',()=>{
 const result=preflightInventoryCreate([item()],{openingBatches:[batch(),batch({Quantity:'40','Supplier Lot Number':'ABC002',_excelRow:3})],stockRooms:rooms,suppliers})
 assert.equal(result.length,1);assert.deepEqual(result[0].errors,[])
 assert.equal(result[0].openingQuantity,100);assert.equal(result[0].payload.stock,0)
 assert.equal(result[0].payload.opening_batches.length,2)
})
test('zero opening quantity allowed with no batches',()=>{
 const [r]=preflightInventoryCreate([item()],{openingBatches:[],stockRooms:rooms,suppliers})
 assert.equal(r.openingQuantity,0);assert.equal(r.errors.length,0)
})
test('rejects manual opening balance to prevent double-count',()=>{
 const [r]=preflightInventoryCreate([item({'Initial Stock (calculated)':'120'})],{openingBatches:[batch()],stockRooms:rooms,suppliers})
 assert.ok(r.errors.some(x=>x.includes('automatically calculated')))
})
test('reports exact opening batch worksheet row for missing expiry',()=>{
 const result=preflightInventoryCreate([item()],{openingBatches:[batch({'Expiration Date':'',_excelRow:7})],stockRooms:rooms,suppliers})
 assert.equal(result[1].sheet,'Opening Batches');assert.equal(result[1].row,7)
 assert.ok(result[1].errors.some(x=>x.includes('expiration date')))
})
test('valid bulk stock receipt includes quantity and idempotency reference',()=>{
 const current={id:10,barcode:'DER-101',name:'Collagen',category:'derma'}
 const row={'Receipt Reference':'DELIVERY_12345','Item ID':'10',Barcode:'DER-101','Item Name':'Collagen',Quantity:'22','Expiration Date':'2030-05-01','Supplier Lot Number':'LOT-1','Unit Cost':'20.00','Stock Room':'Main Stockroom',Supplier:'Supplier A',_excelRow:2}
 const [r]=preflightInventoryReceive([row],{items:[current],stockRooms:rooms,suppliers})
 assert.deepEqual(r.errors,[]);assert.equal(r.payload.receipt_reference,'DELIVERY_12345');assert.equal(r.payload.quantity,22)
 assert.ok(preflightInventoryReceive([row,{...row,_excelRow:3}],{items:[current],stockRooms:rooms,suppliers})[1].errors.some(x=>x.includes('Duplicate')))
})
