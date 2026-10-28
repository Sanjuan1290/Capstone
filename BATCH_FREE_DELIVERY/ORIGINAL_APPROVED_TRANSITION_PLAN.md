# CARAIT Clinic — Thorough Plan to Retire Batch-Dependent Inventory

**Plan only — NOT authorization to migrate, delete data, deploy, or change stock.**
**Basis:** `AllCodes(20261028-101939).txt`, `carait_clinic_full_backup_2026_28.sql`, and the previously reported Stock Out / Move Stock / Manage Batches failures. This is a source- and backup-based assessment, **not a validation of the live TiDB instance**.
**Goal:** Replace the *active* inventory system with straightforward **Item + Branch + Location + Quantity + Movement History**, removing batch selection and batch-dependent write paths across the entire application. Keep the historical batch records immutable for traceability; do not drop historical tables in this rollout.

## 0. Executive decision and safety requirements

**Do not start by deleting `inventory_batches` or removing `batch_id` columns.** Current production code uses batches as the authoritative stock accounting system. Deleting or bypassing batch data before the replacements are in place will break clinical consumption, cashier dispensing, undo/return workflows, location transfers, and reports.

**Target operating model**

- A staff member selects an **item, location, quantity, and documented reason** for Stock Out. No batch selection.
- For Stock In: select **item, receiving location, quantity, supplier where applicable, and document/reference**. No batch is created.
- For Move Stock: select **item, source location, destination location, quantity**. Total clinic stock is invariant.
- Treat `inventory_location_stock` as the **canonical physical-balance table** following controlled cutover, with `inventory.stock` and `inventory.stock_base` strictly derived compatibility summaries.
- Add a permanent, append-only **stock movement ledger** for transaction reconstruction, authorization, reason, adjustment/return linkage, and idempotency.
- Keep the existing `inventory_batches`, `inventory_location_batches`, `consultation_inventory_usage_batches`, `billing_item_batch_usage`, `inventory_transfer_batches`, and old `inventory_logs` as **read-only historical evidence** after cutover. Never delete these automatically.
- Preserve existing clinic/branch access restrictions, approval requirements, archived-item rules, cashier controls, and consultation state constraints.

### Clinical expiry constraint — mandatory policy decision

A **truly batch-free system cannot distinguish two expiration dates for the same medicine in the same physical location**, and thus cannot guarantee first-expiring-first-out. It must not pretend to do so. The safest batch-free policy is:

1. **One usable expiry per medicine SKU within a location at a time.** When receiving medicine with a different expiry, require either a separate medicine SKU/item identity or documented removal/quarantine of the old usable stock before merging quantities. Do not silently mix unlike expiration dates.
2. Preserve **item-level expiry** for all active medicine items, but validate that it actually represents every usable unit shown; never infer it from an arbitrary legacy batch.
3. Support a **Quarantine / Expired / Damaged** non-dispensable location category (or explicitly quarantined stock state) excluded from *available-to-dispense* and booking/checkout balances. Physical stock can remain counted for reconciliation separately from saleable stock. Quarantined stock cannot be restored to usable without a controlled authorization and expiry validation.
4. For non-expiring supplies, optional no-expiry handling may remain. For medicine, an expiry is required and an expired item is not dispensable.
5. A clinic-authorized person must approve the treatment of differing expiries and confirm physical stock counts before cutover. Do not silently discard, merge, or relabel stock.

**Concrete issue in the supplied October 28 backup:** One medicine (`1 peso med`, inventory ID 30002) totals 19 units from two historic receipts: **9 units expiring 2026-10-25** and **10 units expiring 2030-10-28**, both in Main Stockroom. Another medicine (`Paracetamol`, inventory ID 60001) totals 5 units with **2026-10-27** expiry across two locations. Both 2026 expiry dates are in the past as of the October 28 review. These are *backup observations*, not verified physical counts. **Do not turn these into one unrestricted balance.** Inventory ID 30002 currently has an item-level expiration_date of 2026-10-25, so copying that value to all 19 units would also incorrectly classify the valid 10. Document a safe split/quarantine/reidentification mapping first; block or isolate uncertain medicine stock until reconciled.

