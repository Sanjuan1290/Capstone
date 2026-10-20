export async function loadAdminDashboardSections({ getDashboard, getAppointments, date }) {
  const [dashboardResult, appointmentsResult] = await Promise.allSettled([
    Promise.resolve().then(getDashboard),
    Promise.resolve().then(() => getAppointments(`?date=${encodeURIComponent(date)}`)),
  ])
  const errors = {}
  let dashboard = null
  let appointments = null
  const dashboardData = dashboardResult.status === 'fulfilled' ? dashboardResult.value : null
  const countFields = [dashboardData?.totalPatients, dashboardData?.pendingApprovals ?? dashboardData?.pendingCount, dashboardData?.lowStockCount ?? dashboardData?.lowStock]
  const hasDashboardShape = dashboardData && typeof dashboardData === 'object' && !Array.isArray(dashboardData) &&
    Array.isArray(dashboardData.doctorStatus) && countFields.every(value =>
      value !== null && value !== undefined && value !== '' && Number.isFinite(Number(value))
    ) && dashboardData.bookingReadiness && typeof dashboardData.bookingReadiness === 'object'

  if (dashboardResult.status === 'rejected') {
    errors.dashboard = dashboardResult.reason?.message || 'Unable to load dashboard statistics.'
  } else if (!hasDashboardShape) {
    errors.dashboard = 'The server returned an unexpected dashboard response.'
  } else {
    dashboard = dashboardResult.value
  }

  if (appointmentsResult.status === 'rejected') {
    errors.appointments = appointmentsResult.reason?.message || 'Unable to load today’s appointments.'
  } else if (!Array.isArray(appointmentsResult.value)) {
    errors.appointments = 'The server returned an unexpected appointments response.'
  } else {
    appointments = appointmentsResult.value
  }

  return { dashboard, appointments, errors }
}
