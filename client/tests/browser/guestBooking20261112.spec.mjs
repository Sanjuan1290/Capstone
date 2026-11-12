import { test, expect } from '@playwright/test'

const schedule = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'].map(day_of_week => ({ day_of_week, is_active: 1, start_time: '08:00', end_time: '17:00' }))
const number = '639170000001'
const proof = used => ({ verified: true, phone: number, expires_at: '2026-11-12T04:30:00Z', daily_limit: { limit: 3, used, remaining: 3 - used, resets_at: '2026-11-12T16:00:00Z' } })
async function clinic(page, options = {}) {
  const state = { verified: Boolean(options.verified), used: options.used || 0, calls: [], submitted: [], lost: false }
  await page.clock.install({ time: new Date('2026-11-12T04:00:00Z') })
  await page.route('**/api/**', async route => {
    const req = route.request(), url = new URL(req.url()), path = url.pathname
    let body; try { body = req.postDataJSON() } catch {}
    state.calls.push({ path, body, method: req.method() })
    const send = (data, status = 200) => route.fulfill({ status, json: data })
    if (path.endsWith('/check-auth')) return send({ authenticated: false })
    if (path === '/api/patient/branches') return send([{ id: 1, name: 'Synthetic Branch' }, { id: 2, name: 'Other Branch' }])
    if (path.endsWith('/phone/status')) return send(state.verified ? proof(state.used) : { verified: false })
    if (path.endsWith('/phone/request-code')) return send({ resend_after_seconds: 60 })
    if (path.endsWith('/phone/verify-code')) {
      if (body.code !== '123456') return send({ code: 'INVALID_CODE', message: 'Invalid or expired verification code.' }, 400)
      state.verified = true; return send(proof(state.used))
    }
    if (path.endsWith('/booking-services')) return send(url.searchParams.get('clinic_type') === 'medical' ? [{ id: 77, service_name: 'Synthetic Consultation', category: 'Consultation', default_price: 650, average_duration_minutes: 60, clinic_type: 'medical', current_offer: { id: 5, title: 'Patient-only Offer', quote: { original: 650, current: 520, discount: 130 } } }] : [])
    if (path.endsWith('/booking-readiness')) return send({ medical: { bookable: true }, derma: { bookable: false } })
    if (path.endsWith('/doctors/availability')) return send({ doctors: [{ id: 8, full_name: 'Dr Synthetic', clinic_type: 'medical', weekly_schedule: schedule }] })
    if (path.endsWith('/schedule')) return send(schedule)
    if (path.endsWith('/unavailable-dates')) return send([])
    if (path.endsWith('/available-slots')) return send({ slots: ['10:00 AM', '11:00 AM'] })
    if (path.endsWith('/appointment-reasons')) return send([{ id: 1, label: 'Follow up', is_active: 1 }])
    if (path.endsWith('/appointments/recover')) return options.recover ? send({ id: 123, access_token: 'synthetic-private-booking-token-long-enough' }) : send({ message: 'No saved booking found' }, 404)
    if (path.endsWith('/guest/appointments') && req.method() === 'POST') {
      state.submitted.push(body)
      if (options.quotaError) return send({ code: 'GUEST_DAILY_LIMIT', message: 'You have reached the limit of 3 guest bookings today.', details: { limit: 3, used: 3, remaining: 0 } }, 429)
      if (options.loseResponse && !state.lost) { state.lost = true; return route.abort('failed') }
      return send({ id: 123, access_token: 'synthetic-private-booking-token-long-enough', daily_limit: proof(1).daily_limit }, 201)
    }
    if (path.endsWith('/guest/appointments/123')) return send({ id: 123, reference: 'G-123', status: 'pending', branch_name: 'Synthetic Branch', service_name: 'Synthetic Consultation', doctor_name: 'Dr Synthetic', appointment_date: '2026-11-13', appointment_time: '10:00 AM' })
    return send([])
  })
  return state
}
async function start(page, options = {}) {
  const state = await clinic(page, options)
  await page.goto('/guest/book')
  await page.getByLabel('Clinic branch', { exact: true }).selectOption('1')
  return state
}
async function verify(page) {
  await page.getByLabel('Mobile number', { exact: true }).fill('09170000001')
  await page.getByRole('button', { name: 'Send verification code' }).click()
  await page.getByLabel('SMS verification code').fill('123456')
  await page.getByRole('button', { name: 'Verify mobile number' }).click()
  await expect(page.getByText('Mobile number verified.', { exact: true })).toBeVisible()
}
async function review(page) {
  if (await page.getByRole('heading', { name: 'Verify your mobile number', exact: true }).isVisible()) await page.getByRole('button', { name: 'Continue', exact: true }).click()
  await page.getByRole('button', { name: /Synthetic Consultation.*Select service/ }).click()
  await expect(page.getByLabel('Special offer price')).toHaveCount(0)
  await expect(page.getByText('Patient-only Offer')).toHaveCount(0)
  await page.getByRole('button', { name: 'Continue', exact: true }).click()
  await page.getByRole('button', { name: /Dr Synthetic/ }).click()
  await page.getByRole('button', { name: 'Continue', exact: true }).click()
  await page.getByRole('button', { name: 'November 13, 2026', exact: true }).click()
  await page.getByRole('button', { name: '10:00 AM', exact: true }).click()
  await page.getByRole('button', { name: 'Continue', exact: true }).click()
  await page.getByLabel('Full name *', { exact: true }).fill('Synthetic Guest')
  await page.getByLabel('Gender', { exact: true }).selectOption('Female')
  await page.getByLabel('Age (required without birthdate)', { exact: true }).fill('35')
  await page.getByRole('button', { name: 'Follow up', exact: true }).click()
  await page.getByLabel('Additional notes').fill('Synthetic note')
  await page.getByRole('checkbox').check()
}

