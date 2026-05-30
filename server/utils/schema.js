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

  await seedInventoryAndBillingMaterials()

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
