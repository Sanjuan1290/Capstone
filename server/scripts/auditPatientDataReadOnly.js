#!/usr/bin/env node
// Batch 6 read-only audit. Run ONLY with a restricted SELECT-only database user.
// Emits aggregate counts and branch configurations, never patient rows or PII.
const { getTodayDateOnly } = require('../utils/date')

async function runAudit(query) {
  const today = getTodayDateOnly()
  const [patientRows] = await query(`
    SELECT COUNT(*) AS patients,
      COALESCE(SUM(birthdate IS NULL),0) AS missing_birthdate,
      COALESCE(SUM(birthdate > ?),0) AS future_birthdate,
      COALESCE(SUM(birthdate < DATE_SUB(?, INTERVAL 101 YEAR)),0) AS older_than_101_calendar_years,
      COALESCE(SUM(gender IS NULL AND sex IS NULL),0) AS both_demographics_null,
      COALESCE(SUM(gender IS NULL AND sex IS NOT NULL),0) AS gender_null_only,
      COALESCE(SUM(gender IS NOT NULL AND sex IS NULL),0) AS sex_null_only,
      COALESCE(SUM(gender IS NOT NULL AND sex IS NOT NULL AND gender <> sex),0) AS demographic_mismatches
    FROM patients`, [today, today])
  const [discountRows] = await query(`
    SELECT branch_id, label, discount_type, value, is_active,
      requires_reference, requires_admin_approval
    FROM discount_presets
    ORDER BY branch_id, sort_order, id`)
  return { as_of_clinic_date: today, patient_aggregates: patientRows[0] || {}, branch_discount_presets: discountRows }
}

if (require.main === module) {
  if (process.env.CARAIT_ALLOW_READ_ONLY_AUDIT !== 'true') {
    process.stderr.write('Set CARAIT_ALLOW_READ_ONLY_AUDIT=true using an explicitly SELECT-only database account.\n')
    process.exitCode = 1
  } else {
    const db = require('../db/connect')
    runAudit((sql, params) => db.query(sql, params))
      .then((results) => process.stdout.write(`${JSON.stringify(results, null, 2)}\n`))
      .catch((error) => { process.stderr.write(`Audit failed: ${error.message}\n`); process.exitCode = 1 })
      .finally(() => db.end?.())
  }
}
module.exports = { runAudit }

