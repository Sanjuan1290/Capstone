'use strict'
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict')
if(process.env.DB_HOST!=='127.0.0.1'||process.env.DB_PORT!=='33411'||process.env.DB_NAME!=='carait_merge_qa_20261111')throw Error('Only the new synthetic schema is authorized')
const db=require('../../server/db/connect'),{ensureAppSchema}=require('../../server/utils/schema'),{runBranchMigrations}=require('../../server/scripts/branchMigrations')
const statements=[]
function inspect(sql){
 const text=String(sql);statements.push(text)
 if(/^ALTER\s+TABLE\s+`?billing_charge_adjustments`?\s+ADD\s+COLUMN\s+`?(reversed_at|reversed_by_admin_id|reversal_reason)\b/i.test(text))throw Error('An existing reversal column was about to be added again')
 if(/\b(?:DELETE\s+FROM|TRUNCATE\s+TABLE|DROP\s+TABLE)\s+`?schema_migrations\b/i.test(text))throw Error('Migration history deletion is forbidden')
}
const query=db.query.bind(db);db.query=async(...args)=>{inspect(args[0]);return query(...args)}
const getConnection=db.getConnection.bind(db);db.getConnection=async()=>{const connection=await getConnection();if(!connection.__qaObserved){const q=connection.query.bind(connection);connection.query=async(...args)=>{inspect(args[0]);return q(...args)};connection.__qaObserved=true}return connection}
const history=async()=>{const [rows]=await db.query('SELECT filename,content_sha256,applied_at FROM schema_migrations ORDER BY filename');return rows}
async function main(){
 try{
  const [[instance]]=await db.query('SELECT @@datadir AS data,DATABASE() AS db_name')
  const expected=JSON.parse(fs.readFileSync(path.join(__dirname,'mysql-instance.json')))
  assert.equal(path.resolve(instance.data).toLowerCase(),path.resolve(expected.data).toLowerCase());assert.equal(instance.db_name,'carait_merge_qa_20261111')
  const [columns]=await db.query("SELECT COLUMN_NAME,COLUMN_TYPE,IS_NULLABLE FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='billing_charge_adjustments' AND COLUMN_NAME IN ('reversed_at','reversed_by_admin_id','reversal_reason') ORDER BY COLUMN_NAME")
  assert.equal(columns.length,3,'The cloned schema must already contain all manually added fields')
  const before=await history()
  // The schema clone deliberately copies no source accounts or clinic rows.
  // Supply the required foundation identity using only synthetic local data.
  const password=await require('../../server/node_modules/bcrypt').hash('SyntheticQa!2026',10)
  await db.query("INSERT IGNORE INTO admins (id,full_name,email,password,account_role,branch_id,is_active) VALUES (1,'Synthetic Super Admin','superadmin@qa.invalid',?,'superadmin',NULL,1)",[password])
  await db.query("INSERT IGNORE INTO clinic_settings (id,clinic_name) VALUES (1,'Synthetic QA Clinic')")
  await ensureAppSchema();await runBranchMigrations(db)
  await db.query("UPDATE clinic_branches SET name='Synthetic QA Branch',address='Synthetic QA Address' WHERE id=1")
  const first=await history(),beforeRepeat=statements.length
  await runBranchMigrations(db)
  const second=await history();assert.deepEqual(second,first)
  for(const old of before)assert.deepEqual(first.find(row=>row.filename===old.filename),old)
  assert.equal(first.filter(row=>row.filename==='2026-11-11-charge-reduction-reversal.sql').length,1)
  const [after]=await db.query("SELECT COLUMN_NAME,COLUMN_TYPE,IS_NULLABLE FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='billing_charge_adjustments' AND COLUMN_NAME IN ('reversed_at','reversed_by_admin_id','reversal_reason') ORDER BY COLUMN_NAME")
  assert.deepEqual(after,columns)
  const result={status:'PASS',syntheticOnly:true,columnsAlreadyPresent:columns.length,reversalColumnAlterStatements:0,firstLedgerRows:first.length,repeatLedgerRows:second.length,historyRowsDeleted:0,historyPreserved:true,columnDefinitionsUnchanged:true,initialAndRepeatedRunsPassed:true,queriesInRepeat:statements.length-beforeRepeat,productionWrites:0}
  fs.writeFileSync(path.join(__dirname,'migration-verification.json'),JSON.stringify(result,null,2))
  fs.writeFileSync(path.join(__dirname,'database-verification.json'),JSON.stringify({status:'PASS',columns,guardedMigrationReentryCompleted:true,finalMigrationLedgerRows:1,sourceWrites:0,historyRowsDeleted:0},null,2))
  console.log(JSON.stringify(result))
 }finally{await db.end()}
}
main().catch(error=>{console.error(error.message);process.exitCode=1})
