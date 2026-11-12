import { test, expect } from '../../../client/node_modules/@playwright/test/index.mjs'
import { mockClinic } from '../../../client/tests/browser/helpers/clinic20261111.mjs'

test('Super Admin saves receipt wording through the global API and clinic profile link retains branch', async ({ page }) => {
  await mockClinic(page, 'superadmin')
  const changes = []
  await page.route('**/api/admin/clinic-settings', async route => {
    if (route.request().method() === 'PUT') changes.push(route.request().postDataJSON())
    return route.fulfill({ json: { clinic_name: 'Synthetic Global Clinic', receipt_title: 'PAYMENT RECEIPT', receipt_footer: changes.at(-1)?.receipt_footer || '' } })
  })
  await page.goto('/superadmin/branches/1/system-setup/billing/receipt')
  await expect(page.getByRole('heading', { name: 'Receipt Settings', exact: true })).toBeVisible()
  await page.locator('textarea').fill('Synthetic receipt footer')
  await page.getByRole('button', { name: 'Save Receipt Settings', exact: true }).click()
  await expect.poll(() => changes.length).toBe(1)
  expect(changes[0].receipt_footer).toBe('Synthetic receipt footer')
  await page.getByRole('link', { name: /Edit Clinic Profile/ }).click()
  await expect(page).toHaveURL(/\/superadmin\/branches\/1\/clinic-settings$/)
  await expect(page.getByRole('heading', { name: 'Clinic Settings', exact: true })).toBeVisible()
})

test('Admin sees receipt wording as read-only', async ({ page }) => {
  await mockClinic(page, 'admin')
  await page.goto('/admin/system-setup/billing/receipt')
  await expect(page.getByRole('heading', { name: 'Receipt Settings', exact: true })).toBeVisible()
  await expect(page.locator('textarea')).toBeDisabled()
  await expect(page.getByRole('button', { name: 'Save Receipt Settings', exact: true })).toBeDisabled()
})

test('Excel import history uses paginated API and displays the second page', async ({ page }) => {
  await mockClinic(page, 'admin')
  const pages = []
  await page.route('**/inventory/excel-imports?*', route => {
    const pageNumber = Number(new URL(route.request().url()).searchParams.get('page'))
    pages.push(pageNumber)
    return route.fulfill({ json: { items: [{ id: pageNumber === 1 ? 11 : 1, upload_type: 'new_items', created_at: '2026-11-12T10:00:00+08:00' }], pagination: { page: pageNumber, total: 11, totalPages: 2, limit: 10 } } })
  })
  await page.goto('/admin/inventory')
  await page.getByRole('button', { name: 'Show Excel Tools', exact: true }).click()
  await page.getByRole('button', { name: 'Show History', exact: true }).click()
  const history = page.getByRole('heading', { name: 'Excel Import History', exact: true }).locator('../../..')
  await expect(history).toContainText('Page 1 of 2')
  await history.getByRole('button', { name: 'Next', exact: true }).click()
  await expect(history).toContainText('Page 2 of 2')
  await expect(history).toContainText('Upload #1')
  await expect(history.getByRole('button', { name: 'Next', exact: true })).toBeDisabled()
  expect(pages).toContain(2)
})

test('Queue Display Security generates and hides an eight-digit PIN in branch setup', async ({ page }) => {
  await mockClinic(page, 'admin')
  let generated = false
  await page.route('**/queue-display-security', route => route.fulfill({ json: { configured: generated } }))
  await page.route('**/queue-display-security/generate', route => { generated = true; return route.fulfill({ json: { pin: '12345678', message: 'Synthetic PIN generated' } }) })
  await page.goto('/admin/system-setup?tab=queue_security')
  await expect(page.getByRole('heading', { name: 'Queue Display Security', exact: true })).toBeVisible()
  page.once('dialog', dialog => dialog.accept())
  await page.getByRole('button', { name: 'Generate New PIN', exact: true }).click()
  await expect(page.getByText('12345678', { exact: true })).toBeVisible()
  await page.getByRole('button', { name: 'Hide PIN', exact: true }).click()
  await expect(page.getByText('12345678', { exact: true })).toHaveCount(0)
})

test('Guest form submits age without birthdate and opens private booking status', async ({ page }) => {
  await mockClinic(page, 'patient')
  let submitted
  const token = 'synthetic-test-token-0123456789-abcdef'
  await page.route('**/api/patient/**', route => {
    const url = new URL(route.request().url()), path = url.pathname
    if (path.endsWith('/branches')) return route.fulfill({ json: [{ id: 1, name: 'Synthetic Branch' }] })
    if (path.endsWith('/guest/booking-services')) return route.fulfill({ json: [{ id: 77, service_name: 'Synthetic Service', clinic_type: 'medical', default_price: 650 }] })
    if (path.endsWith('/guest/doctors')) return route.fulfill({ json: [{ id: 8, name: 'Synthetic Doctor', full_name: 'Synthetic Doctor', clinic_type: 'medical' }] })
    if (path.endsWith('/guest/appointment-reasons')) return route.fulfill({ json: [{ id: 1, label: 'Follow up', clinic_type: 'medical', is_active: 1 }] })
    if (path.endsWith('/guest/booking-readiness')) return route.fulfill({ json: { medical: { bookable: true } } })
    if (path.endsWith('/available-slots')) return route.fulfill({ json: { slots: ['10:00'] } })
    if (path.endsWith('/guest/appointments') && route.request().method() === 'POST') { submitted = route.request().postDataJSON(); return route.fulfill({ status: 201, json: { id: 123, access_token: token } }) }
    if (path.endsWith('/guest/appointments/123')) {
      expect(route.request().headers()['x-guest-booking-token']).toBe(token)
      return route.fulfill({ json: { reference: 'G-123', status: 'pending', branch_name: 'Synthetic Branch', service_name: 'Synthetic Service', doctor_name: 'Synthetic Doctor', appointment_date: '2027-02-01', appointment_time: '10:00' } })
    }
    return route.fallback()
  })
  await page.goto('/guest/book')
  const branch = page.getByRole('heading', { name: '1. Branch and Service', exact: true }).locator('..')
  await branch.locator('select').first().selectOption('1')
  await branch.locator('select').last().selectOption('77')
  const schedule = page.getByRole('heading', { name: '2. Doctor and Schedule', exact: true }).locator('..')
  await schedule.locator('select').first().selectOption('8')
  await schedule.locator('input[type=date]').fill('2027-02-01')
  await schedule.locator('select').nth(1).selectOption('10:00')
  await page.locator('select:has(option[value="Follow up"])').selectOption('Follow up')
  await page.locator('input[autocomplete=name]').fill('Synthetic Guest')
  await page.getByRole('heading', { name: '3. Patient Information', exact: true }).locator('..').locator('select').selectOption('Female')
  await page.getByPlaceholder('09XXXXXXXXX').fill('09170000001')
  await page.locator('input[type=number]').fill('35')
  await page.locator('input[type=checkbox]').check()
  await page.getByRole('button', { name: 'Submit Guest Appointment', exact: true }).click()
  await expect(page.getByRole('heading', { name: 'Guest Appointment Status', exact: true })).toBeVisible()
  await expect(page.getByText('Booking Reference: G-123', { exact: true })).toBeVisible()
  expect(submitted.reported_age).toBe('35')
  expect(submitted.birthdate).toBe('')
})
