'use strict'
// Diagnostic only. No app import, reset SQL, SET, transaction or data write.
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto')
const dotenv=require('../../server/node_modules/dotenv'),mysql=require('../../server/node_modules/mysql2/promise')
const {createConnectionOptions}=require('../../server/db/connectionOptions')
const root=path.resolve(__dirname,'../..'),attachment='C:/Users/Robert/.codex/attachments/9d03c3ac-5568-4592-a425-236b519707e9/Pasted text.txt'
async function main(){
 const script=fs.readFileSync(attachment,'utf8'),env={...process.env,...dotenv.parse(fs.readFileSync(path.join(root,'server/.env')))}
 const connection=await mysql.createConnection(createConnectionOptions({...env,DB_CONNECT_TIMEOUT_MS:'5000',DB_POOL_SIZE:'1'}))
 let reads=0
 const select=async(sql,args=[])=>{if(!/^SELECT\b/i.test(sql))throw Error('Only SELECT statements are allowed');reads++;return connection.execute(sql,args)}
 try{
  const [[identity]]=await select('SELECT DATABASE() AS database_name,VERSION() AS database_version')
  const [tables]=await select("SELECT TABLE_NAME FROM information_schema.TABLES WHERE TABLE_SCHEMA=DATABASE() AND TABLE_TYPE='BASE TABLE'")
  const names=new Set(tables.map(row=>row.TABLE_NAME))
  const extract=source=>new Set([...source.matchAll(/'([a-z_]+)'/g)].map(match=>match[1]))
  const base=extract(script.slice(script.indexOf('SET @base_table_count'),script.indexOf('SET @unknown_table_count')))
  const allowed=extract(script.slice(script.indexOf('SET @unknown_table_count'),script.indexOf('SET @superadmin_count')))
  const email=script.match(/WHERE email='([^']+)'/)?.[1]
  const [[keeper]]=await select("SELECT COUNT(*) AS matching_superadmins FROM admins WHERE email=? AND account_role='superadmin' AND is_active=1",[email])
  const [[counts]]=await select('SELECT (SELECT COUNT(*) FROM clinic_branches) AS branches,(SELECT COUNT(*) FROM patients) AS patients,(SELECT COUNT(*) FROM doctors) AS doctors,(SELECT COUNT(*) FROM staff) AS staff,(SELECT COUNT(*) FROM inventory) AS inventory_items,(SELECT COUNT(*) FROM appointments) AS appointments,(SELECT COUNT(*) FROM billing_records) AS bills,(SELECT COUNT(*) FROM billing_payments) AS payments')
  const [foreignKeys]=await select("SELECT DISTINCT k.TABLE_NAME AS child_table,k.REFERENCED_TABLE_NAME AS parent_table,r.DELETE_RULE AS delete_rule FROM information_schema.KEY_COLUMN_USAGE k JOIN information_schema.REFERENTIAL_CONSTRAINTS r ON r.CONSTRAINT_SCHEMA=k.CONSTRAINT_SCHEMA AND r.CONSTRAINT_NAME=k.CONSTRAINT_NAME AND r.TABLE_NAME=k.TABLE_NAME WHERE k.TABLE_SCHEMA=DATABASE() AND k.REFERENCED_TABLE_NAME IS NOT NULL")
  const order=[...script.matchAll(/^DELETE FROM `?([a-z_]+)`? WHERE/gm)].map(match=>match[1]),index=new Map(order.map((table,i)=>[table,i]))
  const badOrder=foreignKeys.filter(row=>index.has(row.parent_table)&&index.has(row.child_table)&&index.get(row.parent_table)<index.get(row.child_table)&&['RESTRICT','NO ACTION'].includes(row.delete_rule))
  const result={status:'PASS',checkedAt:new Date().toISOString(),configurationSource:'Local server/.env; hosted Render environment is not accessible through this check',provider:env.DB_PROVIDER,database:identity.database_name,version:identity.database_version,hostFingerprint:crypto.createHash('sha256').update(env.DB_HOST.toLowerCase()).digest('hex').slice(0,12),recognizedBaseTables:[...base].filter(table=>names.has(table)).length,missingBaseTables:[...base].filter(table=>!names.has(table)),unknownTables:[...names].filter(table=>!allowed.has(table)),matchingSuperadmins:keeper.matching_superadmins,committedRowCounts:counts,pastedScript:{backupSwitch:script.match(/SET @backup_verified = '([^']+)'/)?.[1],confirmationSwitch:script.match(/SET @reset_confirmation = '([^']+)'/)?.[1],executableCommitPresent:/^\s*COMMIT\s*;/im.test(script)},restrictiveDeleteOrderProblems:badOrder,userReportedExecution:{resetApproved:1,commitSucceeded:true},readOnlyStatements:reads,writes:0}
  fs.writeFileSync(path.join(__dirname,'database-check.json'),JSON.stringify(result,null,2))
  console.log(JSON.stringify(result,null,2))
 }finally{await connection.end()}
}
main().catch(error=>{console.error(JSON.stringify({status:'READ_ONLY_CHECK_FAILED',code:error.code||'DIAGNOSTIC_FAILED',writes:0}));process.exitCode=1})
