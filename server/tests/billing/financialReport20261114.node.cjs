const test=require('node:test'),assert=require('node:assert/strict')
const {financialAllocationReport}=require('../../utils/financialAllocationReport')
test('authorized report reads saved allocations and counts each confirmed bill once',async()=>{
 const queries=[],calc={subtotal:3099,discount_amount:200,total_amount:2899,tax:{amount:0},doctor_fees:[{service_name:'Vaccination',original_subtotal:3099,percentage:20,doctor_fee_amount:619.8}]}
 const report=await financialAllocationReport({query:async(sql,args)=>{queries.push({sql,args});return sql.includes('COUNT(*)')?[[{total:2}]]:[[{id:1,status:'paid',branch_name:'Clinic',doctor_name:'Doctor',calculation_json:JSON.stringify(calc)}]]}},{from:'2026-11-01',to:'2026-11-14',branchId:4})
 assert.equal(report.totals.patient_bill,2899);assert.equal(report.totals.doctor_fee,619.8);assert.equal(report.totals.clinic_base_share,2479.2);assert.equal(report.legacy_bills_excluded,2)
 assert.ok(queries.every(q=>q.args.at(-1)===4));assert.ok(queries.every(q=>q.sql.includes('b.branch_id=?')))
})
test('invalid report periods and branch IDs are rejected before querying financial data',async()=>{
 const conn={query:async()=>{throw Error('must not query')}}
 for(const input of [{from:'2026-02-30',to:'2026-11-14'},{from:'2026-11-15',to:'2026-11-14'},{from:'2026-11-01',to:'2026-11-14',branchId:-1}])await assert.rejects(financialAllocationReport(conn,input),{statusCode:400})
})
