'use strict'

const test = require('node:test')
const assert = require('node:assert/strict')
const crypto = require('node:crypto')
const fs = require('node:fs')
const path = require('node:path')
const { runBranchMigrations, migrationFiles } = require('../../scripts/branchMigrations')
const { createFoundationSchemaFixture } = require('../helpers/foundationSchemaFixture.cjs')

const migrationDir = path.resolve(__dirname, '../../db/migrations')
const expectedChecksums = {
  '2026-10-09-multi-branch-foundation.sql': '9d9e934fc19761d7c921620b81735bf4db8eb15446e70023ac6fab4abbafad49',
  '2026-10-15-branch-ledgers.sql': 'd89c9605f8a53fb1fc00f799cbfef8879e8b61071dc829ec6a61307d0dbc0fa2',
  '2026-10-15-cashier-branch-uniqueness.sql': 'a150c92079c937807dae34c279516a8b07da44fa5e779e5ed1a558bdb2376ba6',
  '2026-10-16-paymongo-test-qr.sql': '3d3f041959d31483b2aa0152a9b1cad3a43963049a3fefed4d2097a666b76d50',
  '2026-10-17-announcements-campaigns.sql': '93dcfbf49ecbe7b68e22eb99fe6ffe55885c01c3b3e3db0007ce24dc2ef772fa',
}

function createMockDb({ failOnceOn, foundationOptions } = {}) {
  const foundation = createFoundationSchemaFixture(foundationOptions)
  const applied = new Map()
  const commands = []
  let failure = failOnceOn
  let lockHeld = false
  const lockWaiters = []
  const acquireLock = async () => {
    if (!lockHeld) { lockHeld = true; return }
    await new Promise(resolve => lockWaiters.push(resolve))
  }
  const releaseLock = () => {
    const next = lockWaiters.shift()
    if (next) next()
    else lockHeld = false
  }
  const connection = () => {
    let holdsLock = false
    return {
      async beginTransaction() {},
      async query(sql, params = []) {
        commands.push(String(sql))
        const fixtureResult = await foundation.db.query(sql, params)
        if (/SELECT\s+lock_name.+FOR UPDATE/i.test(sql)) {
          await acquireLock()
          holdsLock = true
          return [[{ lock_name: params[0] }]]
        }
        if (failure && String(sql).includes(failure)) {
          failure = null
          throw new Error('synthetic migration DDL failure')
        }
        if (/^INSERT INTO schema_migrations/i.test(String(sql))) {
          applied.set(params[0], params[1])
          return [{ affectedRows: 1 }]
        }
        return fixtureResult
      },
      async commit() { if (holdsLock) { holdsLock = false; releaseLock() } },
      async rollback() { if (holdsLock) { holdsLock = false; releaseLock() } },
      release() {},
    }
  }
  return {
    applied,
    commands,
    async query(sql, params = []) {
      commands.push(String(sql))
      if (/SELECT content_sha256 FROM schema_migrations/i.test(sql)) {
        const hash = applied.get(params[0])
        return hash ? [[{ content_sha256: hash }]] : [[]]
      }
      return foundation.db.query(sql, params)
    },
    async getConnection() { return connection() },
  }
}

test('registered historical migration SQL still matches its pinned normalized SHA-256 checksums', () => {
  assert.deepEqual(migrationFiles, Object.keys(expectedChecksums))
  for (const [file, expected] of Object.entries(expectedChecksums)) {
    const sql = fs.readFileSync(path.join(migrationDir, file), 'utf8').replace(/\r\n/g, '\n').replace(/\r/g, '\n')
    const actual = crypto.createHash('sha256').update(sql).digest('hex')
    assert.equal(actual, expected, `${file} changed; create a new migration instead of editing history`)
  }
})

test('migration runner preserves registration order and skips already applied migrations', async () => {
  const db = createMockDb()
  const previousProvider = process.env.DB_PROVIDER
  process.env.DB_PROVIDER = 'tidb'
  try {
    await runBranchMigrations(db)
    assert.deepEqual([...db.applied.keys()], migrationFiles)
    const firstRunDdlCount = db.commands.filter(sql => sql.includes('CREATE TABLE IF NOT EXISTS clinic_branches')).length
    assert.equal(firstRunDdlCount, 1)
    await runBranchMigrations(db)
    assert.equal(db.commands.filter(sql => sql.includes('CREATE TABLE IF NOT EXISTS clinic_branches')).length, firstRunDdlCount)
  } finally {
    if (previousProvider === undefined) delete process.env.DB_PROVIDER
    else process.env.DB_PROVIDER = previousProvider
  }
})

test('failed migration is not recorded and an idempotent retry completes it', async () => {
  const db = createMockDb({ failOnceOn: 'CREATE TABLE IF NOT EXISTS branch_receipt_sequences' })
  const previousProvider = process.env.DB_PROVIDER
  process.env.DB_PROVIDER = 'tidb'
  try {
    await assert.rejects(runBranchMigrations(db), /synthetic migration DDL failure/)
    assert.equal(db.applied.has('2026-10-09-multi-branch-foundation.sql'), true)
    assert.equal(db.applied.has('2026-10-15-branch-ledgers.sql'), false)
    await runBranchMigrations(db)
    assert.deepEqual([...db.applied.keys()], migrationFiles)
  } finally {
    if (previousProvider === undefined) delete process.env.DB_PROVIDER
    else process.env.DB_PROVIDER = previousProvider
  }
})

test('incomplete foundation constraints are never recorded as an applied migration', async () => {
  const db = createMockDb({ foundationOptions: { omitForeignKeys: ['branch_booking_settings.branch_id'] } })
  const previousProvider = process.env.DB_PROVIDER
  process.env.DB_PROVIDER = 'tidb'
  try {
    await assert.rejects(
      runBranchMigrations(db),
      /missing or incompatible foreign keys: branch_booking_settings\.branch_id -> clinic_branches\.id/,
    )
    assert.equal(db.applied.has(migrationFiles[0]), false)
  } finally {
    if (previousProvider === undefined) delete process.env.DB_PROVIDER
    else process.env.DB_PROVIDER = previousProvider
  }
})

test('concurrent migration invocations serialize through the database lock row', async () => {
  const db = createMockDb()
  const previousProvider = process.env.DB_PROVIDER
  process.env.DB_PROVIDER = 'tidb'
  try {
    await Promise.all([runBranchMigrations(db), runBranchMigrations(db)])
    assert.deepEqual([...db.applied.keys()], migrationFiles)
    assert.equal(db.commands.filter(sql => sql.includes('CREATE TABLE IF NOT EXISTS clinic_branches')).length, 1)
  } finally {
    if (previousProvider === undefined) delete process.env.DB_PROVIDER
    else process.env.DB_PROVIDER = previousProvider
  }
})

