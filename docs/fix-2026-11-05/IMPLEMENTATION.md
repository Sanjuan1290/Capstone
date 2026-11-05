# Carait Clinic — billing redesign and reported fixes

Implemented in the current repository on 5 November 2026. The four-page `fix (2).pdf` was reviewed as bug evidence; the two pasted requests define the requested work. No production deployment, migration application, live financial record reads, or live financial/inventory writes were performed.

The everyday billing workflow now uses **Payments** and **Receipts & History** through shared components for Branch Admin, Super Admin branch workspaces, and Staff. Checkout, Doctor requests, bill history, receipt rendering and notification navigation are connected. Full regression suites still have baseline failures; the focused billing checks and browser scenarios pass. See the explicit limits below.

## Resulting workflow

Doctor saves consultation → requests any reduction → completes consultation → bill appears in Pending Payments → authorized billing user reviews reductions → confirms the bill → collects one or more payments → displays receipt → views bill history.

- **Pending Payments** includes completed consultations with draft/review/approval, processing or partially paid bills. Each card shows patient, bill, service, doctor, charges, reductions and balance.
- **Failed Payments** identifies an actual failed attempt or signed failure event on the current unresolved QR attempt. It shows the provider reason, method and time and opens review/retry. A subsequent successful, cancelled or expired attempt does not remain an unresolved failure solely because of an earlier failure event. Provider verification and existing attempt locks still govern whether another collection is safe.
- **Paid Payments** requires a paid bill and enough net completed collections to cover its total. It includes method, payment date, amount and receipt references.
- **Receipts & History** supports search, pagination, optional method/status/date filters, and a dedicated bill page. History contains clinical/service details, charge and preset decisions, actors/reasons, payments, references, refunds, voids, QR attempts and a chronological activity timeline. Cancelled and expired attempts remain visible here.
- **Bill Checkout** uses Patient & Consultation Details, Bill Charges, Adjustments & Discounts, and Payment. One implementation supplies all three roles; role adapters retain each portal's protected APIs.
- Advanced reconciliation, payment investigation, discount approvals, refunds, voids and controlled corrections remain behind collapsible Admin Tools and existing authorization. Original financial controllers, OTP/password checks and reconciliation functionality remain in place.

## Access boundaries

| Actor | Billing view and history | Clinical reductions | Approval/direct actions | Advanced cash/financial tools |
| --- | --- | --- | --- | --- |
| Doctor | Own consultation and request status | Request with amount/reason; cancel own pending request | Cannot approve or reject | None |
| Staff with Billing only | Branch bills and history | None | None | None |
| Staff with Checkout | Branch bills, history, permitted collection | Request; cancel own pending request | Cannot approve/reject | May count/close only their own existing cash drawer |
| Branch Admin with Billing | Assigned branch | Apply a clearly labelled direct reduction with reason and confirmation | Independently approve/reject eligible requests; no self approval | Existing protected branch financial tools |
| Super Admin | Selected physical branch workspace | Same direct workflow | Same safeguards | Existing protected selected-branch tools |

Backend middleware enforces permissions and branch ownership. UI controls do not grant authority. Staff's former own end-of-day cash workflow is retained inside the collapsed tools area without granting global reconciliation, reopening, refunds or approval access. View-only Staff notification links open history rather than checkout.

## Root causes and fixes