for (const viewport of [{ width: 1440, height: 1000 }, { width: 390, height: 844 }]) {
  test(`guest completes the portal-style booking at ${viewport.width}px without promotion access`, async ({ page }) => {
    await page.setViewportSize(viewport)
    const state = await start(page)
    await expect(page.getByRole('button', { name: 'Continue', exact: true })).toBeDisabled()
    await verify(page); await review(page)
    await page.screenshot({ path: `../QA_REPORT/guest-booking-2026-11-12/review-${viewport.width}.png`, fullPage: true })
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true)
    await page.getByRole('button', { name: 'Request Appointment', exact: true }).click()
    await expect(page).toHaveURL(/\/guest\/appointments\/123#/)
    await expect(page.getByText('Booking Reference: G-123', { exact: true })).toBeVisible()
    expect(state.submitted).toHaveLength(1)
    expect(state.submitted[0].phone).toBe(number)
    expect(state.submitted[0].notes).toBe('Synthetic note')
    expect(state.submitted[0]).not.toHaveProperty('promotion_id')
    expect(state.calls.some(call => call.path.endsWith('/promotions'))).toBe(false)
  })
}
test('wrong SMS code and changing one digit both keep the booking locked', async ({ page }) => {
  await start(page)
  await page.getByLabel('Mobile number', { exact: true }).fill('09170000001')
  await page.getByRole('button', { name: 'Send verification code' }).click()
  await page.getByLabel('SMS verification code').fill('000000')
  await page.getByRole('button', { name: 'Verify mobile number' }).click()
  await expect(page.getByRole('alert')).toContainText('Invalid or expired')
  await expect(page.getByRole('button', { name: 'Continue', exact: true })).toBeDisabled()
  await page.getByLabel('SMS verification code').fill('123456')
  await page.getByRole('button', { name: 'Verify mobile number' }).click()
  await expect(page.getByRole('button', { name: 'Continue', exact: true })).toBeEnabled()
  await page.getByLabel('Mobile number', { exact: true }).fill('09170000002')
  await expect(page.getByRole('button', { name: 'Continue', exact: true })).toBeDisabled()
})
test('the fourth guest booking is blocked before continuing', async ({ page }) => {
  await start(page, { verified: true, used: 3 })
  await expect(page.getByRole('alert')).toContainText('used your 3 guest bookings')
  await expect(page.getByRole('button', { name: 'Continue', exact: true })).toBeDisabled()
})
test('a lost response retries with the same submission key', async ({ page }) => {
  const state = await start(page, { verified: true, loseResponse: true })
  await review(page)
  await page.getByRole('button', { name: 'Request Appointment', exact: true }).click()
  await expect(page.getByRole('alert')).toBeVisible()
  await page.getByRole('button', { name: 'Request Appointment', exact: true }).click()
  await expect(page).toHaveURL(/\/guest\/appointments\/123#/)
  expect(state.submitted).toHaveLength(2)
  expect(state.submitted[0].submission_key).toBe(state.submitted[1].submission_key)
})
test('reload recovers an earlier booking even when all three bookings were used', async ({ page }) => {
  await clinic(page, { verified: true, used: 3, recover: true })
  await page.addInitScript(() => sessionStorage.setItem('carait.guest.pending.639170000001', '49e5aec6-04e5-4e69-b9e6-d874a971204f'))
  await page.goto('/guest/book')
  await expect(page).toHaveURL(/\/guest\/appointments\/123#/)
})
test('a quota exhausted in another tab disables further submission', async ({ page }) => {
  await start(page, { verified: true, quotaError: true })
  await review(page)
  await page.getByRole('button', { name: 'Request Appointment', exact: true }).click()
  await expect(page.getByRole('alert').filter({ hasText: 'reached the limit' })).toBeVisible()
  await expect(page.getByRole('button', { name: 'Request Appointment', exact: true })).toBeDisabled()
})
test('public offers explain that a registered patient must sign in', async ({ page }) => {
  await clinic(page)
  await page.route('**/api/news?type=promotion', route => route.fulfill({ status: 403, json: { code: 'PATIENT_ACCOUNT_REQUIRED', message: 'Sign in with a patient account to view promotions.' } }))
  await page.goto('/news?type=promotion')
  await expect(page.getByRole('heading', { name: 'Patient account required', exact: true })).toBeVisible()
  await expect(page.getByRole('link', { name: 'Sign in to view offers', exact: true })).toHaveAttribute('href', /\/patient\/login/)
})
