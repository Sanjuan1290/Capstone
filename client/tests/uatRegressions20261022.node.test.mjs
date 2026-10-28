// Regressions for client defects confirmed during the 2026-10-22 end-to-end UAT.
import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
const read = (rel) => readFileSync(new URL(`../src/${rel}`, import.meta.url), 'utf8')

test('Super Admin settings keep the superadmin role so the portal header is sent (was HTTP 401)', () => {
  const src = read('pages/shared/SettingsPage.jsx')
  assert.doesNotMatch(src, /accountRole === 'superadmin' \? 'admin'/)
  assert.match(src, /const role = accountRole\b/)
})

test('every billing tab links to a route that exists (Adjustments went to the public homepage)', () => {
  const nav = read('components/billing/AdminBillingNav.jsx')
  const app = read('App.jsx')
  const adminBlock = app.slice(app.indexOf("<Route path='/admin' element={<AdminRoute>"))
  for (const [, path] of nav.matchAll(/path: '\/admin\/([^'?]+)/g)) {
    assert.ok(adminBlock.includes(`path='${path}'`), `missing /admin/${path} route`)
  }
})

test("branch form submits null, not '', for the 'Use default setup' option", () => {
  const src = read('pages/superAdminPage/redesign/Branches.jsx')
  assert.doesNotMatch(src, /copy_setup_from_branch_id:''/)
  assert.match(src, /title="Branch was not saved"/)
})
