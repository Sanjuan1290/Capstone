# CARAIT — Batch 6 read-only demographic and discount audit

**Status:** Queries prepared and locally source-checked only. **No database queries executed** on CARAIT production or staging.

## Usage

With a dedicated **SELECT-only** database account pointed to an explicitly authorized environment:

```bash
cd server
CARAIT_ALLOW_READ_ONLY_AUDIT=true node scripts/auditPatientDataReadOnly.js
```

The script emits **aggregates** for patient birthdates and mismatched/null `gender` and `sex` values; it separately lists branch-specific discount preset configurations. It returns no named patient rows, record IDs, phone numbers, emails, medical records, or payment references. Don't publish the branch pricing report without authorization.

Before running, independently verify the DB target and SELECT-only permissions. The opt-in environment variable does not guarantee a safe database target or database privileges.

## Existing dependencies

- `patients.birthdate`: patient registration/profile updates, walk-in intake, clinical demographics.
- `patients.gender` and `patients.sex`: profile normalization and account settings write both; many doctor/appointment read models use `sex` while account settings use `COALESCE(gender, sex)`.
- `discount_presets`: scoped by `branch_id`, with independent approval/reference/active flags and percent-or-fixed discount values. Do not recreate a preset solely because a label differs between branches.
- Selected promotions and an actual cashiers' approved monetary discount remain separate concepts (Batch 4).

## Required follow-up

1. Review only **aggregate mismatches** first; resolve demographic definitions with the clinic before any patient-level corrections.
2. Have the clinic approve each branch's discount matrix before modifying financial configuration.
3. Prepare a synthetic/demo environment from privacy-safe fixtures, not from a lightly edited production backup. Any future sanitization command must be dry-run by default and explicitly reject non-disposable DB targets.
4. Retain the live dataset unchanged. No `DELETE`, `UPDATE`, `TRUNCATE`, or financial seeding belongs to this audit.


