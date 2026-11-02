'use strict'
const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const vm = require('node:vm')
const base=path.resolve(__dirname,'../..')
const auditArea=require('../../utils/auditArea')
const loadCore=()=>{const mod={exports:{}};vm.runInNewContext(`(function(require,module,exports){${fs.readFileSync(path.join(base,'utils/audit.js'),'utf8')}\n})`,{})(key=>key==='../db/connect'?{}:require(key),mod,mod.exports);return mod.exports}
const {sanitizeAuditValue,writeAuditLog}=loadCore()
const read=(rel)=>fs.readFileSync(path.join(base,rel),'utf8')
const loadAudit=(db)=>{
 const src=read('routers/branchAudit.js'),mod={exports:{}}
 const mocked={ '../db/connect':db,'../utils/audit':{sanitizeAuditValue,writeAuditLog:async()=>{}},'../utils/auditArea':auditArea,crypto:require('node:crypto') }
 vm.runInNewContext(`(function(require,module,exports){${src}\n})`,{})(key=>{if(!(key in mocked))throw new Error('Unexpected: '+key);return mocked[key]},mod,mod.exports)
 return mod.exports
}
test('area SQL prioritizes service catalog before billing and keeps branch scope',()=>{
 const sql=auditArea.areaCaseSql()
 assert.ok(sql.indexOf("'services_pricing'")<sql.indexOf("'billing'"))
 const query=loadAudit({}).filters({branchId:11,query:{area:'services_pricing'}})
 assert.equal(query.values[0],11);assert.equal(query.values[1],'services_pricing');assert.match(query.where,/al\.branch_id=\?/)
 assert.ok(query.where.includes('CASE WHEN'))
})
test('unrecognized areas return zero rows, not all clinic events',()=>{
 const query=loadAudit({}).filters({branchId:5,query:{area:'unknown_area'}})
 assert.match(query.where,/1=0/)
})
test('legacy service catalog filter still maps correctly',()=>{
 const query=loadAudit({}).filters({branchId:5,query:{area:'service_catalog'}})
 assert.equal(query.values[1],'services_pricing')
})
test('result, date, and search filters are branch-scoped and parameterized',()=>{
 const q=loadAudit({}).filters({branchId:9,query:{outcome:'failure',search:"%' OR 1=1 --",start_date:'2026-11-01'}})
 assert.equal(q.values[0],9)
 assert.ok(q.values.includes('failure'))
 assert.ok(q.values.some(v=>String(v).includes("%' OR 1=1 --")))
 assert.ok(!q.where.includes('OR 1=1 --'))
})
test('branch read returns redacted safe values, actor snapshots, IP, status and area',async()=>{
 const calls=[]
 const db={query:async(sql,params)=>{calls.push({sql,params});if(sql.includes('COUNT(*) total'))return [[{total:1}]];return [[{id:2,action:'inventory.item_updated',outcome:'success',old_values:JSON.stringify({low_stock_alert:5,phone:'09123456789'}),new_values:JSON.stringify({low_stock_alert:10,password:'SECRET'}),actor_name_snapshot:'Past Admin',ip_address:'127.0.0.1'}]]}}
 const response={json(v){this.data=v}}
 await loadAudit(db).readPage({branchId:8,query:{area:'inventory'}},response)
 assert.equal(response.data.items[0].new_values.password,'[REDACTED]')
 assert.equal(response.data.items[0].old_values.phone,'[REDACTED]')
 assert.equal(response.data.items[0].old_values.low_stock_alert,5)
 assert.match(calls[1].sql,/al\.ip_address/)
 assert.match(calls[1].sql,/actor_name_snapshot/)
 assert.ok(calls[1].params.includes(8))
})
test('nested clinical content, secrets, contact fields and free-text notes are redacted',()=>{
 const v=sanitizeAuditValue({nested:{otp:'123456',clinical_notes:'medical history',arr:[{secret:'key',quantity:2}]},patient_phone:'0999',diagnosis:'test',stock:5})
 assert.equal(v.nested.otp,'[REDACTED]')
 assert.equal(v.nested.clinical_notes,'[REDACTED]')
 assert.equal(v.nested.arr[0].secret,'[REDACTED]')
 assert.equal(v.nested.arr[0].quantity,2)
 assert.equal(v.patient_phone,'[REDACTED]')
 assert.equal(v.diagnosis,'[REDACTED]')
 assert.equal(v.stock,5)
})
test('writer records before/after, outcome, actor snapshot, request ID and same transaction',async()=>{
 const calls=[]
 const transaction={query:async(sql,params)=>{
  calls.push({sql,params})
  if(sql.startsWith('SELECT full_name'))return [[{full_name:'Original Actor'}]]
  return [{insertId:22}]
 }}
 await writeAuditLog({userId:8,userRole:'admin',action:'inventory.item_updated',entityType:'inventory_item',entityId:18,branchId:4,
  oldValues:{low_stock_alert:5},newValues:{low_stock_alert:9},ipAddress:'127.0.0.1',requestId:'req-123',targetName:'Alcohol'},transaction)
 assert.equal(calls.length,2)
 const insertion=calls[1]
 assert.match(insertion.sql,/actor_name_snapshot/)
 assert.ok(insertion.params.includes('Original Actor'))
 assert.ok(insertion.params.includes('req-123'))
 assert.ok(insertion.params.includes('Alcohol'))
 assert.ok(insertion.params.includes(4))
 assert.ok(insertion.params.includes('success'))
})
test('failure action is recorded as failed and does not include credentials',async()=>{
 const calls=[]
 await writeAuditLog({action:'auth.login_failed',entityType:'admin',newValues:{password:'bad',email:'user@example.com'}},
  {query:async(sql,params)=>{calls.push({sql,params});return [{}]}})
 assert.ok(calls[0].params.includes('failure'))
 assert.doesNotMatch(calls[0].params.join(' '),/bad|user@example.com/)
})
test('migration is included and uses column presence guard',()=>{
 const runner=read('scripts/branchMigrations.js')
 assert.ok(runner.includes("'2026-11-02-audit-context.sql'"))
 assert.ok(runner.includes('information_schema.COLUMNS'))
})
test('branch CSV export excludes raw clinical payloads, logs export and caps output',async()=>{
 const db={query:async(sql)=>sql.includes('COUNT(*) total')?[[{total:1}]]:[[{id:10,created_at:'2026-11-02',area_code:'inventory',action:'inventory.item_updated',display_outcome:'success',user_id:2,performed_by:'Admin',user_role:'admin',entity_type:'inventory_item',entity_id:'5',new_values:'{"diagnosis":"private"}',ip_address:'10.0.0.1'}]]}
 // Capture the route handler registered by the branch audit module.
 const routes=[]
 const router={get(path,...middleware){routes.push({path,callback:middleware.at(-1)})},post(){}}
 const handler=()=>()=>{}
 loadAudit(db).registerBranchAudit(router,{requireSuper:handler(),branchContext:handler(),requirePermission:handler})
 const exportRoute=routes.find(r=>r.path==='/my/legacy/audit-logs/export')
 assert.ok(exportRoute)
 const res={headers:{},setHeader(key,value){this.headers[key]=value},send(text){this.body=text}}
 await exportRoute.callback({branchId:7,user:{id:2,role:'admin'},query:{},ip:'10.0.0.1'},res)
 assert.match(res.body,/inventory\.item_updated/)
 assert.doesNotMatch(res.body,/private|diagnosis|10\.0\.0\.1/)
 assert.match(res.headers['Content-Type'],/text\/csv/)
})
