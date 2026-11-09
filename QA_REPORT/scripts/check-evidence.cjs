'use strict'
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict')
const root=path.resolve(__dirname,'../..'),qa=path.join(root,'QA_REPORT'),dotenv=require('../../server/node_modules/dotenv')
const ignored=new Set(['.mysql-data','.mysql-data-qa','browser-artifacts','coverage','node_modules'])
const files=dir=>fs.readdirSync(dir,{withFileTypes:true}).flatMap(e=>ignored.has(e.name)||e.name.startsWith('.mysql-data')?[]:e.isDirectory()?files(path.join(dir,e.name)):[path.join(dir,e.name)])
const values=[]
for(const filename of ['server/.env','client/.env']){const absolute=path.join(root,filename);if(fs.existsSync(absolute))for(const [key,value] of Object.entries(dotenv.parse(fs.readFileSync(absolute))))if(/SECRET|PASSWORD|TOKEN|API_KEY/i.test(key)&&value.length>=12)values.push({key,value})}
const findings=[]
for(const file of files(qa)){
 if(!/\.(md|csv|json|log|cjs|mjs|gitignore)$/.test(file))continue
 const source=fs.readFileSync(file,'utf8')
 for(const secret of values)if(source.includes(secret.value))findings.push({file:path.relative(root,file),key:secret.key})
}
fs.writeFileSync(path.join(qa,'evidence/sensitive-value-scan.json'),JSON.stringify({status:findings.length?'FAIL':'PASS',sourceSecretValuesChecked:values.length,findings,secretValuesPrinted:false},null,2))
assert.equal(findings.length,0,'Source secret value found in QA evidence (see key/path only in scan result)')
const required=['COMPLETE_CODEBASE_AUDIT.md','SOURCE_FILE_AUDIT.csv','API_ENDPOINT_AUDIT.csv','DATABASE_AUDIT.md','SECURITY_AUDIT.md','FRONTEND_TEST_RESULTS.md','END_TO_END_TEST_RESULTS.md','UI_UX_TEST_RESULTS.md','BUGS_FOUND_AND_FIXED.md','REMAINING_ISSUES.md','COVERAGE_REPORT.md','RENDER_BUILD_RESULTS.md','CLOUDFLARE_BUILD_RESULTS.md','FINAL_DEPLOYMENT_CHECKLIST.md']
for(const file of required)assert.ok(fs.statSync(path.join(qa,file)).size>100,file+' is missing or empty')
const live=JSON.parse(fs.readFileSync(path.join(qa,'evidence/browser-pages-results.json')))
assert.equal(live.results.length,288,'Navigation sweep incomplete')
const native=JSON.parse(fs.readFileSync(path.join(qa,'evidence/clinical-workflow-results.json')))
assert.ok(native.results.every(r=>r.status==='PASS'),'Native clinical workflow must retain all passing assertions')
console.log(JSON.stringify({requiredReports:required.length,secretValueScan:'PASS',sourceSecretsPrinted:false,livePageChecks:live.results.length,nativeWorkflowSteps:native.results.length,acceptance:'FAIL / NOT TESTED (see reports)'}))
