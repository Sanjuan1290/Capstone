const test=require('node:test')
const assert=require('node:assert/strict')
const fs=require('node:fs')
const path=require('node:path')
const vm=require('node:vm')
const source=fs.readFileSync(path.join(__dirname,'../../routers/branchInventoryItems.js'),'utf8')
const original={id:55,branch_id:1,barcode:'MED-0055',name:'Alcohol',category:'medical',item_type:'medicine',selling_price:59.99,price:59.99,threshold:5,stock:100,stock_base:100,default_location_id:1,supplier_id:17,supplier:'Supplier A',archived_at:null}
const makeHarness=(items=[original])=>{
 let state={items:structuredClone(items),bills:[{name:'Alcohol',unit_price:59.99,total:59.99}],stockLogs:[{item_id:55,quantity:5,name:'Alcohol',unit_price:59.99}],batches:[{item_id:55,quantity:100}],audit:[],nextId:56}
 let rollbacks=0,commits=0
 const query=async(current,sql,params)=>{
  if(sql.includes('FROM inventory WHERE id=? AND branch_id=? FOR UPDATE'))return [[current.items.find(i=>i.id===Number(params[0])&&i.branch_id===Number(params[1]))||null]]
  if(sql.includes('FROM inventory_suppliers WHERE id=?'))return [[params[0]==17&&params[1]==1?{id:17,name:'Supplier A',category:'medical,derma'}:null]]
  if(sql.includes('FROM inventory_locations WHERE id=?'))return [[params[0]==1&&params[1]==1?{id:1}:null]]
  if(sql.includes('FROM billing_service_materials'))return [[{n:current.linkedServices||0}]]
  if(sql.includes('SELECT id FROM inventory WHERE branch_id=?')||sql.includes('SELECT id,archived_at FROM inventory WHERE branch_id=?'))return [[current.items.find(i=>i.branch_id===Number(params[0])&&i.name.toLowerCase()===String(sql.includes('id<>?')?params[2]:params[1]).toLowerCase())||null]]
  if(sql.startsWith('UPDATE inventory SET ')){
    assert.ok(!/\b(stock|stock_base|name|barcode|supplier_id|default_location_id|category)\s*=/.test(sql),'protected inventory columns changed')
    const id=params[params.length-2],branch=params[params.length-1]
    const target=current.items.find(i=>i.id===Number(id)&&i.branch_id===Number(branch))
    const setters=sql.slice('UPDATE inventory SET '.length,sql.indexOf(' WHERE ')).split(',').map(x=>x.trim().split('=')[0])
    setters.forEach((key,i)=>{target[key]=params[i]})
    return [{affectedRows:1}]
  }
  if(sql.startsWith('INSERT INTO inventory')){
    const [branch_id,barcode,name,category,item_type,,,,,threshold,price1,price2,supplierName,supplier_id,location]=params
    const id=current.nextId++
    current.items.push({id,branch_id,barcode,name,category,item_type,stock:0,stock_base:0,threshold,price:price1,selling_price:price2,supplier:supplierName,supplier_id,default_location_id:location})
    return [{insertId:id}]
  }
  if(sql.startsWith('INSERT INTO inventory_excel_uploads'))return [{insertId:1}]
  throw Error('Unexpected query: '+sql.slice(0,150))
 }
 const db={getConnection:async()=>{
  const draft=structuredClone(state)
  return {beginTransaction:async()=>{},query:(sql,params)=>query(draft,sql,params),commit:async()=>{commits++;state=draft},rollback:async()=>{rollbacks++},release:()=>{}}
 }}
 const requireMock=name=>{
  if(name==='../utils/inventoryActivity')return require('../helpers/inventoryActivityHarness.cjs').loadActivity()
  if(name==='../db/connect')return db
  if(name==='../utils/clinicEvents')return {afterSuccessfulMutation:()=>handler=>handler}
  if(name==='../utils/audit')return {writeAuditLog:async(args,conn)=>{state.audit.push(args)}}
  if(name==='../utils/barcodes')return {nextInventoryBarcode:async()=>`MED-${state.nextId}`}
  if(name==='../utils/inventoryBatches')return {receiveInventoryBatch:async()=>{},syncInventorySnapshot:async()=>{},attachBatchesToInventory:async x=>x}
  if(name==='../utils/inventoryLocations')return {resolveMainStockroom:async()=>({id:1})}
  throw Error('Unexpected module '+name)
 }
 const module={exports:{}}
 vm.runInNewContext(source,{module,exports:module.exports,require:requireMock,console},{filename:'branchInventoryItems.js'})
 const call=async(method,items,branch=1)=>{
  const response={statusCode:200,payload:null,status(c){this.statusCode=c;return this},json(body){this.payload=body;return this}}
  await module.exports[method]({body:{items},branchId:branch,user:{id:12},adminContext:{account_role:'admin'},ip:'127.0.0.1'},response)
  return response
 }
 return {call,get state(){return state},get commits(){return commits},get rollbacks(){return rollbacks},setLinked(n){state.linkedServices=n}}
}
const edit=(changes={selling_price:65},expected={selling_price:59.99},id=55)=>({id,barcode:'MED-0055',changes,expected,excel_row:3})
test('price-only edit does not touch stock, batch or recorded bill / stock out',async()=>{
 const h=makeHarness(),before=structuredClone(h.state)
 const r=await h.call('bulkUpdateItems',[edit()])
 assert.equal(r.statusCode,200);assert.equal(r.payload.updated,1)
 assert.equal(h.state.items[0].selling_price,65);assert.equal(h.state.items[0].price,65)
 for(const k of ['stock','stock_base','name','barcode','category','supplier_id'])assert.deepEqual(h.state.items[0][k],before.items[0][k])
 for(const k of ['bills','stockLogs','batches'])assert.deepEqual(h.state[k],before[k],`historic ${k} changed`)
})
test('low stock alert updates independently of changed price',async()=>{
 const h=makeHarness([{...original,selling_price:65,price:65}])
 const r=await h.call('bulkUpdateItems',[edit({threshold:10},{threshold:5})])
 assert.equal(r.statusCode,200);assert.equal(h.state.items[0].threshold,10);assert.equal(h.state.items[0].selling_price,65)
})
test('repeated upload is already applied and does not write item again',async()=>{
 const h=makeHarness([{...original,selling_price:65,price:65}])
 const r=await h.call('bulkUpdateItems',[edit()])
 assert.equal(r.statusCode,200);assert.equal(r.payload.updated,0);assert.equal(r.payload.already_applied,1)
})
test('same-field price conflict returns original, current and requested',async()=>{
 const h=makeHarness([{...original,selling_price:70,price:70}])
 const r=await h.call('bulkUpdateItems',[edit()])
 assert.equal(r.statusCode,409);assert.equal(r.payload.code,'BULK_FIELD_CONFLICT')
 assert.equal(r.payload.details.field,'Selling Price');assert.equal(r.payload.details.current,70)
 assert.equal(r.payload.details.excel_row,3);assert.equal(h.rollbacks,1)
})
test('same-field alert conflict blocks update and provides context',async()=>{
 const h=makeHarness([{...original,threshold:8}])
 const r=await h.call('bulkUpdateItems',[edit({threshold:10},{threshold:5})])
 assert.equal(r.statusCode,409);assert.equal(r.payload.details.field,'Low Stock Alert')
 assert.equal(h.state.items[0].threshold,8)
})
test('atomic transaction rolls back earlier item update if later item conflicts',async()=>{
 const h=makeHarness([original,{...original,id:56,barcode:'MED-0056',name:'Collagen',selling_price:77}])
 const r=await h.call('bulkUpdateItems',[edit(),{...edit({selling_price:80},{selling_price:59.99},56),barcode:'MED-0056'}])
 assert.equal(r.statusCode,409);assert.equal(h.state.items[0].selling_price,59.99);assert.equal(h.commits,0);assert.equal(h.rollbacks,1)
})
test('rejects stock, item name, supplier and barcode updates in bulk',async()=>{
 const h=makeHarness()
 for(const unsafe of [{...edit(),stock:500},{...edit(),name:'New'},{...edit(),supplier_id:10},{...edit(),changes:{threshold:5,stock:500},expected:{threshold:5,stock:100}}]){
  const r=await h.call('bulkUpdateItems',[unsafe]);assert.equal(r.statusCode,400);assert.equal(r.payload.code,'FORBIDDEN_BULK_FIELD')
 }
 assert.equal(h.commits,0)
})
test('linked-service price change blocked; alert-only is still allowed',async()=>{
 const h=makeHarness();h.setLinked(1)
 const price=await h.call('bulkUpdateItems',[edit()]);assert.equal(price.statusCode,409);assert.equal(price.payload.code,'LINKED_SERVICE_REPRICING')
 const alert=await h.call('bulkUpdateItems',[edit({threshold:10},{threshold:5})]);assert.equal(alert.statusCode,200)
})
test('branch isolation and invalid decimal alerts are rejected',async()=>{
 const h=makeHarness()
 assert.equal((await h.call('bulkUpdateItems',[edit()],2)).statusCode,409)
 assert.equal((await h.call('bulkUpdateItems',[edit({threshold:2.5},{threshold:5})])).statusCode,400)
})
test('new-item import still creates zero-stock medicine',async()=>{
 const h=makeHarness()
 const item={name:'Gel',category:'derma',item_type:'medicine',stock:0,selling_price:200,threshold:5,supplier_id:17,default_location_id:1}
 const r=await h.call('bulkCreateItems',[item]);assert.equal(r.statusCode,201);assert.equal(h.state.items[1].stock,0)
})
