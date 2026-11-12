import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { filterServiceConsumables, isSelectableServiceConsumable } from '../src/utils/serviceConsumableEligibility.mjs'

const items = [
  { id: 1, name: 'General Medicine A', barcode: 'MED-01', category: 'medical', selling_price: 120, archived_at: null },
  { id: 2, name: 'Skin Cream', barcode: 'DER-02', category: 'derma', selling_price: 200, archived_at: null },
  { id: 3, name: 'Archived Lotion', barcode: 'DER-03', category: 'derma', selling_price: 400, archived_at: '2026-11-10' },
]

test('General Medicine and Dermatology inventory are selectable for either service', () => {
  assert.deepEqual(filterServiceConsumables(items).map(({ id }) => id), [1, 2])
  assert.equal(isSelectableServiceConsumable(items[0]), true)
  assert.equal(isSelectableServiceConsumable(items[1]), true)
  assert.equal(isSelectableServiceConsumable(items[2]), false)
})

test('search supports name, barcode and inventory category without losing the selected item', () => {
  assert.deepEqual(filterServiceConsumables(items, { query: 'skin' }).map(({ id }) => id), [2])
  assert.deepEqual(filterServiceConsumables(items, { query: 'DER-02' }).map(({ id }) => id), [2])
  assert.deepEqual(filterServiceConsumables(items, { query: 'dermatology' }).map(({ id }) => id), [2])
  assert.deepEqual(filterServiceConsumables(items, { query: 'skin', selectedId: 1 }).map(({ id }) => id), [1, 2])
  assert.deepEqual(filterServiceConsumables(items, { query: 'lotion', selectedId: 3 }), [])
})

test('service clinic controls only the service category, not eligibility of consumables', () => {
  const editor = readFileSync(new URL('../src/pages/adminPage/Admin_BillingServiceForm.jsx', import.meta.url), 'utf8')
  assert.match(editor, /filterServiceConsumables\(inventory, \{ query: itemSearch\[index\], selectedId: m.inventory_id \}\)/)
  assert.match(editor, /category\.clinic_type === form\.clinic_type/)
  assert.doesNotMatch(editor, /inv\.category===form\.clinic_type|item\.category === clinicType/)
  assert.match(editor, /clinic_type: clinicType, category_id: '', category: ''/)
  assert.match(editor, /isSelectableServiceConsumable\(item\)/)
  assert.match(editor, /Number\(item\?\.selling_price \|\| 0\)/)
})
