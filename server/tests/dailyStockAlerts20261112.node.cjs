const test = require('node:test'), assert = require('node:assert/strict'), fs = require('node:fs'), path = require('node:path')
const { harness } = require('./helpers/dailyStockAlertsHarness.cjs')
const plain = value => JSON.parse(JSON.stringify(value))

test('stock summary uses available units, expiry boundaries and all non-archived stocked batches', () => {
  const { summarize } = harness()
  const items = [
    { stock: 9, available_stock: 0, threshold: 5 },
    { stock_base: 30, unit_size: 10, threshold: 3 },
    { stock: 10, threshold: 5, batches: [{ quantity: 1, expiration_date: '2026-11-11' }, { quantity: 3, expiration_date: '2026-12-12' }] },
    { stock: 10, threshold: 5, batches: [{ quantity: 2, expiration_date: '2026-12-13' }, { quantity: 2, expiration_date: '2026-11-12', archived_at: '2026-11-01' }, { quantity: 0, expiration_date: '2026-11-20' }, { quantity: 3, available_quantity: 0, expiration_date: '2026-11-20' }] },
    { stock: 10, threshold: 5, expiration_date: '2026-11-12' },
    { stock: 0, threshold: 5, archived_at: '2026-11-01' },
    { stock: 10, expiration_date: '0000-00-00' },
  ]
  assert.deepEqual(plain(summarize(items, '2026-11-12')), { low_stock: 1, out_of_stock: 1, expiring_30_days: 2, expired: 1, items_with_alerts: 4 })
})

test('daily alerts reach only eligible branch accounts and active Super Admins, with no stock writes', async () => {
  const h = harness(), result = await h.create().run()
  assert.deepEqual(plain(result), { delivered: 3, failed: 0 })
  assert.deepEqual(h.state.notifications.map(row => `${row.target_role}:${row.target_user_id}`).sort(), ['admin:1','admin:9','staff:1'])
  assert.ok(h.state.notifications.every(row => row.branch_id === 1 && row.reference_type === 'inventory_alert'))
  assert.match(h.state.notifications[0].message, /1 low stock; 1 out of stock; 1 expiring within 30 days/)
  assert.ok(h.state.notifications.find(row => row.target_user_id === 9).link.startsWith('/superadmin/branches/1/inventory'))
  assert.equal(h.state.emissions.length, 3)
  assert.ok(h.state.emissions.some(args => args[0][0] === 'superadmin_9'))
  assert.ok(h.state.calls.filter(call => !call.sql.startsWith('SELECT')).every(call => /^(?:INSERT(?: IGNORE)? INTO (?:notifications|inventory_daily_alert_deliveries)|UPDATE inventory_daily_alert_deliveries)/.test(call.sql)))
})

test('healthy branches send nothing and later alerts can still be sent on that day', async () => {
  const h = harness(), worker = h.create()
  h.state.items = [{ id: 1, branch_id: 1, stock: 10, threshold: 5 }]
  assert.equal((await worker.run()).delivered, 0)
  assert.equal(h.state.ledger.size, 0)
  h.state.items[0].stock = 1
  assert.equal((await worker.run()).delivered, 3)
})

test('reruns and restarted workers deduplicate per account, branch and Philippine date', async () => {
  const h = harness(), first = h.create()
  h.state.now = new Date('2026-11-12T15:59:00Z')
  await first.run(); await first.run(); await h.create().run()
  assert.equal(h.state.notifications.length, 3)
  assert.ok([...h.state.ledger.keys()].every(key => key.includes('|2026-11-12|')))
  h.state.now = new Date('2026-11-12T16:00:00Z')
  await first.run()
  assert.equal(h.state.notifications.length, 6)
  assert.ok([...h.state.ledger.keys()].some(key => key.includes('|2026-11-13|')))
})

test('parallel workers cannot duplicate deliveries and each branch has independent reminders', async () => {
  const h = harness()
  h.state.items.find(row => row.branch_id === 2).stock = 1
  await Promise.all([h.create().run(), h.create().run()])
  assert.equal(h.state.notifications.length, 6)
  assert.equal(h.state.ledger.size, 6)
  assert.equal(h.state.notifications.filter(row => row.branch_id === 2).length, 3)
})

