// Present partially available branch dashboards without guessing missing statistics.
export async function loadAdminDashboardSections({ getDashboard, getAppointments, date }) {
  const [dashboardResult, appointmentsResult] = await Promise.allSettled([
    Promise.resolve().then(getDashboard),
    Promise.resolve().then(() => getAppointments(`?date=${encodeURIComponent(date)}`)),
  ])
  const errors = {}
  let dashboard = null
  let appointments = null
  const dashboardData = dashboardResult.status === 'fulfilled' ? dashboardResult.value : null
  const sectionErrors = dashboardData?.sectionErrors && typeof dashboardData.sectionErrors === 'object' && !Array.isArray(dashboardData.sectionErrors)
    ? dashboardData.sectionErrors : {}
  const requiredCounts = ['totalPatients', 'pendingApprovals', 'lowStockCount']
  const hasDashboardShape = dashboardData && typeof dashboardData === 'object' && !Array.isArray(dashboardData) &&
    requiredCounts.every((field) => {
      const value = dashboardData[field]
      return value === null && Boolean(sectionErrors[field]) || (value !== null && value !== undefined && value !== '' && Number.isFinite(Number(value)) && Number(value) >= 0)
    }) && (Array.isArray(dashboardData.doctorStatus) || (dashboardData.doctorStatus === null && Boolean(sectionErrors.doctorStatus))) &&
    (dashboardData.bookingReadiness && typeof dashboardData.bookingReadiness === 'object' && dashboardData.bookingReadiness.medical && dashboardData.bookingReadiness.derma ||
      dashboardData.bookingReadiness === null && Boolean(sectionErrors.bookingReadiness))

  if (dashboardResult.status === 'rejected') {
    errors.dashboard = dashboardResult.reason?.message || 'Unable to load dashboard statistics.'
  } else if (!hasDashboardShape) {
    errors.dashboard = 'The server returned an unexpected dashboard response.'
  } else {
    dashboard = dashboardResult.value
    if (sectionErrors.doctorStatus) errors.doctors = sectionErrors.doctorStatus
    if (sectionErrors.bookingReadiness) errors.booking = sectionErrors.bookingReadiness
    const unavailableCounts = requiredCounts.filter(field => Boolean(sectionErrors[field]))
    if (unavailableCounts.length) errors.summary = 'Some dashboard statistics are unavailable. Missing values are shown as —, not zero.'
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