## 1. Current dependency map (verified against October 28 source)

| Existing component | Current batch dependency | Required replacement |
|---|---|---|
| `server/utils/inventoryBatches.js` | Receipts, FEFO deduction, exact-batch deduction, exact-batch returns, location moves, snapshot rebuilds, batch attachment | New canonical **inventoryStockService**, transactional balance changes and ledger; legacy helper retained for history only |
| `server/utils/manualInventoryMovement.js`, `manualInventoryPolicy.js` | Forces batch ID for Stock Out; Stock In creates new batch | Item/location stock-in/out with reason and validations, no `batch_id` |
| `server/routers/branchQueueInventoryWrites.js` | Move endpoint requires `batch_id`; location deletion checks `inventory_location_batches` | Move by item/from/to/qty; location deletion checks canonical balance AND outstanding reservations |
| `server/routers/branchInventoryItems.js` | Opening stock creates batch; serializes batches with item | Opening balance through canonical ledger/service; batch fields removed from active API |
| `server/routers/branchBatchActions.js`, `server/routers/admin.router.js` batch endpoints | Batch correction, archive, edit, verification/OTP | Remove from active UI; retire endpoints with controlled `410`/feature retirement after all clients upgraded; preserve historical read access as appropriate |
| `server/controllers/admin.controller.js`, `server/controllers/staff.controller.js` | Stock CRUD, inventory readers, stock summaries, source/batch lookups, creation, stock logs | Use canonical location balance and shared stock service; do not bypass branch validation |
| `server/controllers/doctor.controller.js` | Consultation usage consumes FEFO batches, writes `consultation_inventory_usage_batches`, reads batch inventory | Consume exact item/quantity/source location once; record new movement ID linked to consultation usage |
| `server/controllers/staff.controller.js` checkout | Paid dispensing consumes selected batch, writes `billing_item_batch_usage` | Consume item/location on **same approved payment trigger**; idempotent ledger linked to bill and billing item; no double consumption |
| `server/controllers/billingCorrections.controller.js` | Returns to original batch, moves exact batch, handles adjustments | Reversal linked to original ledger event and original location, with limits on returning more than originally deducted |
| `server/utils/supplyTransfers.js` | Transfers FEFO batches and records `inventory_transfer_batches` | Transfer item quantities from canonical location and write transfer ledger; preserve request approval and all-or-nothing semantics |
| `server/routers/branchAllInventory.js`, `branchReports.js`, `branchOperationalReads.js` | Summaries, expiry/valuation and counts query batches | Use canonical balances, item metadata, and ledger; explicitly mark batch-only historic reports as legacy |
| `server/utils/schema.js`, `schemaFlowFixes20261004.js` | Creates/backfills batches; **deletes/rebuilds `inventory_location_stock` from batch allocations** | STOP this rebuilding on batch-free schema; guarded mode-specific schema reconciliation and idempotent upgrade |
| `server/scripts/verifyDeployment.js`, Node/Vitest tests | Treats batch tables/FKs and batch allocation equality as required | Update active invariants; retain separate legacy-history invariants |
| `client/src/pages/shared/Inventory.jsx` | Batch chooser, batch stock cards, expiry badges, batch corrections, Move Stock and Stock Out batch selection | New item/location quantity UI, clear available/held/quarantined numbers; remove all batch controls |
| `client/src/components/billing/CheckoutSupplyEditor.jsx`, `BillCorrectionsPanel.jsx` | Selects batch/source for dispensing & returns | Select item/source location only, with record-specific return controls |
| `client/src/pages/adminPage/Admin_CheckoutDetail.jsx`, `client/src/pages/staffPage/Staff_CheckoutDetail.jsx` | Batch selection & usage details | Show plain item/location issued and refunded/returned status |
| `client/src/services/admin.service.js`, Staff and Doctor inventory services | Batch-specific request fields and endpoints | Introduce contract-compatible item/location endpoints and remove retired batch inputs |
| Historical tables `consultation_inventory_usage_batches`, `billing_item_batch_usage`, `inventory_transfer_batches`, `inventory_logs.batch_id` | Prior financial/clinical trail | **Leave intact** for old records, with new ledger rows for all post-cutover events |

