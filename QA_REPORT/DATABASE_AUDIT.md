# Database audit

Date: 2026-11-09. Workspace: CAPSTONE; Windows, Node v22.15.0. No deployment, commit, push, production migration, or production application-data writes were performed. Source database access was limited to metadata and the migration ledger; the metadata copy contains no patient/application rows. All mutations used a separate loopback MySQL 8.0.41 instance (port 33409, database carait_qa_20261109) and synthetic accounts. External provider delivery was blocked by the audit network guard.

## Structure and isolation

Source metadata: 85 read statements, 0 writes, 0 application rows copied; 81 tables, 929 columns and 407 index-column entries. [database-metadata.json](evidence/database-metadata.json) records types, defaults, nullability, primary/unique/index definitions, foreign keys and SHOW CREATE definitions. Foreign-key column entries: 99. These counts are inventory, not a claim that every relationship is correct.

The separate native MySQL instance bound to 127.0.0.1:33409 and used schema carait_qa_20261109. Accounts, branches, appointments, consultations, payments and stock were synthetic. The source migration ledger contained 0 rows; no patient records were copied. Test runner strips local .env values and loads scripts/audit/networkGuard.cjs. Metadata acquisition is a separate explicitly read-only source operation.

## Executed checks

| Check | Status | Evidence / limits |
| --- | --- | --- |
| Native migration replay and repeat | PASS | Existing schema with empty copied migration ledger; source not migrated. Fixed ambiguous foundation upsert, duplicate doctor branch DDL and MySQL additive syntax. |
| SELECT planning | FAIL | 681 static, direct, non-dynamic SELECT query literals checked with parameterized EXPLAIN; 5 fail in optional ledger code |
| Report SQL | PASS | 19 queries validated by the repository verifier against isolated MySQL |
| Native billing integrity | PASS | Staff55 + Admin20 + Super Admin10 reductions on 1000 -> 915; version increments, one direct audit event, no inventory movement for money-only reductions; cash retry creates one payment/receipt. |
| Clinical stock / transaction integrity | PASS | Draft does not consume. Insufficient stock rolls clinical state back. Successful finalize consumes one unit (10 -> 9); repeat finalization cannot consume twice. |
| Branch attribution | PASS for named cases | Branch-1 Admin/Staff denied workspace branch2; Doctor branch2 start from selected branch1 returns404 without mutation; patient cannot read another patient bill. |
| Directory / ban state | PASS | Name/email/phone search, gender/address/history shape, boolean validation, ban revocation and unban does not revive old token. |
| All dynamic SQL and all write variants | NOT TESTED | Static candidates are recorded in sql-inventory.json; EXPLAIN success does not validate transaction semantics or numerical correctness. |
| All dashboard counts, no-shows, low-stock/report reconciliations | NOT TESTED | Partial existing unit tests and report planning only; no claim of exhaustive business-data reconciliation. |

## Optional ledger failures

| Source | Line | Error |
| --- | --- | --- |
| server/routers/branchLocationStock.js | 17 | Table 'carait_qa_20261109.inventory_stock_eligibility' doesn't exist |
| server/utils/inventoryLocationStock.js | 22 | Table 'carait_qa_20261109.inventory_stock_mode' doesn't exist |
| server/utils/inventoryLocationStock.js | 90 | Table 'carait_qa_20261109.inventory_stock_movements' doesn't exist |
| server/utils/inventoryLocationStock.js | 104 | Table 'carait_qa_20261109.inventory_stock_eligibility' doesn't exist |
| server/utils/inventoryModeSafety.js | 8 | Table 'carait_qa_20261109.inventory_stock_mode' doesn't exist |

These paths belong to a disabled location-ledger cutover. Legacy batch mode explicitly checks mode state before operation and passed the clinical stock test. Activation is outside this fix; do not patch missing optional tables without reconciling balances.

No Purchase Cost per Unit input, spreadsheet template or workflow was added. Existing legacy database cost columns were not removed or used to reprice the saved service total.
