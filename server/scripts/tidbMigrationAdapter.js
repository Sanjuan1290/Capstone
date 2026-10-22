// Application-managed equivalents for the three historical MySQL stored-procedure
// migrations. The original SQL files and their applied SHA-256 hashes stay intact.
// Only called with DB_PROVIDER=tidb and an unapplied historical migration.
const PROCEDURAL_FILES = new Set([
  '2026-10-09-multi-branch-foundation.sql',
  '2026-10-15-branch-ledgers.sql',
  '2026-10-15-cashier-branch-uniqueness.sql',
])

const id = (value) => {
  if (!/^[A-Za-z_][A-Za-z_0-9]*$/.test(value)) throw new Error(`Unsafe SQL identifier: ${value}`)
  return `\`${value}\``
}
const argumentsOf = (statement) => {
  const match = /^CALL\s+([A-Za-z_0-9]+)\((.*)\)$/is.exec(statement.trim())
  if (!match) throw new Error(`Unsupported TiDB migration CALL: ${statement.slice(0, 120)}`)
  const parts = []
  let quote = '', current = ''
  for (let i = 0; i < match[2].length; i++) {
    const ch = match[2][i]
    if (quote) {
      if (ch === quote && match[2][i+1] === quote) { current += quote; i++; continue }
      if (ch === quote) { quote = ''; continue }
      current += ch
    } else if (ch === "'" || ch === '"') quote = ch
    else if (ch === ',') { parts.push(current.trim()); current = '' }
    else current += ch
  }
  if (quote) throw new Error('Unterminated quoted argument')
  if (current.trim()) parts.push(current.trim())
  return [match[1], parts]
}
const exists = async (conn, namespace, table, column) => {
  const name = namespace.toUpperCase()
  const field = name === 'COLUMNS' ? 'COLUMN_NAME' : 'INDEX_NAME'
  const [rows] = await conn.query(
    `SELECT COUNT(*) AS n FROM information_schema.${name} WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME=? AND ${field}=?`,
    [table, column]
  )
  return Number(rows[0]?.n || 0) > 0
}
const tableExists = async (conn, table) => {
  const [rows] = await conn.query('SELECT COUNT(*) AS n FROM information_schema.TABLES WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME=?', [table])
  return Number(rows[0]?.n || 0) > 0
}
const addIndex = async (conn, table, name, columns, previous = null, definition = null) => {
  if (!await tableExists(conn, table) || await exists(conn, 'STATISTICS', table, name)) return
  if (!/^[\w\s,()]+$/.test(columns)) throw new Error('Unsafe index column definition')
  const remove = previous && await exists(conn, 'STATISTICS', table, previous) ? `DROP INDEX ${id(previous)}, ` : ''
  const index = definition || `ADD UNIQUE KEY ${id(name)} (${columns.split(',').map(v => id(v.trim())).join(',')})`
  await conn.query(`ALTER TABLE ${id(table)} ${remove}${index}`)
}
async function translateCall(conn, statement) {
  const [name, args] = argumentsOf(statement)
  switch (name) {
    case 'carait_branch_column': {
      const [table, column, definition] = args
      if (await tableExists(conn, table) && !await exists(conn, 'COLUMNS', table, column)) {
        if (!/^[\w(), '\.]+$/.test(definition)) throw new Error('Unsafe column definition')
        await conn.query(`ALTER TABLE ${id(table)} ADD COLUMN ${id(column)} ${definition}`)
      }
      return
    }
    case 'carait_branch_index': {
      const [table, indexName, ddl] = args
      if (await tableExists(conn, table) && !await exists(conn, 'STATISTICS', table, indexName)) {
        // The original DDL is from our immutable migration and must be precisely an index create statement.
        if (!/^CREATE INDEX [\w]+ ON [\w]+ \([\w,\s]+\)$/i.test(ddl)) throw new Error('Unexpected index DDL')
        await conn.query(ddl)
      }
      return
    }
    case 'carait_branch_rekey': {
      const [table, oldIndex, newIndex, columns] = args
      // Recover from partial application even when the old index was already
      // removed before a crash. addIndex skips an existing replacement and
      // drops the old index only when it is still present.
      await addIndex(conn, table, newIndex, columns, oldIndex)
      return
    }
    case 'carait_ensure_branch_ledger_column': {
      const [table] = args
      if (await tableExists(conn, table) && !await exists(conn, 'COLUMNS', table, 'branch_id')) {
        await conn.query(`ALTER TABLE ${id(table)} ADD COLUMN branch_id INT NOT NULL DEFAULT 1`)
      }
      return
    }
    case 'carait_ensure_branch_ledger_index': {
      const [table, oldIndex, newIndex, columns] = args
      await addIndex(conn, table, newIndex, columns, oldIndex)
      return
    }
    case 'carait_ensure_barcode_pk': {
      const [rows] = await conn.query("SELECT COUNT(*) AS n FROM information_schema.KEY_COLUMN_USAGE WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='inventory_barcode_sequences' AND CONSTRAINT_NAME='PRIMARY'")
      if (Number(rows[0]?.n) === 1) await conn.query('ALTER TABLE inventory_barcode_sequences DROP PRIMARY KEY, ADD PRIMARY KEY (category,branch_id)')
      return
    }
    case 'carait_cashier_branch_unique': {
      if (await exists(conn, 'STATISTICS', 'cashier_closings', 'uniq_cashier_branch_date')) return
      await addIndex(conn, 'cashier_closings', 'uniq_cashier_branch_date', 'branch_id,cashier_role,staff_id,closing_date', 'uniq_cashier_closing')
      return
    }
    default: throw new Error(`Unrecognized procedure in TiDB migration: ${name}`)
  }
}
async function runTiDBMigration(conn, file, statements) {
  if (!PROCEDURAL_FILES.has(file)) throw new Error(`No TiDB migration adapter for ${file}`)
  for (const statement of statements) {
    if (/^\s*(?:CREATE|DROP)\s+PROCEDURE\b/i.test(statement)) continue
    if (/^\s*USE\s+/i.test(statement)) continue
    if (/^\s*CALL\s+/i.test(statement)) { await translateCall(conn, statement); continue }
    if (/^\s*DROP\s+TABLE\b/i.test(statement)) throw new Error('Destructive migration blocked')
    await conn.query(statement)
  }
}
module.exports = { runTiDBMigration, PROCEDURAL_FILES, argumentsOf, translateCall }

