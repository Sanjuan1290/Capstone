# Carait Clinic — merge-conflict repair and verification

Date: **11 November 2026 (Asia/Manila)**. Reviewed merge commit **a273386**, valid parent **3b61006**. Changes remain uncommitted. No deployment, production write or migration-history deletion occurred.

## 1. Outcome and column verification

All six committed conflict blocks were reconciled. Reversal, direct Admin reductions, branch permissions, no-payment restriction, required reason, concurrency protection, promotion/discount preservation and audit history are retained. The other four PDF fixes remain functional in the checks available locally.

Before application edits, a read-only query confirmed the three manually added columns. The follow-up [live schema evidence](live-schema-verification.json) records the same contract:

| Column | Observed type | Nullable |
| --- | --- | --- |
| reversal_reason | varchar(255) | YES |
| reversed_at | datetime | YES |
| reversed_by_admin_id | int | YES |

No live ALTER, application-data query, application initialization or migration runner was invoked. The new reversal migration currently has **no live ledger entry**; this was inspected without inserting/deleting a row. It must be reconciled through the registered runner during an approved deployment after staging rehearsal. Existing compatible columns are skipped; they must not be manually added a second time.

## 2. Export review and conflict decisions

The exact filename AllCodes(20261111-015902).txt was not found. The updated local Downloads/AllCodes.txt was used and identified explicitly rather than claiming access to a missing file. Its 781 scoped application text files all match the pre-repair repository, including the exact six conflict blocks in the four named files. SHA-256: d6b904048ee96af85bc68b943b4d0be65b01d76308840402e225ce1c208efb3b. No embedded instruction was executed. [Export comparison](export-comparison.json).

| File / block | Reconciliation |
| --- | --- |
| server/scripts/branchMigrations.js — registration | Retain the new reversal migration after all existing migrations; preserve existing order and checksum handling. |
| server/scripts/branchMigrations.js — guard | Retain metadata type/nullability validation and skip compatible existing columns; preserve all earlier promotion/audit/history/TiDB guards. |
| server/utils/chargeAdjustments.js — reversal/export | Keep the complete reversal function and union of existing exports plus reverse. Preserve request/resolve/cancel and direct Admin behavior. |
| ChargeAdjustmentsPanel.jsx — state | Retain reversal dialog state alongside all existing submit/load/retry handling. |
| ChargeAdjustmentsPanel.jsx — editability | Retain draft/pending condition and add both no-paid-at and zero-payment-history restrictions. A status-only predicate would reopen prohibited actions. |
| migrationRunner.node.cjs — expected tail | Retain the new five-file tail while preserving historical checksum assertions; add meaningful replay/type/history tests. |

The three corrected production files match the first, previously valid merge parent exactly after line-ending normalization. The test file additionally gains three guarded-migration scenarios. No migration SQL file or historical checksum was edited. Neither side was discarded wholesale: existing exports, predicates, migration order and earlier guards were retained while adding the reversal behavior.

## 3. Changed files

| File | Change |
| --- | --- |
| [server/scripts/branchMigrations.js](../../server/scripts/branchMigrations.js) | Resolved two blocks; preserve registration and guards that skip the three manually added columns. |
| [server/utils/chargeAdjustments.js](../../server/utils/chargeAdjustments.js) | Resolved reversal/export block; preserve all existing exports and the locked, audited, branch-aware reversal. |
| [client/src/components/billing/ChargeAdjustmentsPanel.jsx](../../client/src/components/billing/ChargeAdjustmentsPanel.jsx) | Resolved state and editability blocks; preserve reason dialog, refresh, history and payment restrictions. |
| [server/tests/deployment/migrationRunner.node.cjs](../../server/tests/deployment/migrationRunner.node.cjs) | Resolved migration tail, preserve existing tests and hashes, add three tests for manually present/partial/incompatible columns. |
| QA_REPORT/conflict-repair-2026-11-11/ | New report, commands, synthetic harness and evidence; prior reports remain unchanged. See EVIDENCE_MANIFEST.md. |

