'use strict'
const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')

const branches = fs.readFileSync(path.join(__dirname, '../../routers/branches.router.js'), 'utf8')
const attach = fs.readFileSync(path.join(__dirname, '../../utils/inventoryBatches.js'), 'utf8')

test('branch inventory API preserves branch filter and attaches batch/location data before responding', () => {
  const body = branches.match(/const originalInventory=async\(req,res\)=>\{([\s\S]*?)\n\}/)?.[1]
  assert.ok(body, 'branch inventory handler must exist')
  assert.match(body, /FROM inventory WHERE branch_id=\? AND archived_at IS NULL/)
  assert.match(body, /\[req\.branchId\]/)
  assert.match(body, /attachBatchesToInventory\(rows,db\)/)
  assert.doesNotMatch(body, /ensureInventoryLocationAllocations|syncInventorySnapshot/, 'read must not rewrite stock')
})

test('branch inventory list returns actual batches and their location balances', () => {
  assert.match(attach, /FROM inventory_batches b/)
  assert.match(attach, /LEFT JOIN inventory_location_batches ilb ON ilb\.batch_id = b\.id/)
  assert.match(attach, /id: row\.location_id/)
  assert.match(attach, /locations: \[\]/)
  assert.match(attach, /batches: grouped\[item\.id\] \|\| \[\]/)
})
