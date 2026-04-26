const db = require('../db/connect')

const ensureColumn = async (table, column, definition) => {
  const [rows] = await db.query(
    `SELECT COUNT(*) AS count
     FROM information_schema.COLUMNS
     WHERE TABLE_SCHEMA = DATABASE()
       AND TABLE_NAME = ?
       AND COLUMN_NAME = ?`,
    [table, column]
  )

  if (!rows[0]?.count) {
    await db.query(`ALTER TABLE ${table} ADD COLUMN ${column} ${definition}`)
  }
}

const ensureTable = async (sql) => {
  await db.query(sql)
}

const ensureAppSchema = async () => {
  await ensureColumn('appointments', 'status', "VARCHAR(32) NOT NULL DEFAULT 'pending'")
    .catch(() => {})

  await ensureColumn('inventory', 'base_unit', "VARCHAR(50) NULL")
  await ensureColumn('inventory', 'unit_size', "DECIMAL(10,2) NOT NULL DEFAULT 1")
  await ensureColumn('inventory', 'stock_base', "DECIMAL(12,2) NOT NULL DEFAULT 0")
  await ensureColumn('inventory', 'expiration_date', 'DATE NULL')
  await ensureColumn('inventory', 'storage_location', "VARCHAR(120) NULL")

  await ensureTable(`
    CREATE TABLE IF NOT EXISTS inventory_batches (
      id INT AUTO_INCREMENT PRIMARY KEY,
      inventory_id INT NOT NULL,
      quantity DECIMAL(12,2) NOT NULL DEFAULT 0,
      expiration_date DATE NULL,
      note TEXT NULL,
      received_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      INDEX idx_inventory_batches_inventory_expiry (inventory_id, expiration_date, received_at),
      CONSTRAINT fk_inventory_batches_inventory
        FOREIGN KEY (inventory_id) REFERENCES inventory(id) ON DELETE CASCADE
    )
  `)

  await db.query(`
    INSERT INTO inventory_batches (inventory_id, quantity, expiration_date, note, received_at)
    SELECT
      i.id,
      i.stock,
      i.expiration_date,
      'Legacy opening balance',
      COALESCE(i.updated_at, i.created_at, NOW())
    FROM inventory i
    WHERE COALESCE(i.stock, 0) > 0
      AND NOT EXISTS (
        SELECT 1
        FROM inventory_batches b
        WHERE b.inventory_id = i.id
      )
  `)

  await db.query(`
    UPDATE inventory i
    LEFT JOIN (
      SELECT
        inventory_id,
        COALESCE(SUM(CASE WHEN quantity > 0 THEN quantity ELSE 0 END), 0) AS total_qty,
        MIN(CASE WHEN quantity > 0 THEN expiration_date ELSE NULL END) AS earliest_expiry
      FROM inventory_batches
      GROUP BY inventory_id
    ) b ON b.inventory_id = i.id
    SET
      i.stock = COALESCE(b.total_qty, 0),
      i.stock_base = COALESCE(b.total_qty, 0) * COALESCE(NULLIF(i.unit_size, 0), 1),
      i.expiration_date = b.earliest_expiry,
      i.base_unit = COALESCE(i.base_unit, i.unit)
  `)

  await ensureColumn('patients', 'theme_preference', "VARCHAR(10) NOT NULL DEFAULT 'light'")
  await ensureColumn('patients', 'profile_image_url', "TEXT NULL")
  await ensureColumn('patients', 'is_walk_in', "TINYINT(1) NOT NULL DEFAULT 0")
  await ensureColumn('patients', 'consent_given', "TINYINT(1) NOT NULL DEFAULT 0")
  await ensureColumn('patients', 'consent_given_at', "TIMESTAMP NULL")
  await ensureColumn('queue', 'appointment_id', 'INT NULL').catch(() => {})

  await ensureColumn('staff', 'theme_preference', "VARCHAR(10) NOT NULL DEFAULT 'light'")
  await ensureColumn('staff', 'profile_image_url', "TEXT NULL")

  await ensureColumn('doctors', 'theme_preference', "VARCHAR(10) NOT NULL DEFAULT 'light'")
  await ensureColumn('doctors', 'profile_image_url', "TEXT NULL")

  await ensureColumn('admins', 'theme_preference', "VARCHAR(10) NOT NULL DEFAULT 'light'")
  await ensureColumn('admins', 'profile_image_url', "TEXT NULL")

  await ensureColumn('inventory_logs', 'staff_id', 'INT NULL').catch(() => {})
  await ensureColumn('inventory_logs', 'admin_id', 'INT NULL').catch(() => {})

  await ensureTable(`
    CREATE TABLE IF NOT EXISTS notifications (
      id INT AUTO_INCREMENT PRIMARY KEY,
      target_role VARCHAR(20) NOT NULL,
      target_user_id INT NULL,
      type VARCHAR(50) NOT NULL,
      title VARCHAR(255) NOT NULL,
      message TEXT NOT NULL,
      reference_type VARCHAR(50) NULL,
      reference_id INT NULL,
      is_read TINYINT(1) NOT NULL DEFAULT 0,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      INDEX idx_notifications_target (target_role, target_user_id, is_read, created_at)
    )
  `)

  await ensureTable(`
    CREATE TABLE IF NOT EXISTS landing_page_content (
      id INT NOT NULL PRIMARY KEY,
      content JSON NOT NULL,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
    )
  `)

  await ensureTable(`
    CREATE TABLE IF NOT EXISTS patient_consents (
      id INT AUTO_INCREMENT PRIMARY KEY,
      patient_id INT NOT NULL,
      consent_type ENUM('treatment','privacy','data_processing') NOT NULL,
      signed_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      ip_address VARCHAR(45) NULL,
      FOREIGN KEY (patient_id) REFERENCES patients(id) ON DELETE CASCADE
    )
  `)
}

module.exports = {
  ensureAppSchema,
}
