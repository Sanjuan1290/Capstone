-- Global Super Admin settings. Email defaults on; SMS defaults off (paid provider).
-- No existing appointment, patient, or inventory data is changed.
CREATE TABLE IF NOT EXISTS system_doctor_confirmation_notifications (
  id TINYINT NOT NULL PRIMARY KEY,
  send_email TINYINT(1) NOT NULL DEFAULT 1,
  send_sms TINYINT(1) NOT NULL DEFAULT 0,
  updated_by_admin_id INT NULL,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
INSERT IGNORE INTO system_doctor_confirmation_notifications (id, send_email, send_sms) VALUES (1, 1, 0);
