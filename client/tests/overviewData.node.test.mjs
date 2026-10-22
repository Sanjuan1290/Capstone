import test from 'node:test'
import assert from 'node:assert/strict'
import { loadOverviewSections } from '../src/pages/superAdminPage/redesign/overviewData.mjs'

const validPeriod = (from, to) => /^\d{4}-\d{2}-\d{2}$/.test(from) && /^\d{4}-\d{2}-\d{2}$/.test(to) && from <= to
const branchMetrics = { id: 4, name: 'North', is_active: 1, appointments: 2, pending: 0, completed: 1, no_shows: 0, doctors: 2, billed: 120, collected: 80 }
const trendRows = [{ date: '2026-10-20', appointments: 2, completed: 1 }]
const readinessRows = [{ id: 4, name: 'North', is_active: 1, ready: true, missing: [] }]

test('organization dashboard sections load independently and include the selected branch in trends', async () => {
  const calls = []
  const result = await loadOverviewSections({
    from: '2026-10-01', to: '2026-10-20', branch: '4', isValidReportPeriod: validPeriod,
    fetchJson: async path => {
      calls.push(path)
      if (path.startsWith('/analytics/all')) return [branchMetrics]
      if (path.startsWith('/analytics/trends')) return { appointments: trendRows }
      return readinessRows
    },
  })

  assert.deepEqual(result.errors, {})
  assert.equal(result.rows[0].id, 4)
  assert.equal(result.trends[0].appointments, 2)
  assert.equal(result.readiness[0].ready, true)
  assert.ok(calls.some(path => path.includes('&branch_id=4')))
})

test('one failed analytics request leaves successful dashboard sections available', async () => {
  const result = await loadOverviewSections({
    from: '2026-10-01', to: '2026-10-20', isValidReportPeriod: validPeriod,
    fetchJson: async path => {
      if (path.startsWith('/analytics/trends')) throw new Error('Render timed out')
      if (path === '/analytics/readiness') return readinessRows
      return [{ ...branchMetrics, appointments: 3 }]
    },
  })

  assert.equal(result.rows[0].appointments, 3)
  assert.equal(result.readiness[0].is_active, 1)
  assert.equal(result.trends, null)
  assert.match(result.errors.trends, /Render timed out/)
  assert.equal(result.errors.rows, undefined)
})

test('malformed response shapes fail only their own sections', async () => {
  const result = await loadOverviewSections({
    from: '2026-10-01', to: '2026-10-20', isValidReportPeriod: validPeriod,
    fetchJson: async path => path.startsWith('/analytics/all') ? [{ id: 4, name: 'North', appointments: 2 }] : path.startsWith('/analytics/trends') ? { trends: [] } : [],
  })

  assert.equal(result.rows, null)
  assert.deepEqual(result.readiness, [])
  assert.equal(result.trends, null)
  assert.match(result.errors.rows, /unexpected response format/)
  assert.match(result.errors.trends, /unexpected response format/)
})

test('invalid date ranges make no analytics requests', async () => {
  let calls = 0
  const result = await loadOverviewSections({
    from: '2026-10-20', to: '2026-10-01', isValidReportPeriod: validPeriod,
    fetchJson: async () => { calls += 1; return [] },
  })

  assert.equal(calls, 0)
  assert.match(result.errors.period, /valid reporting period/)
  assert.equal(result.rows, null)
})

