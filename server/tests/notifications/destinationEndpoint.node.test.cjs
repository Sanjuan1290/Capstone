const test = require('node:test')
const assert = require('node:assert/strict')
const { readFileSync } = require('node:fs')
const vm = require('node:vm')
const { notificationDestination } = require('../../utils/notificationDestination')

// Exercise the controller with the real resolver and an in-memory query adapter.
const controllerSource = readFileSync(require.resolve('../../controllers/common.controller'), 'utf8')
const setup = ({ branch = 1, deleted = false } = {}) => {
  const calls = []
  const executor = {
    query: async (sql, args) => {
      calls.push({ sql, args })
      if (sql.includes('FROM notifications')) return [[{
        id: 4, branch_id: branch, reference_type: 'billing_record', reference_id: 6,
      }]]
      return [deleted ? [] : [{ id: 6, branch_id: branch }]]
    },
  }
  const context = {
    module: { exports: {} },
    require: id => id === '../utils/notificationDestination'
      ? { notificationDestination: options => notificationDestination(options, executor) }
      : {},
  }
  vm.runInNewContext(controllerSource, context)
  const response = { json(value) { this.body = value } }
  return { handler: context.module.exports.getNotificationDestination, response, calls }
}
const request = (overrides = {}) => ({
  params: { id: '4' }, user: { id: 8, role: 'admin' },
  branchId: 1, authCookieName: 'admin_token', adminPermissions: ['billing'],
  ...overrides,
})

test('Branch Admin destination uses session identity, branch and permissions without marking read', async () => {
  const { handler, response, calls } = setup()
  await handler(request({ query: { role: 'superadmin', branch_id: 99 } }), response)
  assert.deepEqual(response.body, { path: '/admin/billing/checkout/6' })
  assert.deepEqual(calls[0].args, ['4', 'admin', 8, 1])
  assert.match(calls[0].sql, /AND branch_id=\?/)
  assert.ok(calls.every(({ sql }) => sql.startsWith('SELECT')))
})

test('only the Super Admin session resolves cross-branch destinations', async () => {
  const { handler, response, calls } = setup({ branch: 3 })
  await handler(request({ authCookieName: 'superadmin_token', branchId: undefined }), response)
  assert.deepEqual(response.body, { path: '/superadmin/branches/3/billing/checkout/6' })
  assert.deepEqual(calls[0].args, ['4', 'admin', 8])
})

test('destination controller preserves permission and deleted-record errors', async () => {
  const denied = setup()
  await assert.rejects(() => denied.handler(request({ adminPermissions: [] }), denied.response), { statusCode: 403 })
  assert.equal(denied.response.body, undefined)

  const deleted = setup({ deleted: true })
  await assert.rejects(() => deleted.handler(request(), deleted.response), { statusCode: 410 })
  assert.equal(deleted.response.body, undefined)
})
