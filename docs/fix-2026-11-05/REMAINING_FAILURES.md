# Remaining baseline failures

The final full suites are not green. Every remaining Node failure name also occurs on unmodified `HEAD`, tested from a separate archive with the same installed dependencies. These failures are not presented as passes.

| Suite | Before | After |
| --- | --- | --- |
| Client Node | 309 passed / 10 failed | 318 passed / 9 failed |
| Server Node | 532 passed / 35 failed | 574 passed / 33 failed |
| Server Vitest | 260 passed / 3 failed | 262 passed / 1 failed |
| Full client ESLint | 10 errors / 21 warnings | 9 errors / 21 warnings |

The baseline archive is `%TEMP%/carait-fix-baseline-20261105`. The authoritative clean client baseline is `evidence/client-clean-baseline.log`; `client-baseline.log` is an earlier intermediate run with five temporary missing-import fixture errors and must not be used as the final baseline. Existing layout/source tests were moved to the shared components, obsolete four-tab/Doctor-approval expectations were updated to the requested behavior, and Windows fixture resolution was repaired. Valid money, inventory, branch, gateway and migration-history assertions were retained.

## Client Node: 9 failures

- AuthContext preserves a session on unavailable checks and revalidates on tab return
- patient guards show a retry state instead of redirecting on an unavailable auth check
- featured offers preserve selected promotion while providing bounded scroll controls
- unapproved catalog prices and placeholders are not presented as public prices
- redesigned dashboard retains live services, offers, announcements, and booking paths
- prescription prints as two landscape pads without signature box
- existing fields print and duplicate across pads
- long prescription continues on extra sheet without dropping medicine entries
- branch and super admin explicitly return permanent deletion on successful delete

## Server Node: 33 failures

- server/tests/batch79/promotionImage.node.cjs
- readiness obtains branch-scoped accurate counts with 4 parameterized grouped queries
- legacy organization-level readiness still works without a branch filter
- branch doctor schedule endpoint uses weekday order and retains doctor ownership
- deactivated branch is denied
- Super Admin consolidated inventory sums both branches
- billing settings are registered before dynamic bill id
- reactivates inactive branch, commits, records audit and releases connection
- deactivation blocks upcoming appointments and leaves branch active
- deactivation succeeds with no bookings and records audit
- staff and branch-admin accounts cannot change branch active status
- invalid branch IDs are rejected without issuing updates
- missing or invalid status is rejected
- unknown branch returns 404 without creating records
- setting an already-matching status is idempotent
- public navigation is responsive and routes back to anchored home sections
- stock requests are confined to the requested branch
- current checked-in migration SQL matches pinned SHA-256 checksums
- Doctor and billing helpers enforce branch-owned catalog items and bill attribution
- cross-branch inventory expiry uses the Manila date at the UTC boundary
- server/tests/marketing/announcements.node.cjs
- first-login schema, invitation, login, password reset and UI all use the same flag
- new additive migration stores draft and published policy separately
- public page is routed, linked from the footer, and opened from the booking flow
- appointment validates the doctor and service inside the requested branch transaction
- patient booking explicitly requires branch-owned doctor and service
- Patient promotion API rejects absent branch and cannot return other branch offers
- new compatibility endpoints have branch predicates, not JS-only list filtering
- patient doctor schedules require branch-scoped active doctor
- stock summary rebuild commits the delete and insert together
- failed stock summary rebuild rolls back before releasing its connection
- dashboard and reports separate billed from collected and have date selectors
- branch and Staff System Setup use the same physical stock allocation summary

## Server Vitest: 1 failure

`tests/security/batch2InventorySemantics.test.js:99` still expects the literal `rx.quantity ?? rx.dosage` inside the patient History page. The existing prescription renderer is factored elsewhere. This is the same failing source assertion in the baseline.

## Material migration limitation

`tests/deployment/migrationRunner.node.cjs` detects a pre-existing checksum mismatch in `2026-10-09-multi-branch-foundation.sql`: pinned LF-normalized SHA-256 `8df683ad4f37373edae55b7981b00d0d3be7b62023d1d58ea545b70b9ff7a141`, current checked-in LF-normalized SHA-256 `be0844e5dc8f85eb0c4342565d658c14ac3f2e11c0636e91b7aa4dec53fa2bca`. Neither the historical file nor its pin was changed. The assertion for the newly appended migration was updated and its checksum added. Verify the archived foundation SQL against the staging migration ledger before deployment; do not silence this failure by changing old checksum records.

Other remaining failures cover existing VM mocks/source contracts and pre-existing auth, branch provisioning/readiness, public-page, prescription-printing, promotion-image, announcement, inventory-summary and report expectations. They were reproduced before these changes; this work does not certify those separate features.

See [test-results.json](evidence/test-results.json) for counts and exact normalized before/after names. Raw final logs remain locally under `evidence/` and are ignored by the existing repository log rule.
