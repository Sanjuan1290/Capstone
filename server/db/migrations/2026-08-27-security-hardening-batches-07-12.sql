-- CARAIT Clinic security hardening batches 7-12
-- Run once in MySQL 8+, then start the application with RUN_SCHEMA_MIGRATIONS_ON_STARTUP=false.

ALTER TABLE consultations ADD COLUMN IF NOT EXISTS status VARCHAR(20) NOT NULL DEFAULT 'draft';
ALTER TABLE consultations ADD COLUMN IF NOT EXISTS finalized_at DATETIME NULL;
ALTER TABLE consultations ADD COLUMN IF NOT EXISTS finalized_by_doctor_id INT NULL;
ALTER TABLE consultations ADD COLUMN IF NOT EXISTS updated_at DATETIME NULL;

UPDATE consultations c
JOIN appointments a ON a.id = c.appointment_id
SET c.status = 'finalized',
    c.finalized_at = COALESCE(c.finalized_at, c.consulted_at),
    c.finalized_by_doctor_id = COALESCE(c.finalized_by_doctor_id, c.doctor_id)
WHERE a.status = 'completed' AND (c.status IS NULL OR c.status = '' OR c.status = 'draft');

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
);

ALTER TABLE inventory_locations ADD COLUMN IF NOT EXISTS is_active TINYINT(1) NOT NULL DEFAULT 1;
ALTER TABLE supply_requests ADD COLUMN IF NOT EXISTS destination_location_id INT NULL;

UPDATE supply_requests sr
JOIN inventory_locations il ON il.name = sr.destination_location
SET sr.destination_location_id = il.id
WHERE sr.destination_location_id IS NULL;

-- These two ALTERs are intentionally written as one-time migration statements.
-- If your schema already contains either key, skip that statement when importing manually.
ALTER TABLE supply_requests ADD INDEX idx_supply_request_destination_location (destination_location_id);
ALTER TABLE supply_requests ADD CONSTRAINT fk_supply_request_destination_location
  FOREIGN KEY (destination_location_id) REFERENCES inventory_locations(id) ON DELETE SET NULL;

-- Recommended integrity indexes/constraints. Existing duplicate data must be resolved before applying.
CREATE UNIQUE INDEX uniq_billing_payment_idempotency ON billing_payments (idempotency_key);
CREATE INDEX idx_appointments_doctor_date_time_status ON appointments (doctor_id, appointment_date, appointment_time, status);
CREATE INDEX idx_appointments_patient_doctor_status ON appointments (patient_id, doctor_id, status);
CREATE INDEX idx_consultations_doctor_patient ON consultations (doctor_id, patient_id, status);
CREATE INDEX idx_inventory_batches_item_expiry ON inventory_batches (inventory_id, expiration_date, quantity);
CREATE INDEX idx_audit_action_created ON audit_logs (action, created_at);
