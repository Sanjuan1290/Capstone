-- Daily in-app stock reminders. Additive; safe to run again.
-- No inventory quantities, payments, existing notifications or migration history are changed.
CREATE TABLE IF NOT EXISTS inventory_daily_alert_deliveries (
  branch_id INT NOT NULL,
  alert_date DATE NOT NULL,
  target_role ENUM('admin','staff') NOT NULL,
  target_user_id INT NOT NULL,
  notification_id INT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (branch_id,alert_date,target_role,target_user_id),
  KEY idx_daily_stock_alert_notice (notification_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
