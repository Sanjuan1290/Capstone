-- One record per real external Stock In receipt. Case-insensitive collation
-- prevents a repeat upload from creating duplicate batch receipts.
CREATE TABLE IF NOT EXISTS inventory_excel_receipts (
  id BIGINT NOT NULL AUTO_INCREMENT PRIMARY KEY,
  branch_id INT NOT NULL,
  receipt_reference VARCHAR(80) CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci NOT NULL,
  inventory_id INT NOT NULL,
  batch_id INT DEFAULT NULL,
  created_by_admin_id INT DEFAULT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY uq_branch_excel_receipt (branch_id,receipt_reference),
  KEY idx_excel_receipt_item (branch_id,inventory_id)
);
