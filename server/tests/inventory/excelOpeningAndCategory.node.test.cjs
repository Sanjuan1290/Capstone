const test=require('node:test')
const assert=require('node:assert/strict')
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm')
const root=path.join(__dirname,'../..')
const source=fs.readFileSync(path.join(root,'routers/branchInventoryItems.js'),'utf8')
const categories=fs.readFileSync(path.join(root,'routers/branchSystemWrites.js'),'utf8')
const itemRow=(overrides={})=>({name:'Collagen',category:'derma',item_type:'medicine',stock:0,selling_price:55,threshold:5,supplier_id:17,default_location_id:1,opening_batches:[{quantity:60,expiration_date:'2028-10-15',supplier_lot_number:'LOT-A',unit_cost:30,location_id:1,supplier_id:17},{quantity:40,expiration_date:'2028-03-20',supplier_lot_number:'LOT-B',unit_cost:31,location_id:1,supplier_id:17}],...overrides})
function harness({breakSecondBatch=false,linked=0}={}){
 let state={items:[],batches:[],stockLogs:[],receipts:[],audit:[],category:{id:8,branch_id:1,name:'Dermatology Consultation',is_active:0,clinic_type:'derma'},nextId:100},commits=0,rollbacks=0
 const query=async(draft,sql,p)=>{
  if(sql.includes('FROM inventory WHERE branch_id=? AND LOWER(TRIM(name))'))return [[draft.items.find(x=>x.branch_id===p[0]&&x.name===p[1])||null]]
  if(sql.includes('FROM inventory_locations WHERE id=?'))return [[p[0]===1&&p[1]===1?{id:1,name:'Main Stockroom'}:null]]
  if(sql.includes('FROM inventory_suppliers WHERE id=?'))return [[p[0]===17&&p[1]===1?{id:17,name:'Supplier A',category:'medical,derma'}:null]]
  if(sql.startsWith('INSERT INTO inventory\n') ||sql.startsWith('INSERT INTO inventory\r')){let id=draft.nextId++;draft.items.push({id,branch_id:p[0],barcode:p[1],name:p[2],category:p[3],stock:0,item_type:p[4],supplier_id:p.at(-2),default_location_id:p.at(-1)});return [{insertId:id}]}
  if(sql.startsWith('INSERT INTO inventory_logs')){draft.stockLogs.push({quantity:p[2],batch_id:p[3]});return [{insertId:1000+draft.stockLogs.length}]}
  if(sql.startsWith('SELECT id,name,barcode,category,archived_at FROM inventory WHERE id=?'))return [[draft.items.find(x=>x.id===p[0]&&x.branch_id===p[1])||null]]
  if(sql.includes('FROM inventory_excel_receipts WHERE'))return [[draft.receipts.find(x=>x.branch_id===p[0]&&x.reference===p[1])||null]]
  if(sql.startsWith('INSERT INTO inventory_excel_receipts')){if(draft.receipts.some(x=>x.branch_id===p[0]&&x.reference===p[1])){let e=new Error('duplicate');e.code='ER_DUP_ENTRY';throw e}draft.receipts.push({branch_id:p[0],reference:p[1],item_id:p[2],batch_id:null});return [{insertId:draft.receipts.length}]}
  if(sql.startsWith('UPDATE inventory_excel_receipts')){draft.receipts.find(x=>x.branch_id===p[1]&&x.reference===p[2]).batch_id=p[0];return [{affectedRows:1}]}
  if(sql.startsWith('SELECT id,name,clinic_type,is_active,branch_id FROM billing_service_categories'))return [[p[0]===8&&p[1]===1?draft.category:null]]
  if(sql.includes('FROM billing_service_catalog WHERE category_id=?'))return [[{total:linked}]]
  if(sql.startsWith('DELETE FROM billing_service_categories')){draft.category=null;return [{affectedRows:1}]}
  throw Error('Unexpected SQL: '+sql.slice(0,140))
 }
 const db={getConnection:async()=>{const d=structuredClone(state);return {beginTransaction:async()=>{},query:(s,p)=>query(d,s,p),commit:async()=>{commits++;state=d},rollback:async()=>{rollbacks++},release:()=>{}}}}
 const mock=(name)=>{
  if(name==='../utils/systemSetupRemoval')return {removeBranchReference:async()=>{}}
  if(name==='../db/connect')return db
  if(name==='../utils/clinicEvents')return {afterSuccessfulMutation:()=>fn=>fn}
  if(name==='../utils/audit')return {writeAuditLog:async(args,conn)=>{ /* audit is transactional in real DB; mocked here */ }}
  if(name==='../utils/barcodes')return {nextInventoryBarcode:async()=>`GM-${state.nextId}`}
  if(name==='../utils/inventoryBatches')return {receiveInventoryBatch:async(id,b,conn)=>{if(breakSecondBatch&&b.supplier_lot_number==='LOT-B')throw Error('simulated second-batch failure');const draftRows=(await conn.query('SELECT inventory_branch_test',[])).__mock;return {batch_id:40,location:'Main Stockroom'}},syncInventorySnapshot:async()=>{},attachBatchesToInventory:async rows=>rows}
  if(name==='../utils/inventoryLocations')return {resolveMainStockroom:async()=>({id:1})}
  throw Error('Unexpected module '+name)
 }
 // Use a separate stub that has no extra SQL side effects.
 const mockSafe=name=>name==='../utils/inventoryBatches'?{receiveInventoryBatch:async(id,b)=>{if(breakSecondBatch&&b.supplier_lot_number==='LOT-B')throw Error('simulated second-batch failure');return {batch_id:b.supplier_lot_number==='LOT-B'?42:41,location:'Main Stockroom'}},syncInventorySnapshot:async()=>{},attachBatchesToInventory:async rows=>rows}:mock(name)
 const exportsOf=src=>{const mod={exports:{}};vm.runInNewContext(src,{module:mod,exports:mod.exports,require:mockSafe,console,Date,Set,Number,Object,String,Error,RegExp}, {filename:'server.js'});return mod.exports}
 const moduleItems=exportsOf(source),moduleCats=exportsOf(categories)
 const call=async(name,items,branch=1)=>{let response={statusCode:200,payload:null,status(n){this.statusCode=n;return this},json(v){this.payload=v;return this}};await moduleItems[name]({body:{items},branchId:branch,user:{id:7},adminContext:{account_role:'admin'},ip:'127.0.0.1'},response);return response}
 const del=async(branch=1)=>{let response={statusCode:200,payload:null,status(n){this.statusCode=n;return this},json(v){this.payload=v;return this}};await moduleCats.deleteCategory({params:{id:8},branchId:branch,user:{id:7},adminContext:{account_role:'admin'},ip:'127.0.0.1'},response);return response}
 return {call,del,get state(){return state},get commits(){return commits},get rollbacks(){return rollbacks}}
}
test('two opening batches create one product, Stock In rows and correct opening count',async()=>{
 const h=harness(),result=await h.call('bulkCreateItems',[itemRow()]);assert.equal(result.statusCode,201)
 assert.equal(result.payload.items[0].opening_quantity,100)
 assert.equal(result.payload.items[0].opening_batches,2)
 assert.equal(h.state.stockLogs.length,2);assert.deepEqual(h.state.stockLogs.map(x=>x.quantity),[60,40]);assert.equal(h.commits,1)
})
test('invalid opening date rejected and nothing committed',async()=>{
 const h=harness(),bad=itemRow();bad.opening_batches[0].expiration_date='2020-01-01'
 const r=await h.call('bulkCreateItems',[bad]);assert.equal(r.statusCode,400);assert.equal(h.state.items.length,0);assert.equal(h.commits,0)
})
test('batch failure rolls back product and first opening batch',async()=>{
 const h=harness({breakSecondBatch:true});await assert.rejects(()=>h.call('bulkCreateItems',[itemRow()]),/simulated second-batch failure/)
 assert.equal(h.state.items.length,0);assert.equal(h.state.stockLogs.length,0);assert.equal(h.rollbacks,1)
})
test('receipt reference blocks duplicate stock import and remains branch-scoped',async()=>{
 const h=harness(),created=await h.call('bulkCreateItems',[itemRow({opening_batches:[]})]);assert.equal(created.statusCode,201)
 const receipt={id:100,barcode:'GM-100',receipt_reference:'DELIVERY_2026A',quantity:15,expiration_date:'2028-04-11',supplier_lot_number:'LOT-Z',unit_cost:25,location_id:1,supplier_id:17}
 const first=await h.call('bulkReceiveItems',[receipt]);assert.equal(first.statusCode,201)
 const duplicate=await h.call('bulkReceiveItems',[receipt]);assert.equal(duplicate.statusCode,409);assert.equal(duplicate.payload.code,'RECEIPT_ALREADY_IMPORTED')
 assert.equal(h.state.stockLogs.length,1);assert.equal(h.state.receipts.length,1)
})
test('branch category deletion removes only unused categories',async()=>{
 const h=harness(),r=await h.del();assert.equal(r.statusCode,200);assert.equal(r.payload.deleted,true);assert.equal(h.state.category,null)
})
test('branch category deletion blocks any linked service, including inactive',async()=>{
 const h=harness({linked:1}),r=await h.del();assert.equal(r.statusCode,409);assert.equal(r.payload.code,'SERVICE_CATEGORY_IN_USE');assert.ok(h.state.category)
})
test('branch category deletion rejects cross-branch target',async()=>{
 const h=harness(),r=await h.del(2);assert.equal(r.statusCode,404);assert.ok(h.state.category)
})

