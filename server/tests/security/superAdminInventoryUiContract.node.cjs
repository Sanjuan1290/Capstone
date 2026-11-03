'use strict'
const {test}=require('node:test')
const assert=require('node:assert/strict')
const fs=require('node:fs'),path=require('node:path')
const root=path.resolve(__dirname,'../../..')
const source=fs.readFileSync(path.join(root,'client/src/pages/superAdminPage/AllInventory.jsx'),'utf8')
const helper=fs.readFileSync(path.join(root,'client/src/pages/superAdminPage/inventoryView.mjs'),'utf8')
const api=fs.readFileSync(path.join(root,'server/routers/branchAllInventory.js'),'utf8')
test('read-only Super Admin UI distinguishes branch-item alerts from product groups',()=>{
 for(const label of ['Distinct Products','Recorded Base Units','Low Stock Records','Out-of-Stock Records','Potential Selling Value','Branches Monitored','Branches with Stock'])assert.ok(source.includes(label),label)
 assert.match(source,/Read-only/)
 assert.match(source,/branch_coverage/)
})
test('details, pagination and page-only export remain connected',()=>{
 for(const token of ['openDetails','batchesLoading','pageTo(totalPages)','Rows per page','Export Current Page','createInventoryCsv(data.rows'])assert.ok(source.includes(token),token)
})
test('Super Admin read-only endpoints use GET registration and never write inventory',()=>{
 assert.match(api,/router\.get\('\/inventory\/all'/)
 assert.match(api,/router\.get\('\/inventory\/all\/batches'/)
 assert.doesNotMatch(api,/router\.(?:post|patch|put|delete)\(/)
 assert.doesNotMatch(api,/\b(?:UPDATE|INSERT INTO|DELETE FROM)\s+inventory\b/i)
})

test('purchase-cost fields are absent from All Inventory UI, CSV and read-only endpoint',()=>{
 for(const [label,body] of [['UI',source],['CSV helper',helper],['API',api]]){
  assert.doesNotMatch(body,/recorded cost|cost information is incomplete|purchase cost|costDisplay|unit_cost|cost_value|priced_batch_count|cost_coverage/i,`${label} must not include purchase-cost reporting`)
 }
 assert.match(source,/Potential Selling Value/)
 assert.match(source,/Selling Value/)
 assert.match(helper,/Potential selling value \(PHP\)/)
})
