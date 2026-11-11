'use strict'
const fs=require('node:fs'),path=require('node:path'),{spawnSync}=require('node:child_process'),assert=require('node:assert/strict')
const here=__dirname,root=path.resolve(here,'../..'),read=n=>JSON.parse(fs.readFileSync(path.join(here,n+'.json'),'utf8')),log=n=>fs.readFileSync(path.join(here,n+'.log'),'utf8')
const stats=name=>Object.fromEntries([...log(name).matchAll(/^# (tests|pass|fail|skipped) (\d+)\s*$/gm)].map(m=>[m[1],Number(m[2])]))
const failures=name=>[...log(name).matchAll(/^not ok \d+ - (.+)$/gm)].map(m=>m[1])
const cases=j=>{const out=[];const visit=ss=>{for(const s of ss){for(const p of s.specs||[])for(const t of p.tests||[])out.push({name:p.title,file:p.file,status:t.status==='expected'?'PASS':t.status==='skipped'?'NOT TESTED':'FAIL',reason:t.results?.at(-1)?.errors?.at(-1)?.message?.replace(/\x1b\[[0-9;]*m/g,'').split('\n').filter(Boolean).slice(0,3).join(' ').slice(0,300)});visit(s.suites||[])}};visit(j.suites);return out}
const baseBrowser=cases(read('baseline-browser-results')),browser=cases(read('browser-results')),native=read('clinical-workflow-results'),pdf=read('print-results'),baselinePdf=read('baseline-print-results'),schema=read('database-schema'),database=read('database-verification'),vitest=read('server-vitest-results'),baseVitest=read('baseline-server-vitest-results')
const api=read('api-smoke-results'),cleanup=read('cleanup-results')
const references=read('reference-comparison')
const node={baselineServer:stats('baseline-server-node'),server:stats('server-node'),baselineClient:stats('baseline-client-node'),client:stats('client-node'),finance:stats('focused-server'),formatting:stats('focused-client')}
const vitestFailures=j=>j.testResults.flatMap(s=>(s.assertionResults||[]).filter(t=>t.status==='failed').map(t=>t.fullName))
const introduced={server:failures('server-node').filter(n=>!failures('baseline-server-node').includes(n)),client:failures('client-node').filter(n=>!failures('baseline-client-node').includes(n)),vitest:vitestFailures(vitest).filter(n=>!vitestFailures(baseVitest).includes(n)),browser:browser.filter(t=>t.status==='FAIL'&&!baseBrowser.some(b=>b.name===t.name&&b.status==='FAIL')).map(t=>t.name)}
assert.ok(Object.values(introduced).every(rows=>rows.length===0),'New failing regressions must be resolved before final reporting')
assert.equal(browser.filter(t=>t.file==='implementation20261111.spec.mjs'&&t.status==='PASS').length,12)
assert.equal(native.results.length,21);assert.ok(native.results.every(r=>r.status==='PASS'))
assert.equal(pdf.length,32);assert.ok(pdf.every(r=>r.status==='PASS'))
const table=(heads,rows)=>'| '+heads.join(' | ')+' |\n| '+heads.map(()=> '---').join(' | ')+' |\n'+rows.map(row=>'| '+row.map(s=>String(s??'').replace(/\|/g,'/').replace(/\r?\n/g,' ')).join(' | ')+' |').join('\n')
const purposes={
 'client/src/components/billing/BillCheckout.jsx':'Use shared payment presentation while retaining the existing service adapter and handlers.',
 'client/src/components/billing/ChargeAdjustmentsPanel.jsx':'Authorized reversal action, required-reason confirmation, totals preview, duplicate-submit guard and reversal history.',
 'client/src/components/billing/CheckoutPaymentSection.jsx':'One responsive payment details/summary layout; reuse centavo-safe preview, configured methods and existing QR slot.',
 'client/src/components/patients/PatientRecordsPage.jsx':'Display prescription through the shared reader; keep existing record permissions.',
 'client/src/components/patients/PrescriptionDetails.jsx':'Render only supplied medicine fields, readable legacy text and safe empty/error states.',
 'client/src/components/system/LandingDraftPreview.jsx':'Render draft in a separate responsive viewport with existing public page components.',
 'client/src/pages/adminPage/Admin_CheckoutDetail.jsx':'Adopt shared payment layout and stable retry key / immediate in-flight guard.',
 'client/src/pages/staffPage/Staff_CheckoutDetail.jsx':'Same presentation and retry protection with Staff services and permissions.',
 'client/src/pages/adminPage/Admin_LandingPage.jsx':'Wide editor, vertical Contact/Map/CTA groups, responsive preview controls, labels, Escape/focus behavior and mutation guards.',
 'client/src/pages/patientPage/History.jsx':'Reuse the same prescription formatter, including explicit missing/none statuses.',
 'client/src/utils/prescriptionDisplay.mjs':'Safe parsing of JSON arrays, objects/wrappers, incomplete fields and legacy free text without guessing medical details.',
 'client/src/utils/billingReceiptTemplate.mjs':'Print-only compact A5 spacing and metadata layout; preserve content and natural multi-page overflow.',
 'server/controllers/patient.controller.js':'Expose existing prescription_status in the patient-owned history query.',
 'server/routers/branchChargeAdjustments.js':'Transaction-wrapped, permission/branch-scoped reversal POST routes.',
 'server/scripts/branchMigrations.js':'Register additive reversal fields and guard compatible existing columns on replay.',
 'server/utils/chargeAdjustments.js':'Lock bill then adjustment, reject invalid/paid/confirmed/repeated reversals, preserve other discounts/history, rebase pending versions and audit.',
 'server/db/migrations/2026-11-11-charge-reduction-reversal.sql':'Three nullable reversal metadata columns; no destructive or clinical/inventory DML.',
 'server/tests/billing/chargeReversal20261111.node.test.cjs':'15 targeted financial/authorization/validation/preservation tests.',
 'client/tests/prescriptionDisplay20261111.node.test.mjs':'Structured, multiple, incomplete, legacy and malformed prescription tests.',
 'client/tests/browser/implementation20261111.spec.mjs':'12 payment layout, precision, QR-lock/cancel, retry and receipt interaction regressions.',
 'client/tests/browser/helpers/clinic20261111.mjs':'Reusable synthetic browser fixture extracted from the existing fixture, with no real patients/providers.',
 'client/tests/batch5VisualAndPaymentPreview.node.test.mjs':'Follow payment preview into shared component and check actual Admin/Staff surfaces; retain math and isolation assertions.',
 'client/tests/billingReplacement20261105.node.test.mjs':'Follow fourth checkout section into shared UI while preserving approval and workflow assertions.',
 'client/tests/billingSimplifiedWorkflow.node.test.mjs':'Follow clear/QR tender controls into shared UI; retain parent QR callback and explicit payment-submission checks.',
 'server/tests/security/billingCheckoutFollowup20260930.test.js':'Check actual portal wrappers and shared reference input; retain image-proof and upload-route assertions.',
 'server/tests/deployment/migrationRunner.node.cjs':'Add new migration to expected tail; retain historical checksums, replay and failure assertions.',
}
const git=args=>spawnSync('git',args,{cwd:root,encoding:'utf8',windowsHide:true}).stdout.trim().split(/\r?\n/).filter(Boolean)
const changed=git(['diff','--name-only']),added=git(['ls-files','--others','--exclude-standard'])
const sources=[...changed.map(file=>['Modified',file]),...added.filter(file=>!file.startsWith('QA_REPORT/')).map(file=>['Added',file])].filter(([,file])=>purposes[file])
const checks=table(['Check','Baseline','Current','Result'],[
 ['Client production build','PASS',read('client-build').status,'25 prebuild assertions and Vite bundle pass'],
 ['Client ESLint','PASS',read('client-lint').status,'0 errors; 23 existing warnings'],
 ['Server postinstall / route registration','Not rerun in baseline copy',read('server-postinstall').status,'357 modules; Staff/charge bindings and 231 handler references verified'],
 ['Server Node',`${node.baselineServer.pass}/${node.baselineServer.tests} pass; ${node.baselineServer.fail} fail`,`${node.server.pass}/${node.server.tests} pass; ${node.server.fail} fail`,'15 new finance tests pass; same failing names'],
 ['Client Node',`${node.baselineClient.pass}/${node.baselineClient.tests} pass; ${node.baselineClient.fail} fail`,`${node.client.pass}/${node.client.tests} pass; ${node.client.fail} fail`,'3 new parser tests pass; same failing names'],
 ['Server Vitest',`${baseVitest.numPassedTests}/${baseVitest.numTotalTests} pass; ${baseVitest.numFailedTests} fail`,`${vitest.numPassedTests}/${vitest.numTotalTests} pass; ${vitest.numFailedTests} fail`,'Same failing names'],
 ['Playwright',`${baseBrowser.filter(t=>t.status==='PASS').length}/${baseBrowser.length} pass; ${baseBrowser.filter(t=>t.status==='FAIL').length} fail`,`${browser.filter(t=>t.status==='PASS').length}/${browser.length} pass; ${browser.filter(t=>t.status==='FAIL').length} fail`,'12 new cases pass; same 16 legacy failures; no skipped/flaky cases'],
 ['Broader API / SQL smoke','Not rerun in baseline copy','PARTIAL','41 API cases pass; 738 anonymous and 738 expired-token denials pass. SQL plans: 676 pass, 5 fail on absent inventory-mode tables; overall command exits 1.'],
 ['Real API + built React + MySQL workflow','Not applicable',`${native.results.filter(r=>r.status==='PASS').length}/${native.results.length} PASS`,'No mocked API/DB for these cases; see clinical-workflow-results.json'],
 ['Receipt PDF print engine',`${baselinePdf.filter(r=>r.case!=='many-items').length} normal-case PDFs used 2 pages`,`${pdf.length}/${pdf.length} PASS`,'Chrome and Edge; headers on/off; A5 dimensions and retained content verified'],
 ['Native schema migration','Previous schema without reversal fields',read('migrate').status,'Initial application, repeat and guarded re-entry with existing columns pass'],
 ['Database integrity','Metadata copied only',database.status,'Existing FK preserved; no negative/inconsistent totals; no incomplete reversal metadata'],
 ['Supplied code export / August SQL reference','Baseline b192e96',references.status,'772 exported application text files match baseline; current differences are the 17 modified files and 9 additions. Historical tables/columns and branch-specific replacement indexes verified against saved schema metadata.'],
])
const checklist=table(['Task','Status','Verification'],[
 ['1. Reverse approved reductions','PASS','Real Admin and Super Admin race: one 200/one 409 and one audit. Real Admin reason dialog refreshes totals. Promotion/other discounts, other reductions and partial-payment restrictions verified.'],
 ['2. Shared payment section','PARTIAL','Implemented; Admin/Staff desktop/tablet/mobile, cash/partial receipts, QR lock/cancel and response-loss retry pass. External PayMongo/GCash/Maya delivery was not exercised; unsupported manual methods remain disabled by existing configuration.'],
 ['3. Readable prescriptions','PASS','Native Patient Records and Visit History display the same saved medicine. Parser tests cover multiple/incomplete/legacy/null/malformed inputs. Stored medical contents unchanged.'],
 ['4. One-page normal A5 receipts','PASS','32 browser-generated PDFs pass. Normal cases use one A5 page, including long fields and refund/void states; 40-item receipts use 3 pages with last item retained. Manual interactive printer dialogs/physical printing not exercised.'],
 ['5. Landing-page editor','PASS','Real preview/save/publish/restore/public-page flow, responsive 1440/900/390 layouts, device toggles, Escape and stale-revision 409 verified. Existing upload delivery remains externally untested.'],
])
const report=`# Carait Clinic — implementation and verification report

Date: **11 November 2026 (Asia/Manila)**. Baseline: clean commit **b192e96** exported to an isolated temporary source tree before comparison. Changes remain uncommitted. No deployment or production application-data mutation occurred.

## 1. Implementation summary

All five PDF changes were implemented in the active repository. The pasted user request is the implementation authority; the five PDF pages supplied visual evidence. PDF captions asking for a plan were not treated as a limit on implementation.

1. **Approved charge reductions can be reversed.** Admin/Super Admin only, within the authorized physical branch, while the bill is draft/pending and has no payment history. A required-reason confirmation shows original charge, approved reduction, current and resulting bill totals. Bill/adjustment locks and a conditional status update prevent double reversal. The original approval, requester and reason stay intact; reversal actor/time/reason are additional fields. Pending charge/legacy request versions are rebased. An audited financial explanation and old/new monetary values are recorded. Clinical data, inventory, promotions, unrelated discounts and completed payments are untouched.
2. **Payment details and summary share one component.** Admin, Staff and the shared checkout use the same layout/centavo-safe estimate. Desktop separates entry and summary; smaller screens stack details before summary. Existing methods, QR lifecycle, references, confirmation, receipts, permission checks and API handlers are preserved. The active Admin/Staff pages also now reuse a payment intent after a lost response and prevent immediate duplicate submissions; previously they generated a new key per retry.
3. **Prescriptions use one reader in both views.** Only supplied medicine/dosage/quantity/frequency/duration/notes are displayed. Legacy text retains line breaks. Malformed or unrecognized JSON produces a readable fallback instead of raw JSON or an object error. No medical content was rewritten or migrated. Patient ownership/record authorization is unchanged.
4. **Normal receipts fit one A5 page.** Print-only margins/spacing and metadata labels were compacted without removing receipt data or clipping overflow. Excess items naturally continue on later pages. The ordinary screen design and saved-ledger calculation source are retained.
5. **The landing editor has room to work.** Contact Information, Google Maps and CTA are vertical groups. Navigation wraps, the editor is wider, and preview is a separate panel on large screens with a separate mobile control. Mobile/desktop previews use an independent viewport, reflect draft changes and can expand. Existing save/publish/history/restore, uploads, ordering, visibility and unsaved-change handlers are preserved; mutation guards and field labels were added.

## 2. Files changed

${table(['Change','File','Purpose'],sources.map(([status,file])=>[status,'['+file+'](../../'+file+')',purposes[file]]))}

No source files were deleted. No package/lockfile or application dependency was changed. QA tools, command logs, JSON results and the isolated-schema metadata are under this directory. PyMuPDF was installed only into ignored .tools for PDF inspection, outside project dependencies. Generated screenshots/PDFs and the temporary baseline tree are ignored.

Every added QA script, report, log and result file is listed with its purpose in [EVIDENCE_MANIFEST.md](EVIDENCE_MANIFEST.md).

Source/reference comparison: fix (3).pdf was read and all five pages inspected. The subsequently supplied AllCodes.txt has now been compared with baseline b192e96 and the worktree: all 772 scoped application text files match baseline, with 17 existing files changed by this implementation and 9 additions. There are no unexplained reference differences or missing current files. The supplied 2026-08-26-clinic-workflow-upgrade.sql matches both export and baseline and was inspected against the existing metadata snapshot. It is a historical migration, not the named carait_clinic_full_backup_2026_11.sql backup; no comparison with that unavailable full backup is claimed. See [REFERENCE_COMPARISON.md](REFERENCE_COMPARISON.md) and [reference-comparison.json](reference-comparison.json) for scope, normalized file hashes and schema details. Neither reference was executed or imported.

## 3. Database changes

Migration: [2026-11-11-charge-reduction-reversal.sql](../../server/db/migrations/2026-11-11-charge-reduction-reversal.sql).

${table(['Table','Column','Definition'],database.columns.map(c=>['billing_charge_adjustments',c.COLUMN_NAME,c.COLUMN_TYPE+' NULL']))}

The existing VARCHAR status supports reversed. No table, index or foreign key was removed/rekeyed. The existing bill foreign key is retained. Each new column is checked before DDL so an interrupted deployment can resume; incompatible existing definitions fail. No stored prescription, consultation, inventory, payment, promotion or existing approval was migrated/deleted.

Production/source access: **${schema.sourceMetadataReads} metadata reads, 0 writes, 0 application rows copied**. A separate loopback MySQL instance and schema carait_qa_20261111 were created. Synthetic identities, schedules, stock, appointments and payments were used for all mutations. External providers were blocked in the native runner. The new migration was applied, repeated, and re-entered with columns already present. Monetary totals and required reversal history fields passed integrity checks.

The disposable MySQL ${cleanup.mysqlVersion} instance was shut down after checking the final migration ledger; port 33409 is closed. Its synthetic datadir is retained for local review. Generated copies of all five supplied PDF pages were removed. Original user files were not changed. See [cleanup-results.json](cleanup-results.json).

The newly supplied August migration's eleven created tables and 113 referenced columns already exist in the captured schema. The movement_type field was widened by a later registered migration; three original global uniqueness indexes have verified branch-specific replacements. No historical schema was overwritten and no new database connection was made for this reference comparison.

Routes added (POST):

- /api/branches/my/legacy/billing/:id/charge-adjustments/:requestId/reverse
- /api/branches/workspace/:branchId/legacy/billing/:id/charge-adjustments/:requestId/reverse

These retain existing Admin portal authentication, billing permission, branch context and transaction handling. No Staff/Doctor reversal route was added.

## 4. Tests performed

${checks}

The broader [API smoke results](api-smoke-results.json) inventory 829 endpoints. All 41 workflow cases and both sets of 738 protected-route authentication probes pass. The separate SQL-plan sweep reports 676 passes and 5 failures because inventory_stock_mode, inventory_stock_eligibility and inventory_stock_movements are absent from the copied source schema. Those existing inventory-mode source files were not modified. This command therefore remains unsuccessful; it is not included as an overall passing suite. No baseline API-smoke run is claimed.

### Native workflow evidence

${table(['Case','Result'],native.results.map(r=>[r.name,r.status]))}

[Native request/case results](clinical-workflow-results.json) include actual booking with a saved promotion, draft/final consultation and prescription, one stock deduction, insufficiency rollback, Doctor/Staff approval/reversal, partial/final payment, idempotency, ownership and CMS publication/restore. Admin MFA and same-day notice were overridden only inside the synthetic local test process; provider delivery is not established by these tests.

### New payment interactions

${table(['Case','Result'],browser.filter(r=>r.file==='implementation20261111.spec.mjs').map(r=>[r.name,r.status]))}

### Receipt printing

${table(['Browser','Scenario','Header/footer','Pages','Result'],pdf.map(r=>[r.browser,r.case,r.headers?'On':'Off',r.pages,r.status]))}

Paper dimensions were checked against A5 portrait with browser rounding tolerance. Required receipt text and the final item in oversized receipts remain present. [Print results](print-results.json), [baseline print results](baseline-print-results.json). Example local artifacts: [one-service receipt](browser-artifacts/current-Edge-one-service-clean.pdf), [long-field receipt](browser-artifacts/current-Chrome-long-fields-headers.pdf), [multi-page receipt](browser-artifacts/current-Edge-many-items-clean.pdf).

### Baseline comparison and test maintenance

**No newly failing test names remain** in Node, Vitest or Playwright. No test was removed or skipped. Existing assertions that looked for inline payment markup were updated to follow the shared component while retaining financial, image-proof, explicit-submission and QR-lock checks. Actual Admin/Staff wrappers are checked instead of duplicated references to one unused shared file. Behavioral browser tests additionally prove QR blocking/cancellation, clearing Cash and lost-response retry. The migration-order test now includes the additive migration and retains historical checksum assertions.

Initial QA fixture failures (missing required promotion description, missing patient branch selection, label mismatches, and cleanup of a policy row after failed initialization) were corrected in the QA harness. They were not counted as product defects. A Windows sandbox account lock (1909) required approved local execution for final checks. Results were not inferred from those environment errors.

## 5. Remaining issues

- **Existing suites remain red:** ${node.server.fail} server Node, ${node.client.fail} client Node, ${vitest.numFailedTests} Vitest and ${browser.filter(r=>r.status==='FAIL').length} legacy browser failures. Their failing names match baseline. They include retired navigation/markup contracts, pricing/print contract conflicts, incomplete fixture dependencies and unrelated UI workflows. This report does not certify the whole application as failure-free.
- **Broader SQL-plan sweep:** five checks fail on the three absent inventory-mode tables listed above. The affected files and source schema are outside these five fixes; no unsupported inventory migration was applied to hide those failures.
- **External delivery is not verified:** real PayMongo test-provider/webhook exchange, GCash/Maya settlement and Cloudinary/email/SMS delivery. No live charge or production recipient was used. Current manual payment methods remain governed by existing configuration; unsupported ones were not enabled.
- **Interactive printer UI/physical paper** was not exercised. Actual Chrome/Edge print-to-PDF engines, A5 geometry, content retention and header/footer settings were tested.
- **Full backup comparison** remains unavailable: AllCodes.txt is now verified, while the supplied August SQL file is a migration rather than the named full backup. No historical application data restore/comparison is claimed. Hosted Render/Cloudflare Linux deployment was not performed.

### Unchanged Node failures

${table(['Runner','Failing assertion'],[...failures('server-node').map(n=>['Server',n]),...failures('client-node').map(n=>['Client',n])])}

### Unchanged Vitest failures

${vitestFailures(vitest).map(n=>'- '+n).join('\n')}

### Unchanged browser failures

${table(['Test','Observed failure'],browser.filter(r=>r.status==='FAIL').map(r=>[r.name,r.reason]))}

## 6. Verification checklist

${checklist}

Local implementation/verification is complete for the available environment; external provider delivery and hosted deployment remain outside the verified scope. See [test-summary.json](test-summary.json) for machine-readable totals and introduced-failure comparison.

## 7. Deployment notes

1. Review the source patch and take the normal database backup through the approved deployment process. Do not run QA seed/bootstrap scripts against production.
2. Apply the registered migration with server npm run migrate on approved staging, then the target database after approval. Verify reversed_at, reversed_by_admin_id and reversal_reason exist before enabling the new backend endpoint. The migration is additive; the existing runner handles replay. Remote TiDB DDL was not executed by this session.
3. Deploy the server and client together through the existing Render/Cloudflare process. Use existing server start/postinstall and client npm run build; no new environment variables or application dependencies are required. No deployment was triggered here.
4. Rehearse on staging: approve/directly apply a reduction, reverse it, confirm the bill, collect a partial/final payment and print the receipt. Confirm Staff/Doctor and wrong-branch denial, no reversal after confirmation/payment, and one audit event under duplicate requests.
5. Rehearse draft -> preview -> save -> publish -> public page -> restore -> republish, plus the configured image upload provider. Verify actual PayMongo TEST behavior with approved sandbox credentials before relying on it in a demonstration.
6. The supplied 2026-08-26-clinic-workflow-upgrade.sql is already represented in the inspected schema. Do not run it manually as a restore or replace newer branch constraints with its older definitions; use the registered migration runner for the new reversal fields.

No Purchase Cost per Unit fields were added to inventory forms, spreadsheets or workflows. No clinical, stock or paid-payment reversal was introduced.
`
fs.writeFileSync(path.join(here,'IMPLEMENTATION_REPORT.md'),report)
fs.writeFileSync(path.join(here,'test-summary.json'),JSON.stringify({date:'2026-11-11',timezone:'Asia/Manila',baselineCommit:'b192e96',node,vitest:{baseline:{pass:baseVitest.numPassedTests,fail:baseVitest.numFailedTests},current:{pass:vitest.numPassedTests,fail:vitest.numFailedTests}},browser:{baseline:{pass:baseBrowser.filter(t=>t.status==='PASS').length,fail:baseBrowser.filter(t=>t.status==='FAIL').length},current:{pass:browser.filter(t=>t.status==='PASS').length,fail:browser.filter(t=>t.status==='FAIL').length},newCases:12},native:{pass:native.results.length,fail:0},receiptPDF:{pass:pdf.length,fail:0},apiSmoke:{workflow:{pass:api.passed,fail:api.failed},anonymous:{pass:api.anonymousPassed,fail:api.anonymousFailed},expired:{pass:api.expiredPassed,fail:api.expiredFailed},sqlPlans:{pass:api.sqlResults.filter(r=>r.status==='PASS').length,fail:api.sqlResults.filter(r=>r.status==='FAIL').length},commandStatus:read('api-smoke').status},introducedFailingTests:introduced,sourceMetadataReads:schema.sourceMetadataReads,sourceWrites:0,applicationRowsCopied:0,remoteDeployment:false,cleanup:{status:cleanup.status,portClosed:cleanup.portClosed,migrationLedgerVerified:cleanup.migrationLedgerVerified},referenceComparison:{status:references.status,code:references.summary,migration:references.migration.summary,newDatabaseConnections:references.newDatabaseConnections,databaseWrites:references.databaseWrites}},null,2))
const qaPurposes={
 '.gitignore':'Keep temporary baseline dependencies, inspection tools and generated visual artifacts out of source control.',
 'run.cjs':'Execute named checks with synthetic environment settings and external network blocking.',
 'api-smoke.cjs':'Inventory routes and run authentication, API workflow and SQL-plan checks against the isolated database.',
 'browser-suite.cjs':'Serve the selected built client snapshot and launch Playwright.',
 'playwright.config.mjs':'Separate baseline/current Playwright results and artifact output directories.',
 'clinical-workflow.cjs':'Exercise the real local API, built React views and synthetic MySQL data end to end.',
 'database-schema.cjs':'Read source schema metadata only and reconstruct the isolated schema without copying application rows.',
 'disposable-db.cjs':'Create the disposable loopback MySQL instance in a new temporary directory.',
 'verify-db.cjs':'Verify financial/schema invariants and prepare guarded re-entry of the new migration in the synthetic schema.',
 'cleanup-db.cjs':'Verify the synthetic instance and migration ledger, stop it, and remove generated copies of PDF reference pages.',
 'print-check.mjs':'Generate baseline/current synthetic receipts with installed Chrome and Edge PDF print engines.',
 'inspect-print.py':'Check printed A5 geometry, page counts and retained receipt text with PyMuPDF.',
 'write-report.cjs':'Generate this report, result summary and evidence inventory from recorded checks.',
 'check-evidence.cjs':'Verify report completeness, artifact retention, diff hygiene and absence of private configuration values.',
 'compare-references.cjs':'Decode the supplied source export and compare it with baseline/worktree; check the August migration against saved schema metadata without executing either reference.',
 'IMPLEMENTATION_REPORT.md':'The seven-part implementation, verification and deployment report.',
 'EVIDENCE_MANIFEST.md':'Inventory of all added nonignored QA files and their purposes.',
 'test-summary.json':'Machine-readable baseline/current counts and verification limitations.',
 'REFERENCE_COMPARISON.md':'Newly supplied code export and historical migration comparison, scope and schema evolution.',
 'reference-comparison.json':'Normalized file hashes, reference/baseline/worktree classifications and historical schema checks.',
 'evidence-check-results.json':'Final report, privacy, artifact and diff verification results.',
 'cleanup-results.json':'Verified synthetic database shutdown and reference-page cleanup results.',
 'API_ENDPOINT_AUDIT.csv':'Runtime endpoint inventory and authentication-probe results.',
 'database-metadata.json':'Schema definitions only; no source application rows or credentials.',
 'sql-inventory.json':'Source SQL-statement inventory used by the isolated plan checks.',
 'mysql-instance.json':'Local synthetic instance PID, port and temporary data-directory guard.',
}
const evidence=[...new Set([...fs.readdirSync(here).filter(name=>fs.statSync(path.join(here,name)).isFile()&&!/\.(zip|pdf|png)$/.test(name)),'EVIDENCE_MANIFEST.md','evidence-check-results.json'])].sort()
fs.writeFileSync(path.join(here,'EVIDENCE_MANIFEST.md'),'# Added QA files\n\nAll files below are additions in QA_REPORT/implementation-2026-11-11/. No earlier QA report was replaced. Browser screenshots/PDFs, the baseline archive/tree and the isolated inspection package are local ignored artifacts. Source changes and their purposes are listed in IMPLEMENTATION_REPORT.md.\n\n'+table(['File','Purpose'],evidence.map(name=>['['+name+']('+name+')',qaPurposes[name]||(name.endsWith('.log')?'Captured command output; failures remain preserved.':name.endsWith('-results.json')?'Structured verification outcomes and recorded case evidence.':name.endsWith('.json')?'Command status, duration or schema-verification metadata.':'Local verification support file.')]))+'\n')
console.log('Implementation report written; all new checks pass, unchanged baseline failures documented.')
