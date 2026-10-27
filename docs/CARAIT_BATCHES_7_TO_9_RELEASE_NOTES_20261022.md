# CARAIT — Batches 7–9 Source Implementation & QA Handoff

**Date:** 22 October 2026 (Philippines)  
**Source:** `AllCodes(20261022-082938).txt` **with** the previously prepared `CARAIT_BATCHES_1_TO_6_CUMULATIVE_20261022.zip` applied locally.  
**Status:** Source changes prepared and focused tests passed. **Not deployed and not yet verified against TiDB, Render, Cloudflare, or real devices.**

## Which patch should you apply?

Use exactly **one** path:

1. **Batches 1–6 are already incorporated into the matching repository revision:** apply `CARAIT_BATCHES_7_TO_9_20261022.patch`, or copy the source entries from its matching ZIP, in a fresh review branch.
2. **The repository still matches the exact October 22 original source export:** apply `CARAIT_BATCHES_1_TO_9_CUMULATIVE_20261022.patch` instead. This includes the earlier Batches 1–6; do **not** then apply the 7–9 patch.
3. **The actual Git HEAD differs from either source snapshot:** first compare the code, resolve conflicts deliberately and rerun tests. **Do not force-apply a patch or overwrite a newer module.**

Each generated Git patch was tested with `git apply --check` against the corresponding reconstructed source snapshot. The ZIP contains changed/new source files; it is **not** a standalone replacement for the repository or original image assets.

## Batch 7 — Promotions, secure images, patient offers

- Adds optional `image_url`, `image_asset_id`, and `featured_order` to the existing `clinic_promotions` table through idempotent `ensureAppSchema` changes.
- Adds secure branch-owned `/promotions/image` and `/promotions/image/status` endpoints using Cloudinary and Perception Point moderation, isolated from the Announcement upload signing context. The promotion save endpoint refuses a new arbitrary image URL without an approved, matching security token.
- Adds upload, scan-status verification, preview, removal, featured ordering, improved promotion cards and administrator status information. The separate Announcements/marketing-consent workflow remains unchanged.
- Adds a maximum-three, manual-scroll Patient Dashboard offers carousel plus `/patient/offers` for the full active offer list. Provides branded fallback without an image.
- The server uses branch-owned active services, current dates, active branches and selected-branch predicates. Promotion content still **does not modify billing prices or create a discount.**

**Migration:** Prefer the existing `server` schema reconciler (`npm run migrate`) on an isolated **staging** database after reviewing its entire migration plan. Alternatively, `server/db/migrations/2026-10-22-batch7-promotion-images.MANUAL.sql` is an **optional manual** script for a database missing all three columns. It is **not idempotent** and must never run against columns that already exist. Take a backup and check `information_schema.columns` first. Historical promotions/notifications remain intact.

**Media prerequisites:** Cloudinary server credentials and a functioning `perception_point` moderation capability. An upload is *not* considered approved until the server verifies its scan result. Real provider delivery remains **untested** here.

## Batch 8 — Shared SSE and event foundation

- Preserves existing cookie-authenticated, branch-scoped SSE audiences. A new `clinicEvents.js` emits minimal invalidation metadata (event name, branch ID and optional record ID), not personal medical or payment content.
- Adds a post-success mutation event helper: HTTP 4xx/5xx responses do not broadcast successful changes.
- Maps legacy events (`appointment_updated`, `billing_paid`, `inventory_updated`, etc.) to canonical topics without breaking the existing role callbacks.
- Client SSE reconnects with capped exponential backoff, revalidates after reconnect, and invalidates related React Query keys. Subscriptions are cleaned up on unmount/logout.
- A new `useClinicRefresh` hook coalesces rapid events, prevents concurrent refetches, filters events to the Super Admin's selected branch, revalidates on tab focus, and optionally uses a bounded fallback interval.
- This is a **single-instance compatible** SSE design: replay across multiple Render instances is not guaranteed without a shared broker/event log. Live event delivery in the real hosting topology is untested.

**Patient-facing refresh limitation:** There is deliberately no all-patients SSE audience for promotions or doctor schedule changes. Those screens revalidate on focus and on bounded intervals; private patient events remain patient-specific. This avoids exposing one patient's data to others. Do not describe such screens as guaranteed instant push updates.

