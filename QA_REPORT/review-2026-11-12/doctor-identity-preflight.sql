-- Read-only. The phone index was verified as an exact UNIQUE(phone) index.
-- These statements never change doctors, licenses, indexes or migration history.
SELECT INDEX_NAME, NON_UNIQUE, SEQ_IN_INDEX, COLUMN_NAME, SUB_PART
FROM information_schema.STATISTICS
WHERE TABLE_SCHEMA='carait_clinic_system' AND TABLE_NAME='doctors'
ORDER BY INDEX_NAME, SEQ_IN_INDEX;

-- Correct only from verified real doctor records. Do not fabricate license IDs.
SELECT id, full_name, prc_license
FROM carait_clinic_system.doctors
WHERE UPPER(TRIM(prc_license)) IN (
  SELECT UPPER(TRIM(prc_license))
  FROM carait_clinic_system.doctors
  WHERE prc_license IS NOT NULL AND TRIM(prc_license)<>''
  GROUP BY UPPER(TRIM(prc_license)) HAVING COUNT(*)>1
)
ORDER BY UPPER(TRIM(prc_license)), id;

SELECT UPPER(TRIM(prc_license)) AS normalized_prc, COUNT(*) AS records,
       GROUP_CONCAT(id ORDER BY id) AS doctor_ids
FROM carait_clinic_system.doctors
WHERE prc_license IS NOT NULL AND TRIM(prc_license)<>''
GROUP BY UPPER(TRIM(prc_license)) HAVING COUNT(*)>1;

SELECT id, full_name
FROM carait_clinic_system.doctors
WHERE prc_license IS NULL OR TRIM(prc_license)='';
