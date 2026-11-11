-- One shared per-number limit for patient registration and resend.
-- Only a keyed hash is stored, not the telephone number.
CREATE TABLE IF NOT EXISTS registration_sms_limits (
  phone_hash CHAR(64) NOT NULL PRIMARY KEY,
  window_start DATETIME NOT NULL,
  send_count INT NOT NULL DEFAULT 0,
  last_sent_at DATETIME NULL,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
