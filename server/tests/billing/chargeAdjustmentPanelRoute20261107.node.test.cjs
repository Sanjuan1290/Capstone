// Dependency-free regression for the Branch Admin / Super Admin charge reductions GET route.
const test = require('node:test')
const assert = require('node:assert/strict')
const Module = require('node:module')
const path = require('node:path')

const bill = { id: 6, status: 'draft', version: 1, subtotal: 1095 }
let items = [{
  billing_id: 6, item_type: 'service', source_type: 'consultation',
  catalog_service_id: 77, service_name: 'Test treatment', quantity: 1,
  details_json: JSON.stringify({ pricing: { consultation_fee: 600 }, materials: [{
    inventory_id: 7, material_name: 'Cleanser', charge_total: 495,
  }] }),
}]
const queryLog = []
const conn = {
  async beginTransaction() {},
  async commit() {},
  async rollback() {},
  release() {},
  async query(sql, values) {
    queryLog.push({ sql, values })
    if (sql.includes('FROM billing_records') && !sql.includes('JOIN')) return [[bill]]
    if (sql.includes('FROM billing_charge_adjustments')) return [[]]
    if (sql.includes('FROM billing_items')) return [items]
    throw Error(`Unexpected SQL in GET smoke test: ${sql}`)
  },
}
const fakeDb = { async getConnection() { return conn } }

const originalLoad = Module._load
Module._load = function (request, parent, isMain) {
  const source = parent?.filename || ''
  if (source.endsWith(`${path.sep}utils${path.sep}chargeAdjustments.js`)) {
    if (request === '../db/connect') return fakeDb
    if (request === './audit') return { writeAuditLog: async () => {} }
  }
  if (source.endsWith(`${path.sep}routers${path.sep}branchChargeAdjustments.js`)) {
    if (request === '../db/connect') return fakeDb
    if (request === '../utils/sse') return { broadcast() {} }
  }
  return originalLoad.call(this, request, parent, isMain)
}
let finance, registerBranchChargeAdjustments
try {
  finance = require('../../utils/chargeAdjustments')
  ;({ registerBranchChargeAdjustments } = require('../../routers/branchChargeAdjustments'))
} finally {
  Module._load = originalLoad
}

function routes() {
  const handlers = new Map()
  const router = {
    get(url, ...args) { handlers.set(`GET ${url}`, args.at(-1)) },
    post(url, ...args) { handlers.set(`POST ${url}`, args.at(-1)) },
    patch(url, ...args) { handlers.set(`PATCH ${url}`, args.at(-1)) },
  }
  registerBranchChargeAdjustments(router, {
    requireSuper() {}, branchContext() {}, requirePermission: () => () => {},
  })
  return handlers
}

async function getAdjustmentList(role, billId = 6) {
  const handler = routes().get('GET /workspace/:branchId/legacy/billing/:id/charge-adjustments')
  let response, code = 200, nextError
  const res = {
    status(next) { code = next; return this },
    json(payload) { response = payload; return this },
  }
  await handler({ method: 'GET', params: { id: String(billId) }, branchId: 1,
    adminContext: { account_role: role }, user: { id: 8 } }, res, error => { nextError = error })
  if (nextError) throw nextError
  return { code, response }
}

test('the charge adjustment role helper exists with explicit Admin permissions', () => {
  assert.equal(finance.canAdjustDirectly('superadmin'), true)
  assert.equal(finance.canAdjustDirectly('admin'), true)
  assert.equal(finance.canAdjustDirectly('staff'), false)
  assert.equal(finance.canAdjustDirectly('doctor'), false)
  assert.equal(finance.canAdjustDirectly(null), false)
})

test('Super Admin GET loads charge reductions without a 500 error', async () => {
  queryLog.length = 0
  const { code, response } = await getAdjustmentList('superadmin')
  assert.equal(code, 200)
  assert.equal(response.can_adjust_directly, true)
  assert.equal(response.bill.id, 6)
  assert.equal(response.requests.length, 0)
  assert.deepEqual(response.targets.map(({ target_type, original_charge }) => [target_type, original_charge]), [
    ['service_fee', 600], ['consumable', 495],
  ])
  assert.equal(queryLog.some(({sql}) => /INSERT |UPDATE |DELETE /i.test(sql)), false)
})

test('Branch Admin GET retains expected response fields', async () => {
  const { code, response } = await getAdjustmentList('admin')
  assert.equal(code, 200)
  assert.equal(response.can_adjust_directly, true)
  assert.equal(response.actor.role, 'admin')
})

test('a malformed legacy materials field does not take down the checkout', async () => {
  const previous = items
  items = [{ ...previous[0], details_json: JSON.stringify({ pricing: { consultation_fee: 600 }, materials: { unexpected: true } }) }]
  try {
    const { code, response } = await getAdjustmentList('superadmin')
    assert.equal(code, 200)
    assert.equal(response.targets.length, 1)
    assert.equal(response.targets[0].original_charge, 600)
  } finally {
    items = previous
  }
})

test('null legacy materials records are skipped safely', async () => {
  const previous = items
  items = [{ ...previous[0], details_json: JSON.stringify({ pricing: { consultation_fee: 600 }, materials: [null] }) }]
  try {
    const { code, response } = await getAdjustmentList('admin')
    assert.equal(code, 200)
    assert.equal(response.targets.length, 1)
  } finally { items = previous }
})
