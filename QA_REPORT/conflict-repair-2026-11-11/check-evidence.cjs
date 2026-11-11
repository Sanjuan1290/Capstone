'use strict'
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict'),crypto=require('node:crypto'),{spawnSync}=require('node:child_process')
const here=__dirname,root=path.resolve(here,'../..'),read=name=>JSON.parse(fs.readFileSync(path.join(here,name+'.json'),'utf8'))
const checks=[],check=(name,fn)=>{fn();checks.push({name,status:'PASS'})}
const summary=read('test-summary'),scan=read('conflict-scan'),columns=read('live-schema-verification'),migration=read('migration-verification'),database=read('database-verification'),source=read('export-comparison')
check('Manually added live fields have the exact nullable contract and no live migration/write occurred',()=>{
 const expected={reversed_at:'datetime',reversed_by_admin_id:'int',reversal_reason:'varchar(255)'}
 assert.equal(columns.columns.length,3);for(const column of columns.columns){assert.equal(column.COLUMN_TYPE,expected[column.COLUMN_NAME]);assert.equal(column.IS_NULLABLE,'YES')}
 assert.equal(columns.writes,0);assert.equal(columns.financialRowsRead,0);assert.equal(columns.migrationsExecuted,false)
})
check('All original conflict blocks were reviewed against the matching export',()=>{assert.equal(source.conflictBlocks,6);assert.equal(source.comparedApplicationTextFiles,781);assert.equal(source.allMatchPreRepairRepository,true);assert.equal(source.currentDifferences,4);assert.equal(crypto.createHash('sha256').update(fs.readFileSync(source.availableFile)).digest('hex'),source.exportSha256)})
check('Complete source scan has no remaining conflict markers',()=>{assert.equal(scan.status,'PASS');assert.equal(scan.findings.length,0);assert.ok(scan.enumeratedFiles>1000);assert.equal(scan.includesHiddenAndIgnoredSource,true)})
check('Migration rehearsal skips all manually added fields and retains history',()=>{assert.equal(migration.reversalColumnAlterStatements,0);assert.equal(migration.historyRowsDeleted,0);assert.equal(migration.firstLedgerRows,16);assert.equal(migration.repeatLedgerRows,16);assert.equal(migration.columnDefinitionsUnchanged,true)})
check('Financial, clinical, stock, audit and migration snapshots survive replay',()=>{assert.equal(database.allSnapshotHashesUnchanged,true);assert.equal(Object.keys(database.snapshots).length,12);assert.equal(database.reversalColumnAlterStatements,0);assert.equal(database.historyRowsDeleted,0);assert.equal(database.negativeOrInconsistentBills,0);assert.equal(database.reversedHistoryMissingFields,0)})
check('Targeted migration/reversal and native workflow cases pass',()=>{assert.equal(summary.node.migration.pass,18);assert.equal(summary.node.migration.fail,0);assert.equal(summary.node.reversal.pass,15);assert.equal(summary.node.reversal.fail,0);assert.deepEqual(summary.native,{pass:22,fail:0})})
check('No new regression failure names or skipped tests',()=>{assert.ok(Object.values(summary.introducedFailures).every(rows=>rows.length===0));assert.equal(summary.node.server.skipped,0);assert.equal(summary.node.client.skipped,0);assert.equal(read('browser-results').stats.skipped,0);assert.equal(read('browser-results').stats.flaky,0)})
check('Receipt and existing failure counts are reported honestly',()=>{assert.deepEqual(summary.receiptPdf,{pass:32,fail:0});assert.equal(summary.api.sql.fail,5);assert.equal(summary.node.server.fail,27);assert.equal(summary.node.client.fail,21);assert.equal(summary.vitest.fail,4);assert.equal(summary.browser.fail,16);assert.equal(summary.backendBuildScriptDefined,false)})
check('Disposable database is stopped and no production/history mutation is claimed',()=>{assert.equal(summary.cleanup.portClosed,true);assert.equal(summary.productionWrites,0);assert.equal(summary.migrationHistoryRowsDeleted,0);assert.equal(summary.liveMigrationLedgerRecorded,false)})
const git=args=>{const result=spawnSync('git',args,{cwd:root,encoding:'utf8',windowsHide:true});assert.equal(result.status,0);return result.stdout.trim().split(/\r?\n/).filter(Boolean)}
check('Only the four requested tracked files changed; historical SQL remains unchanged',()=>{assert.deepEqual(git(['diff','--name-only']).sort(),['client/src/components/billing/ChargeAdjustmentsPanel.jsx','server/scripts/branchMigrations.js','server/tests/deployment/migrationRunner.node.cjs','server/utils/chargeAdjustments.js'].sort());assert.deepEqual(git(['diff','--name-only','--','server/db/migrations']),[]);git(['-c','core.safecrlf=false','diff','--check'])})
check('Required report sections, artifact files and evidence inventory exist',()=>{
 const report=fs.readFileSync(path.join(here,'QA_REPORT.md'),'utf8'),manifest=fs.readFileSync(path.join(here,'EVIDENCE_MANIFEST.md'),'utf8')
 for(let section=1;section<=7;section++)assert.ok(report.includes(`## ${section}. `))
 for(const file of git(['ls-files','--others','--exclude-standard']).filter(file=>file.startsWith('QA_REPORT/conflict-repair-2026-11-11/')))assert.ok(manifest.includes(path.basename(file)),`Missing evidence entry: ${file}`)
 const pdf=read('print-results');assert.equal(pdf.length,32);for(const row of pdf){assert.equal(row.status,'PASS');assert.ok(fs.statSync(path.join(here,row.pdf)).size>1000)}
})
const dotenv=require('../../server/node_modules/dotenv'),privateValues=[]
for(const file of ['.env','server/.env','client/.env']){
 const filename=path.join(root,file);if(!fs.existsSync(filename))continue
 for(const [key,value] of Object.entries(dotenv.parse(fs.readFileSync(filename))))if(/SECRET|(?:^|_)PASS(?:WORD)?$|TOKEN|API.?KEY|DATABASE_URL|DB_(?:HOST|NAME|USER)|CLOUDINARY_URL/i.test(key)&&value.length>=8)privateValues.push({key,value})
}
const findings=[],textFiles=fs.readdirSync(here).filter(file=>/\.(?:cjs|mjs|py|json|md|csv|log)$/.test(file)&&fs.statSync(path.join(here,file)).isFile())
for(const file of textFiles){const text=fs.readFileSync(path.join(here,file),'utf8');for(const item of privateValues)if(text.includes(item.value))findings.push({file,key:item.key})}
check('New QA text contains no detected private configuration values',()=>assert.deepEqual(findings,[]))
fs.writeFileSync(path.join(here,'evidence-check-results.json'),JSON.stringify({status:'PASS',checks,scannedTextFiles:textFiles.length,privateConfigurationFindings:findings.length,productionWrites:0,migrationHistoryRowsDeleted:0},null,2))
console.log(`${checks.length} evidence checks passed; ${textFiles.length} text files scanned without private-configuration matches.`)
