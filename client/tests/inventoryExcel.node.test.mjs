import test from 'node:test'
import assert from 'node:assert/strict'
import {makeInventoryXlsx, INVENTORY_HEADERS, INVENTORY_CREATE_HEADERS, INVENTORY_BULK_EDIT_HEADERS, asInventoryRow, asInventoryBulkEditRow, readInventoryFile} from '../src/utils/inventoryExcel.mjs'
import {preflightInventoryCreate,preflightInventoryBulkEdit,MAX_INVENTORY_IMPORT_BATCH} from '../src/utils/inventoryExcelValidation.mjs'
const rooms=[{id:1,name:'Main Stockroom',is_active:1}]
const suppliers=[{id:17,name:'Supplier A',category:'medical,derma',is_active:1}]
const item={id:55,name:'Alcohol',category:'medical',barcode:'MED-00055',selling_price:59.99,threshold:5,stock:115,default_location_id:1,supplier_id:17,supplier:'Supplier A',item_type:'medicine',batches:[{quantity:115,expiration_date:'2027-03-01'}]}
const opts={items:[item],stockRooms:rooms,suppliers}
const createRow=(overrides={})=>({'Item Name':'Acne Lotion',Category:'Dermatology','Selling Price':'300','Low Stock Alert':'5',Supplier:'Supplier A','Stock Room':'Main Stockroom',_excelRow:2,...overrides})
const editRow=(overrides={})=>Object.assign(Object.fromEntries(INVENTORY_BULK_EDIT_HEADERS.map((h,i)=>[h,String(asInventoryBulkEditRow(item)[i]??'')])),{_excelRow:2},overrides)
test('Bulk Edit includes exactly two optional editable fields',()=>{
 assert.deepEqual(INVENTORY_BULK_EDIT_HEADERS,['Item ID','Barcode','Item Name','Current Selling Price','New Selling Price','Current Low Stock Alert','New Low Stock Alert'])
 for(const h of ['Quantity','Initial Stock','Expiration Date','Category','Stock Room','Supplier','New Item Name'])assert.ok(!INVENTORY_BULK_EDIT_HEADERS.includes(h))
 assert.equal(MAX_INVENTORY_IMPORT_BATCH,200)
})
test('new item import creates zero stock with no hardcoded supplier',()=>{
 const r=preflightInventoryCreate([createRow()],opts)[0];assert.deepEqual(r.errors,[]);assert.equal(r.payload.stock,0)
 assert.equal(preflightInventoryCreate([createRow({Supplier:''})],opts)[0].errors.length,0)
 assert.ok(preflightInventoryCreate([createRow({Supplier:'Unknown'})],opts)[0].errors.length)
})
test('price-only change ignores unrelated alert and stock movement',()=>{
 const row=editRow({'New Selling Price':'65.00'})
 const current={...item,threshold:10,stock:25,batches:[]}
 const r=preflightInventoryBulkEdit([row],{items:[current]})[0]
 assert.deepEqual(r.errors,[])
 assert.deepEqual(r.payload.changes,{selling_price:65})
 assert.deepEqual(r.payload.expected,{selling_price:59.99})
 assert.equal(Object.hasOwn(r.payload,'stock'),false)
})
test('alert-only change ignores previously updated price and supports zero',()=>{
 const row=editRow({'New Low Stock Alert':'0'})
 const r=preflightInventoryBulkEdit([row],{items:[{...item,selling_price:65} ]})[0]
 assert.deepEqual(r.errors,[]);assert.deepEqual(r.payload.changes,{threshold:0});assert.equal(r.changed,true)
})
test('original completed price and new alert result in only alert update',()=>{
 const row=editRow({'New Selling Price':'65','New Low Stock Alert':'10'})
 const r=preflightInventoryBulkEdit([row],{items:[{...item,selling_price:65}]})[0]
 assert.deepEqual(r.errors,[]);assert.deepEqual(r.alreadyApplied,['Selling Price']);assert.deepEqual(r.payload.changes,{threshold:10})
})
test('same-field concurrent change gives a precise conflict but unrelated change does not',()=>{
 const priceRow=editRow({'New Selling Price':'65'})
 const conflict=preflightInventoryBulkEdit([priceRow],{items:[{...item,selling_price:70}]})[0]
 assert.ok(conflict.errors.some(e=>e.includes('downloaded ₱59.99, now ₱70.00, requested ₱65.00')))
 assert.equal(preflightInventoryBulkEdit([priceRow],{items:[{...item,threshold:8}]})[0].errors.length,0)
})
test('repeated upload is a no-op, blank values are also no-op',()=>{
 const row=editRow({'New Selling Price':'65'})
 const twice=preflightInventoryBulkEdit([row],{items:[{...item,selling_price:65}]})[0]
 assert.deepEqual(twice.errors,[]);assert.equal(twice.changed,false);assert.deepEqual(twice.alreadyApplied,['Selling Price'])
 assert.equal(preflightInventoryBulkEdit([editRow()],opts)[0].changed,false)
})
test('invalid price, fractional alert, renamed reference and linked service pricing blocked',()=>{
 assert.ok(preflightInventoryBulkEdit([editRow({'New Selling Price':'-5'})],opts)[0].errors.length)
 assert.ok(preflightInventoryBulkEdit([editRow({'New Low Stock Alert':'2.5'})],opts)[0].errors.length)
 assert.ok(preflightInventoryBulkEdit([editRow({'Item Name':'Changed'})],opts)[0].errors.some(x=>x.includes('reference only')))
 assert.ok(preflightInventoryBulkEdit([editRow({'New Selling Price':'75'})],{items:[{...item,linked_service_count:1}]})[0].errors.some(x=>x.includes('Services & Pricing')))
})
test('Bulk edit columns exclude stock, supplier and item name modifications',async()=>{
 for(const headers of [INVENTORY_CREATE_HEADERS,INVENTORY_BULK_EDIT_HEADERS,INVENTORY_HEADERS]){
  const bytes=new Uint8Array(await makeInventoryXlsx([],headers).arrayBuffer());assert.equal(bytes[0],0x50);assert.equal(bytes[1],0x4b)
 }
 assert.equal(asInventoryBulkEditRow(item).length,INVENTORY_BULK_EDIT_HEADERS.length)
 assert.equal(asInventoryRow(item,rooms,'view').length,INVENTORY_HEADERS.length)
 const csv={name:'items.csv',size:200,text:async()=>`${INVENTORY_BULK_EDIT_HEADERS.join(',')}\n${asInventoryBulkEditRow(item).join(',')}\n`}
 assert.equal((await readInventoryFile(csv,{mode:'edit'}))[0]['Item ID'],'55')
 await assert.rejects(()=>readInventoryFile(csv,{mode:'create'}),/Missing columns/)
 const invalid={...csv,text:async()=>`${INVENTORY_BULK_EDIT_HEADERS.join(',')},Quantity\n${asInventoryBulkEditRow(item).join(',')},999\n`}
 await assert.rejects(()=>readInventoryFile(invalid,{mode:'edit'}),/Unexpected columns/)
})