test('a failed notification rolls back its delivery reservation and retries without duplicating successes', async () => {
  const h = harness(), worker = h.create()
  h.state.failRecipient = 'staff:1'
  assert.deepEqual(plain(await worker.run()), { delivered: 2, failed: 1 })
  assert.equal(h.state.ledger.size, 2)
  h.state.failRecipient = null
  assert.equal((await worker.run()).delivered, 1)
  assert.equal(h.state.notifications.length, 3)
  assert.equal(h.state.ledger.size, 3)
})

test('worker requires the migration, starts one five-minute timer and runs an immediate scan', async () => {
  const h = harness(), worker = h.create()
  h.state.missingLedger = true
  await assert.rejects(worker.start(), /migration required/)
  assert.equal(h.state.schedules.length, 0)
  h.state.missingLedger = false
  await worker.start(); await worker.start()
  await new Promise(resolve => setImmediate(resolve))
  assert.equal(h.state.schedules.length, 1)
  assert.equal(h.state.schedules[0].delay, 300000)
  assert.equal(h.state.notifications.length, 3)
  worker.stop(); assert.equal(h.state.unscheduled.length, 1)
})

test('migration is additive, repeatable and registered without changing old migration contents', () => {
  const root = path.resolve(__dirname, '..'), file = '2026-11-12-daily-stock-alerts.sql'
  const sql = fs.readFileSync(path.join(root, 'db/migrations', file), 'utf8')
  assert.match(sql, /CREATE TABLE IF NOT EXISTS inventory_daily_alert_deliveries/)
  assert.match(sql, /PRIMARY KEY \(branch_id,alert_date,target_role,target_user_id\)/)
  assert.doesNotMatch(sql, /\b(?:DROP|TRUNCATE|DELETE|ALTER|UPDATE)\b/i)
  assert.ok(fs.readFileSync(path.join(root, 'scripts/branchMigrations.js'), 'utf8').includes(file))
  assert.ok(fs.readFileSync(path.join(root, 'scripts/verifyDeployment.js'), 'utf8').includes('inventory_daily_alert_deliveries'))
})

test('stock alert destinations enforce account ownership, branch scope and inventory permission', async () => {
  const h = harness(); await h.create().run()
  const admin = h.state.notifications.find(row => row.target_role === 'admin' && row.target_user_id === 1)
  const superadmin = h.state.notifications.find(row => row.target_user_id === 9)
  const staff = h.state.notifications.find(row => row.target_role === 'staff')
  assert.equal((await h.destination({ id: admin.id, role: 'admin', userId: 1, branchId: 1, permissions: ['inventory'] })).path, '/admin/inventory')
  assert.equal((await h.destination({ id: superadmin.id, role: 'admin', userId: 9, superadmin: true })).path, '/superadmin/branches/1/inventory')
  assert.equal((await h.destination({ id: staff.id, role: 'staff', userId: 1, branchId: 1 })).path, '/staff/inventory')
  await assert.rejects(h.destination({ id: admin.id, role: 'admin', userId: 1, branchId: 2, permissions: ['inventory'] }), error => error.statusCode === 404)
  await assert.rejects(h.destination({ id: admin.id, role: 'admin', userId: 2, branchId: 1, permissions: ['inventory'] }), error => error.statusCode === 404)
  await assert.rejects(h.destination({ id: staff.id, role: 'staff', userId: 1, branchId: 1, permissions: [] }), error => error.statusCode === 403)
  await assert.rejects(h.destination({ id: admin.id, role: 'patient', userId: 1 }), error => error.statusCode === 404)
  h.state.branches[0].is_active = 0
  await assert.rejects(h.destination({ id: admin.id, role: 'admin', userId: 1, branchId: 1, permissions: ['inventory'] }), error => error.statusCode === 410)
})

test('personal Super Admin live alerts reach the selected account without leaking to another Super Admin', () => {
  const sse = require('../utils/sse'), first = [], second = [], branchAdmin = []
  const unregister = [sse.registerClient('superadmin', 9, { write: data => first.push(data) }), sse.registerClient('superadmin', 10, { write: data => second.push(data) }), sse.registerClient('admin', 1, { write: data => branchAdmin.push(data) }, { branchId: 1 })]
  try {
    assert.equal(sse.broadcast(['superadmin_9'], 'notification_created', { type: 'stock_daily_alert' }, { branchId: 1 }), 1)
    assert.equal(first.length, 1); assert.equal(second.length, 0); assert.equal(branchAdmin.length, 0)
  } finally { unregister.forEach(remove => remove()) }
})
