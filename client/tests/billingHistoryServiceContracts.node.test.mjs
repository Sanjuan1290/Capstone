// Deployment gate: catch missing billing-history service exports and wrong routes
// before Vite starts compiling the client. Runs without a server or database.
import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const clientRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const read = relative => readFileSync(resolve(clientRoot, relative), 'utf8')
const component = read('src/components/billing/BillHistoryDetail.jsx')
const services = {
  admin: read('src/services/admin.service.js'),
  staff: read('src/services/staff.service.js'),
}
const namedExports = src => new Set(
  [...src.matchAll(/\bexport\s+(?:async\s+)?(?:const|let|var|function|class)\s+([\w$]+)/g)].map(m => m[1])
)

// Keep this guard for both portals; a test for admin.service alone missed the
// missing Staff charge-adjustments method in the same component.
test('BillHistoryDetail imports exist in both billing portal services', () => {
  for (const role of ['admin','staff']) {
    const importMatch = [...component.matchAll(/\bimport\s*\{([^}]+)\}\s*from\s*['"]([^'"\n]+)['"]/g)]
      .find(m => m[2].endsWith(`/services/${role}.service`))
    assert.ok(importMatch, `Missing ${role} service import`)
    const provided = namedExports(services[role])
    for (const binding of importMatch[1].split(',')) {
      const name = binding.trim().split(/\s+as\s+/)[0].trim()
      assert.ok(provided.has(name), `${role}.service.js does not export ${name}`)
    }
  }
})

test('the Admin, Super Admin and Staff GET endpoints are registered', () => {
  const branches = read('../server/routers/branchChargeAdjustments.js')
  const staff = read('../server/routers/staff.router.js')
  assert.match(branches, /router\.get\(`\$\{prefix\}\/billing\/:id\/charge-adjustments`/)
  assert.match(branches, /\/my\/legacy/)
  assert.match(branches, /\/workspace\/:branchId\/legacy/)
  assert.match(staff, /router\.get\('\/billing\/:id\/charge-adjustments'/)
})

const loadIsolated = async source => {
  // Imported upload helpers are not used by these read-only functions.
  const standalone = source.replace(/^import\s+.*$/gm, '')
  const dataUrl = `data:text/javascript;base64,${Buffer.from(standalone).toString('base64')}`
  return import(dataUrl)
}

test('Admin history GET follows branch portal URL, Staff GET follows Staff API', async () => {
  const admin = await loadIsolated(services.admin)
  const staff = await loadIsolated(services.staff)
  const originalFetch = globalThis.fetch
  const originalWindow = globalThis.window
  const originalStorage = globalThis.sessionStorage
  const calls = []
  globalThis.fetch = async (url, opts) => {
    calls.push({ url, opts })
    return { ok: true, headers: { get: () => 'application/json' }, json: async () => ({ requests: [] }) }
  }
  globalThis.sessionStorage = { getItem: () => null }
  try {
    globalThis.window = { location: { pathname: '/superadmin/branches/8/billing/history/39' } }
    await admin.getAdminBillChargeAdjustments(39)
    globalThis.window = { location: { pathname: '/admin/billing/history/39' } }
    await admin.getAdminBillChargeAdjustments(39)
    await staff.getStaffBillChargeAdjustments(39)
    assert.deepEqual(calls.map(c => c.url), [
      '/api/branches/workspace/8/legacy/billing/39/charge-adjustments',
      '/api/branches/my/legacy/billing/39/charge-adjustments',
      '/api/staff/billing/39/charge-adjustments',
    ])
    assert.ok(calls.every(c => c.opts.credentials === 'include'), 'All billing reads must send session cookies')
  } finally {
    globalThis.fetch = originalFetch
    if (originalWindow === undefined) delete globalThis.window
    else globalThis.window = originalWindow
    if (originalStorage === undefined) delete globalThis.sessionStorage
    else globalThis.sessionStorage = originalStorage
  }
})

test('billing service preserves server rejection and request reference', async () => {
  const admin = await loadIsolated(services.admin)
  const originalFetch = globalThis.fetch
  globalThis.fetch = async () => ({
    ok: false, status: 503, headers: { get: () => 'application/json' },
    json: async () => ({ code: 'SERVICE_UNAVAILABLE', message: 'Billing is temporarily unavailable.', request_id: 'qa-bill-123' }),
  })
  try {
    await assert.rejects(() => admin.getAdminBillChargeAdjustments(39), error =>
      error.message.includes('Billing is temporarily unavailable.') &&
      error.message.includes('qa-bill-123') &&
      error.code === 'SERVICE_UNAVAILABLE')
  } finally { globalThis.fetch = originalFetch }
})
