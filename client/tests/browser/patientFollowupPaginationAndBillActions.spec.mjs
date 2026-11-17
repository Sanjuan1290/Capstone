import { test, expect } from '@playwright/test'
import { mockClinic, baseBill } from './helpers/clinic20261111.mjs'

async function patientData(page) {
  await page.clock.setFixedTime(new Date('2026-11-17T02:00:00Z'))
  await page.addInitScript(() => sessionStorage.setItem('carait:selected-branch:8', '1'))
  await mockClinic(page, 'patient')
  const recommendations = Array.from({ length: 7 }, (_, index) => ({
    id: 5, branch_id: 1, status: 'active', return_date: `2026-11-${18 + index}`,
    doctor_note: `Follow-up note ${index + 1}`, doctor_name: 'Dr Test', branch_name: 'Test Branch',
    appointment_id: 9, original_date: '2026-11-17',
  }))
  const otherBranch = [25, 26].map(day => ({ ...recommendations[0], id: 6, branch_id: 2, branch_name: 'Second Branch', return_date: `2026-11-${day}`, doctor_note: `Second branch note ${day}` }))
  const state = { recommendations: [...recommendations, ...otherBranch], followupRequests: 0 }
  const bill = {
    ...baseBill(), status: 'paid', payment_status: 'paid', subtotal: 1800, total_amount: 1800,
    paid_amount: 1800, balance_amount: 0, discount_amount: 0, promotion_discount_amount: 0, selected_promotion: null,
    items: [{ id: 90, item_type: 'service', source_type: 'consultation', service_name: 'Wound Dressing', quantity: 1, unit_price: 1800, line_total: 1800, details: { pricing: { consultation_fee: 1800 }, materials: [] } }],
    payments: [{ id: 1, amount: 1800, amount_received: 2000, change_amount: 200, payment_method: 'cash', status: 'completed', receipt_number: 'OR-TEST-001', paid_at: '2026-11-17' }],
  }
  await page.route('**/api/**', async route => {
    const path = new URL(route.request().url()).pathname
    const send = json => route.fulfill({ json })
    if (path.endsWith('/profile-status')) return send({ is_profile_complete: true, missing_fields: [], onboarding_completed_at: '2026-01-01' })
    if (path.endsWith('/settings')) return send({ id: 8, role: 'patient', email_verified_at: '2026-01-01', phone_verified_at: '2026-01-01' })
    if (path.endsWith('/branches')) return send([{ id: 1, name: 'Test Branch' }, { id: 2, name: 'Second Branch' }])
    if (path.endsWith('/follow-ups')) { state.followupRequests++; return send(state.recommendations) }
    if (path.endsWith('/appointments/history')) return send([{ id: 9, status: 'completed', branch_id: 1, branch_name: 'Test Branch', appointment_date: '2026-11-17', appointment_time: '10:00 AM', doctor_name: 'Dr Test', requested_service_name_snapshot: 'Wound Dressing', billing_id: 6, billing_status: 'paid', billing_total: 1800, billing_paid_amount: 1800 }])
    if (path.endsWith('/billing/history/6')) return send(bill)
    if (path.endsWith('/billing/history')) return send({ bills: [bill], total: 1, page: 1, totalPages: 1, summary: { paid_bills: 1 } })
    if (path.endsWith('/appointments')) return send([])
    return route.fallback()
  })
  return state
}

test.beforeEach(async ({ page }) => {
  page.errors = []
  page.on('pageerror', error => page.errors.push(error.message))
  await page.route(/^https?:\/\/(?!127\.0\.0\.1|localhost)/, route => route.abort())
})
test.afterEach(async ({ page }) => expect(page.errors).toEqual([]))

