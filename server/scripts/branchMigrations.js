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
<<<<<<< HEAD
  '2026-11-11-charge-reduction-reversal.sql',
=======
>>>>>>> b192e962dc7fcb600de8cbcb2bac79aa6477d805
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
      continue
    }

    const connection = await db.getConnection()
    try {
      // MySQL DDL auto-commits; reruns are made safe by guarded, idempotent SQL.
      const statements = splitMysqlMigration(sql)
      if (file === promotionMigrationFile) {
        // Metadata-checked, resumable per-table DDL. Never mark an incomplete schema as applied.
        await runSelectedPromotionMigration(connection, statements)
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
<<<<<<< HEAD
          if(file==='2026-11-11-charge-reduction-reversal.sql'){
            const match=/^ALTER TABLE billing_charge_adjustments ADD COLUMN (reversed_at|reversed_by_admin_id|reversal_reason) (DATETIME|INT|VARCHAR\(255\)) NULL$/i.exec(statement)
            if(!match)throw new Error('Unexpected charge reduction reversal migration statement')
            const [[existing]]=await connection.query('SELECT COLUMN_TYPE,IS_NULLABLE FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME=? AND COLUMN_NAME=?',['billing_charge_adjustments',match[1]])
            if(existing){
              if(String(existing.COLUMN_TYPE).toLowerCase().replace(/^int\(\d+\)$/,'int')!==match[2].toLowerCase()||existing.IS_NULLABLE!=='YES')throw new Error('Incompatible reversal column: '+match[1])
              continue
            }
          }
=======
>>>>>>> b192e962dc7fcb600de8cbcb2bac79aa6477d805
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
}







