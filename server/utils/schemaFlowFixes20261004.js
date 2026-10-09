// CARAIT flow fixes (2026-10-04). Idempotent: safe to run on every startup.
// The same changes are documented as plain SQL in
// db/migrations/2026-10-04-billing-inventory-flow-fixes.sql.
const db = require('../db/connect')

const columnExists = async (table, column, executor = db) => {
  const [rows] = await executor.query(
    `SELECT 1 FROM information_schema.COLUMNS
     WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND COLUMN_NAME = ? LIMIT 1`,
    [table, column]
  )
  return rows.length > 0
}

const tableExists = async (table, executor = db) => {
  const [rows] = await executor.query(
    'SELECT 1 FROM information_schema.TABLES WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? LIMIT 1',
    [table]
  )
  return rows.length > 0
}

const addColumn = async (table, column, definition, executor = db) => {
  if (!(await tableExists(table, executor))) return false
  if (await columnExists(table, column, executor)) return false
  await executor.query(`ALTER TABLE \`${table}\` ADD COLUMN \`${column}\` ${definition}`)
  return true
}

const foreignKeyDeleteRule = async (table, constraintName, executor = db) => {
  const [rows] = await executor.query(
    `SELECT DELETE_RULE FROM information_schema.REFERENTIAL_CONSTRAINTS
     WHERE CONSTRAINT_SCHEMA = DATABASE() AND TABLE_NAME = ? AND CONSTRAINT_NAME = ? LIMIT 1`,
    [table, constraintName]
  )
  return rows[0]?.DELETE_RULE || null
}

