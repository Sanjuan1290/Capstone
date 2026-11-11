'use strict'
// Only the disposable local instance. No environment file is loaded.
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict'),mysql=require('../../server/node_modules/mysql2/promise')
async function main(){
 const connection=await mysql.createConnection({host:'127.0.0.1',port:33409,user:'root',database:'carait_qa_20261111'})
 try{
  const [[instance]]=await connection.query('SELECT @@datadir AS data')
  const expected=JSON.parse(fs.readFileSync(path.join(__dirname,'mysql-instance.json')))
  assert.equal(path.resolve(instance.data).toLowerCase(),path.resolve(expected.data).toLowerCase())
  const [columns]=await connection.query("SELECT COLUMN_NAME,COLUMN_TYPE,IS_NULLABLE FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='billing_charge_adjustments' AND COLUMN_NAME IN ('reversed_at','reversed_by_admin_id','reversal_reason') ORDER BY COLUMN_NAME")
  assert.equal(columns.length,3);assert.ok(columns.every(r=>r.IS_NULLABLE==='YES'))
  const [foreignKeys]=await connection.query("SELECT CONSTRAINT_NAME,REFERENCED_TABLE_NAME FROM information_schema.KEY_COLUMN_USAGE WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='billing_charge_adjustments' AND REFERENCED_TABLE_NAME IS NOT NULL")
  assert.ok(foreignKeys.some(r=>r.REFERENCED_TABLE_NAME==='billing_records'))
  const [[badTotals]]=await connection.query('SELECT COUNT(*) AS n FROM billing_records WHERE total_amount<0 OR ABS(total_amount-(subtotal-discount_amount))>0.005')
  assert.equal(badTotals.n,0)
  const [[reversed]]=await connection.query("SELECT COUNT(*) AS n FROM billing_charge_adjustments WHERE status='reversed' AND (reversed_at IS NULL OR reversed_by_admin_id IS NULL OR reversal_reason IS NULL OR approved_by_admin_id IS NULL)")
  assert.equal(reversed.n,0)
  // Re-enter this one additive migration with all columns already present.
  // This is a synthetic-schema ledger row only; no business/history row is removed.
  await connection.query('DELETE FROM schema_migrations WHERE filename=?',['2026-11-11-charge-reduction-reversal.sql'])
  fs.writeFileSync(path.join(__dirname,'database-verification.json'),JSON.stringify({status:'PASS',columns,foreignKeys,negativeOrInconsistentBills:badTotals.n,reversedHistoryMissingFields:reversed.n,sourceWrites:0,guardedMigrationReentryPrepared:true},null,2))
  console.log('Disposable schema, reversal history, foreign key and monetary invariants verified.')
 }finally{await connection.end()}
}
main().catch(e=>{console.error(e.message);process.exitCode=1})