## Batch 9 — Module-level adoption

- Adds refresh/revalidation to: inventory, System Setup, promotion management, announcements, Doctor Availability, Doctor Schedule, Doctor Schedules administration, Patient Dashboard, Patient Offers, My Appointments, booking promotion content, staff/doctor accounts, transactions, Daily Cash Reconciliation, reports, and audit logs.
- Schedules and account writes, branch clinic/system settings, service catalog writes, inventory master/stock actions, and promotion writes now produce branch-scoped cache-change events after successful responses.
- Existing Appointment, queue, billing/PayMongo and cashier broadcasts continue to be consumed; their underlying financial/clinical state-machine behavior is **not modified**.
- Forms that might have unsaved data delay their own background refresh when an editor/modal is open. The hook refreshes data rather than remounting components.
- Existing pages that already have their own `clinic:refresh` listeners keep them. This batch does not certify that every workflow in the entire application is fully synchronized end-to-end.

## Source-level verification performed

| Check | Outcome |
|---|---|
| Frontend Node regression suite | **66 / 66 PASS** |
| Focused marketing, promotions, and event Node tests | **27 / 27 PASS** |
| Source graph | **430 files and 1,062 relative imports resolved** |
| JavaScript/JSX parser | **178 frontend files, 0 syntax errors** |
| Full server Node suite | **241 PASS, 12 FAIL (not a clean pass)** |
| Git patch clean application | **Both baseline-specific patches pass `git apply --check`** |
| React/Vite production build & ESLint | **NOT RUN:** npm dependencies absent in reconstructed environment |
| Cloudinary Perception Point scan and upload | **NOT TESTED** against actual provider |
| TiDB staging migration/API/browser test | **NOT TESTED** |
| Physical mobile/carousel/accessibility testing | **NOT TESTED** |
| SSE across two production browser sessions / Render restarts | **NOT TESTED** |
| Live payment/email/SMS | **NOT TOUCHED or TESTED** |

**Full backend suite blockers:** missing `mysql2/promise` and other installed/runtime test dependencies; a historical October 9 migration checksum mismatch inherited from the flattened export; older regression assertions for preexisting login-route wrappers and updated Dashboard wording; and local hosting/schema test fixture dependencies. Do not interpret 241/253 as a deployment pass. The marketing test harness was updated to mock the newly added event dependency and now passes.

## Staging release gates — required before deployment

1. Verify the real Git revision and apply only the correct patch in a review branch. Review every file and compare against any later fixes.
2. Restore a disposable TiDB database and validate schema/migration behavior on representative existing branches and promotions; **never run manual `ADD COLUMN` SQL if the columns already exist**.
3. Install dependencies, then run `npm run verify:source`, `npm run test:node`, `npm run test`/Vitest where configured, frontend `npm run lint`, `npm run build`, and client Node tests. Resolve **all** new and release-blocking regressions.
4. Test real approved/rejected/pending promotional images with Cloudinary moderation, including replacing/removing an image and an expired offer.
5. Use two branches and at least Patient, Branch Admin, Super Admin, Doctor and Staff staging accounts. Test creation/editing and availability while another authorized session is open; verify no cross-branch event payloads or cached data.
6. Disconnect/reconnect browsers, switch branches, open unsaved forms, and ensure updates recover without data loss or duplicate requests. Test long-lived Render/Cloudflare proxy behavior and tab resume.
7. Confirm that promotions **never** change checkout totals; verify billing, refunds/voids, receipt uniqueness, cashier cash totals and PayMongo TEST idempotency using existing financial QA gates.
8. Use a controlled deployment window: back up → stage migration → backend → frontend → authenticated smoke checks → review logs. Preserve rollback path and backup. Do not enable LIVE payments as part of these batches.

## Implementation safety notes

- No production database, GitHub, Render, Cloudflare, Cloudinary account or PayMongo account was modified by this work.
- Existing invoices, medical records, inventory movements, patient accounts and audit history are retained.
- The server still determines actual doctor/bookable slot status, inventory balance and payment settlement; client-side update events never claim a payment or booking succeeded.
- The October 22 source export and previously prepared local patches are **not proof** of what is currently deployed to `caraitclinic.com`.


