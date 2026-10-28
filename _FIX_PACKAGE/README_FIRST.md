# CARAIT Clinic — October 28 Complete Source + Inventory / QR Fixes

This archive contains the **reconstructed full source** from `AllCodes(20261028-101939).txt` with the focused October 28 safe fixes integrated.

## Included fixes

- `server/routers/branches.router.js`: enriches Admin/Superadmin branch-scoped inventory responses with actual batch and location allocations. This enables the stock-out, move-stock and manage-batches UI to receive the existing data.
- `client/src/components/billing/QrPhPaymentPanel.jsx`: preserves the PayMongo payment lock when a QR is still payable; clarifies QR-to-cash cancellation / reconciliation instructions. Does NOT enable unsafe cancellation.
- New regression tests: `server/tests/branchIntegration/branchInventoryBatches20261028.node.cjs` and `client/tests/batch28QrToCashSafety.node.test.mjs`.

## Apply

**For an existing Git checkout, prefer the focused patch rather than overwriting newer source files.** From your repository root: `git apply --check _FIX_PACKAGE/CARAIT_Oct28_Inventory_QR_Safety_Fixes.patch`, then `git apply ...` if the check succeeds. The patch targets the original Oct28 export and will not apply to an already-patched checkout.

If using this complete codebase instead, unpack into a separate directory; compare with your Git working tree before updating. Do not copy `.env` or database backups into the repo.

## Local verification performed

- Source graph: 453 source files / 1,103 relative imports resolved.
- Client Node tests: 103/103 passed.
- Targeted inventory API tests: 2/2 passed.
- QR UI tests were included in the previously prepared focused package; full authenticated browser and TiDB/PayMongo integration are NOT certified.

## Known limitations and outstanding issues

- The flattened AllCodes export references public PNG images via `.source_url` files and does not embed 13 original image binaries. Fetch them from your original Git repository.
- The original patient/payment database backup is deliberately **not included**. No DB migration is required for these focused source changes.
- These fixes do **not** implement Staff Promotions permissions, finalized clinical record load diagnosis, persistent Patient branch selection, or header alignment.
- Live PayMongo QR-to-cash remains restricted until the provider confirms a terminal nonpayable state; no unsafe force-cash workaround is included.
- These are locally prepared fixes. No production deployment, live migration or live stock/payment movement has been executed.

Review `_FIX_PACKAGE/CARAIT_Oct28_Issues_and_QA_Report.md` for technical details.
