// SELECT metadata and EXPLAIN only. Never starts the application or runs DDL.
require('dotenv').config({quiet:true})
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm')
const db=require('../db/connect'),views=require('../utils/billingViews')
async function main(){
 const [columns]=await db.query("SELECT TABLE_NAME,COLUMN_NAME,COLUMN_TYPE FROM information_schema.columns WHERE table_schema=DATABASE() AND TABLE_NAME IN ('billing_records','billing_items','billing_payments','billing_charge_adjustments','billing_adjustment_requests','billing_payment_refunds','payment_gateway_attempts','payment_gateway_webhook_events','inventory_uoms','notifications','appointments','clinic_promotions','audit_logs') ORDER BY TABLE_NAME,ORDINAL_POSITION")
 const hasFailureMessage=columns.some(c=>c.TABLE_NAME==='payment_gateway_webhook_events'&&c.COLUMN_NAME==='failure_message')
 const queries=[]
 const probe={query:async(sql,args)=>{
  if(!/^SELECT\s/i.test(sql.trim()))throw new Error('Non-read statement in billing read model')
  queries.push({sql,args})
  if(sql.includes('COUNT(*) AS total'))return [[{total:0}]]
  return [[]]
 }}
 const source=fs.readFileSync(path.join(__dirname,'../routers/branchOperationalReads.js'),'utf8')
 const reads=vm.runInNewContext(source.slice(source.indexOf('const dateOnly ='),source.indexOf('async function readBill('))+';readBills',{db:probe,...views})
 for(const payment_view of ['pending','failed','paid',''])await reads({branchId:1,query:{payment_view,page:1,limit:10,search:'sample'}},{json:()=>{}})
 await require('../utils/billing').getBillingRecordWithItems(1,{query:async(sql,args)=>{
  queries.push({sql,args});return sql.includes('FROM billing_records b')?[[{id:1,total_amount:0}]]:[[]]
 }})
 const historySource=fs.readFileSync(path.join(__dirname,'../utils/billHistory.js'),'utf8')
 const module={exports:{}}
 vm.runInNewContext(historySource,{module,exports:module.exports,require:id=>id==='../db/connect'?probe:{getBillingRecordWithItems:async()=>({id:1,payments:[]})}})
 await module.exports.readBillHistory(1,1,{query:async(sql,args)=>{
  queries.push({sql,args});return sql.startsWith('SELECT id FROM billing_records')?[[{id:1}]]:[[]]
 }})
 let explained=0
 for(const {sql,args} of queries){
  // The new nullable field has not been deployed. Model its type in a derived
  // read-only projection so EXPLAIN can validate the post-migration query shape.
  let planned=sql
  if(!hasFailureMessage)planned=planned.replace(/payment_gateway_webhook_events (gateway_failure|e) /g,"(SELECT existing_events.*,CAST(NULL AS CHAR(255)) AS failure_message FROM payment_gateway_webhook_events existing_events) $1 ")
  await db.query('EXPLAIN '+planned,args);explained++
 }
 const report={schemaColumns:columns,hasFailureMessage,explainedQueries:explained,projectionForUnappliedMigration:!hasFailureMessage,financialRowsRead:0,mutations:0}
 fs.writeFileSync(path.join(__dirname,'../../docs/fix-2026-11-05/evidence/billing-schema-and-sql.json'),JSON.stringify(report,null,2))
 console.log(`PASS ${explained} billing SQL plans; metadata columns ${columns.length}; live mutations 0. Failure-message migration ${hasFailureMessage?'present':'not applied (nullable projection used)'}.`)
}
main().catch(e=>{console.error(e.code||'ERROR',e.message);process.exitCode=1}).finally(()=>db.end())
