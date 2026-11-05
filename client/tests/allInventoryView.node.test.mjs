import {test} from 'node:test'
import assert from 'node:assert/strict'
import {
  createInventoryCsv, statusLabels, buildFilters, branchesWithStock, sellingPriceLabel
} from '../src/pages/superAdminPage/inventoryView.mjs'

const sample = {
  name: 'ALCOHOL PREP PAD 70%', category: 'medical', item_type: 'supplies',
  quantity_base: 70, base_unit: 'pcs', selling_value: 230,
  per_branch: [
    {branch_name: 'Laguna Clinic', quantity_base: 50, selling_price: 3, selling_value: 150, selling_unit: 'pad'},
    {branch_name: 'Branch B', quantity_base: 20, selling_price: 4, selling_value: 80, selling_unit: 'pad'},
    {branch_name: 'Branch C', quantity_base: 0, selling_price: 2, selling_value: 0, selling_unit: 'pad'}
  ]
}

test('only branches with positive stock count toward coverage', () => {
  assert.equal(branchesWithStock(sample).length, 2)
  assert.equal(branchesWithStock({...sample, per_branch: []}).length, 0)
})

test('selling price is marked as varying when positive-stock branches differ', () => {
  assert.equal(sellingPriceLabel(sample), 'Varies by branch')
  assert.equal(sellingPriceLabel({...sample, per_branch: [sample.per_branch[0]]}), '₱3.00')
  assert.equal(sellingPriceLabel({...sample, per_branch: [sample.per_branch[2]]}), '₱2.00')
  assert.equal(sellingPriceLabel({...sample, per_branch: [{...sample.per_branch[0], selling_price: null}]}), '—')
})

test('CSV contains total value and per-branch stock, price and value', () => {
  const csv = createInventoryCsv([sample])
  assert.match(csv, /Total selling value \(PHP\)/)
  assert.match(csv, /Branches with stock/)
  assert.match(csv, /Laguna Clinic: 50 pcs; selling price ₱3\.00 per pad; selling value ₱150\.00/)
  assert.match(csv, /Branch B: 20 pcs; selling price ₱4\.00 per pad; selling value ₱80\.00/)
  assert.match(csv, /"230"/)
  assert.match(csv, /"2"/)
})

test('CSV escapes spreadsheet formulas from user-supplied inventory names', () => {
  const csv = createInventoryCsv([{...sample, name: '=HYPERLINK("https://example.invalid")'}])
  assert.match(csv, /"'=HYPERLINK/)
  assert.ok(csv.startsWith('\uFEFF'))
})

test('filters keep the branch, search and page without adding empty values', () => {
  const params = new URLSearchParams(buildFilters({view: 'combined', search: 'alcohol', branch_ids: 1, status: '', page: 2, limit: 25}))
  assert.equal(params.get('view'), 'combined')
  assert.equal(params.get('branch_ids'), '1')
  assert.equal(params.get('search'), 'alcohol')
  assert.equal(params.get('page'), '2')
  assert.equal(params.get('status'), null)
})

test('stock alerts distinguish low, out, expired and expiring products', () => {
  assert.deepEqual(statusLabels({out: true, expired: true}).map(item => item.label), ['Out of stock', 'Expired stock'])
  assert.equal(statusLabels({low: true})[0].label, 'Low stock')
  assert.equal(statusLabels({})[0].label, 'In stock')
})
