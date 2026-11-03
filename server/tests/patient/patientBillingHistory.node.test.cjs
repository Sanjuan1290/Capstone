const test = require('node:test')
const assert = require('node:assert/strict')
const { listMyBillingHistory, getMyBillDetails, classifyBill, normalizeFilter } = require('../../utils/patientBillingHistory')

test('rejects invalid filters before querying or exposing patient records', () => {
  for (const filter of [
    { branch_id: '2 OR 1=1' }, { branch_id: '-2' }, { status: 'hacked' },
    { date_from: '2026-02-31' }, { date_from: '2026-12-30', date_to: '2026-01-01' },
  ]) assert.throws(() => normalizeFilter(filter), /invalid|valid/i)
  assert.equal(normalizeFilter({ limit: '1000' }).pageSize, 50)
})

test('list is scoped to authenticated patient and keeps page/detail filters in SQL binds', async () => {
  const calls = []
  const executor = { query: async (sql, params) => {
    calls.push({ sql, params })
    if (sql.includes('COUNT(*) AS total_bills')) return [[{ total_bills: 2, paid_bills: 1, outstanding_balance: '175.00' }]]
    if (sql.includes('COUNT(*) AS total')) return [[{ total: 1 }]]
    return [[{ id: 22, status: 'finalized', total_amount: 300, paid_amount: 125, payment_status: 'partially_paid' }]]
  } }
  const result = await listMyBillingHistory({ patientId: 77, query: { branch_id: '3', search: 'Gloves', status: 'partially_paid', date_from: '2026-01-01', limit: '10' }, executor })
  assert.equal(result.bills[0].balance_amount, 175)
  assert.equal(result.summary.outstanding_balance, 175)
  assert.equal(result.total, 1)
  assert.equal(calls.length, 3)
  for (const call of calls) {
    assert.match(call.sql, /b\.patient_id = \?/)
    assert.ok(call.params.includes(77), 'patient id must be derived from authenticated caller')
    assert.doesNotMatch(call.sql, /Gloves/)
  }
  assert.ok(calls[0].params.includes('%Gloves%'))
  assert.match(calls[1].sql, /LIMIT \? OFFSET \?/)
})

test('bills reflect partial payments, refunds and voids without negative balances', () => {
  assert.equal(classifyBill({ status: 'finalized', total_amount: 455, paid_amount: 200 }).balance_amount, 255)
  assert.equal(classifyBill({ status: 'finalized', total_amount: 455, paid_amount: 200 }).payment_status, 'partially_paid')
  assert.equal(classifyBill({ status: 'draft', total_amount: 455, paid_amount: 0 }).payment_status, 'preparing')
  assert.equal(classifyBill({ status: 'finalized', total_amount: 455, paid_amount: 455 }).payment_status, 'paid')
  assert.equal(classifyBill({ status: 'voided', total_amount: 455, paid_amount: 0 }).balance_amount, 0)
  assert.equal(classifyBill({ status: 'refunded', total_amount: 455, paid_amount: 0 }).balance_amount, 0)
  assert.equal(classifyBill({ status: 'paid', total_amount: 455, paid_amount: 500 }).balance_amount, 0)
})

test('bill detail returns 404-style null before loading child records for another patient', async () => {
  const calls = []
  const executor = { query: async (sql, params) => { calls.push({ sql, params }); return [[]] } }
  const result = await getMyBillDetails({ patientId: 12, billingId: 100, executor })
  assert.equal(result, null)
  assert.equal(calls.length, 1)
  assert.match(calls[0].sql, /b\.id = \? AND b\.patient_id = \?/)
  assert.deepEqual(calls[0].params, [100, 12])
})

test('detail uses net payments and treats included supplies as not extra charge lines', async () => {
  const calls = []
  const executor = { query: async (sql, params) => {
    calls.push({ sql, params })
    if (sql.includes('FROM billing_records b')) return [[{ id: 100, status: 'finalized', total_amount: 455, subtotal: 455, patient_name: 'Example', branch_name: 'Branch', appointment_id: 8 }]]
    if (sql.includes('FROM billing_items')) return [[{ id: 3, item_type: 'service', service_name: 'Dressing', quantity: 1, unit_price: 455, line_total: 455, details_json: JSON.stringify({ materials: [{ material_name: 'Gloves', quantity: 1, unit_label: 'pair' }] }) }]]
    if (sql.includes('FROM billing_payments')) return [[
      { id: 4, amount: 200, refund_amount: 40, status: 'completed', receipt_number: 'R-1' },
      { id: 5, amount: 300, refund_amount: 0, status: 'voided', voided_at: '2026-11-01' },
    ]]
    throw new Error('Unexpected SQL')
  } }
  const result = await getMyBillDetails({ patientId: 12, billingId: 100, executor })
  assert.equal(result.paid_amount, 160)
  assert.equal(result.balance_amount, 295)
  assert.equal(result.items[0].line_total, 455)
  assert.equal(result.items[0].included_supplies[0].name, 'Gloves')
  assert.equal(result.payments.length, 2)
  assert.ok(calls.slice(1).every(call => call.params.length === 1 && call.params[0] === 100))
})
