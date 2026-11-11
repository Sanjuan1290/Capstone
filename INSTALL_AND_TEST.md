# Carait Clinic — Proposed code updates (November 11, 2026)

**Input version:** `AllCodes(20261111-024447).txt`.
**This is a working-code patch, not a production deployment.** No live database was changed.

## Included changes

- Inventory labels in the service editor and consultation screen now say **Item** instead of Supply or Consumable in the changed UI.
- Doctors can still replace/remove/change service items. Doctors can now also write which part of a service they did not perform. Staff/Admin see that note at checkout and may use the existing approved price reduction process. Price is **not reduced automatically**.
- Doctors see a warning when an item's available quantity is zero.
- Optional unified stock-out behind `UNIFIED_BILLING_STOCKOUT=1`. At consultation completion, actual item usage creates a pending inventory record that reduces *available* stock without immediately changing *recorded* stock. After full payment, clinical and checkout items are deducted in the payment transaction. Partial payment leaves the clinical usage pending. The Admin checkout has a separate action for used items when the patient does not pay.
- The inventory page can show Recorded / Used-Pending / Available. The old stock workflow stays active while the flag is off.
- Registration and registration-code resend share a database-backed **3 SMS/hour per number** quota and **60-second resend pause**. Existing login protections are unchanged.
- Refresh hook avoids overlapping calls, skips hidden tabs, and limits rapid repeated refreshes.
- Public, staff and doctor queue displays show clinic- and doctor-specific labels (for example `MED-D2-001` and `DER-D4-001`). Stored queue numbers are unchanged.

## What still needs work and testing

1. The optional stock-out flow has **not** been tested against a running MySQL/TiDB clone, real PayMongo responses, full refunds, or multiple cashiers at the same time. Keep `UNIFIED_BILLING_STOCKOUT` **unset or set to 0** until this testing passes and the clinic agrees to the rules.
2. Frontend and backend production builds and the full test suites could not run here because package dependencies and a working database are not supplied in the exported text file.
3. Stock warnings are shown to doctors in consultation; **patient booking screens do not yet give a stock warning**. No booking is automatically blocked.
4. Some older components and backend table/field names still use `supply` or `consumable`. They remain for compatibility and must not be renamed blindly.
5. No automatic charge deduction was added for a skipped treatment step. Admin must review and approve the reduction in the existing checkout interface.
6. The optional stock process needs extra end-to-end testing of returns, cancelled visits, expired batches, stock transfers, stockroom totals, and switching the feature flag during a pending visit. Do not switch it on/off when pending records exist.
7. There is no signed deployment verification or proof that the patched files match your current Git HEAD. Compare with your current branch before merging.

## How to review and apply

1. Create a backup branch/commit in the **actual** repository first.
2. Review the `.patch` file. `git apply --check carait_clinic_implementation_20261111.patch` should succeed only if your working files still match the exported baseline.
3. Use `git apply carait_clinic_implementation_20261111.patch`, **or** copy the included `client/` and `server/` changed files into your checkout, preserving the subdirectories. Do not do both.
4. Review the two added SQL migrations. Apply migration changes only in a disposable test database first. Do **not** apply them directly to production from this package.
5. Run the actual project's frontend build, backend syntax and unit tests, migration tests, and full browser and payment tests against the isolated database.
6. Keep `UNIFIED_BILLING_STOCKOUT=0` until each patient payment/stock scenario is verified; no change to this env var is required to use the small UI, queue, SMS and polling updates.

## Isolated checks performed in this environment

- JavaScript Node syntax: 19 changed `.js/.mjs/.cjs` files, zero syntax failures.
- React JSX syntax: 11 changed `.jsx` files parsed with TypeScript, zero parse failures.
- Focused Node tests: **6 passed** (SMS quota, queue prefixes, basic pending stock selection and flag defaults).
- The database migration SQL and shared payment code were inspected, but **no real database migration/payment was executed**.

**Important:** Do not merge into the live deployed system without comparing against the latest Git commit and carrying out the missing database and payment tests.
