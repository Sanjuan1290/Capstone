'use strict'

const test = require('node:test')
const assert = require('node:assert/strict')
const { backfillUomDecimalPrecision, rebuildInventoryLocationStock } = require('../../utils/schema')

test('UOM precision bootstrap only fills missing legacy defaults', async () => {
  let statement
  await backfillUomDecimalPrecision({ query: async (sql) => { statement = sql } })
  assert.match(statement, /WHERE allow_decimal_quantity=1 AND \(decimal_precision IS NULL OR decimal_precision=0\)/)
  assert.doesNotMatch(statement, /SET decimal_precision\s*=\s*CASE/i)
})

test('stock summary rebuild commits the delete and insert together', async () => {
  const calls = []
  const connection = {
    beginTransaction: async () => calls.push('begin'),
    query: async (sql) => { calls.push(sql.trim().startsWith('DELETE') ? 'delete' : 'insert') },
    commit: async () => calls.push('commit'),
    rollback: async () => calls.push('rollback'),
    release: () => calls.push('release'),
  }
  await rebuildInventoryLocationStock({ getConnection: async () => connection })
  assert.deepEqual(calls, ['begin', 'delete', 'insert', 'commit', 'release'])
})

test('failed stock summary rebuild rolls back before releasing its connection', async () => {
  const calls = []
  const connection = {
    beginTransaction: async () => calls.push('begin'),
    query: async (sql) => {
      calls.push(sql.trim().startsWith('DELETE') ? 'delete' : 'insert')
      if (sql.trim().startsWith('INSERT')) throw new Error('synthetic insert failure')
    },
    commit: async () => calls.push('commit'),
    rollback: async () => calls.push('rollback'),
    release: () => calls.push('release'),
  }
  await assert.rejects(rebuildInventoryLocationStock({ getConnection: async () => connection }), /synthetic insert failure/)
  assert.deepEqual(calls, ['begin', 'delete', 'insert', 'rollback', 'release'])
})