| Reported issue | Cause and implementation |
| --- | --- |
| Circular JSON during manual appointment submission | A button event could become the no-show override argument. The handler now explicitly passes `false`; the shared service payload builder whitelists primitive visit fields and validates identifiers, strings, date/time and a strictly boolean override. The synchronous submission guard remains. Real browser wizard tests cover scheduled and walk-in flows for all three operational roles. |
| Notifications opening the public homepage | Legacy links could reference missing portal routes or lose selected branch context. A server-side destination resolver now verifies the notification audience, record ownership, branch, current permission and record availability, then returns a valid destination. The bell uses router navigation and waits for successful read acknowledgement. Appointment, bill, patient history, active offer, published announcement and stock destinations are handled where a corresponding portal page exists. Deleted/inaccessible records show an error. |
| Admin requesting and approving their own reduction | Administrators now apply an approved direct adjustment with mandatory reason and audit trail. Legacy administrator requests cannot be self approved, including across Admin/Super Admin identities sharing one account. Staff and Doctor approval attempts are rejected server-side. |
| One approval invalidating unrelated requests | A monetary-only change carries independent pending requests and existing preset authorizations to the new bill version. Every request is locked, resolved and audited independently, with remaining-target and total-discount caps recalculated. True charge/version changes still produce a clear conflict; rejection or requester cancellation remains possible. |
| Pending changes allowing confirmation | Both preview and confirmation reject unresolved charge or legacy preset requests and unfinished consultations. The UI explains the required resolution. |
| Doctor request before a bill exists | The owned appointment/branch is locked, clinical data is validated, and a provisional consultation/bill is safely associated when needed. Doctor requests remain pending until consultation completion. The finalized bill retains the request records. |
| Quantity changes unexpectedly changing the service price | Inventory consumption and patient pricing are now separate. Included package usage/substitution/removal retains the catalog package fee. Only explicitly additional supplies are separately billed at the configured selling price. Actual quantities are consumed by the existing consultation-completion path. A money reduction never changes consumption. |
| Discrete quantities such as 1.09 | Doctor and server validation use the inventory UOM decimal flag and precision. Discrete products require positive whole units; measured products permit configured fractions, capped at two decimals to match existing billing storage. Units, input steps and clear errors are displayed. Existing stock validation remains authoritative at completion. |
| Promotion shown beside “No Discount” | The optional field is now Additional Discount / No Additional Discount. The promotion notice separately shows the service original/current price, saved booking savings, resulting service amount, additional reductions and separately billed extras. Backend totals subtract each component once. |
| Saved discounts lost on reopening | An unchanged previously authorized additional-discount snapshot survives an inactive/deleted preset. An explicit zero clears it; an increased amount still requires normal authorization. |
| Payment response retry risking duplicate collection | Checkout keeps its idempotency key through an uncertain response and across reopening in the same tab, scoped to actor, portal, bill and request signature. The existing backend ledger/idempotency checks remain authoritative. Browser coverage simulates a committed partial payment with a lost response, then retries the same key once. |
| QR failure explanation absent | Verified `payment.failed` events retain the provider explanation without unlocking the attempt or treating the whole bill as permanently failed. A later verified success still settles exactly once. |

Unsupported legacy destinations, such as the retired Doctor stock-request page and Staff marketing pages that do not exist, produce a clear unavailable-destination message instead of routing to a missing page/homepage. Patient ownership checks also apply to old notifications without a branch ID.

## Pricing and preservation rules

- A service's configured inclusive catalog price stays fixed when included clinical supply consumption changes. The details snapshot records `included_fixed_extras_separate`; separately billable extras appear as their own lines. No Purchase Cost per Unit fields were introduced.
- The saved booking promotion is retained, rather than re-evaluated against today's promotion. Its saved savings are capped by the remaining eligible booked-service amount; removing/replacing an eligible service follows the existing booked-service validation. Unrelated supplies do not receive that service promotion.
- The requested example remains **540.00 original − 135.00 promotion − 0.00 additional discount = 405.00 service total**, before explicit extras. If the current catalog service price differs, the notice shows the booked original separately and explains the saved savings.
- Additional percentage discounts use the eligible remaining amount after the promotion and approved monetary reductions. Existing saved authorizations are preserved unless explicitly changed. Currency rounding agrees across browser and server, including fractional-supply half-cent cases.
- Confirmed bills and bills with payment records cannot receive silent monetary reductions. Existing reopen/correction paths and their restrictions are preserved.
- Historical bills continue to use saved item/payment snapshots. The new list/history queries read existing ledgers; voided and failed payments are excluded from collections and refunds reduce net collections. Doctor transfers no longer hide a historical bill merely because the Doctor's current branch differs from the bill's recorded branch.

## Files

[CHANGED_FILES.txt](CHANGED_FILES.txt) lists all **97 changed or added application, configuration and test files** relative to the repository root. Documentation and generated evidence are listed separately here. The large checkout implementations were moved into one shared component; financial records and tables were not replaced.

Primary implementation groups:

- `client/src/components/billing/`: shared workspace/navigation/checkout/history, preserved financial tools, Doctor request form, reduction panel and promotion breakdown.
- `client/src/pages/{adminPage,staffPage}/`: thin portal adapters; `App.jsx` and permission routes add history and protected financial-tool routes.
- `client/src/pages/doctorPage/Doctor_Consultation.jsx`, `client/src/utils/{supplyQuantity,consultationPricing}.mjs`: quantity, pricing and request integration.
- `client/src/utils/{manualAppointment,paymentRequest,billingPortal}.mjs` and service adapters: primitive payloads, retry identity and role/branch destinations.
- `server/utils/{chargeAdjustments,billing,billingSecurity,billingViews,billHistory,supplyQuantity}.js`: financial recalculation, compatibility, shared read model and history.
- `server/controllers/{doctor,staff,billingHistory}.controller.js`, branch/staff/doctor routers: owned requests, shared history and confirmation gates.
- `server/utils/notificationDestination.js`, common controller, portal routes and affected destination pages: authenticated record navigation.
- `server/routers/paymongoGateway.js`, the additive migration and migration runner: failed-event explanations.
- New focused Node suites, updated valid source/layout fixtures, browser tests and `client/playwright.config.mjs`: regression coverage. Playwright is a development dependency.