No source file, test or migration-history row was deleted. No dependency, package/lockfile or environment setting was changed. There are no unrelated application edits. Temporary synthetic database files and generated PDFs/screenshots are local artifacts; artifact paths are retained in their JSON results.

## 4. Tests performed

| Check | Prior verified results | Corrected repository | Finding |
| --- | --- | --- | --- |
| Complete repository conflict scan | 6 blocks in 4 files | PASS | 1400 enumerated files; no remaining markers; exclusions documented in conflict-scan.json |
| Frontend build | PASS | PASS | 25 required prebuild assertions and Vite production bundle pass |
| Backend syntax / deployment checks | PASS | PASS | 358 modules; source graph: 611 files / 1421 imports; 231 handler references and route smoke checks pass |
| Backend build script | Not defined | NOT APPLICABLE | CommonJS server has no build command. Ran check:syntax, verify:source and postinstall, then real server workflows. No bundler build is claimed. |
| Client lint | 0 errors; 23 warnings | 0 errors; 23 warnings | PASS; existing warnings retained |
| Migration unit tests | 15 existing cases | 18/18 PASS | Manual existing fields, partial recovery, incompatible type/nullability and history retention verified |
| Charge reversal tests | 15 cases | 15/15 PASS | Financial totals, promotions, other reductions, validation, locking/version checks and role/payment restrictions |
| Prescription / receipt focused checks | 12 cases | 12/12 PASS | Structured/legacy/malformed prescriptions and saved-ledger receipt contracts |
| Backend Node | 672/699 pass; 27 fail | 675/702 pass; 27 fail | Three new migration-guard tests pass; failing names unchanged |
| Frontend Node | 352/373 pass; 21 fail | 352/373 pass; 21 fail | Failing names unchanged |
| Backend Vitest | 259/263 pass; 4 fail | 259/263 pass; 4 fail | Failing names unchanged |
| Playwright | 23/39 pass; 16 fail | 23/39 pass; 16 fail | Same 16 legacy failures; all 12 payment interactions pass; no skips/flakes |
| Real API / built React / MySQL workflows | 21 cases | 22/22 PASS | Added separate successful Super Admin direct-apply/reverse; no mocked API or DB |
| API smoke and auth matrix | 41 cases; 738 anonymous + 738 expired probes | 41/41 API cases pass; 738 anonymous + 738 expired probes pass | All workflow/auth checks pass |
| SQL SELECT plan sweep | 676 pass; 5 fail | 678 pass; 5 fail | Fresh runtime AST inventory; five missing-table failures unchanged. API-smoke command exits 1. |
| Chrome and Edge A5 PDFs | 32 pass | 32/32 PASS | Headers on/off; normal cases one page; 40-item receipts three pages; required text and last item retained |
| Migration rehearsal with existing columns | Manual columns present | PASS | Zero ADD COLUMN statements; two initial/repeat runs retain 16 local ledger rows |
| Post-workflow migration replay / DB integrity | Not applicable | PASS | Exact hashes unchanged for 12 financial, clinical, stock, audit and migration tables; no negative/inconsistent totals or incomplete reversal history |

The comparison column uses the previously recorded successful implementation evidence under ../implementation-2026-11-11/, not a newly rerun conflicted baseline. Fresh current commands and logs are in this directory. No test was skipped/deleted or weakened to obtain a pass. Three new migration tests explain the backend total increasing from 699 to 702.

### Real workflow cases

