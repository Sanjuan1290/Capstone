'use strict'
const fs=require('node:fs'),path=require('node:path'),{spawnSync}=require('node:child_process')
const root=path.resolve(__dirname,'../..'),out=path.join(root,'QA_REPORT/evidence')
fs.mkdirSync(out,{recursive:true})
const env={...process.env}
for(const file of ['server/.env','client/.env'])if(fs.existsSync(path.join(root,file)))for(const m of fs.readFileSync(path.join(root,file),'utf8').matchAll(/^\s*(?:export\s+)?([A-Za-z_][A-Za-z_0-9]*)\s*=/gm))delete env[m[1]]
Object.assign(env,{NODE_ENV:'test',DB_PROVIDER:'mysql',DB_HOST:'127.0.0.1',DB_PORT:'9',DB_USER:'synthetic_audit',DB_PASSWORD:'',DB_NAME:'carait_disposable_audit',DB_SSL:'false',JWT_SECRET:'synthetic-audit-no-production-access-20261109',CLIENT_URL:'http://localhost:5173',PAYMONGO_MODE:'',PAYMONGO_LIVE_ENABLED:'false',RUN_SCHEMA_MIGRATIONS_ON_STARTUP:'false',VITE_CLOUDINARY_CLOUD_NAME:'',VITE_CLOUDINARY_UPLOAD_PRESET:'',NODE_OPTIONS:`--require="${path.join(root,'scripts/audit/networkGuard.cjs').replace(/\\/g,'/')}"`})
const npm=path.join(path.dirname(process.execPath),'node_modules/npm/bin/npm-cli.js')
const clientTests=fs.readdirSync(path.join(root,'client/tests')).filter(f=>f.endsWith('.node.test.mjs')).map(f=>'tests/'+f)
const checks={
  inventory:['.',['node','QA_REPORT/scripts/inventory.cjs']],
  'server-vitest':['server',['npm','test','--','--reporter=json','--outputFile=../QA_REPORT/evidence/server-vitest-results.json']],
  'server-node':['server',['npm','run','test:node']],
  'server-coverage':['server',['npm','run','test:coverage','--','--coverage.reportOnFailure','--coverage.include=controllers/**','--coverage.include=routers/**','--coverage.include=utils/**','--coverage.include=middlewares/**','--coverage.include=db/*.js','--coverage.include=server.js','--coverage.reporter=json-summary','--coverage.reporter=json','--coverage.reporter=text-summary','--coverage.reportsDirectory=../QA_REPORT/evidence/coverage']],
  'client-node':['client',['node','--test',...clientTests]],
  'client-build':['client',['npm','run','build']],
  'client-lint':['client',['npm','run','lint','--','--format=json','--output-file=../QA_REPORT/evidence/client-lint-results.json']],
  'server-lint':['.',['node','client/node_modules/eslint/bin/eslint.js','server','scripts','--no-config-lookup','--config','QA_REPORT/eslint-server.mjs','--format=json','--output-file=QA_REPORT/evidence/server-lint-results.json']],
  'client-browser':['.',['node','QA_REPORT/scripts/browser-suite.cjs']],
  'server-postinstall':['server',['npm','run','postinstall']],
  'root-node':['.',['node','--test','tests/deployment/sourceExport.node.cjs']],
  'source-graph':['server',['npm','run','verify:source']],
  'branch-routes':['server',['node','scripts/verifyBranchRouteCoverage.js']],
  'isolated-migrate':['server',['npm','run','migrate']],
  'fresh-migrate':['server',['npm','run','migrate']],
  'api-smoke':['.',['node','QA_REPORT/scripts/api-smoke.cjs']],
  'browser-pages':['.',['node','QA_REPORT/scripts/browser-pages.cjs']],
  dependencies:['.',['node','QA_REPORT/scripts/dependencies.cjs']],
  'legacy-website-build':['client/WEBSITE',['npm','run','build']],
  'reports-sql':['server',['npm','run','verify:reports-sql']],
  'deployment-schema':['server',['npm','run','verify:deploy']],
  startup:['.',['node','QA_REPORT/scripts/startup.cjs']],
  'new-regressions':['server',['node','--test','tests/deployment/resumableBranchMigrations.node.test.cjs','tests/billing/finalizeApprovalGate20261105.node.test.cjs','tests/branchGoogleMapsUrl.node.test.cjs','tests/superadminPatientDirectory.node.test.cjs','tests/serviceCustomization.node.test.cjs','tests/billing/redesign20261105.node.test.cjs']],
  'walk-in-lock':['server',['node','--test','tests/queue/walkInLockIsolation20261109.node.test.cjs']],
  'clinical-workflow':['.',['node','QA_REPORT/scripts/clinical-workflow.cjs']],
}
const selected=process.argv.slice(2)
for(const name of selected){
  if(!checks[name])throw Error('Unknown check '+name)
  const [cwd,command]=checks[name],args=command[0]==='npm'?[npm,...command.slice(1)]:command.slice(1),started=Date.now()
  const checkEnv={...env}
  if(['client-build','client-browser'].includes(name))checkEnv.NODE_ENV='production'
  if(['isolated-migrate','fresh-migrate','api-smoke','browser-pages','reports-sql','deployment-schema','startup','clinical-workflow'].includes(name))Object.assign(checkEnv,{DB_HOST:'127.0.0.1',DB_PORT:'33409',DB_USER:'root',DB_PASSWORD:'',DB_NAME:name==='fresh-migrate'?'carait_qa_replay_20261109':'carait_qa_20261109',SEED_DEMO_DATA:'false'})
  const result=spawnSync(process.execPath,args,{cwd:path.join(root,cwd),env:checkEnv,encoding:'utf8',timeout:600000,maxBuffer:64*1024*1024,windowsHide:true})
  fs.writeFileSync(path.join(out,name+'.log'),(result.stdout||'')+(result.stderr||''))
  const summary={name,command:command.join(' '),cwd,exitCode:result.status,error:result.error?.code,signal:result.signal,durationMs:Date.now()-started,status:result.status===0?'PASS':result.error?'BLOCKED':'FAIL'}
  fs.writeFileSync(path.join(out,name+'.json'),JSON.stringify(summary,null,2))
  console.log(JSON.stringify(summary))
  console.log(((result.stdout||'')+(result.stderr||'')).replace(/\x1b\[[0-9;]*m/g,'').split(/\r?\n/).filter(l=>/Test Files |Tests |# (tests|pass|fail|cancelled|skipped)|^not ok |^ FAIL |Error:|verification|built in|problems \(/.test(l)).slice(-22).join('\n'))
  if(result.status!==0)process.exitCode=1
}
