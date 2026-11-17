-- Preserve clinical drafts independently of billing, and notes for each follow-up date.
ALTER TABLE consultations ADD COLUMN billable_services_json JSON NULL;
ALTER TABLE consultation_followups ADD COLUMN dates_json JSON NULL;
ALTER TABLE consultation_followup_revisions ADD COLUMN dates_json JSON NULL;
ALTER TABLE appointment_followup_links ADD COLUMN return_date DATE NULL;
-- Keep the date of existing bookings before a recommendation gains more dates.
UPDATE appointment_followup_links l
JOIN consultation_followups f ON f.id=l.followup_id
SET l.return_date=f.return_date
WHERE l.return_date IS NULL;
