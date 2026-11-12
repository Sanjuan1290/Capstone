import { test, expect } from '@playwright/test'
import { createRequire } from 'node:module'
import { fileURLToPath } from 'node:url'
import { mockClinic } from './helpers/clinic20261111.mjs'

const require = createRequire(import.meta.url)
const { harness } = require('../../../server/tests/helpers/dailyStockAlertsHarness.cjs')
const evidence = fileURLToPath(new URL('../../../QA_REPORT/daily-stock-walkin-payments-2026-11-12', import.meta.url))

for (const [role, width] of [['admin', 1440], ['staff', 390], ['superadmin', 1440]]) {
  test(`${role} walk-in form requires a past birthdate and permits yesterday without an Age field`, async ({ page }) => {
    await page.setViewportSize({ width, height: 1000 })
    await page.clock.install({ time: new Date('2026-11-11T16:30:00Z') })
    const { root, state } = await mockClinic(page, role)
    await page.goto(`${root}/appointments/new`)
    await page.getByRole('button', { name: /^Walk-in Now/ }).click()
    await page.getByRole('button', { name: 'Register New Patient', exact: true }).click()
    await page.getByLabel(/^Full Name/).fill('Synthetic Child')
    await page.getByLabel(/^Mobile Number/).fill('09170000001')
    await page.getByRole('combobox', { name: /^Gender/ }).selectOption('Female')
    await page.getByRole('checkbox').check()
    const birthdate = page.getByLabel('Birthdate *', { exact: true })
    const next = page.getByRole('button', { name: 'Continue', exact: true })
    await expect(birthdate).toHaveAttribute('required', '')
    await expect(birthdate).toHaveAttribute('max', '2026-11-11')
    await expect(page.getByLabel(/^Age \(/)).toHaveCount(0)
    await expect(next).toBeDisabled()
    await birthdate.fill('2026-11-12')
    await expect(next).toBeDisabled()
    await birthdate.fill('2026-11-13')
    await expect(next).toBeDisabled()
    await birthdate.fill('2026-11-11')
    await expect(next).toBeEnabled()
    await page.screenshot({ path: `${evidence}/walk-in-${role}.png`, fullPage: true })
    await next.click()
    await expect(page.getByText('Step 2 of 4', { exact: true })).toBeVisible()
    expect(state.calls.some(call => call.method === 'POST' && call.path.endsWith('/patients/walk-in'))).toBe(false)
  })
}

for (const width of [1440, 390]) {
  test(`Super Admin collection uses amount due and independent cash change at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 1000 })
    const { state, checkout } = await mockClinic(page, 'superadmin', { requests: false, bill: { status: 'partially_paid', paid_amount: 100, balance_amount: 305 } })
    await page.goto(checkout)
    const details = page.getByRole('region', { name: 'Payment details', exact: true })
    const summary = page.getByRole('complementary', { name: 'Payment summary', exact: true })
    await details.getByRole('button', { name: 'Cash', exact: true }).click()
    await expect(details.getByLabel('Payment Amount', { exact: true })).toHaveCount(0)
    await details.getByLabel('Cash Received', { exact: true }).fill('100')
    await expect(summary.getByRole('button', { name: 'Record Payment', exact: true })).toBeDisabled()
    await details.getByLabel('Cash Received', { exact: true }).fill('500')
    await expect(details).toContainText('₱195.00')
    await expect(summary).toContainText('₱305.00')
    expect(state.bill.balance_amount).toBe(305)
    await page.screenshot({ path: `${evidence}/payment-${width}.png`, fullPage: true })
    await summary.getByRole('button', { name: 'Record Payment', exact: true }).click()
    const dialog = page.getByRole('dialog', { name: 'Record Payment?', exact: true })
    await expect(dialog).toContainText('₱305.00')
    await dialog.getByRole('button', { name: 'Confirm Payment ₱305.00', exact: true }).click()
    await expect.poll(() => state.paymentKeys.size).toBe(1)
    const payment = state.calls.find(call => call.path.endsWith('/pay') && call.method === 'POST').body
    expect(payment.payment_amount).toBe(305)
    expect(payment.amount_received).toBe(500)
    expect(state.bill.balance_amount).toBe(0)
    expect(state.bill.paid_amount).toBe(405)
  })
}

test('daily stock summary appears in the Super Admin notification bell and opens the correct branch inventory', async ({ page }) => {
  await page.clock.install({ time: new Date('2026-11-12T04:00:00Z') })
  await mockClinic(page, 'superadmin')
  const h = harness()
  h.state.admins.find(row => row.account_role === 'superadmin').id = 8
  let listReads = 0
  await page.route('**/api/**', async route => {
    const req = route.request(), path = new URL(req.url()).pathname
    if (path.endsWith('/notifications')) {
      listReads++
      const items = h.state.notifications.filter(row => row.target_role === 'admin' && row.target_user_id === 8).map(row => ({ ...row, created_at: '2026-11-12T04:00:00Z', is_read: row.is_read || 0 }))
      return route.fulfill({ json: { items, unread: items.filter(row => !row.is_read).length } })
    }
    const destination = path.match(/\/notifications\/(\d+)\/destination$/)
    if (destination) return route.fulfill({ json: await h.destination({ id: destination[1], role: 'admin', userId: 8, superadmin: true }) })
    const read = path.match(/\/notifications\/(\d+)\/read$/)
    if (read) { h.state.notifications.find(row => row.id === Number(read[1])).is_read = 1; return route.fulfill({ json: { success: true } }) }
    return route.fallback()
  })
  await page.goto('/superadmin/branches/1/appointments')
  await page.getByRole('button', { name: /^Notifications/ }).click()
  await expect(page.getByText('No notifications yet.', { exact: true })).toBeVisible()
  const before = listReads
  await h.create().run()
  await page.clock.fastForward(61000)
  await expect.poll(() => listReads).toBeGreaterThan(before)
  const alert = page.getByRole('button', { name: /^Daily stock alerts - Synthetic Laguna:/ })
  await expect(alert).toContainText('1 low stock; 1 out of stock; 1 expiring within 30 days')
  await page.screenshot({ path: `${evidence}/daily-stock-notification.png`, fullPage: true })
  await alert.click()
  await expect(page).toHaveURL(/\/superadmin\/branches\/1\/inventory$/)
})
