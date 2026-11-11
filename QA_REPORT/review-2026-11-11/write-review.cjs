'use strict'
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict'),{spawnSync}=require('node:child_process')
const here=__dirname,root=path.resolve(here,'../..'),previous=path.resolve(here,'../conflict-repair-2026-11-11')
const read=(file,base=here)=>JSON.parse(fs.readFileSync(path.join(base,file+'.json'),'utf8'))
const log=(file,base=here)=>fs.readFileSync(path.join(base,file+'.log'),'utf8')
const stats=(file,base=here)=>Object.fromEntries([...log(file,base).matchAll(/^# (tests|pass|fail|skipped) (\d+)\s*$/gm)].map(match=>[match[1],Number(match[2])]))
const nodeFailures=(file,base=here)=>[...log(file,base).matchAll(/^not ok \d+ - (.+)$/gm)].map(match=>match[1])
const vitestFailures=j=>j.testResults.flatMap(suite=>(suite.assertionResults||[]).filter(test=>test.status==='failed').map(test=>test.fullName))
const git=args=>{const result=spawnSync('git',args,{cwd:root,encoding:'utf8',windowsHide:true,maxBuffer:16*1024*1024});assert.equal(result.status,0);return result.stdout.trim()}
const table=(heads,rows)=>'| '+heads.join(' | ')+' |\n| '+heads.map(()=> '---').join(' | ')+' |\n'+rows.map(row=>'| '+row.map(value=>String(value??'').replace(/\|/g,'/').replace(/\r?\n/g,' ')).join(' | ')+' |').join('\n')
const node={server:stats('server-node'),client:stats('client-node')},oldNode={server:stats('server-node',previous),client:stats('client-node',previous)}
const vitest=read('server-vitest-results'),oldVitest=read('server-vitest-results',previous),browser=read('browser-results'),lint=read('client-lint-results')
const lintCounts={errors:lint.reduce((sum,file)=>sum+file.errorCount,0),warnings:lint.reduce((sum,file)=>sum+file.warningCount,0)}
const introduced={server:nodeFailures('server-node').filter(name=>!nodeFailures('server-node',previous).includes(name)),client:nodeFailures('client-node').filter(name=>!nodeFailures('client-node',previous).includes(name)),vitest:vitestFailures(vitest).filter(name=>!vitestFailures(oldVitest).includes(name))}
const changed=git(['diff','--numstat','7723e97..HEAD','--','client','server']).split(/\r?\n/).map(line=>{const [added,removed,file]=line.split('\t');return {file,added:Number(added),removed:Number(removed)}})
assert.equal(changed.length,86);assert.equal(read('reproductions').results.length,3)
const findings=[
 {priority:'P1',title:'Keep the booked discount after its live promotion is deleted',file:'server/utils/billingServicePromotions.js',line:40,
  issue:'The saved booking snapshot is used only when promotion_id is truthy. Deleting an offer is supported, and the existing FK sets appointment.promotion_id to NULL while leaving the saved selected service and discount snapshots. On later consultation finalization or draft save, this helper removes the booked discount and raises the patient total.',
  evidence:'Synthetic post-delete state: service 400, saved discount 100; before live ID is cleared the discount is 100, afterwards it is 0 and the bill becomes 400 instead of 300. No live row was deleted.',
  fix:'Treat a valid saved booking snapshot as authoritative independently of the optional live promotion FK. Apply current offer eligibility only to added-service selections. Add a booked-offer-deletion regression.',confidence:'Reproduced with actual helper and in-memory query executor.'},
 {priority:'P2',title:'Interpret SMS quota timestamps in the database timezone',file:'server/utils/registrationSmsLimits.js',line:31,
  issue:'The connection returns DATETIME strings (dateStrings:true) and defaults to +08:00, but new Date(row.window_start/last_sent_at) parses a timezone-free string in the Node host timezone. On a UTC host, the stored timestamps appear eight hours in the future: cooldown is skipped and the hourly window becomes nine hours.',
  evidence:'In a UTC process with MySQL-style +08:00 strings, attempts at 0, 1 and 2 seconds were all allowed. Attempt 4 at 3 seconds returned retryAfterSeconds=32397 instead of enforcing the first 60-second pause. The current unit mock stores Date objects and misses this boundary.',
  fix:'Use a single explicit timezone/UTC representation or database-native time comparisons for the entire quota window. Test mysql2 dateStrings values on a UTC host.',confidence:'Reproduced with actual quota code and synthetic dateStrings executor.'},
 {priority:'P2',title:'Give each confirmation event its own email idempotency key',file:'server/utils/doctorConfirmationNotifications.js',line:61,
  issue:'Every confirmation for an appointment uses doctor-confirm-<id>. A patient can reschedule an already confirmed appointment back to pending; when the clinic confirms again, the changed date/time produces a new email payload with the old key.',
  evidence:'Captured two actual helper payloads for appointment 9 on different dates/times: both keys were doctor-confirm-9 and the HTML differed. No email was sent. Provider rejection is an inference from the documented API contract.',
  fix:'Key by a persisted confirmation-event/revision identifier, retaining the same key only for retries of that exact event.',confidence:'Key/payload collision reproduced locally; delivery behavior verified from official documentation.',source:'https://resend.com/docs/dashboard/emails/idempotency-keys'},
 {priority:'P2',title:'Update migration-order expectations for the three appended migrations',file:'server/tests/deployment/migrationRunner.node.cjs',line:141,
  issue:'The runner appends registration-sms-limits, billing-stock-reservations and doctor-confirmation-notifications, but the pinned-check test still asserts the old last five files. This makes the existing backend regression suite fail deterministically.',
  evidence:'The current checked-in migration SQL matches pinned SHA-256 checksums test now fails. The displayed diff is the expected migration tail, not a changed historical SQL hash.',
  fix:'Assert the updated complete registration order/tail while retaining historical hash and replay/type/history checks. Do not change old migration SQL or delete failing tests.',confidence:'Observed in the fresh full backend Node run.'},
]
const exclusions=['!.git/**','!**/node_modules/**','!**/.baseline/**','!**/.tools/**','!**/dist/**','!**/browser-artifacts/**','!**/.cache/**']
const scan=spawnSync('rg',['-n','--hidden','--no-ignore',...exclusions.flatMap(glob=>['--glob',glob]),'-e','^\\s*(<<<<<<<(?:\\s.*)?|=======$|>>>>>>>(?:\\s.*)?|\\|\\|\\|\\|\\|\\|\\|(?:\\s.*)?)$','.'],{cwd:root,encoding:'utf8',windowsHide:true,maxBuffer:16*1024*1024})
assert.ok([0,1].includes(scan.status));assert.equal(scan.stdout.trim(),'','Remaining markers require inspection')
git(['diff','--check'])
assert.equal(git(['diff','--name-only']), '','Review must not edit tracked application files')
const summary={date:'2026-11-11',timezone:'Asia/Manila',reviewedHead:git(['rev-parse','HEAD']),baseline:'7723e97',changedFiles:changed,findings,node,previousNode:oldNode,vitest:{tests:vitest.numTotalTests,pass:vitest.numPassedTests,fail:vitest.numFailedTests},previousVitest:{tests:oldVitest.numTotalTests,pass:oldVitest.numPassedTests,fail:oldVitest.numFailedTests},lint:lintCounts,browser:{selectedSuite:'implementation20261111.spec.mjs',pass:browser.stats.expected,fail:browser.stats.unexpected,skipped:browser.stats.skipped},introducedFailures:introduced,currentFailures:{server:nodeFailures('server-node'),client:nodeFailures('client-node'),vitest:vitestFailures(vitest)},conflictMarkers:0,applicationEdits:0,productionQueries:0,productionWrites:0,providerMessagesSent:0}
fs.writeFileSync(path.join(here,'review-results.json'),JSON.stringify(summary,null,2))
const findingText=findings.map((finding,index)=>`## ${index+1}. [${finding.priority}] ${finding.title}\n\nLocation: [${finding.file}:${finding.line}](../../${finding.file}#L${finding.line}).\n\n${finding.issue}\n\n**Evidence:** ${finding.evidence}\n\n**Correction:** ${finding.fix}\n\n${finding.source?'Resend retains keys for 24 hours and rejects a different payload using the same key with HTTP 409. [Official Resend idempotency documentation]('+finding.source+'). No provider request was made in this review.\n\n':''}Validation: ${finding.confidence}`).join('\n\n')
const report=`# Carait Clinic — review of latest changes

Date: **11 November 2026 (Asia/Manila)**. Reviewed **7723e97..${summary.reviewedHead.slice(0,7)}**, covering the three new commits 130358d, 0a5d33d and b93ff31 and 86 changed client/server source/test files. The working tree was clean when review began. Application files remain unchanged; only this review evidence directory was added.

**Found three functional defects and one migration-test defect.** Builds succeeding does not establish that these workflows are correct. Review focused on billing/promotion calculations, checkout/refund state, stock-reservation interactions, registration quotas, doctor notifications and their route/permission/dependency chains. This is not a claim of complete manual line-by-line review or full-system UAT.

${findingText}

## Validation actually performed

${table(['Check','Previous evidence','Current result'],[
 ['Client build','PASS',read('client-build').status+'; required 25 prebuild assertions and Vite production bundle'],
 ['Backend syntax/route checks','PASS',read('server-postinstall').status+'; 375 modules and 239 handler references'],
 ['Backend source graph','PASS',read('server-source').status+'; 632 files, 1464 imports resolved'],
 ['Frontend lint','0 errors; 23 warnings',`${lintCounts.errors} errors; ${lintCounts.warnings} warnings`],
 ['Backend Node',`${oldNode.server.pass}/${oldNode.server.tests} pass; ${oldNode.server.fail} fail`,`${node.server.pass}/${node.server.tests} pass; ${node.server.fail} fail`],
 ['Frontend Node',`${oldNode.client.pass}/${oldNode.client.tests} pass; ${oldNode.client.fail} fail`,`${node.client.pass}/${node.client.tests} pass; ${node.client.fail} fail`],
 ['Backend Vitest',`${oldVitest.numPassedTests}/${oldVitest.numTotalTests} pass; ${oldVitest.numFailedTests} fail`,`${vitest.numPassedTests}/${vitest.numTotalTests} pass; ${vitest.numFailedTests} fail`],
 ['Focused payment browser interactions','12 selected cases',`${browser.stats.expected} pass; ${browser.stats.unexpected} fail; ${browser.stats.skipped} skipped`],
 ['Targeted boundary reproductions','Not previously covered','3 defects reproduced using synthetic values and captured payloads'],
 ['Conflict scan / whitespace','Previously clear','No conflict markers; git diff --check passes'],
])}

The backend defines no npm build script. Its deployment checks were run instead. Baseline figures are the saved conflict-repair evidence, not a fresh run of the old commit. No old tests were deleted or modified. The 12 browser cases cover Admin/Staff responsive cash/partial payments, QR locking/cancellation and stable retry keys; they do not establish live refund/email/provider delivery.

### Newly failing assertions

${table(['Suite','Assertion'],[...introduced.server.map(name=>['Backend Node',name]),...introduced.client.map(name=>['Frontend Node',name]),...introduced.vitest.map(name=>['Vitest',name])])}

There are six newly failing backend Node assertions, two frontend Node assertions and two Vitest assertions, in addition to the prior failures. The three consultation lifecycle failures observe a dropped saved promotion with no live promotion ID; their fixture state also models the supported post-delete state in finding 1. Several other new failures are source-string contracts affected by intentional changes: the light-only theme, wording changes, and extraction of promotion logic into a shared helper. The new Vitest failures expect the old text whole units and Supplies Actually Used. Refresh those contracts only after confirming the intended behavior, preserving meaningful financial and authorization assertions. The migration-tail mismatch is described in finding 4.

Full current and new-failure name inventories are in [review-results.json](review-results.json); the individual .log and JSON files contain actual command output. [Reproductions](reproductions.json) record observed/expected financial and quota values and the captured email key collision.

## Limits and deployment assessment

Do not treat this version as ready for production until the booked-discount, SMS-time and confirmation-key defects are corrected and retested. The three newly registered schema migrations remain a deployment prerequisite; none was applied by this review. Existing reversal SQL/history were not changed.

No production database query/write, live patient access, refund, SMS/email dispatch, migration or demo reset was performed. The reset script was inspected only. Test processes used synthetic settings and blocked external network access. Public Resend documentation was read to validate its idempotency contract.

This review did not repeat the full 39-case browser suite or the real-database native workflow. Unified stock-out with its feature flag enabled, live provider delivery and actual new-table deployment were not end-to-end verified. Those limits should remain visible even though the included unit tests pass.

## Changed-file inventory

${table(['File changed by your commits','Added lines','Removed lines'],changed.map(row=>[row.file,row.added,row.removed]))}

Review artifacts contain synthetic test data/schema/code references only; original application files and earlier QA reports were retained.
`
fs.writeFileSync(path.join(here,'REVIEW.md'),report)
console.log(JSON.stringify({reviewedHead:summary.reviewedHead.slice(0,7),functionalFindings:3,migrationTestFindings:1,newFailingAssertions:Object.values(introduced).reduce((sum,rows)=>sum+rows.length,0),browser:summary.browser,applicationEdits:0,productionWrites:0}))
