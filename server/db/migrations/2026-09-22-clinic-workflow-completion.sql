-- CARAIT clinic workflow completion (2026-09-22)
-- Back up the database before applying this migration.

ALTER TABLE appointments
  ADD COLUMN requested_service_id INT NULL,
  ADD COLUMN requested_service_name_snapshot VARCHAR(180) NULL,
  ADD COLUMN requested_service_price_snapshot DECIMAL(10,2) NULL;

ALTER TABLE consultations
  ADD COLUMN version INT NOT NULL DEFAULT 1;

-- One clinical record per appointment. Verify/fix duplicate consultation rows
-- before running this statement on a database that did not originate from the
-- supplied CARAIT schema.
CREATE UNIQUE INDEX uniq_consultation_appointment ON consultations (appointment_id);

ALTER TABLE doctors
  ADD COLUMN clinic_type ENUM('medical','derma') NULL;
UPDATE doctors
SET clinic_type = CASE
  WHEN LOWER(COALESCE(specialty,'')) LIKE '%derm%' THEN 'derma'
  ELSE 'medical'
END
WHERE clinic_type IS NULL;
ALTER TABLE doctors MODIFY COLUMN clinic_type ENUM('medical','derma') NOT NULL;

ALTER TABLE queue
  ADD COLUMN called_at DATETIME NULL,
  ADD COLUMN consultation_started_at DATETIME NULL,
  ADD COLUMN completed_at DATETIME NULL;

-- The old in-progress queue value represented a patient that had been called.
-- Preserve truly-started consultations by checking the linked appointment.
ALTER TABLE queue MODIFY COLUMN status ENUM('waiting','called','in-progress','in_consultation','done','removed') NOT NULL DEFAULT 'waiting';
UPDATE queue q
LEFT JOIN appointments a ON a.id = q.appointment_id
SET q.status = CASE
  WHEN q.status='in-progress' AND a.status='in-progress' THEN 'in_consultation'
  WHEN q.status='in-progress' THEN 'called'
  ELSE q.status
END;
ALTER TABLE queue MODIFY COLUMN status ENUM('waiting','called','in_consultation','done','removed') NOT NULL DEFAULT 'waiting';

CREATE INDEX idx_queue_appointment ON queue (appointment_id);
CREATE INDEX idx_appointments_created_at ON appointments (created_at, id);
CREATE INDEX idx_appointments_requested_service ON appointments (requested_service_id);

ALTER TABLE appointments
  ADD CONSTRAINT fk_appointments_requested_service
  FOREIGN KEY (requested_service_id) REFERENCES billing_service_catalog(id)
  ON DELETE SET NULL;

ALTER TABLE queue
  ADD CONSTRAINT fk_queue_appointment
  FOREIGN KEY (appointment_id) REFERENCES appointments(id)
  ON DELETE SET NULL;