Also inspect `server/utils/inventoryReadiness.js`, `server/utils/reportMetrics.js`, doctor availability screens, Admin/Superadmin inventory screens, stock-transfer-request status paths, billing receipts, audit exports, and all files referencing `batch_id`, `inventory_batches`, or `inventory_location_batches`. Current search finds **dozens of referencing files**; treat the repository-wide search as a required completeness gate, not just the table above.

## 2. Non-negotiable accounting invariants

Use one stock unit convention, respecting existing `unit_size`, `base_unit`, unit conversions, and fractional clinic consumables. Do not blindly change everything to integers. Current tables carry `DECIMAL(12,2)` quantities while some clinical usage records have `DECIMAL(12,4)`; determine appropriate canonical precision and conversion before designing ALTER statements. Use decimal arithmetic, not floating-point equality.

For every branch B and item I, at a consistent database snapshot:

- **On-hand(B,I)** = sum of all authorized nonnegative balances in canonical `inventory_location_stock` for locations belonging to B, including quarantine.
- **Available(B,I)** = sum across active, dispensing-eligible locations excluding quarantine, expired, unusable, and legitimately reserved quantities.
- **Derived `inventory.stock` and `inventory.stock_base`** = exactly documented transformed totals from the canonical balances, using a single UOM rule, never independently edited by another endpoint.
- **Move:** source decreases by q, destination increases by q, total on-hand unchanged.
- **Stock In:** location and on-hand increase by exactly q, one durable ledger event.
- **Stock Out / clinical consumption / paid dispensing:** location and on-hand decrease by exactly q, no negative balance, one durable ledger event per logical operation.
- **Return / reversal:** cannot exceed the net quantity of the original issue; links to original event, approved destination and actor, and cannot reintroduce expired/quarantined stock as usable.
- All reads/writes require branch ownership on **item AND location AND related clinical/billing record**. A caller must not change `branch_id` by supplying arbitrary IDs.
- All related stock, movement ledger, clinical/billing reference, and audit records must commit together or roll back together.
- Duplicate clicks, concurrent requests, webhook retries, timeouts and transaction retries must not duplicate stock movements.

## 3. Recommended new storage contract

### Use existing tables

- `inventory`: preserve item identity, barcode, item type, supplier, UOM, pricing, threshold, archive flags, item-level expiry and branch. Keep `stock`/`stock_base` as **derived** summaries for compatibility only.
- `inventory_locations`: preserve branch-bound stockrooms, treatment rooms and dispensing areas. Add a restricted/quarantine status/location concept *only after* policy review. Old names and existing IDs remain valid.
- `inventory_location_stock`: already exists with primary key `(location_id, inventory_id)`. Make it the source of truth at cutover; do not destroy and re-insert balances on startup.

### Add one authoritative, append-only movement ledger (proposed new table)

`inventory_stock_movements` with fields such as: `id`, `branch_id`, `inventory_id`, `movement_type` (`receipt`,`issue`,`transfer`,`return`,`adjustment`,`quarantine`,`release`,`reversal`), `source_location_id` nullable, `destination_location_id` nullable, `quantity_base`, `quantity_display`, `unit_snapshot`, `reason_code`, `reference_type`, `reference_id`, `reference_line_id`, `reverses_movement_id`, `idempotency_key`, `actor_role`, `actor_id`, `before_source`, `after_source`, `before_destination`, `after_destination`, `created_at`, `notes` and optional schema version. Add FKs/indexes that TiDB supports after testing. Use a **unique idempotency key per logical movement** and additional unique constraints scoped to the referencing event (e.g. consultation usage ID and operation type, billing item ID and operation type). Make this a write-once ledger, not a mutable balance row.

