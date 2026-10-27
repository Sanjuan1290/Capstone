-- Batch 4, forward-only additive migration. Run only after migration baseline reconciliation on TiDB staging.
-- Appointment date and selection date use Asia/Manila calendar dates. No existing rows are rewritten.
ALTER TABLE appointments
  ADD COLUMN promotion_id INT NULL,
  ADD COLUMN promotion_title_snapshot VARCHAR(120) NULL,
  ADD COLUMN promotion_terms_snapshot VARCHAR(1000) NULL,
  ADD COLUMN promotion_badge_snapshot VARCHAR(48) NULL,
  ADD COLUMN promotion_starts_on_snapshot DATE NULL,
  ADD COLUMN promotion_ends_on_snapshot DATE NULL,
  ADD COLUMN promotion_selected_for_service_id INT NULL,
  ADD COLUMN promotion_selected_at DATETIME NULL,
  ADD INDEX idx_appointments_selected_promotion (branch_id, promotion_id),
  ADD CONSTRAINT fk_appointments_selected_promotion FOREIGN KEY (promotion_id)
     REFERENCES clinic_promotions(id) ON DELETE SET NULL;
-- Do not drop these columns on rollback once any appointments have recorded a promotion.

-- Last cashier-reviewed outcome. Full revision history is maintained in audit_logs by updateBill.
-- An 'manual_discount_applied' outcome is permitted only when a real authorized discount
-- is successfully saved in the same bill-version update transaction.
ALTER TABLE billing_records
  ADD COLUMN promotion_review_outcome VARCHAR(40) NULL,
  ADD COLUMN promotion_review_note VARCHAR(255) NULL,
  ADD COLUMN promotion_review_by_role VARCHAR(20) NULL,
  ADD COLUMN promotion_review_by_user_id INT NULL,
  ADD COLUMN promotion_reviewed_bill_version INT NULL,
  ADD COLUMN promotion_reviewed_at DATETIME NULL;
