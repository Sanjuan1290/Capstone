import test from 'node:test'
import assert from 'node:assert/strict'
import {
  INVENTORY_NEW_ITEM_HEADERS, INVENTORY_BULK_EDIT_HEADERS, INVENTORY_HEADERS,
  makeInventoryNewItemsTemplate, makeInventoryXlsx, readInventoryImportFile
} from '../src/utils/inventoryExcel.mjs'
import {preflightInventorySingleSheetCreate,preflightInventoryBulkEdit} from '../src/utils/inventoryExcelValidation.mjs'

const suppliers=[{id:17,name:'Supplier A',category:'medical,derma',is_active:1}]
const rooms=[{id:1,name:'Main Stockroom',is_active:1}]
const options={items:[],suppliers,stockRooms:rooms}
const makeRow=(details={})=>({
  'Item Name':'Acne Gel',Category:'Dermatology','Selling Price':'200.00',
  'Initial Stock':'50','Expiration Date':'2030-05-01','Low Stock Alert':'5',
  Supplier:'Supplier A','Stock Room':'Main Stockroom','Lot Number':'LOT-01',
  'Unit Cost':'35.00',_excelRow:2,...details
})

test('new-item template is one worksheet with editable batch details',async()=>{
  assert.deepEqual(INVENTORY_NEW_ITEM_HEADERS,[
    'Item Name','Category','Selling Price','Initial Stock','Expiration Date',
    'Low Stock Alert','Supplier','Stock Room','Lot Number','Unit Cost'])
  const xml=new TextDecoder().decode(await makeInventoryNewItemsTemplate().arrayBuffer())
  assert.match(xml, /<sheet name="Inventory"/)
  assert.doesNotMatch(xml,/sheet2.xml|Opening Batches|sheetProtection/)
  assert.match(xml,/Initial Stock/)
})
test('two rows for the same new item become two traceable batches and zero direct stock',()=>{
  const rows=[makeRow(),makeRow({'Initial Stock':'30','Expiration Date':'2030-06-01','Lot Number':'LOT-02',_excelRow:3})]
  const result=preflightInventorySingleSheetCreate(rows,options)
  assert.equal(result.length,1)
  assert.deepEqual(result[0].errors,[])
  assert.equal(result[0].payload.stock,0)
  assert.equal(result[0].openingQuantity,80)
  assert.equal(result[0].openingBatches,2)
  assert.deepEqual(result[0].payload.opening_batches.map(b=>b.quantity),[50,30])
  assert.deepEqual(result[0].payload.opening_batches.map(b=>b.supplier_lot_number),['LOT-01','LOT-02'])
})
test('zero opening stock needs no expiration date, lot number or unit cost',()=>{
  const row=makeRow({'Initial Stock':'0','Expiration Date':'','Lot Number':'','Unit Cost':''})
  const [r]=preflightInventorySingleSheetCreate([row],options)
  assert.deepEqual(r.errors,[])
  assert.equal(r.openingQuantity,0)
  assert.deepEqual(r.payload.opening_batches,[])
})
test('duplicate opening rows and conflicting item details stop the whole upload',()=>{
  const rows=[makeRow(),makeRow({_excelRow:3}),makeRow({'Selling Price':'90',_excelRow:4,'Lot Number':'LOT-03'})]
  const result=preflightInventorySingleSheetCreate(rows,options)
  assert.ok(result.some(r=>r.row===3&&r.errors.some(e=>e.includes('duplicated'))))
  assert.ok(result.some(r=>r.row===4&&r.errors.some(e=>e.includes('Repeated Item Name'))))
})
test('batch with missing expiry and unsafe quantity is rejected by row',()=>{
  const missing=preflightInventorySingleSheetCreate([makeRow({'Expiration Date':''})],options)
  assert.ok(missing.some(r=>r.row===2&&r.errors.some(e=>e.toLowerCase().includes('expiration date'))))
  const fraction=preflightInventorySingleSheetCreate([makeRow({'Initial Stock':'2.5'})],options)
  assert.ok(fraction.some(r=>r.errors.some(e=>e.includes('whole number'))))
})
test('new-item import refuses names already registered',()=>{
  const result=preflightInventorySingleSheetCreate([makeRow()],{...options,items:[{id:9,name:'ACNE GEL'}]})
  assert.ok(result.some(r=>r.errors.some(e=>e.includes('already exists'))))
})
test('read-only report is protected and no stock-related columns appear in editable export',async()=>{
  const content=new TextDecoder().decode(await makeInventoryXlsx([['Test',15,'',50,'2030-05-01','Dermatology','Main Stockroom',5,'Supplier A']],INVENTORY_HEADERS,{readOnly:true}).arrayBuffer())
  assert.match(content,/<sheetProtection sheet="1"/)
  for(const forbidden of ['Quantity','Initial Stock','Expiration Date','Supplier','Stock Room','Category'])
    assert.ok(!INVENTORY_BULK_EDIT_HEADERS.includes(forbidden), forbidden)
})
test('Import only accepts xlsx from the dedicated workflows',async()=>{
  await assert.rejects(readInventoryImportFile({name:'report.csv',size:0,text:async()=>''}),/\.xlsx/)
  const edit={id:3,barcode:'DER-003',name:'Acne Gel',selling_price:200,threshold:5,linked_service_count:0}
  const edited={'Item ID':'3',Barcode:'DER-003','Item Name':'Acne Gel','Current Selling Price':'200','New Selling Price':'210','Current Low Stock Alert':'5','New Low Stock Alert':'',_excelRow:2}
  const [change]=preflightInventoryBulkEdit([edited],{items:[edit]})
  assert.deepEqual(change.payload.changes,{selling_price:210})
  assert.ok(!('stock' in change.payload))
  assert.ok(!('opening_batches' in change.payload))
})
