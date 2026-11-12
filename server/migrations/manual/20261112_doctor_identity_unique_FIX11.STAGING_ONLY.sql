-- FIX 11: Doctor identity uniqueness (STAGING FIRST).
-- Stop before ALTER if any of the following read-only checks return rows.
-- Correct the real licenses using source-verified information; never invent PRC numbers.
-- Inactive doctors and doctors shared between branches count as the same person.
-- Existing email already has UNIQUE KEY `email`.
SELECT LOWER(TRIM(email)) AS normalized_email, COUNT(*) AS records, GROUP_CONCAT(id ORDER BY id) AS doctor_ids
  FROM doctors GROUP BY LOWER(TRIM(email)) HAVING COUNT(*) > 1;
SELECT phone AS stored_phone, COUNT(*) AS records, GROUP_CONCAT(id ORDER BY id) AS doctor_ids
  FROM doctors GROUP BY phone HAVING COUNT(*) > 1;
SELECT UPPER(TRIM(prc_license)) AS normalized_prc, COUNT(*) AS records, GROUP_CONCAT(id ORDER BY id) AS doctor_ids
  FROM doctors WHERE prc_license IS NOT NULL AND TRIM(prc_license) <> ''
  GROUP BY UPPER(TRIM(prc_license)) HAVING COUNT(*) > 1;
SELECT id, full_name FROM doctors WHERE prc_license IS NULL OR TRIM(prc_license) = '';

-- Execute ONLY after reviewing the above results and normalizing historical phone
-- formatting, emails, and PRC licenses in a separate verified data-cleanup step.
-- Adding an index will fail safely if duplicate non-NULL values still exist.
ALTER TABLE doctors ADD UNIQUE KEY uniq_doctors_phone (phone);
ALTER TABLE doctors ADD UNIQUE KEY uniq_doctors_prc_license (prc_license);
-- Maintain PRC as nullable for old legacy accounts; new create/edit requests require it.
