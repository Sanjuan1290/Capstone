const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const source = fs.readFileSync(path.join(__dirname,'../../scripts/auditPatientDataReadOnly.js'), 'utf8')
test('audit requires explicit opt-in, SELECT-only credentials and does not contain writes', () => {
  assert.match(source,/CARAIT_ALLOW_READ_ONLY_AUDIT/)
  assert.match(source,/SELECT-only/)
  assert.doesNotMatch(source,/\b(?:DELETE|INSERT|UPDATE|TRUNCATE|REPLACE)\s+(?:FROM|INTO|\w+\s+SET)/i)
})
test('patient audit returns only aggregate counts; discount query is branch scoped', () => {
  assert.match(source,/COUNT\(\*\) AS patients/)
  assert.match(source,/SUM\(gender IS NOT NULL AND sex IS NOT NULL AND gender <> sex\)/)
  assert.match(source,/FROM patients/)
  assert.match(source,/FROM discount_presets/)
  assert.match(source,/ORDER BY branch_id/)
  assert.doesNotMatch(source,/SELECT \* FROM patients/)
})

test('aggregate audit issues only SELECTs and produces no individual patient records', async () => {
  const { runAudit } = require('../../scripts/auditPatientDataReadOnly')
  const queries=[]
  const report=await runAudit(async (sql,params=[])=>{
    queries.push({ sql:String(sql), params })
    if (String(sql).includes('FROM patients')) return [[{ patients: 5, missing_birthdate:1, demographic_mismatches:2 }]]
    return [[{ branch_id:1, label:'Standard', discount_type:'percentage', value:10, requires_admin_approval:1 }]]
  })
  assert.equal(queries.length, 2)
  assert.ok(queries.every(q => /^\s*SELECT /i.test(q.sql)))
  assert.equal(report.patient_aggregates.patients, 5)
  assert.equal(report.patient_aggregates.demographic_mismatches, 2)
  assert.equal(report.branch_discount_presets[0].branch_id, 1)
  assert.equal('patient_id' in report.patient_aggregates, false)
})
