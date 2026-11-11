'use strict'
const test=require('node:test')
const assert=require('node:assert/strict')
const fs=require('node:fs')
const path=require('node:path')
const vm=require('node:vm')
const base=path.resolve(__dirname,'../../..')
const read=(...p)=>fs.readFileSync(path.join(base,...p),'utf8')
const ui=read('client','src','pages','shared','Inventory.jsx')
const excel=read('client','src','components','system','InventoryExcelTools.jsx')
const router=read('server','routers','branchInventoryItems.js')
const admin=read('server','controllers','admin.controller.js')
const fail=(status,code,message)=>Object.assign(new Error(message),{statusCode:status,code})
const res=()=>({statusCode:200,status(n){this.statusCode=n;return this},json(data){this.data=data;return this}})
const context={fail,positiveId:x=>Number(x)>0,clean:(s,n)=>String(s||'').trim().slice(0,n),priceMatch:(x,y)=>Number(x).toFixed(2)===Number(y).toFixed(2),audit:async()=>{},errorResponse:(err,r)=>r.status(err.statusCode||500).json({code:err.code,message:err.message})}
const undoSource=router.slice(router.indexOf('async function undoExcelUpload'),router.indexOf('function registerBranchInventoryItems'))
const makeUndo=(upload,queries)=>{
 const calls=[]
 const conn={beginTransaction:async()=>{calls.push('begin')},commit:async()=>{calls.push('commit')},rollback:async()=>{calls.push('rollback')},release:()=>{calls.push('release')},query:async(sql,args)=>{calls.push(sql);return queries(sql,args,upload)}}
 const db={getConnection:async()=>conn}
 const scope={...context,db}
 vm.runInNewContext(undoSource+';globalThis.undo=undoExcelUpload',scope)
 return {undo:scope.undo,calls}
}
const req=(id=3)=>({params:{id},branchId:7,user:{id:11},body:{reason:'Data imported in error',confirmation:'UNDO'}})

