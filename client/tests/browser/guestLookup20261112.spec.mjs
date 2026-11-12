import { test, expect } from '@playwright/test'
const number = '639170000001'
const proof = () => ({ verified: true, phone: number, expires_at: '2026-11-12T04:30:00Z', daily_limit: { limit: 3, used: 3, remaining: 0, resets_at: '2026-11-12T16:00:00Z' } })
const appointment = (id, status = 'pending') => ({ id, reference: 'G-' + id, status, branch_name: id === 123 ? 'Synthetic Laguna Branch' : 'Synthetic Manila Branch', doctor_name: 'Dr Synthetic', service_name: 'Synthetic Consultation', appointment_date: '2026-11-13', appointment_time: '10:00 AM' })
async function clinic(page, options = {}) {
  await page.clock.install({ time: new Date('2026-11-12T04:00:00Z') })
  const state = { verified: Boolean(options.verified), status: 'pending', calls: [], lookups: 0 }
  await page.route('**/api/**', async route => {
    const request = route.request(), path = new URL(request.url()).pathname
    let body; try { body = request.postDataJSON() } catch {}
    state.calls.push({ path, body, headers: request.headers() })
    const send = (data, status = 200) => route.fulfill({ status, json: data })
    if (path.endsWith('/check-auth')) return send({ authenticated: false })
    if (path.endsWith('/branches')) return send([{ id: 1, name: 'Synthetic Branch' }])
    if (path.endsWith('/phone/status')) return send(state.verified ? proof() : { verified: false })
    if (path.endsWith('/phone/request-code')) return send({ resend_after_seconds: 60 })
    if (path.endsWith('/phone/verify-code')) {
      if (body.code !== '123456') return send({ code: 'INVALID_CODE', message: 'Invalid or expired verification code.' }, 400)
      state.verified = true; return send(proof())
    }
    if (path.endsWith('/appointments/lookup')) {
      state.lookups++
      if (options.lookupFailure && state.lookups === 1) return send({ message: 'Could not load appointments. Try again.' }, 503)
      if (!state.verified || body.phone !== number) return send({ code: 'GUEST_PHONE_VERIFICATION_REQUIRED', message: 'Verify this number first.' }, 403)
      if (options.empty) return send({ items: [], next_cursor: null })
      if (options.pages) return send(body.before_id ? { items: [appointment(121)], next_cursor: null } : { items: [appointment(123)], next_cursor: 123 })
      return send({ items: [appointment(123, state.status), appointment(122, 'confirmed')], next_cursor: null })
    }
    if (path.endsWith('/appointments/123')) return send(appointment(123, state.status))
    if (path.endsWith('/booking-readiness')) return send({ medical: { bookable: true }, derma: { bookable: true } })
    return send([])
  })
  return state
}
async function verify(page) {
  await page.getByRole('textbox', { name: 'Mobile number', exact: true }).fill('09170000001')
  await page.getByRole('button', { name: 'Send verification code', exact: true }).click()
  await page.getByRole('textbox', { name: 'SMS verification code', exact: true }).fill('123456')
  await page.getByRole('button', { name: 'Verify and find appointments', exact: true }).click()
}
for (const width of [1440,390]) {
  test(`guest can open the lookup link, verify by SMS and check status at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 })
    const state = await clinic(page)
    await page.goto('/guest/book')
    await page.getByRole('link', { name: 'Check appointment status', exact: true }).click()
    await expect(page).toHaveURL(/\/guest\/appointments$/)
    await expect(page.getByRole('heading', { name: 'Your unfinished guest appointments' })).toHaveCount(0)
    expect(state.lookups).toBe(0)
    await verify(page)
    await expect(page.getByRole('heading', { name: 'Booking G-123', exact: true })).toBeVisible()
    await expect(page.getByRole('heading', { name: 'Booking G-122', exact: true })).toBeVisible()
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true)
    await page.screenshot({ path: `../QA_REPORT/${process.env.CARAIT_GUEST_QA_DIR || 'guest-status-lookup-2026-11-12'}/lookup-${width}.png`, fullPage: true })
    await page.getByRole('link', { name: 'View status for G-123', exact: true }).click()
    await expect(page).toHaveURL(/\/guest\/appointments\/123$/)
    await expect(page.getByText('Booking Reference: G-123', { exact: true })).toBeVisible()
    await expect(page.getByRole('button', { name: 'Copy Private Link' })).toHaveCount(0)
    state.status = 'completed'
    await page.getByRole('button', { name: 'Refresh Status', exact: true }).click()
    await expect(page.getByText('completed', { exact: true })).toBeVisible()
    expect(state.calls.some(call => call.path.endsWith('/guest/appointments'))).toBe(false)
  })
}
test('an existing verified session finds appointments even after using all daily bookings', async ({ page }) => {
  const state = await clinic(page, { verified: true })
  await page.goto('/guest/appointments')
  await expect(page.getByRole('heading', { name: 'Booking G-123', exact: true })).toBeVisible()
  expect(state.calls.filter(call => call.path.endsWith('/phone/request-code'))).toHaveLength(0)
  await page.getByRole('textbox', { name: 'Mobile number', exact: true }).fill('09170000002')
  await expect(page.getByRole('heading', { name: 'Your unfinished guest appointments' })).toHaveCount(0)
  await expect(page.getByRole('button', { name: 'Send verification code', exact: true })).toBeVisible()
  expect(state.lookups).toBe(1)
})
test('an incorrect OTP never searches or reveals guest appointments', async ({ page }) => {
  const state = await clinic(page)
  await page.goto('/guest/appointments')
  await page.getByRole('textbox', { name: 'Mobile number', exact: true }).fill('09170000001')
  await page.getByRole('button', { name: 'Send verification code', exact: true }).click()
  await page.getByRole('textbox', { name: 'SMS verification code', exact: true }).fill('000000')
  await page.getByRole('button', { name: 'Verify and find appointments', exact: true }).click()
  await expect(page.getByRole('alert')).toContainText('Invalid or expired')
  expect(state.lookups).toBe(0)
  await expect(page.getByRole('heading', { name: 'Your unfinished guest appointments' })).toHaveCount(0)
})
test('verified lookup shows a clear empty state', async ({ page }) => {
  await clinic(page, { verified: true, empty: true })
  await page.goto('/guest/appointments')
  await expect(page.getByText(/No unfinished guest appointments were found/)).toBeVisible()
})
test('guest can load additional results and refresh current statuses', async ({ page }) => {
  await clinic(page, { verified: true, pages: true })
  await page.goto('/guest/appointments')
  await page.getByRole('button', { name: 'Load more appointments', exact: true }).click()
  await expect(page.getByRole('heading', { name: 'Booking G-121', exact: true })).toBeVisible()
  await expect(page.getByRole('heading', { name: 'Booking G-123', exact: true })).toBeVisible()
  await expect(page.getByRole('button', { name: 'Load more appointments' })).toHaveCount(0)
  await page.getByRole('button', { name: 'Find appointments', exact: true }).click()
  await expect(page.getByRole('heading', { name: 'Booking G-121', exact: true })).toHaveCount(0)
})
test('lookup failure offers a retry without sending another SMS', async ({ page }) => {
  const state = await clinic(page, { verified: true, lookupFailure: true })
  await page.goto('/guest/appointments')
  await expect(page.getByRole('alert')).toContainText('Could not load appointments')
  await page.getByRole('button', { name: 'Find appointments', exact: true }).click()
  await expect(page.getByRole('heading', { name: 'Booking G-123', exact: true })).toBeVisible()
  expect(state.calls.some(call => call.path.endsWith('/phone/request-code'))).toBe(false)
})
test('appointments disappear when mobile verification expires', async ({ page }) => {
  await clinic(page, { verified: true })
  await page.goto('/guest/appointments')
  await expect(page.getByRole('heading', { name: 'Booking G-123', exact: true })).toBeVisible()
  await page.clock.fastForward(31 * 60 * 1000)
  await expect(page.getByRole('heading', { name: 'Your unfinished guest appointments' })).toHaveCount(0)
  await expect(page.getByText(/Your mobile verification expired/)).toBeVisible()
})
