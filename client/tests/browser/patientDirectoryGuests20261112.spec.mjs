import { test, expect } from '@playwright/test'
import { createRequire } from 'node:module'
import { fileURLToPath } from 'node:url'
import { mockClinic } from './helpers/clinic20261111.mjs'

const require = createRequire(import.meta.url)
const { harness } = require('../../../server/tests/helpers/patientDirectoryHarness.cjs')
const request = require('../../../server/node_modules/supertest')
const evidence = fileURLToPath(new URL('../../../QA_REPORT/guest-directory-civil-status-2026-11-12', import.meta.url))

async function directory(page) {
  await mockClinic(page, 'superadmin')
  const h = harness()
  await page.route('**/api/superadmin/patients**', async route => {
    const req = route.request(), url = new URL(req.url())
    let call = request(h.app)[req.method().toLowerCase()](url.pathname + url.search)
      .set('Cookie', 'superadmin_token=superadmin-session')
    if (req.postData()) call = call.send(req.postDataJSON())
    const response = await call
    await route.fulfill({ status: response.status, json: response.body })
  })
  await page.goto('/superadmin/patients')
  await expect(page.getByText('5 patients found', { exact: true })).toBeVisible()
  return h
}

for (const [device, viewport] of Object.entries({ desktop: { width: 1440, height: 1000 }, mobile: { width: 390, height: 844 } })) {
  test(`guest directory displays, searches and opens guest history on ${device}`, async ({ page }) => {
    await page.setViewportSize(viewport)
    const errors = []
    page.on('pageerror', error => errors.push(error.message))
    const h = await directory(page)
    await expect(page.getByRole('row', { name: /Online Guest/ })).toContainText('Guest patient')
    await expect(page.getByRole('row', { name: /Historical Guest/ })).toContainText('Guest patient')
    await expect(page.getByRole('row', { name: /Converted Walk In/ })).toContainText('Registered patient')
    await expect(page.getByRole('row', { name: /Walk In Only/ })).toHaveCount(0)
    await page.getByLabel('Filter patient accounts by status').selectOption('guest')
    await expect(page.getByText('2 patients found', { exact: true })).toBeVisible()
    await expect(page.getByRole('row', { name: /Registered Active/ })).toHaveCount(0)
    await page.getByPlaceholder('Search name, email or contact number...').fill('patient3@example.test')
    await expect(page.getByText('1 patient found', { exact: true })).toBeVisible()
    await page.getByRole('row', { name: /Online Guest/ }).getByRole('button', { name: 'View More' }).click()
    const dialog = page.getByRole('dialog', { name: 'Online Guest', exact: true })
    await expect(dialog.getByText('Guest patient', { exact: true })).toBeVisible()
    await expect(dialog.getByRole('heading', { name: 'Appointment History', exact: true })).toBeVisible()
    await expect(dialog.getByText('2 recorded appointments', { exact: false })).toBeVisible()
    await expect(dialog.getByRole('row', { name: /Pending/ })).toContainText('Synthetic Service')
    await expect(dialog.getByRole('switch')).toHaveCount(0)
    await expect(dialog.getByText(/Civil status/i)).toHaveCount(0)
    await page.screenshot({ path: `${evidence}/guest-directory-${device}.png`, fullPage: true })
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true)
    await dialog.getByRole('button', { name: 'Close dialog' }).click()
    expect(h.writes).toHaveLength(0)
    expect(errors).toEqual([])
  })
}

test('registered patient access controls still ban and unban accounts through the directory', async ({ page }) => {
  const h = await directory(page)
  await page.getByLabel('Filter patient accounts by status').selectOption('active')
  await expect(page.getByText('2 patients found', { exact: true })).toBeVisible()
  await page.getByRole('row', { name: /Registered Active/ }).getByRole('button', { name: 'View More' }).click()
  const dialog = page.getByRole('dialog', { name: 'Registered Active', exact: true })
  await dialog.getByRole('switch', { name: 'Ban patient account', exact: true }).click()
  await dialog.getByRole('button', { name: 'Confirm Ban', exact: true }).click()
  await expect(dialog.getByRole('switch', { name: 'Unban patient account', exact: true })).toBeVisible()
  await expect(page.getByRole('row', { name: /Registered Active/ })).toHaveCount(0)
  await dialog.getByRole('switch', { name: 'Unban patient account', exact: true }).click()
  await dialog.getByRole('button', { name: 'Confirm Unban', exact: true }).click()
  await expect(dialog.getByRole('switch', { name: 'Ban patient account', exact: true })).toBeVisible()
  expect(h.writes.map(row => row.banned)).toEqual([1, 0])
  expect(h.audits).toHaveLength(2)
})

test('branch patient personal information omits civil status and keeps contact and birthdate details', async ({ page }) => {
  await mockClinic(page, 'admin')
  const patient = { id: 11, full_name: 'Synthetic Patient', birthdate: '1990-01-01', sex: 'Female', phone: '639170000011', email: 'synthetic@example.test', address: 'Synthetic address', civil_status: 'Single' }
  await page.route('**/api/**/patients/**', route => {
    const path = new URL(route.request().url()).pathname
    if (path.endsWith('/directory')) return route.fulfill({ json: { patients: [patient], total: 1, totalPages: 1 } })
    if (path.endsWith('/patients/11')) return route.fulfill({ json: { patient, history: [], billing: [], can_view_billing: true } })
    return route.fallback()
  })
  await page.goto('/admin/patient-records')
  await page.getByRole('button', { name: 'View Record', exact: true }).click()
  await page.getByRole('button', { name: 'Personal Information', exact: true }).click()
  await expect(page.getByRole('heading', { name: 'Personal Information', exact: true })).toBeVisible()
  await expect(page.getByText('January 1, 1990', { exact: true })).toBeVisible()
  await expect(page.getByText('synthetic@example.test', { exact: true })).toBeVisible()
  await expect(page.getByText('Synthetic address', { exact: true })).toBeVisible()
  await expect(page.getByText(/Civil status/i)).toHaveCount(0)
  await expect(page.getByText('Single', { exact: true })).toHaveCount(0)
  await page.screenshot({ path: `${evidence}/personal-information.png`, fullPage: true })
})
