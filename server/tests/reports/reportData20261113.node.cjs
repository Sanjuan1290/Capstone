const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),path=require('node:path')
const {execFileSync}=require('node:child_process')
const {loadSuperAdminReport}=require('../../utils/superAdminReports')
const stock=require('../../utils/inventoryReportStock')
const calls=[]
const db={async query(sql,params=[]){calls.push({sql,params});return [JSON.parse(execFileSync('python',[path.join(__dirname,'../helpers/reportSqlFixture.py')],{input:JSON.stringify({sql,params}),encoding:'utf8',windowsHide:true}))]}}
const options={from:'2026-11-01',to:'2026-11-13',branchId:1,now:new Date('2026-11-13T04:00:00Z')}

test('branch comparison and daily appointment trend reconcile to the detailed reports',async()=>{
 const routes=require('../helpers/reportRouteHarness.cjs')(db)
 let branches,trends
 await routes['/analytics/all']({query:{}},{json:value=>{branches=value}})
 assert.equal(branches.find(row=>row.id===1).billed,1200)
 assert.equal(branches.find(row=>row.id===1).collected,100)
 assert.equal(branches.find(row=>row.id===1).appointments,4)
 assert.equal(branches.find(row=>row.id===2).collected,500)
 await routes['/analytics/trends']({query:{branch_id:'1'}},{json:value=>{trends=value.appointments}})
 assert.equal(trends.reduce((sum,row)=>sum+row.appointments,0),4)
 assert.equal(trends.reduce((sum,row)=>sum+row.completed,0),1)
})
test('all five Super Admin report sections execute against synthetic SQL data and reconcile to source totals',async()=>{
 const previous=process.env.UNIFIED_BILLING_STOCKOUT;process.env.UNIFIED_BILLING_STOCKOUT='1'
 try{
  const result={}
  for(const section of ['overview','appointments','financial','services','inventory'])result[section]=(await loadSuperAdminReport(db,{...options,section})).data
  assert.equal(result.overview.totals.appointments,4);assert.equal(result.overview.totals.unique_patients,3);assert.equal(result.overview.totals.no_show_rate,50)
  assert.equal(result.appointments.summary.new_patients,2);assert.equal(result.appointments.summary.returning_patients,1)
  assert.equal(result.appointments.statuses.reduce((a,r)=>a+r.count,0),4)
  assert.equal(result.appointments.sources.reduce((a,r)=>a+r.count,0),4)
  assert.equal(result.financial.billing.gross_billed,1300);assert.equal(result.financial.billing.net_billed,1200)
  assert.equal(result.financial.collections.gross_received,1000);assert.equal(result.financial.collections.voided,700);assert.equal(result.financial.collections.refunded,200)
  assert.equal(result.financial.collections.net_collected,100);assert.equal(result.overview.totals.net_collected,100)
  assert.equal(result.financial.outstanding,200);assert.equal(result.overview.totals.outstanding,200)
  assert.equal(result.services.services.reduce((a,r)=>a+r.gross_billed,0),1280)
  assert.ok(result.services.doctors.some(row=>row.doctor_id===2&&row.branch_id===1))
  assert.equal(result.inventory.summary.products,3);assert.equal(result.inventory.summary.low_stock,1);assert.equal(result.inventory.summary.out_of_stock,1)
  assert.equal(result.inventory.summary.expired,1);assert.equal(result.inventory.summary.expiring_soon,1)
  assert.equal(result.inventory.most_used[0].quantity,4)
  assert.ok(result.inventory.stockrooms.every(row=>row.branch_id===1))
  const all=(await loadSuperAdminReport(db,{...options,section:'appointments',branchId:null})).data
  assert.equal(all.summary.appointments,5);assert.equal(all.summary.unique_patients,4);assert.equal(all.summary.new_patients,3)
  const refundOnly=(await loadSuperAdminReport(db,{...options,section:'financial',from:'2026-11-08',to:'2026-11-08'})).data
  assert.equal(refundOnly.collections.net_collected,-200)
  assert.ok(calls.every(call=>/^\s*SELECT/i.test(call.sql)))
 }finally{if(previous===undefined)delete process.env.UNIFIED_BILLING_STOCKOUT;else process.env.UNIFIED_BILLING_STOCKOUT=previous}
})
test('branch Reports execute their actual SQL with the same financial and patient totals, including a shared doctor',async()=>{
 const source=fs.readFileSync(require.resolve('../../routers/branchReports'),'utf8'),module={exports:{}}
 const deps={'../utils/inventoryReportStock':stock,'../db/connect':db,'../utils/reportRange':{resolveReportRange:()=>({startDate:options.from,endDate:options.to})},'../utils/date':{getTodayDateOnly:()=> '2026-11-13',addDaysDateOnly:()=> '2026-12-13'},'../utils/audit':{writeAuditLog:async()=>{}}}
 vm.runInNewContext(source,{module,require:key=>{assert.ok(key in deps,key);return deps[key]},console})
 let report
 const previous=process.env.UNIFIED_BILLING_STOCKOUT;process.env.UNIFIED_BILLING_STOCKOUT='1'
 try { await module.exports.readBranchReport({branchId:1,branch:{name:'Branch 1'},query:{}},{json:value=>{report=value}}) } finally {if(previous===undefined)delete process.env.UNIFIED_BILLING_STOCKOUT;else process.env.UNIFIED_BILLING_STOCKOUT=previous}
 assert.equal(report.inventoryStats.total_items,3);assert.equal(report.inventoryStats.low_stock,1);assert.equal(report.inventoryStats.out_of_stock,1)
 assert.equal(report.inventoryStats.expired,1);assert.equal(report.inventoryStats.expiring_soon,1)
 assert.equal(report.appointmentSummary.appointments,4)
 assert.equal(report.appointmentSummary.new_patients,2)
 assert.equal(report.serviceRevenue.reduce((sum,row)=>sum+Number(row.gross_billed_amount),0),1280)
 assert.equal(report.mostUsedMedicines[0].visits,3)
 assert.equal(report.billingSummary.gross_billed,1300);assert.equal(report.billingSummary.net_collected,100);assert.equal(report.billingSummary.outstanding,200)
 assert.ok(report.topDoctors.some(row=>row.name==='Doctor 2'))
})
test('a missing collection ledger propagates an error instead of reporting zero revenue',async()=>{
 const {loadCollectionLedger}=require('../../utils/reportMetrics')
 await assert.rejects(loadCollectionLedger({startDate:options.from,endDate:options.to},{query:async()=>{throw Object.assign(Error('missing ledger'),{code:'ER_NO_SUCH_TABLE'})}}),/missing ledger/)
})

test('MySQL decimal strings normalize in report metrics without coercing names',async()=>{
 const stringDb={async query(sql,params){
  const [rows]=await db.query(sql,params)
  return [rows.map(row=>Object.fromEntries(Object.entries(row).map(([key,value])=>[key,key==='name'?'007':typeof value==='number'?String(value):value])))]
 }}
 const result=(await loadSuperAdminReport(stringDb,{...options,section:'inventory'})).data
 assert.equal(result.summary.products,3)
 assert.equal(result.summary.estimated_selling_value,700)
 assert.equal(typeof result.categories[0].estimated_selling_value,'number')
 assert.equal(result.categories[0].name,'007')
 assert.equal(typeof result.movements[0].actions,'number')
})
