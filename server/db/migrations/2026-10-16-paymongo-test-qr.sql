-- CARAIT TEST QR Ph ledger. No destructive operations. Run against backed-up DB.
-- Payment attempt is owned by a physical branch and immutable confirmed bill amount.
CREATE TABLE IF NOT EXISTS payment_gateway_attempts (
 id BIGINT AUTO_INCREMENT PRIMARY KEY,
 branch_id INT NOT NULL,
 billing_id INT NOT NULL,
 bill_version INT NOT NULL,
 amount_centavos BIGINT NOT NULL,
 currency CHAR(3) NOT NULL DEFAULT 'PHP',
 provider VARCHAR(20) NOT NULL DEFAULT 'paymongo',
 mode VARCHAR(10) NOT NULL DEFAULT 'test',
 status VARCHAR(20) NOT NULL DEFAULT 'creating',
 active_bill_id INT NULL,
 payment_intent_id VARCHAR(120) NULL,
 provider_payment_id VARCHAR(120) NULL,
 qr_image LONGTEXT NULL,
 test_url VARCHAR(1000) NULL,
 expires_at DATETIME NULL,
 error_code VARCHAR(60) NULL,
 created_by_role VARCHAR(20) NOT NULL,
 created_by_id INT NOT NULL,
 settled_payment_id INT NULL,
 created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
 updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
 UNIQUE KEY uq_paymongo_active_bill (active_bill_id),
 UNIQUE KEY uq_paymongo_intent (payment_intent_id),
 UNIQUE KEY uq_paymongo_payment (provider_payment_id),
 KEY idx_paymongo_attempt_branch_bill (branch_id,billing_id,created_at),
 CONSTRAINT fk_paymongo_attempt_bill FOREIGN KEY(billing_id) REFERENCES billing_records(id) ON DELETE RESTRICT,
 CONSTRAINT fk_paymongo_attempt_branch FOREIGN KEY(branch_id) REFERENCES clinic_branches(id) ON DELETE RESTRICT,
 CONSTRAINT fk_paymongo_attempt_paid FOREIGN KEY(settled_payment_id) REFERENCES billing_payments(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
CREATE TABLE IF NOT EXISTS payment_gateway_webhook_events (
 event_id VARCHAR(120) NOT NULL PRIMARY KEY,
 provider VARCHAR(20) NOT NULL DEFAULT 'paymongo',
 attempt_id BIGINT NULL,
 event_type VARCHAR(80) NOT NULL,
 status VARCHAR(20) NOT NULL DEFAULT 'received',
 error_code VARCHAR(100) NULL,
 created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
 processed_at TIMESTAMP NULL,
 KEY idx_paymongo_webhook_attempt (attempt_id),
 CONSTRAINT fk_paymongo_webhook_attempt FOREIGN KEY(attempt_id) REFERENCES payment_gateway_attempts(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
