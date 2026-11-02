import test from 'node:test'
import assert from 'node:assert/strict'
import {readFileSync} from 'node:fs'
import {fileURLToPath} from 'node:url'
import {resolve,dirname} from 'node:path'
const root=resolve(dirname(fileURLToPath(import.meta.url)),'..')
const ui=readFileSync(resolve(root,'src/components/system/InventoryExcelTools.jsx'),'utf8')
const api=readFileSync(resolve(root,'src/services/admin.service.js'),'utf8')
test('Excel tools show Import and Export with exactly four user actions',()=>{
 for(const label of ['Download Template','Upload File','Export Read-Only','Export Editable Excel'])assert.ok(ui.includes(label),label)
 assert.ok(ui.includes('readInventoryImportFile(file)'))
 assert.ok(ui.includes('preflightInventorySingleSheetCreate(parsed.rows,options)'))
 for(const oldLabel of ['Receive Stock in Bulk','Download Items & Opening Batches Template','Download Stock Receipt Template'])assert.ok(!ui.includes(oldLabel),oldLabel)
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


