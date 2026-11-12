import { test, expect } from '@playwright/test'
import { createRequire } from 'node:module'
import { mockClinic } from './helpers/clinic20261111.mjs'
const { harness, walkIn } = createRequire(import.meta.url)('../../../server/tests/helpers/patientRegistrationHarness.cjs')
const items = [{ id: 11, branch_id: 1, name: 'Synthetic Derma Medicine', barcode: 'D11', category: 'derma', selling_price: 50, stock: 10 }, { id: 12, branch_id: 1, name: 'Synthetic Medical Medicine', barcode: 'M12', category: 'medical', selling_price: 20, stock: 10 }, { id: 13, branch_id: 1, name: 'Archived Medicine', category: 'derma', selling_price: 30, archived_at: '2026-01-01' }]
async function servicePage(page, clinic = 'medical', role = 'superadmin') {
  const { root } = await mockClinic(page, role)
  const saved = []
  await page.route('**/api/**', async route => {
    const req = route.request(), path = new URL(req.url()).pathname
    if (path.endsWith('/inventory')) return route.fulfill({ json: items })
    if (path.endsWith('/system-setup')) return route.fulfill({ json: { service_categories: [{ id: 1, name: 'Medical Category', clinic_type: 'medical', is_active: 1 }, { id: 2, name: 'Derma Category', clinic_type: 'derma', is_active: 1 }] } })
    if (path.endsWith('/billing/catalog') && req.method() === 'POST') { saved.push(req.postDataJSON()); return route.fulfill({ status: 201, json: { id: 77, ...saved.at(-1) } }) }
    if (path.endsWith('/billing/catalog')) return route.fulfill({ json: [] })
    return route.fallback()
  })
  await page.goto(root + '/system-setup/billing/services/new?clinic=' + clinic)
  await page.getByRole('combobox', { name: 'Service Category *', exact: true }).selectOption(clinic === 'medical' ? '1' : '2')
  await page.getByRole('textbox', { name: 'Service Name *', exact: true }).fill('Synthetic Shared Medicine Service')
  await page.getByRole('spinbutton', { name: /Service Price/ }).fill('100')
  await page.getByRole('button', { name: 'Continue', exact: true }).click()
  await page.getByRole('button', { name: 'Add Item', exact: true }).click()
  return { saved, root }
}
for (const [clinic, role] of [['medical','superadmin'],['derma','admin']]) test(`${role} can save a ${clinic} service with both medical and derma inventory`, async ({ page }) => {
  const { saved, root } = await servicePage(page, clinic, role)
  const first = page.getByRole('combobox', { name: 'Inventory item 1', exact: true })
  await expect(first.getByRole('option', { name: /Archived/ })).toHaveCount(0)
  await first.selectOption('11')
  await page.getByRole('button', { name: 'Add Item', exact: true }).click()
  await page.getByRole('combobox', { name: 'Inventory item 2', exact: true }).selectOption('12')
  await page.screenshot({ path: `../QA_REPORT/shared-medicine-registration-2026-11-12/service-${clinic}.png`, fullPage: true })
  await page.getByRole('button', { name: 'Continue', exact: true }).click()
  await expect(page.getByRole('heading', { name: 'Review Service', exact: true })).toBeVisible()
  await page.getByRole('button', { name: 'Add Service', exact: true }).click()
  await expect(page).toHaveURL(root + '/system-setup/billing/services')
  expect(saved).toHaveLength(1)
  expect(saved[0].clinic_type).toBe(clinic)
  expect(saved[0].default_price).toBe(170)
  expect(saved[0].consultation_fee).toBe(100)
  expect(saved[0].materials.map(item => Number(item.inventory_id))).toEqual([11,12])
})
test('changing service clinic retains selected inventory but requires the new service category', async ({ page }) => {
  await servicePage(page)
  await page.getByRole('combobox', { name: 'Inventory item 1', exact: true }).selectOption('11')
  await page.getByRole('button', { name: 'Back', exact: true }).click()
  await page.getByRole('combobox', { name: 'Clinic *', exact: true }).selectOption('derma')
  await expect(page.getByRole('combobox', { name: 'Service Category *', exact: true })).toHaveValue('')
  await page.getByRole('combobox', { name: 'Service Category *', exact: true }).selectOption('2')
  await page.getByRole('button', { name: 'Continue', exact: true }).click()
  await expect(page.getByRole('combobox', { name: 'Inventory item 1', exact: true })).toHaveValue('11')
})
async function registration(page, stored = walkIn()) {
  const h = harness([stored])
  await page.route('**/api/**', async route => {
    const req = route.request(), path = new URL(req.url()).pathname
    const send = (data, status = 200) => route.fulfill({ status, json: data })
    if (path === '/api/patient/register' || path === '/api/patient/register/verify') {
      const result = await h.call(path.endsWith('/verify') ? 'verifyRegistration' : 'register', req.postDataJSON())
      return send(result.body, result.statusCode)
    }
    if (path.endsWith('/check-auth')) return send({ authenticated: h.sessions.length > 0, user: h.sessions.length ? { id: 42, role: 'patient', full_name: 'Synthetic Walk In', is_profile_complete: true } : null })
    if (path.endsWith('/profile-status')) return send({ is_profile_complete: true, missing_fields: [], onboarding_completed_at: '2026-01-01' })
    if (path.endsWith('/branches')) return send([{ id: 1, name: 'Synthetic Branch' }])
    if (path.includes('/stream')) return route.fulfill({ status: 200, contentType: 'text/event-stream', body: 'retry: 60000\n\n' })
    return send([])
  })
  await page.goto('/patient/register?next=%2Fpatient%2Fappointments')
  const body = h.body()
  for (const name of ['full_name','email','birthdate','password','confirmPassword']) await page.locator('input[name="' + name + '"]').fill(body[name])
  await page.locator('input[type="tel"]').fill(body.phone)
  await page.locator('textarea[name="address"]').fill(body.address)
  await page.locator('select[name="gender"]').selectOption('Male')
  await page.getByRole('checkbox', { name: /I have read and agree/ }).check()
  await page.getByRole('button', { name: 'Verify Mobile Number', exact: true }).click()
  return h
}
for (const width of [1440,390]) test(`walk-in email registration activates the original patient through real controller logic at ${width}px`, async ({ page }) => {
  await page.setViewportSize({ width, height: 950 })
  const h = await registration(page)
  await expect(page.getByRole('heading', { name: 'Verify Your Mobile Number', exact: true })).toBeVisible()
  expect(h.state.patients[0].password).toBeNull()
  const code = h.messages[0].code
  for (let i = 0; i < 6; i++) await page.locator('input[inputmode="numeric"]').nth(i).fill(code[i])
  await page.getByRole('button', { name: 'Verify and Create Account', exact: true }).click()
  await expect(page).toHaveURL(/\/patient\/appointments$/)
  expect(h.state.patients).toHaveLength(1)
  expect(h.state.patients[0].id).toBe(42)
  expect(h.state.patients[0].is_walk_in).toBe(0)
  expect(h.state.appointments[0].patient_id).toBe(42)
  expect(h.state.bills[0].patient_id).toBe(42)
})
test('registration still rejects an existing portal account before sending SMS', async ({ page }) => {
  const h = await registration(page, walkIn({ password: 'existing-portal-password' }))
  await expect(page.getByText(/An account with that phone number already exists/)).toBeVisible()
  expect(h.messages).toHaveLength(0)
  expect(h.state.patients[0].password).toBe('existing-portal-password')
})
