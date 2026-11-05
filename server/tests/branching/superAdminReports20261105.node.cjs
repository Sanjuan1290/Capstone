'use strict'
const test=require('node:test')
const assert=require('node:assert/strict')
const {loadSuperAdminReport,scope,todayInClinic,plusDays}=require('../../utils/superAdminReports')

function fixtureDb(){
 const queries=[]
 const db={async query(sql,args=[]){
  queries.push({sql,args})
  if(sql.includes('FROM billing_records b')&&sql.includes('gross_billed'))return [[{gross_billed:1200,discounts:300,promotion_discounts:100,net_billed:900,bills:2}],[]]
  if(sql.includes('promotional_bills'))return [[{promotional_bills:1,promotion_savings:100}],[]]
  if(sql.includes('AS amount')&&sql.includes('outstanding'))return [[{amount:50}],[]]
  if(sql.includes(' AS outstanding'))return [[{outstanding:75}],[]]
  if(sql.includes('WHERE a.appointment_date BETWEEN')&&sql.includes('arrived_or_no_show'))return [[{appointments:5,unique_patients:4,completed:3,no_show:1,arrived_or_no_show:4,pending:1}],[]]
  if(sql.includes('AS out_of_stock')&&sql.includes('AS low_stock'))return [[{out_of_stock:1,low_stock:2}],[]]
  if(sql.includes('FROM inventory i WHERE i.archived_at IS NULL'))return [[{products:5,low_stock:2,out_of_stock:1,estimated_selling_value:800}],[]]
  // Collection ledger uses one unified event-dated query returning event rows.
  if(sql.includes('FROM (')&&sql.includes('ledger'))return [[
   {kind:'payment',payment_method:'cash',amount:400,ym:'2026-11',event_date:'2026-11-05'},
   {kind:'void',payment_method:'cash',amount:60,ym:'2026-11',event_date:'2026-11-05'},
   {kind:'refund',payment_method:'cash',amount:40,ym:'2026-11',event_date:'2026-11-05'},
  ],[]]
  return [[],[]]
 }}
 return {db,queries}
}
test('scope includes branch predicates only for selected branches',()=>{
 assert.deepEqual(scope(null,'a'),{sql:'',args:[]})
 assert.deepEqual(scope(3,'a'),{sql:' AND a.branch_id = ?',args:[3]})
})
test('Philippines dates handle 30-day expiry with explicit days',()=>{
 assert.equal(todayInClinic(new Date('2026-11-05T01:00:00Z')),'2026-11-05')
 assert.equal(plusDays('2026-11-05',30),'2026-12-05')
})
test('overview does not duplicate patient counts; current outstanding stays separately labeled',async()=>{
 const {db,queries}=fixtureDb()
 const result=await loadSuperAdminReport(db,{section:'overview',from:'2026-11-01',to:'2026-11-05',branchId:3})
 assert.equal(result.data.totals.unique_patients,4)
 assert.equal(result.data.totals.no_show_rate,25)
 assert.equal(result.data.totals.outstanding,75)
 assert.equal(result.data.totals.net_collected,300)
 assert.ok(queries.filter(q=>q.sql.includes('FROM appointments a')||q.sql.includes('FROM inventory i')).every(q=>q.args.includes(3)))
 assert.ok(queries.every(q=>/^\s*SELECT/i.test(q.sql)))
})
test('financial reports preserve billed/collected difference and refund event dating',async()=>{
 const {db,queries}=fixtureDb()
 const response=await loadSuperAdminReport(db,{section:'financial',from:'2026-11-01',to:'2026-11-05',branchId:3})
 assert.equal(response.data.billing.gross_billed,1200)
 assert.equal(response.data.billing.net_billed,900)
 assert.equal(response.data.billing.promotion_discounts,100)
 assert.equal(response.data.collections.gross_received,400)
 assert.equal(response.data.collections.voided,60)
 assert.equal(response.data.collections.refunded,40)
 assert.equal(response.data.collections.net_collected,300)
 const ledger=queries.find(x=>x.sql.includes('ledger'))
 assert.deepEqual(ledger.args,[3,3,3,'2026-11-01','2026-11-05'])
})
test('every report rejects unknown sections',async()=>{
 const {db}=fixtureDb()
 await assert.rejects(loadSuperAdminReport(db,{section:'patients',from:'2026-11-01',to:'2026-11-05'}),/Invalid report section/)
})

test('all report queries bind their branch and date parameters exactly', async()=>{
 for(const branchId of [null,3]){
  for(const section of ['overview','appointments','financial','services','inventory']){
   const {db,queries}=fixtureDb()
   await loadSuperAdminReport(db,{section,from:'2026-11-01',to:'2026-11-05',branchId})
   for(const {sql,args} of queries){
    const count=(sql.match(/\?/g)||[]).length
    assert.equal(count,args.length,`${section} (branch ${branchId}) has ${count} placeholders but ${args.length} params in ${sql.slice(0,100)}`)
   }
  }
 }
})