Handoff artifacts: this report, [remaining failures](REMAINING_FAILURES.md), [machine-readable results](evidence/test-results.json), [SQL/schema evidence](evidence/billing-schema-and-sql.json), [browser results](evidence/browser-results.json), [mobile checkout capture](evidence/mobile-checkout.png), and the file manifest. Raw `.log` files remain available locally in `evidence/` under the repository's existing ignore rule.

## Database migration and rollback

New migration: [`server/db/migrations/2026-11-05-billing-failure-history.sql`](../../server/db/migrations/2026-11-05-billing-failure-history.sql).

```sql
ALTER TABLE payment_gateway_webhook_events
  ADD COLUMN failure_message VARCHAR(255) NULL;
```

It reuses the existing webhook-event history and adds one nullable explanation field. Existing events, bills, receipts, payments, reductions, refunds and stock records are preserved. The registry appends this migration after promotion pricing. Metadata guards allow safe resumption if TiDB DDL completed before its migration-ledger entry was saved. Tests cover first application, repeated application and partial-DDL recovery. Old migration SQL/checksums were not edited.

**Not applied to the configured database.** The updated history/list queries require the column, so apply the migration before starting the updated backend in an authorized staging/release environment. The normal `server` command is `npm run migrate`, with environment settings explicitly pointing to staging first. This report is not a production deployment authorization.

Before a release:

1. Restore a recent backup into an isolated staging database and verify the existing migration ledger. There is a **pre-existing foundation SQL checksum-test mismatch** described in [REMAINING_FAILURES.md](REMAINING_FAILURES.md); reconcile the authentic historical SQL/ledger before deployment. Do not update old hashes just to bypass it.
2. Install the locked dependencies, run the normal migration against staging, and check `information_schema.COLUMNS` for `payment_gateway_webhook_events.failure_message` as nullable `varchar(255)`. Verify the new migration-ledger entry and rerun migrations to confirm a no-op.
3. Build the frontend, run the checks below, and complete the staging cases. Confirm baseline financial totals/refunds/reconciliation before and after on the staging copy.
4. Schedule a normal coordinated application release only after those checks and a separate production authorization.

**Rollback:** restore the previous compatible frontend/backend deployment while keeping the nullable column and its migration-ledger entry. Older code ignores this additional field. Preserve all newly recorded event explanations, bills, decisions, receipts and payments; do not drop/empty financial tables, remove the migration entry, reverse clinical stock movements, or reapply historical transactions. There is intentionally no destructive down migration. Coordinate active gateway processing during an application version switch so events continue through the existing idempotent webhook path.

## Verification results

| Check | Result |
| --- | --- |
| Focused backend financial/clinical/notification/migration/gateway tests | **64 / 64 passed** |
| Focused frontend payload/quantity/pricing/idempotency tests | **13 / 13 passed** |
| Edge browser scenarios against the built application | **22 / 22 passed** |
| Frontend production build | Passed; **19 / 19** prebuild checks passed; existing bundle-size warning remains |
| Changed frontend source lint | **0 errors**, 4 existing warnings |
| Backend syntax / route bindings / source imports | Passed: 342 modules, 224 bindings, 583 source files, 1,339 relative imports |
| Actual database SQL planning | **22 EXPLAIN plans passed**, 261 metadata columns reviewed; 0 financial rows read, 0 mutations |
| Full client Node regression suite | **318 passed / 9 failed**, compared with 309 / 10 on clean HEAD |
| Full server Node regression suite | **574 passed / 33 failed**, compared with 532 / 35 on clean HEAD |
| Full server Vitest suite | **262 passed / 1 failed**, compared with 260 / 3 on clean HEAD |
| Full client lint | **9 errors / 21 warnings**, compared with 10 / 21 before |
| `git diff --check` | Passed |

All remaining Node failure names occur in the clean baseline; no new failing names were introduced. The exact lists, the one remaining Vitest assertion, and migration checksum evidence are recorded in [REMAINING_FAILURES.md](REMAINING_FAILURES.md). No valid financial or inventory checks were removed to manufacture a green result. Old layout assertions were updated for the requested two-tab/shared design, and broken Windows mock paths were repaired.