| Case | Result |
| --- | --- |
| admin password login with local-only MFA override | PASS |
| superadmin password login with local-only MFA override | PASS |
| staff password login with local-only MFA override | PASS |
| patient actual password login returns HttpOnly session cookie | PASS |
| doctor actual password login returns HttpOnly session cookie | PASS |
| Patient books a same-day synthetic appointment through actual slot validation | PASS |
| Staff confirms the booked appointment | PASS |
| Staff checks in the actual appointment; duplicate check-in cannot create a second queue row | PASS |
| Staff calls the patient and Doctor starts consultation | PASS |
| Doctor saves a versioned draft without inventory deduction | PASS |
| Insufficient stock rolls back finalization and clinical state | PASS |
| Doctor finalizes once, deducting exactly one unit and retaining prescription | PASS |
| Doctor request and Admin approval preserve the 100 peso booking promotion | PASS |
| Reversal rejects invalid reasons, unauthorized roles and another branch | PASS |
| Simultaneous Admin and Super Admin reversals restore once and create one audit event | PASS |
| Staff request approval then real Admin browser reversal immediately refreshes checkout totals | PASS |
| Super Admin directly applies and successfully reverses a separate reduction in the selected branch | PASS |
| Both real medical-history screens display the saved prescription without JSON | PASS |
| Staff partial and final payments remain idempotent and block reversal after partial collection | PASS |
| Patient history contains the same paid bill; another patient cannot read it | PASS |
| Real Super Admin editor previews, saves, publishes and restores without changing the public draft prematurely | PASS |
| Patient logout invalidates the current session | PASS |

Both Admin and Super Admin independently complete authorized reversals. Concurrent requests return one 200 and one 409, retain original approval fields and write one audit event. Paid/partially paid and confirmed bills reject reversal. Tests preserve the promotion, unrelated reductions, the actual one-unit stock deduction and saved prescription. These are synthetic records in the isolated database, never patient or production records.

### Receipt printing

| Browser | Case | Headers | Pages | Result |
| --- | --- | --- | --- | --- |
| Edge | one-service | Off | 1 | PASS |
| Edge | one-service | On | 1 | PASS |
| Edge | multiple-services | Off | 1 | PASS |
| Edge | multiple-services | On | 1 | PASS |
| Edge | promotion | Off | 1 | PASS |
| Edge | promotion | On | 1 | PASS |
| Edge | partial | Off | 1 | PASS |
| Edge | partial | On | 1 | PASS |
| Edge | refunded | Off | 1 | PASS |
| Edge | refunded | On | 1 | PASS |
| Edge | voided | Off | 1 | PASS |
| Edge | voided | On | 1 | PASS |
| Edge | long-fields | Off | 1 | PASS |
| Edge | long-fields | On | 1 | PASS |
| Edge | many-items | Off | 3 | PASS |
| Edge | many-items | On | 3 | PASS |
| Chrome | one-service | Off | 1 | PASS |
| Chrome | one-service | On | 1 | PASS |
| Chrome | multiple-services | Off | 1 | PASS |
| Chrome | multiple-services | On | 1 | PASS |
| Chrome | promotion | Off | 1 | PASS |
| Chrome | promotion | On | 1 | PASS |
| Chrome | partial | Off | 1 | PASS |
| Chrome | partial | On | 1 | PASS |
| Chrome | refunded | Off | 1 | PASS |
| Chrome | refunded | On | 1 | PASS |
| Chrome | voided | Off | 1 | PASS |
| Chrome | voided | On | 1 | PASS |
| Chrome | long-fields | Off | 1 | PASS |
| Chrome | long-fields | On | 1 | PASS |
| Chrome | many-items | Off | 3 | PASS |
| Chrome | many-items | On | 3 | PASS |

### Isolation and migration verification

Schema-only metadata was read from the configured database: 81 tables and 932 columns; no application rows were copied. All test mutations used the new loopback instance on port 33411, schema carait_merge_qa_20261111. Provider calls were blocked; login MFA and booking-notice overrides existed only in the synthetic native test process. Actual delivery is not established by those overrides.

The cloned schema already contained all three manual columns. The traced initial/repeat migration runs issued **zero** ADDs for them and retained all 16 ledger entries. A later replay after payments/reversals compared exact hashes of 12 financial, clinical, stock, audit and migration tables; every hash stayed unchanged. No migration-history row was removed to force a replay. [Migration verification](migration-verification.json), [post-workflow invariants](database-verification.json).

The disposable MySQL instance is now stopped and port 33411 is closed. Synthetic data files remain local for review; no original user file was modified. [Cleanup evidence](cleanup-results.json).

