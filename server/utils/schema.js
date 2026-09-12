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

const ensureIndex = async (table, indexName, columnsSql, { unique = false } = {}) => {
  const [rows] = await db.query(
    `SELECT COUNT(*) AS count FROM information_schema.STATISTICS
     WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND INDEX_NAME = ?`,
    [table, indexName]
  )
  if (!Number(rows[0]?.count || 0)) {
    await db.query(`CREATE ${unique ? 'UNIQUE ' : ''}INDEX ${indexName} ON ${table} (${columnsSql})`)
  }
}

const INVENTORY_SEEDS = [
  ['SUP-001', 'Disposable Syringe 3mL', 'Supplies', 'piece', 'piece', 1, 500, 50, 8.00, 'MediSupply PH', '2028-02-28', 'Cabinet S1'],
  ['SUP-002', 'Disposable Syringe 1mL', 'Supplies', 'piece', 'piece', 1, 500, 50, 7.00, 'MediSupply PH', '2028-02-28', 'Cabinet S1'],
  ['SUP-003', 'Sterile Needle 23G', 'Supplies', 'piece', 'piece', 1, 1000, 100, 5.00, 'MediSupply PH', '2028-03-15', 'Cabinet S1'],
  ['SUP-004', 'Sterile Gauze Pad 2x2', 'Supplies', 'pack', 'piece', 100, 120, 20, 45.00, 'ClinicCare Supplies', '2029-01-31', 'Cabinet S2'],
  ['SUP-005', 'Cotton Balls', 'Supplies', 'pack', 'piece', 100, 80, 15, 55.00, 'ClinicCare Supplies', '2029-01-31', 'Cabinet S2'],
  ['SUP-006', 'Alcohol 70% 500mL', 'Supplies', 'bottle', 'mL', 500, 60, 12, 95.00, 'PharmaPlus', '2028-05-31', 'Disinfection Shelf'],
  ['SUP-007', 'Povidone-Iodine Solution', 'Supplies', 'bottle', 'mL', 500, 30, 8, 160.00, 'PharmaPlus', '2028-06-30', 'Disinfection Shelf'],
  ['SUP-008', 'Sterile Gloves', 'Supplies', 'pair', 'pair', 1, 300, 50, 18.00, 'ClinicCare Supplies', '2029-04-30', 'Cabinet S3'],
  ['SUP-009', 'Surgical Mask', 'Supplies', 'piece', 'piece', 1, 4000, 300, 2.50, 'ClinicCare Supplies', '2029-04-30', 'Cabinet S3'],
  ['SUP-010', 'Bandage Roll', 'Supplies', 'roll', 'roll', 1, 40, 8, 85.00, 'ClinicCare Supplies', '2028-12-31', 'Cabinet S2'],
  ['SUP-011', 'Suture Nylon 4-0', 'Supplies', 'pack', 'piece', 12, 35, 8, 220.00, 'SurgiMed PH', '2028-09-30', 'Procedure Cabinet'],
  ['SUP-012', 'Sterile Drape', 'Supplies', 'piece', 'piece', 1, 80, 15, 35.00, 'SurgiMed PH', '2029-02-28', 'Procedure Cabinet'],
  ['SUP-013', 'Specimen Container', 'Supplies', 'piece', 'piece', 1, 100, 15, 20.00, 'SurgiMed PH', '2029-02-28', 'Procedure Cabinet'],
  ['SUP-014', 'Acupuncture Needle 0.25x25mm', 'Supplies', 'box', 'piece', 100, 70, 10, 300.00, 'AcuHealth Supplies', '2028-10-31', 'Acupuncture Shelf'],
  ['SUP-015', 'Alcohol Swab', 'Supplies', 'box', 'piece', 100, 100, 20, 85.00, 'ClinicCare Supplies', '2028-12-31', 'Disinfection Shelf'],
  ['MED-003', 'Paracetamol 500mg Tablet', 'Medicine', 'tablet', 'tablet', 1, 1000, 100, 3.00, 'PharmaPlus', '2028-08-31', 'Medicine Cabinet'],
  ['MED-004', 'Amoxicillin 500mg Capsule', 'Medicine', 'capsule', 'capsule', 1, 500, 80, 12.00, 'PharmaPlus', '2028-07-31', 'Medicine Cabinet'],
  ['MED-005', 'Cetirizine 10mg Tablet', 'Medicine', 'tablet', 'tablet', 1, 500, 80, 5.00, 'PharmaPlus', '2028-11-30', 'Medicine Cabinet'],
  ['MED-006', 'Mupirocin Ointment', 'Medicine', 'tube', 'tube', 1, 60, 10, 280.00, 'SkinCare Depot', '2028-05-31', 'Medicine Cabinet'],
  ['MED-007', 'Lidocaine 2% 50mL', 'Medicine', 'vial', 'vial', 1, 40, 8, 290.00, 'SurgiMed PH', '2028-04-30', 'Procedure Cabinet'],
  ['MED-008', 'Tetanus Toxoid Vaccine', 'Medicine', 'vial', 'vial', 1, 45, 10, 450.00, 'VaxCare PH', '2028-03-31', 'Vaccine Refrigerator'],
  ['MED-009', 'Rabies Vaccine', 'Medicine', 'vial', 'vial', 1, 60, 12, 1150.00, 'VaxCare PH', '2028-03-31', 'Vaccine Refrigerator'],
  ['MED-010', 'Rabies Immunoglobulin', 'Medicine', 'vial', 'vial', 1, 20, 5, 2450.00, 'VaxCare PH', '2028-01-31', 'Vaccine Refrigerator'],
  ['MED-011', 'Influenza Vaccine', 'Medicine', 'vial', 'vial', 1, 50, 10, 800.00, 'VaxCare PH', '2028-02-28', 'Vaccine Refrigerator'],
  ['DER-001', 'Chemical Peel Solution', 'Derma', 'bottle', 'mL', 100, 20, 5, 950.00, 'SkinCare Depot', '2028-09-30', 'Derma Shelf'],
  ['DER-002', 'Salicylic Acid Peel', 'Derma', 'bottle', 'mL', 100, 18, 5, 850.00, 'SkinCare Depot', '2028-09-30', 'Derma Shelf'],
  ['DER-003', 'Glycolic Acid Peel', 'Derma', 'bottle', 'mL', 100, 18, 5, 780.00, 'SkinCare Depot', '2028-09-30', 'Derma Shelf'],
  ['DER-004', 'Laser Cooling Gel', 'Derma', 'bottle', 'mL', 500, 50, 8, 350.00, 'DermaPharma Inc.', '2028-12-31', 'Laser Room'],
  ['DER-005', 'IPL Protective Eye Shield', 'Derma', 'pair', 'pair', 1, 20, 4, 300.00, 'DermaPharma Inc.', null, 'Laser Room'],
  ['DER-006', 'Electrocautery Tip', 'Derma', 'piece', 'piece', 1, 150, 25, 75.00, 'DermaPharma Inc.', '2029-01-31', 'Procedure Cabinet'],
  ['DER-007', 'Biopsy Punch 3mm', 'Derma', 'piece', 'piece', 1, 60, 10, 180.00, 'SurgiMed PH', '2028-10-31', 'Procedure Cabinet'],
  ['DER-008', 'Sterile Blade No. 15', 'Derma', 'piece', 'piece', 1, 100, 20, 25.00, 'SurgiMed PH', '2029-01-31', 'Procedure Cabinet'],
  ['DER-009', 'Microneedling Cartridge', 'Derma', 'piece', 'piece', 1, 80, 12, 550.00, 'DermaPharma Inc.', '2028-11-30', 'Derma Shelf'],
]

