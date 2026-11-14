const test = require('node:test'), assert = require('node:assert/strict'), fs = require('node:fs'), vm = require('node:vm')
const root = require('node:path').resolve(__dirname, '..')
const read = file => fs.readFileSync(require('node:path').join(root, file), 'utf8')
const billing = { exports: {} }
vm.runInNewContext(read('utils/billing.js'), { module: billing, require: () => ({}), console })
function fixture({feeBefore=0}={}) {
  const items = [{ id: 11, name: 'Derma item', category: 'derma', branch_id: 1, selling_price: 50 }, { id: 12, name: 'Medical item', category: 'medical', branch_id: 1, selling_price: 20 }, { id: 13, name: 'Archived', category: 'derma', branch_id: 1, selling_price: 20, archived_at: '2026-01-01' }, { id: 14, name: 'Other branch', category: 'medical', branch_id: 2, selling_price: 20 }]
  const calls = [], state = { committed: 0, rolledBack: 0 }
  const conn = { beginTransaction: async () => {}, commit: async () => { state.committed++ }, rollback: async () => { state.rolledBack++ }, release() {}, query: async (sql, values) => {
    calls.push({ sql, values })
    if (sql.startsWith('SELECT * FROM billing_service_catalog')) return [[{ id: 77, branch_id: 1, average_duration_minutes: 60, doctor_fee_percentage:feeBefore }]]
    if (sql.startsWith('SELECT id,name,is_active FROM billing_service_categories')) { assert.equal(values[1], 1); return [values[0] === 1 ? [{ id: 1, name: 'Selected service category', is_active: 1 }] : []] }
    if (sql.startsWith('SELECT id,name,category,selling_price,archived_at FROM inventory')) { assert.match(sql, /branch_id=\?/); return [items.filter(item => item.id === values[0] && item.branch_id === values[1])] }
    if (sql.includes('INSERT INTO billing_service_catalog')) return [{ insertId: 77 }]
    if (sql.startsWith('UPDATE billing_service_catalog') || sql.startsWith('DELETE m FROM billing_service_materials') || sql.startsWith('INSERT INTO billing_service_materials')) return [{ affectedRows: 1 }]
    throw Error('Unexpected synthetic service SQL: ' + sql)
  } }
  const module = { exports: {} }
  vm.runInNewContext(read('routers/branchCatalogWrites.js'), { module, console, require: name => ({ '../utils/billingMoney':require('../utils/billingMoney'), '../db/connect': { getConnection: async () => conn }, '../utils/billing': billing.exports, '../utils/bookingPolicy': { validateAverageDurationMinutes: value => value }, '../utils/audit': { writeAuditLog: async () => {} } }[name] || {}) })
  const save = async (overrides = {}, editing = false, role='staff') => {
    const res = { statusCode: 200, status(value) { this.statusCode = value; return this }, json(value) { this.body = value; return this } }
    await module.exports.saveService({ params: editing ? { serviceId: 77 } : {}, branchId: 1, user: { id: 1,role }, adminContext:role==='staff'?undefined:{account_role:role}, body: { category_id: 1, clinic_type: 'medical', service_name: 'Synthetic Service', consultation_fee: 100, average_duration_minutes: 60, default_price: 1, materials: [{ inventory_id: 11, material_name: 'Derma item', quantity: 2 }, { inventory_id: 12, material_name: 'Medical item', quantity: 3 }], ...overrides } }, res)
    return res
  }
  return { save, state, calls, items }
}
for (const clinic_type of ['medical','derma']) test(`${clinic_type} services accept inventory from both categories and calculate the catalog selling prices`, async () => {
  const f = fixture(), res = await f.save({ clinic_type })
  assert.equal(res.statusCode, 201); assert.equal(res.body.default_price, 260)
  assert.equal(res.body.clinic_type, clinic_type); assert.equal(res.body.materials.length, 2)
  assert.equal(f.state.committed, 1); assert.equal(f.state.rolledBack, 0)
  assert.equal(f.calls.filter(call => call.sql.startsWith('INSERT INTO billing_service_materials')).length, 2)
  assert.equal(f.calls.some(call => /^(UPDATE|DELETE FROM|INSERT INTO) inventory\b/.test(call.sql)), false)
})
test('editing a service preserves mixed-category default items and the saved total', async () => {
  const f = fixture(), res = await f.save({}, true)
  assert.equal(res.statusCode, 200); assert.equal(res.body.default_price, 260)
  assert.equal(f.calls.find(call => call.sql.startsWith('UPDATE billing_service_catalog')).values[4], 260)
})

