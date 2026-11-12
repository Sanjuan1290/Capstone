const test=require('node:test'),assert=require('node:assert/strict'),vm=require('node:vm'),fs=require('node:fs')
const permissions=require('../../utils/staffPermissions')
const {loadActivity}=require('../helpers/inventoryActivityHarness.cjs')
function itemHarness(role='staff'){
 const calls=[],audits=[],receipts=[]
 const connection={beginTransaction:async()=>calls.push('begin'),commit:async()=>calls.push('commit'),rollback:async()=>calls.push('rollback'),release(){},async query(sql,params){
  calls.push({sql,params})
  if(sql.includes('FROM inventory_locations'))return [[{id:2,name:'Main',is_active:1}]]
  if(sql.includes('FROM inventory_suppliers'))return [[{id:3,name:'Supplier',category:'medical'}]]
  if(sql.includes('SELECT id,archived_at'))return [[]]
  if(sql.includes('INSERT INTO inventory'))return [{insertId:11}]
  throw Error('Unexpected SQL: '+sql)
 }}
 const db={getConnection:async()=>connection,query:async()=>[[{id:11,name:'Tissue'}]]}
 const audit={writeAuditLog:async row=>audits.push(row)}
 const deps={'../db/connect':db,'../utils/clinicEvents':{},'../utils/audit':audit,'../utils/inventoryActivity':loadActivity(audit.writeAuditLog),'../utils/barcodes':{nextInventoryBarcode:async()=> 'M1-00001'},'../utils/inventoryLocations':{},'../utils/inventoryBatches':{attachBatchesToInventory:async rows=>rows,syncInventorySnapshot:async()=>{},receiveInventoryBatch:async(id,body)=>{receipts.push(body);return {batch_id:7,location:'Main',quantityBefore:0,quantityAfter:body.quantity}}}}
 const module={exports:{}}
 vm.runInNewContext(fs.readFileSync(require.resolve('../../routers/branchInventoryItems'),'utf8'),{module,require:key=>{assert.ok(key in deps,key);return deps[key]}})
 const req=body=>({branchId:1,user:{id:8,role},adminContext:{account_role:role},body:{name:'Tissue',category:'medical',item_type:'medicine',supplier_id:3,default_location_id:2,threshold:5,...body}})
 const response=()=>({code:200,status(code){this.code=code;return this},json(body){this.body=body;return this}})
 return {...module.exports,calls,audits,receipts,req,response}
}
for(const role of ['admin','staff','superadmin'])test(`${role}: item creation permits omitted quantity, selling price and expiry`,async()=>{
 const h=itemHarness(role),res=h.response();await h.createItem(h.req({}),res)
 assert.equal(res.code,201);assert.equal(h.receipts.length,0)
 const insert=h.calls.find(row=>row.sql?.includes('INSERT INTO inventory'))
 assert.equal(insert.params[10],0);assert.equal(insert.params[11],0)
 assert.ok(h.calls.includes('commit'))
})
test('Staff item receipt without expiry records Staff identity and matching balances',async()=>{
 const h=itemHarness(),res=h.response();await h.createItem(h.req({stock:200,selling_price:0,expiration_date:''}),res)
 assert.equal(res.code,201);assert.equal(h.receipts[0].expiration_date,null)
 const movement=h.audits.find(row=>row.action==='inventory.movement_recorded')
 assert.equal(movement.userRole,'staff');assert.equal(movement.userId,8)
 assert.equal(movement.oldValues.quantity,0);assert.equal(movement.newValues.quantity,200)
 assert.match(h.calls.find(row=>row.sql?.includes('INSERT INTO inventory_logs')).sql,/staff_id/)
})
test('optional fields still reject negative/fractional quantities, negative prices and invalid dates before writes',async()=>{
 for(const body of [{stock:-1},{stock:0.5},{selling_price:-1},{expiration_date:'2026-02-31'}]){
  const h=itemHarness(),res=h.response();await h.createItem(h.req(body),res)
  assert.equal(res.code,400,JSON.stringify(body));assert.equal(h.calls.length,0)
 }
})
test('Walk-in Queue is an independent normalized Staff grant',()=>{
 assert.ok(permissions.STAFF_PERMISSION_KEYS.includes('walk_in_queue'))
 assert.deepEqual(permissions.normalizeStaffPermissions(['walk_in_queue','walk_in_queue','invented']),['walk_in_queue'])
 assert.ok(!permissions.normalizeStaffPermissions(['appointments']).includes('walk_in_queue'))
 assert.ok(permissions.DEFAULT_STAFF_PERMISSIONS.includes('walk_in_queue'))
})
test('shared Staff route adapter registers scoped editing without account or audit-deletion routes',()=>{
 const registered=[],middlewares={}
 const router=Object.fromEntries(['get','post','put','patch','delete'].map(method=>[method,(route,...handlers)=>registered.push({method,route,handlers})]))
 const register=require('../../routers/staffOperationalRoutes')
 const can=key=>Object.assign((req,res,next)=>req.grants?.includes(key)?next():res.status(403).json({denied:true}),{key})
 register(router,{auth:[(req,res,next)=>next()],can,canAny:(...keys)=>(req,res,next)=>keys.some(key=>req.grants?.includes(key))?next():res.status(403).json({denied:true}),ownAssignedDoctor:(req,res,next)=>next(),staff:{},admin:{}})
 assert.ok(registered.some(row=>row.method==='post'&&row.route==='/admin-access/inventory'))
 assert.ok(registered.some(row=>row.method==='put'&&row.route==='/admin-access/doctors/:id/schedules'))
 assert.ok(registered.some(row=>row.method==='post'&&row.route==='/admin-access/inventory/batches/:batchId/action/request-code'))
 assert.ok(!registered.some(row=>/accounts|audit|workspace/.test(row.route)))
 const write=registered.find(row=>row.method==='post'&&row.route==='/admin-access/inventory')
 assert.ok(write.handlers.some(fn=>fn.key==='inventory'))
 for(const grants of [[],['system_setup']]){
  let allowed=false,code;write.handlers.find(fn=>fn.key==='inventory')({grants},{status(n){code=n;return this},json(){}},()=>{allowed=true})
  assert.equal(allowed,false);assert.equal(code,403)
 }
})
