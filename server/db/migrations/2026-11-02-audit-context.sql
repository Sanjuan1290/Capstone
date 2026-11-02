-- Additive tracking context; historical data stays unchanged.
ALTER TABLE audit_logs ADD COLUMN outcome VARCHAR(16) NOT NULL DEFAULT 'success';
ALTER TABLE audit_logs ADD COLUMN actor_name_snapshot VARCHAR(180) NULL;
ALTER TABLE audit_logs ADD COLUMN target_name_snapshot VARCHAR(255) NULL;
ALTER TABLE audit_logs ADD COLUMN request_id VARCHAR(80) NULL;
ALTER TABLE audit_logs ADD COLUMN correlation_id VARCHAR(80) NULL;
ALTER TABLE audit_logs ADD COLUMN failure_reason_code VARCHAR(80) NULL;
