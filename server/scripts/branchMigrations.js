const { ensureOperationalActorColumns, definitions: actorColumns } = require('../utils/operationalActors')
const { ensureInventoryActivityColumns } = require('../utils/inventoryActivity')
const { runQueueNumberingStatement, verifyQueueNumberingIndexes } = require('../utils/queueNumberingSchema')
'use strict'

const fs = require('fs')
const path = require('path')
const crypto = require('crypto')
const { runTiDBMigration, PROCEDURAL_FILES, normalizeHistoricalStatement } = require('./tidbMigrationAdapter')
const { requiredFoundationColumns, verifyFoundationSchema, ensureFoundationRekeys } = require('./foundationSchema')
const { MIGRATION_FILE: promotionMigrationFile, runSelectedPromotionMigration, verifyPromotionSchema } = require('./promotionMigration')
const { runDoctorBranchMigration, runGuardedAdditiveMigration } = require('./resumableBranchMigrations')

// Handle mysql CLI DELIMITER directives (including stored-procedure bodies).
// Statements execute serially on a single connection. A migration is recorded
// only after its last statement and the foundation contract have succeeded.
function splitMysqlMigration(source) {
  let delimiter = ';', buffer = '', statements = []
  for (const line of source.split(/\r?\n/)) {
    const trimmed = line.trim()
    const directive = /^DELIMITER\s+(\S+)$/i.exec(trimmed)
    if (directive) {
      if (buffer.trim()) throw new Error('Malformed migration: incomplete statement before DELIMITER')
      delimiter = directive[1]
      continue
    }
    if (!trimmed || trimmed.startsWith('--') || trimmed.startsWith('#')) continue
    buffer += line + '\n'
    if (buffer.trimEnd().endsWith(delimiter)) {
      const sql = buffer.trimEnd().slice(0, -delimiter.length).trim()
      if (sql) statements.push(sql)
      buffer = ''
    }
  }
  if (buffer.trim()) throw new Error('Malformed migration: statement has no terminator')
  return statements
}

// Permit CRLF vs LF and final-newline differences from Windows/Unix checkouts.
// Reject every substantive SQL change to an already applied migration.
const acceptedContentHashes = (source) => {
  const lf = source.replace(/\r\n/g, '\n').replace(/\r/g, '\n')
  const clean = lf.replace(/\n+$/, '')
  const variations = [lf, clean, clean + '\n', clean + '\n\n']
  const variants = new Set([...variations, ...variations.map((value) => value.replace(/\n/g, '\r\n'))])
  return new Set([...variants].map((value) => crypto.createHash('sha256').update(value).digest('hex')))
}

const migrationFiles = [
  '2026-10-09-multi-branch-foundation.sql',
  '2026-10-15-branch-ledgers.sql',
  '2026-10-15-cashier-branch-uniqueness.sql',
  '2026-10-16-paymongo-test-qr.sql',
  '2026-10-17-announcements-campaigns.sql',
  promotionMigrationFile,
  '2026-10-31-doctor-multi-branch.sql',
  '2026-11-02-audit-context.sql',
  '2026-11-02-inventory-excel-receipts.sql',
  '2026-11-02-branch-movement-reasons.sql',
  '2026-11-02-consultation-charge-adjustments.sql',
  '2026-11-05-promotion-pricing.sql',
  '2026-11-05-billing-failure-history.sql',
  '2026-11-09-superadmin-patient-directory-ban.sql',
  '2026-11-09-branch-google-maps-url.sql',
  '2026-11-11-charge-reduction-reversal.sql',
  '2026-11-11-registration-sms-limits.sql',
  '2026-11-11-billing-stock-reservations.sql',
  '2026-11-11-doctor-confirmation-notifications.sql',
  '2026-11-12-inventory-excel-undo.sql',
  '2026-11-12-promotion-verified-eligibility.sql',
  '2026-11-12-daily-stock-alerts.sql',
  '2026-11-12-queue-daily-department-numbers.sql',
  '2026-11-13-inventory-movement-balances.sql',
  '2026-11-13-walk-in-queue-permission.sql',
  '2026-11-13-shared-operation-actors.sql',
  '2026-11-14-consultation-followups.sql',
  '2026-11-14-billing-financial-snapshots.sql',
  '2026-11-14-branch-tax-policy.sql',
]

const schemaMigrationsSql = [
  'CREATE TABLE IF NOT EXISTS schema_migrations (',
  '  filename VARCHAR(180) NOT NULL PRIMARY KEY,',
  '  content_sha256 CHAR(64) NOT NULL,',
  '  applied_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP',
  ') ENGINE=InnoDB DEFAULT CHARSET=utf8mb4',
].join('\n')

const schemaMigrationLocksSql = [
  'CREATE TABLE IF NOT EXISTS schema_migration_locks (',
  '  lock_name VARCHAR(80) NOT NULL PRIMARY KEY,',
  '  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP',
  ') ENGINE=InnoDB DEFAULT CHARSET=utf8mb4',
].join('\n')

