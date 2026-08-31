-- Deployment readiness upgrade for the supplied 2026-08-26 schema.
-- Run once on that exact schema. For unknown/partially migrated installations, prefer `npm run migrate`.

-- ============================================================================
-- FINAL DEPLOYMENT READINESS UPGRADE — 2026-08-31
-- Brings the supplied 2026-08-26 database dump in sync with the current server.
-- This section is intentionally written for the supplied dump and runs once
-- during a fresh import of wholedatabase.sql.
-- ============================================================================

SET FOREIGN_KEY_CHECKS = 0;

-- Session revocation / forced first-login password changes / patient onboarding.
ALTER TABLE admins
  ADD COLUMN session_version INT NOT NULL DEFAULT 1;

ALTER TABLE staff
  ADD COLUMN must_change_password TINYINT(1) NOT NULL DEFAULT 0,
  ADD COLUMN password_changed_at DATETIME NULL,
  ADD COLUMN session_version INT NOT NULL DEFAULT 1;

ALTER TABLE doctors
  ADD COLUMN must_change_password TINYINT(1) NOT NULL DEFAULT 0,
  ADD COLUMN password_changed_at DATETIME NULL,
  ADD COLUMN session_version INT NOT NULL DEFAULT 1;

ALTER TABLE patients
  ADD COLUMN onboarding_completed_at DATETIME NULL,
  ADD COLUMN session_version INT NOT NULL DEFAULT 1;

-- Finalized clinical records and append-only amendments.
ALTER TABLE consultations
  ADD COLUMN status VARCHAR(20) NOT NULL DEFAULT 'draft',
  ADD COLUMN finalized_at DATETIME NULL,
  ADD COLUMN finalized_by_doctor_id INT NULL,
  ADD COLUMN updated_at DATETIME NULL;

UPDATE consultations c
JOIN appointments a ON a.id = c.appointment_id
SET c.status = 'finalized',
    c.finalized_at = COALESCE(c.finalized_at, c.consulted_at),
    c.finalized_by_doctor_id = COALESCE(c.finalized_by_doctor_id, c.doctor_id)
WHERE a.status = 'completed'
  AND (c.status IS NULL OR c.status = '' OR c.status = 'draft');

CREATE TABLE consultation_amendments (
  id BIGINT AUTO_INCREMENT PRIMARY KEY,
  consultation_id INT NOT NULL,
  doctor_id INT NOT NULL,
  reason VARCHAR(255) NOT NULL,
  amendment_text TEXT NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_consultation_amendments_consultation (consultation_id, created_at),
  CONSTRAINT fk_consultation_amendment_consultation
    FOREIGN KEY (consultation_id) REFERENCES consultations(id) ON DELETE CASCADE,
  CONSTRAINT fk_consultation_amendment_doctor
    FOREIGN KEY (doctor_id) REFERENCES doctors(id) ON DELETE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

-- Account verification codes. Codes are stored as hashes, not plaintext.
CREATE TABLE account_security_codes (
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
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

ALTER TABLE patient_phone_verifications
  ADD COLUMN attempt_count INT NOT NULL DEFAULT 0,
  ADD COLUMN last_sent_at DATETIME NULL;

ALTER TABLE password_resets
  ADD COLUMN attempt_count INT NOT NULL DEFAULT 0,
  ADD COLUMN last_sent_at DATETIME NULL,
  ADD COLUMN verified_at DATETIME NULL;

-- Supply request destinations are now normalized to inventory_locations.
ALTER TABLE supply_requests
  ADD COLUMN destination_location_id INT NULL;

UPDATE supply_requests sr
JOIN inventory_locations il ON il.name = sr.destination_location
SET sr.destination_location_id = il.id
WHERE sr.destination_location_id IS NULL;

ALTER TABLE supply_requests
  ADD INDEX idx_supply_request_destination_location (destination_location_id),
  ADD CONSTRAINT fk_supply_request_destination_location
    FOREIGN KEY (destination_location_id) REFERENCES inventory_locations(id) ON DELETE SET NULL;

-- Payment idempotency prevents duplicate payment records from retries/double-clicks.
ALTER TABLE billing_payments
  ADD COLUMN idempotency_key VARCHAR(100) NULL;

CREATE UNIQUE INDEX uniq_billing_payment_idempotency
  ON billing_payments (idempotency_key);

-- Cashier closing now acts as a real lock until an administrator reopens it.
ALTER TABLE cashier_closings
  ADD COLUMN is_locked TINYINT(1) NOT NULL DEFAULT 1;

-- Staff-to-admin discount/price approval workflow.
CREATE TABLE billing_adjustment_requests (
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
  CONSTRAINT fk_billing_adjustment_bill
    FOREIGN KEY (billing_id) REFERENCES billing_records(id) ON DELETE CASCADE,
  CONSTRAINT fk_billing_adjustment_staff
    FOREIGN KEY (staff_id) REFERENCES staff(id) ON DELETE RESTRICT,
  CONSTRAINT fk_billing_adjustment_admin
    FOREIGN KEY (resolved_by_admin_id) REFERENCES admins(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

-- Query-performance / integrity indexes required by current workflows.
CREATE INDEX idx_appointments_doctor_date_time_status
  ON appointments (doctor_id, appointment_date, appointment_time, status);
CREATE INDEX idx_appointments_patient_doctor_status
  ON appointments (patient_id, doctor_id, status);
CREATE INDEX idx_consultations_doctor_patient
  ON consultations (doctor_id, patient_id, status);
CREATE INDEX idx_inventory_batches_item_expiry
  ON inventory_batches (inventory_id, expiration_date, quantity);
CREATE INDEX idx_audit_action_created
  ON audit_logs (action, created_at);

-- Make the new local clinic logo the current public-site logo.
UPDATE landing_page_content
SET content = JSON_SET(content, '$.header.logo_url', '/logo.png')
WHERE id = 1;

SET FOREIGN_KEY_CHECKS = 1;

-- End of final deployment readiness upgrade.
