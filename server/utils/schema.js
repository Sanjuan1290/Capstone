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
    CREATE TABLE IF NOT EXISTS consultation_images (
      id INT AUTO_INCREMENT PRIMARY KEY,
      consultation_id INT NOT NULL,
      image_url TEXT NOT NULL,
      caption VARCHAR(255) NULL,
      sort_order INT NOT NULL DEFAULT 0,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      INDEX idx_consultation_images_consultation (consultation_id, sort_order, created_at),
      CONSTRAINT fk_consultation_images_consultation
        FOREIGN KEY (consultation_id) REFERENCES consultations(id) ON DELETE CASCADE
    )
  `)

  await ensureTable(`
    CREATE TABLE IF NOT EXISTS appointment_reason_options (
      id INT AUTO_INCREMENT PRIMARY KEY,
      label VARCHAR(120) NOT NULL,
      clinic_type VARCHAR(20) NOT NULL DEFAULT 'all',
      is_active TINYINT(1) NOT NULL DEFAULT 1,
      sort_order INT NOT NULL DEFAULT 0,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      UNIQUE KEY uniq_appointment_reason_label (label, clinic_type)
    )
  `)

  await db.query(`
    INSERT IGNORE INTO appointment_reason_options (label, clinic_type, is_active, sort_order)
    VALUES
      ('General Consultation', 'medical', 1, 10),
      ('Follow-up Visit', 'all', 1, 20),
      ('Annual Check-up', 'medical', 1, 30),
      ('Vaccination', 'medical', 1, 40),
      ('Minor Procedure', 'medical', 1, 50),
      ('Skin Assessment', 'derma', 1, 60),
      ('Acne Treatment', 'derma', 1, 70),
      ('Rash / Allergy', 'derma', 1, 80),
      ('Hair / Scalp Concern', 'derma', 1, 90),
      ('Nail Concern', 'derma', 1, 100),
      ('Other', 'all', 1, 110)
  `)

  await ensureTable(`
    CREATE TABLE IF NOT EXISTS doctor_unavailable_dates (
      id INT AUTO_INCREMENT PRIMARY KEY,
      doctor_id INT NOT NULL,
      unavailable_date DATE NOT NULL,
      reason VARCHAR(255) NULL,
      created_by_role VARCHAR(20) NOT NULL DEFAULT 'doctor',
      created_by_user_id INT NULL,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      UNIQUE KEY uniq_doctor_unavailable_date (doctor_id, unavailable_date),
      INDEX idx_doctor_unavailable_lookup (doctor_id, unavailable_date),
      CONSTRAINT fk_doctor_unavailable_dates_doctor
        FOREIGN KEY (doctor_id) REFERENCES doctors(id) ON DELETE CASCADE
    )
  `)

  await ensureTable(`
    CREATE TABLE IF NOT EXISTS billing_service_catalog (
      id INT AUTO_INCREMENT PRIMARY KEY,
      category VARCHAR(120) NOT NULL,
      service_name VARCHAR(180) NOT NULL,
      clinic_type VARCHAR(20) NOT NULL DEFAULT 'all',
      default_price DECIMAL(10,2) NOT NULL DEFAULT 0.00,
      is_active TINYINT(1) NOT NULL DEFAULT 1,
      sort_order INT NOT NULL DEFAULT 0,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      UNIQUE KEY uniq_billing_service_name (service_name, clinic_type)
    )
  `)

  await db.query(`
    INSERT IGNORE INTO billing_service_catalog (category, service_name, clinic_type, default_price, is_active, sort_order)
    VALUES
      ('Medical Consultations', 'General Consultation', 'medical', 0.00, 1, 10),
      ('Medical Consultations', 'Follow-up Consultation', 'medical', 0.00, 1, 20),
      ('Medical Consultations', 'Minor Excision', 'medical', 0.00, 1, 30),
      ('Medical Consultations', 'Circumcision', 'medical', 0.00, 1, 40),
      ('Medical Consultations', 'Other Surgical Procedure', 'medical', 0.00, 1, 50),
      ('Vaccinations', 'Routine Vaccine', 'medical', 0.00, 1, 60),
      ('Vaccinations', 'Travel Vaccine', 'medical', 0.00, 1, 70),
      ('Vaccinations', 'Seasonal Flu Vaccine', 'medical', 0.00, 1, 80),
      ('Dermatologic Services', 'Dermatology Consultation', 'derma', 0.00, 1, 90),
      ('Dermatologic Services', 'Laser Rejuvenation', 'derma', 0.00, 1, 100),
      ('Dermatologic Services', 'Laser Scar Treatment', 'derma', 0.00, 1, 110),
      ('Dermatologic Services', 'IPL Anti-aging', 'derma', 0.00, 1, 120),
      ('Dermatologic Services', 'IPL Hair Removal', 'derma', 0.00, 1, 130),
      ('Dermatologic Services', 'Electrocautery', 'derma', 0.00, 1, 140),
      ('Dermatologic Services', 'Chemical Peeling', 'derma', 0.00, 1, 150),
      ('Dermatologic Services', 'Skin Biopsy', 'derma', 0.00, 1, 160),
      ('Acupuncture', 'Acupuncture Session', 'medical', 0.00, 1, 170),
      ('Acupuncture', 'Pain Relief Treatment', 'medical', 0.00, 1, 180),
      ('Acupuncture', 'Vertigo / Migraine Treatment', 'medical', 0.00, 1, 190),
      ('Acupuncture', 'Insomnia Treatment', 'medical', 0.00, 1, 200),
      ('Acupuncture', 'Smoking Cessation Treatment', 'medical', 0.00, 1, 210),
      ('Animal Bite Center', 'Pre-exposure Prophylaxis', 'medical', 0.00, 1, 220),
      ('Animal Bite Center', 'Post-exposure Treatment', 'medical', 0.00, 1, 230),
      ('Animal Bite Center', 'Rabies Vaccine', 'medical', 0.00, 1, 240),
      ('Animal Bite Center', 'Immunoglobulin', 'medical', 0.00, 1, 250)
  `)

  await ensureTable(`
    CREATE TABLE IF NOT EXISTS billing_records (
      id INT AUTO_INCREMENT PRIMARY KEY,
      appointment_id INT NOT NULL,
      consultation_id INT NULL,
      patient_id INT NOT NULL,
      doctor_id INT NOT NULL,
      status VARCHAR(20) NOT NULL DEFAULT 'pending',
      subtotal DECIMAL(10,2) NOT NULL DEFAULT 0.00,
      discount_type VARCHAR(30) NOT NULL DEFAULT 'none',
      discount_label VARCHAR(80) NULL,
      discount_amount DECIMAL(10,2) NOT NULL DEFAULT 0.00,
      total_amount DECIMAL(10,2) NOT NULL DEFAULT 0.00,
      payment_method VARCHAR(30) NULL,
      payment_notes TEXT NULL,
      confirmed_by_staff_id INT NULL,
      paid_at DATETIME NULL,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      UNIQUE KEY uniq_billing_records_appointment (appointment_id),
      UNIQUE KEY uniq_billing_records_consultation (consultation_id),
      INDEX idx_billing_records_status (status, created_at),
      CONSTRAINT fk_billing_records_appointment
        FOREIGN KEY (appointment_id) REFERENCES appointments(id) ON DELETE CASCADE,
      CONSTRAINT fk_billing_records_consultation
        FOREIGN KEY (consultation_id) REFERENCES consultations(id) ON DELETE SET NULL,
      CONSTRAINT fk_billing_records_patient
        FOREIGN KEY (patient_id) REFERENCES patients(id) ON DELETE CASCADE,
      CONSTRAINT fk_billing_records_doctor
        FOREIGN KEY (doctor_id) REFERENCES doctors(id) ON DELETE CASCADE,
      CONSTRAINT fk_billing_records_staff
        FOREIGN KEY (confirmed_by_staff_id) REFERENCES staff(id) ON DELETE SET NULL
    )
  `)

  await ensureTable(`
    CREATE TABLE IF NOT EXISTS billing_items (
      id INT AUTO_INCREMENT PRIMARY KEY,
      billing_id INT NOT NULL,
      catalog_service_id INT NULL,
      category VARCHAR(120) NULL,
      service_name VARCHAR(180) NOT NULL,
      quantity DECIMAL(10,2) NOT NULL DEFAULT 1.00,
      unit_price DECIMAL(10,2) NOT NULL DEFAULT 0.00,
      line_total DECIMAL(10,2) NOT NULL DEFAULT 0.00,
      notes TEXT NULL,
      sort_order INT NOT NULL DEFAULT 0,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      INDEX idx_billing_items_billing (billing_id, sort_order, id),
      CONSTRAINT fk_billing_items_billing
        FOREIGN KEY (billing_id) REFERENCES billing_records(id) ON DELETE CASCADE,
      CONSTRAINT fk_billing_items_catalog
        FOREIGN KEY (catalog_service_id) REFERENCES billing_service_catalog(id) ON DELETE SET NULL
    )
  `)

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
  await ensureColumn('patients', 'gender', "ENUM('Male','Female','Other') NULL")
  await ensureColumn('patients', 'receive_promotions', "TINYINT(1) NOT NULL DEFAULT 0")
  await ensureColumn('patients', 'is_profile_complete', "TINYINT(1) NOT NULL DEFAULT 0")
  await db.query("ALTER TABLE patients MODIFY COLUMN sex ENUM('Male','Female','Other') NULL").catch(() => {})
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

  await ensureTable(`
    CREATE TABLE IF NOT EXISTS patient_phone_verifications (
      id INT AUTO_INCREMENT PRIMARY KEY,
      phone VARCHAR(20) NOT NULL,
      otp_code VARCHAR(6) NOT NULL,
      payload JSON NOT NULL,
      expires_at DATETIME NOT NULL,
      verified_at DATETIME NULL,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      UNIQUE KEY uniq_patient_phone_verifications_phone (phone)
    )
  `)

  await ensureTable(`
    CREATE TABLE IF NOT EXISTS password_resets (
      id INT AUTO_INCREMENT PRIMARY KEY,
      email VARCHAR(255) NULL,
      identifier VARCHAR(120) NULL,
      account_id INT NULL,
      token VARCHAR(255) NOT NULL,
      role VARCHAR(20) NOT NULL,
      expires_at DATETIME NOT NULL,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )
  `)
  await db.query('ALTER TABLE password_resets MODIFY COLUMN email VARCHAR(255) NULL').catch(() => {})
  await ensureColumn('password_resets', 'identifier', 'VARCHAR(120) NULL')
  await ensureColumn('password_resets', 'account_id', 'INT NULL')
}

module.exports = {
  ensureAppSchema,
}
