// Exercise the complete controller module so missing payment imports are caught.
// All database access is mocked; these tests never write to a clinic database.
const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const vm = require('node:vm')
const { createRequire } = require('node:module')

function loadModule(filename, resolve) {
  const module = { exports: {} }
  vm.runInNewContext(fs.readFileSync(filename, 'utf8'), {
    module, exports: module.exports, require: resolve,
  }, { filename })
  return module.exports
}

const billingFile = path.resolve(__dirname, '../../utils/billing.js')
const billingRequire = createRequire(billingFile)
const billing = loadModule(billingFile, name => name === '../db/connect'
  ? { query() { throw new Error('Unexpected real database access') } }
  : billingRequire(name))

function setup(role = 'staff', total = 1500) {
  const record = { id: 7, branch_id: 2, status: 'ready', total_amount: total, items: [] }
  const payments = []
  const state = { committed: 0, rolledBack: 0, released: 0, receipts: 0, stockChecks: 0, audits: [], events: [] }
  const conn = {
    async beginTransaction() {},
    async commit() { state.committed++ },
    async rollback() { state.rolledBack++ },
    release() { state.released++ },
    async query(sql, args = []) {
      if (sql.includes('FROM billing_payments bp JOIN billing_records')) {
        return [payments.filter(p => p.idempotency_key === args[0]).map(() => ({ billing_id: 7, branch_id: 2 }))]
      }
      if (sql.startsWith('SELECT * FROM billing_records')) {
        assert.deepEqual(Array.from(args), [7, 2])
        return [[{ ...record }]]
      }
      if (sql.includes('FROM payment_gateway_attempts')) return [[]]
      if (sql.startsWith('SELECT code FROM clinic_branches')) return [[{ code: 'TEST' }]]
      if (sql.startsWith('INSERT IGNORE INTO branch_receipt_sequences')) return [{ affectedRows: 0 }]
      if (sql.startsWith('UPDATE branch_receipt_sequences')) return [{ insertId: ++state.receipts }]
      if (sql.includes('INSERT INTO billing_payments')) {
        payments.push({
          amount: args[1], payment_method: args[2], amount_received: args[4], change_amount: args[5],
          receipt_number: args[6], received_by_staff_id: args[8], received_by_admin_id: args[9],
          idempotency_key: args[10],
        })
        return [{ insertId: payments.length }]
      }
      if (sql.includes('UPDATE billing_records')) {
        record.status = args[0]
        return [{ affectedRows: 1 }]
      }
      throw new Error(`Unexpected payment SQL: ${sql}`)
    },
  }
  const imports = {
    '../db/connect': {
      async getConnection() { return conn },
      async query(sql) {
        assert.match(sql, /FROM branch_payment_settings/)
        return [[{ is_enabled: 1 }]]
      },
    },
    '../utils/billing': {
      ...billing,
      async getBillingRecordWithItems() {
        return { ...record, payments: [...payments], balance_amount: total - payments.reduce((sum, p) => sum + p.amount, 0) }
      },
    },
    '../utils/payments': require('../../utils/payments'),
    '../utils/inputValidation': require('../../utils/inputValidation'),
    '../utils/date': require('../../utils/date'),
    './billingCorrections.controller': { async assertCashierOpen() {} },
    '../utils/clinicalInventoryReservations': {
      isUnifiedBillingStockOut: () => false,
      async assertNoUnpostedStockWithFeatureOff() { state.stockChecks++ },
    },
    '../utils/audit': { async writeAuditLog(entry) { state.audits.push(entry) } },
    '../utils/sse': { broadcast(...args) { state.events.push(args) } },
  }
  // Other imports belong to unrelated controller actions and are not executed.
  const controller = loadModule(path.resolve(__dirname, '../../controllers/staff.controller.js'), name => imports[name] || {})
  const req = {
    params: { id: '7' }, branchId: 2, user: { id: 15, role }, ip: '127.0.0.1',
    body: { payment_method: 'cash', payment_amount: 1500, amount_received: 2000, idempotency_key: 'checkout-payment-test' },
  }
  const res = {
    statusCode: 200,
    status(code) { this.statusCode = code; return this },
    json(payload) { this.payload = payload; return this },
  }
  return { pay: controller.payBill, req, res, state, payments }
}

