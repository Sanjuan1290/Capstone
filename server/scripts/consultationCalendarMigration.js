'use strict'
const columns = [
  ['consultations', 'billable_services_json', 'JSON'],
  ['consultation_followups', 'dates_json', 'JSON'],
  ['consultation_followup_revisions', 'dates_json', 'JSON'],
  ['appointment_followup_links', 'return_date', 'DATE'],
]

async function ensureConsultationCalendarColumns(db, addIfMissing = false) {
  for (const [table, column, type] of columns) {
    const [[existing]] = await db.query('SELECT DATA_TYPE,IS_NULLABLE FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME=? AND COLUMN_NAME=?', [table, column])
    if (existing) {
      if (String(existing.DATA_TYPE).toLowerCase() !== type.toLowerCase() || existing.IS_NULLABLE !== 'YES') throw new Error(`Incompatible consultation calendar column: ${table}.${column}`)
    } else {
      if (!addIfMissing) throw new Error(`Missing consultation calendar column: ${table}.${column}`)
      await db.query(`ALTER TABLE ${table} ADD COLUMN ${column} ${type} NULL`)
    }
  }
}

async function runConsultationCalendarMigration(db, statements) {
  const expected = columns.map(([table, column, type]) => `ALTER TABLE ${table} ADD COLUMN ${column} ${type} NULL`)
  if (statements.length !== 5 || expected.some((sql, i) => statements[i] !== sql) || statements[4] !== 'UPDATE appointment_followup_links l\nJOIN consultation_followups f ON f.id=l.followup_id\nSET l.return_date=f.return_date\nWHERE l.return_date IS NULL') throw new Error('Unexpected consultation calendar migration statements')
  await ensureConsultationCalendarColumns(db, true)
  await db.query(statements[4])
}

module.exports = { ensureConsultationCalendarColumns, runConsultationCalendarMigration }