const SERVICE_MATERIAL_SEEDS = [
  ['General Consultation', 'medical', [['SUP-009', 1], ['SUP-006', 0.02], ['SUP-005', 0.03]]],
  ['Follow-up Consultation', 'medical', [['SUP-009', 1], ['SUP-006', 0.01]]],
  ['Minor Excision', 'medical', [['MED-007', 1], ['SUP-008', 1], ['SUP-011', 1], ['SUP-012', 1], ['DER-008', 1], ['SUP-004', 1], ['SUP-007', 0.05]]],
  ['Circumcision', 'medical', [['MED-007', 1], ['SUP-008', 2], ['SUP-011', 2], ['SUP-012', 2], ['DER-008', 2], ['SUP-004', 2], ['SUP-010', 1], ['SUP-007', 0.08]]],
  ['Other Surgical Procedure', 'medical', [['MED-007', 1], ['SUP-008', 2], ['SUP-011', 2], ['SUP-012', 1], ['DER-008', 2], ['SUP-004', 2], ['SUP-007', 0.08]]],
  ['Routine Vaccine', 'medical', [['SUP-002', 1], ['SUP-003', 1], ['SUP-015', 1], ['SUP-005', 0.02]]],
  ['Travel Vaccine', 'medical', [['SUP-002', 1], ['SUP-003', 1], ['SUP-015', 1], ['SUP-005', 0.02]]],
  ['Seasonal Flu Vaccine', 'medical', [['MED-011', 1], ['SUP-002', 1], ['SUP-003', 1], ['SUP-015', 1]]],
  ['Dermatology Consultation', 'derma', [['SUP-009', 1], ['SUP-006', 0.02], ['SUP-005', 0.03]]],
  ['Laser Rejuvenation', 'derma', [['DER-004', 0.05], ['DER-005', 1], ['SUP-008', 1], ['SUP-009', 1], ['SUP-006', 0.03]]],
  ['Laser Scar Treatment', 'derma', [['DER-004', 0.06], ['DER-005', 1], ['SUP-008', 1], ['SUP-009', 1], ['SUP-006', 0.03]]],
  ['IPL Anti-aging', 'derma', [['DER-004', 0.05], ['DER-005', 1], ['SUP-008', 1], ['SUP-009', 1]]],
  ['IPL Hair Removal', 'derma', [['DER-004', 0.07], ['DER-005', 1], ['SUP-008', 1], ['SUP-009', 1]]],
  ['Electrocautery', 'derma', [['DER-006', 1], ['MED-007', 0.5], ['SUP-008', 1], ['SUP-004', 1], ['SUP-007', 0.03]]],
  ['Chemical Peeling', 'derma', [['DER-001', 0.1], ['DER-002', 0.05], ['DER-003', 0.05], ['SUP-008', 1], ['SUP-005', 0.05], ['SUP-006', 0.03]]],
  ['Skin Biopsy', 'derma', [['DER-007', 1], ['DER-008', 1], ['MED-007', 1], ['SUP-008', 1], ['SUP-013', 1], ['SUP-004', 1], ['SUP-007', 0.03]]],
  ['Acupuncture Session', 'medical', [['SUP-014', 0.15], ['SUP-015', 2], ['SUP-009', 1]]],
  ['Pain Relief Treatment', 'medical', [['SUP-014', 0.2], ['SUP-015', 3], ['SUP-009', 1]]],
  ['Vertigo / Migraine Treatment', 'medical', [['SUP-014', 0.2], ['SUP-015', 3], ['SUP-009', 1]]],
  ['Insomnia Treatment', 'medical', [['SUP-014', 0.2], ['SUP-015', 3], ['SUP-009', 1]]],
  ['Smoking Cessation Treatment', 'medical', [['SUP-014', 0.25], ['SUP-015', 4], ['SUP-009', 1]]],
  ['Pre-exposure Prophylaxis', 'medical', [['MED-009', 1], ['SUP-002', 1], ['SUP-003', 1], ['SUP-015', 1]]],
  ['Post-exposure Treatment', 'medical', [['MED-009', 1], ['MED-008', 1], ['SUP-002', 2], ['SUP-003', 2], ['SUP-015', 2]]],
  ['Rabies Vaccine', 'medical', [['MED-009', 1], ['SUP-002', 1], ['SUP-003', 1], ['SUP-015', 1]]],
  ['Immunoglobulin', 'medical', [['MED-010', 1], ['SUP-001', 1], ['SUP-003', 1], ['SUP-015', 1]]],
]

const SERVICE_FEE_SEEDS = [
  ['General Consultation', 'medical', 600],
  ['Follow-up Consultation', 'medical', 400],
  ['Minor Excision', 'medical', 2500],
  ['Circumcision', 'medical', 4500],
  ['Other Surgical Procedure', 'medical', 3500],
  ['Routine Vaccine', 'medical', 500],
  ['Travel Vaccine', 'medical', 700],
  ['Seasonal Flu Vaccine', 'medical', 450],
  ['Dermatology Consultation', 'derma', 800],
  ['Laser Rejuvenation', 'derma', 2500],
  ['Laser Scar Treatment', 'derma', 4500],
  ['IPL Anti-aging', 'derma', 2500],
  ['IPL Hair Removal', 'derma', 1800],
  ['Electrocautery', 'derma', 1200],
  ['Chemical Peeling', 'derma', 1800],
  ['Skin Biopsy', 'derma', 3000],
  ['Acupuncture Session', 'medical', 900],
  ['Pain Relief Treatment', 'medical', 1200],
  ['Vertigo / Migraine Treatment', 'medical', 1200],
  ['Insomnia Treatment', 'medical', 1200],
  ['Smoking Cessation Treatment', 'medical', 1500],
  ['Pre-exposure Prophylaxis', 'medical', 600],
  ['Post-exposure Treatment', 'medical', 900],
  ['Rabies Vaccine', 'medical', 650],
  ['Immunoglobulin', 'medical', 900],
]

