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

  await ensureColumn('patients', 'theme_preference', "VARCHAR(10) NOT NULL DEFAULT 'light'")
  await ensureColumn('patients', 'profile_image_url', "TEXT NULL")

  await ensureColumn('staff', 'theme_preference', "VARCHAR(10) NOT NULL DEFAULT 'light'")
  await ensureColumn('staff', 'profile_image_url', "TEXT NULL")

  await ensureColumn('doctors', 'theme_preference', "VARCHAR(10) NOT NULL DEFAULT 'light'")
  await ensureColumn('doctors', 'profile_image_url', "TEXT NULL")

  await ensureColumn('admins', 'theme_preference', "VARCHAR(10) NOT NULL DEFAULT 'light'")
  await ensureColumn('admins', 'profile_image_url', "TEXT NULL")

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
}

module.exports = {
  ensureAppSchema,
}
