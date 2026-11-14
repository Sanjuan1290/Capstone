-- Recommendations only. No appointment, queue, payment or notification is created.
CREATE TABLE IF NOT EXISTS consultation_followups (
 id INT NOT NULL AUTO_INCREMENT PRIMARY KEY,
 consultation_id INT NOT NULL,
 appointment_id INT NOT NULL,
 doctor_id INT NOT NULL,
 patient_id INT NOT NULL,
 branch_id INT NOT NULL,
 return_date DATE NULL,
 doctor_note TEXT NULL,
 status VARCHAR(16) NOT NULL DEFAULT 'active',
 version INT NOT NULL DEFAULT 1,
 created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
 updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
 UNIQUE KEY uniq_followup_consultation (consultation_id),
 KEY idx_followup_patient (patient_id,status,return_date),
 KEY idx_followup_doctor_branch (doctor_id,branch_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
CREATE TABLE IF NOT EXISTS consultation_followup_revisions (
 id INT NOT NULL AUTO_INCREMENT PRIMARY KEY,
 followup_id INT NOT NULL,
 version INT NOT NULL,
 return_date DATE NULL,
 doctor_note TEXT NULL,
 status VARCHAR(16) NOT NULL,
 changed_by_doctor_id INT NOT NULL,
 created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
 UNIQUE KEY uniq_followup_revision (followup_id,version)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
CREATE TABLE IF NOT EXISTS appointment_followup_links (
 appointment_id INT NOT NULL PRIMARY KEY,
 followup_id INT NOT NULL,
 created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
 KEY idx_appointment_followup (followup_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
