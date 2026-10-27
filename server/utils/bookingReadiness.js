const db = require('../db/connect')

const CLINIC_TYPES = ['medical', 'derma']

const ISSUE_LABELS = {
  CLINIC_TYPE_DISABLED: 'This branch is not accepting online bookings for this clinic type.',
  NO_ACTIVE_DOCTOR: 'No active doctor is assigned to this clinic.',
  NO_ONLINE_SCHEDULE: 'No active doctor schedule is configured for online booking.',
  NO_ACTIVE_SERVICE: 'No active service is configured for online booking.',
  NO_VISIT_REASON: 'No custom patient visit reasons are configured. Patients can still choose Other and provide an explanation.',
}

const buildClinicReadiness = (row = {}) => {
  const activeDoctors = Number(row.active_doctors || 0)
  const schedulableDoctors = Number(row.schedulable_doctors || 0)
  const activeServices = Number(row.active_services || 0)
  const visitReasons = Number(row.visit_reasons || 0)
  const issues = []
  const warnings = []

  if (activeDoctors === 0) issues.push('NO_ACTIVE_DOCTOR')
  else if (schedulableDoctors === 0) issues.push('NO_ONLINE_SCHEDULE')
  if (activeServices === 0) issues.push('NO_ACTIVE_SERVICE')
  if (visitReasons === 0) warnings.push('NO_VISIT_REASON')

  return {
    clinic_type: row.clinic_type,
    active_doctors: activeDoctors,
    schedulable_doctors: schedulableDoctors,
    active_services: activeServices,
    visit_reasons: visitReasons,
    bookable: issues.length === 0,
    issues,
    issue_messages: issues.map((code) => ISSUE_LABELS[code]),
    warnings,
    warning_messages: warnings.map((code) => ISSUE_LABELS[code]),
    fallback_visit_reason: 'Other',
  }
}

// Avoid a correlated UNION-derived-table query: certain TiDB/MySQL versions fail
// to resolve the outer clinic alias inside nested aggregate subqueries.
// Four grouped queries are portable, read-only and safely parameterized.
const getOnlineBookingReadiness = async (executor = db, branchId = null) => {
  const scoped = branchId !== null && branchId !== undefined
  const id = Number(branchId)
  if (scoped && (!Number.isSafeInteger(id) || id <= 0)) throw new Error('Invalid branch for booking readiness.')
  const branchWhere = (alias) => scoped ? ` AND ${alias}.branch_id = ?` : ''
  const params = scoped ? [id] : []
  const queries = [
    `SELECT d.clinic_type, COUNT(*) AS total FROM doctors d
     WHERE d.is_active = 1 AND d.clinic_type IN ('medical','derma')${branchWhere('d')} GROUP BY d.clinic_type`,
    `SELECT d.clinic_type, COUNT(DISTINCT d.id) AS total FROM doctors d
     JOIN doctor_schedules ds ON ds.doctor_id=d.id AND ds.is_active=1
     WHERE d.is_active=1 AND d.clinic_type IN ('medical','derma')${branchWhere('d')} GROUP BY d.clinic_type`,
    `SELECT bsc.clinic_type, COUNT(*) AS total FROM billing_service_catalog bsc
     WHERE bsc.is_active=1 AND bsc.clinic_type IN ('medical','derma','all')${branchWhere('bsc')} GROUP BY bsc.clinic_type`,
    `SELECT aro.clinic_type, COUNT(*) AS total FROM appointment_reason_options aro
     WHERE aro.is_active=1 AND LOWER(TRIM(aro.label)) <> 'other'
       AND aro.clinic_type IN ('medical','derma','all')${branchWhere('aro')} GROUP BY aro.clinic_type`,
  ]
  const results = await Promise.all(queries.map((sql) => executor.query(sql, params)))
  const counts = results.map(([rows]) => Object.fromEntries(rows.map((row) => [row.clinic_type, Number(row.total || 0)])))
  const byClinic = {}
  for (const clinicType of CLINIC_TYPES) {
    byClinic[clinicType] = buildClinicReadiness({
      clinic_type: clinicType,
      active_doctors: counts[0][clinicType] || 0,
      schedulable_doctors: counts[1][clinicType] || 0,
      active_services: (counts[2][clinicType] || 0) + (counts[2].all || 0),
      visit_reasons: (counts[3][clinicType] || 0) + (counts[3].all || 0),
    })
  }
  return { ...byClinic, all_bookable: CLINIC_TYPES.every((type) => byClinic[type].bookable) }
}

const applyBranchBookingOfferings = (readiness, branch) => {
  const next = { ...readiness }
  for (const type of CLINIC_TYPES) {
    const enabled = Number(branch?.[type === 'medical' ? 'offers_medical' : 'offers_derma']) === 1
    if (enabled) continue
    const previous = readiness[type]
    const issues = [...new Set([...(previous?.issues || []), 'CLINIC_TYPE_DISABLED'])]
    next[type] = { ...previous, bookable: false, issues, issue_messages: issues.map((code) => ISSUE_LABELS[code]) }
  }
  next.all_bookable = CLINIC_TYPES.every((type) => next[type]?.bookable)
  return next
}

module.exports = { CLINIC_TYPES, ISSUE_LABELS, buildClinicReadiness, getOnlineBookingReadiness, applyBranchBookingOfferings }