The read-only SQL check uses the actual query text against the configured MySQL-compatible database. Because the migration is intentionally unapplied, EXPLAIN uses a read-only derived projection for the expected nullable column. This validates query compatibility, not a writable end-to-end migration or ledger workflow. It also caught an unsupported TiDB correlated JOIN shape, which was replaced with grouped/windowed latest-attempt/event joins.

The 22 browser scenarios use real React/Vite output in Edge with mocked API transport. They verify all three operational role layouts and manual appointment wizards, independent decisions, Staff restrictions, Doctor request-only controls, whole-unit validation, promotion totals, partial-payment response retries, receipt branding/history, notification/read sequencing, mobile overflow and Staff's own cash close. Backend tests exercise real financial and consultation functions with deterministic database/provider fixtures, including consultation completion → draft bill → approve/reject and signed failed-event → verified success behavior.

Reproduction commands, from their respective directories:

```text
client: npm run build
client: npm run test:billing
client: node --test tests/*.test.mjs
client: npm run lint
client: npm run test:browser
server: npm test
server: npm run test:node
server: npm run check:syntax
server: npm run check:routes
server: npm run verify:source
server: node scripts/verifyBillingRedesignReadOnly.js
server: node --test tests/billing/*20261105.node.test.cjs tests/notifications/navigation20261105.node.test.cjs tests/deployment/billingFailureMigration20261105.node.test.cjs tests/gateway/paymongoWebhook.node.cjs tests/serviceCustomization.node.test.cjs tests/consultationSupplyReasonPolicy.node.test.cjs
```

On this managed Windows environment, browser verification used an explicitly started hidden Vite preview process and `CARAIT_UI_EXTERNAL_SERVER=1`, then stopped that exact process in a `finally` block. Playwright defaults to the installed Edge binary on Windows; `CARAIT_BROWSER_PATH` can select another compatible installed browser. No application backend was started, because startup can apply migrations to the configured database.

## Required staging validation and remaining limits

The implementation is ready for staging review. No live financial records were queried or changed, no production deployment occurred, and the migration remains pending. A writable staging database, real provider test-mode calls, full historical-data reconciliation and large-dataset performance were not exercised. The broad baseline suite failures remain open; this report does not certify unrelated auth, report, provisioning or prescription-printing behavior.

Run these acceptance cases using a staging copy and gateway **test mode**:

1. Complete a Doctor consultation without a request; verify fixed service price, once-only inventory consumption and visibility in Pending Payments.
2. Request a reduction before completion; ensure the same owned provisional bill retains it and Admin approval only succeeds after completion.
3. Reject a request with a reason; verify unchanged payable amount and recorded reviewer/reason.
4. Create three independent requests; approve/reject/approve and check every status, version, remaining cap and audit entry. Test same-target conflicts.
5. Attempt approval as Staff/Doctor and as the original legacy Admin requester; expect rejection. Test an authorized direct adjustment with mandatory reason and confirmation.
6. Leave a request unresolved; verify both preview and confirmation block it. Cancel an own request or reject it explicitly, then confirm.
7. Book the 540.00 service with 135.00 saved promotion; follow consultation, checkout, payment, receipt, history and report totals. Also test a catalog price change and an inactive additional-discount preset without double application.
8. Change included discrete use from 1 to 2; verify stable package price and actual consumption. Reject 1.09 discrete units; accept configured measured fractions and charge only explicit extras.
9. Simulate failed, cancelled and expired QR attempts, then retry through verified provider state and successfully pay. Check actual failure reason/history without unsafe unlocking or duplicate receipts.
10. Record 100.00 then 305.00 on a 405.00 bill; verify remaining balance and final two-payment receipt history. Test a lost response, double click and checkout reopening.
11. Review historical bills with cancelled/expired/failed attempts, paid/voided payments and partial/full refunds; compare net collected amounts, receipts, audit and reconciliation to the staging baseline.
12. Close a Staff user's own cash drawer; ensure collections are blocked until an authorized administrator reopens it and no global reconciliation/refund controls are granted.
13. Repeat within each branch and a Super Admin selected-branch workspace, including a transferred Doctor's historical bill and view-only Staff notification access. Attempt cross-branch IDs directly.
14. Click appointment, billing, active promotion, announcement and stock notifications for supported roles; verify matching record, selected branch, session and unread state. Verify deleted/expired/unsupported destinations show a useful error.
