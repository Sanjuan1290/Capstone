-- CARAIT Clinic security hardening batches 7-12 (MySQL 8.0, run once).
-- For partially migrated databases, prefer `npm run migrate`, which is idempotent.

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
WHERE a.status = 'completed' AND (c.status IS NULL OR c.status = '' OR c.status = 'draft');

CREATE TABLE consultation_amendments (
  id BIGINT AUTO_INCREMENT PRIMARY KEY,
  consultation_id INT NOT NULL,
  doctor_id INT NOT NULL,
  reason VARCHAR(255) NOT NULL,
  amendment_text TEXT NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_consultation_amendments_consultation (consultation_id, created_at),
  CONSTRAINT fk_consultation_amendment_consultation FOREIGN KEY (consultation_id) REFERENCES consultations(id) ON DELETE CASCADE,
  CONSTRAINT fk_consultation_amendment_doctor FOREIGN KEY (doctor_id) REFERENCES doctors(id) ON DELETE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

ALTER TABLE supply_requests ADD COLUMN destination_location_id INT NULL;

UPDATE supply_requests sr
JOIN inventory_locations il ON il.name = sr.destination_location
SET sr.destination_location_id = il.id
WHERE sr.destination_location_id IS NULL;

ALTER TABLE supply_requests
  ADD INDEX idx_supply_request_destination_location (destination_location_id),
  ADD CONSTRAINT fk_supply_request_destination_location
    FOREIGN KEY (destination_location_id) REFERENCES inventory_locations(id) ON DELETE SET NULL;

ALTER TABLE billing_payments ADD COLUMN idempotency_key VARCHAR(100) NULL;
CREATE UNIQUE INDEX uniq_billing_payment_idempotency ON billing_payments (idempotency_key);

ALTER TABLE cashier_closings ADD COLUMN is_locked TINYINT(1) NOT NULL DEFAULT 1;

CREATE INDEX idx_appointments_doctor_date_time_status ON appointments (doctor_id, appointment_date, appointment_time, status);
CREATE INDEX idx_appointments_patient_doctor_status ON appointments (patient_id, doctor_id, status);
CREATE INDEX idx_consultations_doctor_patient ON consultations (doctor_id, patient_id, status);
CREATE INDEX idx_inventory_batches_item_expiry ON inventory_batches (inventory_id, expiration_date, quantity);
CREATE INDEX idx_audit_action_created ON audit_logs (action, created_at);
