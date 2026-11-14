const {cents,fromCents}=require('./billingMoney')
const validDate=value=>typeof value==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(value)&&Number.isFinite(Date.parse(value+'T00:00:00Z'))&&new Date(value+'T00:00:00Z').toISOString().slice(0,10)===value
async function financialAllocationReport(conn,{from,to,branchId=null}){
 if(!validDate(from)||!validDate(to)||from>to||(Date.parse(to)-Date.parse(from))/86400000>366)throw Object.assign(new Error('Select valid report dates spanning at most 366 days.'),{statusCode:400})
 if(branchId!==null&&(!Number.isSafeInteger(Number(branchId))||Number(branchId)<=0))throw Object.assign(new Error('Select a valid branch.'),{statusCode:400})
 const filter=branchId===null?'':' AND b.branch_id=?',args=[from,to,...(branchId===null?[]:[branchId])]
 const [bills]=await conn.query(`SELECT b.id,b.branch_id,b.status,d.full_name AS doctor_name,cb.name AS branch_name,s.calculation_json,s.confirmed_at
  FROM billing_financial_snapshots s JOIN billing_records b ON b.id=s.billing_id AND b.branch_id=s.branch_id
  JOIN doctors d ON d.id=b.doctor_id JOIN clinic_branches cb ON cb.id=b.branch_id
  WHERE s.confirmed_at IS NOT NULL AND b.status<>'voided' AND DATE(s.confirmed_at) BETWEEN ? AND ? ${filter}
  ORDER BY s.confirmed_at,b.id LIMIT 5001`,args)
 if(bills.length>5000)throw Object.assign(new Error('Narrow the report period to at most 5,000 confirmed bills.'),{statusCode:400})
 const [[legacy]]=await conn.query(`SELECT COUNT(*) AS total FROM billing_records b LEFT JOIN billing_financial_snapshots s ON s.billing_id=b.id
  WHERE b.finalized_at IS NOT NULL AND s.calculation_json IS NULL AND b.status<>'voided' AND DATE(b.finalized_at) BETWEEN ? AND ? ${filter}`,args)
 const totals={base_subtotal:0n,discounts:0n,tax:0n,patient_bill:0n,doctor_fee:0n,clinic_base_share:0n},rows=[]
 for(const bill of bills){
  const calc=typeof bill.calculation_json==='string'?JSON.parse(bill.calculation_json):bill.calculation_json
  if(!calc)continue
  totals.base_subtotal+=cents(calc.subtotal);totals.discounts+=cents(calc.discount_amount);totals.tax+=cents(calc.tax?.amount||0);totals.patient_bill+=cents(calc.total_amount)
  for(const fee of calc.doctor_fees||[]){
   const doctor=cents(fee.doctor_fee_amount),clinic=cents(fee.original_subtotal)-doctor
   totals.doctor_fee+=doctor;totals.clinic_base_share+=clinic
   rows.push({billing_id:bill.id,branch_name:bill.branch_name,doctor_name:bill.doctor_name,status:bill.status,confirmed_at:bill.confirmed_at,service_name:fee.service_name,percentage:fee.percentage,original_subtotal:fee.original_subtotal,doctor_fee_amount:fromCents(doctor),clinic_base_share:fromCents(clinic)})
  }
 }
 return {from,to,rows,bill_count:bills.length,legacy_bills_excluded:Number(legacy?.total||0),totals:Object.fromEntries(Object.entries(totals).map(([key,value])=>[key,fromCents(value)]))}
}
module.exports={financialAllocationReport}
