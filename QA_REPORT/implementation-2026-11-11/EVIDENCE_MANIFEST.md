# Added QA files

All files below are additions in QA_REPORT/implementation-2026-11-11/. No earlier QA report was replaced. Browser screenshots/PDFs, the baseline archive/tree and the isolated inspection package are local ignored artifacts. Source changes and their purposes are listed in IMPLEMENTATION_REPORT.md.

| File | Purpose |
| --- | --- |
| [.gitignore](.gitignore) | Keep temporary baseline dependencies, inspection tools and generated visual artifacts out of source control. |
| [API_ENDPOINT_AUDIT.csv](API_ENDPOINT_AUDIT.csv) | Runtime endpoint inventory and authentication-probe results. |
| [EVIDENCE_MANIFEST.md](EVIDENCE_MANIFEST.md) | Inventory of all added nonignored QA files and their purposes. |
| [IMPLEMENTATION_REPORT.md](IMPLEMENTATION_REPORT.md) | The seven-part implementation, verification and deployment report. |
| [REFERENCE_COMPARISON.md](REFERENCE_COMPARISON.md) | Newly supplied code export and historical migration comparison, scope and schema evolution. |
| [api-smoke-results.json](api-smoke-results.json) | Structured verification outcomes and recorded case evidence. |
| [api-smoke.cjs](api-smoke.cjs) | Inventory routes and run authentication, API workflow and SQL-plan checks against the isolated database. |
| [api-smoke.json](api-smoke.json) | Command status, duration or schema-verification metadata. |
| [api-smoke.log](api-smoke.log) | Captured command output; failures remain preserved. |
| [baseline-browser-results.json](baseline-browser-results.json) | Structured verification outcomes and recorded case evidence. |
| [baseline-client-build.json](baseline-client-build.json) | Command status, duration or schema-verification metadata. |
| [baseline-client-build.log](baseline-client-build.log) | Captured command output; failures remain preserved. |
| [baseline-client-lint.json](baseline-client-lint.json) | Command status, duration or schema-verification metadata. |
| [baseline-client-lint.log](baseline-client-lint.log) | Captured command output; failures remain preserved. |
| [baseline-client-node.json](baseline-client-node.json) | Command status, duration or schema-verification metadata. |
| [baseline-client-node.log](baseline-client-node.log) | Captured command output; failures remain preserved. |
| [baseline-print-results.json](baseline-print-results.json) | Structured verification outcomes and recorded case evidence. |
| [baseline-server-node.json](baseline-server-node.json) | Command status, duration or schema-verification metadata. |
| [baseline-server-node.log](baseline-server-node.log) | Captured command output; failures remain preserved. |
| [baseline-server-vitest-results.json](baseline-server-vitest-results.json) | Structured verification outcomes and recorded case evidence. |
| [baseline-server-vitest.json](baseline-server-vitest.json) | Command status, duration or schema-verification metadata. |
| [baseline-server-vitest.log](baseline-server-vitest.log) | Captured command output; failures remain preserved. |
| [browser-focused.json](browser-focused.json) | Command status, duration or schema-verification metadata. |
| [browser-focused.log](browser-focused.log) | Captured command output; failures remain preserved. |
| [browser-results.json](browser-results.json) | Structured verification outcomes and recorded case evidence. |
| [browser-suite.cjs](browser-suite.cjs) | Serve the selected built client snapshot and launch Playwright. |
| [browser.json](browser.json) | Command status, duration or schema-verification metadata. |
| [browser.log](browser.log) | Captured command output; failures remain preserved. |
| [check-evidence.cjs](check-evidence.cjs) | Verify report completeness, artifact retention, diff hygiene and absence of private configuration values. |
| [cleanup-db.cjs](cleanup-db.cjs) | Verify the synthetic instance and migration ledger, stop it, and remove generated copies of PDF reference pages. |
| [cleanup-results.json](cleanup-results.json) | Verified synthetic database shutdown and reference-page cleanup results. |
| [client-build.json](client-build.json) | Command status, duration or schema-verification metadata. |
| [client-build.log](client-build.log) | Captured command output; failures remain preserved. |
| [client-lint-results.json](client-lint-results.json) | Structured verification outcomes and recorded case evidence. |
| [client-lint.json](client-lint.json) | Command status, duration or schema-verification metadata. |
| [client-lint.log](client-lint.log) | Captured command output; failures remain preserved. |
| [client-node.json](client-node.json) | Command status, duration or schema-verification metadata. |
| [client-node.log](client-node.log) | Captured command output; failures remain preserved. |
| [clinical-workflow-results.json](clinical-workflow-results.json) | Structured verification outcomes and recorded case evidence. |
| [clinical-workflow.cjs](clinical-workflow.cjs) | Exercise the real local API, built React views and synthetic MySQL data end to end. |
| [clinical-workflow.json](clinical-workflow.json) | Command status, duration or schema-verification metadata. |
| [clinical-workflow.log](clinical-workflow.log) | Captured command output; failures remain preserved. |
| [compare-references.cjs](compare-references.cjs) | Decode the supplied source export and compare it with baseline/worktree; check the August migration against saved schema metadata without executing either reference. |
| [database-metadata.json](database-metadata.json) | Schema definitions only; no source application rows or credentials. |
| [database-schema.cjs](database-schema.cjs) | Read source schema metadata only and reconstruct the isolated schema without copying application rows. |
| [database-schema.json](database-schema.json) | Command status, duration or schema-verification metadata. |
| [database-verification.json](database-verification.json) | Command status, duration or schema-verification metadata. |
| [disposable-db.cjs](disposable-db.cjs) | Create the disposable loopback MySQL instance in a new temporary directory. |
| [evidence-check-results.json](evidence-check-results.json) | Final report, privacy, artifact and diff verification results. |
| [focused-client.json](focused-client.json) | Command status, duration or schema-verification metadata. |
| [focused-client.log](focused-client.log) | Captured command output; failures remain preserved. |
| [focused-server.json](focused-server.json) | Command status, duration or schema-verification metadata. |
| [focused-server.log](focused-server.log) | Captured command output; failures remain preserved. |
| [inspect-print.py](inspect-print.py) | Check printed A5 geometry, page counts and retained receipt text with PyMuPDF. |
| [migrate.json](migrate.json) | Command status, duration or schema-verification metadata. |
| [migrate.log](migrate.log) | Captured command output; failures remain preserved. |
| [migration-fixture-missing-policy.log](migration-fixture-missing-policy.log) | Captured command output; failures remain preserved. |
| [mysql-instance.json](mysql-instance.json) | Local synthetic instance PID, port and temporary data-directory guard. |
| [mysql-isolated-init.log](mysql-isolated-init.log) | Captured command output; failures remain preserved. |
| [mysql-isolated-start.log](mysql-isolated-start.log) | Captured command output; failures remain preserved. |
| [playwright.config.mjs](playwright.config.mjs) | Separate baseline/current Playwright results and artifact output directories. |
| [print-check.mjs](print-check.mjs) | Generate baseline/current synthetic receipts with installed Chrome and Edge PDF print engines. |
| [print-results.json](print-results.json) | Structured verification outcomes and recorded case evidence. |
| [reference-comparison.json](reference-comparison.json) | Normalized file hashes, reference/baseline/worktree classifications and historical schema checks. |
| [run.cjs](run.cjs) | Execute named checks with synthetic environment settings and external network blocking. |
| [server-node.json](server-node.json) | Command status, duration or schema-verification metadata. |
| [server-node.log](server-node.log) | Captured command output; failures remain preserved. |
| [server-postinstall.json](server-postinstall.json) | Command status, duration or schema-verification metadata. |
| [server-postinstall.log](server-postinstall.log) | Captured command output; failures remain preserved. |
| [server-vitest-results.json](server-vitest-results.json) | Structured verification outcomes and recorded case evidence. |
| [server-vitest.json](server-vitest.json) | Command status, duration or schema-verification metadata. |
| [server-vitest.log](server-vitest.log) | Captured command output; failures remain preserved. |
| [sql-inventory.json](sql-inventory.json) | Source SQL-statement inventory used by the isolated plan checks. |
| [test-summary.json](test-summary.json) | Machine-readable baseline/current counts and verification limitations. |
| [verify-db.cjs](verify-db.cjs) | Verify financial/schema invariants and prepare guarded re-entry of the new migration in the synthetic schema. |
| [write-report.cjs](write-report.cjs) | Generate this report, result summary and evidence inventory from recorded checks. |
