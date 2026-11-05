-- CARAIT 2026-11-05: branch-owned service promotion pricing.
-- Existing records keep discount_type=none; historical bookings remain unchanged.
ALTER TABLE clinic_promotions ADD COLUMN discount_type VARCHAR(12) NOT NULL DEFAULT 'none';
ALTER TABLE clinic_promotions ADD COLUMN discount_value DECIMAL(10,2) NOT NULL DEFAULT 0.00;
ALTER TABLE appointments ADD COLUMN promotion_discount_type_snapshot VARCHAR(12) DEFAULT NULL;
ALTER TABLE appointments ADD COLUMN promotion_discount_value_snapshot DECIMAL(10,2) DEFAULT NULL;
ALTER TABLE appointments ADD COLUMN promotion_discount_amount_snapshot DECIMAL(10,2) DEFAULT NULL;
ALTER TABLE billing_records ADD COLUMN promotion_discount_amount DECIMAL(10,2) NOT NULL DEFAULT 0.00;
