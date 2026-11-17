# fix (19).pdf implementation

Source: `C:\Users\Robert\Downloads\fix (19).pdf` (one page; the two embedded reference images are included in this folder).

## Changes

- Removed outstanding/remaining balance cards and rows from reports, exports, billing summaries, patient records, patient history and printed receipts.
- Removed remaining partial-payment tabs and labels. Existing transaction amounts and internal ledger balances are preserved.
- Checkout requires full settlement. Cash tendered may equal or exceed the amount due; extra cash is returned as change.
- Super Admin's Overview navigation now expands Clinic Branches into All Branches plus active branch shortcuts. Each shortcut opens its branch workspace.
- The branch menu supports loading, errors/retry, empty results, live updates, mobile navigation, keyboard access and reduced motion.

## Verification

- Production build and its 25 prerequisite checks passed (`build.log`).
- 51 targeted client tests passed (`client-targeted-tests.log`).
- Nine backend payment tests passed, including exact tender, excess tender/change, insufficient cash, partial-collection rejection and duplicate-request protection.
- Seven browser scenarios passed: active-branch selection, error/retry and status refresh, mobile/reduced motion, full payment in Admin/Super Admin/Staff, and all five report sections with PDF export.
- ESLint reported zero errors in changed source files; nine existing warnings remain.
- Working-tree whitespace checks passed.

## Existing source-inspection failures

The wider client run (`client-tests.log`) also encountered four unrelated assertions: dark-mode classes, a weekday constant, an inline promotion URL, and the exact phrase `approved reductions`.

The corresponding production files are byte-for-byte unchanged from HEAD, and those asserted strings are already absent in HEAD. These files and expectations were left outside this change. The focused run excludes those four unrelated assertions.

Screenshots: `active-branch-shortcuts.png` and `mobile-branch-shortcuts.png`.
