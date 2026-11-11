# Inventory filters and compact barcodes — 11 November 2026

Implemented in the local repository. No live database queries, production writes, migrations, deployment, or barcode relabeling were performed for this change.

## Result

- The shared inventory screen used by Admin, Super Admin branch workspaces, and Staff has Low Stock, Out of Stock, and Expiring in 30 Days filters. The summary cards also select these filters. Status combines with search, clinic category, and Stock Room; changing a filter resets pagination.
- Low Stock uses positive available whole units at or below the item's alert threshold. Out of Stock includes zero available units. The expiring filter uses Philippine calendar dates, including today through day 30, and checks every non-archived batch with available quantity. Expired, depleted, and fully reserved batches are excluded. A legacy item without batches can use its expiry snapshot if it has stock. Summary counts use the same predicates as the filters.
- Editing a product barcode no longer sends the hidden form's `stock: 0`. The form explicitly selects product metadata; opening quantity and expiry are sent only for item creation. Server-side stock-edit rejection remains in place. Existing quantities and batch codes are preserved during a barcode edit.
- New generated product codes use a compact category/branch prefix and the existing atomic per-branch/category sequence, for example `D1-00001` or `M1-00001`. The branch identity is encoded in base 36, avoiding long branch names/codes. No counter reset is needed.
- New batch codes use the stable inventory ID in base 36 plus a receipt sequence, for example `B2F-001`. Product barcode edits cannot change this prefix or restart an existing compact sequence. Historical batch labels remain unchanged.
- Barcode previews preserve their aspect ratio and give narrow bars more space. Automatic product codes are assigned by the server on save; the UI no longer previews an inaccurate locally guessed sequence.

## Actual validation

| Check | Result |
| --- | --- |
| New filter unit tests | 4 passed |
| New barcode and metadata-save backend tests | 5 passed |
| All frontend inventory Node regressions selected by filename | 51 passed, 0 failed |
| Selected backend Node regressions | 40 passed, 1 existing failure (41 total) |
| Selected backend Vitest inventory regressions | 11 passed, 3 existing failures (14 total) |
| Browser tests against the production frontend build with synthetic API responses | 7 passed, 0 failed |
| Frontend build, including required prebuild checks | Passed; 25 prebuild checks passed |
| Backend syntax and route checks | Passed; 376 JavaScript modules checked |
| Backend source graph | Passed; 634 source files, 1,467 relative imports resolved |
| Whitespace validation | `git diff --check` passed |

Browser checks exercise combined filtering and pagination at 1,440px and 390px, barcode saves and reloads for Admin/Super Admin/Staff, preservation of new-item opening stock and expiry, and decoding of the rendered product and batch barcode SVGs at mobile dimensions using the application's ZXing library. API responses and data are synthetic; this is not a physical scanner or live-hosting test. The owned preview server was stopped after testing.

Vite still reports the existing large-bundle advisory. There is no frontend build failure.

## Existing failures retained

These exact failures were reproduced with the committed HEAD versions of the modified application files loaded through the read-only baseline harness; the working tree was never reverted:

1. `server/tests/security/branchWriteRemediation20261015.node.cjs`: “appointment validates the doctor and service inside the requested branch transaction.” Its expected doctor query is absent from the captured calls.
2. `server/tests/security/batch2InventorySemantics.test.js`: “tracks service consumables as generic whole units and adds their Selling Price to the Service Price.”
3. The same file: “uses prescription quantity while keeping legacy dosage readable.”
4. `server/tests/security/batch5InventoryWorkflow.test.js`: “does not cap actual consumable entry to pre-checked treatment-room stock.”

The three Vitest failures are existing source-contract assertions. They are listed in `regression-results.json`; their failing names and counts exactly match the HEAD baseline. They were not changed or bypassed by this inventory fix. The complete repository regression suite was not rerun.

## Changed application/test files

- `client/src/pages/shared/Inventory.jsx`
- `client/src/utils/inventoryStatus.mjs`
- `server/utils/barcodes.js`
- `server/utils/inventoryBatches.js`
- `client/tests/inventoryStatus.node.test.mjs`
- `client/tests/browser/inventory20261111.spec.mjs`
- `server/tests/inventory/compactBarcodes.node.test.cjs`
- `server/tests/branchIntegration/branchSafetyFixes.node.cjs` (expected compact format)

QA-only files in this directory provide the baseline harness, browser runner/configuration, and a regression capture script. Generated logs/reports are ignored by Git.

Deployment requires both frontend (Cloudflare) and backend (Render) updates. There is no schema migration or data rewrite. Existing long product barcodes can be shortened using Edit Item after deployment; new product and batch generation uses the compact format. The feature checks pass, while the repository still has the four baseline failures above.
