'use strict'
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict'),crypto=require('node:crypto')
const mysql=require('../../server/node_modules/mysql2/promise'),{runBranchMigrations}=require('../../server/scripts/branchMigrations')
const db=mysql.createPool({host:'127.0.0.1',port:33411,user:'root',database:'carait_merge_qa_20261111',dateStrings:true})
const tables=['billing_records','billing_items','billing_payments','billing_charge_adjustments','billing_adjustment_requests','consultations','consultation_inventory_usage','inventory','inventory_batches','inventory_location_stock','audit_logs','schema_migrations']
const snapshot=async()=>{const result={};for(const table of tables){const [rows]=await db.query('SELECT * FROM '+table);result[table]={rows:rows.length,sha256:crypto.createHash('sha256').update(rows.map(row=>JSON.stringify(row)).sort().join('\n')).digest('hex')}}return result}
let repeatedColumnAdds=0,historyDeletes=0
const observe=sql=>{const text=String(sql);if(/^ALTER TABLE billing_charge_adjustments ADD COLUMN (reversed_at|reversed_by_admin_id|reversal_reason)\b/i.test(text)){repeatedColumnAdds++;throw Error('Repeated reversal column DDL blocked')}if(/(?:DELETE FROM|TRUNCATE TABLE|DROP TABLE) schema_migrations\b/i.test(text)){historyDeletes++;throw Error('History deletion blocked')}}
const query=db.query.bind(db);db.query=async(...args)=>{observe(args[0]);return query(...args)}
const get=db.getConnection.bind(db);db.getConnection=async()=>{const connection=await get();if(!connection.__qaFinalObserved){const q=connection.query.bind(connection);connection.query=async(...args)=>{observe(args[0]);return q(...args)};connection.__qaFinalObserved=true}return connection}
async function main(){try{
 const [[actual]]=await db.query('SELECT @@datadir AS data,DATABASE() AS name')
 const expected=JSON.parse(fs.readFileSync(path.join(__dirname,'mysql-instance.json')))
 assert.equal(path.resolve(actual.data).toLowerCase(),path.resolve(expected.data).toLowerCase());assert.equal(actual.name,'carait_merge_qa_20261111')
 const before=await snapshot();await runBranchMigrations(db);const after=await snapshot();assert.deepEqual(after,before)
 const [[totals]]=await db.query('SELECT COUNT(*) AS n FROM billing_records WHERE total_amount<0 OR ABS(total_amount-(subtotal-discount_amount))>0.005')
 assert.equal(totals.n,0)
 const [[history]]=await db.query("SELECT COUNT(*) AS n FROM billing_charge_adjustments WHERE status='reversed' AND (reversed_at IS NULL OR reversed_by_admin_id IS NULL OR reversal_reason IS NULL OR approved_by_admin_id IS NULL)")
 assert.equal(history.n,0)
 const [[ledger]]=await db.query('SELECT COUNT(*) AS n FROM schema_migrations WHERE filename=?',['2026-11-11-charge-reduction-reversal.sql']);assert.equal(ledger.n,1)
 const result={status:'PASS',syntheticOnly:true,registeredReplayCompleted:true,finalMigrationLedgerRows:1,allSnapshotHashesUnchanged:true,snapshots:before,reversalColumnAlterStatements:repeatedColumnAdds,historyRowsDeleted:historyDeletes,negativeOrInconsistentBills:totals.n,reversedHistoryMissingFields:history.n,sourceWrites:0}
 fs.writeFileSync(path.join(__dirname,'database-verification.json'),JSON.stringify(result,null,2))
 console.log('Post-workflow migration replay preserves all 12 financial, clinical, stock, audit and migration snapshots; totals/history invariants pass.')
}finally{await db.end()}}
main().catch(error=>{console.error(error.message);process.exitCode=1})
