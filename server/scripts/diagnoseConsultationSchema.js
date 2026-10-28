'use strict'

// Metadata-only diagnostic for consultation autosave and related booking / cashier
// flows. SELECT queries only; safe to run before planning an additive migration.
const PROMOTION_MIGRATION = '2026-10-26-batch4-selected-promotion.sql'
const REQUIRED = Object.freeze({
  appointments: {
    consultation: ['id', 'doctor_id', 'patient_id', 'branch_id', 'status', 'requested_service_id'],
    promotion: ['promotion_id', 'promotion_title_snapshot', 'promotion_terms_snapshot', 'promotion_badge_snapshot', 'promotion_starts_on_snapshot', 'promotion_ends_on_snapshot', 'promotion_selected_for_service_id', 'promotion_selected_at'],
  },
  consultations: {
    consultation: ['id', 'appointment_id', 'doctor_id', 'patient_id', 'diagnosis', 'prescription', 'prescription_status', 'notes', 'status', 'version', 'updated_at', 'branch_id'],
  },
  consultation_images: {
    consultation: ['consultation_id', 'image_url', 'caption', 'security_scan_status', 'sort_order'],
  },
  billing_records: {
    billing: ['id', 'appointment_id', 'consultation_id', 'patient_id', 'doctor_id', 'branch_id', 'status', 'discount_type', 'discount_amount', 'subtotal', 'total_amount', 'payment_method', 'payment_notes', 'confirmed_by_staff_id', 'paid_at'],
    promotion: ['promotion_review_outcome', 'promotion_review_note', 'promotion_review_by_role', 'promotion_review_by_user_id', 'promotion_reviewed_bill_version', 'promotion_reviewed_at'],
  },
  billing_items: {
    billing: ['id', 'billing_id', 'catalog_service_id', 'item_type', 'source_type', 'source_reference_id', 'source_inventory_id', 'category', 'service_name', 'quantity', 'base_amount', 'markup_percentage', 'unit_price', 'line_total', 'details_json', 'notes', 'sort_order'],
  },
  billing_payments: {
    billing: ['id', 'billing_id', 'amount', 'payment_method', 'reference_number', 'amount_received', 'change_amount', 'receipt_number', 'status', 'notes', 'paid_at', 'voided_at', 'void_reason', 'refunded_at', 'refund_amount', 'refund_reason', 'received_by_staff_id'],
  },
  billing_service_catalog: {
    billing: ['id', 'branch_id', 'service_name', 'clinic_type', 'default_price'],
  },
  billing_service_materials: {
    billing: ['billing_service_id', 'inventory_id', 'material_name', 'quantity', 'unit_label'],
  },
  patients: { consultation: ['id', 'full_name', 'phone'] },
  doctors: { consultation: ['id', 'full_name', 'specialty'] },
  staff: { billing: ['id', 'full_name'] },
  audit_logs: { consultation: ['user_id', 'user_role', 'action', 'entity_type', 'entity_id', 'new_values', 'branch_id'] },
})

const REQUIRED_FIELDS = Object.fromEntries(Object.entries(REQUIRED).map(([table, sections]) => [
  table, [...new Set(Object.values(sections).flat())],
]))

function evaluateSchema(rows, migrationRecorded = null) {
  const available = new Map()
  for (const row of rows) {
    const table = String(row.TABLE_NAME || '').toLowerCase()
    const column = String(row.COLUMN_NAME || '').toLowerCase()
    if (!table || !column) continue
    if (!available.has(table)) available.set(table, new Set())
    available.get(table).add(column)
  }
  const missing = []
  for (const [table, columns] of Object.entries(REQUIRED_FIELDS)) {
    const exists = available.get(table)
    for (const column of columns) {
      if (!exists?.has(column)) {
        missing.push({ table, column, feature: Object.entries(REQUIRED[table])
          .filter(([, names]) => names.includes(column)).map(([name]) => name).join(', ') })
      }
    }
  }
  const promotionMissing = missing.filter(item => item.feature.includes('promotion'))
  return {
    ok: !missing.length,
    migration: PROMOTION_MIGRATION,
    promotionMigrationRecorded: migrationRecorded,
    missing,
    affectedFeatures: [...new Set(missing.flatMap(item => item.feature.split(', ')))],
    promotionSchemaIncomplete: promotionMissing.length > 0,
  }
}

async function diagnose(db) {
  // No INSERT / ALTER / schema bootstrap: only metadata and migration ledger reads.
  const [rows] = await db.query(
    'SELECT TABLE_NAME, COLUMN_NAME FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME IN (?)',
    [Object.keys(REQUIRED_FIELDS)],
  )
  let migrationRecorded = null
  const [tables] = await db.query(
    "SELECT TABLE_NAME FROM information_schema.TABLES WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='schema_migrations'",
  )
  if (tables.length) {
    const [migrations] = await db.query('SELECT filename FROM schema_migrations WHERE filename=? LIMIT 1', [PROMOTION_MIGRATION])
    migrationRecorded = migrations.length > 0
  }
  return evaluateSchema(rows, migrationRecorded)
}

async function main() {
  require('dotenv').config()
  const db = require('../db/connect')
  try {
    const result = await diagnose(db)
    console.log('Consultation / booking / billing schema diagnostic (read-only)')
    console.log('Promotion migration ledger:', result.promotionMigrationRecorded == null ? 'ledger unavailable' : result.promotionMigrationRecorded ? 'recorded' : 'not recorded')
    if (result.ok) console.log('PASS: required consultation, billing, and promotion columns are present.')
    else {
      console.error(`FAIL: ${result.missing.length} required columns absent:`)
      for (const item of result.missing) console.error(`  ${item.table}.${item.column} [${item.feature}]`)
      console.error('No data changed. Back up and migrate STAGING first; verify the ledger and schema before production.')
      process.exitCode = 1
    }
  } catch (error) {
    console.error('Schema diagnostic unavailable:', error.message)
    process.exitCode = 1
  } finally {
    await db.end().catch(() => {})
  }
}

if (require.main === module) void main()
module.exports = { REQUIRED_FIELDS, evaluateSchema, diagnose, PROMOTION_MIGRATION }
