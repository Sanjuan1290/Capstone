import test from 'node:test'
import assert from 'node:assert/strict'
import { loadAdminDashboardSections } from '../src/pages/adminPage/dashboardData.mjs'

const dashboard = { totalPatients: 9, pendingApprovals: 1, lowStockCount: 0, doctorStatus: [{ id: 1, full_name: 'A. Doctor', status: 'available' }], bookingReadiness: { medical: {}, derma: {} } }

test('branch dashboard keeps its successful section when the other request fails', async () => {
  const result = await loadAdminDashboardSections({
    date: '2026-10-20',
    getDashboard: async () => dashboard,
    getAppointments: async () => { throw new Error('Appointments unavailable') },
  })

  assert.equal(result.dashboard, dashboard)
  assert.equal(result.appointments, null)
  assert.equal(result.errors.appointments, 'Appointments unavailable')
  assert.equal(result.errors.dashboard, undefined)
})

test('branch dashboard reports a bad response shape without fabricating empty data', async () => {
  const result = await loadAdminDashboardSections({
    date: '2026-10-20',
    getDashboard: async () => ({ totalPatients: 0, doctorStatus: [] }),
    getAppointments: async () => [],
  })

  assert.equal(result.dashboard, null)
  assert.deepEqual(result.appointments, [])
  assert.match(result.errors.dashboard, /unexpected dashboard response/)
})

test('branch dashboard encodes the local date in the appointments query', async () => {
  let request = ''
  await loadAdminDashboardSections({
    date: '2026-10-20',
    getDashboard: async () => ({ ...dashboard, doctorStatus: [] }),
    getAppointments: async query => { request = query; return [] },
  })
  assert.equal(request, '?date=2026-10-20')
})
