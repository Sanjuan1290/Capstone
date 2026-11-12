-- REVIEW AND RUN ON A STAGING CLONE AFTER A BACKUP. Do not apply automatically.
-- Keeping legacy civil_status column preserves old records while the UI no longer asks for it.
ALTER TABLE patients
  MODIFY COLUMN phone varchar(20) NULL,
  MODIFY COLUMN password varchar(255) NULL,
  ADD COLUMN reported_age tinyint unsigned NULL;

ALTER TABLE appointments
  ADD COLUMN patient_age_at_visit tinyint unsigned NULL;

CREATE TABLE IF NOT EXISTS guest_booking_access (
  id bigint NOT NULL AUTO_INCREMENT PRIMARY KEY,
  appointment_id int NOT NULL,
  token_hash char(64) NOT NULL,
  expires_at datetime NOT NULL,
  created_at timestamp DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY uniq_guest_appointment (appointment_id),
  UNIQUE KEY uniq_guest_token (token_hash),
  CONSTRAINT fk_guest_booking_appointment FOREIGN KEY (appointment_id) REFERENCES appointments(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS branch_queue_display_security (
  branch_id int NOT NULL PRIMARY KEY,
  pin_hash varchar(120) NOT NULL,
  pin_version int NOT NULL DEFAULT 1,
  updated_by_admin_id int NOT NULL,
  updated_at datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_queue_pin_branch FOREIGN KEY (branch_id) REFERENCES clinic_branches(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
