-- Apply on a backed-up staging database BEFORE deploying the new server.
-- This migration is additive and safe to run again. It does not enqueue
-- existing historical posts or automatically resend previous promotions.
CREATE TABLE IF NOT EXISTS clinic_publication_notification_jobs (
  id BIGINT NOT NULL AUTO_INCREMENT,
  kind ENUM('promotion','announcement') NOT NULL,
  entity_id BIGINT NOT NULL,
  branch_id INT NOT NULL,
  status ENUM('pending','sending','completed') NOT NULL DEFAULT 'pending',
  claimed_at DATETIME NULL,
  completed_at DATETIME NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uniq_publication_event (kind,entity_id),
  KEY idx_publication_worker (status,claimed_at,id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS clinic_announcement_notifications (
  announcement_id BIGINT NOT NULL,
  patient_id INT NOT NULL,
  notified_at DATETIME NULL,
  PRIMARY KEY (announcement_id,patient_id),
  CONSTRAINT fk_announcement_notice_post FOREIGN KEY (announcement_id) REFERENCES clinic_announcements(id) ON DELETE CASCADE,
  CONSTRAINT fk_announcement_notice_patient FOREIGN KEY (patient_id) REFERENCES patients(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