QA fixture corrections are disclosed in initial-fixture-attempt.json: the schema-only clone needed a synthetic Super Admin seed, and the copied API harness needed a regenerated SQL inventory. Those initial harness attempts were corrected and rerun; they were not counted as product passes or product defects.

## 5. Remaining failures and limitations

**No newly failing names** were found against prior Node, Vitest or Playwright evidence. The global suites remain unsuccessful and full production readiness is not claimed.

| Runner | Unchanged failing assertion |
| --- | --- |
| Backend Node | approved image binds promotion, actor and current branch and saves only verified asset |
| Backend Node | readiness obtains branch-scoped accurate counts with 4 parameterized grouped queries |
| Backend Node | legacy organization-level readiness still works without a branch filter |
| Backend Node | branch doctor schedule endpoint uses weekday order and retains doctor ownership |
| Backend Node | deactivated branch is denied |
| Backend Node | Super Admin consolidated inventory sums both branches |
| Backend Node | billing settings are registered before dynamic bill id |
| Backend Node | inactive branch operational actions are disabled while status switch remains accessible |
| Backend Node | active/inactive status filter compares strings correctly |
| Backend Node | public navigation is responsive and routes back to anchored home sections |
| Backend Node | stock requests are confined to the requested branch |
| Backend Node | Doctor and billing helpers enforce branch-owned catalog items and bill attribution |
| Backend Node | cross-branch inventory expiry uses the Manila date at the UTC boundary |
| Backend Node | draft announcement accepts plain-text content |
| Backend Node | rejects unsafe external CTA URLs |
| Backend Node | rejects protocol-relative redirects |
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
| Frontend Node | doctor availability sorts weekdays while preserving booking routes |
| Frontend Node | featured offers preserve selected promotion while providing bounded scroll controls |
| Frontend Node | Staff and Admin wrappers bind one shared checkout to their own permitted APIs |
| Frontend Node | pending clinical adjustments are reviewed on bill, not by a Doctor |
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
| Vitest | September 28 Batch 2 — inventory semantics, services setup, and prescription quantity uses prescription quantity while keeping legacy dosage readable |
| Vitest | Batch 5 deferred inventory deduction workflow does not cap actual consumable entry to pre-checked treatment-room stock |
| Vitest | billing checkout follow-up regressions uses clinic-facing billing statuses and provides a return path to payment |
| Vitest | Batch 1 recovery and consultation autosave regressions keeps draft saving independent from treatment-room stock and autosaves without a manual Save Draft button |
| Playwright | admin: two billing tabs and accurate payment filters |
| Playwright | superadmin: two billing tabs and accurate payment filters |
| Playwright | staff: two billing tabs and accurate payment filters |
| Playwright | Staff sees pending requests without approval controls |
| Playwright | dedicated history retains cancelled and expired attempts and receipt details |
| Playwright | admin: walk-in submission sends only visit data once |
| Playwright | superadmin: walk-in submission sends only visit data once |
| Playwright | staff: walk-in submission sends only visit data once |
| Playwright | lost partial payment response retries the same key and preserves the remaining balance |
| Playwright | a paid bill opens its saved receipt with the promotion total |
| Playwright | admin: scheduled manual booking never serializes its button event |
| Playwright | superadmin: scheduled manual booking never serializes its button event |
| Playwright | staff: scheduled manual booking never serializes its button event |
| Playwright | billing-only Staff can view bills without checkout, cash tools, or Admin actions |
| Playwright | mobile billing tabs and checkout fit the available viewport |
| Playwright | Staff retains permission to close only their own cash drawer inside collapsed tools |

The SQL sweep has 678 passes and five failures against three absent inventory-mode tables. These match the previous missing-table failures; their source files were not modified in this repair. The broader API-smoke process exits 1 despite all workflow/auth cases passing. No unrelated inventory migration was applied to conceal them.

