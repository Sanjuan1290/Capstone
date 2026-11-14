'use strict'

const test = require('node:test')
const assert = require('node:assert/strict')
const crypto = require('node:crypto')
const fs = require('node:fs')
const path = require('node:path')
const { runBranchMigrations, migrationFiles, acceptedContentHashes } = require('../../scripts/branchMigrations')
const batch4MigrationFile = '2026-10-26-batch4-selected-promotion.sql'
const { createFoundationSchemaFixture } = require('../helpers/foundationSchemaFixture.cjs')

const migrationDir = path.resolve(__dirname, '../../db/migrations')
const expectedChecksums = {
  '2026-10-09-multi-branch-foundation.sql': '8df683ad4f37373edae55b7981b00d0d3be7b62023d1d58ea545b70b9ff7a141',
  '2026-10-15-branch-ledgers.sql': 'd89c9605f8a53fb1fc00f799cbfef8879e8b61071dc829ec6a61307d0dbc0fa2',
  '2026-10-15-cashier-branch-uniqueness.sql': 'a150c92079c937807dae34c279516a8b07da44fa5e779e5ed1a558bdb2376ba6',
  '2026-10-16-paymongo-test-qr.sql': '9b2b7a0e64d79283c5bc63756407f90f29bb41d6eb311874c2689216d5d58c36',
  '2026-10-17-announcements-campaigns.sql': '2e77353a3bebe9ef270f50bbc0555fcab03aa805fa7f4fd9376b272e4bbecac3',
}

const promotionColumns = {
  appointments: [
    ['promotion_id','int'], ['promotion_title_snapshot','varchar',120],
    ['promotion_terms_snapshot','varchar',1000], ['promotion_badge_snapshot','varchar',48],
    ['promotion_starts_on_snapshot','date'], ['promotion_ends_on_snapshot','date'],
    ['promotion_selected_for_service_id','int'], ['promotion_selected_at','datetime'],
  ],
  billing_records: [
    ['promotion_review_outcome','varchar',40], ['promotion_review_note','varchar',255],
    ['promotion_review_by_role','varchar',20], ['promotion_review_by_user_id','int'],
    ['promotion_reviewed_bill_version','int'], ['promotion_reviewed_at','datetime'],
  ],
}

