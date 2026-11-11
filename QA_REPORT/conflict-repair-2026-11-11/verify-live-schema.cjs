'use strict'
// No application import, migration runner, application-data query or write.
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict')
const mysql=require('../../server/node_modules/mysql2/promise'),dotenv=require('../../server/node_modules/dotenv')
const {createConnectionOptions}=require('../../server/db/connectionOptions')
async function main(){
 const env={...process.env,...dotenv.parse(fs.readFileSync(path.resolve(__dirname,'../../server/.env')))}
 const connection=await mysql.createConnection(createConnectionOptions({...env,DB_CONNECT_TIMEOUT_MS:'5000',DB_POOL_SIZE:'1'}))
 try{
  const [columns]=await connection.execute('SELECT COLUMN_NAME,COLUMN_TYPE,IS_NULLABLE,COLUMN_DEFAULT FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME=? AND COLUMN_NAME IN (?,?,?) ORDER BY COLUMN_NAME',['billing_charge_adjustments','reversed_at','reversed_by_admin_id','reversal_reason'])
  const expected={reversed_at:'datetime',reversed_by_admin_id:'int',reversal_reason:'varchar(255)'}
  assert.equal(columns.length,3)
  for(const column of columns){assert.equal(column.IS_NULLABLE,'YES');assert.equal(column.COLUMN_TYPE.toLowerCase().replace(/^int\(\d+\)/,'int').replace(/^datetime\(0\)/,'datetime'),expected[column.COLUMN_NAME])}
  const [history]=await connection.execute('SELECT filename,content_sha256 FROM schema_migrations WHERE filename=?',['2026-11-11-charge-reduction-reversal.sql'])
  const result={status:'PASS',checkedAt:new Date().toISOString(),columns,history,readOnlyQueries:2,writes:0,financialRowsRead:0,applicationImported:false,migrationsExecuted:false}
  fs.writeFileSync(path.join(__dirname,'live-schema-verification.json'),JSON.stringify(result,null,2))
  console.log(JSON.stringify({status:result.status,columns,ledgerRecorded:history.length===1,writes:0},null,2))
 }finally{await connection.end()}
}
main().catch(error=>{console.error(JSON.stringify({status:'BLOCKED',code:error.code||'COLUMN_CONTRACT_FAILED',writes:0}));process.exitCode=1})
