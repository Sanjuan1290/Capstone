import { test, expect } from '@playwright/test'
import { createRequire } from 'node:module'
import { fileURLToPath } from 'node:url'
import { readFile } from 'node:fs/promises'
import { mockClinic } from './helpers/clinic20261111.mjs'
import { branchMetrics, sampleReports } from '../fixtures/superAdminReports20261112.mjs'
import { sampleInventory } from '../../../QA_REPORT/contact-inventory-pdf-2026-11-12/workbook-sample.mjs'

const require = createRequire(import.meta.url)
const { harness } = require('../../../server/tests/helpers/appointmentContactsHarness.cjs')
const evidence = fileURLToPath(new URL('../../../QA_REPORT/contact-inventory-pdf-2026-11-12', import.meta.url))

for (const role of ['admin', 'superadmin']) {
  test(`appointment review displays the stored guest phone and email for ${role}`, async ({ page }) => {
    const { root } = await mockClinic(page, role)
    const h = harness()
    await page.route('**/api/**/appointments', async route => {
      let body
      await h.handler({ branchId: 1, query: {} }, { json(value) { body = value } })
      await route.fulfill({ json: body })
    })
    await page.goto(`${root}/appointments?appointment_id=901`)
    await expect(page.getByText('Phone', { exact: true }).locator('..')).toContainText('639170000011')
    await expect(page.getByText('Email', { exact: true }).locator('..')).toContainText('guest@example.test')
    expect(h.calls.length).toBeGreaterThan(0)
    expect(h.calls.every(call => call.values[0] === 1)).toBe(true)
    await page.screenshot({ path: `${evidence}/appointment-contacts-${role}.png` })
  })
}

test('All Inventory downloads a real styled workbook containing all matching rows rather than the visible page', async ({ page }) => {
  await mockClinic(page, 'superadmin')
  const exports = []
  await page.route('**/api/branches/inventory/all**', route => {
    const url = new URL(route.request().url())
    if (url.pathname.endsWith('/export')) { exports.push(url); return route.fulfill({ json: sampleInventory }) }
    return route.fulfill({ json: { ...sampleInventory, rows: [sampleInventory.rows[0]], total: 2, page: 1, limit: 1 } })
  })
  await page.goto('/superadmin/inventory')
  await expect(page.getByRole('row', { name: /Medicine & Supplies/ })).toBeVisible()
  await expect(page.getByRole('row', { name: /Skin Cream/ })).toHaveCount(0)
  const downloadEvent = page.waitForEvent('download')
  await page.getByRole('button', { name: 'Export Excel (.xlsx)', exact: true }).click()
  const download = await downloadEvent
  expect(download.suggestedFilename()).toMatch(/^CARAIT_All_Inventory_\d{4}-\d{2}-\d{2}\.xlsx$/)
  const path = `${evidence}/all-inventory-browser.xlsx`
  await download.saveAs(path)
  const bytes = await readFile(path), contents = bytes.toString('utf8')
  expect(bytes.readUInt32LE(0)).toBe(0x04034b50)
  expect(contents).toContain('Skin Cream')
  expect(contents).toContain('Medicine &amp; Supplies')
  expect(exports).toHaveLength(1)
  expect(exports[0].searchParams.has('page')).toBe(false)
  expect(exports[0].searchParams.has('limit')).toBe(false)
})

async function reportPortal(page) {
  await mockClinic(page, 'superadmin')
  const state = { calls: [], failFinancial: false }
  await page.addInitScript(() => {
    window.__reportPrints = 0
    window.print = () => { throw Error('Reports must print their dedicated document') }
    const create = document.createElement.bind(document)
    document.createElement = (tag, ...args) => {
      const element = create(tag, ...args)
      if (tag.toLowerCase() === 'iframe') element.addEventListener('load', () => {
        element.contentWindow.print = () => { window.__reportPrints++; window.__printedReportHtml = element.srcdoc }
      })
      return element
    }
  })
  await page.route('**/api/branches/analytics/**', async route => {
    const url = new URL(route.request().url())
    state.calls.push({ section: url.searchParams.get('section'), branch: url.searchParams.get('branch_id'), from: url.searchParams.get('from'), to: url.searchParams.get('to'), path: url.pathname })
    if (url.pathname.endsWith('/all')) return route.fulfill({ json: branchMetrics })
    if (url.pathname.endsWith('/trends')) return route.fulfill({ json: { appointments: [] } })
    if (url.pathname.endsWith('/readiness')) return route.fulfill({ json: [] })
    const section = url.searchParams.get('section')
    if (state.failFinancial && section === 'financial') return route.fulfill({ status: 503, json: { message: 'Financial report temporarily unavailable.' } })
    const branchName = url.searchParams.get('branch_id') === '2' ? 'Synthetic Manila' : 'Synthetic Laguna'
    return route.fulfill({ json: { data: sampleReports(branchName)[section] } })
  })
  await page.goto('/superadmin/reports')
  await expect(page.getByRole('button', { name: 'Print / Save PDF', exact: true })).toBeEnabled()
  return state
}

