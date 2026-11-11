import test from 'node:test'
import assert from 'node:assert/strict'
import { inventoryStockCount, inventoryExpiringSoon, matchesInventoryStatus } from '../src/utils/inventoryStatus.mjs'

const now = new Date('2026-11-10T16:30:00Z') // Nov 11 in the clinic, Nov 10 in UTC.
const item = (overrides = {}) => ({ stock: 10, threshold: 5, expiration_date: '2026-12-01', ...overrides })

test('low and out filters respect available stock, threshold boundaries and legacy packages', () => {
  assert.equal(matchesInventoryStatus(item({ stock: 5 }), 'low'), true)
  assert.equal(matchesInventoryStatus(item({ stock: 6 }), 'low'), false)
  assert.equal(matchesInventoryStatus(item({ stock: 0 }), 'low'), false)
  assert.equal(matchesInventoryStatus(item({ available_stock: 0 }), 'out'), true)
  assert.equal(matchesInventoryStatus(item({ available_stock: 3 }), 'low'), true)
  assert.equal(inventoryStockCount(item({ stock_base: 30, unit_size: 10 })), 3)
})

test('expiring filter includes today through day 30 in Philippine time', () => {
  for (const date of ['2026-11-11', '2026-12-11']) assert.equal(inventoryExpiringSoon(item({ expiration_date: date }), now), true)
  for (const date of ['2026-11-10', '2026-12-12', '2026-11-31', 'invalid', null]) assert.equal(inventoryExpiringSoon(item({ expiration_date: date }), now), false, String(date))
})

test('a stocked batch expiring soon is found even when the product snapshot is already expired', () => {
  const product = item({ expiration_date: '2026-10-01', batches: [
    { quantity: 3, expiration_date: '2026-10-01' },
    { quantity: 7, expiration_date: '2026-12-01' },
  ] })
  assert.equal(matchesInventoryStatus(product, 'expiring', now), true)
})

test('archived, depleted and unavailable batches do not inflate expiring count', () => {
  const product = item({ batches: [
    { quantity: 3, expiration_date: '2026-12-01', archived_at: '2026-11-01' },
    { quantity: 0, expiration_date: '2026-12-01' },
    { quantity: 3, available_quantity: 0, expiration_date: '2026-12-01' },
  ] })
  assert.equal(inventoryExpiringSoon(product, now), false)
  assert.equal(inventoryExpiringSoon(item({ stock: 0 }), now), false)
  assert.equal(matchesInventoryStatus(product, 'All', now), true)
})