function createMockDb({ failOnceOn, foundationOptions, initialPromotionState, initialPromotionIndex, initialPromotionFk, initialReversalColumns, initialDoctorFee, initialStatutoryCategory } = {}) {
  const foundation = createFoundationSchemaFixture(foundationOptions)
  const queueSchema = require('../helpers/queueSchemaFixture.cjs').queueSchemaFixture()
  const applied = new Map()
  const commands = []
  const actorColumns = new Map([['inventory_excel_uploads.created_by_admin_id',{COLUMN_TYPE:'int',IS_NULLABLE:'NO'}]])
  const movementColumns = new Map()
  const reversalColumns = new Map(Object.entries(initialReversalColumns || {}))
  const feeColumns = new Map(initialDoctorFee ? [['doctor_fee_percentage', initialDoctorFee]] : [])
  const statutoryColumns = new Map(initialStatutoryCategory ? [['statutory_category',initialStatutoryCategory]] : [])
  const reversalMetadata = (sql, params) => {
    if (/information_schema\.COLUMNS/i.test(sql) && params?.[0] === 'discount_presets' && params[1] === 'statutory_category') return [statutoryColumns.has(params[1]) ? [statutoryColumns.get(params[1])] : []]
    if (/information_schema\.COLUMNS/i.test(sql) && params?.[0] === 'billing_service_catalog' && params[1] === 'doctor_fee_percentage') return [feeColumns.has(params[1]) ? [feeColumns.get(params[1])] : []]
    if (/information_schema\.COLUMNS/i.test(sql) && ['inventory_excel_uploads','inventory_excel_receipts'].includes(params?.[0])) {const row=actorColumns.get(params[0]+'.'+params[1]);return [row?[row]:[]]}
    if (/information_schema\.COLUMNS/i.test(sql) && params?.[0] === 'inventory_logs' && ['quantity_before','quantity_after'].includes(params[1])) return [movementColumns.has(params[1]) ? [movementColumns.get(params[1])] : []]
    if (!/information_schema\.COLUMNS/i.test(sql) || params?.[0] !== 'billing_charge_adjustments') return null
    const existing = reversalColumns.get(params[1])
    return [existing ? [existing] : []]
  }
  const promotionState = {
    appointments: false,
    billing_records: false,
    ...(initialPromotionState || {}),
  }
  let promotionIndex = initialPromotionIndex ?? initialPromotionState?.appointments === true
  let promotionFk = initialPromotionFk ?? initialPromotionState?.appointments === true
  const promotionMetadata = (sql, params) => {
    const table = params?.[0]
    // Existing eligibility fields are independent of the older Batch 4 columns.
    // A single-column lookup must not receive the entire Batch 4 metadata list.
    if (/information_schema\.COLUMNS/i.test(sql) &&
        ((table === 'clinic_promotions' && params[1] === 'eligibility_type') ||
         (table === 'appointments' && params[1] === 'promotion_eligibility_snapshot'))) {
      return [[{ COLUMN_TYPE: 'varchar(24)', IS_NULLABLE: 'NO', COLUMN_DEFAULT: 'all' }]]
    }
    if (!['appointments', 'billing_records'].includes(table) || !/TABLE_NAME=\?/i.test(sql)) return null
    if (/information_schema\.COLUMNS/i.test(sql)) {
      return [promotionState[table] ? promotionColumns[table].filter(([name], index) => promotionState[table] !== 'partial' || index === 0).map(([COLUMN_NAME, DATA_TYPE, CHARACTER_MAXIMUM_LENGTH]) => ({
        COLUMN_NAME, DATA_TYPE, CHARACTER_MAXIMUM_LENGTH: CHARACTER_MAXIMUM_LENGTH ?? null,
        IS_NULLABLE: 'YES',
      })) : [], []]
    }
    if (/information_schema\.STATISTICS/i.test(sql)) return [promotionIndex ? [
      { INDEX_NAME: 'idx_appointments_selected_promotion', NON_UNIQUE: 1, SEQ_IN_INDEX: 1, COLUMN_NAME: 'branch_id' },
      { INDEX_NAME: 'idx_appointments_selected_promotion', NON_UNIQUE: 1, SEQ_IN_INDEX: 2, COLUMN_NAME: 'promotion_id' },
    ] : [], []]
    if (/information_schema\.KEY_COLUMN_USAGE/i.test(sql)) return [promotionFk ? [
      { CONSTRAINT_NAME: 'fk_appointments_selected_promotion', COLUMN_NAME: 'promotion_id', REFERENCED_TABLE_NAME: 'clinic_promotions', REFERENCED_COLUMN_NAME: 'id', DELETE_RULE: 'SET NULL' },
    ] : [], []]
    return null
  }
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
        const fixtureResult = (sql === 'SHOW INDEX FROM queue' ? await queueSchema.query(sql) : null) || reversalMetadata(sql, params) || promotionMetadata(sql, params) || await foundation.db.query(sql, params)
        if (/SELECT\s+lock_name.+FOR UPDATE/i.test(sql)) {
          await acquireLock()
          holdsLock = true
          return [[{ lock_name: params[0] }]]
        }
        if (failure && String(sql).includes(failure)) {
          failure = null
          throw new Error('synthetic migration DDL failure')
        }
        if (/^ALTER TABLE queue (ADD|DROP)/.test(sql)) return queueSchema.query(sql)
        if (/^ALTER TABLE appointments\s/i.test(String(sql))) {
          assert.ok(!(/ADD COLUMN/i.test(sql) && /ADD (INDEX|CONSTRAINT)/i.test(sql)), 'TiDB must never receive combined promotion column/index/FK DDL')
          if (/ADD COLUMN/i.test(sql)) promotionState.appointments = true
          if (/ADD INDEX/i.test(sql)) { assert.equal(promotionState.appointments, true); promotionIndex = true }
          if (/ADD CONSTRAINT/i.test(sql)) { assert.equal(promotionState.appointments, true); promotionFk = true }
        }
        if (/^ALTER TABLE billing_records\s/i.test(String(sql))) promotionState.billing_records = true
        if (sql === 'ALTER TABLE billing_service_catalog ADD COLUMN doctor_fee_percentage DECIMAL(5,2) NOT NULL DEFAULT 0') {
          assert.equal(feeColumns.size, 0, 'Never re-add an existing fee column')
          feeColumns.set('doctor_fee_percentage', {COLUMN_TYPE:'decimal(5,2)',IS_NULLABLE:'NO',COLUMN_DEFAULT:'0.00'})
        }
        if(sql === "ALTER TABLE discount_presets ADD COLUMN statutory_category VARCHAR(12) NOT NULL DEFAULT 'other'"){
          assert.equal(statutoryColumns.size,0,'Never re-add the existing category column')
          statutoryColumns.set('statutory_category',{COLUMN_TYPE:'varchar(12)',IS_NULLABLE:'NO',COLUMN_DEFAULT:'other'})
        }
        const actorDdl = /^ALTER TABLE (inventory_excel_uploads|inventory_excel_receipts) (?:ADD|MODIFY) COLUMN ([a-z_]+) INT NULL$/i.exec(sql)
        if(actorDdl)actorColumns.set(actorDdl[1]+'.'+actorDdl[2],{COLUMN_TYPE:'int',IS_NULLABLE:'YES'})
        const movementColumn = /^ALTER TABLE inventory_logs ADD COLUMN (quantity_before|quantity_after) DECIMAL\(12,2\) NULL$/i.exec(sql)
        if (movementColumn) {assert.equal(movementColumns.has(movementColumn[1]), false);movementColumns.set(movementColumn[1], { COLUMN_TYPE: 'decimal(12,2)', IS_NULLABLE: 'YES' })}
        const reversalColumn = /^ALTER TABLE billing_charge_adjustments ADD COLUMN (reversed_at|reversed_by_admin_id|reversal_reason) (DATETIME|INT|VARCHAR\(255\)) NULL$/i.exec(String(sql))
        if (reversalColumn) {
          assert.equal(reversalColumns.has(reversalColumn[1]), false, 'An existing reversal column must never be added again')
          reversalColumns.set(reversalColumn[1], { COLUMN_TYPE: reversalColumn[2].toLowerCase(), IS_NULLABLE: 'YES' })
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
    promotionState,
    feeColumns,
    statutoryColumns,
    async query(sql, params = []) {
      commands.push(String(sql))
      if (/SELECT content_sha256 FROM schema_migrations/i.test(sql)) {
        const hash = applied.get(params[0])
        return hash ? [[{ content_sha256: hash }]] : [[]]
      }
      return (await queueSchema.query(sql)) || reversalMetadata(sql, params) || promotionMetadata(sql, params) || foundation.db.query(sql, params)
    },
    async getConnection() { return connection() },
  }
}