const seedInventoryAndBillingMaterials = async () => {
  for (const item of INVENTORY_SEEDS) {
    const [
      barcode, name, category, unit, baseUnit, unitSize, stock, threshold, price,
      supplier, expirationDate, storageLocation,
    ] = item

    await db.query(
      `INSERT INTO inventory
       (barcode, name, category, unit, base_unit, unit_size, stock, threshold, price, supplier, expiration_date, storage_location)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
       ON DUPLICATE KEY UPDATE
         name = VALUES(name),
         category = VALUES(category),
         unit = VALUES(unit),
         base_unit = VALUES(base_unit),
         unit_size = VALUES(unit_size),
         threshold = VALUES(threshold),
         price = VALUES(price),
         supplier = VALUES(supplier),
         storage_location = VALUES(storage_location)`,
      [barcode, name, category, unit, baseUnit, unitSize, stock, threshold, price, supplier, expirationDate, storageLocation]
    )

    const [[inventoryItem]] = await db.query('SELECT id FROM inventory WHERE barcode = ? LIMIT 1', [barcode])
    if (inventoryItem?.id) {
      await db.query(
        `INSERT INTO inventory_batches (inventory_id, quantity, expiration_date, note)
         SELECT ?, ?, ?, 'Generated opening stock'
         WHERE NOT EXISTS (
           SELECT 1 FROM inventory_batches WHERE inventory_id = ?
         )`,
        [inventoryItem.id, stock, expirationDate, inventoryItem.id]
      )
    }
  }

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
      i.stock = COALESCE(b.total_qty, i.stock),
      i.stock_base = COALESCE(b.total_qty, i.stock) * COALESCE(NULLIF(i.unit_size, 0), 1),
      i.expiration_date = COALESCE(b.earliest_expiry, i.expiration_date),
      i.base_unit = COALESCE(i.base_unit, i.unit)
  `)

  for (const [serviceName, clinicType, materials] of SERVICE_MATERIAL_SEEDS) {
    const [[service]] = await db.query(
      `SELECT id
       FROM billing_service_catalog
       WHERE service_name = ? AND clinic_type = ?
       LIMIT 1`,
      [serviceName, clinicType]
    )
    if (!service?.id) continue

    const [[existingMaterials]] = await db.query(
      'SELECT COUNT(*) AS count FROM billing_service_materials WHERE billing_service_id = ?',
      [service.id]
    )
    if (Number(existingMaterials?.count || 0) > 0) continue

    for (const [barcode, quantity, notes = null] of materials) {
      const [[inventoryItem]] = await db.query(
        'SELECT id, name, unit FROM inventory WHERE barcode = ? LIMIT 1',
        [barcode]
      )
      if (!inventoryItem?.id) continue

      await db.query(
        `INSERT INTO billing_service_materials
         (billing_service_id, inventory_id, material_name, quantity, unit_label, notes, sort_order)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
        [
          service.id,
          inventoryItem.id,
          inventoryItem.name,
          quantity,
          inventoryItem.unit,
          notes,
          materials.findIndex((entry) => entry[0] === barcode),
        ]
      )
    }
  }

  for (const [serviceName, clinicType, consultationFee] of SERVICE_FEE_SEEDS) {
    await db.query(
      `UPDATE billing_service_catalog
       SET consultation_fee = ?
       WHERE service_name = ? AND clinic_type = ?`,
      [consultationFee, serviceName, clinicType]
    )
  }
}

