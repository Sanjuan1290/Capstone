const definitions = {
  uniq_queue_branch_doctor_day_number: { columns: ['branch_id', 'queue_date', 'doctor_id', 'queue_number'], unique: true },
  idx_queue_branch_department_day: { columns: ['branch_id', 'queue_date', 'type', 'queue_number'], unique: false },
  uniq_queue_doctor_day_number: { columns: ['queue_date', 'doctor_id', 'queue_number'], unique: true },
}
const matches = (rows, expected) => rows.length === expected.columns.length
  && rows.every((row, i) => row.Column_name === expected.columns[i] && Number(row.Non_unique) === (expected.unique ? 0 : 1) && row.Sub_part == null)
async function runQueueNumberingStatement(executor, statement) {
  const match = /^ALTER TABLE queue (ADD (?:UNIQUE )?KEY|DROP INDEX) (\w+)/i.exec(statement)
  const expected = definitions[match?.[2]]
  if (!expected) throw new Error('Unexpected daily queue migration statement')
  const [all] = await executor.query('SHOW INDEX FROM queue')
  const rows = all.filter(row => row.Key_name === match[2]).sort((a, b) => Number(a.Seq_in_index) - Number(b.Seq_in_index))
  if (rows.length && !matches(rows, expected)) throw new Error('Incompatible queue index: ' + match[2])
  if (match[1] === 'DROP INDEX') {
    const replacement = all.filter(row => row.Key_name === 'uniq_queue_branch_doctor_day_number').sort((a,b) => Number(a.Seq_in_index)-Number(b.Seq_in_index))
    if (!matches(replacement, definitions.uniq_queue_branch_doctor_day_number)) throw new Error('Branch queue index required before removing global queue index')
    if (!rows.length) return
  } else if (rows.length) return
  await executor.query(statement)
}
async function verifyQueueNumberingIndexes(executor) {
  const [all] = await executor.query('SHOW INDEX FROM queue')
  for (const name of ['uniq_queue_branch_doctor_day_number', 'idx_queue_branch_department_day']) {
    const rows = all.filter(row => row.Key_name === name).sort((a,b)=>Number(a.Seq_in_index)-Number(b.Seq_in_index))
    if (!matches(rows, definitions[name])) throw new Error('Daily queue migration required: ' + name)
  }
  if (all.some(row => row.Key_name === 'uniq_queue_doctor_day_number')) throw new Error('Legacy global queue index must be replaced by the daily queue migration')
}
module.exports = { runQueueNumberingStatement, verifyQueueNumberingIndexes }