async function ensureDoctorFeeColumn(connection, addIfMissing = false) {
  const [[column]] = await connection.query('SELECT COLUMN_TYPE,IS_NULLABLE,COLUMN_DEFAULT FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME=? AND COLUMN_NAME=?', ['billing_service_catalog','doctor_fee_percentage'])
  if (column) {
    if (String(column.COLUMN_TYPE).toLowerCase() !== 'decimal(5,2)' || column.IS_NULLABLE !== 'NO' || column.COLUMN_DEFAULT == null || Number(column.COLUMN_DEFAULT) !== 0) throw new Error('Incompatible doctor fee percentage column')
    return
  }
  if (!addIfMissing) throw new Error('Missing doctor fee percentage column')
  await connection.query('ALTER TABLE billing_service_catalog ADD COLUMN doctor_fee_percentage DECIMAL(5,2) NOT NULL DEFAULT 0')
}

async function runBranchMigrations(db) {
  await db.query(schemaMigrationsSql)
  // Hold this row lock on a dedicated connection while DDL executes on worker
  // connections. TiDB and MySQL auto-commit many DDL statements, so the lock
  // transaction must not share a connection with migration work.
  await db.query(schemaMigrationLocksSql)
  const lockConnection = await db.getConnection()
  let lockTransactionStarted = false
  try {
    await lockConnection.beginTransaction()
    lockTransactionStarted = true
    await lockConnection.query('INSERT IGNORE INTO schema_migration_locks (lock_name) VALUES (?)', ['branch-migrations'])
    await lockConnection.query('SELECT lock_name FROM schema_migration_locks WHERE lock_name=? FOR UPDATE', ['branch-migrations'])
    await runRegisteredBranchMigrations(db)
    await lockConnection.commit()
    lockTransactionStarted = false
  } catch (error) {
    if (lockTransactionStarted) await lockConnection.rollback().catch(() => {})
    throw error
  } finally {
    lockConnection.release()
  }
}