const ensureAppSchema = async () => {
  await ensureColumn('appointments', 'status', "VARCHAR(32) NOT NULL DEFAULT 'pending'")
    .catch(() => {})

  await ensureColumn('inventory', 'base_unit', "VARCHAR(50) NULL")
  await ensureColumn('inventory', 'unit_size', "DECIMAL(10,2) NOT NULL DEFAULT 1")
  await ensureColumn('inventory', 'stock_base', "DECIMAL(12,2) NOT NULL DEFAULT 0")
  await ensureColumn('inventory', 'expiration_date', 'DATE NULL')
  await ensureColumn('inventory', 'storage_location', "VARCHAR(120) NULL")

  await ensureColumn('consultations', 'status', "VARCHAR(20) NOT NULL DEFAULT 'draft'").catch(() => {})
  await ensureColumn('consultations', 'finalized_at', 'DATETIME NULL').catch(() => {})
  await ensureColumn('consultations', 'finalized_by_doctor_id', 'INT NULL').catch(() => {})
  await ensureColumn('consultations', 'updated_at', 'DATETIME NULL').catch(() => {})
  await db.query("UPDATE consultations SET status='finalized', finalized_at=COALESCE(finalized_at, consulted_at), finalized_by_doctor_id=COALESCE(finalized_by_doctor_id, doctor_id) WHERE status IS NULL OR status='' OR (status='draft' AND appointment_id IN (SELECT id FROM appointments WHERE status='completed'))").catch(() => {})

  await ensureTable(`
    CREATE TABLE IF NOT EXISTS consultation_amendments (
      id BIGINT AUTO_INCREMENT PRIMARY KEY,
      consultation_id INT NOT NULL,
      doctor_id INT NOT NULL,
      reason VARCHAR(255) NOT NULL,
      amendment_text TEXT NOT NULL,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      INDEX idx_consultation_amendments_consultation (consultation_id, created_at),
      CONSTRAINT fk_consultation_amendment_consultation FOREIGN KEY (consultation_id) REFERENCES consultations(id) ON DELETE CASCADE,
      CONSTRAINT fk_consultation_amendment_doctor FOREIGN KEY (doctor_id) REFERENCES doctors(id) ON DELETE RESTRICT
    )
  `)

  await ensureTable(`
    CREATE TABLE IF NOT EXISTS consultation_images (
      id INT AUTO_INCREMENT PRIMARY KEY,
      consultation_id INT NOT NULL,
      image_url TEXT NOT NULL,
      caption VARCHAR(255) NULL,
      security_scan_status VARCHAR(20) NOT NULL DEFAULT 'legacy',
      sort_order INT NOT NULL DEFAULT 0,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      INDEX idx_consultation_images_consultation (consultation_id, sort_order, created_at),
      CONSTRAINT fk_consultation_images_consultation
        FOREIGN KEY (consultation_id) REFERENCES consultations(id) ON DELETE CASCADE
    )
  `)

  await ensureColumn('consultation_images', 'security_scan_status', "VARCHAR(20) NOT NULL DEFAULT 'legacy' AFTER caption")

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

  if (process.env.SEED_DEMO_DATA === 'true') {
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
  }

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
      consultation_fee DECIMAL(10,2) NOT NULL DEFAULT 0.00,
      profit_percentage DECIMAL(5,2) NOT NULL DEFAULT 20.00,
      is_active TINYINT(1) NOT NULL DEFAULT 1,
      sort_order INT NOT NULL DEFAULT 0,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      UNIQUE KEY uniq_billing_service_name (service_name, clinic_type)
    )
  `)

  await ensureColumn('billing_service_catalog', 'profit_percentage', 'DECIMAL(5,2) NOT NULL DEFAULT 20.00')
  await ensureColumn('billing_service_catalog', 'consultation_fee', 'DECIMAL(10,2) NOT NULL DEFAULT 0.00 AFTER default_price')
  // default_price is the clinic's explicit patient-facing selling price.
  await ensureColumn('billing_service_catalog', 'pricing_notes', 'VARCHAR(255) NULL')

  if (process.env.SEED_DEMO_DATA === 'true') {
    await db.query(`
    INSERT IGNORE INTO billing_service_catalog (category, service_name, clinic_type, default_price, profit_percentage, is_active, sort_order)
    VALUES
      ('Medical Consultations', 'General Consultation', 'medical', 0.00, 20.00, 1, 10),
      ('Medical Consultations', 'Follow-up Consultation', 'medical', 0.00, 20.00, 1, 20),
      ('Medical Consultations', 'Minor Excision', 'medical', 0.00, 20.00, 1, 30),
      ('Medical Consultations', 'Circumcision', 'medical', 0.00, 20.00, 1, 40),
      ('Medical Consultations', 'Other Surgical Procedure', 'medical', 0.00, 20.00, 1, 50),
      ('Vaccinations', 'Routine Vaccine', 'medical', 0.00, 20.00, 1, 60),
      ('Vaccinations', 'Travel Vaccine', 'medical', 0.00, 20.00, 1, 70),
      ('Vaccinations', 'Seasonal Flu Vaccine', 'medical', 0.00, 20.00, 1, 80),
      ('Dermatologic Services', 'Dermatology Consultation', 'derma', 0.00, 20.00, 1, 90),
      ('Dermatologic Services', 'Laser Rejuvenation', 'derma', 0.00, 20.00, 1, 100),
      ('Dermatologic Services', 'Laser Scar Treatment', 'derma', 0.00, 20.00, 1, 110),
      ('Dermatologic Services', 'IPL Anti-aging', 'derma', 0.00, 20.00, 1, 120),
      ('Dermatologic Services', 'IPL Hair Removal', 'derma', 0.00, 20.00, 1, 130),
      ('Dermatologic Services', 'Electrocautery', 'derma', 0.00, 20.00, 1, 140),
      ('Dermatologic Services', 'Chemical Peeling', 'derma', 0.00, 20.00, 1, 150),
      ('Dermatologic Services', 'Skin Biopsy', 'derma', 0.00, 20.00, 1, 160),
      ('Acupuncture', 'Acupuncture Session', 'medical', 0.00, 20.00, 1, 170),
      ('Acupuncture', 'Pain Relief Treatment', 'medical', 0.00, 20.00, 1, 180),
      ('Acupuncture', 'Vertigo / Migraine Treatment', 'medical', 0.00, 20.00, 1, 190),
      ('Acupuncture', 'Insomnia Treatment', 'medical', 0.00, 20.00, 1, 200),
      ('Acupuncture', 'Smoking Cessation Treatment', 'medical', 0.00, 20.00, 1, 210),
      ('Animal Bite Center', 'Pre-exposure Prophylaxis', 'medical', 0.00, 20.00, 1, 220),
      ('Animal Bite Center', 'Post-exposure Treatment', 'medical', 0.00, 20.00, 1, 230),
      ('Animal Bite Center', 'Rabies Vaccine', 'medical', 0.00, 20.00, 1, 240),
      ('Animal Bite Center', 'Immunoglobulin', 'medical', 0.00, 20.00, 1, 250)
    `)
  }

  await ensureTable(`
    CREATE TABLE IF NOT EXISTS billing_service_materials (
      id INT AUTO_INCREMENT PRIMARY KEY,
      billing_service_id INT NOT NULL,
      inventory_id INT NULL,
      material_name VARCHAR(180) NOT NULL,
      quantity DECIMAL(10,2) NOT NULL DEFAULT 1.00,
      unit_label VARCHAR(50) NULL,
      unit_cost_override DECIMAL(10,2) NULL,
      notes TEXT NULL,
      sort_order INT NOT NULL DEFAULT 0,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      INDEX idx_billing_service_materials_service (billing_service_id, sort_order, id),
      CONSTRAINT fk_billing_service_materials_service
        FOREIGN KEY (billing_service_id) REFERENCES billing_service_catalog(id) ON DELETE CASCADE,
      CONSTRAINT fk_billing_service_materials_inventory
        FOREIGN KEY (inventory_id) REFERENCES inventory(id) ON DELETE SET NULL
    )
  `)

  await ensureTable(`
    CREATE TABLE IF NOT EXISTS billing_records (
      id INT AUTO_INCREMENT PRIMARY KEY,
      appointment_id INT NOT NULL,
      consultation_id INT NULL,
      patient_id INT NOT NULL,
      doctor_id INT NOT NULL,
      status VARCHAR(20) NOT NULL DEFAULT 'draft',
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
      item_type VARCHAR(20) NOT NULL DEFAULT 'custom',
      source_inventory_id INT NULL,
      category VARCHAR(120) NULL,
      service_name VARCHAR(180) NOT NULL,
      quantity DECIMAL(10,2) NOT NULL DEFAULT 1.00,
      base_amount DECIMAL(10,2) NOT NULL DEFAULT 0.00,
      markup_percentage DECIMAL(5,2) NOT NULL DEFAULT 0.00,
      unit_price DECIMAL(10,2) NOT NULL DEFAULT 0.00,
      line_total DECIMAL(10,2) NOT NULL DEFAULT 0.00,
      details_json LONGTEXT NULL,
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

  await ensureColumn('billing_items', 'item_type', "VARCHAR(20) NOT NULL DEFAULT 'custom'")
  await ensureColumn('billing_items', 'source_inventory_id', 'INT NULL')
  await ensureColumn('billing_items', 'base_amount', 'DECIMAL(10,2) NOT NULL DEFAULT 0.00')
  await ensureColumn('billing_items', 'markup_percentage', 'DECIMAL(5,2) NOT NULL DEFAULT 0.00')
  await ensureColumn('billing_items', 'details_json', 'LONGTEXT NULL')
  await db.query(`
    ALTER TABLE billing_items
    ADD CONSTRAINT fk_billing_items_inventory
    FOREIGN KEY (source_inventory_id) REFERENCES inventory(id) ON DELETE SET NULL
  `).catch(() => {})

  await ensureTable(`
    CREATE TABLE IF NOT EXISTS inventory_batches (
      id INT AUTO_INCREMENT PRIMARY KEY,
      inventory_id INT NOT NULL,
      batch_code VARCHAR(80) NULL,
      quantity DECIMAL(12,2) NOT NULL DEFAULT 0,
      expiration_date DATE NULL,
      note TEXT NULL,
      received_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      INDEX idx_inventory_batches_inventory_expiry (inventory_id, expiration_date, received_at),
      INDEX idx_inventory_batches_code (inventory_id, batch_code),
      CONSTRAINT fk_inventory_batches_inventory
        FOREIGN KEY (inventory_id) REFERENCES inventory(id) ON DELETE CASCADE
    )
  `)
  await ensureColumn('inventory_batches', 'batch_code', 'VARCHAR(80) NULL')
  await db.query('ALTER TABLE inventory_batches ADD INDEX idx_inventory_batches_code (inventory_id, batch_code)').catch(() => {})

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

  if (process.env.SEED_DEMO_DATA === 'true') {
    await seedInventoryAndBillingMaterials()
  }

  await ensureTable(`
    CREATE TABLE IF NOT EXISTS billing_payments (
      id INT AUTO_INCREMENT PRIMARY KEY,
      billing_id INT NOT NULL,
      amount DECIMAL(10,2) NOT NULL DEFAULT 0.00,
      payment_method VARCHAR(30) NOT NULL,
      reference_number VARCHAR(120) NULL,
      amount_received DECIMAL(10,2) NOT NULL DEFAULT 0.00,
      change_amount DECIMAL(10,2) NOT NULL DEFAULT 0.00,
      receipt_number VARCHAR(80) NOT NULL,
      status VARCHAR(20) NOT NULL DEFAULT 'completed',
      notes TEXT NULL,
      received_by_staff_id INT NULL,
      paid_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      voided_at DATETIME NULL,
      voided_by_staff_id INT NULL,
      void_reason TEXT NULL,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      UNIQUE KEY uniq_billing_payment_receipt (receipt_number),
      INDEX idx_billing_payments_bill (billing_id, paid_at),
      CONSTRAINT fk_billing_payments_bill
        FOREIGN KEY (billing_id) REFERENCES billing_records(id) ON DELETE RESTRICT,
      CONSTRAINT fk_billing_payments_received_staff
        FOREIGN KEY (received_by_staff_id) REFERENCES staff(id) ON DELETE SET NULL,
      CONSTRAINT fk_billing_payments_voided_staff
        FOREIGN KEY (voided_by_staff_id) REFERENCES staff(id) ON DELETE SET NULL
    )
  `)

  await ensureTable(`
    CREATE TABLE IF NOT EXISTS clinic_payment_settings (
      id INT NOT NULL PRIMARY KEY,
      cash_enabled TINYINT(1) NOT NULL DEFAULT 1,
      gcash_enabled TINYINT(1) NOT NULL DEFAULT 1,
      maya_enabled TINYINT(1) NOT NULL DEFAULT 1,
      bank_transfer_enabled TINYINT(1) NOT NULL DEFAULT 1,
      gcash_qr_url TEXT NULL,
      maya_qr_url TEXT NULL,
      gcash_qr_scan_status VARCHAR(20) NOT NULL DEFAULT 'legacy',
      maya_qr_scan_status VARCHAR(20) NOT NULL DEFAULT 'legacy',
      bank_name VARCHAR(120) NULL,
      bank_account_name VARCHAR(180) NULL,
      bank_account_number VARCHAR(120) NULL,
      updated_by_admin_id INT NULL,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      CONSTRAINT fk_clinic_payment_settings_admin
        FOREIGN KEY (updated_by_admin_id) REFERENCES admins(id) ON DELETE SET NULL
    )
  `)

  await ensureColumn('clinic_payment_settings', 'cash_enabled', 'TINYINT(1) NOT NULL DEFAULT 1 AFTER id')
  await ensureColumn('clinic_payment_settings', 'gcash_enabled', 'TINYINT(1) NOT NULL DEFAULT 1 AFTER cash_enabled')
  await ensureColumn('clinic_payment_settings', 'maya_enabled', 'TINYINT(1) NOT NULL DEFAULT 1 AFTER gcash_enabled')
  await ensureColumn('clinic_payment_settings', 'bank_transfer_enabled', 'TINYINT(1) NOT NULL DEFAULT 1 AFTER maya_enabled')
  await ensureColumn('clinic_payment_settings', 'gcash_qr_scan_status', "VARCHAR(20) NOT NULL DEFAULT 'legacy' AFTER maya_qr_url")
  await ensureColumn('clinic_payment_settings', 'maya_qr_scan_status', "VARCHAR(20) NOT NULL DEFAULT 'legacy' AFTER gcash_qr_scan_status")

  await ensureTable(`
    CREATE TABLE IF NOT EXISTS audit_logs (
      id BIGINT AUTO_INCREMENT PRIMARY KEY,
      user_id INT NULL,
      user_role VARCHAR(20) NOT NULL,
      action VARCHAR(80) NOT NULL,
      entity_type VARCHAR(80) NOT NULL,
      entity_id VARCHAR(80) NULL,
      old_values JSON NULL,
      new_values JSON NULL,
      ip_address VARCHAR(45) NULL,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      INDEX idx_audit_entity (entity_type, entity_id, created_at),
      INDEX idx_audit_user (user_role, user_id, created_at)
    )
  `)


  // ── 2026 clinic workflow upgrades ───────────────────────────────────────────
  await ensureColumn('appointments', 'appointment_source', "VARCHAR(30) NOT NULL DEFAULT 'online'")
  await ensureColumn('appointments', 'checked_in_at', 'DATETIME NULL')

  await ensureColumn('patients', 'consent_method', 'VARCHAR(40) NULL')
  await ensureColumn('patients', 'consent_recorded_by_staff_id', 'INT NULL')

  await db.query("ALTER TABLE billing_records MODIFY COLUMN status VARCHAR(20) NOT NULL DEFAULT 'draft'").catch(() => {})
  await ensureColumn('billing_records', 'finalized_at', 'DATETIME NULL')
  await ensureColumn('billing_records', 'finalized_by_staff_id', 'INT NULL')
  await ensureColumn('billing_records', 'clinical_inventory_consumed_at', 'DATETIME NULL')
  await ensureColumn('billing_records', 'voided_at', 'DATETIME NULL')
  await ensureColumn('billing_records', 'void_reason', 'TEXT NULL')
  await ensureColumn('billing_records', 'refunded_at', 'DATETIME NULL')
  await ensureColumn('billing_records', 'refund_reason', 'TEXT NULL')

  await ensureColumn('billing_payments', 'refunded_at', 'DATETIME NULL')
  await ensureColumn('billing_payments', 'refund_amount', 'DECIMAL(10,2) NOT NULL DEFAULT 0.00')
  await ensureColumn('billing_payments', 'refund_reason', 'TEXT NULL')
  await ensureColumn('billing_payments', 'refunded_by_admin_id', 'INT NULL')

  await ensureColumn('inventory_logs', 'movement_type', "VARCHAR(40) NOT NULL DEFAULT 'adjustment'")
  await ensureColumn('inventory_logs', 'from_location', 'VARCHAR(120) NULL')
  await ensureColumn('inventory_logs', 'to_location', 'VARCHAR(120) NULL')
  await ensureColumn('inventory_logs', 'reference_type', 'VARCHAR(50) NULL')
  await ensureColumn('inventory_logs', 'reference_id', 'INT NULL')
  await ensureColumn('inventory_logs', 'batch_id', 'INT NULL')
  await db.query('ALTER TABLE inventory_logs MODIFY COLUMN qty DECIMAL(12,2) NOT NULL').catch(() => {})
  await db.query('ALTER TABLE queue ADD UNIQUE KEY uniq_queue_doctor_day_number (queue_date, doctor_id, queue_number)').catch(() => {})

  await ensureColumn('supply_requests', 'destination_location', "VARCHAR(120) NOT NULL DEFAULT 'Doctor / Treatment Room'")
  await ensureColumn('supply_requests', 'destination_location_id', 'INT NULL')
  await ensureColumn('supply_requests', 'resolved_at', 'DATETIME NULL')
  await ensureColumn('supply_requests', 'resolved_by_admin_id', 'INT NULL')
  await ensureColumn('supply_requests', 'resolution_note', 'TEXT NULL')

  await ensureTable(`
    CREATE TABLE IF NOT EXISTS clinic_settings (
      id INT NOT NULL PRIMARY KEY,
      clinic_name VARCHAR(180) NOT NULL DEFAULT 'CARAIT MEDICAL AND DERMATOLOGY CLINIC',
      address VARCHAR(255) NULL,
      phone VARCHAR(80) NULL,
      email VARCHAR(160) NULL,
      report_footer VARCHAR(255) NULL,
      receipt_footer VARCHAR(255) NULL,
      updated_by_admin_id INT NULL,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
    )
  `)
  await db.query(
    `INSERT IGNORE INTO clinic_settings
     (id, clinic_name, address, phone, email, report_footer, receipt_footer)
     VALUES (1, 'CARAIT MEDICAL AND DERMATOLOGY CLINIC', 'A. Bonifacio St., Brgy. Canlalay, Biñan, Laguna', NULL, NULL,
             'Generated from the Carait Clinic Management System.',
             'Thank you for choosing Carait Medical and Dermatology Clinic.')`
  )

  await ensureTable(`
    CREATE TABLE IF NOT EXISTS discount_presets (
      id INT AUTO_INCREMENT PRIMARY KEY,
      label VARCHAR(80) NOT NULL,
      discount_type VARCHAR(20) NOT NULL DEFAULT 'percentage',
      value DECIMAL(10,2) NOT NULL DEFAULT 0.00,
      requires_reference TINYINT(1) NOT NULL DEFAULT 0,
      requires_admin_approval TINYINT(1) NOT NULL DEFAULT 0,
      is_active TINYINT(1) NOT NULL DEFAULT 1,
      sort_order INT NOT NULL DEFAULT 0,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      UNIQUE KEY uniq_discount_preset_label (label)
    )
  `)
  await db.query(`
    INSERT IGNORE INTO discount_presets
      (label, discount_type, value, requires_reference, requires_admin_approval, is_active, sort_order)
    VALUES
      ('Senior', 'percentage', 20.00, 1, 0, 1, 10),
      ('PWD', 'percentage', 20.00, 1, 0, 1, 20),
      ('Promotional', 'fixed', 0.00, 0, 0, 1, 30),
      ('Courtesy', 'fixed', 0.00, 0, 1, 1, 40),
      ('Employee', 'percentage', 0.00, 0, 1, 1, 50)
  `)

  await ensureTable(`
    CREATE TABLE IF NOT EXISTS consultation_inventory_usage (
      id BIGINT AUTO_INCREMENT PRIMARY KEY,
      consultation_id INT NOT NULL,
      billing_id INT NULL,
      inventory_id INT NOT NULL,
      quantity DECIMAL(12,2) NOT NULL DEFAULT 0.00,
      unit_label VARCHAR(50) NULL,
      notes VARCHAR(255) NULL,
      recorded_by_doctor_id INT NULL,
      recorded_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      UNIQUE KEY uniq_consultation_inventory_usage (consultation_id, inventory_id),
      INDEX idx_consultation_inventory_billing (billing_id),
      CONSTRAINT fk_consultation_inventory_usage_consultation FOREIGN KEY (consultation_id) REFERENCES consultations(id) ON DELETE CASCADE,
      CONSTRAINT fk_consultation_inventory_usage_inventory FOREIGN KEY (inventory_id) REFERENCES inventory(id) ON DELETE RESTRICT
    )
  `)


  await ensureTable(`
    CREATE TABLE IF NOT EXISTS consultation_inventory_usage_batches (
      id BIGINT AUTO_INCREMENT PRIMARY KEY,
      consultation_usage_id BIGINT NOT NULL,
      batch_id INT NOT NULL,
      package_quantity DECIMAL(12,4) NOT NULL DEFAULT 0.0000,
      usage_quantity DECIMAL(12,4) NULL,
      usage_unit_label VARCHAR(50) NULL,
      source_location VARCHAR(120) NULL,
      recorded_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      UNIQUE KEY uniq_consultation_usage_batch (consultation_usage_id, batch_id, source_location),
      CONSTRAINT fk_consultation_usage_batch_parent FOREIGN KEY (consultation_usage_id) REFERENCES consultation_inventory_usage(id) ON DELETE CASCADE,
      CONSTRAINT fk_consultation_usage_batch_batch FOREIGN KEY (batch_id) REFERENCES inventory_batches(id) ON DELETE RESTRICT
    )
  `)

  await ensureTable(`
    CREATE TABLE IF NOT EXISTS billing_item_batch_usage (
      id BIGINT AUTO_INCREMENT PRIMARY KEY,
      billing_id INT NOT NULL,
      billing_item_id INT NULL,
      inventory_id INT NOT NULL,
      batch_id INT NOT NULL,
      package_quantity DECIMAL(12,4) NOT NULL DEFAULT 0.0000,
      usage_quantity DECIMAL(12,4) NULL,
      usage_unit_label VARCHAR(50) NULL,
      movement_type VARCHAR(40) NOT NULL DEFAULT 'dispensed',
      source_location VARCHAR(120) NULL,
      recorded_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      INDEX idx_billing_item_batch_bill (billing_id),
      INDEX idx_billing_item_batch_batch (batch_id),
      CONSTRAINT fk_billing_item_batch_bill FOREIGN KEY (billing_id) REFERENCES billing_records(id) ON DELETE CASCADE,
      CONSTRAINT fk_billing_item_batch_item FOREIGN KEY (billing_item_id) REFERENCES billing_items(id) ON DELETE SET NULL,
      CONSTRAINT fk_billing_item_batch_inventory FOREIGN KEY (inventory_id) REFERENCES inventory(id) ON DELETE RESTRICT,
      CONSTRAINT fk_billing_item_batch_batch FOREIGN KEY (batch_id) REFERENCES inventory_batches(id) ON DELETE RESTRICT
    )
  `)

  await ensureTable(`
    CREATE TABLE IF NOT EXISTS inventory_locations (
      id INT AUTO_INCREMENT PRIMARY KEY,
      name VARCHAR(120) NOT NULL,
      location_type VARCHAR(40) NOT NULL DEFAULT 'room',
      is_active TINYINT(1) NOT NULL DEFAULT 1,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      UNIQUE KEY uniq_inventory_location_name (name)
    )
  `)
  await db.query(`INSERT IGNORE INTO inventory_locations (name, location_type) VALUES ('Main Stockroom', 'stockroom'), ('General Medicine Room', 'room'), ('Dermatology Room', 'room'), ('Dispensing Area', 'dispensing')`)

  await ensureColumn('inventory_locations', 'is_active', 'TINYINT(1) NOT NULL DEFAULT 1').catch(() => {})
  await db.query(
    `UPDATE supply_requests sr
     JOIN inventory_locations il ON il.name = sr.destination_location
     SET sr.destination_location_id = il.id
     WHERE sr.destination_location_id IS NULL`
  ).catch(() => {})
  await db.query('CREATE INDEX idx_supply_request_destination_location ON supply_requests (destination_location_id)').catch(() => {})
  await db.query('ALTER TABLE supply_requests ADD CONSTRAINT fk_supply_request_destination_location FOREIGN KEY (destination_location_id) REFERENCES inventory_locations(id) ON DELETE SET NULL').catch(() => {})

  await ensureTable(`
    CREATE TABLE IF NOT EXISTS inventory_location_stock (
      location_id INT NOT NULL,
      inventory_id INT NOT NULL,
      quantity DECIMAL(12,2) NOT NULL DEFAULT 0.00,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      PRIMARY KEY (location_id, inventory_id),
      CONSTRAINT fk_inventory_location_stock_location FOREIGN KEY (location_id) REFERENCES inventory_locations(id) ON DELETE CASCADE,
      CONSTRAINT fk_inventory_location_stock_inventory FOREIGN KEY (inventory_id) REFERENCES inventory(id) ON DELETE CASCADE
    )
  `)

  await ensureTable(`
    CREATE TABLE IF NOT EXISTS inventory_location_batches (
      location_id INT NOT NULL,
      inventory_id INT NOT NULL,
      batch_id INT NOT NULL,
      quantity DECIMAL(12,2) NOT NULL DEFAULT 0.00,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      PRIMARY KEY (location_id, batch_id),
      INDEX idx_inventory_location_batches_item (inventory_id, location_id),
      CONSTRAINT fk_inventory_location_batches_location FOREIGN KEY (location_id) REFERENCES inventory_locations(id) ON DELETE CASCADE,
      CONSTRAINT fk_inventory_location_batches_inventory FOREIGN KEY (inventory_id) REFERENCES inventory(id) ON DELETE CASCADE,
      CONSTRAINT fk_inventory_location_batches_batch FOREIGN KEY (batch_id) REFERENCES inventory_batches(id) ON DELETE CASCADE
    )
  `)

  // Existing installs did not track batch location. Any unallocated batch balance starts in Main Stockroom.
  await db.query(`
    INSERT INTO inventory_location_batches (location_id, inventory_id, batch_id, quantity)
    SELECT l.id, b.inventory_id, b.id, b.quantity
    FROM inventory_batches b
    JOIN inventory_locations l ON l.name = 'Main Stockroom'
    WHERE b.quantity > 0
      AND NOT EXISTS (SELECT 1 FROM inventory_location_batches ilb WHERE ilb.batch_id = b.id)
  `)
  await db.query(`
    DELETE FROM inventory_location_stock
  `)
  await db.query(`
    INSERT INTO inventory_location_stock (location_id, inventory_id, quantity)
    SELECT location_id, inventory_id, SUM(quantity)
    FROM inventory_location_batches
    WHERE quantity > 0
    GROUP BY location_id, inventory_id
  `)

  await ensureTable(`
    CREATE TABLE IF NOT EXISTS inventory_transfers (
      id BIGINT AUTO_INCREMENT PRIMARY KEY,
      inventory_id INT NOT NULL,
      supply_request_id INT NULL,
      from_location VARCHAR(120) NOT NULL DEFAULT 'Main Stockroom',
      to_location VARCHAR(120) NOT NULL,
      quantity DECIMAL(12,2) NOT NULL DEFAULT 0.00,
      transferred_by_role VARCHAR(20) NOT NULL,
      transferred_by_user_id INT NULL,
      transferred_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      notes VARCHAR(255) NULL,
      INDEX idx_inventory_transfer_item (inventory_id, transferred_at),
      INDEX idx_inventory_transfer_request (supply_request_id)
    )
  `)

  await ensureTable(`
    CREATE TABLE IF NOT EXISTS inventory_transfer_batches (
      id BIGINT AUTO_INCREMENT PRIMARY KEY,
      transfer_id BIGINT NOT NULL,
      batch_id INT NOT NULL,
      quantity DECIMAL(12,2) NOT NULL DEFAULT 0.00,
      expiration_date DATE NULL,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      INDEX idx_transfer_batches_transfer (transfer_id),
      INDEX idx_transfer_batches_batch (batch_id),
      CONSTRAINT fk_transfer_batches_transfer FOREIGN KEY (transfer_id) REFERENCES inventory_transfers(id) ON DELETE CASCADE,
      CONSTRAINT fk_transfer_batches_batch FOREIGN KEY (batch_id) REFERENCES inventory_batches(id) ON DELETE RESTRICT
    )
  `)

  await ensureTable(`
    CREATE TABLE IF NOT EXISTS cashier_closings (
      id BIGINT AUTO_INCREMENT PRIMARY KEY,
      staff_id INT NOT NULL,
      closing_date DATE NOT NULL,
      expected_cash DECIMAL(10,2) NOT NULL DEFAULT 0.00,
      actual_cash DECIMAL(10,2) NOT NULL DEFAULT 0.00,
      variance DECIMAL(10,2) NOT NULL DEFAULT 0.00,
      notes TEXT NULL,
      closed_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      UNIQUE KEY uniq_cashier_closing (staff_id, closing_date)
    )
  `)

  await ensureColumn('patients', 'theme_preference', "VARCHAR(10) NOT NULL DEFAULT 'light'")
  await ensureColumn('patients', 'profile_image_url', "TEXT NULL")
  await ensureColumn('patients', 'is_walk_in', "TINYINT(1) NOT NULL DEFAULT 0")
  await ensureColumn('patients', 'consent_given', "TINYINT(1) NOT NULL DEFAULT 0")
  await ensureColumn('patients', 'consent_given_at', "TIMESTAMP NULL")
  await ensureColumn('patients', 'gender', "ENUM('Male','Female','Other') NULL")
  await ensureColumn('patients', 'receive_promotions', "TINYINT(1) NOT NULL DEFAULT 0")
  await ensureColumn('patients', 'is_profile_complete', "TINYINT(1) NOT NULL DEFAULT 0")
  await ensureColumn('patients', 'onboarding_completed_at', "DATETIME NULL")
  await db.query("ALTER TABLE patients MODIFY COLUMN sex ENUM('Male','Female','Other') NULL").catch(() => {})
  await ensureColumn('queue', 'appointment_id', 'INT NULL').catch(() => {})

  await ensureColumn('staff', 'theme_preference', "VARCHAR(10) NOT NULL DEFAULT 'light'")
  await ensureColumn('staff', 'profile_image_url', "TEXT NULL")
  await ensureColumn('staff', 'must_change_password', "TINYINT(1) NOT NULL DEFAULT 0")
  await ensureColumn('staff', 'password_changed_at', "DATETIME NULL")

  await ensureColumn('doctors', 'theme_preference', "VARCHAR(10) NOT NULL DEFAULT 'light'")
  await ensureColumn('doctors', 'profile_image_url', "TEXT NULL")
  await ensureColumn('doctors', 'must_change_password', "TINYINT(1) NOT NULL DEFAULT 0")
  await ensureColumn('doctors', 'password_changed_at', "DATETIME NULL")

  await ensureColumn('admins', 'theme_preference', "VARCHAR(10) NOT NULL DEFAULT 'light'")
  await ensureColumn('admins', 'profile_image_url', "TEXT NULL")

  await ensureColumn('admins', 'session_version', "INT NOT NULL DEFAULT 1")
  await ensureColumn('staff', 'session_version', "INT NOT NULL DEFAULT 1")
  await ensureColumn('doctors', 'session_version', "INT NOT NULL DEFAULT 1")
  await ensureColumn('patients', 'session_version', "INT NOT NULL DEFAULT 1")

  await ensureColumn('inventory_logs', 'staff_id', 'INT NULL').catch(() => {})
  await ensureColumn('inventory_logs', 'admin_id', 'INT NULL').catch(() => {})

  await ensureTable(`
    CREATE TABLE IF NOT EXISTS account_security_codes (
      id BIGINT AUTO_INCREMENT PRIMARY KEY,
      role VARCHAR(20) NOT NULL,
      account_id INT NOT NULL,
      purpose VARCHAR(40) NOT NULL DEFAULT 'password_change',
      code VARCHAR(128) NOT NULL,
      payload TEXT NULL,
      expires_at DATETIME NOT NULL,
      attempt_count INT NOT NULL DEFAULT 0,
      last_sent_at DATETIME NULL,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      UNIQUE KEY uniq_account_security_code (role, account_id),
      INDEX idx_security_code_lookup (role, account_id, purpose, expires_at)
    )
  `)
  await db.query('ALTER TABLE account_security_codes MODIFY COLUMN code VARCHAR(128) NOT NULL').catch(() => {})
  await ensureColumn('account_security_codes', 'purpose', "VARCHAR(40) NOT NULL DEFAULT 'password_change'")
  await ensureColumn('account_security_codes', 'payload', 'TEXT NULL')
  await ensureColumn('account_security_codes', 'attempt_count', 'INT NOT NULL DEFAULT 0')
  await ensureColumn('account_security_codes', 'last_sent_at', 'DATETIME NULL')

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
      otp_code VARCHAR(128) NOT NULL,
      payload JSON NOT NULL,
      expires_at DATETIME NOT NULL,
      verified_at DATETIME NULL,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      UNIQUE KEY uniq_patient_phone_verifications_phone (phone)
    )
  `)

  await db.query('ALTER TABLE patient_phone_verifications MODIFY COLUMN otp_code VARCHAR(128) NOT NULL').catch(() => {})
  await ensureColumn('patient_phone_verifications', 'attempt_count', 'INT NOT NULL DEFAULT 0')
  await ensureColumn('patient_phone_verifications', 'last_sent_at', 'DATETIME NULL')

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
  await ensureColumn('password_resets', 'attempt_count', 'INT NOT NULL DEFAULT 0')
  await ensureColumn('password_resets', 'last_sent_at', 'DATETIME NULL')
  await ensureColumn('password_resets', 'verified_at', 'DATETIME NULL')
  await ensureColumn('billing_payments', 'idempotency_key', 'VARCHAR(100) NULL')
  await db.query('CREATE UNIQUE INDEX uniq_billing_payment_idempotency ON billing_payments (idempotency_key)').catch(() => {})
  await ensureColumn('cashier_closings', 'is_locked', 'TINYINT(1) NOT NULL DEFAULT 1')

  await ensureTable(`
    CREATE TABLE IF NOT EXISTS billing_adjustment_requests (
      id BIGINT AUTO_INCREMENT PRIMARY KEY,
      billing_id INT NOT NULL,
      staff_id INT NOT NULL,
      request_type VARCHAR(30) NOT NULL,
      discount_preset_id INT NULL,
      catalog_service_id INT NULL,
      requested_amount DECIMAL(10,2) NULL,
      requested_price DECIMAL(10,2) NULL,
      reference_text VARCHAR(160) NULL,
      reason VARCHAR(255) NOT NULL,
      status VARCHAR(20) NOT NULL DEFAULT 'pending',
      resolved_by_admin_id INT NULL,
      resolved_at DATETIME NULL,
      admin_note VARCHAR(255) NULL,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      INDEX idx_billing_adjustment_bill (billing_id, status),
      INDEX idx_billing_adjustment_status (status, created_at),
      CONSTRAINT fk_billing_adjustment_bill FOREIGN KEY (billing_id) REFERENCES billing_records(id) ON DELETE CASCADE,
      CONSTRAINT fk_billing_adjustment_staff FOREIGN KEY (staff_id) REFERENCES staff(id) ON DELETE RESTRICT,
      CONSTRAINT fk_billing_adjustment_admin FOREIGN KEY (resolved_by_admin_id) REFERENCES admins(id) ON DELETE SET NULL
    )
  `)

  await ensureIndex('appointments', 'idx_appointments_doctor_date_time_status', 'doctor_id, appointment_date, appointment_time, status').catch(() => {})
  await ensureIndex('appointments', 'idx_appointments_patient_doctor_status', 'patient_id, doctor_id, status').catch(() => {})
  await ensureIndex('consultations', 'idx_consultations_doctor_patient', 'doctor_id, patient_id, status').catch(() => {})
  await ensureIndex('inventory_batches', 'idx_inventory_batches_item_expiry', 'inventory_id, expiration_date, quantity').catch(() => {})
  await ensureIndex('audit_logs', 'idx_audit_action_created', 'action, created_at').catch(() => {})
}

module.exports = {
  ensureAppSchema,
}



