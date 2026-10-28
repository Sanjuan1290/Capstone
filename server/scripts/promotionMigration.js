'use strict'

// Keep the historical SQL/checksum unchanged, but execute columns, index and
// foreign key in separate DDL operations. TiDB cannot resolve a newly added
// column while creating its index/foreign key in the same ALTER statement.
const MIGRATION_FILE = '2026-10-26-batch4-selected-promotion.sql'

const columns = {
  appointments: {
    promotion_id: ['int'],
    promotion_title_snapshot: ['varchar', 120],
    promotion_terms_snapshot: ['varchar', 1000],
    promotion_badge_snapshot: ['varchar', 48],
    promotion_starts_on_snapshot: ['date'],
    promotion_ends_on_snapshot: ['date'],
    promotion_selected_for_service_id: ['int'],
    promotion_selected_at: ['datetime'],
  },
  billing_records: {
    promotion_review_outcome: ['varchar', 40],
    promotion_review_note: ['varchar', 255],
    promotion_review_by_role: ['varchar', 20],
    promotion_review_by_user_id: ['int'],
    promotion_reviewed_bill_version: ['int'],
    promotion_reviewed_at: ['datetime'],
  },
}

async function inspectTable(db, table) {
  // `table` is always a fixed, internal key from the contract above.
  const [rows] = await db.query(
    'SELECT COLUMN_NAME,DATA_TYPE,CHARACTER_MAXIMUM_LENGTH,IS_NULLABLE FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME=?',
    [table],
  )
  let index = [], foreignKeys = []
  if (table === 'appointments') {
    ;[index] = await db.query(
      'SELECT INDEX_NAME,NON_UNIQUE,SEQ_IN_INDEX,COLUMN_NAME FROM information_schema.STATISTICS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME=? AND INDEX_NAME=? ORDER BY SEQ_IN_INDEX',
      [table, 'idx_appointments_selected_promotion'],
    )
    ;[foreignKeys] = await db.query(
      'SELECT k.CONSTRAINT_NAME,k.COLUMN_NAME,k.REFERENCED_TABLE_NAME,k.REFERENCED_COLUMN_NAME,r.DELETE_RULE FROM information_schema.KEY_COLUMN_USAGE k LEFT JOIN information_schema.REFERENTIAL_CONSTRAINTS r ON r.CONSTRAINT_SCHEMA=k.CONSTRAINT_SCHEMA AND r.CONSTRAINT_NAME=k.CONSTRAINT_NAME AND r.TABLE_NAME=k.TABLE_NAME WHERE k.TABLE_SCHEMA=DATABASE() AND k.TABLE_NAME=? AND k.CONSTRAINT_NAME=?',
      [table, 'fk_appointments_selected_promotion'],
    )
  }
  return { rows, index, foreignKeys }
}

function columnProblems(table, schema) {
  const expected = columns[table]
  const found = new Map(schema.rows.map(row => [String(row.COLUMN_NAME).toLowerCase(), row]))
  const matchingNames = Object.keys(expected).filter(name => found.has(name))
  if (matchingNames.length === 0) return 'missing'

  const problems = []
  for (const [name, [type, length]] of Object.entries(expected)) {
    const actual = found.get(name)
    if (!actual) { problems.push('missing column ' + name); continue }
    if (String(actual.DATA_TYPE).toLowerCase() !== type || String(actual.IS_NULLABLE).toUpperCase() !== 'YES' ||
        (length !== undefined && Number(actual.CHARACTER_MAXIMUM_LENGTH) !== length)) {
      problems.push('incompatible column ' + name)
    }
  }
  return problems.length ? { problems } : 'complete'
}

function classify(table, schema) {
  const state = columnProblems(table, schema)
  if (state === 'missing' && schema.index.length === 0 && schema.foreignKeys.length === 0) return 'missing'
  const problems = state === 'complete' ? [] : state === 'missing' ? ['all promotion columns absent'] : [...state.problems]
  if (table === 'appointments') {
    const indexRows = [...schema.index].sort((a,b) => Number(a.SEQ_IN_INDEX)-Number(b.SEQ_IN_INDEX))
    const expectedIndexColumns = ['branch_id', 'promotion_id']
    if (indexRows.length !== 2 || indexRows.some((row,i) =>
      String(row.INDEX_NAME) !== 'idx_appointments_selected_promotion' ||
      Number(row.NON_UNIQUE) !== 1 || Number(row.SEQ_IN_INDEX) !== i + 1 ||
      String(row.COLUMN_NAME).toLowerCase() !== expectedIndexColumns[i])) {
      problems.push('missing/incompatible promotion index')
    }
    if (schema.foreignKeys.length !== 1 || schema.foreignKeys.some(row =>
      String(row.CONSTRAINT_NAME) !== 'fk_appointments_selected_promotion' ||
      String(row.COLUMN_NAME).toLowerCase() !== 'promotion_id' ||
      String(row.REFERENCED_TABLE_NAME).toLowerCase() !== 'clinic_promotions' ||
      String(row.REFERENCED_COLUMN_NAME).toLowerCase() !== 'id' ||
      String(row.DELETE_RULE).toUpperCase() !== 'SET NULL')) {
      problems.push('missing/incompatible promotion foreign key')
    }
  }
  return problems.length ? { problems } : 'complete'
}

