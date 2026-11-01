import test from 'node:test'
import assert from 'node:assert/strict'
import {makeInventoryXlsx, INVENTORY_HEADERS, INVENTORY_CREATE_HEADERS, INVENTORY_BULK_EDIT_HEADERS, asInventoryRow, asInventoryBulkEditRow, readInventoryFile} from '../src/utils/inventoryExcel.mjs'
import {preflightInventoryExcel,preflightInventoryCreate,preflightInventoryBulkEdit, MAX_INVENTORY_IMPORT_BATCH} from '../src/utils/inventoryExcelValidation.mjs'
const rooms=[{id:1,name:'Main Stockroom',is_active:1}]
const suppliers=[{id:17,name:'Supplier A',category:'medical,derma',is_active:1}]
const item={id:55,name:'Alcohol',category:'medical',barcode:'MED-00055',selling_price:59.99,threshold:5,stock:115,default_location_id:1,supplier_id:17,supplier:'Supplier A',item_type:'medicine',batches:[{quantity:115,expiration_date:'2027-03-01'}]}
const opts={items:[item],stockRooms:rooms,suppliers}
const createRow=(override={})=>({'Item Name':'Acne Lotion',Category:'Dermatology','Selling Price':'300','Low Stock Alert':'5',Supplier:'Supplier A','Stock Room':'Main Stockroom',_excelRow:2,...override})
const editRow=(override={})=>Object.assign(Object.fromEntries(INVENTORY_BULK_EDIT_HEADERS.map((h,i)=>[h,String(asInventoryBulkEditRow(item)[i]??'')])),{_excelRow:2},override)
test('three separate templates with no stock-affecting bulk columns',()=>{
 assert.equal(INVENTORY_HEADERS.length,9)
 assert.deepEqual(INVENTORY_CREATE_HEADERS,['Item Name','Category','Selling Price','Low Stock Alert','Supplier','Stock Room'])
 assert.equal(INVENTORY_BULK_EDIT_HEADERS[0],'Item ID');assert.equal(INVENTORY_BULK_EDIT_HEADERS[1],'Barcode')
 for(const h of ['Quantity','Initial Stock','Expiration Date','Category','Stock Room']) assert.ok(!INVENTORY_BULK_EDIT_HEADERS.includes(h))
 assert.equal(MAX_INVENTORY_IMPORT_BATCH,200)
})
test('New item creates zero stock with no hardcoded JAS supplier',()=>{
 const result=preflightInventoryCreate([createRow()],opts)[0]
 assert.deepEqual(result.errors,[]);assert.equal(result.payload.stock,0);assert.equal(result.payload.supplier_id,17);assert.equal(result.payload.item_type,'medicine')
 assert.equal(preflightInventoryCreate([createRow({Supplier:''})],opts)[0].errors.length,0)
 assert.ok(preflightInventoryCreate([createRow({Supplier:'Unknown'})],opts)[0].errors.some(x=>x.includes('Supplier')))
})
test('Bulk price update does not refer to stock or expiry and supports stock movement after export',()=>{
 const original=editRow({'Selling Price':'65.00'});
 const movingStock={...item,stock:100,batches:[{quantity:100,expiration_date:'2028-03-01'}]}
 const result=preflightInventoryBulkEdit([original],{...opts,items:[movingStock]})[0]
 assert.deepEqual(result.errors,[]);assert.equal(result.payload.selling_price,65)
 assert.equal(Object.hasOwn(result.payload,'stock'),false)
 assert.equal(Object.hasOwn(result.payload,'expiration_date'),false)
})
test('Stale catalog details rejected while stock changes are ignored',()=>{
 const row=editRow({'Selling Price':'65'})
 assert.ok(preflightInventoryBulkEdit([row],{...opts,items:[{...item,threshold:9}]} )[0].errors.some(x=>x.includes('changed after export')))
 assert.ok(preflightInventoryBulkEdit([row],{...opts,items:[{...item,stock:0}]} )[0].errors.length===0)
})
test('Missing ID, barcode mismatch and linked-service repricing rejected',()=>{
 assert.ok(preflightInventoryBulkEdit([editRow({'Item ID':'999'})],opts)[0].errors.length)
 assert.ok(preflightInventoryBulkEdit([editRow({Barcode:'INVALID'})],opts)[0].errors.some(e=>e.includes('Barcode')))
 assert.ok(preflightInventoryBulkEdit([editRow({'Selling Price':'70'})],{...opts,items:[{...item,linked_service_count:1}]} )[0].errors.some(e=>e.includes('Services & Pricing')))
})
test('Template workbooks use correct header columns',async()=>{
 for(const headers of [INVENTORY_CREATE_HEADERS,INVENTORY_BULK_EDIT_HEADERS,INVENTORY_HEADERS]){
 const data=new Uint8Array(await makeInventoryXlsx([],headers).arrayBuffer());assert.equal(data[0],0x50);assert.equal(data[1],0x4B)
 }
 assert.equal(asInventoryBulkEditRow(item).length,INVENTORY_BULK_EDIT_HEADERS.length)
 assert.equal(asInventoryRow(item,rooms,'view').length,INVENTORY_HEADERS.length)
})
test('CSV import with wrong template or quantity column is rejected',async()=>{
 const columns=INVENTORY_BULK_EDIT_HEADERS.join(',')
 const csv={name:'items.csv',size:50,text:async()=>`${columns}\n${asInventoryBulkEditRow(item).join(',')}\n`}
 const rows=await readInventoryFile(csv,{mode:'edit'})
 assert.equal(rows.length,1);assert.equal(rows[0]['Item ID'],'55')
 await assert.rejects(()=>readInventoryFile(csv,{mode:'create'}),/Missing columns|Unexpected columns/)
 const altered={...csv,text:async()=>`${columns},Quantity\n${asInventoryBulkEditRow(item).join(',')},999\n`}
 await assert.rejects(()=>readInventoryFile(altered,{mode:'edit'}),/Unexpected columns/)
})
test('Existing legacy parser remains for prior sheets, but is not used by the new UI',()=>{
 const old={'Item Name':'Alcohol','Selling Price':'59.99','Initial Stock':'','Quantity':'115','Expiration Date':'',Category:'General Medicine','Stock Room':'Main Stockroom','Low Stock Alert':'5',Supplier:'Supplier A','Item ID':'55',Barcode:'MED-00055',_excelRow:2}
 assert.equal(preflightInventoryExcel([old],opts)[0].action,'update')
})
