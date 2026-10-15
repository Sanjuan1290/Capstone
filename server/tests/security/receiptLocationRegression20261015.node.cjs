// Runtime regression tests for two historical Vitest failures. These checks avoid
// brittle matching of SQL whitespace or obsolete stockroom-creation options.
const test = require('node:test')
const assert = require('node:assert/strict')
const { allocateReceiptNumber } = require('../../utils/payments')
// The dependency-free Node suite uses injected SQL executors. Stub only the
// unused global pool during module loading, so mysql2 is not required here.
const Module = require('node:module')
const originalLoad = Module._load
let resolveLocation
try {
  Module._load = function (request, parent, isMain) {
    if (request === '../db/connect' && /[/\\]utils[/\\]/.test(parent?.filename || '')) return { query: async () => { throw Error('Unexpected global database query') } }
    return originalLoad.call(this, request, parent, isMain)
  }
  ;({ resolveLocation } = require('../../utils/inventoryBatches'))
} finally {
  Module._load = originalLoad
}

const BRANCH_SEQUENCE_UPDATE = /UPDATE\s+branch_receipt_sequences\s+SET\s+last_number\s*=\s*LAST_INSERT_ID\s*\(\s*last_number\s*\+\s*1\s*\)\s+WHERE\s+branch_id\s*=\s*\?/i

test('receipt allocation uses an atomic branch-specific sequence and branch-coded number', async () => {
  const calls = []
  const executor = { query: async (sql, params) => {
    calls.push({ sql, params })
    if (/^SELECT\b/i.test(sql)) return [[{ code: 'LAG' }]]
    if (/^UPDATE\b/i.test(sql)) return [{ insertId: 15 }]
    return [{}]
  } }
  const result = await allocateReceiptNumber(executor, 1, new Date('2026-10-04T02:00:00.000Z'))
  assert.deepEqual(result, { sequence: 15, receiptNumber: 'OR-LAG-20261004-000015' })
  assert.ok(calls.some(({ sql, params }) => BRANCH_SEQUENCE_UPDATE.test(sql) && params[0] === 1), 'atomic counter must be updated for verified branch only')
  assert.ok(calls.some(({ sql, params }) => /INSERT\s+IGNORE\s+INTO\s+branch_receipt_sequences/i.test(sql) && params[0] === 1))
})

test('receipt allocation rejects missing branch context without touching the database', async () => {
  const executor = { query: async () => { throw Error('database should not be queried') } }
  await assert.rejects(() => allocateReceiptNumber(executor, undefined), { code: 'BRANCH_REQUIRED' })
  await assert.rejects(() => allocateReceiptNumber(executor, 0), { code: 'BRANCH_REQUIRED' })
})

test('renamed Main Stockroom resolves through its role in the verified branch; no auto-create', async () => {
  const calls = []
  const executor = { query: async (sql, params) => {
    calls.push({ sql, params })
    if (/is_main_stockroom\s*=\s*1/i.test(sql)) return [[{ id: 73, name: 'Central Stockroom', location_type: 'stockroom' }]]
    throw Error('Unexpected SQL: ' + sql)
  } }
  const location = await resolveLocation('Main Stockroom', executor, { branchId: 2 })
  assert.deepEqual(location, { id: 73, name: 'Central Stockroom' })
  assert.equal(calls.length, 1)
  assert.match(calls[0].sql, /branch_id\s*=\s*\?/i)
  assert.deepEqual(calls[0].params, [2])
  assert.ok(calls.every(({ sql }) => /^\s*SELECT\b/i.test(sql)))
})

test('missing or foreign locations are not created or accepted', async () => {
  const calls = []
  const executor = { query: async (sql, params) => {
    calls.push({ sql, params })
    return [[]]
  } }
  const result = await resolveLocation('Storage Room B', executor, { branchId: 2 })
  assert.equal(result, null)
  assert.deepEqual(calls.map(({ params }) => params), [['Storage Room B', 2]])
  assert.match(calls[0].sql, /branch_id\s*=\s*\?/i)
  assert.ok(calls.every(({ sql }) => /^\s*SELECT\b/i.test(sql)))
  await assert.rejects(() => resolveLocation('Main Stockroom', executor), { code: 'BRANCH_CONTEXT_REQUIRED' })
})
