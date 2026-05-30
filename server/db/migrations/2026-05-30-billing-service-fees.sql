-- Billing service fee support.
-- Apply after the billing catalog tables exist.

SET @sql = IF(
  (
    SELECT COUNT(*)
    FROM INFORMATION_SCHEMA.COLUMNS
    WHERE TABLE_SCHEMA = DATABASE()
      AND TABLE_NAME = 'billing_service_catalog'
      AND COLUMN_NAME = 'consultation_fee'
  ) = 0,
  'ALTER TABLE billing_service_catalog ADD COLUMN consultation_fee DECIMAL(10,2) NOT NULL DEFAULT 0.00 AFTER default_price',
  'SELECT 1'
);
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

UPDATE billing_service_catalog SET consultation_fee = 600.00 WHERE service_name = 'General Consultation' AND clinic_type = 'medical';
UPDATE billing_service_catalog SET consultation_fee = 400.00 WHERE service_name = 'Follow-up Consultation' AND clinic_type = 'medical';
UPDATE billing_service_catalog SET consultation_fee = 2500.00 WHERE service_name = 'Minor Excision' AND clinic_type = 'medical';
UPDATE billing_service_catalog SET consultation_fee = 4500.00 WHERE service_name = 'Circumcision' AND clinic_type = 'medical';
UPDATE billing_service_catalog SET consultation_fee = 3500.00 WHERE service_name = 'Other Surgical Procedure' AND clinic_type = 'medical';
UPDATE billing_service_catalog SET consultation_fee = 500.00 WHERE service_name = 'Routine Vaccine' AND clinic_type = 'medical';
UPDATE billing_service_catalog SET consultation_fee = 700.00 WHERE service_name = 'Travel Vaccine' AND clinic_type = 'medical';
UPDATE billing_service_catalog SET consultation_fee = 450.00 WHERE service_name = 'Seasonal Flu Vaccine' AND clinic_type = 'medical';
UPDATE billing_service_catalog SET consultation_fee = 800.00 WHERE service_name = 'Dermatology Consultation' AND clinic_type = 'derma';
UPDATE billing_service_catalog SET consultation_fee = 2500.00 WHERE service_name = 'Laser Rejuvenation' AND clinic_type = 'derma';
UPDATE billing_service_catalog SET consultation_fee = 4500.00 WHERE service_name = 'Laser Scar Treatment' AND clinic_type = 'derma';
UPDATE billing_service_catalog SET consultation_fee = 2500.00 WHERE service_name = 'IPL Anti-aging' AND clinic_type = 'derma';
UPDATE billing_service_catalog SET consultation_fee = 1800.00 WHERE service_name = 'IPL Hair Removal' AND clinic_type = 'derma';
UPDATE billing_service_catalog SET consultation_fee = 1200.00 WHERE service_name = 'Electrocautery' AND clinic_type = 'derma';
UPDATE billing_service_catalog SET consultation_fee = 1800.00 WHERE service_name = 'Chemical Peeling' AND clinic_type = 'derma';
UPDATE billing_service_catalog SET consultation_fee = 3000.00 WHERE service_name = 'Skin Biopsy' AND clinic_type = 'derma';
UPDATE billing_service_catalog SET consultation_fee = 900.00 WHERE service_name = 'Acupuncture Session' AND clinic_type = 'medical';
UPDATE billing_service_catalog SET consultation_fee = 1200.00 WHERE service_name = 'Pain Relief Treatment' AND clinic_type = 'medical';
UPDATE billing_service_catalog SET consultation_fee = 1200.00 WHERE service_name = 'Vertigo / Migraine Treatment' AND clinic_type = 'medical';
UPDATE billing_service_catalog SET consultation_fee = 1200.00 WHERE service_name = 'Insomnia Treatment' AND clinic_type = 'medical';
UPDATE billing_service_catalog SET consultation_fee = 1500.00 WHERE service_name = 'Smoking Cessation Treatment' AND clinic_type = 'medical';
UPDATE billing_service_catalog SET consultation_fee = 600.00 WHERE service_name = 'Pre-exposure Prophylaxis' AND clinic_type = 'medical';
UPDATE billing_service_catalog SET consultation_fee = 900.00 WHERE service_name = 'Post-exposure Treatment' AND clinic_type = 'medical';
UPDATE billing_service_catalog SET consultation_fee = 650.00 WHERE service_name = 'Rabies Vaccine' AND clinic_type = 'medical';
UPDATE billing_service_catalog SET consultation_fee = 900.00 WHERE service_name = 'Immunoglobulin' AND clinic_type = 'medical';