If reporting needs a persistent source-document snapshot (supplier, expiry, reason, authorization), store a minimal immutable receipt/ledger metadata snapshot **without reintroducing receipt or batch selection as the stock engine**.

Create an inventory schema version / cutover marker to tell code whether the canonical mode is old `batch` or new `location`. The migration must be safe on a partially completed deployment; every step is individually re-runnable and detects incompatible partial states.

**Do not create a parallel source of truth:** never allow both old batch writers and new location writers to process stock concurrently. If using a compatibility adapter during rollout, all active writes must still reach one canonical service exactly once.

## 4. Carefully staged implementation plan

### Phase 0 — Freeze decisions and record the baseline (NO code/data writes)

- Record real Git SHA, source versions, npm scripts, current migration records/checksums, branch inventory mode, active server instances and jobs, and complete route/API inventory.
- Obtain a **fresh encrypted backup** of active TiDB and verify it restores to an isolated database. Avoid spreading patient/payment records in reports.
- Snapshot inventory `stock`, `stock_base`, `inventory_location_stock`, `inventory_batches`, `inventory_location_batches`, open billing/consultation consumptions, and transfer requests; compare totals by branch/item/location at **one consistent cutover timestamp**.
- Detect negative/zero/duplicate/overallocated/unallocated records, missing locations, item/branch mismatches, expired stock, held stock, in-flight movements and partial transactions.
- Confirm expiry policy, source-of-truth quantity precision/UOM, treatment of a medicine with mixed expiries, whether supplies require expiry, and who can approve stock corrections. Do not proceed until resolved.
- **Exit gate:** signed baseline reconciliation + approved expiry policy + verified restore.

### Phase 1 — Define contracts and design a guarded migration

- Specify REST request/response schemas and status/error codes for: item list, location balances, Stock In, Stock Out, Move Stock, consultation usage, checkout dispensing, return, adjustment, stock transfer request, and immutable movement history.
- Define legacy `batch_id` handling: new active endpoints never require or infer it; obsolete endpoints must not silently apply stock via the old engine after cutover.
- Introduce role/branch authorization and audit rules for each operation, and exact expectations for live progress/error feedback.
- Plan additive TiDB DDL for the ledger, indexes, schema marker and optionally quarantine semantics. **Never edit historical migration files/checksums.**
- Plan backup and reversible code flag, but do not claim full rollback to old batch accounting after new writes begin; that requires a tested reverse translator or forward-fix/reconciliation.
- **Exit gate:** reviewed DDL and code contract; staging dry-run passes.

### Phase 2 — Build the new stock service behind a disabled feature flag

- Implement one transactional service for `receipt`, `issue`, `move`, `return`, `quarantine`, `adjust`, and `release`. Consume `inventory_location_stock` rows with indexed, branch-validated queries; guard decrements with `quantity >= q` and validate affected-row counts.
- Use locking/serializable transaction strategy supported by TiDB, deterministic lock order and bounded retry only for real transient conflicts. Prevent write skew between source and destination and consistent totals.
- Make unit conversion explicit and consistent across item UOM, actual package quantity, `stock_base`, and clinical usage.
- Update `inventory.stock` mirror only from the same transaction, or derive on read if it cannot be guaranteed correct.
- Record the movement ledger and business/audit reference atomically.
- Add feature-flag startup guard preventing location-mode startup before successful migration validation.
- **Exit gate:** isolated DB concurrency, rollback, idempotency, branch isolation, and negative stock tests pass.

### Phase 3 — Rewire each dependent backend workflow

