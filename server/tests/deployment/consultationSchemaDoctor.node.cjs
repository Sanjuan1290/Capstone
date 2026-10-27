const { test } = require('node:test')
const assert = require('node:assert/strict')
const { REQUIRED_FIELDS, evaluateSchema, diagnose, PROMOTION_MIGRATION } = require('../../scripts/diagnoseConsultationSchema')
const asRows = (fields = REQUIRED_FIELDS) => Object.entries(fields).flatMap(([table, columns]) => columns.map(column => ({ TABLE_NAME: table, COLUMN_NAME: column })))

test('complete schema succeeds and metadata queries are strictly read-only', async () => {
  const calls = []
  const db = { query: async (sql, params) => {
    calls.push(sql)
    if (/information_schema\.COLUMNS/.test(sql)) return [asRows()]
    if (/information_schema\.TABLES/.test(sql)) return [[{ TABLE_NAME: 'schema_migrations' }]]
    return [[{ filename: PROMOTION_MIGRATION }]]
  }}
  const result = await diagnose(db)
  assert.equal(result.ok, true)
  assert.equal(result.promotionMigrationRecorded, true)
  assert(calls.every(sql => /^SELECT\s/i.test(sql)), 'diagnostic must never write')
})

test('old backup-like schema identifies promotion dependencies in booking and billing', () => {
  const old = asRows().filter(row => !row.COLUMN_NAME.startsWith('promotion_'))
  const result = evaluateSchema(old, false)
  assert.equal(result.ok, false)
  assert.equal(result.promotionSchemaIncomplete, true)
  assert(result.missing.some(item => item.table === 'appointments' && item.column === 'promotion_id'))
  assert(result.missing.some(item => item.table === 'billing_records' && item.column === 'promotion_review_outcome'))
  assert(result.affectedFeatures.includes('promotion'))
})

test('consultation missing prescription_status is flagged in the same check', () => {
  const rows = asRows().filter(row => !(row.TABLE_NAME === 'consultations' && row.COLUMN_NAME === 'prescription_status'))
  const result = evaluateSchema(rows, true)
  assert(result.missing.some(item => item.table === 'consultations' && item.column === 'prescription_status'))
})

test('deployment gate covers all Batch 4 fields queried by the billing reader', () => {
  const fs = require('node:fs')
  const path = require('node:path')
  const root = path.join(__dirname, '..', '..')
  const billingReader = fs.readFileSync(path.join(root, 'utils', 'billing.js'), 'utf8')
  const gate = fs.readFileSync(path.join(root, 'scripts', 'verifyDeployment.js'), 'utf8')
  for (const col of REQUIRED_FIELDS.appointments.filter(name => name.startsWith('promotion_'))) {
    assert(billingReader.includes(`a.${col}`), `billing reader stopped selecting ${col}; update contracts if intentional`)
    assert(gate.includes(`'${col}'`), `deployment verifier must require ${col}`)
  }
  for (const col of REQUIRED_FIELDS.billing_records.filter(name => name.startsWith('promotion_'))) {
    assert(gate.includes(`'${col}'`), `deployment verifier must require ${col}`)
  }
})

