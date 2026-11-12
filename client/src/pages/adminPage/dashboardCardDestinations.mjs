// Branch-preserving destinations for Dashboard summary cards.
// These are relative to the current Admin or Super Admin branch workspace.
export const dashboardCardDestinations = (date) => ({
  today: `/admin/appointments?date=${encodeURIComponent(date)}`,
  patients: '/admin/patient-records',
  pending: '/admin/appointments?tab=pending',
  stock: '/admin/inventory?status=alerts',
})
