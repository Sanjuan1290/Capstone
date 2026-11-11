'use strict'
const fs=require('node:fs'),path=require('node:path'),{spawnSync}=require('node:child_process')
const root=path.resolve(__dirname,'../..'),out=__dirname,npm=path.join(path.dirname(process.execPath),'node_modules/npm/bin/npm-cli.js')
const env={...process.env}
for(const file of ['server/.env','client/.env'])if(fs.existsSync(path.join(root,file)))for(const m of fs.readFileSync(path.join(root,file),'utf8').matchAll(/^\s*(?:export\s+)?([A-Za-z_][A-Za-z_0-9]*)\s*=/gm))delete env[m[1]]
Object.assign(env,{NODE_ENV:'test',DB_PROVIDER:'mysql',DB_HOST:'127.0.0.1',DB_PORT:'9',DB_USER:'synthetic_audit',DB_PASSWORD:'',DB_NAME:'carait_disposable_audit',DB_SSL:'false',JWT_SECRET:'synthetic-audit-no-production-access-20261111',CLIENT_URL:'http://127.0.0.1:4187',PAYMONGO_LIVE_ENABLED:'false',RUN_SCHEMA_MIGRATIONS_ON_STARTUP:'false',NODE_OPTIONS:`--require="${path.join(root,'scripts/audit/networkGuard.cjs').replace(/\\/g,'/')}"`})
const checks={
 'migration-verify':['.',['node','QA_REPORT/conflict-repair-2026-11-11/verify-local-migration.cjs']],
 'server-syntax':['server',['npm','run','check:syntax']],
 'server-source':['server',['npm','run','verify:source']],
 'migration-unit':['server',['node','--test','tests/deployment/migrationRunner.node.cjs']],
 'server-node':['server',['npm','run','test:node']],
 'server-vitest':['server',['npm','test','--','--reporter=json','--outputFile='+path.join(out,'server-vitest-results.json')]],
 'server-postinstall':['server',['npm','run','postinstall']],
 'client-node':['client',['node','--test',...fs.readdirSync(path.join(root,'client/tests')).filter(f=>f.endsWith('.node.test.mjs')).map(f=>'tests/'+f)]],
 'client-build':['client',['npm','run','build']],
 'client-lint':['client',['npm','run','lint','--','--format=json','--output-file='+path.join(out,'client-lint-results.json')]],
 'focused-server':['server',['node','--test','tests/billing/chargeReversal20261111.node.test.cjs']],
 'focused-client':['client',['node','--test','tests/prescriptionDisplay20261111.node.test.mjs','tests/billingReceiptA5_20261105.node.test.mjs']],
 'migrate':['server',['npm','run','migrate']],
 'browser':['.',['node','QA_REPORT/conflict-repair-2026-11-11/browser-suite.cjs']],
 'browser-focused':['.',['node','QA_REPORT/conflict-repair-2026-11-11/browser-suite.cjs','implementation20261111.spec.mjs']],
 'api-smoke':['.',['node','QA_REPORT/conflict-repair-2026-11-11/api-smoke.cjs']],
 'clinical-workflow':['.',['node','QA_REPORT/conflict-repair-2026-11-11/clinical-workflow.cjs']],
}
for(const arg of process.argv.slice(2)){
 const baseline=arg.startsWith('baseline-'),name=baseline?arg.slice(9):arg,check=checks[name];if(!check)throw Error(arg)
 const base=baseline?path.join(out,'.baseline'):root,[cwd,command]=check,checkEnv={...env}
 if(name==='client-build')checkEnv.NODE_ENV='production'
 if(['migrate','migration-verify','api-smoke','clinical-workflow'].includes(name))Object.assign(checkEnv,{DB_HOST:'127.0.0.1',DB_PORT:'33411',DB_USER:'root',DB_NAME:'carait_merge_qa_20261111',DB_PASSWORD:''})
 // Baseline test list must come from HEAD, not include newly added test files.
 const args=name==='client-node'&&baseline?['--test',...fs.readdirSync(path.join(base,'client/tests')).filter(f=>f.endsWith('.node.test.mjs')).map(f=>'tests/'+f)]:command[0]==='npm'?[npm,...command.slice(1)]:command.slice(1)
 const start=Date.now(),r=spawnSync(process.execPath,args,{cwd:path.join(base,cwd),env:checkEnv,encoding:'utf8',timeout:600000,maxBuffer:64*1024*1024,windowsHide:true})
 fs.writeFileSync(path.join(out,arg+'.log'),(r.stdout||'')+(r.stderr||''))
 const result={name:arg,command:command.join(' '),exitCode:r.status,error:r.error?.code,status:r.status===0?'PASS':r.error?'BLOCKED':'FAIL',durationMs:Date.now()-start}
 fs.writeFileSync(path.join(out,arg+'.json'),JSON.stringify(result,null,2));console.log(JSON.stringify(result));if(r.status!==0)process.exitCode=1
}
