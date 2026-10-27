const { test } = require('node:test')
const assert = require('node:assert/strict')
const Module = require('node:module')

const { registerClient, broadcast, sseClients } = require('../../utils/sse')
const { allocateReceiptNumber } = require('../../utils/payments')
const { nextInventoryBarcode } = require('../../utils/barcodes')
const { requiredFoundationColumns, verifyFoundationSchema } = require('../../scripts/branchMigrations')
const { createFoundationSchemaFixture, migrationSource } = require('../helpers/foundationSchemaFixture.cjs')

const mockConnection = () => {
  const events = []
  const res = { writableEnded:false, write:payload => events.push(JSON.parse(payload.slice(6).trim())) }
  return { events, res }
}
test('SSE requires authenticated branch for staff and blocks unscopeable role events', () => {
  sseClients.clear()
  const a = mockConnection(), b = mockConnection(), superuser = mockConnection()
  assert.throws(() => registerClient('staff', 10, a.res), /branch required/i)
  const unregister = [registerClient('staff', 10, a.res, {branchId:1}), registerClient('staff', 20, b.res, {branchId:2}), registerClient('superadmin', 1, superuser.res)]
  assert.equal(broadcast(['staff'], 'billing_paid', {billingId:77}), 0)
  assert.equal(a.events.length, 0)
  assert.equal(broadcast(['staff'], 'billing_paid', {billingId:77}, {branchId:1}), 2)
  assert.equal(a.events.length, 1)
  assert.equal(b.events.length, 0)
  assert.equal(superuser.events.length, 1)
  assert.equal(broadcast(['staff'], 'queue_updated', {queueId:8}, {branchId:2}), 2)
  assert.equal(a.events.length, 1)
  assert.equal(b.events.length, 1)
  unregister.forEach(unregister => unregister())
  assert.equal(sseClients.size, 0)
})

test('SSE doctor-specific events cannot cross branches after reassignment', () => {
  sseClients.clear()
  const former = mockConnection(), current = mockConnection()
  const oldClose = registerClient('doctor', 44, former.res, {branchId:1})
  const newClose = registerClient('doctor', 44, current.res, {branchId:2})
  assert.equal(broadcast(['doctor_44'], 'consultation_saved', {appointmentId:17}), 0)
  assert.equal(broadcast(['doctor_44'], 'consultation_saved', {appointmentId:17}, {branchId:1}), 1)
  assert.equal(former.events.length,1)
  assert.equal(current.events.length,0)
  assert.equal(broadcast(['doctor_44'], 'consultation_saved', {appointmentId:18}, {branchId:2}), 1)
  assert.equal(current.events.length,1)
  oldClose();newClose()
})

test('SSE patient messages target only that patient', () => {
  sseClients.clear()
  const p1 = mockConnection(), p2 = mockConnection()
  const unsub1 = registerClient('patient', 9, p1.res)
  const unsub2 = registerClient('patient', 10, p2.res)
  broadcast(['patient_9', 'patient'], 'appointment_updated', { appointmentId:33 })
  assert.equal(p1.events.length, 1)
  assert.equal(p2.events.length, 0)
  unsub1(); unsub2()
})

test('branch receipt sequencing reads the authenticated branch and cannot silently default to branch 1', async () => {
  const calls = [], numbers = new Map([[1, 11], [2, 20]])
  const exec = {query: async(sql,args) => {
    calls.push({sql,args})
    if (sql.startsWith('SELECT code')) return [[{code:args[0] === 1 ? 'LAGUNA' : 'MANILA'}]]
    if (sql.startsWith('UPDATE branch_receipt')) { const n=numbers.get(args[0])+1;numbers.set(args[0],n);return [{insertId:n}] }
    return [{}]
  }}
  await assert.rejects(allocateReceiptNumber(exec), /Verified billing branch required/)
  assert.equal(calls.length, 0)
  const a = await allocateReceiptNumber(exec,1,new Date('2026-10-15T06:00:00Z'))
  const b = await allocateReceiptNumber(exec,2,new Date('2026-10-15T06:00:00Z'))
  assert.equal(a.receiptNumber, 'OR-LAGUNA-20261015-000012')
  assert.equal(b.receiptNumber, 'OR-MANILA-20261015-000021')
  assert.ok(calls.every(({sql})=>!sql.includes('UPDATE billing_receipt_sequence')))
})

test('barcode sequencing is separated by both branch and category', async () => {
  const calls = [], counters = new Map()
  const exec = {query:async(sql,args) => {
    calls.push({sql,args})
    if(sql.startsWith('SELECT code'))return [[{code:args[0]===2?'MNL':'LAG'}]]
    if(sql.startsWith('UPDATE inventory_barcode_sequences')){
      const key=`${args[0]}_${args[1]}`, n=(counters.get(key)||0)+1;counters.set(key,n);return [{insertId:n}]
    }
    return [{}]
  }}
  await assert.rejects(nextInventoryBarcode('medical',null,exec), /verified branch/i)
  const a=await nextInventoryBarcode('medical',1,exec)
  const b=await nextInventoryBarcode('medical',2,exec)
  const c=await nextInventoryBarcode('derma',1,exec)
  assert.deepEqual([a,b,c],['GMED-LAG-00001','GMED-MNL-00001','DRM-LAG-00001'])
  assert.ok(calls.filter(x=>x.sql.includes('UPDATE inventory_barcode_sequences')).every(x=>x.sql.includes('branch_id=?')))
})

test('existing foundation cannot be marked applied when an ownership column is missing', async () => {
  const columns=requiredFoundationColumns(migrationSource)
  assert.ok(columns.length>=24)
  const fixture=createFoundationSchemaFixture({omitColumns:['queue.branch_id']})
  await assert.rejects(verifyFoundationSchema(fixture.db,migrationSource),/missing or incompatible columns: .*queue\.branch_id \(missing\)/)
  assert.ok(fixture.commands.some(query=>query.includes('information_schema.COLUMNS')))
})

test('foreign branch queue IDs return 404 before any write', async () => {
  const file=require.resolve('../../utils/queueWorkflow')
  const originalLoad=Module._load
  const operations=[]
  const conn={
    beginTransaction:async()=>operations.push('BEGIN'),
    rollback:async()=>operations.push('ROLLBACK'),
    commit:async()=>operations.push('COMMIT'),
    release:()=>operations.push('RELEASE'),
    query:async(sql,args)=>{
      if (sql.includes('FROM queue q')) { assert.match(sql,/q.branch_id = \?/);assert.deepEqual(args,[202,1]);return [[]] }
      operations.push(sql)
      throw new Error('unexpected write or audit')
    },
  }
  const fakeDb={getConnection:async()=>conn}
  Module._load=function(request,parent,isMain){
    if (parent?.filename===file && request==='../db/connect') return fakeDb
    if (parent?.filename===file && request==='./notifications') return {createNotification:async()=>{}}
    if (parent?.filename===file && request==='./audit') return {writeAuditLog:async()=>{}}
    return originalLoad.apply(this,arguments)
  }
  let workflow
  try { delete require.cache[file];workflow=require(file) } finally { Module._load=originalLoad }
  await assert.rejects(workflow.setQueueState({queueId:202,nextStatus:'called',actorRole:'staff',actorId:4,branchId:1}),error=>error.statusCode===404)
  assert.deepEqual(operations,['BEGIN','ROLLBACK','RELEASE'])
  await assert.rejects(workflow.setQueueState({queueId:202,nextStatus:'called',actorRole:'staff',actorId:4}),error=>error.statusCode===403)
})