test('current checked-in migration SQL matches pinned SHA-256 checksums', () => {
  assert.deepEqual(migrationFiles.slice(0, Object.keys(expectedChecksums).length), Object.keys(expectedChecksums))
  assert.ok(migrationFiles.indexOf(batch4MigrationFile) >= 0)
  assert.ok(migrationFiles.indexOf(batch4MigrationFile) < migrationFiles.indexOf('2026-11-02-consultation-charge-adjustments.sql'))
  assert.deepEqual(migrationFiles.slice(-4),['2026-11-14-consultation-followups.sql','2026-11-14-billing-financial-snapshots.sql','2026-11-14-branch-tax-policy.sql','2026-11-14-simplify-tax-settings.sql'])
  const historicalTail = ['2026-11-05-promotion-pricing.sql', '2026-11-05-billing-failure-history.sql', '2026-11-09-superadmin-patient-directory-ban.sql', '2026-11-09-branch-google-maps-url.sql', '2026-11-11-charge-reduction-reversal.sql']
  assert.deepEqual(migrationFiles.filter(file => historicalTail.includes(file)), historicalTail)
  const historicalFiles=migrationFiles.filter(file=>!file.startsWith('2026-11-14-'))
  assert.equal(historicalFiles.at(-5), '2026-11-12-daily-stock-alerts.sql')
  assert.equal(historicalFiles.at(-4), '2026-11-12-queue-daily-department-numbers.sql')
  assert.equal(historicalFiles.at(-3), '2026-11-13-inventory-movement-balances.sql')
  assert.deepEqual(historicalFiles.slice(-2),['2026-11-13-walk-in-queue-permission.sql','2026-11-13-shared-operation-actors.sql'])
  assert.equal(crypto.createHash('sha256').update(fs.readFileSync(path.join(migrationDir, '2026-11-13-walk-in-queue-permission.sql'), 'utf8').replace(/\r\n/g, '\n')).digest('hex'), '11bbdf535ae59f471e254f9cdb7b7dcb4665801c52ec12db53736d67e5dc6cea')
  assert.equal(crypto.createHash('sha256').update(fs.readFileSync(path.join(migrationDir, '2026-11-13-shared-operation-actors.sql'), 'utf8').replace(/\r\n/g, '\n')).digest('hex'), '308efbaeabf56521eab08997ecf2347c3aaffeb6c9b9f88f93acab69381be738')
  const balanceSql = fs.readFileSync(path.join(migrationDir, '2026-11-13-inventory-movement-balances.sql'), 'utf8').replace(/\r\n/g, '\n')
  assert.equal(crypto.createHash('sha256').update(balanceSql).digest('hex'), '424fe528d3718b2e90e65b63133b34f7f8375fbe0c7f5168d8c52c14db089732')
  const queueSql = fs.readFileSync(path.join(migrationDir, '2026-11-12-queue-daily-department-numbers.sql'), 'utf8').replace(/\r\n/g, '\n')
  assert.equal(crypto.createHash('sha256').update(queueSql).digest('hex'), '37b80754a001d8fd32de0c45e9b430a2ab3eb90fcb462b4849c94ffb8f120005')
  const stockSql = fs.readFileSync(path.join(migrationDir, '2026-11-12-daily-stock-alerts.sql'), 'utf8').replace(/\r\n/g, '\n')
  assert.ok(acceptedContentHashes(stockSql).has('ea98f27b46b6d4cbda33c50674ab7965fd31e4cb2abdb19bbbe54cea7ea35f81'))
  const failureSql = fs.readFileSync(path.join(migrationDir, '2026-11-05-billing-failure-history.sql'), 'utf8').replace(/\r\n/g, '\n').replace(/\r/g, '\n')
  assert.equal(crypto.createHash('sha256').update(failureSql).digest('hex'), 'ca694239471fcc47f20c1ad93b96216e0eb1d0fe825cb3c61fe4e65568abe675')
  for (const file of migrationFiles) assert.ok(fs.existsSync(path.join(migrationDir, file)), `Registered migration missing: ${file}`)
  for (const [file, expected] of Object.entries(expectedChecksums)) {
    const sql = fs.readFileSync(path.join(migrationDir, file), 'utf8').replace(/\r\n/g, '\n').replace(/\r/g, '\n')
    assert.ok(acceptedContentHashes(sql).has(expected), `${file} changed; create a new migration instead of editing history`)
  }
})

