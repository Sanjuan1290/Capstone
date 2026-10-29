-- Staging only. ADDITIVE. Apply after checking information_schema and taking a backup.
-- NOT registered with the historical migration runner. All sends OFF by default.
CREATE TABLE IF NOT EXISTS branch_appointment_reminder_settings (
 branch_id INT NOT NULL PRIMARY KEY,
 enabled TINYINT(1) NOT NULL DEFAULT 0,
 lead_hours INT NOT NULL DEFAULT 3,
 email_enabled TINYINT(1) NOT NULL DEFAULT 1,
 sms_enabled TINYINT(1) NOT NULL DEFAULT 0,
 updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
 CONSTRAINT fk_reminder_settings_branch FOREIGN KEY (branch_id) REFERENCES clinic_branches(id) ON DELETE CASCADE
);
CREATE TABLE IF NOT EXISTS appointment_reminder_deliveries (
 id BIGINT NOT NULL AUTO_INCREMENT PRIMARY KEY,
 appointment_id INT NOT NULL,
 branch_id INT NOT NULL,
 schedule_date DATE NOT NULL,
 schedule_time VARCHAR(20) NOT NULL,
 reminder_kind VARCHAR(16) NOT NULL,
 channel VARCHAR(8) NOT NULL,
 event_key VARCHAR(190) NOT NULL,
 status VARCHAR(20) NOT NULL DEFAULT 'processing',
 actor_role VARCHAR(20) NULL,
 actor_id INT NULL,
 provider_message_id VARCHAR(150) NULL,
 error_code VARCHAR(90) NULL,
 created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
 completed_at DATETIME NULL,
 UNIQUE KEY uniq_reminder_event (event_key),
 KEY idx_reminder_appointment (appointment_id,created_at),
 KEY idx_reminder_branch (branch_id,created_at),
 CONSTRAINT fk_reminder_delivery_appointment FOREIGN KEY (appointment_id) REFERENCES appointments(id) ON DELETE CASCADE,
 CONSTRAINT fk_reminder_delivery_branch FOREIGN KEY (branch_id) REFERENCES clinic_branches(id) ON DELETE CASCADE
);
-- Before enabling in staging, verify appropriate patient consent and external provider TEST config.