- Manual Staff/Admin Stock In/Out/Move; opening stock and inventory archival; location deactivation; Admin/Superadmin cross-branch inventory readers.
- Doctor consultation usage: replace FEFO batch consumption; preserve consultation finalized/draft rules; one movement per logical clinical issue; no accidental re-issue on autosave.
- Staff/Admin paid checkout: preserve existing **payment-confirmed** stock consumption trigger and gateway safeguards. Never deduct twice when reopening/refreshing, retrying or receiving duplicate PayMongo webhooks.
- Unused consultation/consumable returns and void/refund procedures: prove original issue and remaining returnable amount, then credit the authorized location once. Do not equate every refund with a physical item return.
- Supply-request approvals and transfers: entire multi-item request must be atomic; preserve transfer approval and destination checks.
- Reports, valuation, availability, stock alerts, audit history and read-only Admin/Superadmin branch summaries use canonical balances; explicitly label historical batch valuation and expiry stats as legacy rather than inventing new lot data.
- Remove batch-dependent startup reconciliation from `server/utils/schema.js` and all auto-backfill scripts that would repopulate or overwrite canonical balances. Guard older historical migrations and seeders on the new inventory mode.
- **Exit gate:** no active write path calls `inventoryBatches.js` or writes `inventory_batches`/`inventory_location_batches`; runtime static inventory import audit passes.

### Phase 4 — Simplify all frontend screens and API clients

- Inventory list: **Total on hand, available, quarantined, low-stock state, location balances**, no batch-count UI.
- Stock In: item, quantity, location, supplier, documented reason, applicable item expiry policy; display before/after.
- Stock Out: item, quantity, source location, reason and confirmation; show exact source available and clinic remaining; no batch dropdown.
- Move Stock: item, source/destination location, quantity; enforce distinct active locations; preview changes and preserve total stock; no batch dropdown.
- Remove Manage Batches and batch correction modals; replace with **Stock Adjustments** requiring appropriate permission, reason, and audit trail; never direct-edit totals without an adjustment ledger entry.
- Replace batch selectors in checkout supply editor, Bill Corrections, Staff/Admin Checkout Detail, Doctor inventory/consultation screens, stock transfer request review, Admin reports and dashboards.
- For stock item details show movement timeline and, where appropriate, archived historical batch timeline clearly marked **pre-cutover history**.
- Remove stale batch fields from frontend requests; align staff, admin and superadmin route contracts. Preserve mobile and dark-mode behavior.
- **Exit gate:** browser walkthrough of every inventory-related button in all allowed roles, including rejected/empty/expired/partial-stock scenarios.

### Phase 5 — Migration rehearsal and reconciliation in isolated TiDB

1. Copy encrypted production snapshot to **disposable TiDB staging** with sensitive data restricted; use synthetic data for write tests.
2. Stop all application writers in staging, including doctor consultation, cashier, staff inventory, webhooks and background jobs.
3. Verify current location stock against batch allocations **and** `inventory.stock`/`stock_base` at the same snapshot. Resolve discrepancies, don't take whichever number happens to be larger.
4. Physically/review-expiry map medicines with unlike expiration dates. Quarantine/unavailable stock is recorded in its own transaction and excluded from dispensing. Do not label 19 units of a mixed-expiry medicine uniformly usable.
5. Run additive migrations; initialize movement ledger cutover/opening entries with provenance and deterministic idempotency keys. **Do not fabricate individual historic stock movements** from aggregate balances.
6. Recompute derived item totals; verify totals by branch, item and location and documented quarantined/available figures. Preserve historical tables unchanged.
7. Run new code against the clone: stock in/out/move, transfer, consultation, paid billing, return, audit, expiry; simulate a mid-migration failure and rerun safely.
8. Validate source migration ledger/checksums and compare to live rollout plan. Maintain independent immutable before/after evidence and checksum manifest.
9. **Exit gate:** every reconciliation metric meets the approved tolerance (normally exact base-unit equality) with zero unexplained differences; staging restores and reruns pass.

### Phase 6 — Operational cutover, with explicit approval

