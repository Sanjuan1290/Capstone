const definitions = [
  ['inventory_excel_uploads','created_by_admin_id','MODIFY COLUMN'],
  ['inventory_excel_uploads','created_by_staff_id','ADD COLUMN'],
  ['inventory_excel_uploads','undone_by_staff_id','ADD COLUMN'],
  ['inventory_excel_receipts','created_by_staff_id','ADD COLUMN'],
]
async function ensureOperationalActorColumns(db, apply = false) {
  for (const [table,column,operation] of definitions) {
    const [[row]] = await db.query('SELECT COLUMN_TYPE,IS_NULLABLE FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME=? AND COLUMN_NAME=?',[table,column])
    if (row && (!/^int(?:\(\d+\))?$/i.test(row.COLUMN_TYPE) || (row.IS_NULLABLE !== 'YES' && operation !== 'MODIFY COLUMN'))) throw new Error('Incompatible operational actor column: '+table+'.'+column)
    if (row?.IS_NULLABLE === 'YES') continue
    if (!apply) throw new Error('Operational actor migration required: '+table+'.'+column)
    if (!row && operation === 'MODIFY COLUMN') throw new Error('Missing historical actor column: '+table+'.'+column)
    await db.query(`ALTER TABLE ${table} ${operation} ${column} INT NULL`)
  }
}
module.exports = { ensureOperationalActorColumns, definitions }