async function runRegisteredBranchMigrations(db) {
  for (const file of migrationFiles) {
    const sql = fs.readFileSync(path.join(__dirname, '..', 'db', 'migrations', file), 'utf8')
    const hash = crypto.createHash('sha256').update(sql).digest('hex')
    const [[saved]] = await db.query('SELECT content_sha256 FROM schema_migrations WHERE filename=?', [file])
    if (saved) {
      if (!acceptedContentHashes(sql).has(saved.content_sha256)) {
        throw new Error('Previously applied migration changed: ' + file)
      }
      // A recorded foundation migration is not proof that its schema still
      // matches. Detect drift before later migrations or application startup.
      if (file === migrationFiles[0]) await verifyFoundationSchema(db, sql)
      if (file === promotionMigrationFile) await verifyPromotionSchema(db)
      if (file === '2026-11-12-queue-daily-department-numbers.sql') await verifyQueueNumberingIndexes(db)
      if (file === '2026-11-13-shared-operation-actors.sql') await ensureOperationalActorColumns(db)
      if (file === '2026-11-13-inventory-movement-balances.sql') await ensureInventoryActivityColumns(db)
      if (file === '2026-11-14-billing-financial-snapshots.sql') await ensureDoctorFeeColumn(db)
      continue
    }

    const connection = await db.getConnection()
    try {
      // MySQL DDL auto-commits; reruns are made safe by guarded, idempotent SQL.
      const statements = splitMysqlMigration(sql)
      if (file === promotionMigrationFile) {
        // Metadata-checked, resumable per-table DDL. Never mark an incomplete schema as applied.
        await runSelectedPromotionMigration(connection, statements)
      } else if (file === '2026-11-13-shared-operation-actors.sql') {
        const expected = actorColumns.map(([table,column,operation])=>`ALTER TABLE ${table} ${operation} ${column} INT NULL`)
        if (JSON.stringify(statements)!==JSON.stringify(expected)) throw new Error('Unexpected actor migration statements')
        await ensureOperationalActorColumns(connection,true)
      } else if (file === '2026-11-13-inventory-movement-balances.sql') {
        const expected = ['quantity_before', 'quantity_after'].map(column => `ALTER TABLE inventory_logs ADD COLUMN ${column} DECIMAL(12,2) NULL`)
        if (JSON.stringify(statements) !== JSON.stringify(expected)) throw new Error('Unexpected inventory movement migration statements')
        await ensureInventoryActivityColumns(connection, true)
      } else if (file === '2026-11-12-queue-daily-department-numbers.sql') {
        for (const statement of statements) await runQueueNumberingStatement(connection, statement)
        await verifyQueueNumberingIndexes(connection)
      } else if (file === '2026-10-31-doctor-multi-branch.sql') {
        await runDoctorBranchMigration(connection, statements)
      } else if (['2026-11-09-superadmin-patient-directory-ban.sql', '2026-11-02-branch-movement-reasons.sql', '2026-11-09-branch-google-maps-url.sql'].includes(file)) {
        await runGuardedAdditiveMigration(connection, statements)
      } else if (String(process.env.DB_PROVIDER || '').toLowerCase() === 'tidb' && PROCEDURAL_FILES.has(file)) {
        // Convert MySQL stored-procedure calls to equivalent schema guards in JS.
        // The archived SQL and SHA-256 stay unchanged for existing databases.
        await runTiDBMigration(connection, file, statements)
      } else {
        for (const statement of statements) {
          const executable = normalizeHistoricalStatement(statement)
          if(file==='2026-11-11-charge-reduction-reversal.sql'){
            const match=/^ALTER TABLE billing_charge_adjustments ADD COLUMN (reversed_at|reversed_by_admin_id|reversal_reason) (DATETIME|INT|VARCHAR\(255\)) NULL$/i.exec(statement)
            if(!match)throw new Error('Unexpected charge reduction reversal migration statement')
            const [[existing]]=await connection.query('SELECT COLUMN_TYPE,IS_NULLABLE FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME=? AND COLUMN_NAME=?',['billing_charge_adjustments',match[1]])
            if(existing){
              if(String(existing.COLUMN_TYPE).toLowerCase().replace(/^int\(\d+\)$/,'int')!==match[2].toLowerCase()||existing.IS_NULLABLE!=='YES')throw new Error('Incompatible reversal column: '+match[1])
              continue
            }
          }
          if (file === '2026-11-12-promotion-verified-eligibility.sql') {
            const match = /^ALTER TABLE (clinic_promotions|appointments) ADD COLUMN (eligibility_type|promotion_eligibility_snapshot) VARCHAR\(24\) NOT NULL DEFAULT 'all'$/i.exec(statement)
            if (!match) throw new Error('Unexpected promotion eligibility migration statement')
            const [[existing]] = await connection.query('SELECT COLUMN_TYPE, IS_NULLABLE, COLUMN_DEFAULT FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME=? AND COLUMN_NAME=? LIMIT 1', [match[1], match[2]])
            if (existing) {
              if (String(existing.COLUMN_TYPE).toLowerCase()!=='varchar(24)' || existing.IS_NULLABLE!=='NO' || existing.COLUMN_DEFAULT!=='all') throw new Error('Incompatible promotion eligibility column: '+match[2])
              continue
            }
          }
          if (file === '2026-11-05-promotion-pricing.sql') {
            const match = /^ALTER TABLE (clinic_promotions|appointments|billing_records) ADD COLUMN ([a-z_]+) /i.exec(statement)
            if (!match) throw new Error('Unexpected promotion pricing migration statement')
            const [[existing]] = await connection.query(
              'SELECT 1 AS found FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME=? AND COLUMN_NAME=? LIMIT 1',
              [match[1], match[2]])
            if (existing) continue // Recover safely after partial TiDB DDL.
          }
          if (file === '2026-11-05-billing-failure-history.sql') {
            const column=/^ALTER TABLE payment_gateway_webhook_events ADD COLUMN (failure_message) /i.exec(statement)?.[1]
            if(!column)throw new Error('Unexpected billing failure history migration statement')
            const [[existing]]=await connection.query('SELECT 1 AS found FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME=? AND COLUMN_NAME=? LIMIT 1',['payment_gateway_webhook_events',column])
            if(existing)continue
          }
          if (file === '2026-11-02-audit-context.sql') {
            const column = /^ALTER TABLE audit_logs ADD COLUMN ([a-z_]+) /i.exec(statement)?.[1]
            if (!column) throw new Error('Unexpected audit context migration statement')
            const [[existing]] = await connection.query(
              'SELECT 1 AS found FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME=? AND COLUMN_NAME=? LIMIT 1',
              ['audit_logs', column]
            )
            if (existing) continue // Resume safely after partial DDL.
          }
          if(file==='2026-11-14-billing-financial-snapshots.sql' && /^ALTER TABLE/.test(statement)){
            if(statement!=='ALTER TABLE billing_service_catalog ADD COLUMN doctor_fee_percentage DECIMAL(5,2) NOT NULL DEFAULT 0')throw new Error('Unexpected financial migration DDL')
            await ensureDoctorFeeColumn(connection,true)
            continue
          }
          if (/^USE\s+/i.test(statement)) continue // connection already selects DB_NAME
          if (/^DROP\s+TABLE\b/i.test(statement)) throw new Error('Destructive migration blocked')
          await connection.query(executable)
        }
      }
      if (file === migrationFiles[0]) {
        // The native MySQL procedure skips a rekey if the legacy index is
        // absent. This guarded recovery adds the required new index first and
        // removes an old global key only after confirming the replacement.
        await ensureFoundationRekeys(connection, sql)
        // Never write the applied checksum until schema metadata and seed data
        // satisfy the complete foundation contract.
        await verifyFoundationSchema(connection, sql)
      }
      await connection.query('INSERT INTO schema_migrations (filename,content_sha256) VALUES (?,?)', [file, hash])
    } finally {
      connection.release()
    }
  }
}

module.exports = {
  splitMysqlMigration,
  requiredFoundationColumns,
  verifyFoundationSchema,
  ensureFoundationRekeys,
  runBranchMigrations,
  acceptedContentHashes,
  migrationFiles,
  ensureDoctorFeeColumn,
}


