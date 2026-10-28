'use strict'
// Explicitly SELECT/EXPLAIN SELECT only. Does not import server.js, schema bootstrap, workers,
// reminders, or payment/email/upload providers. No row values enter the report.
const fs = require('node:fs')
const path = require('node:path')
const { root, out: evidenceDir } = require('./output.cjs')
const out = path.join(evidenceDir, 'live-read-only.json')
let pool
async function main() {
  require('../../server/node_modules/dotenv').config({ path: path.join(root, 'server/.env'), quiet: true })
  const { createConnectionOptions } = require('../../server/db/connectionOptions')
  pool = require('../../server/node_modules/mysql2/promise').createPool(createConnectionOptions({ ...process.env, DB_POOL_SIZE: '1', DB_CONNECT_TIMEOUT_MS: '3000' }))
  let count = 0
  const db = { query(sql, params) {
    if (!/^\s*(?:SELECT\b|EXPLAIN\s+SELECT\b)/i.test(sql) || /;/.test(sql)) throw Object.assign(Error('AUDIT_NON_READ_BLOCKED'),{code:'AUDIT_NON_READ_BLOCKED'})
    count++
    return pool.query({ sql, timeout: 5000 }, params)
  } }
  const result = { reachable: false, statementPolicy: 'SELECT and EXPLAIN SELECT only', scope: 'Configured server database; metadata and aggregate validation only' }
  try {
    await db.query('SELECT 1 AS ok')
    result.reachable = true
    const [[engine]] = await db.query('SELECT VERSION() AS version')
    result.engine = engine.version
    const snapshot = JSON.parse(fs.readFileSync(path.join(evidenceDir,'backup-audit.json'))).schema
    const [liveColumns] = await db.query('SELECT TABLE_NAME,COLUMN_NAME,COLUMN_TYPE,IS_NULLABLE,COLUMN_DEFAULT,EXTRA FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=DATABASE()')
    const live = new Map(liveColumns.map(col=>[col.TABLE_NAME+'.'+col.COLUMN_NAME,col]))
    result.backupComparison = { missingColumns:[], addedColumns:[], typeOrNullabilityDifferences:[], defaultDifferences:[], extraDifferences:[] }
    const normalizeType = type => type.toLowerCase().replace(/\b(int|bigint|tinyint|smallint)\(\d+\)/g,'$1')
    for(const [table,meta] of Object.entries(snapshot)) for(const [col,definition] of Object.entries(meta.columns)) {
      const key=table+'.'+col, current=live.get(key)
      if(!current){result.backupComparison.missingColumns.push(key);continue}
      const type=/^(\w+(?:\([^)]*\))?(?: unsigned)?)/i.exec(definition)?.[1]
      if(normalizeType(type)!==normalizeType(current.COLUMN_TYPE)||(/\bNOT NULL\b/i.test(definition)?'NO':'YES')!==current.IS_NULLABLE)result.backupComparison.typeOrNullabilityDifferences.push(key)
      const def=/\bDEFAULT\s+('(?:\\.|[^'])*'|NULL|CURRENT_TIMESTAMP(?:\(\))?|[-\d.]+)/i.exec(definition)?.[1]
      const normalizeDefault=v=>v==null||String(v).toLowerCase()==='null'?null:String(v).replace(/^'|'$/g,'').toLowerCase().replace(/\(\)$/,'')
      if(def!==undefined&&normalizeDefault(def)!==normalizeDefault(current.COLUMN_DEFAULT))result.backupComparison.defaultDifferences.push(key)
      if(/auto_increment/i.test(definition)!==/auto_increment/i.test(current.EXTRA)||/on update current_timestamp/i.test(definition)!==/on update current_timestamp/i.test(current.EXTRA))result.backupComparison.extraDifferences.push(key)
      live.delete(key)
    }
    result.backupComparison.addedColumns=[...live.keys()]
    const [liveIndexRows]=await db.query('SELECT TABLE_NAME,INDEX_NAME,NON_UNIQUE,SEQ_IN_INDEX,COLUMN_NAME FROM information_schema.STATISTICS WHERE TABLE_SCHEMA=DATABASE() ORDER BY TABLE_NAME,INDEX_NAME,SEQ_IN_INDEX')
    const indexes=new Map()
    for(const row of liveIndexRows){const key=row.TABLE_NAME+'.'+row.INDEX_NAME;if(!indexes.has(key))indexes.set(key,{unique:Number(row.NON_UNIQUE)===0,columns:[]});indexes.get(key).columns.push(row.COLUMN_NAME)}
    result.backupComparison.indexDifferences=[]
    for(const [table,meta] of Object.entries(snapshot))for(const index of meta.indexes){const key=table+'.'+index.name,current=indexes.get(key);if(!current||current.unique!==index.unique||JSON.stringify(current.columns)!==JSON.stringify(index.columns))result.backupComparison.indexDifferences.push(key);indexes.delete(key)}
    result.backupComparison.addedIndexes=[...indexes.keys()]
    const [liveFks]=await db.query('SELECT k.TABLE_NAME,k.CONSTRAINT_NAME,k.COLUMN_NAME,k.REFERENCED_TABLE_NAME,k.REFERENCED_COLUMN_NAME,r.DELETE_RULE,r.UPDATE_RULE FROM information_schema.KEY_COLUMN_USAGE k JOIN information_schema.REFERENTIAL_CONSTRAINTS r ON r.CONSTRAINT_SCHEMA=k.CONSTRAINT_SCHEMA AND r.CONSTRAINT_NAME=k.CONSTRAINT_NAME AND r.TABLE_NAME=k.TABLE_NAME WHERE k.TABLE_SCHEMA=DATABASE() AND k.REFERENCED_TABLE_NAME IS NOT NULL ORDER BY k.TABLE_NAME,k.CONSTRAINT_NAME,k.ORDINAL_POSITION')
    result.backupComparison.foreignKeyDifferences=[]
    for(const [table,meta] of Object.entries(snapshot))for(const fk of meta.foreignKeys){
      const rows=liveFks.filter(row=>row.TABLE_NAME===table&&row.CONSTRAINT_NAME===fk.name)
      const rule=word=>(new RegExp('ON '+word+' (CASCADE|RESTRICT|NO ACTION|SET NULL)','i').exec(fk.rules)?.[1]||'RESTRICT').replace('NO ACTION','RESTRICT')
      if(rows.length!==fk.columns.length||rows.some((r,i)=>r.COLUMN_NAME!==fk.columns[i]||r.REFERENCED_TABLE_NAME!==fk.target||r.REFERENCED_COLUMN_NAME!==fk.targetColumns[i]||String(r.DELETE_RULE).replace('NO ACTION','RESTRICT')!==rule('DELETE')||String(r.UPDATE_RULE).replace('NO ACTION','RESTRICT')!==rule('UPDATE')))result.backupComparison.foreignKeyDifferences.push(table+'.'+fk.name)
    }
    const fkQueries=[]
    const id=value=>{if(!/^[A-Za-z_0-9]+$/.test(value))throw Error('AUDIT_IDENTIFIER_REJECTED');return '`'+value+'`'}
    for(const [table,meta] of Object.entries(snapshot)) for(const fk of meta.foreignKeys) {
      const nonNull=fk.columns.map(col=>'c.'+id(col)+' IS NOT NULL').join(' AND ')
      const relation=fk.columns.map((col,i)=>'p.'+id(fk.targetColumns[i])+'=c.'+id(col)).join(' AND ')
      fkQueries.push(`SELECT '${fk.name}' AS check_name,COUNT(*) AS violations FROM ${id(table)} c WHERE ${nonNull} AND NOT EXISTS (SELECT 1 FROM ${id(fk.target)} p WHERE ${relation})`)
    }
    if(!result.backupComparison.missingColumns.length){const [integrity]=await db.query(fkQueries.join(' UNION ALL '));result.foreignKeyChecks={total:integrity.length,nonzero:integrity.filter(row=>Number(row.violations)>0)}}
    result.aggregateIntegrity={total:0,nonzero:[],failures:[]}
    for(const query of require('./integrityQueries.cjs')){
      result.aggregateIntegrity.total++
      try{const [[row]]=await db.query(query.sql);if(Number(row.violations))result.aggregateIntegrity.nonzero.push({check:query.name,violations:Number(row.violations)})}
      catch(error){result.aggregateIntegrity.failures.push({check:query.name,code:error.code||'AGGREGATE_FAILED'})}
    }
    const { diagnose } = require('../../server/scripts/diagnoseConsultationSchema')
    result.consultation = await diagnose(db)
    const { verifyPromotionSchema } = require('../../server/scripts/promotionMigration')
    try { await verifyPromotionSchema(db); result.promotionSchema = 'complete' }
    catch (error) { result.promotionSchema = error.message }
    const { migrationFiles, acceptedContentHashes, verifyFoundationSchema } = require('../../server/scripts/branchMigrations')
    const [rows] = await db.query('SELECT filename,content_sha256 FROM schema_migrations')
    const saved = new Map(rows.map(row=>[row.filename,row.content_sha256]))
    result.migrations = migrationFiles.map(filename => ({ filename, recorded: saved.has(filename), checksumMatches: saved.has(filename) ? acceptedContentHashes(fs.readFileSync(path.join(root,'server/db/migrations',filename),'utf8')).has(saved.get(filename)) : null }))
    try { result.foundation = await verifyFoundationSchema(db, fs.readFileSync(path.join(root,'server/db/migrations',migrationFiles[0]),'utf8')) }
    catch (error) { result.foundation = error.message }
    const { verifyBranchReportsSql } = require('../../server/scripts/verifyBranchReportsSql')
    try { result.reportsSqlStatements = await verifyBranchReportsSql(db) }
    catch (error) { result.reportsSql = { passed: false, code: error.cause?.code || 'SQL_VALIDATION_FAILED' } }
    const [settings] = await db.query('SELECT branch_id,online_min_lead_minutes,pending_confirmation_cutoff_minutes,booking_start_interval_minutes,no_show_grace_minutes FROM branch_booking_settings ORDER BY branch_id')
    const [globalSettings] = await db.query('SELECT online_min_lead_minutes,pending_confirmation_cutoff_minutes,booking_start_interval_minutes FROM booking_settings WHERE id=1')
    result.bookingPolicy = { branches: settings, legacyGlobal: globalSettings }
    const [[pending]] = await db.query("SELECT COUNT(*) AS missingDeadlines FROM appointments WHERE status='pending' AND appointment_source='online' AND confirmation_deadline_at IS NULL")
    result.pendingMissingDeadlines = Number(pending.missingDeadlines)
    const source=JSON.parse(fs.readFileSync(path.join(evidenceDir,'source-inventory.json')))
    result.literalSelectValidation={total:source.readQueries.length,passed:0,failures:[],scope:'Only literal SELECT query/execute arguments; dynamic SQL and DML are excluded. EXPLAIN does not execute application actions.'}
    for(const query of source.readQueries){
      try{await db.query('EXPLAIN '+query.sql,Array((query.sql.match(/\?/g)||[]).length).fill(1));result.literalSelectValidation.passed++}
      catch(error){result.literalSelectValidation.failures.push({file:query.file,line:query.line,code:error.code||'EXPLAIN_FAILED'})}
    }
    const campaign=source.readQueries.find(query=>query.file==='server/routers/branchAnnouncements.js'&&query.sql.includes('FROM marketing_campaigns c'))
    result.campaignReadValidation={runs:5,passed:0}
    for(let i=0;i<5;i++){try{await db.query('EXPLAIN '+campaign.sql,[1]);result.campaignReadValidation.passed++}catch(error){result.campaignReadValidation.code=error.code}}
    // Execute the existing deployment verifier through the same read-only guard.
    // Capture logs without emitting driver messages or configured private values.
    const verifier=path.join(root,'server/scripts/verifyDeployment.js')
    const requireFromVerifier=require('node:module').createRequire(verifier)
    const moduleObject={exports:{}}, verifierProcess={env:process.env,exitCode:0},messages={log:[],warn:[],error:[]}
    const sourceText=fs.readFileSync(verifier,'utf8').replace(/\nrun\(\)\s*$/,'\nmodule.exports=run\n')
    const factory=require('node:vm').runInNewContext('(function(require,module,exports,__dirname,process,console){'+sourceText+'\n})')
    factory(name=>name==='../db/connect'?{query:db.query,end:async()=>{}}:name==='dotenv'?{config:()=>{}}:requireFromVerifier(name),moduleObject,moduleObject.exports,path.dirname(verifier),verifierProcess,Object.fromEntries(Object.keys(messages).map(level=>[level,(...args)=>messages[level].push(args)])))
    await moduleObject.exports()
    result.deploymentVerifier={passed:!verifierProcess.exitCode,warnings:messages.warn.length,errors:messages.error.length,scope:'Existing verifyDeployment.js logic under read-only SQL guard; configuration is local, not the Render deployment environment'}
  } catch (error) {
    result.errorCode = error.code || 'READ_ONLY_CHECK_FAILED'
    // Driver messages may contain private hosts/usernames: never emit them.
    process.exitCode = 1
  } finally {
    result.readStatements = count
    fs.writeFileSync(out, JSON.stringify(result,null,2)+'\n')
    console.log(JSON.stringify(result))
  }
}
main().catch(error=>{ fs.writeFileSync(out,JSON.stringify({reachable:false,errorCode:error.code||'CONFIGURATION_UNAVAILABLE'})+'\n'); console.log('Read-only metadata check unavailable; details redacted.'); process.exitCode=1 }).finally(async()=>{if(pool)await pool.end().catch(()=>{})})