- Schedule a maintenance window that **blocks all inventory-affecting writes** (including consultations and cashier collection that would consume stock), not just the Inventory page. Drain open transactions/queues. Do not drop or recreate clinical/payment data.
- Take a fresh consistent backup and snapshot, verify no inventory or billing writes occurred after the staging-rehearsal baseline, and re-run the preflight. Cancel on any unexpected difference.
- Apply reviewed additive migration and cutover reconciliation, switch active application instances together to location mode, and block stale batch endpoints/old workers.
- Run smoke tests using synthetic/approved test records; verify old and new dashboard views, staff permissions, and location stock before reopening operations.
- Watch anomaly metrics (negative balances, 409 conflicts, duplicate issues, stock mirror drift, unexpected legacy writes, reconciler invocation).
- **Do not perform this phase in the current planning task.** No deployment or database mutation authorized.

### Phase 7 — Legacy retirement only after release acceptance

- Keep existing batch tables and references as historical read-only evidence; hide old UI and disable old mutation endpoints.
- Ensure historical consultation/financial reports and refunds still resolve old records using a legacy history reader or mapped migration references. Historical records must not be overwritten.
- After retention and clinic sign-off, consider archival and eventual physical removal as **a separate independently reviewed project**. No `DROP TABLE` / `DELETE` / `TRUNCATE` in this transition.

## 5. High-priority automated / end-to-end test matrix

| ID | Test | Expected outcome |
|---|---|---|
| A01 | New item with zero opening stock | Valid item; zero canonical balances |
| A02 | Stock In to main stockroom | Exactly one location increment and ledger record |
| A03 | Duplicate Stock In request / timeout retry | Exactly-once increment |
| A04 | Stock Out within source balance | Only specified source decrements |
| A05 | Stock Out exceeds source, although another location has stock | Reject, no changes anywhere |
| A06 | Concurrent Stock Out 7+7 against 10 | At most 10 deducted; never negative |
| A07 | Move 5 from 10 in A to B | A=5, B=+5, total unchanged |
| A08 | Two simultaneous moves with competing quantity | Exactly approved amount, no negatives |
| A09 | Same source/destination / inactive destination | Reject before writing |
| A10 | Cross-branch item or location injection | 403/404; no information leak/movement |
| A11 | Staff without inventory permission | Authorization failure; no writes |
| A12 | Stock correction +/− with authorized reason | Ledger and audit record; balance consistent |
| A13 | Medicine expiry missing/expired | Reject usable receipt/dispense under approved policy |
| A14 | Mixed-expiry medicine at same location | Reject merge; require distinct SKU or approved segregation/quarantine |
| A15 | Quarantined 9 vs valid 10 from sample item | Only 10 eligible; quarantined 9 still reconciled |
| A16 | Expired stock in treatment room | Not available to doctor/checkout |
| A17 | Decimal UOM / pack-to-base conversion | Exact quantity, no float drift |
| A18 | Doctor consultation dispense then autosave retry | One issue only, no duplicate logs |
| A19 | Consultation rollback mid-issue | Zero partial ledger or balance changes |
| A20 | Paid checkout and duplicated webhook | Stock deducted once; payment remains idempotent |
| A21 | QR pending/unknown and switch-to-cash | No unsafe duplicate payment/stock deduction |
| A22 | Return unused item from correct prior issue | At most remaining refundable/returnable quantity |
| A23 | Return after source location removed/archived | Safe route or explicit hold; never arbitrary credit |
| A24 | Multi-line supply request transfer, one item insufficient | Whole request fails without partial transfer |
| A25 | Archive stocked item / delete occupied location | Reject until documented resolution |
| A26 | New schema reconciler on startup | Does NOT delete/rebuild location stock from batches |
| A27 | Repeated migration on partially/fully migrated clone | No duplicate movements; checksum unchanged |
| A28 | Recreated historic billing/consultation view | Old batch-linked records still viewable, read-only |
| A29 | Reports, low stock and branch summaries | Use canonical available/on-hand; no double counting |
| A30 | Stale old client sends batch-based API | Rejected safely; cannot invoke old engine |
| A31 | Notifications/audit for stock mutation | Correct branch, action, actor, reason, correlation |
| A32 | Inventory writer failure during cutover | Fail closed before first unauthorized write |
| A33 | React admin/staff/superadmin browser workflow | Move/Stock In/Out/Adjustment all work in supported viewports |
| A34 | Concurrency at multiple branches | Branch isolation and total invariants |
| A35 | Physical stock count vs exported snapshot | Differences explicitly reviewed, not silently overwritten |

