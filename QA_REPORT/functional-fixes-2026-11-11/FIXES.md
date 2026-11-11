# Carait Clinic — three functional bugs fixed

Date: **11 November 2026 (Asia/Manila)**. Base commit: **b93ff31**. All three requested functional bugs are fixed in the working tree. Changes remain uncommitted and undeployed. Production data, schema and migration history were untouched.

## Fixes

1. **Deleted promotions retain the booked price.** The saved discount is applied to the booked consultation service even when promotion_id is NULL after offer deletion. It remains capped to that line, is counted once, and does not authorize discounts on unrelated services, inventory or custom charges. The display metadata keeps a null live ID. The original 400 service / 100 saved discount case retains the correct 300 total.
2. **SMS quota times are independent of the Node host timezone.** MySQL DATETIME strings use the existing DB_TIME_ZONE setting, falling back to +08:00 consistently with the database connection. Tests cover UTC and Manila hosts, Date objects and database offsets +00:00, -05:30 and +05:45. The next attempt after one second is blocked for 59 seconds; the third allowed send is followed by the correct remaining hourly wait. Existing quota records are read correctly without a data migration.
3. **Reconfirmation emails have distinct, retry-safe keys.** Admin and Staff pass the existing persisted doctor notification ID for each real confirmation. The key includes this event and a SHA-256 hash of the actual outbound payload. Same-event retries keep the same key; rescheduling, returning to the original slot, and changed recipient/payloads do not collide. No new table/column or environment variable is required. Already-confirmed requests return an idempotent 200 without new notifications; concurrent pending confirmations still allow only one update and notification event. Provider calls remain asynchronous.

## Files changed

| File | Purpose |
| --- | --- |
| [server/controllers/admin.controller.js](../../server/controllers/admin.controller.js) | Forward the saved doctor notification ID after a successful transition; already-confirmed requests return 200 without repeating notifications. |
| [server/controllers/staff.controller.js](../../server/controllers/staff.controller.js) | Same event identity and idempotent duplicate behavior for Staff confirmation. Existing conditional UPDATE/concurrency checks remain. |
| [server/tests/billing/servicePromotions20261111.node.test.cjs](../../server/tests/billing/servicePromotions20261111.node.test.cjs) | Three regression cases for deleted offers, amount caps/repeated saves, and added-service eligibility isolation. |
| [server/tests/doctorConfirmNotifications20261111.node.cjs](../../server/tests/doctorConfirmNotifications20261111.node.cjs) | Four regression cases covering exact retries, rescheduling/back-to-original-slot events, changed recipients, and actual Admin/Staff controller duplicate/concurrent behavior. |
| [server/tests/registrationSmsLimits20261111.node.cjs](../../server/tests/registrationSmsLimits20261111.node.cjs) | Two regression cases using mysql2-style DATETIME strings across UTC/Manila hosts and configured database offsets. |
| [server/utils/billingServicePromotions.js](../../server/utils/billingServicePromotions.js) | Preserve a booked discount snapshot after deletion clears its live promotion FK; keep a null ID and cap to the booked service line. Current eligibility still applies to added-service offers. |
| [server/utils/doctorConfirmationNotifications.js](../../server/utils/doctorConfirmationNotifications.js) | Use the persisted confirmation notification ID and a payload hash for email idempotency. Exact retries keep a stable key; new events and changed payloads receive distinct keys. |
| [server/utils/registrationSmsLimits.js](../../server/utils/registrationSmsLimits.js) | Parse mysql2 DATETIME strings with the existing configured DB_TIME_ZONE/default +08:00 rather than the Node host timezone. Preserve Date/explicit-offset handling, locking and quota rules. |

Nine meaningful regression cases were added to the existing suites. Existing tests and assertions remain; none were skipped or deleted. Earlier QA evidence under ../review-2026-11-11/ remains the pre-fix baseline.

## Actual verification results

| Check | Before fixes | After fixes |
| --- | --- | --- |
| Targeted promotion/SMS/notification/lifecycle/reversal cases | Bug boundary cases failed before implementation | 42/42 PASS; no skips |
| Backend syntax / route binding | PASS | PASS |
| Backend source graph | PASS | PASS |
| Frontend production build | PASS | PASS; 25 required prebuild assertions and Vite bundle |
| Backend Node | 697/730 pass; 33 fail | 709/739 pass; 30 fail |
| Frontend Node | 364/387 pass; 23 fail | 364/387 pass; 23 fail |
| Backend Vitest | 257/263 pass; 6 fail | 257/263 pass; 6 fail |
| New failing names | Compared with latest review | 0 |

The three existing consultation lifecycle failures are now passing:

- complete consultation with none reduction decision preserves promotion and actual consumption
- complete consultation with approved reduction decision preserves promotion and actual consumption
- complete consultation with rejected reduction decision preserves promotion and actual consumption

Targeted tests verify all 15 existing reversal cases as well as promotion preservation, single-discount caps, current added-service eligibility, timezone-correct quota cooldown/window reset, notification channel switches, provider-failure isolation, stable retry keys and separate confirmation events. Actual Admin/Staff confirmation functions run with synthetic DB/notification executors to verify duplicate and concurrent handling.

All tests used synthetic settings and a network guard. No production database query/write, real SMS/email, migration, financial correction or reset was executed. There is no backend compilation script; its required syntax/source/route validation ran. Frontend lint and browser tests were not repeated because client source was unchanged; their pre-fix results remain in the review evidence and are not claimed as fresh results here. Live provider delivery and real-database integration were not exercised in this fix pass.

## Remaining failures and limits

All remaining failures existed in the latest review. The fix introduces no newly failing test name. These suites still exit nonzero:

| Suite | Remaining failing assertion |
| --- | --- |
| Backend Node | approved image binds promotion, actor and current branch and saves only verified asset |
| Backend Node | readiness obtains branch-scoped accurate counts with 4 parameterized grouped queries |
| Backend Node | legacy organization-level readiness still works without a branch filter |
| Backend Node | branch doctor schedule endpoint uses weekday order and retains doctor ownership |
| Backend Node | deactivated branch is denied |
| Backend Node | Super Admin consolidated inventory sums both branches |
| Backend Node | billing settings are registered before dynamic bill id |
| Backend Node | walk-in endpoints and service selection are connected across roles |
| Backend Node | inactive branch operational actions are disabled while status switch remains accessible |
| Backend Node | active/inactive status filter compares strings correctly |
| Backend Node | public navigation is responsive and routes back to anchored home sections |
| Backend Node | stock requests are confined to the requested branch |
| Backend Node | current checked-in migration SQL matches pinned SHA-256 checksums |
| Backend Node | Doctor and billing helpers enforce branch-owned catalog items and bill attribution |
| Backend Node | cross-branch inventory expiry uses the Manila date at the UTC boundary |
| Backend Node | draft announcement accepts plain-text content |
| Backend Node | rejects unsafe external CTA URLs |
| Backend Node | rejects protocol-relative redirects |
| Backend Node | billing and all reschedule paths preserve selected promotional discount boundaries |
| Backend Node | first-login schema, invitation, login, password reset and UI all use the same flag |
| Backend Node | new additive migration stores draft and published policy separately |
| Backend Node | public page is routed, linked from the footer, and opened from the booking flow |
| Backend Node | appointment validates the doctor and service inside the requested branch transaction |
| Backend Node | patient booking explicitly requires branch-owned doctor and service |
| Backend Node | Patient promotion API rejects absent branch and cannot return other branch offers |
| Backend Node | new compatibility endpoints have branch predicates, not JS-only list filtering |
| Backend Node | patient doctor schedules require branch-scoped active doctor |
| Backend Node | dashboard and reports separate billed from collected and have date selectors |
| Backend Node | substitute Saline with alternative prices patient-specific ₱470, deducts only actual products |
| Backend Node | branch and Staff System Setup use the same physical stock allocation summary |
| Frontend Node | AuthContext preserves a session on unavailable checks and revalidates on tab return |
| Frontend Node | patient guards show a retry state instead of redirecting on an unavailable auth check |
| Frontend Node | branch form includes blank, standard, copy, preview and creation guidance |
| Frontend Node | both checkout portals supply branch scoped cancellation to the shared QR panel |
| Frontend Node | dark-mode components explicitly handle translucent and weekday surfaces |
| Frontend Node | doctor availability sorts weekdays while preserving booking routes |
| Frontend Node | featured offers preserve selected promotion while providing bounded scroll controls |
| Frontend Node | Staff and Admin wrappers bind one shared checkout to their own permitted APIs |
| Frontend Node | pending clinical adjustments are reviewed on bill, not by a Doctor |
| Frontend Node | backend snapshots discounts at booking and charges them once in consultation and staff checkout |
| Frontend Node | shared Billing navigation and action links retain the selected physical branch |
| Frontend Node | charge adjustment UI preserves approval, reason and stock separation notices |
| Frontend Node | unapproved catalog prices and placeholders are not presented as public prices |
| Frontend Node | redesigned dashboard retains live services, offers, announcements, and booking paths |
| Frontend Node | prescription prints as two landscape pads without signature box |
| Frontend Node | existing fields print and duplicate across pads |
| Frontend Node | long prescription continues on extra sheet without dropping medicine entries |
| Frontend Node | staff with Checkout and Billing sees the same four billing tasks as Admin |
| Frontend Node | billing-only staff cannot reach payment or cashier tools via query parameter |
| Frontend Node | checkout-only staff can still read branch-owned bills but does not gain Admin approvals |
| Frontend Node | dashboard and reports never display zero-valued KPIs on request failure |
| Frontend Node | branch activation retains the confirmation flow and readiness details |
| Frontend Node | branch and super admin explicitly return permanent deletion on successful delete |
| Vitest | September 28 Batch 2 — inventory semantics, services setup, and prescription quantity tracks service consumables as generic whole units and adds their Selling Price to the Service Price |
| Vitest | September 28 Batch 2 — inventory semantics, services setup, and prescription quantity uses prescription quantity while keeping legacy dosage readable |
| Vitest | Batch 5 deferred inventory deduction workflow does not cap actual consumable entry to pre-checked treatment-room stock |
| Vitest | billing checkout follow-up regressions uses clinic-facing billing statuses and provides a return path to payment |
| Vitest | September 30 consultation workflow UX allows patient-specific substitutions while keeping the booked service, branch inventory and completion lock |
| Vitest | Batch 1 recovery and consultation autosave regressions keeps draft saving independent from treatment-room stock and autosaves without a manual Save Draft button |

The separately reported migration-tail assertion still expects the older registration order. It is outside the requested three functional fixes and was not weakened to hide that failure. Existing label/source-contract failures and earlier unrelated regressions also remain. This report does not certify a globally green application.

## Deployment notes

Deploy the corrected backend through the existing staging/release process after reviewing the remaining failures. The three fixes require no new dependency, environment setting or database migration. Existing deployment migrations from the user's preceding commits remain subject to their normal review/verification; none was applied here. No past paid bill or quota/migration-history record was rewritten.

Detailed fresh counts, resolved/new-failure comparison and source scope: [test-summary.json](test-summary.json). Command output and status are in each named .log/.json pair. The earlier review report documents the original defects; this report documents their completed fixes.
