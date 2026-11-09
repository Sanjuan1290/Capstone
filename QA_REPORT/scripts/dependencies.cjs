'use strict'
const fs=require('node:fs'),path=require('node:path'),os=require('node:os'),{spawnSync}=require('node:child_process')
const root=path.resolve(__dirname,'../..'),out=path.join(root,'QA_REPORT/evidence')
const npm=path.join(path.dirname(process.execPath),'node_modules/npm/bin/npm-cli.js')
const temp=fs.mkdtempSync(path.join(os.tmpdir(),'carait-qa-dependencies-'))
const env={...process.env,npm_config_cache:path.join(temp,'cache')};delete env.NODE_OPTIONS
const results=[]
for(const project of ['client','server']){
 const target=path.join(temp,project);fs.mkdirSync(target)
 for(const name of ['package.json','package-lock.json'])fs.copyFileSync(path.join(root,project,name),path.join(target,name))
 const started=Date.now()
 const install=spawnSync(process.execPath,[npm,'ci','--ignore-scripts','--audit=false','--fund=false','--fetch-retries=0','--fetch-timeout=20000','--registry=https://registry.npmjs.org/'],{cwd:target,env,encoding:'utf8',windowsHide:true,timeout:180000,maxBuffer:8*1024*1024})
 fs.writeFileSync(path.join(out,project+'-dependency-install.log'),(install.stdout||'')+(install.stderr||''))
 results.push({project,check:'npm ci --ignore-scripts',status:install.status===0?'PASS':'BLOCKED',exitCode:install.status,error:install.error?.code,durationMs:Date.now()-started,scope:'Disposable directory; lifecycle hooks verified separately in the working repository.'})
 const audit=spawnSync(process.execPath,[npm,'audit','--json','--ignore-scripts','--fetch-retries=0','--fetch-timeout=20000','--registry=https://registry.npmjs.org/'],{cwd:target,env,encoding:'utf8',windowsHide:true,timeout:60000,maxBuffer:8*1024*1024})
 let data;try{data=JSON.parse(audit.stdout)}catch{data={error:'Registry audit did not return JSON',exitCode:audit.status}}
 fs.writeFileSync(path.join(out,project+'-dependency-audit.json'),JSON.stringify(data,null,2))
 results.push({project,check:'npm audit',status:data.metadata?.vulnerabilities?(data.metadata.vulnerabilities.total?'FAIL':'PASS'):'BLOCKED',vulnerabilities:data.metadata?.vulnerabilities,exitCode:audit.status})
}
fs.writeFileSync(path.join(out,'dependency-checks.json'),JSON.stringify({results,tempDirectory:temp,productionChanges:0},null,2))
console.log(JSON.stringify(results))
if(results.some(r=>r.status!=='PASS'))process.exitCode=1
