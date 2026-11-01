const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const vm = require('node:vm')
const source=fs.readFileSync(path.join(__dirname,'../../routers/branchInventoryItems.js'),'utf8')
const item={id:55,branch_id:1,barcode:'MED-0055',name:'Alcohol',category:'medical',item_type:'medicine',selling_price:'59.99',price:'59.99',threshold:5,stock:100,stock_base:100,default_location_id:1,supplier_id:17,supplier:'Supplier A',archived_at:null}
const supplier={id:17,name:'Supplier A',category:'medical,derma'}
const makeHarness=()=>{
 let state={items:[structuredClone(item)],nextId:56,logs:[]}
 let rollbacks=0,commits=0
 const query=async(current,sql,params)=>{
  if(sql.includes('FROM inventory WHERE id=? AND branch_id=? FOR UPDATE')) return [[current.items.find(i=>i.id===Number(params[0])&&i.branch_id===Number(params[1])) || null]]
  if(sql.includes('FROM inventory_suppliers WHERE id=?'))return [[params[0]==17&&params[1]==1 ? supplier : null]]
  if(sql.includes('FROM inventory_locations WHERE id=?'))return [[params[0]==1&&params[1]==1?{id:1}:null]]
  if(sql.includes('FROM billing_service_materials'))return [[{n:0}]]
  if(sql.includes('SELECT id FROM inventory WHERE branch_id=?')){
   const same=current.items.find(i=>i.branch_id===Number(params[0]) && i.name.toLowerCase()===(sql.includes('id<>?')?String(params[2]):String(params[1])).toLowerCase() && (!sql.includes('id<>?') || Number(i.id)!==Number(params[1])))
   return [[same?{id:same.id}:null]]
  }
  if(sql.startsWith('UPDATE inventory SET name=')) {
   const [name,price1,price2,threshold,supplier_id,supplierName,id,branch_id]=params
   const i=current.items.find(x=>x.id===Number(id)&&x.branch_id===Number(branch_id)); Object.assign(i,{name,selling_price:price1,price:price2,threshold,supplier_id,supplier:supplierName});return [{affectedRows:1}]
  }
  if(sql.startsWith('INSERT INTO inventory')){
   const [branch_id,barcode,name,category,item_type,,,,,threshold,price1,price2,supplierName,supplier_id,location]=params
   const id=current.nextId++
   current.items.push({id,branch_id,barcode,name,category,item_type,stock:0,stock_base:0,threshold,price:price1,selling_price:price2,supplier:supplierName,supplier_id,default_location_id:location})
   return [{insertId:id}]
  }
  throw Error('Unexpected query: '+sql.slice(0,170))
 }
 const db={getConnection:async()=>{
  let draft=structuredClone(state)
  return {beginTransaction:async()=>{},query:(sql,params)=>query(draft,sql,params),commit:async()=>{commits++;state=draft},rollback:async()=>{rollbacks++},release:()=>{}}
 }}
 const requireMock=(name)=>{
  if(name==='../db/connect')return db
  if(name==='../utils/clinicEvents')return {afterSuccessfulMutation:()=>handler=>handler}
  if(name==='../utils/audit')return {writeAuditLog:async(args)=>{state.logs.push(args);}}
  if(name==='../utils/barcodes')return {nextInventoryBarcode:async()=>`MED-${state.nextId}`}
  if(name==='../utils/inventoryBatches')return {receiveInventoryBatch:async()=>{},syncInventorySnapshot:async()=>{},attachBatchesToInventory:async x=>x}
  if(name==='../utils/inventoryLocations')return {resolveMainStockroom:async()=>({id:1})}
  throw Error('Unexpected module '+name)
 }
 const module={exports:{}}
 vm.runInNewContext(source,{module,exports:module.exports,require:requireMock,console},{filename:'branchInventoryItems.js'})
 const call=async(method,items,branch=1)=>{
   const response={statusCode:200,payload:null,status(code){this.statusCode=code;return this},json(json){this.payload=json;return this}}
   await module.exports[method]({body:{items},branchId:branch,user:{id:12},adminContext:{account_role:'admin'},ip:'127.0.0.1'},response)
   return response
 }
 return {call,get items(){return state.items},get commits(){return commits},get rollbacks(){return rollbacks}}
}
const edit=(id=55)=>({id,barcode:'MED-0055',name:'Alcohol',selling_price:65,threshold:5,supplier_id:17,expected:{name:'Alcohol',selling_price:59.99,threshold:5,supplier_id:17}})
const fresh=()=>({name:'Facial Cleanser',category:'derma',item_type:'medicine',stock:0,selling_price:200,threshold:5,supplier_id:17,default_location_id:1})
test('bulk metadata updates price but cannot change stock balance',async()=>{
 const h=makeHarness();const before=h.items[0].stock
 const r=await h.call('bulkUpdateItems',[edit()]);assert.equal(r.statusCode,200);assert.equal(r.payload.updated,1)
 assert.equal(h.items[0].selling_price,65);assert.equal(h.items[0].stock,before);assert.equal(h.commits,1)
})
test('stock or category fields in bulk request are rejected by server',async()=>{
 const h=makeHarness();const r=await h.call('bulkUpdateItems',[{...edit(),stock:500}])
 assert.equal(r.statusCode,400);assert.equal(r.payload.code,'FORBIDDEN_BULK_FIELD');assert.equal(h.items[0].stock,100);assert.equal(h.commits,0)
})
test('stale metadata rejects whole file, rather than overwriting another admin update',async()=>{
 const h=makeHarness();const r=await h.call('bulkUpdateItems',[{...edit(),expected:{...edit().expected,threshold:100}}])
 assert.equal(r.statusCode,409);assert.equal(r.payload.code,'STALE_BULK_EXPORT');assert.equal(h.items[0].selling_price,'59.99');assert.equal(h.rollbacks,1)
})
test('branch isolation blocks updating an ID belonging to another branch',async()=>{
 const h=makeHarness();const r=await h.call('bulkUpdateItems',[edit()],2)
 assert.equal(r.statusCode,409);assert.equal(h.items[0].selling_price,'59.99')
})
test('new-item import uses zero stock and a transaction',async()=>{
 const h=makeHarness();const r=await h.call('bulkCreateItems',[fresh()]);assert.equal(r.statusCode,201);assert.equal(r.payload.created,1)
 assert.equal(h.items.length,2);assert.equal(h.items[1].stock,0);assert.equal(h.items[1].category,'derma')
})
test('new-item import rejects opening quantities, duplicate names and rolls back',async()=>{
 const h=makeHarness();const r=await h.call('bulkCreateItems',[fresh(),{...fresh(),name:'Facial Cleanser 2',stock:10}]);assert.equal(r.statusCode,400);assert.equal(h.items.length,1)
 const other=await h.call('bulkCreateItems',[fresh(),{...fresh(),name:'Facial Cleanser'}]);assert.equal(other.statusCode,400);assert.equal(h.items.length,1)
})
