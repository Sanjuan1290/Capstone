-- NOT READY TO RUN: the read-only check found one duplicate normalized PRC group.
-- Execute only after source-verified corrections and a zero-row duplicate check.
-- uniq_doctors_phone already exists correctly; there is no phone ALTER here.
-- TiDB supports CREATE UNIQUE INDEX IF NOT EXISTS. It does not repair duplicates
-- or verify the definition of an existing index with the same name.
-- This file changes only the index, never doctor records or financial data.
CREATE UNIQUE INDEX IF NOT EXISTS uniq_doctors_prc_license
ON carait_clinic_system.doctors (prc_license);
