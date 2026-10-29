-- CARAIT: Preserve reschedule requests and reasons separately from original visit notes.
-- ADDITIVE SCHEMA ONLY. Run on a separate backed-up TiDB STAGING database first.
-- Review the READ_ONLY_PREFLIGHT script and SKIP any existing column.
-- Run ONE statement at a time. TiDB ALTER TABLE DDL is not an all-or-nothing transaction.
-- Requires matching code release; otherwise keep old API unchanged.

ALTER TABLE appointments ADD COLUMN reschedule_requested_at DATETIME NULL;
ALTER TABLE appointments ADD COLUMN reschedule_reason VARCHAR(120) NULL;
ALTER TABLE appointments ADD COLUMN reschedule_details VARCHAR(500) NULL;
ALTER TABLE appointments ADD COLUMN reschedule_previous_date DATE NULL;
ALTER TABLE appointments ADD COLUMN reschedule_previous_time VARCHAR(20) NULL;

-- Do not update/backfill old appointments: old freeform notes cannot safely identify
-- historical patient-initiated reschedule reasons.
-- Existing staff/admin confirmation behavior stays unchanged. Pending records with
-- reschedule_requested_at populated are shown as Reschedule Request until confirmed.
