'use strict'
const fs=require('node:fs'),path=require('node:path')
const root=path.resolve(__dirname,'../..'),out=path.join(root,'QA_REPORT'),ev=path.join(out,'evidence')
const read=n=>JSON.parse(fs.readFileSync(path.join(ev,n+'.json'),'utf8'))
const log=n=>fs.readFileSync(path.join(ev,n+'.log'),'utf8')
const write=(n,s)=>fs.writeFileSync(path.join(out,n),s.trim()+'\n')
const csv=rows=>rows.map(r=>r.map(v=>'"'+String(v??'').replace(/"/g,'""')+'"').join(',')).join('\n')+'\n'
const table=(heads,rows)=>'| '+heads.join(' | ')+' |\n| '+heads.map(()=> '---').join(' | ')+' |\n'+rows.map(r=>'| '+r.map(c=>String(c??'').replace(/\|/g,'/').replace(/\r?\n/g,' ')).join(' | ')+' |').join('\n')
const nodeStats=n=>Object.fromEntries([...log(n).matchAll(/^# (tests|pass|fail|cancelled|skipped) (\d+)\s*$/gm)].map(m=>[m[1],Number(m[2])]))
const nodeFailures=n=>[...log(n).matchAll(/^not ok \d+ - (.+)$/gm)].map(m=>m[1].trim())
const source=read('source-inventory'),api=read('api-smoke-results'),workflow=read('clinical-workflow-results'),pages=read('browser-pages-results'),browser=read('browser-results'),coverage=read('coverage/coverage-summary'),vitest=read('server-vitest-results'),metadata=read('database-metadata'),schema=read('database-schema'),deps=read('dependency-checks')
const stats={server:nodeStats('server-node'),client:nodeStats('client-node')}
const browserCases=[]
function visit(suites){for(const suite of suites){for(const spec of suite.specs||[])for(const t of spec.tests||[])browserCases.push({file:spec.file,line:spec.line,name:spec.title,status:t.status==='expected'?'PASS':t.status==='skipped'?'NOT TESTED':'FAIL',reason:t.results?.at(-1)?.errors?.[0]?.message?.replace(/\x1b\[[0-9;]*m/g,'').split('\n').filter(Boolean).slice(0,3).join(' ').slice(0,260)||''});visit(suite.suites||[])}}
visit(browser.suites)
const pageCounts=pages.results.reduce((o,r)=>(o[r.status]=(o[r.status]||0)+1,o),{})
const line=(file,needle)=>{const s=fs.readFileSync(path.join(root,file),'utf8').split(/\r?\n/);const i=s.findIndex(l=>l.includes(needle));return i<0?'?':i+1}
const ref=(file,needle)=>`[${file}:${line(file,needle)}](../${file}#L${line(file,needle)})`
const runTable=table(['Check','Status','Observed result / evidence'],[
 ['Client production build',read('client-build').status,'25/25 prebuild tests; Vite output created; evidence/client-build.log'],
 ['Client ESLint',read('client-lint').status,'0 errors; 23 warnings retained in evidence/client-lint-results.json'],
 ['Server focused ESLint',read('server-lint').status,'No undefined variables, duplicate keys, unreachable code or other enabled-rule errors'],
 ['Render postinstall checks',read('server-postinstall').status,'Server syntax and actual Staff/charge route registration; evidence/server-postinstall.log'],
 ['Server Node regression suite',read('server-node').status,`${stats.server.pass}/${stats.server.tests} pass; ${stats.server.fail} fail; ${stats.server.skipped} skipped`],
 ['Client Node regression suite',read('client-node').status,`${stats.client.pass}/${stats.client.tests} pass; ${stats.client.fail} fail; ${stats.client.skipped} skipped`],
 ['Server Vitest',read('server-vitest').status,`${vitest.numPassedTests}/${vitest.numTotalTests} pass; ${vitest.numFailedTests} fail`],
 ['Existing + added Playwright tests',read('client-browser').status,`${browserCases.filter(r=>r.status==='PASS').length}/${browserCases.length} pass; ${browserCases.filter(r=>r.status==='FAIL').length} fail; API responses mocked`],
 ['Real API targeted workflows',api.failed?'FAIL':'PASS',`${api.passed}/${api.results.length} named cases; real Express + isolated MySQL`],
 ['Anonymous / expired authentication matrix',api.anonymousFailed||api.expiredFailed?'FAIL':'PASS',`${api.anonymousPassed} anonymous checks + ${api.expiredPassed} expired-session checks`],
 ['Real clinical workflow',workflow.results.some(r=>r.status==='FAIL')?'FAIL':'PASS',`${workflow.results.filter(r=>r.status==='PASS').length}/${workflow.results.length} steps; booking through receipt and history; rollback + idempotency`],
 ['Live browser navigation / rendering',pageCounts.FAIL?'FAIL':'PASS',`${pageCounts.PASS||0}/${pages.results.length} renders across ${pages.results.length/2} route paths and 2 widths; interactions assessed separately`],
 ['SQL SELECT plans',api.sqlResults.some(r=>r.status==='FAIL')?'FAIL':'PASS',`${api.sqlResults.filter(r=>r.status==='PASS').length}/${api.sqlResults.length} EXPLAIN checks; 5 failures in disabled optional inventory-ledger paths`],
 ['Reports SQL',read('reports-sql').status,'19 read-only statements against isolated MySQL'],
 ['Migration replay / repeat',read('isolated-migrate').status,'Native MySQL, existing schema, empty source migration ledger; rerun passed'],
 ['Schema deployment verifier',read('deployment-schema').status,'Isolated schema; synthetic service-category warning retained'],
 ['API production-mode startup',read('startup').status,'Real server.js process; 5 expected endpoint responses, then stopped'],
 ['Dependency installation',deps.results.filter(r=>r.check.startsWith('npm ci')).every(r=>r.status==='PASS')?'PASS':'FAIL','Both lockfiles installed in disposable directories; lifecycle checks executed separately'],
 ['Dependency advisories','FAIL','Client: 1 low; server: 2 moderate dev dependency advisories; 0 high/critical'],
 ['Dormant client/WEBSITE build',read('legacy-website-build').status,'Missing restore script and source files; separate incomplete application'],
 ['Static Admin service route coverage',read('branch-routes').status,'Retired supply-request service calls remain unmatched; see evidence/branch-routes.log'],
])
const scope=`Date: 2026-11-09. Workspace: CAPSTONE; Windows, Node ${process.version}. No deployment, commit, push, production migration, or production application-data writes were performed. Source database access was limited to metadata and the migration ledger; the metadata copy contains no patient/application rows. All mutations used a separate loopback MySQL 8.0.41 instance (port 33409, databases carait_qa_20261109 and carait_qa_replay_20261109) and synthetic accounts. External provider delivery was blocked by the audit network guard.`
const limits=`PASS means the stated check executed and verified its assertions. FAIL means a reproducible failure remains. BLOCKED means a dependency/environment prevented testing. NOT TESTED means the action was not executed. A successful parse, rendered page, authentication rejection, SQL plan, or related test reference does not establish full feature correctness.`
const fixRows=[
 ['F01','High','Legacy billing redirect crashed because useLocation was undefined','client/src/App.jsx','useLocation','Imported the hook used by LegacyBillingRedirect; preserves physical branch and tab.','Added Playwright legacy redirect regression; PASS'],
 ['F02','High','Settings changed hook order after asynchronous profile data loaded','client/src/pages/shared/SettingsPage.jsx','URL.revokeObjectURL','Moved photo cleanup effect above the loading early return.','Four roles load + refresh in Playwright; PASS'],
 ['F03','Medium','Render-time refs / unstable callback triggered React hook diagnostics','client/src/components/services/PatientServices.jsx','useLayoutEffect','Update branch refs on committed render with cleanup; equivalent fixes in patient announcements/dashboard; rich-text commands read refs only during events; stable inventory close callback.','Client ESLint PASS; live page render PASS; every timing interleaving NOT TESTED'],
 ['F04','Medium','Inventory refresh rejection escaped and discarded useful feedback','client/src/pages/shared/Inventory.jsx','aria-busy','Catch load errors, preserve existing rows, expose loading state; remove unreachable retired transfer opener.','ESLint PASS; live page PASS; provider/network interruption UI NOT TESTED'],
 ['F05','Medium','Three mobile Super Admin cards/filters overflowed at 390px','client/src/pages/superAdminPage/redesign/shared.jsx','min-w-0','Allow cards, children and report branch selector to shrink within their grid.','Real browser 288 desktop/mobile renders PASS; evidence/browser-pages-results.json'],
 ['F06','Medium','Maps validation accepted misleading path prefixes, empty shortened URLs, ports or user info','server/utils/philippinePhone.js','google_maps_url','Validate HTTPS host, credentials, port and genuine /maps path boundaries; client mirrors the rules.','Maps unit regressions + real invalid-create/no-insert API case PASS'],
 ['F07','Medium','Patient branch API and public directions omitted the exact saved Maps pin','server/routers/patient.router.js','google_maps_url','Include google_maps_url and use validated saved link on Landing cards; address fallback handles legacy NULL.','Native public branch/create/edit cases + branchDirections tests PASS; real Google destination inspection BLOCKED'],
 ['F08','Medium','Directory numeric emails broadened into phone matches; local phone format mismatched international storage','server/utils/superadminPatientDirectory.js','const digits','Add phone predicate only for phone-shaped input and normalize Philippine local prefixes.','Native name/email/local/international search cases and unit regressions PASS'],
 ['F09','Medium','Patient/portal API errors lost useful backend codes and request references','client/src/services/portal.service.js','request_id','Preserve message/code/request_id/httpStatus and reject unreadable responses; patient appointments use central parser.','apiErrorReferences20261109.node.test.mjs PASS; native injected DB outage safe 500/reference PASS'],
 ['F10','High','Bill confirmation bypassed pending charge requests or unfinished clinical work','server/controllers/staff.controller.js','PENDING_BILLING_APPROVAL','Enforce completed clinical record and unresolved legacy/charge approval gates for Admin and Staff before confirmation.','Six approval-gate regressions + native Admin/Staff cases PASS'],
 ['F11','High','Charge reductions accepted invalid cents or could exceed balance after other discounts / payments','server/utils/chargeAdjustments.js','payment_count','Validate finite positive two-decimal money, count pending/approved amounts plus non-courtesy discounts, lock bills, reject paid/confirmed bills and non-Admin decisions.','Focused finance regressions + 41-case native matrix PASS'],
 ['F12','High','Legacy inclusive discount payload could count promotion twice or discard an authorized saved discount','server/controllers/staff.controller.js','requestedPresetDiscount','Separate promotion/courtesy/preset once and pass saved bill for authorization-preserving comparison.','Native billing sequence and billing regression assertions PASS; older substitution-price contract still FAIL'],
 ['F13','High','Doctor charge-reduction component had missing service exports and no mounted API workflow','client/src/pages/doctorPage/Doctor_Consultation.jsx','DoctorChargeReductionPanel','Wire request/list/cancel service exports, protected routes, ownership, draft-save prerequisite and UI on Consultation tab; approval waits for clinical completion.','Native Doctor request/read/own-cancel/other-request denial/draft approval gate PASS; full UI quantity/request legacy test status reported separately'],
 ['F14','Policy change','User explicitly authorized direct Admin reductions','client/src/components/billing/ChargeAdjustmentsPanel.jsx','Apply Direct Reduction','Admin/Super Admin directly apply audited reductions with reason and confirmation; Staff/Doctor requests stay pending; existing self-approval safeguard for legacy pending rows retained.','Native Admin + Super Admin monetary/audit/inventory assertions PASS; direct UI Playwright regression PASS'],
 ['F15','High','Migration registration and native MySQL replay failed on an existing schema','server/scripts/branchMigrations.js','2026-11-09-branch-google-maps-url.sql','Register Maps migration; normalize the known ambiguous foundation upsert; metadata-guard known additive/doctor DDL; preserve existing branch assignments; create replacement index before dropping legacy one. Immutable SQL unchanged.','Native repeated migrate PASS; resumable regression tests PASS; migration checksum tests PASS (only newline normalization)'],
 ['F16','High','Concurrent walk-ins shared an undeclared patientLockKey global and released the other request lock','server/utils/walkIn.js','let patientLockKey','Declare the key inside each addWalkInVisit invocation.','Reproduced FAIL before fix; concurrency regression PASS; real duplicate queue check-in PASS'],
 ['F17','High','Multi-branch Doctor could start a branch-2 appointment while branch 1 was selected','server/controllers/doctor.controller.js','WHERE id = ? AND doctor_id = ? AND branch_id = ?','Apply selected-branch predicate to appointment and queue locks before mutation.','Reproduced 200 before fix; actual API now 404 and foreign appointment remains confirmed; correct-branch full workflow PASS'],
 ['F18','Low','Duplicate branchId object property and duplicate SMS export','server/utils/smsService.js','sendPatientAppointmentReminderSms','Remove repeated identical keys; no functional policy change.','Focused server ESLint and postinstall checks PASS'],
]
const targeted=new Set(fixRows.map(r=>r[3]).concat(['server/utils/sessionSecurity.js','server/middlewares/auth.middleware.js','server/middlewares/httpSecurity.middleware.js','server/utils/chargeAdjustments.js','server/scripts/resumableBranchMigrations.js','server/routers/doctor.router.js','server/routers/branchChargeAdjustments.js','client/src/services/doctor.service.js','client/src/utils/philippinePhone.js']))
const csvRows=[['file_path','file_type','lines','dependencies','exports','import_export_status','syntax_status','manual_review_status','test_status','related_tests','executed_evidence','identified_problems']]
for(const i of source.inventory){
 const c=coverage[path.join(root,i.file)]
 const observed=c&&c.lines.covered>0?`Vitest instrumented execution: ${c.lines.covered}/${c.lines.total} lines (${c.lines.pct}%); overall suite FAIL`:'No per-file instrumented execution evidence'
 const manual=targeted.has(i.file)?'NOT TESTED — complete manual review; targeted changed/security behavior inspected':'NOT TESTED — complete manual line-by-line review not established'
 csvRows.push([i.file,i.type,i.lines,i.imports.map(x=>x.specifier).join('; '),i.exports.join('; '),i.import_export_status,i.syntax_status,manual,'NOT TESTED — full behavior; see executed evidence and named workflow cases',i.related_tests.join('; '),observed,i.problems.join('; ')])
}
fs.writeFileSync(path.join(out,'SOURCE_FILE_AUDIT.csv'),csv(csvRows))
const executions=[...api.executions.filter(e=>e.case!=='Endpoint authentication matrix'),...workflow.executions]
const routeMatches=(pattern,url)=>new RegExp('^'+pattern.replace(/[.*+?^${}()|[\]\\]/g,'\\$&').replace(/:[\w]+/g,'[^/]+')+'/?$').test(url)
fs.writeFileSync(path.join(out,'API_ENDPOINT_AUDIT.csv'),csv([['method','mounted_path','callbacks','anonymous_access','anonymous_http','expired_session','full_valid_input_error_matrix','named_execution_evidence','branch_isolation','notes'],...api.endpoints.map(e=>{
 const cases=executions.filter(x=>x.method===e.method&&routeMatches(e.path,x.path))
 return [e.method,e.path,e.handlers.join('; '),e.anonymous,e.anonymous_http,e.expired,'NOT TESTED — full endpoint scenario matrix',cases.map(x=>`${x.case}: ${x.status} (${x.role||'public'})`).join('; '),cases.some(x=>/branch|another patient/.test(x.case))?'See named cases; only specific recorded scenarios verified':'NOT TESTED','Runtime registration and auth rejection are limited evidence; use exact case names in results JSON']
})]))
write('COMPLETE_CODEBASE_AUDIT.md',`# Carait Clinic audit — acceptance incomplete

${scope}

The original Cloudflare failure was a missing getNotificationDestination export in portal.service.js. The current production client builds successfully. This audit also repaired reproducible runtime, billing, migration, branch-authorization and concurrency defects. **The system is not certified ready for the thesis demonstration or deployment:** regression failures and required untested scenarios remain.

${runTable}

## Inventory and review scope

${source.files} files / ${source.totalLines.toLocaleString()} lines were inventoried, including client, server, tests, configuration, SQL and supporting scripts. ${source.inventory.filter(i=>i.syntax_status==='PASS').length} JavaScript/JSX files passed full-file parsing. Imports, named exports, Linux filename case, route declarations, SQL literals, environment-variable names and generic error strings were scanned. Generated dependencies/builds, delivery archives, QA output and .env contents are excluded. See [SOURCE_FILE_AUDIT.csv](SOURCE_FILE_AUDIT.csv) and [source-inventory.json](evidence/source-inventory.json).

Complete manual semantic review of every line is **NOT TESTED**. Targeted manual review covered the changed behavior and authentication, branch guards, transaction boundaries, migration replay, Maps links, directory search, notifications and billing. Neither automated parsing nor the per-file CSV claims all ${source.totalLines.toLocaleString()} lines were manually reviewed. Test associations are textual hints, not coverage proof.

The runtime API inventory contains ${api.endpoints.length} registered method/path entries including nested payment routers and catch-alls; ${api.anonymousPassed} protected entries were exercised anonymously and with expired sessions. Detailed valid/invalid/ownership/business matrices were executed for the named native workflows only. The remaining endpoint scenarios are explicitly NOT TESTED in [API_ENDPOINT_AUDIT.csv](API_ENDPOINT_AUDIT.csv).

## Evidence and navigation

- [Bugs and fixes](BUGS_FOUND_AND_FIXED.md): exact source anchors, causes and regressions.
- [Remaining issues](REMAINING_ISSUES.md): residual failures and acceptance gaps.
- [Database](DATABASE_AUDIT.md), [security](SECURITY_AUDIT.md), [coverage](COVERAGE_REPORT.md).
- [Frontend](FRONTEND_TEST_RESULTS.md), [end-to-end](END_TO_END_TEST_RESULTS.md), [UI/UX](UI_UX_TEST_RESULTS.md).
- [Render](RENDER_BUILD_RESULTS.md), [Cloudflare](CLOUDFLARE_BUILD_RESULTS.md), [deployment checklist](FINAL_DEPLOYMENT_CHECKLIST.md).

${limits}
`)
write('BUGS_FOUND_AND_FIXED.md',`# Reproduced defects, fixes and policy decisions

${scope}

${table(['ID','Severity','Problem / root cause','Source','Fix','Verification'],fixRows.map(r=>[r[0],r[1],r[2],ref(r[3],r[4]),r[5],r[6]]))}

## Test infrastructure corrections

No test was deleted, skipped or weakened to obtain a green result. The Philippine phone test was renamed from .test.cjs to .node.test.cjs so the existing Node runner executes it instead of Vitest treating it as an empty suite. Fixtures gained real module-relative resolution, current audit/status SQL shapes and metadata filters; old assertions unrelated to a verified contract change remain failing. A legacy pending Admin request is seeded explicitly so the self-approval denial assertion survives the new direct-Admin policy.

The pinned migration hash regression now uses the runner's existing CRLF/final-newline normalization. Added assertions reject substantive SQL changes. Historical SQL was not rewritten. These were newline differences, not evidence of altered migration history.

Initial browser harness CORS mismatch, an overlapping dist rewrite and Windows preview teardown produced invalid harness failures. The final harness uses a fixed loopback origin, owns its HTTP server and snapshots built assets. Earlier artifacts are not counted as product defects. Baseline proof for the lock/branch vulnerabilities is retained in evidence/baseline/.
`)
const failedVitest=vitest.testResults.flatMap(f=>(f.assertionResults||[]).filter(t=>t.status==='failed').map(t=>({file:path.relative(root,f.name).replace(/\\/g,'/'),name:t.fullName||t.title})))
const advisoryRows=deps.results.filter(r=>r.check==='npm audit').map(r=>[r.project,r.status,JSON.stringify(r.vulnerabilities)])
write('REMAINING_ISSUES.md',`# Remaining issues and acceptance gaps

Acceptance status: **FAIL / NOT TESTED — not ready to certify**. A successful hosting build is not the final acceptance criterion.

## Reproducible residual findings

${table(['Priority','Finding','Status / next action'],[
 ['High','Existing regression suites remain red',`Server Node ${stats.server.fail}, client Node ${stats.client.fail}, Vitest ${vitest.numFailedTests}, Playwright ${browserCases.filter(r=>r.status==='FAIL').length} failures. Investigate each against an accepted contract; preserve meaningful safety assertions.`],
 ['High','Critical interaction coverage is incomplete','NOT TESTED: every visible control on every page; full valid/missing/type/nonexistent/duplicate/role/branch/outage matrix for every endpoint. Navigation and API authentication checks are not substitutes.'],
 ['High','External providers and hosted environments','BLOCKED: actual email/SMS verification and reset delivery, Admin MFA delivery, Cloudinary approval/upload delivery, PayMongo TEST provider/webhook exchange, physical printer, Render/Cloudflare Linux deployment. No automatic deployment authorized.'],
 ['Medium','Disabled inventory location-ledger SQL','FAIL: 5 EXPLAIN statements reference absent optional tables. Current legacy batch mode is guarded. Do not enable cutover or create these tables blindly. Complete the separate ledger migration and reconciliation project before activation.'],
 ['Medium','Dormant Doctor request modules','FAIL static imports: Doctor_Request.jsx references getMyRequests; Doctor_StockTransferRequest.jsx references getTransferAppointments / submitRequest. These are retired/unrouted sources; current active build passes. Resolve before reactivating them.'],
 ['Medium','Separate client/WEBSITE source tree','FAIL: missing restore-website-media.mjs and missing pages/layout/context dependencies. This unrelated app is incomplete and is not the Carait client build root.'],
 ['Medium','Coverage','Measured server Vitest line coverage is only '+coverage.total.lines.pct+'%; most controller decisions are not instrumented by that runner. Native/browser executions are separate and not added to its percentage.'],
 ['Medium','Rate limits use process-local memory','Reviewed design limitation: separate instances/restarts do not share counters. Distributed deployment abuse testing NOT TESTED.'],
 ['Low','ESLint warnings, bundle size and dependency advisories','Client warnings remain; primary JS chunk exceeds 500kB warning. Quill low advisory and minimatch/nodemon moderate dev advisories remain. No blind dependency downgrade.'],
 ['Low','Overview / ReportsPage import cycle','Detected static cycle; current build/render passes. Remove if touched during future work; no broad refactor applied.'],
 ])}

## Failing server Node assertions

${nodeFailures('server-node').map(s=>'- '+s).join('\n')}

## Failing client Node assertions

${nodeFailures('client-node').map(s=>'- '+s).join('\n')}

## Failing Vitest assertions

${table(['Source','Assertion'],failedVitest.map(r=>[r.file,r.name]))}

## Failing browser interactions

${table(['Test','Observed failure'],browserCases.filter(r=>r.status==='FAIL').map(r=>[r.name,r.reason]))}

## Contract conflicts requiring deliberate resolution

Several older tests assert exact source strings or retired UI structure. Examples: four billing tabs versus the current two sections; two landscape prescription pads versus the current portrait prescription contract; a substitution price of PHP470 versus the saved catalog price contract of PHP455. The application was not changed to satisfy mutually incompatible assertions. Some browser tests target old navigation names, headings and control names. These failures remain visible and are not all declared harmless; feature owners must confirm the intended behavior and retain equivalent behavioral assertions when updating tests.

## Dependency advisories

${table(['Project','Audit','Counts'],advisoryRows)}

See evidence/client-dependency-audit.json and server-dependency-audit.json for advisory IDs and dependency paths. Email/SMS/Maps destination delivery, registration verification and all unlisted mutations remain BLOCKED or NOT TESTED; no fabricated success is implied.
`)
write('DATABASE_AUDIT.md',`# Database audit

${scope}

## Structure and isolation

Source metadata: ${schema.sourceMetadataReads} read statements, ${schema.sourceMutations} writes, ${schema.applicationRowsCopied} application rows copied; ${schema.tables.length} tables, ${metadata.columns.length} columns and ${metadata.indexes.length} index-column entries. [database-metadata.json](evidence/database-metadata.json) records types, defaults, nullability, primary/unique/index definitions, foreign keys and SHOW CREATE definitions. Foreign-key column entries: ${metadata.relations.filter(r=>r.REFERENCED_TABLE_NAME).length}. These counts are inventory, not a claim that every relationship is correct.

The separate native MySQL instance bound to 127.0.0.1:33409 and used schema carait_qa_20261109. Accounts, branches, appointments, consultations, payments and stock were synthetic. The source migration ledger contained 0 rows; no patient records were copied. Test runner strips local .env values and loads scripts/audit/networkGuard.cjs. Metadata acquisition is a separate explicitly read-only source operation.

## Executed checks

${table(['Check','Status','Evidence / limits'],[
 ['Native migration replay and repeat',read('isolated-migrate').status,'Existing schema with empty copied migration ledger; source not migrated. Fixed ambiguous foundation upsert, duplicate doctor branch DDL and MySQL additive syntax.'],
 ['SELECT planning',api.sqlResults.some(r=>r.status==='FAIL')?'FAIL':'PASS',`${api.sqlResults.length} static, direct, non-dynamic SELECT query literals checked with parameterized EXPLAIN; ${api.sqlResults.filter(r=>r.status==='FAIL').length} fail in optional ledger code`],
 ['Report SQL',read('reports-sql').status,'19 queries validated by the repository verifier against isolated MySQL'],
 ['Native billing integrity','PASS','Staff55 + Admin20 + Super Admin10 reductions on 1000 -> 915; version increments, one direct audit event, no inventory movement for money-only reductions; cash retry creates one payment/receipt.'],
 ['Clinical stock / transaction integrity','PASS','Draft does not consume. Insufficient stock rolls clinical state back. Successful finalize consumes one unit (10 -> 9); repeat finalization cannot consume twice.'],
 ['Branch attribution','PASS for named cases','Branch-1 Admin/Staff denied workspace branch2; Doctor branch2 start from selected branch1 returns404 without mutation; patient cannot read another patient bill.'],
 ['Directory / ban state','PASS','Name/email/phone search, gender/address/history shape, boolean validation, ban revocation and unban does not revive old token.'],
 ['All dynamic SQL and all write variants','NOT TESTED','Static candidates are recorded in sql-inventory.json; EXPLAIN success does not validate transaction semantics or numerical correctness.'],
 ['All dashboard counts, no-shows, low-stock/report reconciliations','NOT TESTED','Partial existing unit tests and report planning only; no claim of exhaustive business-data reconciliation.'],
 ])}

## Optional ledger failures

${table(['Source','Line','Error'],api.sqlResults.filter(r=>r.status==='FAIL').map(r=>[r.file,r.line,r.message]))}

These paths belong to a disabled location-ledger cutover. Legacy batch mode explicitly checks mode state before operation and passed the clinical stock test. Activation is outside this fix; do not patch missing optional tables without reconciling balances.

No Purchase Cost per Unit input, spreadsheet template or workflow was added. Existing legacy database cost columns were not removed or used to reprice the saved service total.
`)
write('SECURITY_AUDIT.md',`# Security audit

${scope}

This is an application audit with targeted adversarial checks, not an exhaustive penetration-test certification.

${table(['Area','Result','Evidence / limitation'],[
 ['JWT/session validation','PASS for exercised cases',`${api.anonymousPassed} anonymous + ${api.expiredPassed} expired checks; database-backed active-account/session_version check. Tokens are role scoped and Admin portals use separate cookies.`],
 ['Password login and cookie protection','PASS / limited','Actual bcrypt password checks exercised for all 5 roles; patient/doctor HttpOnly assertions. Admin MFA disabled only in the local child fixture; real MFA delivery BLOCKED. Production Secure/SameSite=Lax configuration inspected.'],
 ['Revocation / banning / logout','PASS','Existing patient token blocked after ban; old token remains revoked after unban; new session allowed; logout replay returns401.'],
 ['Role and branch authorization','PASS for named attacks','Other roles denied Super Admin directory; Admin/Staff workspace branch2 denied; multi-branch Doctor start vulnerability fixed and regression verified; patient IDOR on paid bill returns404. Other resource/action ownership combinations NOT TESTED.'],
 ['CSRF / CORS','PASS for targeted controls','Exact origin allowlist + cookie-aware production origin guard inspected; unwanted origin returns403 instead of500. OriginGuard is bypassed by NODE_ENV=test in native workflow harness. Production origin behavior has existing middleware tests; exhaustive hosted cross-origin browser matrix NOT TESTED.'],
 ['SQL injection','Partial review','Critical changed queries use bound parameters. Dynamic identifiers inspected in role/table allowlists. Full repository dynamic SQL taint analysis and fuzzing NOT TESTED; a successful EXPLAIN is not an injection audit.'],
 ['Billing authorization and transactions','PASS','Staff cannot decide requests; paid/confirmed bills reject reductions; unfinished clinical state cannot be approved; direct Admin reason/audit/version/row lock verified; no stock edits by reductions.'],
 ['Concurrency','PASS for new regression','Walk-in patient lock formerly process global; now local to each invocation. Concurrent fake executor regression proves release keys; native queue duplication and payment idempotency cases pass. Load/stress testing NOT TESTED.'],
 ['Error disclosure','PASS for injected DB failure','Safe API500 includes request_id, omits raw synthetic driver diagnostic/stack; readiness503. Server logs retain diagnostic details. Other external failure paths NOT TESTED.'],
 ['File uploads / XSS','Partial / BLOCKED','Existing Cloudinary signature and upload integrity suites executed; real provider scan/upload delivery BLOCKED. No dangerouslySetInnerHTML found in active source scan; structured announcement rendering inspected. This does not prove all XSS sinks safe. Quill low dependency advisory remains.'],
 ['Password reset / verification / rate limit','Partial / BLOCKED','Existing unit/integration tests executed; real email/SMS OTP and reset completion delivery BLOCKED. Limits are process local, so multi-instance enforcement is unverified.'],
 ['API proxy','PASS in existing local tests','HMAC client-IP metadata, path validation, no webhook relay, bounded timeout, cookie/header forwarding checked in hosting suite. Remote Cloudflare secrets and Render match NOT TESTED.'],
 ])}

Fixed high-priority findings: Doctor selected-branch bypass, global walk-in lock key, premature bill confirmation, unsafe reduction inputs/caps. Baseline failure evidence and final named cases are retained. Dependency advisory totals are client1 low and server2 moderate dev-only, with no high/critical from the recorded npm audit. Do not infer that the absence of a high-severity advisory proves the system secure.
`)
write('FRONTEND_TEST_RESULTS.md',`# Frontend testing

${scope}

## Build, syntax and lint

Production prebuild25/25 PASS; Vite PASS. Client ESLint PASS with warnings retained. All active relative named-import build checks pass. Dormant Doctor request modules and the separate WEBSITE tree still have static missing imports. The original Cloudflare getNotificationDestination export failure is resolved in the current source.

## Real browser navigation

${pages.results.length} renders: ${pageCounts.PASS||0} PASS, ${pageCounts.FAIL||0} FAIL, ${pageCounts.BLOCKED||0} BLOCKED. ${pages.results.length/2} route paths were opened at widths1440 and390 using the built React application, actual Express API and isolated MySQL. All five roles and public pages were included. No collected page exceptions, API5xx or horizontal overflow remained. [Raw page evidence](evidence/browser-pages-results.json).

This is a navigation/render/empty-state check. Routes with synthetic ID1 may show controlled empty/not-found states or redirect to their supported route. This does not exercise every page's search/filter/save/edit/delete/modal/button. Those scenarios are NOT TESTED except where separately recorded below.

## Node regression tests

${stats.client.pass}/${stats.client.tests} PASS; ${stats.client.fail} FAIL; ${stats.client.skipped} skipped. Full command/log: evidence/client-node.json and client-node.log. Recurring error-reference and Maps fallback regressions pass. Remaining named failures are listed in REMAINING_ISSUES.md.

## Playwright interaction tests (API mocks)

${table(['Test','Status','Failure detail if any'],browserCases.map(r=>[r.name,r.status,r.reason]))}

Mocked UI success is not native database end-to-end proof. Native workflow results are recorded independently in END_TO_END_TEST_RESULTS.md. Browser tests were not removed or skipped to obtain a pass. Failed selectors/fixtures remain visible until reconciled with the current accepted UX and behavior.
`)
write('END_TO_END_TEST_RESULTS.md',`# Native API and end-to-end results

${scope}

## Actual clinical/billing chain

These steps executed against actual Express HTTP endpoints and native MySQL, not repository SQL mocks. The fixture created synthetic accounts, doctor schedules, branch service and batch stock. The existing QA allowlist enabled same-day booking only for synthetic branch1 in this process; production booking settings were not modified. Admin password sessions used a local-only MFA override. Provider delivery is not established.

${table(['Workflow assertion','Status','Failure if any'],workflow.results.map(r=>[r.name,r.status,r.reason||'']))}

The chain crosses Patient -> Staff -> Doctor -> billing/payment -> Patient history. Negative assertions prove no duplicate queue entry/payment, no draft stock use, rollback on insufficient stock, one final stock deduction and patient billing ownership.

## Targeted native API cases

${table(['Case','Status','Failure if any'],api.results.map(r=>[r.name,r.status,r.reason||'']))}

${api.anonymousPassed} anonymous and ${api.expiredPassed} expired session checks also pass. Runtime-discovered inventory: ${api.endpoints.length} entries. [Per-endpoint evidence](API_ENDPOINT_AUDIT.csv), [actual request log](evidence/api-smoke-results.json), [clinical chain](evidence/clinical-workflow-results.json).

## Required workflow coverage gaps

${table(['Role / integration','Status','Unverified actions'],[
 ['Patient registration / verification','BLOCKED','Actual email/SMS code delivery and completion; password reset. Login/dashboard/pages/booking/billing/logout have narrower recorded evidence.'],
 ['Staff','NOT TESTED for complete UI flow','Real HTTP confirmation/check-in/call/payment/receipt passes. Every UI action, patient registration consent variants, cashier closing and browser response-loss scenarios remain incomplete/failing.'],
 ['Doctor','PASS for native clinical chain; UI partial','Diagnosis, prescription, draft, finalization and actual deduction pass. Image scans/amendments/all prescription print layouts not comprehensively tested.'],
 ['Admin','PASS for named billing cases; otherwise partial','Direct reductions and decisions, branch restrictions and notifications verified. Full account/schedule/inventory/report/audit CRUD matrices NOT TESTED.'],
 ['Super Admin','PASS for named directory/branch/billing cases; otherwise partial','Directory, ban/unban, Maps create/edit and direct reduction verified. Every setup/account/report/log control NOT TESTED.'],
 ['PayMongo / Cloudinary / email / SMS','BLOCKED','External delivery intentionally disabled. Local mocked gateway/security tests do not establish real provider behavior.'],
 ['All visible page controls / printer / multi-instance races','NOT TESTED','No complete manual click-through, real paper print, load/stress or cross-browser certification.'],
 ])}
`)
write('UI_UX_TEST_RESULTS.md',`# UI and UX results

Real desktop/mobile navigation: ${pageCounts.PASS||0}/${pages.results.length} PASS at 1440px and390px. Three reproducible Super Admin horizontal overflows were fixed with minimum-width constraints on cards and the report branch filter. Four Settings screens load and refresh without hook-order errors. Legacy billing redirects retain branch identity. Admin direct reduction now requires a reason, confirmation and disabled submission state.

Evidence: [live page checks](evidence/browser-pages-results.json), [browser interactions](evidence/browser-results.json). Screenshots are local generated artifacts under evidence/browser-artifacts/ and excluded from Git.

${table(['Check','Status / limit'],[
 ['No collected runtime exceptions/API5xx/overflow in navigation sweep','PASS for the recorded route/viewport fixture'],
 ['Admin direct reduction reason/confirmation / single approved row','PASS in Playwright mock test and independent native monetary checks'],
 ['Settings delayed load and refresh','PASS for Admin/Staff/Doctor/Patient'],
 ['Every visible button/link and every CRUD dialog','NOT TESTED; failing existing interactions remain in FRONTEND_TEST_RESULTS.md'],
 ['Network retry, failed upload, response-loss payments, cashier-closing UI','Partial / FAIL / BLOCKED; native duplicate-payment assertion passes, browser interaction suite still has failures'],
 ['All search/filter/pagination states','NOT TESTED for every page; directory API search and response shape pass'],
 ['Screen-reader/keyboard accessibility and all dropdown labels','NOT TESTED comprehensively'],
 ['Physical receipt/prescription paper layout, all browsers','BLOCKED / NOT TESTED; no printer used'],
 ['Exact real clinic Google Maps destination','BLOCKED; saved URL preserved/validated, but synthetic links do not establish intended real-world pin'],
 ])}

No general redesign was performed. Purchase Cost per Unit was not added to any form/template/workflow. Large primary JS chunk remains a performance concern; no Lighthouse or real mobile network performance claim is made.
`)
const coverageFiles=Object.entries(coverage).filter(([k])=>k!=='total')
write('COVERAGE_REPORT.md',`# Automated coverage

Instrumented runner: server npm run test:coverage (Vitest/V8), with reportOnFailure and explicit include patterns for controllers, routers, utils, middlewares, db and server.js. ${coverageFiles.length} server runtime files appear in the report. Tests still fail; coverage is partial execution evidence.

${table(['Metric','Covered','Total','Percent'],['lines','branches','functions','statements'].map(k=>[k,coverage.total[k].covered,coverage.total[k].total,coverage.total[k].pct+'%']))}

Raw artifacts: evidence/coverage/coverage-summary.json and coverage-final.json (generated/ignored locally). The per-file CSV embeds observed line execution where available. This is **not** all-repository coverage and excludes native Node/API/browser executions from its numerator. No combined or 100% claim is made. Client instrumented coverage was NOT TESTED; Node source-assertion tests do not provide it.

## Low-coverage critical files

${table(['File','Line %','Branch %','Function %'],coverageFiles.filter(([k])=>/controllers|sessionSecurity|chargeAdjustments|billing\.js|inventoryBatches/.test(k)).sort((a,b)=>a[1].lines.pct-b[1].lines.pct).slice(0,18).map(([k,c])=>[path.relative(root,k).replace(/\\/g,'/'),c.lines.pct,c.branches.pct,c.functions.pct]))}

New checks added: error reference propagation, saved Maps directions/NULL fallback, resumable migration DDL, asynchronous Settings/legacy redirect rendering, concurrent walk-in lock ownership, and native cross-role clinical/billing/stock/branch/idempotency cases. These increase evidence for critical paths without claiming complete controller coverage.

Remaining unit/integration/browser failure counts and exact names are preserved in REMAINING_ISSUES.md. No failure was hidden by disabling a test.
`)
write('RENDER_BUILD_RESULTS.md',`# Render production readiness checks

Local result: **PASS for dependency install, postinstall, schema checks and startup; FAIL for complete regression acceptance. Remote deployment NOT TESTED.**

${table(['Render-related check','Status','Evidence / scope'],[
 ['npm ci dependency install','PASS','Disposable server directory, lockfile reproduced with lifecycle hooks disabled there; hooks run separately in actual workspace'],
 ['npm run postinstall',read('server-postinstall').status,'Syntax modules and actual Staff/charge route binding validation; see evidence/server-postinstall.log'],
 ['Recurring walk-ins/acceptance callback','PASS','Staff factory-registration regression runs inside postinstall; no undefined controller dependency'],
 ['Source graph / imports',read('source-graph').status,log('source-graph').trim().split('\n').at(-1)],
 ['Isolated npm run migrate',read('isolated-migrate').status,'Native MySQL; metadata-guarded replay and repeat; production source not migrated'],
 ['npm run verify:deploy / verify:reports-sql','PASS','Synthetic database schema check and19 report statements'],
 ['NODE_ENV=production node server.js','PASS','Separate local process, isolated SQL runtime user and dummy provider configuration; health200/ready200/news200/webhookGET405/unknown404; stopped after checks'],
 ['Full automated regression acceptance','FAIL','Node/Vitest/browser failures retained; see main audit'],
 ['Real Render Linux deployment / production credentials','NOT TESTED','No deploy or production migration performed'],
 ])}

Environment-variable names are inventoried in evidence/source-inventory.json; values are excluded. Required runtime validation was exercised: missing provider/secret config initially fails startup; synthetic required configuration allows local production-mode startup. Dummy values establish configuration shape only, not provider delivery. This Windows runtime differs from hosted Linux/Node versions; case-sensitive import checks reduce but do not eliminate that gap.

Start/build commands for a server-root Render service: npm ci (runs postinstall), separately controlled npm run migrate, npm start. Confirm actual service settings and required secrets from server/utils/envValidation.js before any authorized remote deployment. No dashboard settings were changed.
`)
write('CLOUDFLARE_BUILD_RESULTS.md',`# Cloudflare Pages build results

Local Carait client production build: **PASS**. Remote retry/deployment: **NOT TESTED**.

The supplied failing log reports MISSING_EXPORT: getNotificationDestination was not exported from src/services/portal.service.js. That export and its authenticated destination path are present in current source. Notification destination regression, client prebuild checks and production bundling pass. This is separate from the incomplete client/WEBSITE app.

${table(['Check','Status','Evidence / scope'],[
 ['Lockfile installation','PASS','Disposable client npm ci --ignore-scripts; hooks checked separately'],
 ['Actual npm run build','PASS','25 prebuild assertions + Vite; evidence/client-build.log'],
 ['Active named imports / filename case','PASS','Build plus inventory case scan; dormant unresolved modules listed separately'],
 ['API proxy','PASS in local automated suite','client/tests/cloudflareProxy.node.test.mjs and server hosting tests executed; HMAC metadata/path restrictions/timeout/cookies checked'],
 ['Built route navigation','PASS for render checks',`${pageCounts.PASS||0}/${pages.results.length} local actual-API renders; SPA fallback served by audit harness, not the remote Pages edge`],
 ['Hosted Functions secrets / edge execution / actual routing','NOT TESTED','No Cloudflare dashboard/API credentials inspected or deployment retried'],
 ['All interactions and runtime acceptance','FAIL / NOT TESTED','Existing Playwright/Node failures and gaps remain'],
 ['Separate client/WEBSITE build','FAIL','Missing restore script and imports; use Carait client root for this project'],
 ])}

Expected Carait Pages settings: root directory client; build command npm run build; output directory dist. Confirm Functions are included from client/functions. Set API_ORIGIN to the HTTPS Render API origin and API_PROXY_SECRET to the matching secret on Render (minimum32 characters); do not expose server/provider credentials through VITE variables. These names are from source, not verified remote settings.

No broken active asset import was reported by Vite. External image/provider delivery and real clinic Maps pin verification remain untested. Primary JS chunk size warning remains. Local Windows Node${process.version} is not the exact Linux image from the supplied Cloudflare log.
`)
write('FINAL_DEPLOYMENT_CHECKLIST.md',`# Final deployment / demonstration checklist

**Acceptance: FAIL / NOT TESTED — do not describe the repository as fully ready. No automatic deployment was performed.**

${table(['Requirement','Status','Evidence / remaining action'],[
 ['Repository/source inventory','PASS',`${source.files} files inventoried; SOURCE_FILE_AUDIT.csv`],
 ['Every relevant line manually reviewed','NOT TESTED','Automated full-file scan plus targeted manual review does not meet exhaustive manual review'],
 ['All critical API scenario matrices','NOT TESTED','Named critical native workflows pass; remaining endpoint/action/input/ownership matrices incomplete'],
 ['All five roles exercised','PASS for narrower recorded scope','Real sessions/pages and named workflows; not all features per role'],
 ['Native booking -> clinical -> stock -> receipt/history chain','PASS',`${workflow.results.filter(r=>r.status==='PASS').length}/${workflow.results.length} clinical workflow cases`],
 ['Reproduced high-priority branch/concurrency/billing defects','PASS for listed fixes','Exact sources and regression evidence in BUGS_FOUND_AND_FIXED.md'],
 ['All tests / interactions green','FAIL',`${stats.server.fail} server Node + ${stats.client.fail} client Node + ${vitest.numFailedTests} Vitest + ${browserCases.filter(r=>r.status==='FAIL').length} browser failures`],
 ['Database integrity','PASS for targeted transactions; incomplete overall','Migration replay, clinical rollback, one stock deduction, one receipt/payment pass; dynamic SQL and all reports not fully verified'],
 ['Security findings documented','PASS','SECURITY_AUDIT.md; no penetration-test or complete security certification'],
 ['Render local production prerequisites','PASS','Install/hooks/schema/startup pass; hosted Linux deployment NOT TESTED'],
 ['Cloudflare local production build','PASS','Client prebuild + Vite pass; hosted Functions/routing NOT TESTED'],
 ['External verification/payment/upload delivery','BLOCKED','Use authorized sandbox provider credentials and test inbox/phone; no production recipients or live payments'],
 ['No unresolved critical risk','NOT TESTED','Remaining interaction failures, coverage gaps and optional-ledger activation must be resolved/reviewed'],
 ['Real demonstration rehearsal','NOT TESTED','Rehearse with synthetic accounts on approved staging: book/check in/call/consult/finalize/pay/receipt, directory ban/unban, branch/Maps form, retry/error cases'],
 ['Production migration/deploy approval','NOT TESTED','Prepare a reviewed patch and backup/migration plan; no deploy or source-DB write is authorized by this audit'],
 ])}

Before an authorized release: reconcile failed tests with accepted contracts without removing safety assertions; verify Google Maps saved destination in a real browser; check API_ORIGIN/API_PROXY_SECRET and Render allowlisted client origin; verify provider TEST mode, required secrets and PIN; keep the optional inventory ledger disabled until its separate cutover is complete. Run the remaining endpoint/UI cases and a full staging rehearsal before certifying readiness.

## Reproducing local checks

Use node QA_REPORT/scripts/run.cjs with named checks from that script. Synthetic unit/build checks strip .env values and block outbound access. The native DB checks require the disposable MySQL instance and synthetic schema; do not substitute production connection settings. scripts/disposable-db.cjs creates the loopback instance; scripts/bootstrap-isolated.cjs restores saved metadata into an empty local schema. Run isolated-migrate then api-smoke before clinical-workflow/browser-pages. Source schema acquisition is optional and read-only; ordinary replay uses saved metadata and does not contact the source database. Offline bootstrap and native migration replay also passed on carait_qa_replay_20261109.

Raw check commands, exit codes, durations and logs are in evidence/. Report generation: node QA_REPORT/scripts/write-reports.cjs. Generated screenshots and V8 coverage files are ignored locally. Source evidence JSON and logs contain no copied application records or source credential values.
`)
fs.writeFileSync(path.join(ev,'audit-summary.json'),JSON.stringify({generatedAt:new Date().toISOString(),acceptance:'FAIL / NOT TESTED',files:source.files,lines:source.totalLines,node:stats,vitest:{passed:vitest.numPassedTests,failed:vitest.numFailedTests,total:vitest.numTotalTests},browser:{passed:browserCases.filter(r=>r.status==='PASS').length,failed:browserCases.filter(r=>r.status==='FAIL').length,total:browserCases.length},livePages:pageCounts,api:{passed:api.passed,failed:api.failed,endpoints:api.endpoints.length,anonymous:api.anonymousPassed,expired:api.expiredPassed},workflow:{passed:workflow.results.filter(r=>r.status==='PASS').length,total:workflow.results.length},coverage:coverage.total,productionMutations:0},null,2))
console.log('Wrote all 14 required reports; acceptance remains incomplete.')
