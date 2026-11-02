'use strict'
const { test } = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const vm = require('node:vm')

const root = path.resolve(__dirname, '../..')
const source = (file) => fs.readFileSync(path.join(root, file), 'utf8')
function harness({ ownerId = 1, duplicate = false, stockHistory = 0, branch = 1 } = {}) {
  const calls = []
  const rows = {
    previous: {id:1002,name:'Local Reason',code:'b1_local_reason',movement_type:'out',requires_batch:1,is_active:1,branch_id:1},
    saved: {id:1002,name:'Updated Reason',code:'b1_local_reason',movement_type:'out',requires_batch:1,is_active:1,branch_id:1},
  }
  const connection = {
    beginTransaction: async () => calls.push('begin'),
    rollback: async () => calls.push('rollback'),
    commit: async () => calls.push('commit'),
    release: () => calls.push('release'),
    query: async (sql, args) => {
      calls.push({sql,args})
      if (sql.includes('WHERE id=? AND branch_id=? FOR UPDATE')) return [[ownerId === branch ? rows.previous : undefined]]
      if (sql.includes('SELECT COUNT(*) total FROM inventory_logs')) return [[{total:stockHistory}]]
      if (sql.includes('SELECT id FROM inventory_movement_reasons WHERE branch_id=')) return [[duplicate ? {id:123} : undefined]]
      if (sql.includes('INSERT INTO inventory_movement_reasons')) return [{insertId:1002}]
      if (sql.includes('SELECT id,name,code,movement_type') && sql.includes('WHERE id=? AND branch_id=?')) return [[rows.saved]]
      return [{affectedRows:1}]
    },
  }
  const mocks = {
    '../db/connect': {getConnection: async () => connection},
    '../utils/audit': {writeAuditLog: async (event, executor) => {assert.equal(executor, connection);calls.push({audit:event})}},
    '../utils/clinicEvents': {afterSuccessfulMutation: () => (req,res,next) => next()},
  }
  const scope={module:{exports:{}}, exports:{},require:(name)=>{if(name in mocks) return mocks[name];throw Error('unexpected '+name)},console}
  vm.runInNewContext(source('routers/branchSystemWrites.js'),scope,{filename:'branchSystemWrites.js'})
  const fn=scope.module.exports.saveBranchMovementReason
  const req=(id,body)=>({branchId:branch,params:{id},body,user:{id:17},adminContext:{account_role:'admin'},ip:'127.0.0.1'})
  const res=()=>({statusCode:200,status(n){this.statusCode=n;return this},json(obj){this.body=obj;return this}})
  return {fn,req,res,calls}
}

test('branch admin can add branch-owned reason with audit in same transaction',async()=>{
  const h=harness()
  const res=h.res()
  await h.fn(h.req(null,{name:'Expired stock',movement_type:'out',requires_batch:1,is_active:1}),res)
  assert.equal(res.statusCode,201)
  const insert=h.calls.find(x=>x.sql?.includes('INSERT INTO inventory_movement_reasons'))
  assert.deepEqual(Array.from(insert.args),['Expired stock','b1_expired_stock','out',1,1,1])
  assert.equal(h.calls.find(x=>x.audit).audit.branchId,1)
  assert(h.calls.includes('commit'))
})

test('cannot edit global reasons or another branch even with the System Setup grant',async()=>{
  const h=harness({ownerId:5,branch:1}),res=h.res()
  await h.fn(h.req('1002',{name:'Change Global',movement_type:'out'}),res)
  assert.equal(res.statusCode,404)
  assert.equal(res.body.code,'MOVEMENT_REASON_NOT_OWNED')
  assert(h.calls.includes('rollback'))
  assert(!h.calls.some(x=>x.sql?.includes('UPDATE inventory_movement_reasons')))
})

test('rejects duplicate branch reason',async()=>{
  const h=harness({duplicate:true}),res=h.res()
  await h.fn(h.req(null,{name:'Expired stock',movement_type:'out'}),res)
  assert.equal(res.statusCode,409)
  assert(!h.calls.includes('commit'))
})

test('rejects changing movement type once branch stock history exists',async()=>{
  const h=harness({stockHistory:3}),res=h.res()
  await h.fn(h.req('1002',{name:'Changed',movement_type:'in'}),res)
  assert.equal(res.statusCode,409)
  assert.equal(res.body.code,'MOVEMENT_REASON_IN_USE')
})

test('does not accept a branch without a verified branch ID',async()=>{
  const h=harness({branch:0}),res=h.res()
  await h.fn(h.req(null,{name:'Reason',movement_type:'in'}),res)
  assert.equal(res.statusCode,403)
  assert(!h.calls.includes('begin'))
})

test('branch read and manual stock selection share a branch filter',()=>{
  const read=source('routers/branchOperationalReads.js')
  const manual=source('utils/manualInventoryMovement.js')
  assert.match(read,/FROM inventory_movement_reasons WHERE branch_id IS NULL OR branch_id=\?/)
  assert.match(read,/WHERE is_active=1 AND \(branch_id IS NULL OR branch_id=\?\)/)
  assert.match(manual,/WHERE movement_type=\? AND is_active=1 AND \(branch_id IS NULL OR branch_id=\?\)/)
  assert.match(manual,/resolveConfiguredMovementReason\('in', body.movement_reason, executor, branchId\)/)
  assert.match(manual,/resolveConfiguredMovementReason\('out', body.movement_reason, executor, branchId\)/)
})

test('Super Admin global reason writer cannot update branch-scoped reason',()=>{
  const admin=source('controllers/admin.controller.js')
  assert.match(admin,/WHERE id=\? AND branch_id IS NULL FOR UPDATE/)
  assert.match(admin,/SET name=\?,movement_type=\?,requires_batch=\?,is_active=\? WHERE id=\? AND branch_id IS NULL/)
})

test('System Setup checkbox controls branch settings; shared UOM stays Super Admin only',()=>{
  const src=source('routers/branchSystemWrites.js')
  const global=source('routers/branchGlobalReferenceWrites.js')
  const ui=fs.readFileSync(path.join(root,'../client/src/pages/adminPage/Admin_SystemSetup.jsx'),'utf8')
  assert.match(src,/if \(prefix === '\/my\/legacy'\)/)
  assert.match(src,/requirePermission\('system_setup'\)/)
  assert.match(src,/safeBranchMovementReason/)
  assert.match(global,/requireSuper,requirePermission\('system_setup'\)/)
  assert.match(ui,/Shared · read only/)
  assert.match(ui,/Add Clinic Reason/)
})

test('migration preserves shared reasons and is registered',()=>{
  const migration=source('db/migrations/2026-11-02-branch-movement-reasons.sql')
  const runner=source('scripts/branchMigrations.js')
  assert.match(migration,/ADD COLUMN branch_id INT NULL DEFAULT NULL/)
  assert.match(runner,/2026-11-02-branch-movement-reasons\.sql/)
  assert.doesNotMatch(migration,/DELETE FROM|TRUNCATE|UPDATE inventory/i)
})
