'use strict'
const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const vm = require('node:vm')
const path = require('node:path')
const {EventEmitter} = require('node:events')

const routeFile = path.resolve(__dirname, '../../routers/branchQueueInventoryWrites.js')
const {registerClient,sseClients} = require('../../utils/sse')
const clinicEvents = require('../../utils/clinicEvents')

// Load the production route module with isolated in-memory collaborators. This
// exercises its real Express middleware registration without a live TiDB, and
// does not change global require caches, environment variables, or DB records.
function fixture({rejectMovement=false}={}) {
  const calls=[]
  const conn={
    beginTransaction:async()=>calls.push('begin'),
    commit:async()=>calls.push('commit'),
    rollback:async()=>calls.push('rollback'),
    release:()=>calls.push('release'),
    query:async(sql)=>{
      calls.push(sql)
      if(sql.includes('FROM inventory WHERE id='))return [[{id:88,archived_at:null}]]
      return [{affectedRows:1}]
    }
  }
  const db={
    getConnection:async()=>conn,
    query:async(sql)=>{calls.push(sql);return sql.includes('SELECT * FROM inventory')?[[{id:88,branch_id:1}]]:[[]]}
  }
  const fakeAdmin = new Proxy({}, {get(){return (req,res)=>res.json({ok:true})}})
  const deps={
    '../db/connect':db,
    '../utils/audit':{writeAuditLog:async()=>{}},
    '../utils/manualInventoryMovement':{applyManualInventoryMovement:async()=>{
      if(rejectMovement){const error=new Error('Insufficient stock');error.statusCode=409;error.code='STOCK_UNAVAILABLE';throw error}
    }},
    '../utils/inventoryBatches':{attachBatchesToInventory:async rows=>rows,moveBatchBetweenLocations:async()=>({from:{name:'Room'},to:{name:'Stockroom'}})},
    '../controllers/admin.controller':fakeAdmin,
    '../utils/clinicEvents':clinicEvents,
  }
  const wrapped=vm.runInNewContext('(function(require,module,exports){'+fs.readFileSync(routeFile,'utf8')+'\n})',{console},{filename:routeFile})
  const mod={exports:{}}
  wrapped(name=>{if(!(name in deps))throw Error('Unexpected dependency: '+name);return deps[name]},mod,mod.exports)
  const routes=[]
  const router={get:(url,...handlers)=>routes.push({method:'get',url,handlers}),post:(url,...handlers)=>routes.push({method:'post',url,handlers}),put:(url,...handlers)=>routes.push({method:'put',url,handlers}),patch:(url,...handlers)=>routes.push({method:'patch',url,handlers}),delete:(url,...handlers)=>routes.push({method:'delete',url,handlers})}
  const allow=()=> (req,res,next)=>next()
  mod.exports.registerBranchQueueInventoryWrites(router,{requireSuper:allow(),branchContext:allow(),requirePermission:allow})
  mod.exports.registerBranchMoveStock(router,{requireSuper:allow(),branchContext:allow(),requirePermission:allow})
  return {routes,calls}
}
function response(){
  const res=new EventEmitter();res.statusCode=200
  res.status=function(status){res.statusCode=status;return res}
  res.json=function(body){res.body=body;res.emit('finish');return res}
  return res
}
async function execute(route,req,res){
  for(const middleware of route.handlers){
    let called=false
    await Promise.resolve(middleware(req,res,()=>{called=true}))
    if(!called || res.body)break
  }
}
function subscribe(branchId){
  const written=[]
  const client={writableEnded:false,write:line=>written.push(JSON.parse(line.slice(6)).event)}
  return {written,unsubscribe:registerClient('admin',branchId,client,{branchId})}
}

for(const variant of ['successful','rejected']){
  test(`inventory branch stock route ${variant} emits only after successful write`,async()=>{
    const {routes,calls}=fixture({rejectMovement:variant==='rejected'})
    const route=routes.find(r=>r.method==='patch'&&r.url==='/my/legacy/inventory/:id/stock')
    assert.ok(route,'stock route registered without a ReferenceError')
    const branchOne=subscribe(1),branchTwo=subscribe(2)
    try{
      const res=response()
      await execute(route,{branchId:1,params:{id:'88'},body:{},user:{id:7},adminContext:{account_role:'admin'}},res)
      assert.equal(res.statusCode,variant==='rejected'?409:200)
      assert.ok(calls.includes(variant==='rejected'?'rollback':'commit'))
      assert.deepEqual(branchOne.written,variant==='rejected'?[]:['inventory.updated'])
      assert.deepEqual(branchTwo.written,[], 'never broadcast Branch 1 stock to Branch 2')
    }finally{branchOne.unsubscribe();branchTwo.unsubscribe();sseClients.clear()}
  })
}
test('both workspace and branch-admin stock/move routes install authorized event middleware',()=>{
  const {routes}=fixture()
  for(const prefix of ['/my/legacy','/workspace/:branchId/legacy']){
    for(const [method,suffix] of [['patch','/inventory/:id/stock'],['post','/inventory/:id/move-location']]){
      const route=routes.find(r=>r.method===method&&r.url===prefix+suffix)
      assert.ok(route,`missing ${method} ${prefix}${suffix}`)
      assert.ok(route.handlers.length>=3,'role, branch, permission and event safeguards retained')
    }
  }
})