test('manually added reversal columns are verified without repeated ALTER or migration-history deletion', async () => {
  const db = createMockDb({ initialReversalColumns: {
    reversed_at: { COLUMN_TYPE: 'datetime', IS_NULLABLE: 'YES' },
    reversed_by_admin_id: { COLUMN_TYPE: 'int(11)', IS_NULLABLE: 'YES' },
    reversal_reason: { COLUMN_TYPE: 'varchar(255)', IS_NULLABLE: 'YES' },
  } })
  await runBranchMigrations(db)
  assert.ok(db.applied.has('2026-11-11-charge-reduction-reversal.sql'))
  assert.equal(db.commands.filter(sql => /^ALTER TABLE billing_charge_adjustments ADD COLUMN (reversed_at|reversed_by_admin_id|reversal_reason)\b/i.test(sql)).length, 0)
  const history = [...db.applied]
  await runBranchMigrations(db)
  assert.deepEqual([...db.applied], history)
  assert.equal(db.commands.filter(sql => /(?:DELETE\s+FROM|TRUNCATE\s+TABLE|DROP\s+TABLE)\s+schema_migrations\b/i.test(sql)).length, 0)
})

test('reversal migration resumes missing fields while retaining manually added fields', async () => {
  const db = createMockDb({ initialReversalColumns: { reversed_at: { COLUMN_TYPE: 'datetime', IS_NULLABLE: 'YES' } } })
  await runBranchMigrations(db)
  const statements = db.commands.filter(sql => /^ALTER TABLE billing_charge_adjustments ADD COLUMN (reversed_at|reversed_by_admin_id|reversal_reason)\b/i.test(sql))
  assert.equal(statements.length, 2)
  assert.ok(statements.every(sql => !/ADD COLUMN reversed_at\b/i.test(sql)))
  assert.ok(db.applied.has('2026-11-11-charge-reduction-reversal.sql'))
})

