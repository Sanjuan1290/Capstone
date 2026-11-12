import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, resolve } from 'node:path'
import { dashboardCardDestinations } from '../src/pages/adminPage/dashboardCardDestinations.mjs'
import { matchesInventoryStatus } from '../src/utils/inventoryStatus.mjs'
const here = dirname(fileURLToPath(import.meta.url))
const read = (path) => readFileSync(resolve(here, '../src/', path), 'utf8')

test('all four dashboard cards have branch-relative destinations and accepted filters', () => {
  assert.deepEqual(dashboardCardDestinations('2026-11-12'), {
    today: '/admin/appointments?date=2026-11-12',
    patients: '/admin/patient-records',
    pending: '/admin/appointments?tab=pending',
    stock: '/admin/inventory?status=alerts',
  })
  const dashboard = read('pages/adminPage/Admin_Dashboard.jsx')
  assert.match(dashboard, /<NavLink key=\{label\} to=\{canView\(permissionFor\(path\)\) \? portalPath\(path\) : portalBase\}/)
  assert.match(dashboard, /aria-label=\{`\$\{label\}: \$\{value\}\. View details`\}/)
})

test('appointments page applies pending and date deep links', () => {
  const source = read('pages/shared/Appointments.jsx')
  assert.ok(source.includes("params.get('tab')"))
  assert.ok(source.includes("params.get('date')"))
  assert.ok(source.includes('setDateFrom(requestedDate)'))
  assert.ok(source.includes('setDateTo(requestedDate)'))
  assert.ok(source.includes('setTab(requestedTab)'))
})

test('low stock alert deep link includes out-of-stock items', () => {
  assert.equal(matchesInventoryStatus({ stock: 2, threshold: 5 }, 'alerts'), true)
  assert.equal(matchesInventoryStatus({ stock: 0, threshold: 5 }, 'alerts'), true)
  assert.equal(matchesInventoryStatus({ stock: 8, threshold: 5 }, 'alerts'), false)
  assert.equal(matchesInventoryStatus({ stock: 0, threshold: 5 }, 'low'), false)
  const source = read('pages/shared/Inventory.jsx')
  assert.ok(source.includes("get('status') === 'alerts'"))
  assert.ok(source.includes('Low Stock Alerts (includes Out of Stock)'))
})
