'use strict'
const {test} = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const root = path.resolve(__dirname, '../../..')
const read = relative => fs.readFileSync(path.join(root, relative), 'utf8')
const page = read('client/src/pages/superAdminPage/AllInventory.jsx')
const helper = read('client/src/pages/superAdminPage/inventoryView.mjs')
const router = read('server/routers/branchAllInventory.js')

test('All Inventory has only four summary cards', () => {
  for (const label of ['Total Products', 'Total Selling Value', 'Low Stock', 'Out of Stock']) assert.match(page, new RegExp(label))
  assert.doesNotMatch(page, /Quick insights|Branch comparison|showAdvanced|More filters|Recorded Base Units/)
  assert.match(page, /Read-only/)
})

test('single combined table shows value and branch coverage and a branch-price breakdown', () => {
  for (const heading of ['Total Stock', 'Selling Price', 'Branches with Stock', 'Total Selling Value', 'Status', 'View Details']) {
    assert.ok(page.includes(heading), heading)
  }
  assert.match(page, /selected\.per_branch\.map/)
  assert.match(page, /branch\.selling_price/)
  assert.match(page, /branch\.selling_value/)
  assert.match(page, /openDetails\(row\)/)
  assert.match(page, /Rows per page/)
})

test('search, branch and status are always visible without an expand/collapse filter', () => {
  for (const label of ['Search product or barcode', 'Filter branch', 'Filter stock status']) assert.ok(page.includes(label), label)
  assert.doesNotMatch(page, /<details|<summary|More filters/)
})

test('Super Admin inventory requests remain read-only', () => {
  assert.match(router, /router\.get\('\/inventory\/all'/)
  assert.match(router, /router\.get\('\/inventory\/all\/batches'/)
  assert.doesNotMatch(router, /router\.(?:post|patch|put|delete)\(/i)
})

test('purchase-cost collection is absent; CSV includes branch selling values', () => {
  for (const source of [page, helper]) assert.doesNotMatch(source, /purchase.cost|unit_cost|cost_value/i)
  assert.match(helper, /Total selling value \(PHP\)/)
  assert.match(helper, /branch\.selling_value/)
})
