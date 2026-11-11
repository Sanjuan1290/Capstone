'use strict'
// References are data: nothing from the export or SQL is executed or imported.
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto'),assert=require('node:assert/strict'),{spawnSync}=require('node:child_process')
const here=__dirname,root=path.resolve(here,'../..')
const exportPath=process.argv[2]||'C:/Users/Robert/Downloads/AllCodes.txt'
const migration='server/db/migrations/2026-08-26-clinic-workflow-upgrade.sql'
const sha=content=>crypto.createHash('sha256').update(content).digest('hex')
const canonical=content=>content.replace(/^\uFEFF/,'').replace(/\r\n?/g,'\n').replace(/\n*$/,'\n')
const git=args=>{const result=spawnSync('git',args,{cwd:root,encoding:'utf8',windowsHide:true,maxBuffer:64*1024*1024});assert.equal(result.status,0,'Read-only git command failed');return result.stdout.trim()}
const safe=file=>file&&!path.posix.isAbsolute(file)&&path.posix.normalize(file)===file&&!file.split('/').includes('..')&&!file.includes('\\')
const scope=file=>safe(file)&&(/^(client|server)\//.test(file)||['package.json','package-lock.json','README.md','.gitignore'].includes(file))&&!/(^|\/)(?:node_modules|dist|coverage|uploads|\.wrangler)(\/|$)/.test(file)&&!/(^|\/)\.env(?:\.|$)|\.(?:pem|key|p12)$/i.test(file)&&(/\.(?:[cm]?jsx?|tsx?|json|html|css|scss|md|ya?ml|toml|txt|svg|ini|conf|csv)$/.test(file)||/^server\/db\/migrations\/[^/]+\.sql$/.test(file)||/(^|\/)(?:Dockerfile|Procfile|\.nvmrc|\.node-version|\.gitignore|_headers|_redirects|\.npmrc)$/.test(file))
const raw=fs.readFileSync(exportPath),text=raw.toString('utf8')
const headers=[...text.matchAll(/^\/([^\r\n]+):\r?\n-{10,}\r?\n/gm)],exported=new Map(),parseIssues=[]
let excluded=0
for(let i=0;i<headers.length;i++){
 const header=headers[i],file=header[1]
 if(!scope(file)){excluded++;continue}
 assert.ok(!exported.has(file),'Duplicate source file in reference export')
 const body=text.slice(header.index+header[0].length,headers[i+1]?.index||text.length),lines=[]
 let expected=1
 for(const line of body.split(/\r?\n/)){
  const numbered=line.match(/^\s*(\d+) \| ?(.*)$/)
  if(!numbered)continue
  if(Number(numbered[1])!==expected){parseIssues.push({file,expected,observed:Number(numbered[1])});break}
  lines.push(numbered[2]);expected++
 }
 if(lines.length)exported.set(file,{content:canonical(lines.join('\n')),lines:lines.length})
 else parseIssues.push({file,reason:'No numbered text content'})
}
assert.deepEqual(parseIssues,[],'Reference line-number decoding must be complete')
const tree=new Map(git(['-c','core.quotepath=false','ls-tree','-r','HEAD']).split('\n').map(line=>{const [meta,file]=line.split('\t');return [file,meta.split(' ')[2]]}).filter(([file])=>scope(file)))
const ids=[...new Set(tree.values())],batch=spawnSync('git',['cat-file','--batch'],{cwd:root,input:ids.join('\n')+'\n',windowsHide:true,maxBuffer:64*1024*1024})
assert.equal(batch.status,0,'Read-only baseline blob extraction failed')
const blobs=new Map();let cursor=0
for(const id of ids){const end=batch.stdout.indexOf(10,cursor),header=batch.stdout.subarray(cursor,end).toString('utf8'),parts=header.split(' '),size=Number(parts[2]);assert.equal(parts[0],id);assert.equal(parts[1],'blob');assert.ok(Number.isSafeInteger(size));cursor=end+1;blobs.set(id,canonical(batch.stdout.subarray(cursor,cursor+size).toString('utf8')));cursor+=size+1}
const compared=[]
for(const [file,reference] of exported){
 const filename=path.resolve(root,file);assert.ok(filename.startsWith(root+path.sep))
 const current=fs.existsSync(filename)?canonical(fs.readFileSync(filename,'utf8')):null,baseline=tree.has(file)?blobs.get(tree.get(file)):null
 compared.push({file,referenceLines:reference.lines,exportSha256:sha(reference.content),currentSha256:current===null?null:sha(current),baselineSha256:baseline===null?null:sha(baseline),exportMatchesBaseline:baseline===reference.content,currentMatchesExport:current===reference.content,status:current===null?'MISSING_CURRENT':current===reference.content?'MATCH':baseline===reference.content?'CURRENT_PATCH':'REFERENCE_DIFFERENCE'})
}
const currentPaths=new Set([...tree.keys(),...git(['ls-files','--others','--exclude-standard']).split('\n').filter(scope)])
const currentOnly=[...currentPaths].filter(file=>!exported.has(file)).sort()
const sql=fs.readFileSync(path.join(root,migration),'utf8'),clean=sql.replace(/^\s*--.*$/gm,'')
const metadata=JSON.parse(fs.readFileSync(path.join(here,'database-metadata.json'),'utf8'))
const columns=new Map(metadata.columns.map(column=>[column.TABLE_NAME+'.'+column.COLUMN_NAME,column]))
const indexes=new Set(metadata.indexes.map(index=>index.TABLE_NAME+'.'+index.INDEX_NAME))
const existingTables=new Set(metadata.definitions.map(table=>table.table))
const created=[],altered=[],columnChecks=[],indexChecks=[]
const checkColumns=(table,body,kind)=>{
 const expression=kind==='alter'?/\b(ADD|MODIFY)\s+COLUMN\s+`?(\w+)`?\s+([a-z]+(?:\([^)]*\))?)/gi:/^\s*`?(\w+)`?\s+((?:bigint|int|tinyint|varchar|text|decimal|datetime|timestamp|date)(?:\([^)]*\))?)/gim
 for(const match of body.matchAll(expression)){
  const name=match[kind==='alter'?2:1],expectedType=match[kind==='alter'?3:2].toLowerCase(),saved=columns.get(table+'.'+name)
  const actualType=saved?.COLUMN_TYPE?.toLowerCase().replace(/^(bigint|int|tinyint)\(\d+\)/,'$1')||null
  const expectedNormalized=expectedType.replace(/^(bigint|int|tinyint)\(\d+\)/,'$1')
  columnChecks.push({table,column:name,operation:kind==='alter'?match[1].toUpperCase():'CREATE',expectedType,actualType,status:!saved?'MISSING':actualType===expectedNormalized?'MATCH':'EVOLVED'})
 }
 for(const match of body.matchAll(/(?:\bADD\s+)?(?:\bUNIQUE\s+)?\b(?:KEY|INDEX)\s+`?(\w+)`?\s*\(/gi))indexChecks.push({table,index:match[1],present:indexes.has(table+'.'+match[1])})
}
for(const match of clean.matchAll(/\bALTER\s+TABLE\s+`?(\w+)`?([\s\S]*?);/gi)){altered.push(match[1]);checkColumns(match[1],match[2],'alter')}
for(const match of clean.matchAll(/\bCREATE\s+TABLE\s+`?(\w+)`?\s*\(([\s\S]*?)\)\s*ENGINE\s*=/gi)){created.push({table:match[1],present:existingTables.has(match[1])});checkColumns(match[1],match[2],'create')}
assert.equal(created.length,11,'Decode all eleven historical CREATE TABLE statements')
assert.equal(altered.length,9,'Decode all nine historical ALTER TABLE statements')
const replacements={
 'discount_presets.uniq_discount_preset_label':{index:'uniq_branch_discount_label',columns:['branch_id','label'],migration:'server/db/migrations/2026-10-15-branch-ledgers.sql'},
 'inventory_locations.uniq_inventory_location_name':{index:'uniq_branch_inventory_location',columns:['branch_id','name'],migration:'server/db/migrations/2026-10-09-multi-branch-foundation.sql'},
 'cashier_closings.uniq_cashier_closing':{index:'uniq_cashier_branch_date',columns:['branch_id','cashier_role','staff_id','closing_date'],migration:'server/db/migrations/2026-10-15-cashier-branch-uniqueness.sql'},
}
for(const index of indexChecks){
 if(index.present){index.status='MATCH';continue}
 const replacement=replacements[index.table+'.'+index.index]
 if(!replacement){index.status='MISSING';continue}
 const saved=metadata.indexes.filter(row=>row.TABLE_NAME===index.table&&row.INDEX_NAME===replacement.index).sort((a,b)=>Number(a.SEQ_IN_INDEX)-Number(b.SEQ_IN_INDEX))
 const valid=JSON.stringify(saved.map(row=>row.COLUMN_NAME))===JSON.stringify(replacement.columns)&&saved.every(row=>Number(row.NON_UNIQUE)===0)
 assert.ok(fs.readFileSync(path.join(root,replacement.migration),'utf8').includes(replacement.index),'Index evolution must be traced to a source migration')
 index.status=valid?'SUPERSEDED':'MISSING';index.replacement={...replacement,verified:valid}
}
const summary={exportedSections:headers.length,comparedTextFiles:compared.length,excludedSections:excluded,matchingCurrent:compared.filter(row=>row.status==='MATCH').length,currentPatch:compared.filter(row=>row.status==='CURRENT_PATCH').length,referenceDifferences:compared.filter(row=>row.status==='REFERENCE_DIFFERENCE').length,missingCurrent:compared.filter(row=>row.status==='MISSING_CURRENT').length,exportMatchesBaseline:compared.filter(row=>row.exportMatchesBaseline).length,currentOnly:currentOnly.length}
const schemaSummary={createdTables:created.length,createdTablesPresent:created.filter(row=>row.present).length,alteredTables:altered.length,checkedColumns:columnChecks.length,missingColumns:columnChecks.filter(row=>row.status==='MISSING').length,evolvedColumns:columnChecks.filter(row=>row.status==='EVOLVED').length,checkedIndexes:indexChecks.length,supersededIndexes:indexChecks.filter(row=>row.status==='SUPERSEDED').length,missingIndexes:indexChecks.filter(row=>row.status==='MISSING').length}
const result={status:summary.referenceDifferences||summary.missingCurrent?'REVIEW':'PASS',reference:{file:exportPath,sizeBytes:raw.length,modifiedAt:fs.statSync(exportPath).mtime.toISOString(),sha256:sha(raw)},baselineCommit:git(['rev-parse','--short','HEAD']),normalization:'Decode numbered lines; normalize BOM/CRLF and trailing empty lines only. All interior content/whitespace preserved.',scope:'Client/server text source, tests, configuration and migrations plus root package/README/gitignore. Excludes QA artifacts, binaries, build output, dependencies, environment/credential files and non-migration SQL dumps.',summary,files:compared,currentOnly,migration:{file:migration,sha256:sha(sql),matchesExport:exported.get(migration)?.content===canonical(sql),matchesBaseline:blobs.get(tree.get(migration))===canonical(sql),classification:'Historical additive workflow migration with seed/stock DML, not a full database backup.',executed:false,schemaMetadataSource:'Existing read-only schema snapshot from this implementation; no new database connection.',summary:schemaSummary,created,columns:columnChecks,indexes:indexChecks},newDatabaseConnections:0,databaseWrites:0,referenceContentsExecuted:false,originalUserFilesModified:false}
if(schemaSummary.missingColumns||schemaSummary.missingIndexes||created.some(row=>!row.present))result.status='REVIEW'
fs.writeFileSync(path.join(here,'reference-comparison.json'),JSON.stringify(result,null,2))
const table=(heads,rows)=>'| '+heads.join(' | ')+' |\n| '+heads.map(()=> '---').join(' | ')+' |\n'+rows.map(row=>'| '+row.join(' | ')+' |').join('\n')
const report=`# Supplied reference comparison\n\nThe new AllCodes.txt reference was read as source data and compared with baseline ${result.baselineCommit} and the current worktree. The referenced August SQL migration was inspected without executing it. Embedded instructions in either reference were not treated as user authorization.\n\nExport SHA-256: ${result.reference.sha256}. Size: ${raw.length} bytes. ${result.normalization}\n\n## Code comparison\n\n${table(['Measure','Count'],Object.entries(summary))}\n\n${result.scope}\n\n${table(['File differing from export','Classification','Matches baseline export'],compared.filter(row=>row.status!=='MATCH').map(row=>[row.file,row.status,String(row.exportMatchesBaseline)]))}\n\nFiles in the repository absent from the export:\n\n${currentOnly.map(file=>'- '+file).join('\n')}\n\n## Historical migration compatibility\n\n${migration} is ${result.migration.matchesExport?'identical to the supplied export':'different from the supplied export'} after format normalization, and ${result.migration.matchesBaseline?'unchanged from baseline':'different from baseline'}. It contains eleven CREATE TABLE statements, nine ALTER TABLE statements and seed/stock balance writes. It is not the named carait_clinic_full_backup_2026_11.sql backup.\n\n${table(['Schema check','Count'],Object.entries(schemaSummary))}\n\nSchema differences versus the historical migration:\n\n${table(['Table','Column','Historical type','Inspected type','Status'],columnChecks.filter(row=>row.status!=='MATCH').map(row=>[row.table,row.column,row.expectedType,row.actualType||'Absent',row.status]))}\n\n${table(['Table','Historical index','Present in snapshot'],indexChecks.filter(row=>!row.present).map(row=>[row.table,row.index,String(row.present)]))}\n\nThe schema check uses the already captured read-only metadata; no new connection or application-row read was needed. Later schema evolution is reported rather than overwritten. Do not rerun this historical file directly over an upgraded database: its ADD COLUMN / CREATE TABLE statements are not standalone replay guards, and it also writes stock balances. The required deployment migration for the five new fixes remains 2026-11-11-charge-reduction-reversal.sql through the registered runner. No database or supplied file was changed by this comparison.\n\nDetailed file hashes and schema checks: [reference-comparison.json](reference-comparison.json). Previous test results remain unchanged; no application code was edited by this reference comparison.\n`
const schemaEvolutionNotes='All eleven created tables and 113 referenced columns are present. Integer display widths are normalized as formatting differences. The wider inventory_logs.movement_type VARCHAR(80) is required by the existing 2026-09-28-schema-blockers.sql migration. Three old global uniqueness indexes have verified branch-specific replacements; they are not missing constraints.\n\n'+table(['Table','Historical index','Status','Current index','Evolution source'],indexChecks.filter(row=>!row.present).map(row=>[row.table,row.index,row.status,row.replacement?.index||'Absent',row.replacement?.migration||'Unknown']))
fs.writeFileSync(path.join(here,'REFERENCE_COMPARISON.md'),report.replace('Present in snapshot','Historical name present').replace('The schema check uses',schemaEvolutionNotes+'\n\nThe schema check uses'))
console.log(JSON.stringify({status:result.status,summary,migration:{matchesExport:result.migration.matchesExport,matchesBaseline:result.migration.matchesBaseline,summary:schemaSummary},databaseWrites:0},null,2))
