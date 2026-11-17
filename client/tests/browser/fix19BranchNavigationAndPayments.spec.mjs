import { test, expect } from '@playwright/test'
import { mockClinic, baseBill } from './helpers/clinic20261111.mjs'

const branches = [
  { id: 1, name: 'Laguna Clinic Branch', is_active: 1 },
  { id: 2, name: 'Manila Clinic Branch', is_active: '1' },
  { id: 3, name: 'Closed Clinic Branch', is_active: 0 },
]
const evidence = '../QA_REPORT/fix-19-2026-11-17'

test.beforeEach(async ({ page }) => {
  page.errors = []
  page.on('pageerror', error => page.errors.push(error.message))
  await page.route(/^https?:\/\/(?!127\.0\.0\.1|localhost)/, route => route.abort())
})
test.afterEach(async ({ page }) => expect(page.errors).toEqual([]))

test('Clinic Branches expands active branch shortcuts and opens the selected branch', async ({ page }) => {
  await mockClinic(page, 'superadmin')
  await page.route(/\/api\/branches\/?$/, route => route.fulfill({ json: branches }))
  await page.goto('/superadmin')
  const toggle = page.getByRole('button', { name: 'Clinic Branches', exact: true })
  const menu = page.getByRole('region', { name: 'Clinic branch shortcuts', exact: true })
  await expect(toggle).toHaveAttribute('aria-expanded', 'false')
  await toggle.click()
  await expect(menu.getByRole('link', { name: 'Laguna Clinic Branch', exact: true })).toBeVisible()
  await expect(menu.getByRole('link', { name: 'Manila Clinic Branch', exact: true })).toBeVisible()
  await expect(menu.getByRole('link', { name: 'Closed Clinic Branch', exact: true })).toHaveCount(0)
  await expect(menu.getByRole('link', { name: 'All Branches', exact: true })).toHaveAttribute('href', '/superadmin/branches')
  await page.locator('aside').first().screenshot({ path: `${evidence}/active-branch-shortcuts.png`, animations: 'disabled' })
  await toggle.click()
  await expect(toggle).toHaveAttribute('aria-expanded', 'false')
  await expect(menu).toBeHidden()
  await toggle.click()
  await menu.getByRole('link', { name: 'Manila Clinic Branch', exact: true }).click()
  await expect(page).toHaveURL(/\/superadmin\/branches\/2$/)
  await expect(page.getByText('Manila Clinic Branch', { exact: true }).first()).toBeVisible()
})

test('active branch shortcuts refresh after branch changes and recover from a failed request', async ({ page }) => {
  await mockClinic(page, 'superadmin')
  let failing = true
  let rows = branches
  await page.route(/\/api\/branches\/?$/, route => failing
    ? route.fulfill({ status: 503, json: { message: 'Branches temporarily unavailable.' } })
    : route.fulfill({ json: rows }))
  await page.goto('/superadmin')
  await page.getByRole('button', { name: 'Clinic Branches', exact: true }).click()
  const menu = page.getByRole('region', { name: 'Clinic branch shortcuts', exact: true })
  await expect(menu.getByRole('alert')).toContainText('Branches temporarily unavailable.')
  failing = false
  await menu.getByRole('button', { name: 'Try Again', exact: true }).click()
  await expect(menu.getByRole('link', { name: 'Manila Clinic Branch', exact: true })).toBeVisible()
  rows = branches.map(branch => ({ ...branch, is_active: 0 }))
  await page.evaluate(() => window.dispatchEvent(new CustomEvent('clinic:refresh', { detail: { eventName: 'branch_updated', data: {} } })))
  await expect(menu.getByText('No active clinic branches.', { exact: true })).toBeVisible()
  await expect(menu.getByRole('link', { name: 'Manila Clinic Branch', exact: true })).toHaveCount(0)
})

test('branch shortcuts work on mobile and honor reduced motion', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 })
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await mockClinic(page, 'superadmin')
  await page.route(/\/api\/branches\/?$/, route => route.fulfill({ json: branches }))
  await page.goto('/superadmin')
  await page.getByRole('button', { name: 'Open navigation', exact: true }).click()
  await page.getByRole('button', { name: 'Clinic Branches', exact: true }).click()
  const menu = page.getByRole('region', { name: 'Clinic branch shortcuts', exact: true })
  await expect(menu.getByRole('link', { name: 'Manila Clinic Branch', exact: true })).toBeVisible()
  expect(await menu.evaluate(node => getComputedStyle(node).transitionProperty)).toBe('none')
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true)
  await page.locator('aside').first().screenshot({ path: `${evidence}/mobile-branch-shortcuts.png`, animations: 'disabled' })
})

for (const role of ['admin', 'superadmin', 'staff']) {
  test(`${role} requires full payment, calculates change, and has no outstanding balance displays`, async ({ page }) => {
    const { checkout, state } = await mockClinic(page, role, { bill: { ...baseBill(), status: 'ready', subtotal: 1500, total_amount: 1500, balance_amount: 1500, discount_amount: 0 }, requests: false })
    await page.goto(checkout)
    const payment = page.getByRole('region', { name: 'Payment details', exact: true })
    await expect(page.getByText(/outstanding|remaining balance|partial payment/i)).toHaveCount(0)
    await expect(page.getByRole('checkbox', { name: /partial/i })).toHaveCount(0)
    await page.getByRole('button', { name: 'Cash', exact: true }).click()
    await page.getByRole('spinbutton', { name: 'Cash Received', exact: true }).fill('1000')
    await expect(page.getByRole('button', { name: 'Record Payment', exact: true })).toBeDisabled()
    await page.getByRole('spinbutton', { name: 'Cash Received', exact: true }).fill('2000')
    await expect(payment).toContainText('₱500.00')
    await page.getByRole('button', { name: 'Record Payment', exact: true }).click()
    await page.getByRole('button', { name: /Confirm Payment ₱1,500\.00/ }).click()
    await expect.poll(() => state.calls.filter(call => call.path.endsWith('/billing/6/pay')).length).toBe(1)
    const body = state.calls.find(call => call.path.endsWith('/billing/6/pay')).body
    expect(body.payment_amount).toBe(1500)
    expect(body.amount_received).toBe(2000)
    await expect(page.getByText('Payment recorded successfully', { exact: true })).toBeVisible()
    await expect(page.getByText(/outstanding|remaining balance|partial payment/i)).toHaveCount(0)
  })
}