test('Fix 7: uses saved product barcode only for PNG download',()=>{
 assert.match(ui,/downloadProductBarcode\(initialItem\)/)
 assert.match(ui,/downloadProductBarcode\(item\)/)
 assert.match(ui,/canvas\.toDataURL\('image\/png'\)/)
 assert.match(ui,/Save the changed barcode before downloading/)
 assert.doesNotMatch(ui,/Internal Batch Barcode/)
 assert.doesNotMatch(ui,/Internal Batch Suffix/)
})
test('Fix 7: batches are read-only codes with expiry-only edit',()=>{
 assert.match(ui,/Batch Code \(read-only\)/)
 assert.match(ui,/Edit Expiry/)
 assert.doesNotMatch(ui,/Show depleted \/ archived/)
 assert.match(admin,/BATCH_CODE_IMMUTABLE/)
 assert.match(admin,/UPDATE inventory_batches SET expiration_date=\?/)
})
test('Fix 7: stock action scanner and whole-unit forms',()=>{
 assert.match(ui,/Choose Stock Action/)
 assert.match(ui,/setStockMode\('out'\);setStockItem\(scannedItem\)/)
 assert.match(ui,/setStockMode\('in'\);setStockItem\(scannedItem\)/)
 assert.match(ui,/const wholeUnitInput/)
 assert.match(ui,/pattern="\[0-9\]\*"/)
 assert.match(ui,/Quantity to Stock Out \(units\)/)
})
test('Fix 7: archived list is branch scoped and restore is guarded',()=>{
 assert.match(router,/WHERE branch_id=\? AND archived_at IS NOT NULL/)
 assert.match(router,/inventory\/:id\/restore/)
 assert.match(router,/RESTORED|restored:true/i)
 assert.match(ui,/Archived Items/)
 assert.match(ui,/handleRestore\(item\)/)
})
test('Fix 7: Excel Undo keeps a durable history and checks prior use',()=>{
 assert.match(router,/inventory_excel_uploads/)
 assert.match(router,/ITEM_REFERENCED/)
 assert.match(router,/BATCH_CHANGED/)
 assert.match(router,/STOCK_USED/)
 assert.match(router,/undo_reason/)
 assert.match(excel,/Excel Import History/)
 assert.match(excel,/Undo Upload/)
 const migration=read('server','db','migrations','2026-11-12-inventory-excel-undo.sql')
 assert.match(migration,/CREATE TABLE IF NOT EXISTS inventory_excel_uploads/)
})
test('Fix 7: old or unsafe batch edits are rejected by server',()=>{
 const slice=admin.slice(admin.indexOf('const normalizeInventoryBatchActionPayload'),admin.indexOf('const requestInventoryBatchActionCode'))
 const scope={}
 vm.runInNewContext(slice+';globalThis.normalize=normalizeInventoryBatchActionPayload',scope)
 const batch={archived_at:null,expiration_date:'2027-01-01'}
 assert.equal(scope.normalize('correct_details',{expiration_date:'2028-10-11',reason:'Correction of date'},batch).expiration_date,'2028-10-11')
 assert.throws(()=>scope.normalize('correct_details',{batch_lot_code:'ABC',expiration_date:'2028-10-11',reason:'Correction of date'},batch),/Only the batch expiry date/)
 assert.throws(()=>scope.normalize('correct_details',{expiration_date:'2027-02-31',reason:'Correction of date'},batch),/valid batch expiry/)
})
test('Fix 7: new-item Excel import Undo removes only unchanged unused items',async()=>{
 const upload={id:3,upload_type:'new_items',changes_json:JSON.stringify([{id:22,name:'Test Med',barcode:'M1-00001',opening_quantity:0,batch_ids:[],selling_price:50,threshold:5}])}
 const {undo,calls}=makeUndo(upload,(sql)=>{
  if(sql.startsWith('SELECT * FROM inventory_excel_uploads'))return [[upload]]
  if(sql.startsWith('SELECT * FROM inventory WHERE'))return [[{id:22,name:'Test Med',barcode:'M1-00001',stock:0,selling_price:50,threshold:5,archived_at:null}]]
  if(sql.startsWith('SELECT id,quantity FROM inventory_batches'))return [[]]
  if(sql.startsWith('SELECT id,batch_id,qty,movement_type'))return [[]]
  if(sql.includes('AS total'))return [[{total:0}]]
  if(sql.startsWith('DELETE FROM inventory'))return [{affectedRows:1}]
  return [{affectedRows:1}]
 })
 const response=res();await undo(req(),response)
 assert.equal(response.data.undone,true)
 assert.equal(calls.includes('commit'),true)
 assert.equal(calls.includes('rollback'),false)
 assert.equal(calls.filter(x=>String(x).startsWith('DELETE FROM inventory')).length,1)
})
test('Fix 7: Excel Undo stops without deletion if records have service or clinical history',async()=>{
 const upload={id:3,upload_type:'new_items',changes_json:JSON.stringify([{id:22,name:'Test Med',barcode:'M1-00001',opening_quantity:0,batch_ids:[],selling_price:50,threshold:5}])}
 const {undo,calls}=makeUndo(upload,(sql)=>{
  if(sql.startsWith('SELECT * FROM inventory_excel_uploads'))return [[upload]]
  if(sql.startsWith('SELECT * FROM inventory WHERE'))return [[{id:22,name:'Test Med',barcode:'M1-00001',stock:0,selling_price:50,threshold:5,archived_at:null}]]
  if(sql.startsWith('SELECT id,quantity FROM inventory_batches'))return [[]]
  if(sql.startsWith('SELECT id,batch_id,qty,movement_type'))return [[]]
  if(sql.includes('AS total'))return [[{total:1}]]
  return [{}]
 })
 const response=res();await undo(req(),response)
 assert.equal(response.statusCode,409)
 assert.equal(response.data.code,'ITEM_REFERENCED')
 assert.equal(calls.includes('rollback'),true)
 assert.equal(calls.some(x=>String(x).startsWith('DELETE FROM inventory')),false)
})
test('Fix 7: item-edit Excel Undo restores old price and threshold safely',async()=>{
 const upload={id:3,upload_type:'item_edits',changes_json:JSON.stringify([{id:22,name:'Test Med',fields:['selling_price','threshold'],before:{selling_price:50,threshold:5},after:{selling_price:75,threshold:8}}])}
 const {undo,calls}=makeUndo(upload,(sql)=>{
  if(sql.startsWith('SELECT * FROM inventory_excel_uploads'))return [[upload]]
  if(sql.startsWith('SELECT id,name,archived_at,selling_price,threshold'))return [[{id:22,name:'Test Med',selling_price:75,threshold:8,archived_at:null}]]
  return [{affectedRows:1}]
 })
 const response=res();await undo(req(),response)
 assert.equal(response.data.undone,true)
 assert.equal(calls.filter(x=>String(x).includes('UPDATE inventory SET selling_price')).length,1)
 assert.equal(calls.includes('commit'),true)
})
test('Fix 7: item-edit Undo refuses later price changes',async()=>{
 const upload={id:3,upload_type:'item_edits',changes_json:JSON.stringify([{id:22,name:'Test Med',fields:['selling_price'],before:{selling_price:50},after:{selling_price:75}}])}
 const {undo,calls}=makeUndo(upload,(sql)=>{
  if(sql.startsWith('SELECT * FROM inventory_excel_uploads'))return [[upload]]
  if(sql.startsWith('SELECT id,name,archived_at,selling_price,threshold'))return [[{id:22,name:'Test Med',selling_price:80,archived_at:null}]]
  return [{}]
 })
 const response=res();await undo(req(),response)
 assert.equal(response.statusCode,409)
 assert.equal(calls.includes('rollback'),true)
 assert.equal(calls.some(x=>String(x).startsWith('UPDATE inventory SET selling_price')),false)
})
