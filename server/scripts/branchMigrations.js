const fs = require('fs')
const path = require('path')
const crypto = require('crypto')

// Handle mysql CLI DELIMITER directives (including stored-procedure bodies).
// Statements execute serially on a *single* connection. No DROP TABLE and no
// database reset. A migration is recorded only after its last statement succeeds.
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
    buffer += `${line}\n`
    if (buffer.trimEnd().endsWith(delimiter)) {
      const sql = buffer.trimEnd().slice(0, -delimiter.length).trim()
      if (sql) statements.push(sql)
      buffer = ''
    }
  }
  if (buffer.trim()) throw new Error('Malformed migration: statement has no terminator')
  return statements
}


// When upgrading an already partially migrated database, verify the entire
// foundational ownership contract before recording the migration as applied.
// A single existing table/column is not sufficient evidence.
function requiredFoundationColumns(source) {
  const columns = []
  const pattern = /CALL\s+carait_branch_column\('([^']+)'\s*,\s*'([^']+)'/g
  for (const match of source.matchAll(pattern)) columns.push([match[1], match[2]])
  if (columns.length < 20) throw new Error('Foundation migration ownership catalog is unexpectedly incomplete')
  return columns
}
async function verifyFoundationSchema(db, source) {
  const columns = requiredFoundationColumns(source)
  const tables = [...new Set(['clinic_branches', 'admin_branch_permissions', 'branch_booking_settings', 'branch_stock_transfer_requests', ...columns.map(pair => pair[0])])]
  const placeholders = tables.map(() => '?').join(',')
  const [existingTables] = await db.query(`SELECT TABLE_NAME FROM information_schema.TABLES WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME IN (${placeholders})`, tables)
  const existingSet = new Set(existingTables.map(row => row.TABLE_NAME || row.table_name))
  const missingTables = tables.filter(table => !existingSet.has(table))
  if (missingTables.length) throw new Error(`Partial foundation schema: missing tables ${missingTables.join(', ')}`)
  const ownershipTables = [...new Set(columns.map(pair => pair[0]))]
  const [existingColumns] = await db.query(`SELECT TABLE_NAME,COLUMN_NAME FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME IN (${ownershipTables.map(() => '?').join(',')})`, ownershipTables)
  const existingPairs = new Set(existingColumns.map(row => `${row.TABLE_NAME || row.table_name}.${row.COLUMN_NAME || row.column_name}`))
  const missingColumns = columns.map(pair => pair.join('.')).filter(key => !existingPairs.has(key))
  if (missingColumns.length) throw new Error(`Partial foundation schema: missing ownership columns ${missingColumns.join(', ')}`)
  return { tables: tables.length, columns: columns.length }
}

// Permit CRLF vs LF and final-newline differences from Windows/Unix checkouts.
// Reject every substantive SQL change to an already applied migration.
const acceptedContentHashes = (source) => {
  const lf = source.replace(/\r\n/g,'\n').replace(/\r/g,'\n')
  const clean = lf.replace(/\n+$/,'')
  const variations = [lf,clean,`${clean}\n`,`${clean}\n\n`]
  const variants = new Set([...variations,...variations.map(v=>v.replace(/\n/g,'\r\n'))])
  return new Set([...variants].map(v=>crypto.createHash('sha256').update(v).digest('hex')))
}
const migrationFiles = ['2026-10-09-multi-branch-foundation.sql','2026-10-15-branch-ledgers.sql','2026-10-15-cashier-branch-uniqueness.sql','2026-10-16-paymongo-test-qr.sql']
async function runBranchMigrations(db) {
  await db.query(`CREATE TABLE IF NOT EXISTS schema_migrations (
    filename VARCHAR(180) NOT NULL PRIMARY KEY,
    content_sha256 CHAR(64) NOT NULL,
    applied_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`)
  for (const file of migrationFiles) {
    const sql = fs.readFileSync(path.join(__dirname,'..','db','migrations',file), 'utf8')
    const hash = crypto.createHash('sha256').update(sql).digest('hex')
    const [[saved]] = await db.query('SELECT content_sha256 FROM schema_migrations WHERE filename=?',[file])
    if (saved) {
      if (!acceptedContentHashes(sql).has(saved.content_sha256)) throw new Error(`Previously applied migration changed: ${file}`)
      continue
    }
    // A dump may already include the foundation but no migration registry. The
    // current schema was checked against the source dump before this exception.
    if (file === migrationFiles[0]) {
      const [rows] = await db.query("SELECT COUNT(*) AS n FROM information_schema.tables WHERE table_schema=DATABASE() AND table_name='clinic_branches'")
      if (Number(rows[0]?.n)) {
        await verifyFoundationSchema(db, sql)
        await db.query('INSERT INTO schema_migrations (filename,content_sha256) VALUES (?,?)',[file,hash])
        continue
      }
    }
    const connection = await db.getConnection()
    try {
      // MySQL DDL auto-commits; reruns are made safe by guarded, idempotent SQL.
      for (const statement of splitMysqlMigration(sql)) {
        if (/^USE\s+/i.test(statement)) continue // connection already selects DB_NAME
        if (/^DROP\s+TABLE\b/i.test(statement)) throw new Error('Destructive migration blocked')
        await connection.query(statement)
      }
      await connection.query('INSERT INTO schema_migrations (filename,content_sha256) VALUES (?,?)',[file,hash])
    } finally { connection.release() }
  }
}
module.exports = {splitMysqlMigration,requiredFoundationColumns,verifyFoundationSchema,runBranchMigrations,acceptedContentHashes}

