import { test, expect } from '@playwright/test'
import { mockClinic } from './helpers/clinic20261111.mjs'

const savedPayment = (method = 'cash') => ({ id: 1, amount: '1949.00', amount_received: '2000.00', change_amount: '51.00', payment_method: method, status: 'completed', refund_amount: 0, receipt_number: 'OR-TEST-1949', paid_at: '2026-11-13T03:00:00+08:00' })
const savedBill = payment => ({ status: 'paid', subtotal: 2149, discount_amount: 200, approved_courtesy_discount: 200, promotion_discount_amount: 0, selected_promotion: null, total_amount: 1949, paid_amount: 1949, balance_amount: 0, payments: [payment], items: [
  { id: 90, service_name: 'Acne Management Consultation', quantity: 1, unit_price: 500, line_total: 500 },
  { id: 91, service_name: 'Acne Clearing + Salicylic Foam Wash', quantity: 1, unit_price: 650, line_total: 650 },
  { id: 92, service_name: 'Acneed Lotion', quantity: 1, unit_price: 999, line_total: 999 },
] })
const historyPath = (root, role) => `${root}/${role === 'staff' ? 'billing/history' : 'billing/transactions'}/6`

for (const role of ['admin', 'superadmin', 'staff']) for (const method of ['cash', 'qrph']) {
  test(`${role} history and printed ${method} receipt show saved payment amounts`, async ({ page }) => {
    const pageErrors = []
    page.on('pageerror', error => pageErrors.push(error.message))
    const { root, state } = await mockClinic(page, role, { bill: savedBill(savedPayment(method)), requests: false })
    await page.goto(historyPath(root, role))
    const history = page.getByRole('main', { name: 'Bill history' })
    await expect(history).toBeVisible()
    await expect(history).not.toContainText(/remaining balance|outstanding/i)
    const amounts = history.locator('dl[aria-label="Payment amounts"]')
    await expect(amounts).toContainText('Amount Paid₱1,949.00')
    if (method === 'cash') {
      await expect(amounts).toContainText('Cash Received₱2,000.00')
      await expect(amounts).toContainText('Change₱51.00')
    } else await expect(amounts).not.toContainText(/cash received|change/i)
    if (role === 'staff') await expect(page.getByRole('button', { name: 'Record Refund' })).toHaveCount(0)
    const popup = page.waitForEvent('popup')
    await history.getByRole('button', { name: 'Receipt', exact: true }).click()
    const receipt = await popup
    const summary = receipt.locator('.payment-summary')
    await expect(summary).toContainText('Amount Paid₱1,949.00')
    await expect(receipt.locator('body')).not.toContainText(/remaining balance/i)
    if (method === 'cash') {
      await expect(summary).toContainText('Cash Received₱2,000.00')
      await expect(summary).toContainText('Change₱51.00')
    } else await expect(summary).not.toContainText(/cash received|change/i)
    expect(state.calls.filter(call => !['GET', 'HEAD'].includes(call.method))).toEqual([])
    expect(pageErrors).toEqual([])
    if (role === 'superadmin' && method === 'cash') {
      await page.screenshot({ path: '../QA_REPORT/receipt-amounts-2026-11-13/history-cash.png', fullPage: true })
      await receipt.screenshot({ path: '../QA_REPORT/receipt-amounts-2026-11-13/receipt-cash.png', fullPage: true })
      await receipt.pdf({ path: '../QA_REPORT/receipt-amounts-2026-11-13/receipt-cash.pdf', format: 'A5', preferCSSPageSize: true, printBackground: true })
    }
    await receipt.close()
  })
}

test('legacy cash receipt displays unrecorded tender and change without inventing amounts', async ({ page }) => {
  const { root } = await mockClinic(page, 'admin', { bill: savedBill({ ...savedPayment(), amount_received: null, change_amount: null }), requests: false })
  await page.goto(historyPath(root, 'admin'))
  const amounts = page.locator('dl[aria-label="Payment amounts"]')
  await expect(amounts).toContainText('Cash ReceivedNot recorded')
  await expect(amounts).toContainText('ChangeNot recorded')
})

test('history list hides balances for partial payments while collection retains amount due', async ({ page }) => {
  const { root } = await mockClinic(page, 'admin', { bill: { status: 'partially_paid', total_amount: 405, paid_amount: 100, balance_amount: 305 }, requests: false })
  await page.goto(`${root}/billing?tab=history`)
  const history = page.getByRole('main', { name: 'Billing workspace' })
  await expect(history).toContainText('Bill Total')
  await expect(history).toContainText('Net paid: ₱100.00')
  await expect(history).not.toContainText(/balance due|remaining balance|₱305.00/i)
  await page.getByRole('button', { name: 'Payments', exact: true }).click()
  await expect(history).toContainText('Balance due')
  await expect(history).toContainText('₱305.00')
})
