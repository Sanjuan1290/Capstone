'use strict'
// Review only: test children cannot connect to production or external providers.
const fs=require('node:fs'),path=require('node:path'),{spawnSync}=require('node:child_process')
const root=path.resolve(__dirname,'../..'),npm=path.join(path.dirname(process.execPath),'node_modules/npm/bin/npm-cli.js'),env={...process.env}
for(const file of ['server/.env','client/.env'])if(fs.existsSync(path.join(root,file)))for(const match of fs.readFileSync(path.join(root,file),'utf8').matchAll(/^\s*(?:export\s+)?([A-Za-z_][A-Za-z_0-9]*)\s*=/gm))delete env[match[1]]
Object.assign(env,{NODE_ENV:'test',DB_PROVIDER:'mysql',DB_HOST:'127.0.0.1',DB_PORT:'9',DB_USER:'synthetic_review',DB_PASSWORD:'',DB_NAME:'carait_disposable_review',DB_SSL:'false',JWT_SECRET:'synthetic-local-review-no-production-access-20261111',CLIENT_URL:'http://127.0.0.1:4187',PAYMONGO_LIVE_ENABLED:'false',RUN_SCHEMA_MIGRATIONS_ON_STARTUP:'false',NODE_OPTIONS:`--require="${path.join(root,'scripts/audit/networkGuard.cjs').replaceAll('\\','/')}"`})
const checks={
 'client-build':['client',[npm,'run','build']],
 'client-lint':['client',[npm,'run','lint','--','--format=json','--output-file='+path.join(__dirname,'client-lint-results.json')]],
 'client-node':['client',['--test',...fs.readdirSync(path.join(root,'client/tests')).filter(file=>file.endsWith('.node.test.mjs')).map(file=>'tests/'+file)]],
 'server-node':['server',[npm,'run','test:node']],
 'server-vitest':['server',[npm,'test','--','--reporter=json','--outputFile='+path.join(__dirname,'server-vitest-results.json')]],
 'server-postinstall':['server',[npm,'run','postinstall']],
 'server-source':['server',[npm,'run','verify:source']],
}
for(const name of process.argv.slice(2)){
 const spec=checks[name];if(!spec)throw Error('Unsupported read-only review check')
 const start=Date.now(),result=spawnSync(process.execPath,spec[1],{cwd:path.join(root,spec[0]),env:{...env,...(name==='client-build'?{NODE_ENV:'production'}:{})},encoding:'utf8',timeout:600000,maxBuffer:64*1024*1024,windowsHide:true})
 fs.writeFileSync(path.join(__dirname,name+'.log'),(result.stdout||'')+(result.stderr||''))
 const summary={name,status:result.status===0?'PASS':result.error?'BLOCKED':'FAIL',exitCode:result.status,error:result.error?.code,durationMs:Date.now()-start}
 fs.writeFileSync(path.join(__dirname,name+'.json'),JSON.stringify(summary,null,2));console.log(JSON.stringify(summary));if(result.status!==0)process.exitCode=1
}