| Source file / line | SQL error |
| --- | --- |
| server/routers/branchLocationStock.js:17 | Table 'carait_merge_qa_20261111.inventory_stock_eligibility' doesn't exist |
| server/utils/inventoryLocationStock.js:22 | Table 'carait_merge_qa_20261111.inventory_stock_mode' doesn't exist |
| server/utils/inventoryLocationStock.js:90 | Table 'carait_merge_qa_20261111.inventory_stock_movements' doesn't exist |
| server/utils/inventoryLocationStock.js:104 | Table 'carait_merge_qa_20261111.inventory_stock_eligibility' doesn't exist |
| server/utils/inventoryModeSafety.js:8 | Table 'carait_merge_qa_20261111.inventory_stock_mode' doesn't exist |

External PayMongo/webhook delivery, settlement, Cloudinary uploads, email/SMS delivery and physical printing remain unverified. No real charge, recipient or patient record was used. The timestamped export filename itself was unavailable, with the matching updated alias and its hash disclosed above. No hosted Cloudflare/Render deployment or remote schema migration was performed.

## 6. Verification checklist

| Requested check | Status | Evidence |
| --- | --- | --- |
| Verify columns before application edits | PASS | Initial read-only information_schema check preceded the patch; recorded follow-up confirms nullable datetime/int/varchar(255). |
| Resolve all six conflicts | PASS | All four exported files matched pre-repair HEAD; each block reconciled as detailed above. Three production files exactly match last valid parent 3b61006. |
| Scan complete repository | PASS | No remaining markers; hidden/ignored source included. Dependency/build/cache/binary exclusions are explicit. |
| Backend syntax; frontend/backend builds | PASS / N/A | Syntax, source graph, route bindings and frontend build pass; backend has no compilation/build script. |
| Migration verification without repeat columns | PASS | Live read-only proof plus isolated initial/repeat/replay checks; zero repeated column ADDs and zero history deletions. |
| Reversal financial and authorization workflows | PASS | Admin and Super Admin each succeed; Staff/Doctor/Patient and wrong branch denied; reason, duplicate, paid, total and audit cases pass. |
| Existing regression suites | PARTIAL | All run. Same 27 backend Node, 21 client Node, 4 Vitest and 16 browser failures; no newly failing names. Five SQL-plan failures remain. |
| Payment redesign | PASS locally / PARTIAL externally | Admin/Staff at 1440/900/390, cash/partial receipt, QR locking/cancel, response-loss retry pass. Live payment-provider exchange unverified. |
| Prescription display | PASS | Both actual medical-history screens show the same saved synthetic medicine; parser safely handles supported formats. |
| A5 receipts | PASS | 32 real Chrome/Edge PDFs verified; no data clipping. Physical printer/interactive OS dialog not exercised. |
| Landing-page editor | PASS locally | Real preview/draft/publish/public page/restore/re-publish; responsive layouts, device/fullscreen controls and stale-write rejection pass. External upload delivery unverified. |
| Updated actual-result report | PASS | This report and machine-readable evidence reflect the corrected repository; no result inferred from a command that did not run. |

## 7. Deployment readiness

**The corrected source builds and is ready for staging rehearsal. Production release remains conditional**, given the existing regression failures, missing inventory-mode tables, external-delivery gaps and unrecorded reversal migration.

1. Review these four-file changes and the current failure inventory. Keep the existing SQL migration files and applied hashes unchanged.
2. In approved staging, run the registered server migration command after verifying the manual column types. The reversal guard skips all three present nullable columns and records the migration after validation. Repeat once to confirm history remains unchanged. Do not force-insert checksums or delete history to bypass the runner.
3. Confirm the same expected column contract and pending-migration state for the deployment target. No production migration was executed here. The live columns are already present; pending ledger registration is an outstanding database step. The runner must still validate all other registered history rather than assuming it is current.
4. Build the client with npm --prefix client run build. The backend has no build script: use npm --prefix server run check:syntax, npm --prefix server run verify:source and npm --prefix server run postinstall, then the existing server start command.
5. Rehearse Admin/Super Admin apply -> reverse -> confirm -> partial/final payment, wrong-role/branch denial, duplicate requests, audit history and receipts. Rehearse CMS draft/publish/restore and the configured external test providers before production rollout.

No new environment variable or application dependency is required. No push, deployment, production financial edit or migration-history deletion occurred.
