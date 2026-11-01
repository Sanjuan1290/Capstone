const test = require('node:test')
const assert = require('node:assert/strict')

// The utility defaults to a DB connection, but tests inject a read-only mock.
// Fake only its require-time DB import so no live database or secrets are used.
const dbPath = require.resolve('../db/connect')
const original = require.cache[dbPath]
require.cache[dbPath] = { id: dbPath, filename: dbPath, loaded: true, exports: { query() { throw Error('Use injected query fixture') } } }
const { listBranchPatients, getBranchPatientRecord } = require('../utils/patientRecordView')
if (original) require.cache[dbPath] = original
else delete require.cache[dbPath]

const patient = { id: 11, full_name: 'Example Patient', phone: '09999999999' }
const appointment = { id: 22, branch_id: 3, status: 'completed', date: '2026-10-21', doctor_name: 'Dr. Sample', time: '09:00', reason: 'Consultation' }
const bill = { id: 33, appointment_id: 22, status: 'partially_paid', subtotal: 1500, discount_amount: 0, total_amount: 1500, doctor_name: 'Dr. Sample' }
const service = { id: 44, billing_id: 33, appointment_id: 22, item_type: 'service', service_name: 'Medical Consultation', quantity: 1, unit_price: 1500, line_total: 1500 }
const payments = [
  { id: 55, billing_id: 33, amount: 1000, refund_amount: 200, status: 'completed', receipt_number: 'RCPT-55' },
  { id: 56, billing_id: 33, amount: 500, refund_amount: 0, status: 'voided', receipt_number: 'RCPT-56' },
]
function mockExecutor(calls = []) {
  return { async query(sql, args) {
    calls.push({ sql, args })
    if (sql.includes('SELECT COUNT(*) AS total')) return [[{ total: 21 }]]
    if (sql.includes('AS name,p.full_name')) return [[patient]]
    if (sql.includes('FROM patients p WHERE p.id=?')) return [[patient]]
    if (sql.includes('FROM appointments a')) return [[appointment]]
    if (sql.includes("i.item_type='service'")) return [[service]]
    if (sql.includes('FROM billing_records b')) return [[bill]]
    if (sql.includes('FROM billing_items i JOIN billing_records b')) return [[service]]
    if (sql.includes('FROM billing_payments pay')) return [payments]
    if (sql.includes('FROM clinic_branches cb')) return [[{ clinic_name: 'Example Clinic - Branch 3' }]]
    throw Error(`Unexpected query: ${sql}`)
  } }
}

test('directory paginates and searches only within the selected branch', async () => {
  const calls = []
  const result = await listBranchPatients({ branchId: 3, search: 'Example', page: 2, limit: 10, executor: mockExecutor(calls) })
  assert.equal(result.total, 21)
  assert.equal(result.totalPages, 3)
  assert.equal(result.page, 2)
  assert.equal(result.patients.length, 1)
  assert.ok(calls.every(c => c.sql.includes('a.branch_id=?')))
  assert.deepEqual(calls[1].args.slice(-2), [10, 10])
  assert.equal(calls[0].args[0], 3)
  assert.equal(calls[0].args[3], '__NO_PHONE_MATCH__', 'Text-only search must not match every phone')
})

test('Philippine phone search accepts 09 and 63 forms', async () => {
  const calls = []
  await listBranchPatients({ branchId: 3, search: '09171234567', executor: mockExecutor(calls) })
  assert.ok(calls[0].args.includes('%09171234567%'))
  assert.ok(calls[0].args.includes('%639171234567%'))
  const international = []
  await listBranchPatients({ branchId: 3, search: '639171234567', executor: mockExecutor(international) })
  assert.ok(international[0].args.includes('%09171234567%'))
})

test('patient without a visit in this branch is not returned', async () => {
  let seen = 0
  const record = await getBranchPatientRecord({ branchId: 3, patientId: 11, executor: { query: async () => { seen++; return [[]] } } })
  assert.equal(record, null)
  assert.equal(seen, 1)
})

test('staff lacking billing permission receives doctor and services, but no payment amounts or receipt identifiers', async () => {
  const calls = []
  const record = await getBranchPatientRecord({ branchId: 3, patientId: 11, canViewBilling: false, executor: mockExecutor(calls) })
  assert.equal(record.can_view_billing, false)
  assert.deepEqual(record.billing, [])
  assert.equal(record.history[0].doctor_name, 'Dr. Sample')
  assert.equal(record.history[0].recorded_services[0].service_name, 'Medical Consultation')
  assert.equal(record.history[0].recorded_services[0].unit_price, undefined)
  assert.ok(calls.every(c => !c.sql.includes('FROM billing_payments pay')))
  assert.ok(calls.every(c => !c.sql.includes('SELECT cb.name')))
})

test('authorized patient record connects exact visit, service, payment and receipt with refunded and voided payments excluded from net', async () => {
  const calls = []
  const record = await getBranchPatientRecord({ branchId: 3, patientId: 11, executor: mockExecutor(calls) })
  assert.equal(record.can_view_billing, true)
  assert.equal(record.billing.length, 1)
  assert.equal(record.billing[0].appointment_id, record.history[0].id)
  assert.equal(record.billing[0].paid_amount, 800)
  assert.equal(record.billing[0].balance_amount, 700)
  assert.equal(record.billing[0].payments.length, 2)
  assert.equal(record.billing[0].payments[0].receipt_number, 'RCPT-55')
  assert.equal(record.billing[0].items[0].service_name, 'Medical Consultation')
  assert.equal(record.receipt_clinic.clinic_name, 'Example Clinic - Branch 3')
  const scoped = calls.filter(c => c.sql.includes('FROM billing_records b') || c.sql.includes('JOIN billing_records b'))
  assert.ok(scoped.every(c => c.sql.includes('b.branch_id=?')), 'All financial child queries need the same branch predicate')
  assert.ok(scoped.every(c => c.args.includes(3)))
})

test('invalid patient or branch IDs avoid database queries', async () => {
  for (const patientId of [-1, 'abc', 0]) {
    const result = await getBranchPatientRecord({ branchId: 3, patientId, executor: { query: () => { throw Error('not allowed') } } })
    assert.equal(result, null)
  }
})
