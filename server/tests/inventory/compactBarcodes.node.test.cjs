const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const vm = require('node:vm')
const { nextInventoryBarcode } = require('../../utils/barcodes')

function loadIsolated(relative, dependencies) {
  const filename = path.join(__dirname, '../..', relative)
  const module = { exports: {} }
  vm.runInNewContext(fs.readFileSync(filename, 'utf8'), { module, exports: module.exports, require(name) {
    assert.ok(Object.hasOwn(dependencies, name), `Unexpected dependency ${name}`)
    return dependencies[name]
  }, process }, { filename })
  return module.exports
}

test('compact product barcodes retain atomic branch/category counters without long branch codes', async () => {
  const counters = new Map([['medical:1', 120]])
  const mutations = []
  const executor = { query: async (sql, params) => {
    if (sql.startsWith('SELECT code')) return [[{ code: 'BR-5881E4C8A3BDA1A7-WITH-A-LONG-NAME' }]]
    mutations.push({ sql, params })
    if (sql.startsWith('UPDATE')) {
      const key = `${params[0]}:${params[1]}`, next = (counters.get(key) || 0) + 1
      counters.set(key, next)
      return [{ insertId: next }]
    }
    return [{}]
  } }
  const codes = [await nextInventoryBarcode('medical', 1, executor), await nextInventoryBarcode('medical', 1, executor), await nextInventoryBarcode('derma', 1, executor), await nextInventoryBarcode('medical', 2, executor)]
  assert.deepEqual(codes, ['M1-00121', 'M1-00122', 'D1-00001', 'M2-00001'])
  assert.equal(new Set(codes).size, 4)
  assert.ok(codes.every(code => code.length === 8 && /^[A-Z0-9-]+$/.test(code)))
  assert.ok(mutations.filter(m => m.sql.startsWith('UPDATE')).every(m => m.sql.includes('LAST_INSERT_ID(last_number+1)') && m.sql.includes('branch_id=?')))
})

test('invalid or inactive branches never allocate a barcode', async () => {
  let queries = 0
  const executor = { query: async () => { queries++; return [[]] } }
  await assert.rejects(nextInventoryBarcode('medical', null, executor), /verified branch/)
  assert.equal(queries, 0)
  await assert.rejects(nextInventoryBarcode('medical', 1, executor), /Branch unavailable/)
  assert.equal(queries, 1)
})

const batches = () => loadIsolated('utils/inventoryBatches.js', {
  './inventoryModeSafety': {}, '../db/connect': {}, './inventoryLocations': {},
})

test('compact batch codes continue their sequence across product barcode edits and legacy batches', async () => {
  const rows = [{ batch_code: 'DRM-BR-5881E4C8A3BDA1A7-00001-B099' }, { batch_code: 'B2F-001' }, { batch_code: 'B2F-004' }]
  let barcode = 'DRM-BR-5881E4C8A3BDA1A7-00001'
  const executor = { query: async (sql, params) => {
    assert.equal(params[0], 87)
    if (sql.startsWith('SELECT id, barcode')) { assert.match(sql, /FOR UPDATE/); return [[{ id: 87, barcode }]] }
    assert.match(sql, /SELECT batch_code FROM inventory_batches WHERE inventory_id = \?/)
    return [rows]
  } }
  assert.equal(await batches().generateNextBatchCode(87, executor), 'B2F-005')
  barcode = 'SHORT-1'
  assert.equal(await batches().generateNextBatchCode(87, executor), 'B2F-005')
  rows.push({ batch_code: 'B2F-005' })
  assert.equal(await batches().generateNextBatchCode(87, executor), 'B2F-006')
})

test('new batch codes are short and differ between inventory items', async () => {
  const generator = batches().generateNextBatchCode
  const code = id => generator(id, { query: async sql => sql.startsWith('SELECT id, barcode') ? [[{ id, barcode: 'A'.repeat(50) }]] : [[]] })
  assert.equal(await code(1), 'B1-001')
  assert.equal(await code(2), 'B2-001')
  assert.ok((await code(2147483647)).length <= 11)
})

test('barcode metadata edit commits without changing stock or batch history and records its audit', async () => {
  const prior = { id: 87, branch_id: 1, barcode: 'LONG-BARCODE', name: 'Synthetic medicine', category: 'derma', item_type: 'medicine', threshold: 5, selling_price: 650, stock: 17, stock_base: 17, supplier_id: 17, default_location_id: 1 }
  let saved = { ...prior }, committed = false
  const queries = [], audits = []
  const connection = { beginTransaction: async () => {}, commit: async () => { committed = true }, rollback: async () => {}, release() {}, query: async (sql, params) => {
    queries.push(sql)
    if (sql.startsWith('SELECT * FROM inventory')) { assert.equal(params[1], 1); return [[prior]] }
    if (sql.includes('FROM inventory_locations')) return [[{ id: 1 }]]
    if (sql.includes('FROM inventory_suppliers')) return [[{ id: 17, name: 'Synthetic supplier', category: 'derma' }]]
    if (sql.startsWith('SELECT id FROM inventory')) return [[]]
    if (sql.startsWith('UPDATE inventory SET')) { saved = { ...prior, barcode: params[0] }; return [{ affectedRows: 1 }] }
    throw new Error(`Unexpected SQL ${sql}`)
  } }
  const handlers = loadIsolated('routers/branchInventoryItems.js', {
    '../db/connect': { getConnection: async () => connection, query: async () => [[saved]] },
    '../utils/clinicEvents': {}, '../utils/audit': { writeAuditLog: async audit => audits.push(audit) },
    '../utils/barcodes': {}, '../utils/inventoryLocations': {},
    '../utils/inventoryBatches': { attachBatchesToInventory: async rows => rows },
  })
  const response = () => ({ statusCode: 200, status(code) { this.statusCode = code; return this }, json(body) { this.body = body; return this } })
  const req = { params: { id: 87 }, branchId: 1, user: { id: 1 }, adminContext: { account_role: 'superadmin' }, body: { ...prior, barcode: 'D1-00001' } }
  delete req.body.stock; delete req.body.stock_base
  const res = response()
  await handlers.updateItem(req, res)
  assert.equal(res.statusCode, 200)
  assert.equal(committed, true)
  assert.equal(res.body.barcode, 'D1-00001')
  assert.equal(res.body.stock, 17)
  assert.equal(res.body.stock_base, 17)
  assert.equal(audits[0].action, 'inventory.item_updated')
  assert.equal(audits[0].newValues.barcode, 'D1-00001')
  assert.ok(queries.every(sql => !/UPDATE inventory SET.*(?:stock|stock_base)\s*=/i.test(sql) && !/inventory_batches/.test(sql)))
  const forbidden = response()
  await handlers.updateItem({ ...req, body: { ...req.body, stock: 0 } }, forbidden)
  assert.equal(forbidden.statusCode, 400)
  assert.equal(forbidden.body.code, 'STOCK_EDIT_DENIED')
})
