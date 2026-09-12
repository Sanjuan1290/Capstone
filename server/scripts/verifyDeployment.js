require('dotenv').config()
const db = require('../db/connect')
const { validateRuntimeConfig } = require('../utils/envValidation')

const REQUIRED_TABLES = [
  'admins', 'staff', 'doctors', 'patients', 'appointments', 'queue', 'consultations',
  'consultation_amendments', 'account_security_codes', 'patient_phone_verifications',
  'password_resets', 'consultation_images', 'billing_records', 'billing_items', 'billing_payments',
  'billing_adjustment_requests', 'cashier_closings', 'inventory', 'inventory_batches',
  'inventory_locations', 'inventory_location_batches', 'inventory_location_stock',
  'supply_requests', 'audit_logs', 'notifications', 'landing_page_content', 'clinic_payment_settings',
]

const REQUIRED_COLUMNS = {
  admins: ['session_version'],
  staff: ['must_change_password', 'password_changed_at', 'session_version'],
  doctors: ['must_change_password', 'password_changed_at', 'session_version'],
  patients: ['onboarding_completed_at', 'session_version'],
  consultations: ['status', 'finalized_at', 'finalized_by_doctor_id', 'updated_at'],
  consultation_images: ['security_scan_status'],
  clinic_payment_settings: ['cash_enabled', 'gcash_enabled', 'maya_enabled', 'bank_transfer_enabled', 'gcash_qr_scan_status', 'maya_qr_scan_status'],
  supply_requests: ['destination_location_id'],
  password_resets: ['attempt_count', 'last_sent_at', 'verified_at'],
  patient_phone_verifications: ['attempt_count', 'last_sent_at'],
  billing_payments: ['idempotency_key'],
  cashier_closings: ['is_locked'],
}

const run = async () => {
  try {
    const { warnings } = validateRuntimeConfig()
    warnings.forEach((warning) => console.warn(`WARNING: ${warning}`))

    await db.query('SELECT 1 AS result')
    const [tableRows] = await db.query(
      `SELECT TABLE_NAME FROM information_schema.TABLES WHERE TABLE_SCHEMA = ?`,
      [process.env.DB_NAME]
    )
    const tables = new Set(tableRows.map((row) => row.TABLE_NAME))
    const missingTables = REQUIRED_TABLES.filter((name) => !tables.has(name))

    const missingColumns = []
    for (const [table, columns] of Object.entries(REQUIRED_COLUMNS)) {
      if (!tables.has(table)) continue
      const [rows] = await db.query(
        `SELECT COLUMN_NAME FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = ? AND TABLE_NAME = ?`,
        [process.env.DB_NAME, table]
      )
      const existing = new Set(rows.map((row) => row.COLUMN_NAME))
      for (const column of columns) if (!existing.has(column)) missingColumns.push(`${table}.${column}`)
    }

    if (missingTables.length || missingColumns.length) {
      if (missingTables.length) console.error(`Missing tables: ${missingTables.join(', ')}`)
      if (missingColumns.length) console.error(`Missing columns: ${missingColumns.join(', ')}`)
      throw new Error('Database schema is not deployment-ready. Run `npm run migrate` and verify again.')
    }

    console.log('Deployment verification passed: runtime configuration, database connection, and critical schema are ready.')
  } catch (error) {
    console.error('Deployment verification failed:', error.message)
    process.exitCode = 1
  } finally {
    await db.end().catch(() => {})
  }
}

run()



