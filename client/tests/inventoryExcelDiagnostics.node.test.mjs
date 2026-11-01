import test from 'node:test'
import assert from 'node:assert/strict'
import {readFileSync} from 'node:fs'
import {fileURLToPath} from 'node:url'
import {resolve,dirname} from 'node:path'
const root=resolve(dirname(fileURLToPath(import.meta.url)),'..')
const ui=readFileSync(resolve(root,'src/components/system/InventoryExcelTools.jsx'),'utf8')
const api=readFileSync(resolve(root,'src/services/admin.service.js'),'utf8')
test('Excel workflow offers separate add, update and reporting entry points',()=>{
 for(const label of ['Add New Items','Update Existing Items','Download Inventory Report','Download New Item Template','Download Current Items for Editing'])assert.ok(ui.includes(label),label)
 assert.ok(ui.includes("readInventoryFile(file, { mode: mode === 'new' ? 'create' : 'edit' })"))
})
test('server atomic API replaces row-by-row save and displays results',()=>{
 assert.ok(ui.includes('services.importNewInventoryItems(payload)'))
 assert.ok(ui.includes('services.bulkUpdateInventoryItems(payload)'))
 assert.ok(!ui.includes('services.updateInventoryItem('))
 assert.match(ui,/Save \$\{changes\.length\} Item\(s\)/)
 assert.ok(ui.includes('Download Error Report'))
 assert.ok(ui.includes('Nothing is saved until you confirm'))
 assert.ok(api.includes('inventory/bulk-update'))
 assert.ok(api.includes('inventory/import-new'))
})
