require('dotenv').config()
const db = require('../db/connect')
const { validateRuntimeConfig } = require('../utils/envValidation')

const REQUIRED_TABLES = [
  'admins', 'staff', 'doctors', 'patients', 'appointments', 'queue', 'consultations',
  'consultation_amendments', 'account_security_codes', 'patient_phone_verifications',
  'password_resets', 'consultation_images', 'billing_service_catalog', 'billing_records', 'billing_items', 'billing_payments',
  'billing_adjustment_requests', 'inventory', 'inventory_uoms', 'inventory_suppliers', 'inventory_batches',
  'consultation_inventory_usage_batches', 'billing_item_batch_usage', 'inventory_locations', 'inventory_location_batches', 'inventory_location_stock',
  'supply_requests', 'audit_logs', 'audit_log_archives', 'notifications', 'landing_page_content', 'clinic_payment_settings',
  'doctor_schedules', 'inventory_location_types', 'inventory_movement_reasons', 'billing_service_categories', 'staff_permissions',
]

const REQUIRED_COLUMNS = {
  admins: ['session_version'],
  staff: ['must_change_password', 'password_changed_at', 'session_version'],
  doctors: ['must_change_password', 'password_changed_at', 'session_version', 'clinic_type'],
  doctor_schedules: ['spans_next_day', 'is_24_hours'],
  patients: ['onboarding_completed_at', 'session_version', 'email_verified_at', 'phone_verified_at'],
  appointments: ['appointment_source', 'checked_in_at', 'requested_service_id', 'requested_service_name_snapshot', 'requested_service_price_snapshot'],
  queue: ['appointment_id', 'called_at', 'consultation_started_at', 'completed_at'],
  consultations: ['status', 'finalized_at', 'finalized_by_doctor_id', 'updated_at', 'version'],
  consultation_images: ['security_scan_status'],
  clinic_payment_settings: ['cash_enabled', 'gcash_enabled', 'maya_enabled', 'bank_transfer_enabled', 'gcash_qr_scan_status', 'maya_qr_scan_status'],
  supply_requests: ['destination_location_id'],
  password_resets: ['attempt_count', 'last_sent_at', 'verified_at'],
  patient_phone_verifications: ['attempt_count', 'last_sent_at'],
  billing_service_materials: ['bundled_in_service_price', 'cost_snapshot'],
  billing_items: ['unit_cost_snapshot', 'cost_total_snapshot'],
  inventory: ['selling_price', 'archived_at', 'archived_by_admin_id', 'archive_reason'],
  inventory_uoms: ['allow_decimal_quantity', 'decimal_precision'],
  inventory_batches: ['unit_cost', 'supplier_id', 'archived_at', 'archived_by_admin_id', 'archive_reason'],
  consultation_inventory_usage_batches: ['source_location_id'],
  billing_item_batch_usage: ['source_location_id'],
  billing_records: ['finalized_by_admin_id', 'confirmed_by_admin_id'],
  billing_payments: ['idempotency_key', 'received_by_admin_id'],
  audit_logs: ['archive_id', 'archived_at'],
  billing_service_catalog: ['category_id'],
  inventory_suppliers: ['contact_person', 'contact_number', 'address'],
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

    const [[legacyQueue]] = await db.query("SELECT COUNT(*) AS count FROM queue WHERE status='in-progress'")
    if (Number(legacyQueue?.count || 0) > 0) {
      throw new Error('Legacy queue status `in-progress` still exists. Complete the 2026-09-22 workflow migration.')
    }

    const [[duplicateConsultations]] = await db.query(
      `SELECT COUNT(*) AS count FROM (
         SELECT appointment_id FROM consultations
         WHERE appointment_id IS NOT NULL
         GROUP BY appointment_id HAVING COUNT(*) > 1
       ) duplicates`
    )
    if (Number(duplicateConsultations?.count || 0) > 0) {
      throw new Error('Duplicate consultation rows exist for one or more appointments. Resolve them before deployment.')
    }

    const [constraintRows] = await db.query(
      `SELECT TABLE_NAME, CONSTRAINT_NAME
       FROM information_schema.TABLE_CONSTRAINTS
       WHERE CONSTRAINT_SCHEMA = ?
         AND CONSTRAINT_TYPE = 'FOREIGN KEY'
         AND CONSTRAINT_NAME IN ('fk_appointments_requested_service','fk_queue_appointment','fk_billing_service_category','fk_inventory_batches_supplier','fk_billing_usage_source_location','fk_consultation_usage_source_location')`,
      [process.env.DB_NAME]
    )
    const constraints = new Set(constraintRows.map((row) => `${row.TABLE_NAME}.${row.CONSTRAINT_NAME}`))
    const requiredConstraints = [
      'appointments.fk_appointments_requested_service',
      'queue.fk_queue_appointment',
      'billing_service_catalog.fk_billing_service_category',
      'inventory_batches.fk_inventory_batches_supplier',
      'billing_item_batch_usage.fk_billing_usage_source_location',
      'consultation_inventory_usage_batches.fk_consultation_usage_source_location',
    ]
    const missingConstraints = requiredConstraints.filter((key) => !constraints.has(key))
    if (missingConstraints.length) {
      throw new Error(`Missing workflow foreign keys: ${missingConstraints.join(', ')}. Run \`npm run migrate\` and verify again.`)
    }

    const [[securityPurposeIndex]] = await db.query(
      `SELECT COUNT(*) AS count FROM information_schema.STATISTICS
       WHERE TABLE_SCHEMA=? AND TABLE_NAME='account_security_codes'
         AND INDEX_NAME='uniq_account_security_code_purpose'`,
      [process.env.DB_NAME]
    )
    if (Number(securityPurposeIndex?.count || 0) === 0) {
      throw new Error('Account security OTP uniqueness is still using the legacy per-account key. Run `npm run migrate` and verify again.')
    }

    const [[badDoctorClinicTypes]] = await db.query(
      "SELECT COUNT(*) AS count FROM doctors WHERE clinic_type IS NULL OR clinic_type NOT IN ('medical','derma')"
    )
    if (Number(badDoctorClinicTypes?.count || 0) > 0) {
      throw new Error('One or more doctors do not have a valid Clinic Assignment.')
    }

    const [[inventoryAllocationMismatch]] = await db.query(`
      SELECT COUNT(*) AS count FROM (
        SELECT b.id
        FROM inventory_batches b
        LEFT JOIN inventory_location_batches ilb ON ilb.batch_id = b.id
        GROUP BY b.id, b.quantity
        HAVING ABS(COALESCE(SUM(ilb.quantity),0) - b.quantity) > 0.0001
      ) mismatches
    `)
    if (Number(inventoryAllocationMismatch?.count || 0) > 0) {
      throw new Error(`${Number(inventoryAllocationMismatch.count)} inventory batch(es) have location balances that do not match their batch total. Run \`npm run migrate\` and verify inventory allocations before deployment.`)
    }

    const [[fractionalWholeUnitBatches]] = await db.query(`
      SELECT COUNT(*) AS count
      FROM inventory_batches b
      JOIN inventory i ON i.id=b.inventory_id
      JOIN inventory_uoms u ON LOWER(u.name)=LOWER(COALESCE(i.uom,i.base_unit,i.unit,''))
      WHERE COALESCE(u.allow_decimal_quantity,0)=0
        AND ABS(COALESCE(b.quantity,0)-ROUND(COALESCE(b.quantity,0))) > 0.0001
    `)
    if (Number(fractionalWholeUnitBatches?.count || 0) > 0) {
      throw new Error(`${Number(fractionalWholeUnitBatches.count)} whole-unit inventory batch(es) still contain fractional quantities. Correct those batches with the secured batch correction flow, or explicitly enable decimal precision for the UOM before deployment.`)
    }

    const [[unpricedInventory]] = await db.query(`
      SELECT COUNT(*) AS count FROM inventory
      WHERE archived_at IS NULL AND (selling_price IS NULL OR selling_price <= 0)
    `)
    if (Number(unpricedInventory?.count || 0) > 0) {
      console.warn(`WARNING: ${Number(unpricedInventory.count)} active inventory item(s) still need an Admin-reviewed Selling Price before direct Checkout billing.`)
    }

    const [[activeServices]] = await db.query('SELECT COUNT(*) AS count FROM billing_service_catalog WHERE is_active = 1')
    if (Number(activeServices?.count || 0) === 0) {
      console.warn('WARNING: No active billing services are configured. Patient online booking will stop at the Service step until Admin configures at least one service.')
    }

    const [[activeServiceCategories]] = await db.query('SELECT COUNT(*) AS count FROM billing_service_categories WHERE is_active = 1')
    if (Number(activeServiceCategories?.count || 0) === 0) {
      console.warn('WARNING: No active service categories are configured. Admin cannot add a new billing service until a category is activated in System Setup.')
    }

    const [[uncategorizedServices]] = await db.query("SELECT COUNT(*) AS count FROM billing_service_catalog WHERE clinic_type IN ('medical','derma') AND category_id IS NULL")
    if (Number(uncategorizedServices?.count || 0) > 0) {
      console.warn(`WARNING: ${Number(uncategorizedServices.count)} service(s) are still using a legacy text-only category. Open/edit those services or rerun migration after reviewing category names.`)
    }

    console.log('Deployment verification passed: runtime configuration, database connection, workflow schema, and critical integrity checks are ready.')
  } catch (error) {
    console.error('Deployment verification failed:', error.message)
    process.exitCode = 1
  } finally {
    await db.end().catch(() => {})
  }
}

run()