for (const [device, branch, branchName] of [['desktop', '2', 'Synthetic Manila'], ['mobile', 'all', 'All Branches']]) {
  test(`PDF-only report export includes every section and respects branch/date filters on ${device}`, async ({ page }) => {
    await page.setViewportSize({ width: device === 'desktop' ? 1440 : 390, height: device === 'desktop' ? 1000 : 844 })
    const state = await reportPortal(page)
    await expect(page.getByRole('button', { name: /^(CSV|Excel)$/ })).toHaveCount(0)
    await page.getByLabel('Reporting Period', { exact: true }).selectOption('custom')
    await page.getByLabel('From', { exact: true }).fill('2026-11-01')
    await page.getByLabel('To', { exact: true }).fill('2026-11-12')
    await page.getByLabel('Clinic Branch', { exact: true }).selectOption(branch)
    await page.getByRole('button', { name: 'Appointments & Patients', exact: true }).click()
    await expect(page.getByRole('button', { name: 'Print / Save PDF', exact: true })).toBeEnabled()
    const before = state.calls.length
    await page.getByRole('button', { name: 'Print / Save PDF', exact: true }).click()
    await expect.poll(() => page.evaluate(() => window.__reportPrints)).toBe(1)
    await expect(page.getByText('Save your PDF', { exact: true })).toBeVisible()
    const html = await page.evaluate(() => window.__printedReportHtml)
    expect(html).toContain(branchName)
    expect(html).toContain('2026-11-01 to 2026-11-12')
    for (const section of ['Overview', 'Appointments', 'Financial', 'Doctors', 'Services', 'Inventory']) expect(html).toContain(`<h2>${section}</h2>`)
    const exported = state.calls.slice(before).filter(call => call.section)
    expect(exported.map(call => call.section).sort()).toEqual(['financial', 'inventory', 'overview', 'services'])
    expect(exported.every(call => call.from === '2026-11-01' && call.to === '2026-11-12' && call.branch === (branch === 'all' ? null : branch))).toBe(true)
    if (branch !== 'all') expect(html).not.toContain('Synthetic Laguna')
    const preview = await page.context().newPage()
    await preview.setContent(html)
    await preview.emulateMedia({ media: 'print' })
    await preview.pdf({ path: `${evidence}/super-admin-report-${device}.pdf`, format: 'A4', printBackground: true, preferCSSPageSize: true })
    await preview.setViewportSize({ width: 794, height: 1123 })
    await preview.screenshot({ path: `${evidence}/pdf-preview-${device}.png` })
    await preview.close()
    await page.screenshot({ path: `${evidence}/report-actions-${device}.png`, fullPage: true })
  })
}

test('PDF export reports a failed section and allows retry without printing a partial report', async ({ page }) => {
  const state = await reportPortal(page)
  state.failFinancial = true
  await page.getByRole('button', { name: 'Print / Save PDF', exact: true }).click()
  await expect(page.getByRole('alert')).toContainText('Financial report temporarily unavailable.')
  expect(await page.evaluate(() => window.__reportPrints)).toBe(0)
  await expect(page.locator('iframe[title="Printable Carait Clinic reports"]')).toHaveCount(0)
  state.failFinancial = false
  await page.getByRole('button', { name: 'Print / Save PDF', exact: true }).click()
  await expect.poll(() => page.evaluate(() => window.__reportPrints)).toBe(1)
})
