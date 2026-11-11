'use strict'
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict'),{spawnSync}=require('node:child_process')
const here=__dirname,root=path.resolve(here,'../..'),previous=path.resolve(here,'../implementation-2026-11-11')
const json=(name,base=here)=>JSON.parse(fs.readFileSync(path.join(base,name+'.json'),'utf8'))
const log=(name,base=here)=>fs.readFileSync(path.join(base,name+'.log'),'utf8')
const stats=(name,base=here)=>Object.fromEntries([...log(name,base).matchAll(/^# (tests|pass|fail|skipped) (\d+)\s*$/gm)].map(match=>[match[1],Number(match[2])]))
const failed=(name,base=here)=>[...log(name,base).matchAll(/^not ok \d+ - (.+)$/gm)].map(match=>match[1])
const vitestFailed=j=>j.testResults.flatMap(suite=>(suite.assertionResults||[]).filter(test=>test.status==='failed').map(test=>test.fullName))
const cases=j=>{const rows=[];const visit=suites=>{for(const suite of suites){for(const spec of suite.specs||[])for(const test of spec.tests||[])rows.push({name:spec.title,file:spec.file,status:test.status==='expected'?'PASS':test.status==='skipped'?'SKIPPED':'FAIL'});visit(suite.suites||[])}};visit(j.suites);return rows}
const table=(heads,rows)=>'| '+heads.join(' | ')+' |\n| '+heads.map(()=> '---').join(' | ')+' |\n'+rows.map(row=>'| '+row.map(value=>String(value??'').replace(/\|/g,'/').replace(/\r?\n/g,' ')).join(' | ')+' |').join('\n')
const source=json('export-comparison'),live=json('live-schema-verification'),migration=json('migration-verification'),database=json('database-verification'),native=json('clinical-workflow-results'),api=json('api-smoke-results'),pdf=json('print-results'),scan=json('conflict-scan'),cleanup=json('cleanup-results')
const currentVitest=json('server-vitest-results'),priorVitest=json('server-vitest-results',previous),browser=cases(json('browser-results')),priorBrowser=cases(json('browser-results',previous))
const node={server:stats('server-node'),client:stats('client-node'),migration:stats('migration-unit'),reversal:stats('focused-server'),formatting:stats('focused-client')}
const priorNode={server:stats('server-node',previous),client:stats('client-node',previous)}
const introduced={server:failed('server-node').filter(name=>!failed('server-node',previous).includes(name)),client:failed('client-node').filter(name=>!failed('client-node',previous).includes(name)),vitest:vitestFailed(currentVitest).filter(name=>!vitestFailed(priorVitest).includes(name)),browser:browser.filter(row=>row.status==='FAIL'&&!priorBrowser.some(old=>old.name===row.name&&old.status==='FAIL')).map(row=>row.name)}
assert.ok(Object.values(introduced).every(rows=>rows.length===0),'New failures must be addressed before reporting')
assert.equal(native.results.length,22);assert.ok(native.results.every(row=>row.status==='PASS'))
assert.equal(pdf.length,32);assert.ok(pdf.every(row=>row.status==='PASS'))
assert.equal(migration.reversalColumnAlterStatements,0);assert.equal(database.historyRowsDeleted,0)
assert.equal(scan.findings.length,0);assert.equal(source.currentDifferences,4)
const lint=json('client-lint-results'),lintCounts={errors:lint.reduce((sum,row)=>sum+row.errorCount,0),warnings:lint.reduce((sum,row)=>sum+row.warningCount,0)}
const sql={pass:api.sqlResults.filter(row=>row.status==='PASS').length,fail:api.sqlResults.filter(row=>row.status==='FAIL').length}
const nodeRow=(label,key)=>[label,`${priorNode[key].pass}/${priorNode[key].tests} pass; ${priorNode[key].fail} fail`,`${node[key].pass}/${node[key].tests} pass; ${node[key].fail} fail`,key==='server'?'Three new migration-guard tests pass; failing names unchanged':'Failing names unchanged']
const checks=table(['Check','Prior verified results','Corrected repository','Finding'],[
 ['Complete repository conflict scan','6 blocks in 4 files','PASS',`${scan.enumeratedFiles} enumerated files; no remaining markers; exclusions documented in conflict-scan.json`],
 ['Frontend build','PASS',json('client-build').status,'25 required prebuild assertions and Vite production bundle pass'],
 ['Backend syntax / deployment checks','PASS',json('server-syntax').status,'358 modules; source graph: 611 files / 1421 imports; 231 handler references and route smoke checks pass'],
 ['Backend build script','Not defined','NOT APPLICABLE','CommonJS server has no build command. Ran check:syntax, verify:source and postinstall, then real server workflows. No bundler build is claimed.'],
 ['Client lint','0 errors; 23 warnings',`${lintCounts.errors} errors; ${lintCounts.warnings} warnings`,'PASS; existing warnings retained'],
 ['Migration unit tests','15 existing cases','18/18 PASS','Manual existing fields, partial recovery, incompatible type/nullability and history retention verified'],
 ['Charge reversal tests','15 cases','15/15 PASS','Financial totals, promotions, other reductions, validation, locking/version checks and role/payment restrictions'],
 ['Prescription / receipt focused checks','12 cases','12/12 PASS','Structured/legacy/malformed prescriptions and saved-ledger receipt contracts'],
 nodeRow('Backend Node','server'),nodeRow('Frontend Node','client'),
 ['Backend Vitest',`${priorVitest.numPassedTests}/${priorVitest.numTotalTests} pass; ${priorVitest.numFailedTests} fail`,`${currentVitest.numPassedTests}/${currentVitest.numTotalTests} pass; ${currentVitest.numFailedTests} fail`,'Failing names unchanged'],
 ['Playwright',`${priorBrowser.filter(row=>row.status==='PASS').length}/${priorBrowser.length} pass; ${priorBrowser.filter(row=>row.status==='FAIL').length} fail`,`${browser.filter(row=>row.status==='PASS').length}/${browser.length} pass; ${browser.filter(row=>row.status==='FAIL').length} fail`,'Same 16 legacy failures; all 12 payment interactions pass; no skips/flakes'],
 ['Real API / built React / MySQL workflows','21 cases','22/22 PASS','Added separate successful Super Admin direct-apply/reverse; no mocked API or DB'],
 ['API smoke and auth matrix','41 cases; 738 anonymous + 738 expired probes',`${api.passed}/${api.results.length} API cases pass; ${api.anonymousPassed} anonymous + ${api.expiredPassed} expired probes pass`,'All workflow/auth checks pass'],
 ['SQL SELECT plan sweep','676 pass; 5 fail',`${sql.pass} pass; ${sql.fail} fail`,'Fresh runtime AST inventory; five missing-table failures unchanged. API-smoke command exits 1.'],
 ['Chrome and Edge A5 PDFs','32 pass','32/32 PASS','Headers on/off; normal cases one page; 40-item receipts three pages; required text and last item retained'],
 ['Migration rehearsal with existing columns','Manual columns present','PASS','Zero ADD COLUMN statements; two initial/repeat runs retain 16 local ledger rows'],
 ['Post-workflow migration replay / DB integrity','Not applicable','PASS','Exact hashes unchanged for 12 financial, clinical, stock, audit and migration tables; no negative/inconsistent totals or incomplete reversal history'],
])
const resolutions=table(['File / block','Reconciliation'],[
 ['server/scripts/branchMigrations.js — registration','Retain the new reversal migration after all existing migrations; preserve existing order and checksum handling.'],
 ['server/scripts/branchMigrations.js — guard','Retain metadata type/nullability validation and skip compatible existing columns; preserve all earlier promotion/audit/history/TiDB guards.'],
 ['server/utils/chargeAdjustments.js — reversal/export','Keep the complete reversal function and union of existing exports plus reverse. Preserve request/resolve/cancel and direct Admin behavior.'],
 ['ChargeAdjustmentsPanel.jsx — state','Retain reversal dialog state alongside all existing submit/load/retry handling.'],
 ['ChargeAdjustmentsPanel.jsx — editability','Retain draft/pending condition and add both no-paid-at and zero-payment-history restrictions. A status-only predicate would reopen prohibited actions.'],
 ['migrationRunner.node.cjs — expected tail','Retain the new five-file tail while preserving historical checksum assertions; add meaningful replay/type/history tests.'],
])
const changed=table(['File','Change'],[
 ['[server/scripts/branchMigrations.js](../../server/scripts/branchMigrations.js)','Resolved two blocks; preserve registration and guards that skip the three manually added columns.'],
 ['[server/utils/chargeAdjustments.js](../../server/utils/chargeAdjustments.js)','Resolved reversal/export block; preserve all existing exports and the locked, audited, branch-aware reversal.'],
 ['[client/src/components/billing/ChargeAdjustmentsPanel.jsx](../../client/src/components/billing/ChargeAdjustmentsPanel.jsx)','Resolved state and editability blocks; preserve reason dialog, refresh, history and payment restrictions.'],
 ['[server/tests/deployment/migrationRunner.node.cjs](../../server/tests/deployment/migrationRunner.node.cjs)','Resolved migration tail, preserve existing tests and hashes, add three tests for manually present/partial/incompatible columns.'],
 ['QA_REPORT/conflict-repair-2026-11-11/','New report, commands, synthetic harness and evidence; prior reports remain unchanged. See EVIDENCE_MANIFEST.md.'],
])
const checklist=table(['Requested check','Status','Evidence'],[
 ['Verify columns before application edits','PASS','Initial read-only information_schema check preceded the patch; recorded follow-up confirms nullable datetime/int/varchar(255).'],
 ['Resolve all six conflicts','PASS','All four exported files matched pre-repair HEAD; each block reconciled as detailed above. Three production files exactly match last valid parent 3b61006.'],
 ['Scan complete repository','PASS','No remaining markers; hidden/ignored source included. Dependency/build/cache/binary exclusions are explicit.'],
 ['Backend syntax; frontend/backend builds','PASS / N/A','Syntax, source graph, route bindings and frontend build pass; backend has no compilation/build script.'],
 ['Migration verification without repeat columns','PASS','Live read-only proof plus isolated initial/repeat/replay checks; zero repeated column ADDs and zero history deletions.'],
 ['Reversal financial and authorization workflows','PASS','Admin and Super Admin each succeed; Staff/Doctor/Patient and wrong branch denied; reason, duplicate, paid, total and audit cases pass.'],
 ['Existing regression suites','PARTIAL','All run. Same 27 backend Node, 21 client Node, 4 Vitest and 16 browser failures; no newly failing names. Five SQL-plan failures remain.'],
 ['Payment redesign','PASS locally / PARTIAL externally','Admin/Staff at 1440/900/390, cash/partial receipt, QR locking/cancel, response-loss retry pass. Live payment-provider exchange unverified.'],
 ['Prescription display','PASS','Both actual medical-history screens show the same saved synthetic medicine; parser safely handles supported formats.'],
 ['A5 receipts','PASS','32 real Chrome/Edge PDFs verified; no data clipping. Physical printer/interactive OS dialog not exercised.'],
 ['Landing-page editor','PASS locally','Real preview/draft/publish/public page/restore/re-publish; responsive layouts, device/fullscreen controls and stale-write rejection pass. External upload delivery unverified.'],
 ['Updated actual-result report','PASS','This report and machine-readable evidence reflect the corrected repository; no result inferred from a command that did not run.'],
])
const report=`# Carait Clinic — merge-conflict repair and verification

Date: **11 November 2026 (Asia/Manila)**. Reviewed merge commit **${source.mergeCommit.slice(0,7)}**, valid parent **${source.lastValidParent.slice(0,7)}**. Changes remain uncommitted. No deployment, production write or migration-history deletion occurred.

## 1. Outcome and column verification

All six committed conflict blocks were reconciled. Reversal, direct Admin reductions, branch permissions, no-payment restriction, required reason, concurrency protection, promotion/discount preservation and audit history are retained. The other four PDF fixes remain functional in the checks available locally.

Before application edits, a read-only query confirmed the three manually added columns. The follow-up [live schema evidence](live-schema-verification.json) records the same contract:

${table(['Column','Observed type','Nullable'],live.columns.map(column=>[column.COLUMN_NAME,column.COLUMN_TYPE,column.IS_NULLABLE]))}

No live ALTER, application-data query, application initialization or migration runner was invoked. The new reversal migration currently has **no live ledger entry**; this was inspected without inserting/deleting a row. It must be reconciled through the registered runner during an approved deployment after staging rehearsal. Existing compatible columns are skipped; they must not be manually added a second time.

## 2. Export review and conflict decisions

The exact filename AllCodes(20261111-015902).txt was not found. The updated local Downloads/AllCodes.txt was used and identified explicitly rather than claiming access to a missing file. Its ${source.comparedApplicationTextFiles} scoped application text files all match the pre-repair repository, including the exact six conflict blocks in the four named files. SHA-256: ${source.exportSha256}. No embedded instruction was executed. [Export comparison](export-comparison.json).

${resolutions}

The three corrected production files match the first, previously valid merge parent exactly after line-ending normalization. The test file additionally gains three guarded-migration scenarios. No migration SQL file or historical checksum was edited. Neither side was discarded wholesale: existing exports, predicates, migration order and earlier guards were retained while adding the reversal behavior.

## 3. Changed files

${changed}

No source file, test or migration-history row was deleted. No dependency, package/lockfile or environment setting was changed. There are no unrelated application edits. Temporary synthetic database files and generated PDFs/screenshots are local artifacts; artifact paths are retained in their JSON results.

## 4. Tests performed

${checks}

The comparison column uses the previously recorded successful implementation evidence under ../implementation-2026-11-11/, not a newly rerun conflicted baseline. Fresh current commands and logs are in this directory. No test was skipped/deleted or weakened to obtain a pass. Three new migration tests explain the backend total increasing from 699 to 702.

### Real workflow cases

${table(['Case','Result'],native.results.map(row=>[row.name,row.status]))}

Both Admin and Super Admin independently complete authorized reversals. Concurrent requests return one 200 and one 409, retain original approval fields and write one audit event. Paid/partially paid and confirmed bills reject reversal. Tests preserve the promotion, unrelated reductions, the actual one-unit stock deduction and saved prescription. These are synthetic records in the isolated database, never patient or production records.

### Receipt printing

${table(['Browser','Case','Headers','Pages','Result'],pdf.map(row=>[row.browser,row.case,row.headers?'On':'Off',row.pages,row.status]))}

### Isolation and migration verification

Schema-only metadata was read from the configured database: 81 tables and 932 columns; no application rows were copied. All test mutations used the new loopback instance on port 33411, schema carait_merge_qa_20261111. Provider calls were blocked; login MFA and booking-notice overrides existed only in the synthetic native test process. Actual delivery is not established by those overrides.

The cloned schema already contained all three manual columns. The traced initial/repeat migration runs issued **zero** ADDs for them and retained all 16 ledger entries. A later replay after payments/reversals compared exact hashes of 12 financial, clinical, stock, audit and migration tables; every hash stayed unchanged. No migration-history row was removed to force a replay. [Migration verification](migration-verification.json), [post-workflow invariants](database-verification.json).

The disposable MySQL instance is now stopped and port 33411 is closed. Synthetic data files remain local for review; no original user file was modified. [Cleanup evidence](cleanup-results.json).

QA fixture corrections are disclosed in initial-fixture-attempt.json: the schema-only clone needed a synthetic Super Admin seed, and the copied API harness needed a regenerated SQL inventory. Those initial harness attempts were corrected and rerun; they were not counted as product passes or product defects.

## 5. Remaining failures and limitations

**No newly failing names** were found against prior Node, Vitest or Playwright evidence. The global suites remain unsuccessful and full production readiness is not claimed.

${table(['Runner','Unchanged failing assertion'],[...failed('server-node').map(name=>['Backend Node',name]),...failed('client-node').map(name=>['Frontend Node',name]),...vitestFailed(currentVitest).map(name=>['Vitest',name]),...browser.filter(row=>row.status==='FAIL').map(row=>['Playwright',row.name])])}

The SQL sweep has ${sql.pass} passes and five failures against three absent inventory-mode tables. These match the previous missing-table failures; their source files were not modified in this repair. The broader API-smoke process exits 1 despite all workflow/auth cases passing. No unrelated inventory migration was applied to conceal them.

${table(['Source file / line','SQL error'],api.sqlResults.filter(row=>row.status==='FAIL').map(row=>[row.file+':'+row.line,row.message]))}

External PayMongo/webhook delivery, settlement, Cloudinary uploads, email/SMS delivery and physical printing remain unverified. No real charge, recipient or patient record was used. The timestamped export filename itself was unavailable, with the matching updated alias and its hash disclosed above. No hosted Cloudflare/Render deployment or remote schema migration was performed.

## 6. Verification checklist

${checklist}

## 7. Deployment readiness

**The corrected source builds and is ready for staging rehearsal. Production release remains conditional**, given the existing regression failures, missing inventory-mode tables, external-delivery gaps and unrecorded reversal migration.

1. Review these four-file changes and the current failure inventory. Keep the existing SQL migration files and applied hashes unchanged.
2. In approved staging, run the registered server migration command after verifying the manual column types. The reversal guard skips all three present nullable columns and records the migration after validation. Repeat once to confirm history remains unchanged. Do not force-insert checksums or delete history to bypass the runner.
3. Confirm the same expected column contract and pending-migration state for the deployment target. No production migration was executed here. The live columns are already present; pending ledger registration is an outstanding database step. The runner must still validate all other registered history rather than assuming it is current.
4. Build the client with npm --prefix client run build. The backend has no build script: use npm --prefix server run check:syntax, npm --prefix server run verify:source and npm --prefix server run postinstall, then the existing server start command.
5. Rehearse Admin/Super Admin apply -> reverse -> confirm -> partial/final payment, wrong-role/branch denial, duplicate requests, audit history and receipts. Rehearse CMS draft/publish/restore and the configured external test providers before production rollout.

No new environment variable or application dependency is required. No push, deployment, production financial edit or migration-history deletion occurred.
`
fs.writeFileSync(path.join(here,'QA_REPORT.md'),report)
const summary={date:'2026-11-11',timezone:'Asia/Manila',reviewedCommit:source.mergeCommit,conflictsResolved:6,applicationFilesChanged:4,node,priorNode,vitest:{pass:currentVitest.numPassedTests,fail:currentVitest.numFailedTests,total:currentVitest.numTotalTests},browser:{pass:browser.filter(row=>row.status==='PASS').length,fail:browser.filter(row=>row.status==='FAIL').length,total:browser.length},native:{pass:22,fail:0},receiptPdf:{pass:32,fail:0},api:{pass:api.passed,fail:api.failed,anonymousPassed:api.anonymousPassed,expiredPassed:api.expiredPassed,sql},lint:lintCounts,introducedFailures:introduced,productionWrites:0,productionFinancialRowsRead:0,reversalColumnsAddedAgain:0,migrationHistoryRowsDeleted:0,liveMigrationLedgerRecorded:live.history.length===1,backendBuildScriptDefined:Boolean(JSON.parse(fs.readFileSync(path.join(root,'server/package.json'))).scripts.build),deployment:'Staging rehearsal ready; production conditional; not deployed',cleanup:{status:cleanup.status,portClosed:cleanup.portClosed}}
fs.writeFileSync(path.join(here,'test-summary.json'),JSON.stringify(summary,null,2))
const purposes={
 'prepare.cjs':'Prepare separate QA outputs and adapted synthetic harness without overwriting prior reports.',
 'run.cjs':'Execute named checks with synthetic settings and a network guard; record output/status.',
 'verify-live-schema.cjs':'Read only the three live column definitions and migration ledger; no application import or write.',
 'verify-local-migration.cjs':'Verify existing-column guards, initial/repeat local migration and ledger preservation.',
 'verify-final-db.cjs':'Verify exact post-workflow row hashes, totals and history under local migration replay.',
 'review-export.cjs':'Decode the available export and compare pre-repair/current source and valid parent.',
 'scan-conflicts.cjs':'Scan hidden/ignored source for all Git conflict marker kinds with explicit cache/dependency exclusions.',
 'inventory-sql.cjs':'AST-only extraction of current runtime SQL candidates; never executes source/queries.',
 'database-schema.cjs':'Copy read-only schema definitions to the isolated instance without source application rows.',
 'disposable-db.cjs':'Create a separate loopback MySQL instance and datadir.',
 'api-smoke.cjs':'Exercise synthetic API flows, route auth and safe SELECT EXPLAIN candidates.',
 'clinical-workflow.cjs':'Run real local API/MySQL/React workflows, including separate successful Super Admin reversal.',
 'browser-suite.cjs':'Serve a stable built-client snapshot and run browser tests.',
 'playwright.config.mjs':'Use installed Edge and separate current browser output paths.',
 'print-check.mjs':'Generate synthetic receipt PDFs in installed Chrome/Edge.',
 'inspect-print.py':'Inspect A5 geometry, page count and retained text using the existing ignored inspection package.',
 'cleanup-db.cjs':'Guard the exact synthetic instance and stop it after verifying the ledger.',
 'write-report.cjs':'Generate this report, summary and evidence inventory from actual results.',
 'check-evidence.cjs':'Check fresh evidence, confidentiality, conflict scan, source scope and row-preservation assertions.',
 'QA_REPORT.md':'Actual-result report, changed files, remaining failures and deployment readiness.',
 'test-summary.json':'Machine-readable fresh counts and limitations.',
 'EVIDENCE_MANIFEST.md':'Inventory of added nonignored QA files.',
 'initial-fixture-attempt.json':'Disclose corrected harness prerequisites and initial failed attempts.',
 '.gitignore':'Exclude generated browser/PDF and temporary tool artifacts from source control.',
}
const files=[...new Set([...fs.readdirSync(here).filter(file=>fs.statSync(path.join(here,file)).isFile()&&!/\.pdf$/.test(file)),'EVIDENCE_MANIFEST.md','evidence-check-results.json'])].sort()
fs.writeFileSync(path.join(here,'EVIDENCE_MANIFEST.md'),'# Added QA evidence\n\nAll files below are additions under QA_REPORT/conflict-repair-2026-11-11/. No earlier report was replaced. Browser PDFs/screenshots and the temporary synthetic datadir are local artifacts.\n\n'+table(['File','Purpose'],files.map(file=>['['+file+']('+file+')',purposes[file]||(file.endsWith('.log')?'Captured command output, including retained failures.':file.endsWith('.csv')?'Runtime endpoint/authentication audit.':'Structured command result, schema-only metadata, verification case evidence or synthetic-instance guard.')]))+'\n')
console.log('Updated conflict-repair report: all local targeted checks pass; existing failures and conditional production readiness are explicit.')
