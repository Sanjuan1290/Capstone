'use strict'
// Read configuration only to detect accidental disclosure; never print its values.
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict'),{spawnSync}=require('node:child_process')
const dotenv=require('../../server/node_modules/dotenv')
const here=__dirname,root=path.resolve(here,'../..')
const read=name=>JSON.parse(fs.readFileSync(path.join(here,name+'.json'),'utf8'))
const checks=[]
function check(name,fn){fn();checks.push({name,status:'PASS'})}
const privateValues=[]
for(const name of ['.env','server/.env','client/.env']){
 const filename=path.join(root,name)
 if(!fs.existsSync(filename))continue
 for(const [key,value] of Object.entries(dotenv.parse(fs.readFileSync(filename))))if(/SECRET|PASSWORD|TOKEN|API.?KEY|DATABASE_URL|DB_(?:HOST|NAME|USER)|CLOUDINARY_URL/i.test(key)&&value.length>=12)privateValues.push({key,value})
}
const excluded=new Set(['.tools','.baseline','browser-artifacts'])
function files(dir){return fs.readdirSync(dir,{withFileTypes:true}).flatMap(entry=>{
 if(excluded.has(entry.name)||entry.isSymbolicLink())return []
 const filename=path.join(dir,entry.name)
 return entry.isDirectory()?files(filename):/\.(md|json|log|cjs|mjs|py|csv)$/.test(entry.name)?[filename]:[]
})}
const scanned=files(here),findings=[]
for(const filename of scanned){const text=fs.readFileSync(filename,'utf8');for(const item of privateValues)if(text.includes(item.value))findings.push({file:path.relative(root,filename).replaceAll('\\','/'),key:item.key})}
check('New QA text contains no detected private configuration values',()=>assert.deepEqual(findings,[]))
check('Generated copies of supplied PDF pages were removed',()=>{for(let page=1;page<=5;page++)assert.equal(fs.existsSync(path.join(here,`reference-page-${page}.png`)),false)})
const summary=read('test-summary'),cleanup=read('cleanup-results'),database=read('database-verification')
const references=read('reference-comparison')
check('Supplied references match baseline and preserve the current fixes',()=>{
 assert.equal(references.status,'PASS');assert.equal(references.summary.comparedTextFiles,772)
 assert.equal(references.summary.exportMatchesBaseline,772);assert.equal(references.summary.currentPatch,17)
 assert.equal(references.summary.currentOnly,9);assert.equal(references.summary.referenceDifferences,0)
 assert.equal(references.summary.missingCurrent,0);assert.equal(references.migration.matchesExport,true)
 assert.equal(references.migration.matchesBaseline,true);assert.equal(references.migration.summary.createdTablesPresent,11)
 assert.equal(references.migration.summary.checkedColumns,113);assert.equal(references.migration.summary.missingColumns,0)
 assert.equal(references.migration.summary.supersededIndexes,3);assert.equal(references.migration.summary.missingIndexes,0)
 assert.equal(references.migration.executed,false);assert.equal(references.newDatabaseConnections,0);assert.equal(references.databaseWrites,0)
 const hash=value=>require('node:crypto').createHash('sha256').update(value).digest('hex')
 assert.equal(hash(fs.readFileSync(references.reference.file)),references.reference.sha256)
 assert.equal(hash(fs.readFileSync(path.join(root,references.migration.file))),references.migration.sha256)
})
check('No newly failing names in the compared suites',()=>assert.ok(Object.values(summary.introducedFailingTests).every(rows=>rows.length===0)))
check('Native and receipt cases all pass',()=>{assert.deepEqual(summary.native,{pass:21,fail:0});assert.deepEqual(summary.receiptPDF,{pass:32,fail:0})})
check('Broader SQL failures are reported accurately',()=>{assert.equal(summary.apiSmoke.commandStatus,'FAIL');assert.deepEqual(summary.apiSmoke.sqlPlans,{pass:676,fail:5})})
check('Synthetic database shutdown and migration replay are recorded',()=>{assert.equal(cleanup.portClosed,true);assert.equal(cleanup.migrationLedgerVerified,true);assert.equal(database.guardedMigrationReentryCompleted,true);assert.equal(database.finalMigrationLedgerRows,1)})
const report=fs.readFileSync(path.join(here,'IMPLEMENTATION_REPORT.md'),'utf8')
check('Required seven report sections exist',()=>{for(let section=1;section<=7;section++)assert.ok(report.includes(`## ${section}. `))})
const git=args=>{const result=spawnSync('git',args,{cwd:root,encoding:'utf8',windowsHide:true});assert.equal(result.status,0);return result.stdout.trim().split(/\r?\n/).filter(Boolean)}
check('All changed product and test files are documented',()=>{
 const changed=[...git(['diff','--name-only']),...git(['ls-files','--others','--exclude-standard'])].filter(file=>!file.startsWith('QA_REPORT/'))
 for(const file of changed)assert.ok(report.includes(file),`Missing changed file: ${file}`)
 assert.ok(changed.length>0)
})
check('Source diff has no whitespace errors',()=>git(['-c','core.safecrlf=false','diff','--check']))
check('All current browser PDF artifacts remain available',()=>{
 const artifacts=path.join(here,'browser-artifacts')
 const current=fs.readdirSync(artifacts).filter(file=>/^current-(Chrome|Edge)-.*\.pdf$/.test(file))
 assert.equal(current.length,32)
 for(const file of current)assert.ok(fs.statSync(path.join(artifacts,file)).size>1000)
})
check('Evidence manifest includes all nonignored QA files',()=>{
 const manifest=fs.readFileSync(path.join(here,'EVIDENCE_MANIFEST.md'),'utf8')
 for(const file of git(['ls-files','--others','--exclude-standard']).filter(file=>file.startsWith('QA_REPORT/implementation-2026-11-11/')))assert.ok(manifest.includes(path.basename(file)),`Missing evidence file: ${file}`)
})
fs.writeFileSync(path.join(here,'evidence-check-results.json'),JSON.stringify({status:'PASS',checks,scannedTextFiles:scanned.length,privateConfigurationFindings:findings.length,productionMutations:0,remoteDeployment:false},null,2))
console.log(`${checks.length} final evidence checks passed; ${scanned.length} QA text files scanned without private-configuration matches.`)