Run existing Vitest/Node test suites, source import graph, frontend build/lint, and new DB-backed integration and browser tests. For critical concurrent operations, run repeated tests (e.g. 10+ concurrent attempts) with deterministic assertions. Track executed vs blocked tests and real outputs; do not hide failures or weaken tests.

## 6. Reconciliation, rollback, and release gates

**Pre-release NO-GO if any:** unexplained stock difference, medicine expiry not resolved, live/staging schema mismatch, mutation without audit/idempotency, cross-branch access hole, active writes still using batch tables, old reconciler still rebuilding location stock, return/refund linkage incomplete, duplicate stock deduction possible, historical report data lost, or disposable database rehearsal failing.

**Rollback realities:** Before the first new-mode stock write, application flag rollback may be possible if old data is unchanged. **After new-mode writes begin, reverting only the code is unsafe**: old batch tables are now stale. Use (1) safe forward fix, or (2) approved maintenance-mode reverse reconciliation with complete journal replay and validated data; never simply redeploy legacy code or restore old backup over new clinical/payment records.

**Deployment final acceptance:** All item/location balances reconcile exactly; mixed-expiry inventory is segregated and restricted; receipts/transfers/dispensing/returns commit exactly once; 100% of active inventory routes use new service; no active batch mutators; test suites/build pass; branch and authorization tests pass; no production PayMongo operation used in tests; staff/admin workflow and historical reports pass; migration/version markers and backup restore independently verified.

## 7. Decision checklist to approve BEFORE implementation

These are true design decisions, not questions needed to proceed with this planning document:

- [ ] **Batch removal means:** no user-facing batch selection, no new batch records or batch-dependent active operations; old historical batch tables remain read-only for audit. **Recommended.**
- [ ] **Medicine expiry:** choose the safe one-expiry-per-item/location-SKU rule, with separate SKU for different incoming expiries or approved quarantine/clear-out. Do not merge mixed-expiry usable stock.
- [ ] **Quarantine:** define restricted physical location/status, authorized transitions, disposal process, and what the available vs on-hand summary displays.
- [ ] **Stock unit:** define canonical base-unit precision and whether fractional consumables remain supported; current code has both whole-unit manual operations and fractional clinical usage.
- [ ] **Permissions:** who can make Stock In, Stock Out, Move, Adjust, Quarantine/Dispose, and Return changes; approval threshold for corrections.
- [ ] **Historical records:** retain immutable batch and financial/clinical links; agree on retention and report display.
- [ ] **Cross-branch transfers:** define source/destination accountability and whether existing request/approval workflow continues unchanged.
- [ ] **Staging and cutover:** authorize isolated TiDB test clone and, later, a separate maintenance-window production change.

## 8. Exact implementation order (do not skip dependencies)

**First:** approve expiry policy and audit current physical/DB stock.
**Second:** add new isolated ledger and single transactional location-stock service.
**Third:** rewire clinical, billing, returns, transfers, Admin/Staff and all reporting before exposing the new buttons.
**Fourth:** replace startup schema reconciliation that currently destroys/rebuilds `inventory_location_stock`.
**Fifth:** replace UI, run complete isolated regression and migration rehearsal.
**Last:** separately authorize production freeze, cutover, smoke test and monitoring. Retire old batch writers; retain old history.

### Final status

**PLAN ONLY.** No SQL run, live TiDB connection, modification of medical/financial records, deployment, or batch deletion. The current source is not safe to make batch-free by merely hiding the batch selector. The largest unresolved technical/clinical gate is mixed-expiry medicine and how to preserve safe dispensing without lot-level accounting.