for(const role of ['admin','superadmin'])test(`${role} can create and edit included fee percentages without increasing the service price`,async()=>{
  const h=fixture({feeBefore:20})
  const created=await h.save({doctor_fee_percentage:20},false,role)
  assert.equal(created.statusCode,201);assert.equal(created.body.doctor_fee_percentage,20);assert.equal(created.body.default_price,260)
  const edited=await h.save({doctor_fee_percentage:40},true,role)
  assert.equal(edited.statusCode,200);assert.equal(edited.body.default_price,260)
  assert.equal(h.calls.filter(c=>c.sql.includes('SET doctor_fee_percentage=')).at(-1).values[0],40)
})

test('Staff preserves the administrator fee when editing operational details and cannot change it',async()=>{
  const h=fixture({feeBefore:20}),preserved=await h.save({},true)
  assert.equal(preserved.statusCode,200);assert.equal(preserved.body.doctor_fee_percentage,20)
  const rejected=await h.save({doctor_fee_percentage:40},true)
  assert.equal(rejected.statusCode,403);assert.equal(rejected.body.code,'DOCTOR_FEE_FORBIDDEN')
})
test('another branch’s inventory and archived items remain blocked before any service writes', async () => {
  for (const inventory_id of [13,14]) {
    const f = fixture(), res = await f.save({ materials: [{ inventory_id, material_name: 'Unavailable', quantity: 1 }] })
    assert.equal(res.statusCode, 404); assert.equal(res.body.code, 'INVENTORY_NOT_FOUND')
    assert.equal(f.state.committed, 0); assert.equal(f.state.rolledBack, 1)
    assert.equal(f.calls.some(call => call.sql.startsWith('INSERT')), false)
  }
})
test('whole-number quantities and positive inventory selling prices remain required', async () => {
  for (const quantity of [0,-1,0.5]) {
    const f = fixture(), res = await f.save({ materials: [{ inventory_id: 11, material_name: 'Derma item', quantity }] })
    assert.equal(res.statusCode, 400); assert.equal(f.state.committed, 0)
  }
  const f = fixture(); f.items[0].selling_price = 0
  assert.equal((await f.save()).body.code, 'CONSUMABLE_PRICE_REQUIRED')
  assert.equal(f.state.committed, 0)
})
test('service categories still have to belong to the chosen clinic and branch', async () => {
  const f = fixture(), res = await f.save({ category_id: 500 })
  assert.equal(res.statusCode, 400); assert.equal(res.body.code, 'INVALID_CATEGORY'); assert.equal(f.state.committed, 0)
})
test('the legacy Admin pricing validator also accepts cross-category items without weakening quantity or availability rules', async () => {
  const source = read('controllers/admin.controller.js')
  const start = source.indexOf('const applyServiceConsumablePricing ='), end = source.indexOf('\nconst saveBillingServiceMaterials', start)
  assert.ok(start > 0 && end > start)
  const fn = vm.runInNewContext(source.slice(start, end) + ';applyServiceConsumablePricing', { db: {} })
  const items = [{ id: 11, category: 'derma', selling_price: 50, name: 'Derma item' }]
  const executor = { query: async () => [items] }
  const body = () => ({ clinic_type: 'medical', consultation_fee: 100, materials: [{ inventory_id: 11, quantity: 2 }] })
  assert.equal((await fn(body(), executor)).default_price, 200)
  await assert.rejects(fn({ ...body(), materials: [{ inventory_id: 11, quantity: 0.5 }] }, executor), { code: 'SERVICE_CONSUMABLE_QUANTITY_INVALID' })
  items[0].archived_at = '2026-01-01'
  await assert.rejects(fn(body(), executor), { code: 'SERVICE_CONSUMABLE_UNAVAILABLE' })
})
