'use strict'

// Execute only the two immutable, known migrations that historically lacked
// resumable DDL. Never replay a backfill over an existing branch assignment.
async function runDoctorBranchMigration(connection, statements) {
  const drops = []
  for (const original of statements) {
    let statement = original
    const column = /^ALTER TABLE (doctor_schedules|doctor_unavailable_dates) ADD COLUMN (branch_id) INT NULL$/i.exec(statement)
    if (column) {
      const [[existing]] = await connection.query('SELECT DATA_TYPE FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME=? AND COLUMN_NAME=?', [column[1], column[2]])
      if (existing) {
        if (existing.DATA_TYPE !== 'int') throw new Error('Existing doctor branch column has an incompatible type')
        continue
      }
    }
    if (/^UPDATE doctor_(schedules|unavailable_dates) [su] JOIN doctors/i.test(statement)) {
      const alias = statement.startsWith('UPDATE doctor_schedules') ? 's' : 'u'
      statement += ` WHERE ${alias}.branch_id IS NULL`
    }
    const index = /^ALTER TABLE (doctor_schedules|doctor_unavailable_dates) ADD (UNIQUE KEY|KEY) ([a-z_]+) \(([^)]+)\)$/i.exec(statement)
    if (index) {
      const [existing] = await connection.query('SELECT COLUMN_NAME,NON_UNIQUE FROM information_schema.STATISTICS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME=? AND INDEX_NAME=? ORDER BY SEQ_IN_INDEX', [index[1], index[3]])
      if (existing.length) {
        const expected = index[4].split(',').map(value => value.trim())
        if (existing.length !== expected.length || existing.some((row, i) => row.COLUMN_NAME !== expected[i] || Number(row.NON_UNIQUE) !== (index[2] === 'UNIQUE KEY' ? 0 : 1))) throw new Error('Existing doctor branch index has an incompatible definition')
        continue
      }
    }
    const drop = /^ALTER TABLE (doctor_unavailable_dates) DROP INDEX (uniq_doctor_unavailable_date)$/i.exec(statement)
    if (drop) { drops.push({ statement, table: drop[1], index: drop[2] }); continue }
    await connection.query(statement)
  }
  // Create and validate the replacement before removing the old global key.
  for (const drop of drops) {
    const [[existing]] = await connection.query('SELECT 1 AS found FROM information_schema.STATISTICS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME=? AND INDEX_NAME=? LIMIT 1', [drop.table, drop.index])
    if (existing) await connection.query(drop.statement)
  }
}

async function runGuardedAdditiveMigration(connection, statements) {
  for (const statement of statements) {
    const column = /^ALTER TABLE (patients|inventory_movement_reasons|clinic_branches)\s+ADD COLUMN IF NOT EXISTS (is_banned|banned_at|banned_by_admin_id|branch_id|google_maps_url) /i.exec(statement)
    const index = /^ALTER TABLE (patients|inventory_movement_reasons)\s+ADD INDEX IF NOT EXISTS (idx_patients_directory_status|idx_movement_reason_branch) /i.exec(statement)
    if (!column && !index) throw new Error('Unexpected additive branch migration statement')
    const [[existing]] = await connection.query(column
      ? 'SELECT 1 AS found FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME=? AND COLUMN_NAME=? LIMIT 1'
      : 'SELECT 1 AS found FROM information_schema.STATISTICS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME=? AND INDEX_NAME=? LIMIT 1', [(column || index)[1], (column || index)[2]])
    if (!existing) await connection.query(statement.replace(/IF NOT EXISTS /i, ''))
  }
}

module.exports = { runDoctorBranchMigration, runGuardedAdditiveMigration }
