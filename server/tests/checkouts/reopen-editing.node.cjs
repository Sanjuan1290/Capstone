// Dependency-free controller regression tests. Run with:
//   node --test server/tests/checkouts/reopen-editing.node.cjs  (from repository root)
// The controller is evaluated with a mocked database connection so these tests
// cannot modify a clinic database. No Vitest packages or running MySQL required.
const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const vm = require('node:vm')

const source = fs.readFileSync(path.join(__dirname, '../../controllers/staff.controller.js'), 'utf8')
const start = source.indexOf('const reopenBillForEditing = async (req, res) => {')
const finish = source.indexOf('\nconst payBill = async', start)
assert.ok(start >= 0 && finish > start, 'Expected checkout reopening controller is present')
const controllerCode = source.slice(start, finish)

const setup = (options = {}) => {
  const record = {
    id: 7,
    version: options.version ?? 3,
    status: options.status ?? 'ready',
    paid_at: options.paidAt ?? null,
  }
  const state = { queries: [], auditLogs: [], events: [], begun: 0, committed: 0, rolledBack: 0, released: 0, connections: 0 }
  const connection = {
    beginTransaction: async () => { state.begun += 1 },
    commit: async () => { state.committed += 1 },
    rollback: async () => { state.rolledBack += 1 },
    release: () => { state.released += 1 },
    query: async (sql, params) => {
      state.queries.push({ sql, params })
      if (sql.startsWith('SELECT * FROM billing_records')) return [options.absent ? [] : [{ ...record }]]
      if (sql.includes('FROM billing_payments')) return [[{ count: options.payments ?? 0 }]]
      if (sql.includes('FROM billing_item_batch_usage')) return [[{ count: options.stockUsage ?? 0 }]]
      if (sql.includes('UPDATE billing_records')) {
        if (options.failedUpdate) return [{ affectedRows: 0 }]
        record.status = 'draft'
        record.version += 1
        return [{ affectedRows: 1 }]
      }
      throw new Error(`Unexpected SQL statement: ${sql}`)
    },
  }
  const handler = vm.runInNewContext(`${controllerCode}\nreopenBillForEditing`, {
    db: { getConnection: async () => { state.connections += 1; return connection } },
    writeAuditLog: async (entry, conn) => { assert.equal(conn, connection); state.auditLogs.push(entry) },
    broadcast: (...args) => { state.events.push(args) },
    getBillingRecordWithItems: async () => ({ ...record, payments: [], items: [] }),
  })
  const req = {
    params: { id: '7' },
    body: { expected_version: options.expectedVersion ?? 3 },
    user: { id: 15, role: options.role ?? 'staff' },
    ip: '127.0.0.1',
  }
  const res = {
    statusCode: 200,
    payload: null,
    status(code) { this.statusCode = code; return this },
    json(payload) { this.payload = payload; return this },
  }
  return { handler, state, req, res }
}

const assertUnchanged = (state) => {
  assert.equal(state.committed, 0)
  assert.equal(state.auditLogs.length, 0)
  assert.equal(state.events.length, 0)
}

test('reopens confirmed unpaid staff bill, increments version, audits, and broadcasts after commit', async () => {
  const { handler, state, req, res } = setup()
  await handler(req, res)
  assert.equal(res.statusCode, 200)
  assert.equal(res.payload.status, 'draft')
  assert.equal(res.payload.version, 4)
  assert.equal(state.committed, 1)
  assert.equal(state.rolledBack, 0)
  assert.equal(state.released, 1)
  assert.equal(state.auditLogs[0].action, 'billing.reopened_for_editing')
  assert.equal(state.auditLogs[0].userRole, 'staff')
  assert.equal(state.events[0][1], 'billing_reopened')
  assert.ok(state.queries.some((q) => q.sql.includes('FOR UPDATE')))
  assert.ok(state.queries.some((q) => q.sql.includes('FROM billing_payments')))
  assert.ok(state.queries.some((q) => q.sql.includes('FROM billing_item_batch_usage')))
})

test('supports Admin checkout using the same version-controlled controller', async () => {
  const { handler, state, req, res } = setup({ role: 'admin' })
  await handler(req, res)
  assert.equal(res.statusCode, 200)
  assert.equal(state.auditLogs[0].userRole, 'admin')
})

test('rejects invalid or stale versions without updating the bill', async () => {
  for (const version of [0, -1, 'invalid']) {
    const { handler, state, req, res } = setup()
    req.body.expected_version = version
    await handler(req, res)
    assert.equal(res.statusCode, 400)
    assert.equal(res.payload.code, 'BILL_VERSION_REQUIRED')
    assert.equal(state.connections, 0)
  }
  const { handler, state, req, res } = setup({ expectedVersion: 2 })
  await handler(req, res)
  assert.equal(res.statusCode, 409)
  assert.equal(res.payload.code, 'BILL_VERSION_CONFLICT')
  assertUnchanged(state)
})

test('rejects paid, partially paid, voided, and already-draft bill statuses', async () => {
  for (const status of ['paid', 'partially_paid', 'voided', 'draft']) {
    const { handler, state, req, res } = setup({ status })
    await handler(req, res)
    assert.equal(res.statusCode, 409)
    assert.equal(res.payload.code, 'BILL_NOT_EDITABLE')
    assertUnchanged(state)
  }
})

test('rejects ANY payment history, including voided/refunded entries', async () => {
  for (const options of [{ payments: 1 }, { paidAt: '2026-10-08 10:00:00' }]) {
    const { handler, state, req, res } = setup(options)
    await handler(req, res)
    assert.equal(res.statusCode, 409)
    assert.equal(res.payload.code, 'BILL_HAS_PAYMENT_HISTORY')
    assertUnchanged(state)
  }
})

test('rejects prior checkout stock movements', async () => {
  const { handler, state, req, res } = setup({ stockUsage: 1 })
  await handler(req, res)
  assert.equal(res.statusCode, 409)
  assert.equal(res.payload.code, 'BILL_HAS_STOCK_HISTORY')
  assertUnchanged(state)
})

test('rejects missing bills and update races and rolls back', async () => {
  const missing = setup({ absent: true })
  await missing.handler(missing.req, missing.res)
  assert.equal(missing.res.statusCode, 404)
  assertUnchanged(missing.state)
  const raced = setup({ failedUpdate: true })
  await raced.handler(raced.req, raced.res)
  assert.equal(raced.res.statusCode, 409)
  assert.equal(raced.res.payload.code, 'BILL_VERSION_CONFLICT')
  assertUnchanged(raced.state)
  assert.equal(raced.state.rolledBack, 1)
})

test('admin correction route remains distinct from the checkout edit route', () => {
  const adminRoutes = fs.readFileSync(path.join(__dirname, '../../routers/admin.router.js'), 'utf8')
  const adminServices = fs.readFileSync(path.join(__dirname, '../../../client/src/services/admin.service.js'), 'utf8')
  assert.match(adminRoutes, /router\.post\('\/billing\/:id\/reopen', \.\.\.auth, correctionsCtrl\.reopenBill\)/)
  assert.match(adminRoutes, /router\.post\('\/billing\/:id\/reopen-for-editing', \.\.\.auth, staffCtrl\.reopenBillForEditing\)/)
  assert.match(adminServices, /export const reopenAdminCheckoutBill = .*billing\/\$\{id\}\/reopen-for-editing/)
})

