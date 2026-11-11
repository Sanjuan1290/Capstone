# Added QA evidence

All files below are additions under QA_REPORT/conflict-repair-2026-11-11/. No earlier report was replaced. Browser PDFs/screenshots and the temporary synthetic datadir are local artifacts.

| File | Purpose |
| --- | --- |
| [.gitignore](.gitignore) | Exclude generated browser/PDF and temporary tool artifacts from source control. |
| [API_ENDPOINT_AUDIT.csv](API_ENDPOINT_AUDIT.csv) | Runtime endpoint/authentication audit. |
| [EVIDENCE_MANIFEST.md](EVIDENCE_MANIFEST.md) | Inventory of added nonignored QA files. |
| [QA_REPORT.md](QA_REPORT.md) | Actual-result report, changed files, remaining failures and deployment readiness. |
| [api-smoke-results.json](api-smoke-results.json) | Structured command result, schema-only metadata, verification case evidence or synthetic-instance guard. |
| [api-smoke.cjs](api-smoke.cjs) | Exercise synthetic API flows, route auth and safe SELECT EXPLAIN candidates. |
| [api-smoke.json](api-smoke.json) | Structured command result, schema-only metadata, verification case evidence or synthetic-instance guard. |
| [api-smoke.log](api-smoke.log) | Captured command output, including retained failures. |
| [browser-results.json](browser-results.json) | Structured command result, schema-only metadata, verification case evidence or synthetic-instance guard. |
| [browser-suite.cjs](browser-suite.cjs) | Serve a stable built-client snapshot and run browser tests. |
| [browser.json](browser.json) | Structured command result, schema-only metadata, verification case evidence or synthetic-instance guard. |
| [browser.log](browser.log) | Captured command output, including retained failures. |
| [check-evidence.cjs](check-evidence.cjs) | Check fresh evidence, confidentiality, conflict scan, source scope and row-preservation assertions. |
| [cleanup-db.cjs](cleanup-db.cjs) | Guard the exact synthetic instance and stop it after verifying the ledger. |
| [cleanup-results.json](cleanup-results.json) | Structured command result, schema-only metadata, verification case evidence or synthetic-instance guard. |
| [client-build.json](client-build.json) | Structured command result, schema-only metadata, verification case evidence or synthetic-instance guard. |
| [client-build.log](client-build.log) | Captured command output, including retained failures. |
| [client-lint-results.json](client-lint-results.json) | Structured command result, schema-only metadata, verification case evidence or synthetic-instance guard. |
| [client-lint.json](client-lint.json) | Structured command result, schema-only metadata, verification case evidence or synthetic-instance guard. |
| [client-lint.log](client-lint.log) | Captured command output, including retained failures. |
| [client-node.json](client-node.json) | Structured command result, schema-only metadata, verification case evidence or synthetic-instance guard. |
| [client-node.log](client-node.log) | Captured command output, including retained failures. |
| [clinical-workflow-results.json](clinical-workflow-results.json) | Structured command result, schema-only metadata, verification case evidence or synthetic-instance guard. |
| [clinical-workflow.cjs](clinical-workflow.cjs) | Run real local API/MySQL/React workflows, including separate successful Super Admin reversal. |
| [clinical-workflow.json](clinical-workflow.json) | Structured command result, schema-only metadata, verification case evidence or synthetic-instance guard. |
| [clinical-workflow.log](clinical-workflow.log) | Captured command output, including retained failures. |
| [conflict-scan.json](conflict-scan.json) | Structured command result, schema-only metadata, verification case evidence or synthetic-instance guard. |
| [database-metadata.json](database-metadata.json) | Structured command result, schema-only metadata, verification case evidence or synthetic-instance guard. |
| [database-schema.cjs](database-schema.cjs) | Copy read-only schema definitions to the isolated instance without source application rows. |
| [database-schema.json](database-schema.json) | Structured command result, schema-only metadata, verification case evidence or synthetic-instance guard. |
| [database-verification.json](database-verification.json) | Structured command result, schema-only metadata, verification case evidence or synthetic-instance guard. |
| [disposable-db.cjs](disposable-db.cjs) | Create a separate loopback MySQL instance and datadir. |
| [evidence-check-results.json](evidence-check-results.json) | Structured command result, schema-only metadata, verification case evidence or synthetic-instance guard. |
| [export-comparison.json](export-comparison.json) | Structured command result, schema-only metadata, verification case evidence or synthetic-instance guard. |
| [focused-client.json](focused-client.json) | Structured command result, schema-only metadata, verification case evidence or synthetic-instance guard. |
| [focused-client.log](focused-client.log) | Captured command output, including retained failures. |
| [focused-server.json](focused-server.json) | Structured command result, schema-only metadata, verification case evidence or synthetic-instance guard. |
| [focused-server.log](focused-server.log) | Captured command output, including retained failures. |
| [initial-fixture-attempt.json](initial-fixture-attempt.json) | Disclose corrected harness prerequisites and initial failed attempts. |
| [inspect-print.py](inspect-print.py) | Inspect A5 geometry, page count and retained text using the existing ignored inspection package. |
| [inventory-sql.cjs](inventory-sql.cjs) | AST-only extraction of current runtime SQL candidates; never executes source/queries. |
| [live-schema-verification.json](live-schema-verification.json) | Structured command result, schema-only metadata, verification case evidence or synthetic-instance guard. |
| [migration-unit.json](migration-unit.json) | Structured command result, schema-only metadata, verification case evidence or synthetic-instance guard. |
| [migration-unit.log](migration-unit.log) | Captured command output, including retained failures. |
| [migration-verification.json](migration-verification.json) | Structured command result, schema-only metadata, verification case evidence or synthetic-instance guard. |
| [migration-verify.json](migration-verify.json) | Structured command result, schema-only metadata, verification case evidence or synthetic-instance guard. |
| [migration-verify.log](migration-verify.log) | Captured command output, including retained failures. |
| [mysql-instance.json](mysql-instance.json) | Structured command result, schema-only metadata, verification case evidence or synthetic-instance guard. |
| [mysql-isolated-init.log](mysql-isolated-init.log) | Captured command output, including retained failures. |
| [mysql-isolated-start.log](mysql-isolated-start.log) | Captured command output, including retained failures. |
| [playwright.config.mjs](playwright.config.mjs) | Use installed Edge and separate current browser output paths. |
| [prepare.cjs](prepare.cjs) | Prepare separate QA outputs and adapted synthetic harness without overwriting prior reports. |
| [print-check.mjs](print-check.mjs) | Generate synthetic receipt PDFs in installed Chrome/Edge. |
| [print-results.json](print-results.json) | Structured command result, schema-only metadata, verification case evidence or synthetic-instance guard. |
| [review-export.cjs](review-export.cjs) | Decode the available export and compare pre-repair/current source and valid parent. |
| [run.cjs](run.cjs) | Execute named checks with synthetic settings and a network guard; record output/status. |
| [scan-conflicts.cjs](scan-conflicts.cjs) | Scan hidden/ignored source for all Git conflict marker kinds with explicit cache/dependency exclusions. |
| [server-node.json](server-node.json) | Structured command result, schema-only metadata, verification case evidence or synthetic-instance guard. |
| [server-node.log](server-node.log) | Captured command output, including retained failures. |
| [server-postinstall.json](server-postinstall.json) | Structured command result, schema-only metadata, verification case evidence or synthetic-instance guard. |
| [server-postinstall.log](server-postinstall.log) | Captured command output, including retained failures. |
| [server-source.json](server-source.json) | Structured command result, schema-only metadata, verification case evidence or synthetic-instance guard. |
| [server-source.log](server-source.log) | Captured command output, including retained failures. |
| [server-syntax.json](server-syntax.json) | Structured command result, schema-only metadata, verification case evidence or synthetic-instance guard. |
| [server-syntax.log](server-syntax.log) | Captured command output, including retained failures. |
| [server-vitest-results.json](server-vitest-results.json) | Structured command result, schema-only metadata, verification case evidence or synthetic-instance guard. |
| [server-vitest.json](server-vitest.json) | Structured command result, schema-only metadata, verification case evidence or synthetic-instance guard. |
| [server-vitest.log](server-vitest.log) | Captured command output, including retained failures. |
| [sql-inventory.json](sql-inventory.json) | Structured command result, schema-only metadata, verification case evidence or synthetic-instance guard. |
| [test-summary.json](test-summary.json) | Machine-readable fresh counts and limitations. |
| [verify-final-db.cjs](verify-final-db.cjs) | Verify exact post-workflow row hashes, totals and history under local migration replay. |
| [verify-live-schema.cjs](verify-live-schema.cjs) | Read only the three live column definitions and migration ledger; no application import or write. |
| [verify-local-migration.cjs](verify-local-migration.cjs) | Verify existing-column guards, initial/repeat local migration and ledger preservation. |
| [write-report.cjs](write-report.cjs) | Generate this report, summary and evidence inventory from actual results. |