test('dashboard paginates every recommendation and resets when the selected branch changes', async ({ page }) => {
  await patientData(page)
  await page.goto('/patient')
  const recommendations = page.getByRole('region', { name: 'Recommended Follow-Up', exact: true })
  await expect(recommendations.locator('article')).toHaveCount(3)
  await expect(recommendations).toContainText('Showing 1-3 of 7')
  await expect(recommendations.getByRole('button', { name: 'Previous page', exact: true })).toBeDisabled()
  await recommendations.getByRole('button', { name: 'Next page', exact: true }).click()
  await expect(recommendations).toContainText('Follow-up note 4')
  await expect(recommendations).not.toContainText('Follow-up note 1')
  await expect(recommendations.getByRole('link', { name: 'Book Appointment', exact: true }).first()).toHaveAttribute('href', /follow_up_id=5&follow_up_date=2026-11-21/)
  await recommendations.getByRole('button', { name: 'Last page', exact: true }).click()
  await expect(recommendations).toContainText('Showing 7-7 of 7')
  await expect(recommendations.locator('article')).toHaveCount(1)
  await expect(recommendations.getByRole('button', { name: 'Next page', exact: true })).toBeDisabled()
  await recommendations.getByRole('button', { name: 'Previous page', exact: true }).click()
  await expect(recommendations).toContainText('Page 2 of 3')
  await page.getByRole('combobox', { name: 'Change clinic branch', exact: true }).selectOption('2')
  await expect(recommendations.locator('article')).toHaveCount(2)
  await expect(recommendations).toContainText('Second branch note 25')
  await expect(recommendations.getByRole('button', { name: 'Next page', exact: true })).toHaveCount(0)
  await page.getByRole('combobox', { name: 'Change clinic branch', exact: true }).selectOption('1')
  await expect(recommendations).toContainText('Showing 1-3 of 7')
  await page.setViewportSize({ width: 390, height: 844 })
  await recommendations.getByRole('button', { name: 'Next page', exact: true }).click()
  await expect(recommendations).toContainText('Page 2 of 3')
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true)
})

test('recommendation pagination stays valid when a refresh reduces the number of recommendations', async ({ page }) => {
  const state = await patientData(page)
  await page.goto('/patient')
  const recommendations = page.getByRole('region', { name: 'Recommended Follow-Up', exact: true })
  await recommendations.getByRole('button', { name: 'Last page', exact: true }).click()
  await expect(recommendations).toContainText('Follow-up note 7')
  state.recommendations = state.recommendations.slice(0, 1)
  await page.evaluate(() => window.dispatchEvent(new CustomEvent('clinic:refresh')))
  await expect(recommendations).toContainText('Follow-up note 1')
  await expect(recommendations.locator('article')).toHaveCount(1)
  await expect(recommendations.getByRole('button', { name: 'Next page', exact: true })).toHaveCount(0)
})

test('patient history keeps bill and payment details without recommendations, printing or linked appointment actions', async ({ page }) => {
  const state = await patientData(page)
  await page.goto('/patient/history')
  await expect(page.getByRole('region', { name: 'Visit history', exact: true })).toBeVisible()
  await expect(page.getByRole('region', { name: 'Recommended Follow-Up', exact: true })).toHaveCount(0)
  expect(state.followupRequests).toBe(0)
  await page.getByRole('button', { name: 'View Bill', exact: true }).click()
  const bill = page.getByRole('dialog', { name: 'Patient bill details', exact: true })
  await expect(bill).toContainText('Payment History')
  await expect(bill).toContainText('Receipt: OR-TEST-001')
  await expect(bill.getByRole('region', { name: 'Payment transaction amounts', exact: true })).toContainText('₱200.00')
  await expect(bill.getByRole('button', { name: /print|receipt|linked appointment/i })).toHaveCount(0)
  await expect(bill.getByRole('link', { name: /print|receipt|linked appointment/i })).toHaveCount(0)
  await page.keyboard.press('Escape')
  await expect(bill).toHaveCount(0)
  await page.getByRole('tab', { name: 'Billing History', exact: true }).click()
  await page.getByRole('button', { name: 'View Bill & Payments', exact: true }).click()
  await expect(bill).toContainText('Itemized Charges')
  await bill.getByRole('button', { name: 'Close', exact: true }).click()
  await expect(bill).toHaveCount(0)
})
