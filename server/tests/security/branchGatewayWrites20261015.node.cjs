// Mocked handler regression tests; no MySQL connection or third-party modules.
const {test}=require('node:test')
const assert=require('node:assert/strict')
const Module=require('node:module')
const target=require.resolve('../../routers/branchQueueInventoryWrites')
function makeHarness(query,getConnection){
  const original=Module._load
  const db={query,getConnection: getConnection||(()=>{throw Error('Unexpected transaction')})}
  try{
    Module._load=function(name,parent,isMain){
      if(parent?.filename===target){
        if(name==='../db/connect')return db
        if(name==='../utils/audit')return {writeAuditLog:async()=>{}}
        if(name==='../utils/manualInventoryMovement')return {applyManualInventoryMovement:async()=>{throw Error('Unexpected stock movement')}}
        if(name==='../utils/inventoryBatches')return {attachBatchesToInventory:async x=>x}
        if(name==='../controllers/admin.controller')return {getQueuePrecheck(){},addToQueue(){},updateQueueStatus(){},createWalkInPatient(){},getAppointmentInventoryReadinessForPortal(){}}
      }
      return original.apply(this,arguments)
    }
    delete require.cache[target]
    return require(target)
  }finally{Module._load=original;delete require.cache[target]}
}
function response(){return {code:200,data:null,status(code){this.code=code;return this},json(data){this.data=data;return this}}}
test('branch queue list always filters queue and joined doctor by the trusted session branch',async()=>{
  let query,params
  const handler=makeHarness(async(q,p)=>{query=q;params=p;return [[{id:42}]]}).readQueue
  const res=response()
  await handler({branchId:2,query:{date:'2026-10-15'}},res)
  assert.match(query,/q\.branch_id=\?/)
  assert.match(query,/d\.branch_id=q\.branch_id/)
  assert.deepEqual(params,[2,'2026-10-15'])
  assert.deepEqual(res.data,[{id:42}])
})
test('a foreign inventory location cannot be edited',async()=>{
  const queries=[]
  const handler=makeHarness(async(q,p)=>{queries.push([q,p]);return [[]]}).updateLocation
  const res=response()
  await handler({branchId:2,params:{id:'90'},body:{name:'Updated',location_type:'stockroom'}},res)
  assert.equal(res.code,404)
  assert.equal(queries.length,1)
  assert.match(queries[0][0],/id=\? AND branch_id=\?/)
  assert.deepEqual(queries[0][1],['90',2])
})
test('a foreign stockroom cannot be deactivated',async()=>{
  let committed=false,rolledBack=false
  const conn={beginTransaction:async()=>{},query:async(q,p)=>{assert.match(q,/id=\? AND branch_id=\?/);assert.deepEqual(p,['7',1]);return [[]]},commit:async()=>{committed=true},rollback:async()=>{rolledBack=true},release:()=>{}}
  const handler=makeHarness(()=>{throw Error('Unexpected global query')},async()=>conn).deleteLocation
  const res=response()
  await handler({branchId:1,params:{id:'7'}},res)
  assert.equal(res.code,404);assert.equal(committed,false);assert.equal(rolledBack,true)
})
test('foreign inventory item cannot trigger a stock movement',async()=>{
  let committed=false,rolledBack=false
  const conn={beginTransaction:async()=>{},query:async(q,p)=>{assert.match(q,/id=\? AND branch_id=\?/);assert.deepEqual(p,['23',3]);return [[]]},commit:async()=>{committed=true},rollback:async()=>{rolledBack=true},release:()=>{}}
  const handler=makeHarness(()=>{throw Error('Unexpected global query')},async()=>conn).updateStock
  const res=response()
  await handler({branchId:3,user:{id:1},params:{id:'23'},body:{quantity:40}},res)
  assert.equal(res.code,404);assert.equal(committed,false);assert.equal(rolledBack,true)
})
