const db = require('../db/connect')

const CLINIC_TYPES = ['medical', 'derma']

const ISSUE_LABELS = {
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

const getOnlineBookingReadiness = async (executor = db) => {
  const [rows] = await executor.query(`
    SELECT clinic.clinic_type,
      (SELECT COUNT(*)
       FROM doctors d
       WHERE d.is_active = 1 AND d.clinic_type = clinic.clinic_type) AS active_doctors,
      (SELECT COUNT(DISTINCT d.id)
       FROM doctors d
       JOIN doctor_schedules ds ON ds.doctor_id = d.id AND ds.is_active = 1
       WHERE d.is_active = 1 AND d.clinic_type = clinic.clinic_type) AS schedulable_doctors,
      (SELECT COUNT(*)
       FROM billing_service_catalog bsc
       WHERE bsc.is_active = 1 AND (bsc.clinic_type = clinic.clinic_type OR bsc.clinic_type = 'all')) AS active_services,
      (SELECT COUNT(*)
       FROM appointment_reason_options aro
       WHERE aro.is_active = 1
         AND LOWER(TRIM(aro.label)) <> 'other'
         AND (aro.clinic_type = clinic.clinic_type OR aro.clinic_type = 'all')) AS visit_reasons
    FROM (
      SELECT 'medical' AS clinic_type
      UNION ALL
      SELECT 'derma' AS clinic_type
    ) clinic
  `)

  const byClinic = Object.fromEntries(CLINIC_TYPES.map((clinicType) => [clinicType, buildClinicReadiness({ clinic_type: clinicType })]))
  for (const row of rows) {
    if (CLINIC_TYPES.includes(String(row.clinic_type))) {
      byClinic[row.clinic_type] = buildClinicReadiness(row)
    }
  }

  return {
    medical: byClinic.medical,
    derma: byClinic.derma,
    all_bookable: CLINIC_TYPES.every((clinicType) => byClinic[clinicType].bookable),
  }
}

module.exports = { CLINIC_TYPES, ISSUE_LABELS, buildClinicReadiness, getOnlineBookingReadiness }