const applyFlowFixes20261004 = async (executor = db) => {
  // ── Locations are resolved by role, not by name ───────────────────────────
  await addColumn('inventory_locations', 'is_main_stockroom', 'TINYINT(1) NOT NULL DEFAULT 0', executor)
  await addColumn('inventory_locations', 'clinic_type', 'VARCHAR(20) NULL', executor)
  if (await tableExists('inventory_locations', executor)) {
    const [[flagged]] = await executor.query('SELECT COUNT(*) AS total FROM inventory_locations WHERE is_main_stockroom = 1')
    if (Number(flagged?.total || 0) === 0) {
      await executor.query(
        `UPDATE inventory_locations l
         JOIN (
           SELECT id FROM inventory_locations
           WHERE COALESCE(is_active,1)=1 AND (name = 'Main Stockroom' OR location_type = 'stockroom')
           ORDER BY (name = 'Main Stockroom') DESC, id ASC LIMIT 1
         ) pick ON pick.id = l.id
         SET l.is_main_stockroom = 1`
      )
    }
    for (const [clinicType, legacyName] of [['derma', 'Dermatology Room'], ['medical', 'General Medicine Room']]) {
      const [[assigned]] = await executor.query('SELECT COUNT(*) AS total FROM inventory_locations WHERE clinic_type = ?', [clinicType])
      if (Number(assigned?.total || 0) === 0) {
        await executor.query('UPDATE inventory_locations SET clinic_type = ? WHERE name = ? AND clinic_type IS NULL', [clinicType, legacyName])
      }
    }
  }

  // Deleting a location must never silently wipe its per-batch balances.
  if (await tableExists('inventory_location_batches', executor)) {
    const rule = await foreignKeyDeleteRule('inventory_location_batches', 'fk_inventory_location_batches_location', executor)
    if (rule && rule !== 'RESTRICT' && rule !== 'NO ACTION') {
      await executor.query('ALTER TABLE inventory_location_batches DROP FOREIGN KEY fk_inventory_location_batches_location')
      await executor.query(
        `ALTER TABLE inventory_location_batches
         ADD CONSTRAINT fk_inventory_location_batches_location
         FOREIGN KEY (location_id) REFERENCES inventory_locations(id) ON DELETE RESTRICT`
      )
    }
  }

  // Clinical-use log rows record which doctor consumed the stock.
  await addColumn('inventory_logs', 'doctor_id', 'INT NULL', executor)

  // ── Sequential receipt numbers ─────────────────────────────────────────────
  await executor.query(`
    CREATE TABLE IF NOT EXISTS billing_receipt_sequence (
      id TINYINT NOT NULL PRIMARY KEY,
      last_number BIGINT NOT NULL DEFAULT 0,
      updated_at TIMESTAMP NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
    )
  `)
  await executor.query('INSERT IGNORE INTO billing_receipt_sequence (id, last_number) VALUES (1, 0)')

  // ── Refund ledger: each refund keeps its own date ──────────────────────────
  await executor.query(`
    CREATE TABLE IF NOT EXISTS billing_payment_refunds (
      id BIGINT AUTO_INCREMENT PRIMARY KEY,
      payment_id INT NOT NULL,
      billing_id INT NOT NULL,
      payment_method VARCHAR(30) NULL,
      amount DECIMAL(10,2) NOT NULL,
      reason TEXT NULL,
      refunded_by_admin_id INT NULL,
      refunded_at DATETIME NOT NULL,
      is_backfilled TINYINT(1) NOT NULL DEFAULT 0,
      created_at TIMESTAMP NULL DEFAULT CURRENT_TIMESTAMP,
      INDEX idx_billing_refunds_date (refunded_at),
      INDEX idx_billing_refunds_payment (payment_id),
      INDEX idx_billing_refunds_bill (billing_id)
    )
  `)
  if (await tableExists('billing_payments', executor)) {
    // One backfill row per legacy refunded payment (exact per-refund dates were not kept before).
    await executor.query(`
      INSERT INTO billing_payment_refunds (payment_id, billing_id, payment_method, amount, reason, refunded_by_admin_id, refunded_at, is_backfilled)
      SELECT bp.id, bp.billing_id, bp.payment_method, bp.refund_amount, bp.refund_reason, bp.refunded_by_admin_id,
             COALESCE(bp.refunded_at, bp.paid_at), 1
      FROM billing_payments bp
      WHERE COALESCE(bp.refund_amount,0) > 0
        AND NOT EXISTS (SELECT 1 FROM billing_payment_refunds r WHERE r.payment_id = bp.id)
    `)
  }
  await addColumn('billing_payments', 'voided_by_admin_id', 'INT NULL', executor)

  // ── Bill void / reopen ─────────────────────────────────────────────────────
  await addColumn('billing_records', 'voided_by_admin_id', 'INT NULL', executor)
  await addColumn('billing_records', 'reopened_at', 'DATETIME NULL', executor)
  await addColumn('billing_records', 'reopened_by_admin_id', 'INT NULL', executor)
  await addColumn('billing_records', 'reopen_reason', 'TEXT NULL', executor)
  await addColumn('billing_records', 'reopen_count', 'INT NOT NULL DEFAULT 0', executor)

  // Dispensed checkout stock that was put back into its batch.
  await addColumn('billing_item_batch_usage', 'returned_at', 'DATETIME NULL', executor)
  await addColumn('billing_item_batch_usage', 'returned_by_admin_id', 'INT NULL', executor)
  await addColumn('billing_item_batch_usage', 'return_reason', 'VARCHAR(255) NULL', executor)

  // Unused consultation consumables returned to the same batch.
  await addColumn('consultation_inventory_usage_batches', 'returned_quantity', 'DECIMAL(12,4) NOT NULL DEFAULT 0.0000', executor)
  await addColumn('consultation_inventory_usage_batches', 'last_returned_at', 'DATETIME NULL', executor)

  // ── Cashier closing (end-of-day cash count) ────────────────────────────────
  // Table already exists from earlier releases; make sure it supports admin cashiers too.
  await addColumn('cashier_closings', 'cashier_role', "VARCHAR(10) NOT NULL DEFAULT 'staff'", executor)
  await addColumn('cashier_closings', 'cash_refunds', 'DECIMAL(10,2) NOT NULL DEFAULT 0.00', executor)
  await addColumn('cashier_closings', 'non_cash_collected', 'DECIMAL(10,2) NOT NULL DEFAULT 0.00', executor)
  await addColumn('cashier_closings', 'transaction_count', 'INT NOT NULL DEFAULT 0', executor)
  if (await tableExists('cashier_closings', executor)) {
    const [indexes] = await executor.query(
      `SELECT INDEX_NAME, GROUP_CONCAT(COLUMN_NAME ORDER BY SEQ_IN_INDEX) AS cols
       FROM information_schema.STATISTICS
       WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'cashier_closings' AND INDEX_NAME = 'uniq_cashier_closing'
       GROUP BY INDEX_NAME`
    )
    if (indexes[0] && indexes[0].cols !== 'cashier_role,staff_id,closing_date') {
      await executor.query('ALTER TABLE cashier_closings DROP INDEX uniq_cashier_closing, ADD UNIQUE KEY uniq_cashier_closing (cashier_role, staff_id, closing_date)')
    }
  }
}

module.exports = { applyFlowFixes20261004 }

