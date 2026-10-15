const { test } = require('node:test')
const assert = require('node:assert/strict')
const Module = require('node:module')
const path = require('node:path')
const root = path.resolve(__dirname,'../..')
const mockModule = (file, fakeDb) => {
  const absolute=path.join(root,file)
  const original=Module._load
  Module._load=function(request,parent,isMain){
    if(parent?.filename===absolute&&request==='../db/connect')return fakeDb
    return original.apply(this,arguments)
  }
  try{delete require.cache[absolute];return require(absolute)}finally{Module._load=original}
}
const response=()=>({code:200,value:null,status(n){this.code=n;return this},json(v){this.value=v;return this}})

test('branch session identity comes from DB, never request body or query',async()=>{
  const db={query:async(sql,args)=>{assert.match(sql,/a\.id=\?/);assert.deepEqual(args,[3]);return [[{branch_id:2,branch_exists:2,branch_name:'Clinic B',branch_active:1}]]}}
  const middleware=mockModule('middlewares/branchScope.middleware.js',db)('staff')
  const req={user:{id:3},body:{branch_id:1},query:{branch_id:1}},res=response()
  let called=false;await middleware(req,res,()=>{called=true})
  assert.equal(called,true);assert.equal(req.branchId,2);assert.equal(req.branch.name,'Clinic B')
})
test('deactivated branch is denied',async()=>{
  const db={query:async()=>[[{branch_id:2,branch_exists:2,branch_name:'Inactive',branch_active:0}]]}
  const middleware=mockModule('middlewares/branchScope.middleware.js',db)('doctor')
  const req={user:{id:3}},res=response();await middleware(req,res,()=>assert.fail('should not call next'))
  assert.equal(res.code,403);assert.equal(res.value.code,'BRANCH_INACTIVE')
})
test('branch provisioner seeds a branch without stock or patients',async()=>{
  const {provisionBranch}=require('../../utils/branchProvisioning')
  const statements=[];await provisionBranch({query:async(sql,params)=>{statements.push({sql,params});return [[]]}},5)
  assert.ok(statements.some(x=>x.sql.includes('inventory_locations')))
  assert.ok(statements.some(x=>x.sql.includes('branch_receipt_sequences')))
  assert.ok(statements.some(x=>x.sql.includes('branch_payment_settings')))
  assert.ok(statements.some(x=>x.sql.includes('billing_service_categories')))
  assert.ok(statements.every(x=>!(/\b(?:inventory_batches|billing_records|patients)\b/.test(x.sql))))
  assert.ok(statements.every(x=>x.params.includes(5)))
})
test('Super Admin consolidated inventory sums both branches',async()=>{
  const mock={query:async(sql,args)=>{
    if(sql.includes('FROM clinic_branches'))return [[{id:1,name:'Laguna Clinic',code:'LAG',is_active:1},{id:2,name:'Manila Clinic',code:'MNL',is_active:1}]]
    if(sql.includes('FROM inventory i')){
      assert.match(sql,/i\.branch_id IN/);assert.deepEqual(args,[1,2]);
      return [[{id:1,branch_id:1,branch_name:'Laguna Clinic',name:'Vitamin C',category:'medical',item_type:'medicine',stock:6,stock_base:6,threshold:2,cost_value:30,selling_price:12,nearest_expiry:'2027-10-12'},
      {id:2,branch_id:2,branch_name:'Manila Clinic',name:'Vitamin C',category:'medical',item_type:'medicine',stock:4,stock_base:4,threshold:5,cost_value:20,selling_price:12,nearest_expiry:'2027-12-12'}]]
    }throw new Error('Unexpected SQL '+sql)
  }}
  const {registerAllInventory}=mockModule('routers/branchAllInventory.js',mock)
  const routes={};const router={get:(p,...handlers)=>{routes[p]=handlers.at(-1)}}
  registerAllInventory(router,(req,res,next)=>next())
  const res=response();await routes['/inventory/all']({query:{}},res)
  assert.equal(res.code,200)
  assert.equal(res.value.rows.length,1)
  assert.equal(res.value.rows[0].quantity_base,10)
  assert.equal(res.value.rows[0].cost_value,50)
  assert.deepEqual(res.value.rows[0].branches_below_threshold,['Manila Clinic'])
  assert.equal(res.value.comparison.length,2)
})
test('migration parser handles DELIMITER procedure bodies',()=>{
  const fs=require('node:fs')
  const {splitMysqlMigration}=require('../../scripts/branchMigrations')
  const source=fs.readFileSync(path.join(root,'db/migrations/2026-10-15-branch-ledgers.sql'),'utf8')
  const sql=splitMysqlMigration(source)
  assert.ok(sql.length>15)
  assert.ok(sql.some(s=>s.startsWith('CREATE PROCEDURE')&&s.includes('END IF;')))
  assert.ok(sql.every(s=>!/^DROP\s+TABLE\b/i.test(s)))
})
