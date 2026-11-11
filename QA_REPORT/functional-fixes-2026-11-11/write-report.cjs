'use strict'
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict'),{spawnSync}=require('node:child_process')
const here=__dirname,root=path.resolve(here,'../..'),prior=path.resolve(here,'../review-2026-11-11')
const read=(name,base=here)=>JSON.parse(fs.readFileSync(path.join(base,name+'.json'),'utf8'))
const log=(name,base=here)=>fs.readFileSync(path.join(base,name+'.log'),'utf8')
const stats=(name,base=here)=>Object.fromEntries([...log(name,base).matchAll(/^# (tests|pass|fail|skipped) (\d+)\s*$/gm)].map(match=>[match[1],Number(match[2])]))
const failed=(name,base=here)=>[...log(name,base).matchAll(/^not ok \d+ - (.+)$/gm)].map(match=>match[1])
const vitestFailed=j=>j.testResults.flatMap(suite=>(suite.assertionResults||[]).filter(test=>test.status==='failed').map(test=>test.fullName))
const table=(heads,rows)=>'| '+heads.join(' | ')+' |\n| '+heads.map(()=> '---').join(' | ')+' |\n'+rows.map(row=>'| '+row.map(value=>String(value??'').replace(/\|/g,'/').replace(/\r?\n/g,' ')).join(' | ')+' |').join('\n')
const git=args=>{const result=spawnSync('git',args,{cwd:root,encoding:'utf8',windowsHide:true});assert.equal(result.status,0);return result.stdout.trim()}
const node={targeted:stats('targeted'),server:stats('server-node'),client:stats('client-node')},old={server:stats('server-node',prior),client:stats('client-node',prior)},vitest=read('server-vitest-results'),oldVitest=read('server-vitest-results',prior)
const introduced={server:failed('server-node').filter(name=>!failed('server-node',prior).includes(name)),client:failed('client-node').filter(name=>!failed('client-node',prior).includes(name)),vitest:vitestFailed(vitest).filter(name=>!vitestFailed(oldVitest).includes(name))}
const resolved=failed('server-node',prior).filter(name=>!failed('server-node').includes(name))
assert.deepEqual(node.targeted,{tests:42,pass:42,fail:0,skipped:0})
assert.ok(Object.values(introduced).every(rows=>rows.length===0));assert.equal(resolved.length,3)
assert.equal(git(['diff','--name-only','--','server/db/migrations','client/src','server/package.json','server/package-lock.json']),'')
git(['-c','core.safecrlf=false','diff','--check'])
const purposes={
 'server/utils/billingServicePromotions.js':'Preserve a booked discount snapshot after deletion clears its live promotion FK; keep a null ID and cap to the booked service line. Current eligibility still applies to added-service offers.',
 'server/utils/registrationSmsLimits.js':'Parse mysql2 DATETIME strings with the existing configured DB_TIME_ZONE/default +08:00 rather than the Node host timezone. Preserve Date/explicit-offset handling, locking and quota rules.',
 'server/utils/doctorConfirmationNotifications.js':'Use the persisted confirmation notification ID and a payload hash for email idempotency. Exact retries keep a stable key; new events and changed payloads receive distinct keys.',
 'server/controllers/admin.controller.js':'Forward the saved doctor notification ID after a successful transition; already-confirmed requests return 200 without repeating notifications.',
 'server/controllers/staff.controller.js':'Same event identity and idempotent duplicate behavior for Staff confirmation. Existing conditional UPDATE/concurrency checks remain.',
 'server/tests/billing/servicePromotions20261111.node.test.cjs':'Three regression cases for deleted offers, amount caps/repeated saves, and added-service eligibility isolation.',
 'server/tests/registrationSmsLimits20261111.node.cjs':'Two regression cases using mysql2-style DATETIME strings across UTC/Manila hosts and configured database offsets.',
 'server/tests/doctorConfirmNotifications20261111.node.cjs':'Four regression cases covering exact retries, rescheduling/back-to-original-slot events, changed recipients, and actual Admin/Staff controller duplicate/concurrent behavior.',
}
const changed=git(['diff','--name-only']).split(/\r?\n/).filter(Boolean)
assert.deepEqual(changed.slice().sort(),Object.keys(purposes).sort())
const results={date:'2026-11-11',timezone:'Asia/Manila',baseCommit:git(['rev-parse','HEAD']),functionalBugsFixed:3,changedFiles:changed,newRegressionCases:9,node,previousNode:old,vitest:{tests:vitest.numTotalTests,pass:vitest.numPassedTests,fail:vitest.numFailedTests},previousVitest:{tests:oldVitest.numTotalTests,pass:oldVitest.numPassedTests,fail:oldVitest.numFailedTests},introducedFailures:introduced,resolvedFailures:resolved,build:read('client-build').status,backendValidation:read('server-postinstall').status,sourceGraph:read('server-source').status,remainingFailures:{server:failed('server-node'),client:failed('client-node'),vitest:vitestFailed(vitest)},productionQueries:0,productionWrites:0,migrationsExecuted:0,providerMessagesSent:0,dependenciesChanged:false,deployed:false}
fs.writeFileSync(path.join(here,'test-summary.json'),JSON.stringify(results,null,2))
const report=`# Carait Clinic — three functional bugs fixed

Date: **11 November 2026 (Asia/Manila)**. Base commit: **${results.baseCommit.slice(0,7)}**. All three requested functional bugs are fixed in the working tree. Changes remain uncommitted and undeployed. Production data, schema and migration history were untouched.

## Fixes

1. **Deleted promotions retain the booked price.** The saved discount is applied to the booked consultation service even when promotion_id is NULL after offer deletion. It remains capped to that line, is counted once, and does not authorize discounts on unrelated services, inventory or custom charges. The display metadata keeps a null live ID. The original 400 service / 100 saved discount case retains the correct 300 total.
2. **SMS quota times are independent of the Node host timezone.** MySQL DATETIME strings use the existing DB_TIME_ZONE setting, falling back to +08:00 consistently with the database connection. Tests cover UTC and Manila hosts, Date objects and database offsets +00:00, -05:30 and +05:45. The next attempt after one second is blocked for 59 seconds; the third allowed send is followed by the correct remaining hourly wait. Existing quota records are read correctly without a data migration.
3. **Reconfirmation emails have distinct, retry-safe keys.** Admin and Staff pass the existing persisted doctor notification ID for each real confirmation. The key includes this event and a SHA-256 hash of the actual outbound payload. Same-event retries keep the same key; rescheduling, returning to the original slot, and changed recipient/payloads do not collide. No new table/column or environment variable is required. Already-confirmed requests return an idempotent 200 without new notifications; concurrent pending confirmations still allow only one update and notification event. Provider calls remain asynchronous.

## Files changed

${table(['File','Purpose'],changed.map(file=>['['+file+'](../../'+file+')',purposes[file]]))}

Nine meaningful regression cases were added to the existing suites. Existing tests and assertions remain; none were skipped or deleted. Earlier QA evidence under ../review-2026-11-11/ remains the pre-fix baseline.

## Actual verification results

${table(['Check','Before fixes','After fixes'],[
 ['Targeted promotion/SMS/notification/lifecycle/reversal cases','Bug boundary cases failed before implementation','42/42 PASS; no skips'],
 ['Backend syntax / route binding','PASS',read('server-postinstall').status],
 ['Backend source graph','PASS',read('server-source').status],
 ['Frontend production build','PASS',read('client-build').status+'; 25 required prebuild assertions and Vite bundle'],
 ['Backend Node',`${old.server.pass}/${old.server.tests} pass; ${old.server.fail} fail`,`${node.server.pass}/${node.server.tests} pass; ${node.server.fail} fail`],
 ['Frontend Node',`${old.client.pass}/${old.client.tests} pass; ${old.client.fail} fail`,`${node.client.pass}/${node.client.tests} pass; ${node.client.fail} fail`],
 ['Backend Vitest',`${oldVitest.numPassedTests}/${oldVitest.numTotalTests} pass; ${oldVitest.numFailedTests} fail`,`${vitest.numPassedTests}/${vitest.numTotalTests} pass; ${vitest.numFailedTests} fail`],
 ['New failing names','Compared with latest review','0'],
])}

The three existing consultation lifecycle failures are now passing:

${resolved.map(name=>'- '+name).join('\n')}

Targeted tests verify all 15 existing reversal cases as well as promotion preservation, single-discount caps, current added-service eligibility, timezone-correct quota cooldown/window reset, notification channel switches, provider-failure isolation, stable retry keys and separate confirmation events. Actual Admin/Staff confirmation functions run with synthetic DB/notification executors to verify duplicate and concurrent handling.

All tests used synthetic settings and a network guard. No production database query/write, real SMS/email, migration, financial correction or reset was executed. There is no backend compilation script; its required syntax/source/route validation ran. Frontend lint and browser tests were not repeated because client source was unchanged; their pre-fix results remain in the review evidence and are not claimed as fresh results here. Live provider delivery and real-database integration were not exercised in this fix pass.

## Remaining failures and limits

All remaining failures existed in the latest review. The fix introduces no newly failing test name. These suites still exit nonzero:

${table(['Suite','Remaining failing assertion'],[...results.remainingFailures.server.map(name=>['Backend Node',name]),...results.remainingFailures.client.map(name=>['Frontend Node',name]),...results.remainingFailures.vitest.map(name=>['Vitest',name])])}

The separately reported migration-tail assertion still expects the older registration order. It is outside the requested three functional fixes and was not weakened to hide that failure. Existing label/source-contract failures and earlier unrelated regressions also remain. This report does not certify a globally green application.

## Deployment notes

Deploy the corrected backend through the existing staging/release process after reviewing the remaining failures. The three fixes require no new dependency, environment setting or database migration. Existing deployment migrations from the user's preceding commits remain subject to their normal review/verification; none was applied here. No past paid bill or quota/migration-history record was rewritten.

Detailed fresh counts, resolved/new-failure comparison and source scope: [test-summary.json](test-summary.json). Command output and status are in each named .log/.json pair. The earlier review report documents the original defects; this report documents their completed fixes.
`
fs.writeFileSync(path.join(here,'FIXES.md'),report)
console.log(JSON.stringify({functionalBugsFixed:3,targeted:node.targeted,newRegressionCases:9,newFailures:0,resolvedLifecycleFailures:3,remaining:{server:node.server.fail,client:node.client.fail,vitest:vitest.numFailedTests},productionWrites:0,deployed:false}))
