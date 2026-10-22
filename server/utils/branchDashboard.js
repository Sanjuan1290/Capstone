// Isolate independent dashboard queries so one broken or temporarily unavailable
// TiDB query does not turn the entire branch dashboard into an HTTP 500.
// All SQL remains strictly scoped to the authenticated branch id.
const SECTION_MESSAGES = Object.freeze({
  pendingApprovals: 'Pending appointment approvals are temporarily unavailable.',
  totalPatients: 'Patient totals are temporarily unavailable.',
  lowStockCount: 'Low-stock totals are temporarily unavailable.',
  doctorStatus: 'Doctor availability is temporarily unavailable.',
  bookingReadiness: 'Online booking setup status is temporarily unavailable.',
})

const requiredCount = (rows, key) => {
  const value = rows?.[0]?.[key]
  if (value === undefined || value === null || value === '' || !Number.isFinite(Number(value))) {
    throw new Error(`Unexpected ${key} result from branch-scoped query`)
  }
  return Number(value)
}

const loadBranchDashboard = async ({ db, branchId, getBookingReadiness, onSectionError = () => {} }) => {
  const queries = [
    ['pendingApprovals', () => db.query("SELECT COUNT(*) AS pendingApprovals FROM appointments WHERE branch_id=? AND status='pending'", [branchId]).then(([rows]) => requiredCount(rows, 'pendingApprovals'))],
    ['totalPatients', () => db.query('SELECT COUNT(DISTINCT patient_id) AS totalPatients FROM appointments WHERE branch_id=?', [branchId]).then(([rows]) => requiredCount(rows, 'totalPatients'))],
    ['lowStockCount', () => db.query('SELECT COUNT(*) AS lowStockCount FROM inventory WHERE branch_id=? AND stock<=threshold', [branchId]).then(([rows]) => requiredCount(rows, 'lowStockCount'))],
    ['doctorStatus', () => db.query("SELECT d.id,d.full_name,d.clinic_type,CASE WHEN d.is_active=1 THEN 'available' ELSE 'inactive' END AS status FROM doctors d WHERE d.branch_id=? ORDER BY d.full_name", [branchId]).then(([rows]) => rows)],
    ['bookingReadiness', () => getBookingReadiness(db, branchId)],
  ]
  const settled = await Promise.allSettled(queries.map(([, work]) => Promise.resolve().then(work)))
  const response = { pendingApprovals: null, totalPatients: null, lowStockCount: null, doctorStatus: null, bookingReadiness: null }
  const sectionErrors = {}
  settled.forEach((result, i) => {
    const section = queries[i][0]
    const value = result.status === 'fulfilled' ? result.value : null
    const valid = result.status === 'fulfilled' && (
      section === 'doctorStatus' ? Array.isArray(value)
        : section === 'bookingReadiness' ? Boolean(value && typeof value === 'object' && !Array.isArray(value) && value.medical && value.derma)
          : Number.isFinite(value) && value >= 0
    )
    if (valid) response[section] = value
    else {
      sectionErrors[section] = SECTION_MESSAGES[section]
      try { onSectionError(section, result.status === 'rejected' ? result.reason : new Error('Unexpected dashboard response type')) }
      catch (_) { /* diagnostics must never break dashboard loading */ }
    }
  })
  return {
    ...response,
    ...(Object.keys(sectionErrors).length ? { sectionErrors, status: 'partial' } : { status: 'ok' }),
  }
}

module.exports = { SECTION_MESSAGES, loadBranchDashboard }

