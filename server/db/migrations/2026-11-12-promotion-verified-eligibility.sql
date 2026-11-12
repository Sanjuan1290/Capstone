-- Existing offers stay public; only newly selected verified-only offers require both channels.
ALTER TABLE clinic_promotions ADD COLUMN eligibility_type VARCHAR(24) NOT NULL DEFAULT 'all';
-- Snapshot the eligibility rule at booking so future promotion edits do not rewrite old terms.
ALTER TABLE appointments ADD COLUMN promotion_eligibility_snapshot VARCHAR(24) NOT NULL DEFAULT 'all';