test('incompatible manually added reversal fields stop verification without rewriting the schema', async () => {
  for (const incompatible of [{ COLUMN_TYPE: 'varchar(128)', IS_NULLABLE: 'YES' }, { COLUMN_TYPE: 'varchar(255)', IS_NULLABLE: 'NO' }]) {
    const db = createMockDb({ initialReversalColumns: {
      reversed_at: { COLUMN_TYPE: 'datetime', IS_NULLABLE: 'YES' },
      reversed_by_admin_id: { COLUMN_TYPE: 'int', IS_NULLABLE: 'YES' },
      reversal_reason: incompatible,
    } })
    await assert.rejects(runBranchMigrations(db), /Incompatible reversal column: reversal_reason/)
    assert.equal(db.applied.has('2026-11-11-charge-reduction-reversal.sql'), false)
    assert.ok(db.applied.has('2026-11-09-branch-google-maps-url.sql'))
    assert.equal(db.commands.filter(sql => /^ALTER TABLE billing_charge_adjustments\b/i.test(sql)).length, 0)
  }
})

test('pinned hashes allow line endings and final newlines but reject substantive SQL changes', () => {
  const canonical='SELECT 1;\n'
  const expected=crypto.createHash('sha256').update(canonical).digest('hex')
  for(const source of ['SELECT 1;','SELECT 1;\r\n','SELECT 1;\n\n'])assert.ok(acceptedContentHashes(source).has(expected))
  assert.equal(acceptedContentHashes('SELECT 2;\n').has(expected),false)
  assert.equal(acceptedContentHashes('SELECT 1;\nALTER TABLE patients DROP COLUMN email;\n').has(expected),false)
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

test('daily stock ledger resumes a failed CREATE and clean reruns keep historical checksums intact', async () => {
  const file = '2026-11-12-daily-stock-alerts.sql'
  const db = createMockDb({ failOnceOn: 'CREATE TABLE IF NOT EXISTS inventory_daily_alert_deliveries' })
  await assert.rejects(runBranchMigrations(db), /synthetic migration DDL failure/)
  assert.equal(db.applied.has(file), false)
  const historical = [...db.applied.entries()]
  await runBranchMigrations(db)
  assert.equal(db.applied.has(file), true)
  assert.deepEqual([...db.applied.entries()].filter(([name]) => historical.some(([oldName]) => oldName === name)), historical)
  const attempts = db.commands.filter(sql => sql.includes('CREATE TABLE IF NOT EXISTS inventory_daily_alert_deliveries')).length
  assert.equal(attempts, 2)
  await runBranchMigrations(db)
  assert.equal(db.commands.filter(sql => sql.includes('CREATE TABLE IF NOT EXISTS inventory_daily_alert_deliveries')).length, attempts)
  assert.ok(!db.commands.some(sql => /DELETE FROM schema_migrations|TRUNCATE/i.test(sql)))
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


test('Batch 4 registration is additive, ordered, and does not repeat DDL on a clean rerun', async () => {
  const db = createMockDb()
  await runBranchMigrations(db)
  assert.equal(db.promotionState.appointments, true)
  assert.equal(db.promotionState.billing_records, true)
  assert.deepEqual([...db.applied.keys()], migrationFiles)
  const ddlCount = db.commands.filter(sql => /^ALTER TABLE (appointments|billing_records)\s/i.test(sql)).length
  assert.equal(ddlCount, 4)
  await runBranchMigrations(db)
  assert.equal(db.commands.filter(sql => /^ALTER TABLE (appointments|billing_records)\s/i.test(sql)).length, ddlCount)
})

test('Batch 4 resumes after the first ALTER committed but the second failed', async () => {
  const db = createMockDb({ failOnceOn: 'ALTER TABLE billing_records' })
  await assert.rejects(runBranchMigrations(db), /synthetic migration DDL failure/)
  assert.equal(db.promotionState.appointments, true)
  assert.equal(db.promotionState.billing_records, false)
  assert.equal(db.applied.has(batch4MigrationFile), false)
  await runBranchMigrations(db)
  assert.equal(db.promotionState.billing_records, true)
  assert.equal(db.applied.has(batch4MigrationFile), true)
  assert.equal(db.commands.filter(sql => /^ALTER TABLE appointments\s/i.test(sql) && /ADD COLUMN/i.test(sql)).length, 1)
})

test('Batch 4 records an already complete but unregistered schema without re-running ALTER', async () => {
  const db = createMockDb({ initialPromotionState: { appointments: true, billing_records: true } })
  await runBranchMigrations(db)
  assert.deepEqual([...db.applied.keys()], migrationFiles)
  assert.equal(db.commands.filter(sql => /^ALTER TABLE (appointments|billing_records)\s/i.test(sql)).length, 0)
})

test('Batch 4 detects schema drift after ledger registration and never silently repairs it', async () => {
  const db = createMockDb()
  await runBranchMigrations(db)
  db.promotionState.billing_records = false
  await assert.rejects(runBranchMigrations(db), /promotion schema incomplete for billing_records/)
})

test('Batch 4 verifies SQL checksum and rejects substantive changes to its ledger entry', async () => {
  const db = createMockDb()
  await runBranchMigrations(db)
  db.applied.set(batch4MigrationFile, '0'.repeat(64))
  await assert.rejects(runBranchMigrations(db), /Previously applied migration changed/)
})


test('Batch 4 rejects unexpected partly-added columns without applying new DDL or recording the ledger', async () => {
  const db = createMockDb({ initialPromotionState: { appointments: 'partial' } })
  await assert.rejects(runBranchMigrations(db), /Unsafe partial Batch 4 migration for appointments/)
  assert.equal(db.applied.has(batch4MigrationFile), false)
  assert.equal(db.commands.filter(sql => /^ALTER TABLE (appointments|billing_records)\s/i.test(sql)).length, 0)
})

for (const operation of ['ADD INDEX', 'ADD CONSTRAINT']) {
  test(`Batch 4 resumes after a TiDB ${operation} interruption without repeating committed operations`, async () => {
    const db = createMockDb({ failOnceOn: operation })
    await assert.rejects(runBranchMigrations(db), /synthetic migration DDL failure/)
    assert.equal(db.applied.has(batch4MigrationFile), false)
    assert.equal(db.promotionState.appointments, true)
    await runBranchMigrations(db)
    assert.equal(db.applied.has(batch4MigrationFile), true)
    assert.equal(db.commands.filter(sql => /^ALTER TABLE appointments\s/i.test(sql) && /ADD COLUMN/i.test(sql)).length, 1)
    if (operation === 'ADD CONSTRAINT') assert.equal(db.commands.filter(sql => /^ALTER TABLE appointments\s/i.test(sql) && /ADD INDEX/i.test(sql)).length, 1)
  })
}

test('Batch 4 recovers manually applied complete columns while adding only the missing TiDB index and FK', async () => {
  const db = createMockDb({ initialPromotionState: { appointments: true, billing_records: true }, initialPromotionIndex: false, initialPromotionFk: false })
  await runBranchMigrations(db)
  const ddl = db.commands.filter(sql => /^ALTER TABLE (appointments|billing_records)\s/i.test(sql))
  assert.equal(ddl.length, 2)
  assert.ok(ddl.every(sql => !/ADD COLUMN/i.test(sql)))
  assert.equal(db.applied.has(batch4MigrationFile), true)
})

test('November 14 migrations add only schema, preserve financial records and run once', async () => {
  const db=createMockDb()
  await runBranchMigrations(db)
  const newFiles=migrationFiles.filter(file=>file.startsWith('2026-11-14-')&&file!=='2026-11-14-simplify-tax-settings.sql')
  for(const file of newFiles){
    const statements=require('../../scripts/branchMigrations').splitMysqlMigration(fs.readFileSync(path.join(migrationDir,file),'utf8'))
    assert.ok(statements.every(sql=>/^CREATE TABLE IF NOT EXISTS|^ALTER TABLE billing_service_catalog ADD COLUMN doctor_fee_percentage/.test(sql)))
    assert.ok(db.applied.has(file))
  }
  const ddl=()=>db.commands.filter(sql=>/^ALTER TABLE billing_service_catalog ADD COLUMN doctor_fee_percentage/.test(sql)).length
  assert.equal(ddl(),1);await runBranchMigrations(db);assert.equal(ddl(),1)
  db.feeColumns.get('doctor_fee_percentage').COLUMN_TYPE='decimal(6,3)'
  await assert.rejects(runBranchMigrations(db),/Incompatible doctor fee/)
})

test('an existing compatible fee column is verified without reapplying it',async()=>{
  const db=createMockDb({initialDoctorFee:{COLUMN_TYPE:'decimal(5,2)',IS_NULLABLE:'NO',COLUMN_DEFAULT:'0.00'}})
  await runBranchMigrations(db)
  assert.ok(db.applied.has('2026-11-14-billing-financial-snapshots.sql'))
  assert.equal(db.commands.some(sql=>/^ALTER TABLE billing_service_catalog ADD COLUMN doctor_fee_percentage/.test(sql)),false)
})

test('an incompatible fee column stops before recording the migration',async()=>{
  const db=createMockDb({initialDoctorFee:{COLUMN_TYPE:'varchar(10)',IS_NULLABLE:'YES',COLUMN_DEFAULT:null}})
  await assert.rejects(runBranchMigrations(db),/Incompatible doctor fee/)
  assert.equal(db.applied.has('2026-11-14-billing-financial-snapshots.sql'),false)
})

test('interrupted snapshot DDL resumes without re-adding the committed fee column',async()=>{
  const db=createMockDb({failOnceOn:'CREATE TABLE IF NOT EXISTS billing_financial_snapshots'})
  await assert.rejects(runBranchMigrations(db),/synthetic migration DDL failure/)
  assert.equal(db.applied.has('2026-11-14-billing-financial-snapshots.sql'),false)
  await runBranchMigrations(db)
  assert.equal(db.commands.filter(sql=>/^ALTER TABLE billing_service_catalog ADD COLUMN doctor_fee_percentage/.test(sql)).length,1)
  assert.ok(db.applied.has('2026-11-14-billing-financial-snapshots.sql'))
})

test('tax simplification resumes safely and touches only current settings and discount metadata',async()=>{
  const db=createMockDb({failOnceOn:'UPDATE branch_billing_settings'})
  await assert.rejects(runBranchMigrations(db),/synthetic migration DDL failure/)
  assert.equal(db.applied.has('2026-11-14-simplify-tax-settings.sql'),false)
  await runBranchMigrations(db)
  const adds=()=>db.commands.filter(sql=>sql.startsWith('ALTER TABLE discount_presets ADD COLUMN statutory_category')).length
  assert.equal(adds(),1);assert.ok(db.applied.has('2026-11-14-simplify-tax-settings.sql'))
  await runBranchMigrations(db);assert.equal(adds(),1)
  const statements=require('../../scripts/branchMigrations').splitMysqlMigration(fs.readFileSync(path.join(migrationDir,'2026-11-14-simplify-tax-settings.sql'),'utf8'))
  assert.equal(statements.length,3)
  assert.ok(statements.slice(1).every(sql=>/^UPDATE (discount_presets|branch_billing_settings)\b/.test(sql)))
  assert.ok(statements.every(sql=>!/billing_records|billing_financial_snapshots|DROP\s/i.test(sql)))
})

test('tax simplification skips a compatible existing category column and rejects incompatible metadata',async()=>{
  const compatible=createMockDb({initialStatutoryCategory:{COLUMN_TYPE:'varchar(12)',IS_NULLABLE:'NO',COLUMN_DEFAULT:'other'}})
  await runBranchMigrations(compatible)
  assert.equal(compatible.commands.some(sql=>sql.startsWith('ALTER TABLE discount_presets ADD COLUMN statutory_category')),false)
  const incompatible=createMockDb({initialStatutoryCategory:{COLUMN_TYPE:'int',IS_NULLABLE:'YES',COLUMN_DEFAULT:null}})
  await assert.rejects(runBranchMigrations(incompatible),/Incompatible statutory discount/)
  assert.equal(incompatible.applied.has('2026-11-14-simplify-tax-settings.sql'),false)
})


