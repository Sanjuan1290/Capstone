-- Additive / non-destructive. Requires the multi-branch foundation and patients table.
-- These marketing records never modify billing, patient history, or historical promotions.
CREATE TABLE IF NOT EXISTS clinic_announcements (
 id BIGINT NOT NULL AUTO_INCREMENT PRIMARY KEY,
 branch_id INT NOT NULL,
 promotion_id INT NULL,
 type ENUM('promotion','news','article') NOT NULL DEFAULT 'news',
 title VARCHAR(160) NOT NULL,
 slug VARCHAR(190) NOT NULL,
 caption VARCHAR(350) NOT NULL,
 body TEXT NOT NULL,
 cover_image_url VARCHAR(800) NULL,
 cover_image_asset_id VARCHAR(160) NULL,
 cta_label VARCHAR(60) NULL,
 cta_url VARCHAR(250) NULL,
 status ENUM('draft','scheduled','published','archived') NOT NULL DEFAULT 'draft',
 publish_at DATETIME NULL,
 expires_at DATETIME NULL,
 created_by_admin_id INT NULL,
 created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
 updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
 UNIQUE KEY uniq_announcement_branch_slug (branch_id,slug),
 KEY idx_announcement_public (status,publish_at,expires_at,branch_id),
 CONSTRAINT fk_announcement_branch FOREIGN KEY (branch_id) REFERENCES clinic_branches(id),
 CONSTRAINT fk_announcement_promotion FOREIGN KEY (promotion_id) REFERENCES clinic_promotions(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
CREATE TABLE IF NOT EXISTS marketing_campaigns (
 id BIGINT NOT NULL AUTO_INCREMENT PRIMARY KEY,
 announcement_id BIGINT NOT NULL,
 branch_id INT NOT NULL,
 status ENUM('draft','queued','sending','paused','completed','cancelled') NOT NULL DEFAULT 'draft',
 recipient_mode ENUM('all','random') NOT NULL DEFAULT 'random',
 requested_limit INT NOT NULL DEFAULT 500,
 recipient_total INT NOT NULL DEFAULT 0,
 scheduled_at DATETIME NULL,
 started_at DATETIME NULL,
 completed_at DATETIME NULL,
 created_by_admin_id INT NULL,
 created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
 updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
 KEY idx_campaign_worker (status,scheduled_at),
 CONSTRAINT fk_campaign_announcement FOREIGN KEY (announcement_id) REFERENCES clinic_announcements(id),
 CONSTRAINT fk_campaign_branch FOREIGN KEY (branch_id) REFERENCES clinic_branches(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
CREATE TABLE IF NOT EXISTS marketing_campaign_recipients (
 id BIGINT NOT NULL AUTO_INCREMENT PRIMARY KEY,
 campaign_id BIGINT NOT NULL,
 patient_id INT NOT NULL,
 status ENUM('pending','sending','sent','failed','suppressed','unknown') NOT NULL DEFAULT 'pending',
 attempts INT NOT NULL DEFAULT 0,
 provider_message_id VARCHAR(180) NULL,
 last_error VARCHAR(250) NULL,
 sent_at DATETIME NULL,
 claimed_at DATETIME NULL,
 created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
 UNIQUE KEY uniq_campaign_patient (campaign_id,patient_id),
 KEY idx_campaign_recipient_work (campaign_id,status,id),
 CONSTRAINT fk_campaign_recipient_campaign FOREIGN KEY (campaign_id) REFERENCES marketing_campaigns(id),
 CONSTRAINT fk_campaign_recipient_patient FOREIGN KEY (patient_id) REFERENCES patients(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
CREATE TABLE IF NOT EXISTS marketing_unsubscribes (
 patient_id INT NOT NULL PRIMARY KEY,
 reason VARCHAR(80) NOT NULL DEFAULT 'email_link',
 unsubscribed_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
 CONSTRAINT fk_marketing_unsubscribe_patient FOREIGN KEY (patient_id) REFERENCES patients(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
CREATE TABLE IF NOT EXISTS marketing_send_quota (
 bucket VARCHAR(10) NOT NULL,
 period_key VARCHAR(16) NOT NULL,
 reserved INT NOT NULL DEFAULT 0,
 PRIMARY KEY (bucket,period_key)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
