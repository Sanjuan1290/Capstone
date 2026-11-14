const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const vm = require('node:vm')
const path = require('node:path')

const file = path.join(__dirname, '../../routers/branchCatalogWrites.js')
const source = fs.readFileSync(file, 'utf8')
const globalController = fs.readFileSync(path.join(__dirname, '../../controllers/admin.controller.js'), 'utf8')

async function saveWith({ serviceClinic = 'medical', itemClinic = 'derma', archived = false, price = 125, availableInBranch = true } = {}) {
  let savedTotal = null
  let insertedMaterial = false
  const conn = {
    async beginTransaction() {}, async commit() {}, async rollback() {}, release() {},
    async query(sql, params = []) {
      if (sql.includes('FROM billing_service_categories')) return [[{ id: 9, name: 'Clinical Services', is_active: 1 }]]
      if (sql.includes('FROM inventory WHERE id=? AND branch_id=?')) return [[...(availableInBranch ? [{ id: 22, name: 'Reusable Item', category: itemClinic, selling_price: price, archived_at: archived ? '2026-11-10' : null }] : [])]]
      if (sql.startsWith('INSERT INTO billing_service_catalog')) { savedTotal = params[4]; return [{ insertId: 45 }] }
      if (sql.startsWith('INSERT INTO billing_service_materials')) { insertedMaterial = true; return [{}] }
      return [[]]
    },
  }
  const module = { exports: {} }
  const fakeRequire = (name) => {
    if(name==='../utils/billingMoney')return require('../../utils/billingMoney')
    if (name === '../db/connect') return { getConnection: async () => conn }
    if (name === '../utils/clinicEvents') return { afterSuccessfulMutation: () => (_, __, next) => next?.() }
    if (name === '../utils/audit') return { writeAuditLog: async () => {} }
    if (name === '../utils/billing') return { normalizeServiceMaterials: (materials) => materials }
    if (name === '../utils/bookingPolicy') return { validateAverageDurationMinutes: (n) => Number(n) }
    throw Error(`Unexpected import ${name}`)
  }
  vm.runInNewContext(source, { module, exports: module.exports, require: fakeRequire })
  const req = {
    body: { service_name: 'Example', clinic_type: serviceClinic, category_id: 9, consultation_fee: 800, average_duration_minutes: 60, sort_order: 0, is_active: 1,
      materials: [{ inventory_id: 22, material_name: 'Reusable Item', quantity: 2, unit_label: 'unit', notes: '' }] },
    params: {}, branchId: 1, user: { id: 3 }, adminContext: { account_role: 'admin' }, ip: '127.0.0.1',
  }
  const res = { code: 200, status(code) { this.code = code; return this }, json(body) { this.body = body; return this } }
  await module.exports.saveService(req, res)
  return { status: res.code, body: res.body, savedTotal, insertedMaterial }
}

test('Medical service accepts Dermatology inventory and retains item Selling Price', async () => {
  const result = await saveWith({ serviceClinic: 'medical', itemClinic: 'derma' })
  assert.equal(result.status, 201)
  assert.equal(result.savedTotal, 1050)
  assert.equal(result.body.default_price, 1050)
  assert.equal(result.insertedMaterial, true)
})

test('Dermatology service accepts General Medicine inventory', async () => {
  const result = await saveWith({ serviceClinic: 'derma', itemClinic: 'medical' })
  assert.equal(result.status, 201)
  assert.equal(result.savedTotal, 1050)
})

test('Inventory outside the authorized branch remains unavailable', async () => {
  const result = await saveWith({ availableInBranch: false })
  assert.equal(result.status, 404)
  assert.equal(result.body.code, 'INVENTORY_NOT_FOUND')
  assert.equal(result.insertedMaterial, false)
})

test('Archived inventory and items without a Selling Price remain invalid', async () => {
  const archived = await saveWith({ archived: true })
  assert.equal(archived.status, 404)
  const noPrice = await saveWith({ price: 0 })
  assert.equal(noPrice.status, 409)
  assert.equal(noPrice.body.code, 'CONSUMABLE_PRICE_REQUIRED')
})

test('Legacy admin service writer no longer blocks a mismatched inventory category', () => {
  assert.doesNotMatch(globalController, /SERVICE_CONSUMABLE_CLINIC_MISMATCH/)
  assert.match(globalController, /SERVICE_CONSUMABLE_UNAVAILABLE/)
  assert.match(globalController, /SERVICE_CONSUMABLE_PRICE_REQUIRED/)
  assert.match(source, /FROM inventory WHERE id=\? AND branch_id=\?/)
})
