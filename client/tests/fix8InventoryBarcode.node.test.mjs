import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, resolve } from 'node:path'
import { findScannedInventoryItem, normalizeProductBarcode } from '../src/utils/inventoryBarcodeLookup.mjs'
const root=resolve(dirname(fileURLToPath(import.meta.url)),'../..')
const source=readFileSync(resolve(root,'client/src/pages/shared/Inventory.jsx'),'utf8')
const confirm=readFileSync(resolve(root,'client/src/components/ui/ConfirmDialog.jsx'),'utf8')
const branch=readFileSync(resolve(root,'server/routers/branchInventoryItems.js'),'utf8')
const admin=readFileSync(resolve(root,'server/controllers/admin.controller.js'),'utf8')

test('scanner ignores letter case and surrounding space when matching product codes',()=>{
 const items=[{id:1,name:'Biogesic',barcode:'M1-00123'}]
 assert.equal(normalizeProductBarcode(' m1-00123 '),'M1-00123')
 assert.equal(findScannedInventoryItem(' m1-00123 ',items).item.id,1)
})
test('scanner finds products regardless of current page and category filters',()=>{
 const items=[{id:1,barcode:'D1-00001'},{id:2,barcode:'M1-00123'}]
 assert.equal(findScannedInventoryItem('M1-00123',items).item.id,2)
})
test('scanner finds archived products but does not treat them as active',()=>{
 assert.equal(findScannedInventoryItem('M1-00123',[],[{id:8,name:'Biogesic',barcode:'M1-00123'}]).status,'archived')
})
test('unknown product or batch code cannot trigger Stock In / Stock Out as a product',()=>{
 assert.equal(findScannedInventoryItem('B2F-001',[{id:1,barcode:'M1-00123',batches:[{batch_code:'B2F-001'}]}]).status,'not_found')
 assert.equal(findScannedInventoryItem('UNKNOWN-12',[]).status,'not_found')
})
test('scanner does not silently open Add Item after an unmatched scan',()=>{
 const scanner=source.slice(source.indexOf('const handleScannerDetected'),source.indexOf('// A background refresh'))
 assert.doesNotMatch(scanner,/setShowAdd\(true\)/)
 assert.match(scanner,/getInventory\(\)/)
 assert.match(scanner,/setScanProblem\(match\)/)
 assert.match(source,/Barcode not found/)
})
test('recognized product opens choice before a stock form',()=>{
 assert.match(source,/Choose Stock Action/)
 assert.match(source,/setStockMode\('in'\);setStockItem\(scannedItem\)/)
 assert.match(source,/setStockMode\('out'\);setStockItem\(scannedItem\)/)
})
test('archive dialog names zero-stock rule and disables confirmation for positive recorded stock',()=>{
 assert.match(source,/Stock must be 0 before you can archive/)
 assert.match(source,/confirmDisabled=\{Number\(deleteCandidate\?\.stock/)
 assert.match(source,/Open Stock Out/)
 assert.match(confirm,/disabled=\{loading \|\| confirmDisabled\}/)
})
test('branch-scoped and admin archive endpoints retain backend zero-stock check',()=>{
 assert.match(branch,/Number\(prior\.stock\)>0/)
 assert.match(branch,/Stock must be 0 before archiving/)
 assert.match(admin,/Number\(item\.stock \|\| 0\) > 0/)
 assert.match(admin,/Stock must be 0 before archiving/)
})
