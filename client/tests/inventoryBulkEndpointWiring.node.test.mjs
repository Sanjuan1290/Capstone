import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const service = readFileSync(join(root, 'src/services/admin.service.js'), 'utf8')
const inventory = readFileSync(join(root, 'src/pages/adminPage/Admin_Inventory.jsx'), 'utf8')
const excel = readFileSync(join(root, 'src/components/system/InventoryExcelTools.jsx'), 'utf8')

test('Admin Inventory passes both bulk methods to Excel Tools', () => {
  assert.match(inventory, /import\s*\{[\s\S]*?importNewInventoryItems,[\s\S]*?bulkUpdateInventoryItems,[\s\S]*?\}\s*from ['"]\.\.\/\.\.\/services\/admin\.service['"]/)
  assert.match(inventory, /const adminServices = \{[\s\S]*?importNewInventoryItems,[\s\S]*?bulkUpdateInventoryItems,[\s\S]*?\}/)
  assert.match(excel, /services\.importNewInventoryItems\(payload\)/)
  assert.match(excel, /services\.bulkUpdateInventoryItems\(payload\)/)
})

test('Excel API methods use the protected branch-scoped routes and wrap arrays as items', async () => {
  const standalone = service
    .replace("from '../utils/manualAppointment.mjs'", `from '${new URL('../src/utils/manualAppointment.mjs', import.meta.url).href}'`)
    .replace(/^import \{ uploadValidatedImage \} from ['"]\.\/imageUpload['"]\s*$/m, '')
    .replace(/^import \{ uploadDiscountProofViaApi \} from ['"]\.\/discountProofUpload['"]\s*$/m, '')
  const mod = await import(`data:text/javascript;base64,${Buffer.from(standalone).toString('base64')}`)
  const prevFetch = globalThis.fetch
  const calls = []
  globalThis.fetch = async (url, options) => {
    calls.push({url, options})
    return { ok: true, headers: { get: () => 'application/json' }, json: async () => ({ updated: 1 }) }
  }
  try {
    const create = [{name: 'Example', stock: 0, category:'medical', item_type:'medicine', selling_price:25, threshold:5}]
    const edit = [{id:1, barcode:'GMED-00001',changes:{threshold:10},expected:{threshold:5},excel_row:2}]
    await mod.importNewInventoryItems(create)
    await mod.bulkUpdateInventoryItems(edit)
    assert.deepEqual(calls.map(c=>c.url), ['/api/admin/inventory/import-new','/api/admin/inventory/bulk-update'])
    for (const [index, items] of [[0,create],[1,edit]]) {
      assert.equal(calls[index].options.method, 'POST')
      assert.equal(calls[index].options.credentials, 'include')
      assert.equal(calls[index].options.headers['Content-Type'], 'application/json')
      assert.deepEqual(JSON.parse(calls[index].options.body), { items })
    }
  } finally { globalThis.fetch = prevFetch }
})
