import test from 'node:test'
import assert from 'node:assert/strict'
import { buildSuperAdminReportHtml } from '../src/utils/superAdminReportPdf.mjs'
import { sampleReports } from './fixtures/superAdminReports20261112.mjs'

test('PDF contains every report section, selected scope, dated snapshots and payment adjustments', () => {
  const html = buildSuperAdminReportHtml(sampleReports(), { branchName: 'Synthetic Laguna', from: '2026-11-01', to: '2026-11-12', generatedAt: new Date('2026-11-12T16:30:00Z') })
  for (const heading of ['Overview', 'Branch Comparison', 'Appointments', 'Financial', 'Payment Methods', 'Doctors', 'Services', 'Promotions', 'Inventory', 'Inventory by Category', 'Stock Usage', 'Stock Movements', 'Stock Rooms']) assert.ok(html.includes(`<h2>${heading}</h2>`), heading)
  assert.match(html, /Synthetic Laguna/)
  assert.match(html, /2026-11-01 to 2026-11-12/)
  assert.match(html, /Nov 13, 2026/)
  assert.match(html, /Philippine time/)
  for (const amount of ['₱600.00', '₱60.00', '₱40.00', '₱500.00', '₱76.50']) assert.ok(html.includes(amount), amount)
  assert.match(html, /not a historical balance/)
  assert.match(html, /2026-11-12/)
  assert.match(html, /table-header-group/)
  assert.match(html, /25\.0%/)
  assert.doesNotMatch(html, /Manage Branch|data-report-controls|\.csv|\.xlsx/)
})

test('PDF escapes clinic data and safely handles empty aggregate results', () => {
  const reports = sampleReports('<script>window.secret=true</script>')
  reports.services.doctors[0].name = '<img src=x onerror=alert(1)>'
  reports.inventory.most_used = []
  const html = buildSuperAdminReportHtml(reports, { branchName: 'Clinic <&>', from: '2026-11-01', to: '2026-11-12' })
  assert.match(html, /Clinic &lt;&amp;&gt;/)
  assert.match(html, /&lt;img src=x onerror=alert\(1\)&gt;/)
  assert.doesNotMatch(html, /<script|<img/)
  assert.match(html, /No records for the selected filters/)
  assert.throws(() => buildSuperAdminReportHtml({ overview: {} }), /All report sections/)
})

test('PDF formats MySQL decimal strings as money and rates while retaining numeric-looking names', () => {
  const reports = sampleReports()
  reports.financial.billing.gross_billed = '1234.50'
  reports.overview.totals.no_show_rate = '25.0'
  reports.inventory.categories[0].name = '007'
  reports.inventory.categories[0].estimated_selling_value = '76.50'
  const html = buildSuperAdminReportHtml(reports, { branchName: 'Test', from: '2026-11-01', to: '2026-11-13' })
  assert.ok(html.includes('\u20b11,234.50'))
  assert.ok(html.includes('25.0%'))
  assert.ok(html.includes('<td>007</td>'))
  assert.equal(html.match(/<h2>Inventory by Category<\/h2>/g).length, 1)
  assert.ok(html.includes('\u20b176.50'))
})
