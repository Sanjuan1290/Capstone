# CARAIT — Batch 6 clinical approval checklist (not approved)

**Status:** Needs documented clinic approval. Batch 6 does not introduce, activate, or require prescription uploads.

The existing typed medicines, Prescribe/No Prescription decision, five consultation progress photos, and finalized-record amendment workflow remain unchanged.

Before proposing any new prescription document endpoints or migrations, the clinic must decide and record:

1. Should signed handwritten prescription scans be optional, mandatory, or unavailable? Will typed prescription entry remain supported?
2. Which formats and size limits are acceptable (JPEG/PNG, optionally PDF after scanner and viewer validation)?
3. Who may upload while the consultation is in draft, and who may add a post-finalization amendment?
4. Which authorized roles, including the patient, may view/download/print, and under what clinical purpose?
5. How will signature/authenticity, rejected uploads, retention, replacement and superseded versions be handled?
6. Can the existing Cloudinary upload pipeline provide **private**, expiring, authenticated media access? Public `secure_url` is not sufficient evidence of privacy.
7. What infant/guardian consent and identification rule will apply to newborn patients? This batch deliberately does **not** block infant registration.
8. Does the clinic intentionally distinguish `gender` and `sex` or are they duplicate legacy fields? Neither database column will be removed automatically.

**Non-negotiable implementation rules if approved:** separate prescription attachments from `consultation_images` (which are replaced during image synchronization); preserve typed medicines; enforce server-side treating doctor/branch/patient ownership; use a dedicated scanner-token context; append amendments after finalization; audit all access; use additive, forward-compatible migrations only.

No clinic decisions were inferred from the submitted testing screenshot.