for (const role of ['staff', 'admin']) {
  test(`${role} confirms a PHP 1500 cash payment with PHP 2000 received and PHP 500 change`, async () => {
    const { pay, req, res, state, payments } = setup(role)
    await pay(req, res)
    assert.equal(res.statusCode, 200)
    assert.equal(res.payload.status, 'paid')
    assert.equal(res.payload.balance_amount, 0)
    assert.equal(payments.length, 1)
    assert.equal(payments[0].amount, 1500)
    assert.equal(payments[0].amount_received, 2000)
    assert.equal(payments[0].change_amount, 500)
    assert.equal(payments[0].received_by_staff_id, role === 'staff' ? 15 : null)
    assert.equal(payments[0].received_by_admin_id, role === 'admin' ? 15 : null)
    assert.match(payments[0].receipt_number, /^OR-TEST-\d{8}-000001$/)
    assert.equal(state.committed, 1)
    assert.equal(state.rolledBack, 0)
    assert.equal(state.released, 1)
    assert.equal(state.stockChecks, 1)
    assert.equal(state.audits[0].action, 'billing.payment_received')
    assert.equal(state.events[0][1], 'billing_paid')
  })
}

test('accepts centavo precision for full payments and cash tendered', async () => {
  const { pay, req, res, state, payments } = setup('staff', 875.25)
  Object.assign(req.body, { payment_amount: 875.25, amount_received: 1000.50 })
  await pay(req, res)
  assert.equal(res.statusCode, 200)
  assert.equal(res.payload.status, 'paid')
  assert.equal(res.payload.balance_amount, 0)
  assert.equal(payments[0].change_amount, 125.25)
  assert.equal(state.stockChecks, 1)
  assert.equal(state.committed, 1)
})

test('rejects partial collections before allocating a receipt or recording a payment', async () => {
  const { pay, req, res, state, payments } = setup()
  req.body.payment_amount = 1000
  await pay(req, res)
  assert.equal(res.statusCode, 400)
  assert.equal(res.payload.code, 'FULL_PAYMENT_REQUIRED')
  assert.equal(payments.length, 0)
  assert.equal(state.receipts, 0)
  assert.equal(state.committed, 0)
  assert.equal(state.rolledBack, 1)
})

test('exact cash payment records the full bill with zero change', async () => {
  const { pay, req, res, payments } = setup()
  req.body.amount_received = 1500
  await pay(req, res)
  assert.equal(res.statusCode, 200)
  assert.equal(res.payload.status, 'paid')
  assert.equal(payments[0].amount, 1500)
  assert.equal(payments[0].change_amount, 0)
})

test('cash below the calculated bill is rejected without a receipt or payment', async () => {
  const { pay, req, res, payments, state } = setup()
  req.body.amount_received = 1499.99
  await pay(req, res)
  assert.equal(res.statusCode, 400)
  assert.equal(payments.length, 0)
  assert.equal(state.receipts, 0)
  assert.equal(state.committed, 0)
})

for (const [field, value, message] of [
  ['payment_amount', 1500.001, 'Payment amounts must have at most two decimal places.'],
  ['amount_received', 2000.001, 'Cash received must have at most two decimal places.'],
]) {
  test(`rejects excess decimal places in ${field} without recording a payment`, async () => {
    const { pay, req, res, state, payments } = setup()
    req.body[field] = value
    await pay(req, res)
    assert.equal(res.statusCode, 400)
    assert.equal(res.payload.message, message)
    assert.equal(payments.length, 0)
    assert.equal(state.receipts, 0)
    assert.equal(state.committed, 0)
    assert.equal(state.rolledBack, 1)
    assert.equal(state.released, 1)
  })
}

test('retrying a confirmed request returns the bill without recording a second payment', async () => {
  const { pay, req, res, state, payments } = setup()
  await pay(req, res)
  await pay(req, res)
  assert.equal(res.statusCode, 200)
  assert.equal(res.payload.status, 'paid')
  assert.equal(payments.length, 1)
  assert.equal(state.receipts, 1)
  assert.equal(state.committed, 1)
  assert.equal(state.audits.length, 1)
})