async function verifyPromotionSchema(db) {
  for (const table of Object.keys(columns)) {
    const status = classify(table, await inspectTable(db, table))
    if (status !== 'complete') {
      const detail = status === 'missing' ? 'all promotion columns absent' : status.problems.join('; ')
      throw new Error(`Batch 4 promotion schema incomplete for ${table}: ${detail}`)
    }
  }
}

async function runSelectedPromotionMigration(db, statements) {
  if (statements.length !== 2 ||
      !/^ALTER TABLE appointments\s/i.test(statements[0]) ||
      !/^ALTER TABLE billing_records\s/i.test(statements[1])) {
    throw new Error('Unexpected Batch 4 migration SQL shape; review the migration file')
  }
  const tables = Object.keys(columns)
  for (let i = 0; i < tables.length; i++) {
    const table = tables[i]
    let schema = await inspectTable(db, table)
    const state = columnProblems(table, schema)
    // A complete column group with a missing index/FK is a recognized recovery
    // point. Incompatible metadata or arbitrary partial columns require review.
    const fullState = classify(table, schema)
    const incompatible = fullState.problems?.filter(problem =>
      !(problem.includes('promotion index') && schema.index.length === 0) &&
      !(problem.includes('promotion foreign key') && schema.foreignKeys.length === 0)) || []
    if ((state !== 'missing' && state !== 'complete') ||
        (state === 'missing' && (schema.index.length || schema.foreignKeys.length)) ||
        (state === 'complete' && incompatible.length)) {
      throw new Error(`Unsafe partial Batch 4 migration for ${table}: ${(fullState.problems || []).join('; ')}. Manual review required.`)
    }

    // Split only at top-level commas, preserving VARCHAR sizes, index columns,
    // and the immutable migration's exact column/constraint definitions.
    const body = statements[i].replace(/^ALTER TABLE \w+\s+/i, '')
    const operations = []
    let depth = 0, start = 0
    for (let n = 0; n < body.length; n++) {
      if (body[n] === '(') depth++
      else if (body[n] === ')') depth--
      else if (body[n] === ',' && depth === 0) { operations.push(body.slice(start, n).trim()); start = n + 1 }
    }
    operations.push(body.slice(start).trim())
    const columnOperations = operations.filter(op => /^ADD COLUMN /i.test(op))
    if (columnOperations.length !== Object.keys(columns[table]).length ||
        operations.some(op => !/^ADD (COLUMN|INDEX|CONSTRAINT) /i.test(op)) ||
        operations.length !== columnOperations.length + (table === 'appointments' ? 2 : 0)) {
      throw new Error('Unexpected Batch 4 ALTER operations; review the migration file')
    }
    if (state === 'missing') {
      await db.query(`ALTER TABLE ${table}\n  ${columnOperations.join(',\n  ')}`)
      schema = await inspectTable(db, table)
      if (columnProblems(table, schema) !== 'complete') throw new Error(`Batch 4 column verification failed for ${table}`)
    }
    if (table === 'appointments') {
      if (!schema.index.length) await db.query(`ALTER TABLE ${table} ${operations.find(op => /^ADD INDEX /i.test(op))}`)
      if (!schema.foreignKeys.length) await db.query(`ALTER TABLE ${table} ${operations.find(op => /^ADD CONSTRAINT /i.test(op))}`)
    }
    const after = classify(table, await inspectTable(db, table))
    if (after !== 'complete') {
      const detail = after === 'missing' ? 'schema did not change' : after.problems.join('; ')
      throw new Error(`Batch 4 migration verification failed for ${table}: ${detail}`)
    }
  }
}

module.exports = { MIGRATION_FILE, runSelectedPromotionMigration, verifyPromotionSchema }
