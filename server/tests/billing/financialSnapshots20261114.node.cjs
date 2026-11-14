const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),path=require('node:path')
const {calculateFinancialBill}=require('../../utils/billingCalculation'),{disabledPolicy}=require('../../utils/billingTaxPolicy')
function fixture(){
 let snapshot=null,configured={...disabledPolicy(),version:1},policyReads=0
 const bill={id:7,branch_id:1,status:'draft',subtotal:100,total_amount:100,discount_amount:0,items:[{id:1,item_type:'service',catalog_service_id:1,service_name:'Consultation',quantity:1,unit_price:100,line_total:100,details:{pricing:{doctor_fee_percentage:20,original_price:100}}}]},writes=[]
 const conn={query:async(sql,args)=>{
  if(sql.startsWith('SELECT policy_json'))return [[snapshot].filter(Boolean)]
  if(sql.startsWith('SELECT id,target_type'))return [[]]
  writes.push({sql,args})
  if(sql.startsWith('INSERT INTO billing_financial_snapshots'))snapshot={...snapshot,policy_json:snapshot?.policy_json||args[2]}
  if(sql.startsWith('UPDATE billing_financial_snapshots SET calculation_json'))snapshot.calculation_json=args[0]
  if(sql.startsWith('UPDATE billing_financial_snapshots SET confirmed_at'))snapshot.confirmed_at='2026-11-14'
  if(sql.startsWith('UPDATE billing_records')){bill.subtotal=args[0];bill.discount_amount=args[1];bill.total_amount=args[2]}
  return [{affectedRows:1}]
 }},module={exports:{}}
 vm.runInNewContext(fs.readFileSync(path.join(__dirname,'../../utils/billingFinancialSnapshot.js'),'utf8'),{module,require:name=>name==='./billingTaxPolicy'?{loadTaxPolicy:async()=>{policyReads++;return configured},disabledPolicy,parse:v=>typeof v==='string'?JSON.parse(v):v}:name==='./billingCalculation'?{calculateFinancialBill}:name==='./billingServicePromotions'?{detailsFor:i=>i.details||{}}:name==='./billing'?{getBillingRecordWithItems:async()=>bill}:require(name)})
 return {...module.exports,bill,conn,writes,setPolicy(p){configured=p},get policyReads(){return policyReads},get snapshot(){return snapshot}}
}
test('a new bill freezes its policy and later branch changes cannot change it',async()=>{
 const h=fixture();await h.ensureBillPolicy(7,1,h.conn,{newBill:true});h.setPolicy({...disabledPolicy(),enabled:true,tax_rate:12})
 const result=await h.refreshDraftFinancialTotals(7,1,h.conn);assert.equal(result.total_amount,100);assert.equal(h.policyReads,1)
 await h.confirmFinancialSnapshot(h.bill,h.conn);assert.ok(h.snapshot.confirmed_at)
})
test('confirmed historical bills never recalculate from live policy',async()=>{
 const h=fixture();h.bill.status='paid';const result=await h.refreshDraftFinancialTotals(7,1,h.conn)
 assert.equal(result,null);assert.equal(h.writes.length,0);assert.equal(h.policyReads,0)
})
test('a bill cannot confirm stale calculations or a mismatched financial total',async()=>{
 const h=fixture();await h.ensureBillPolicy(7,1,h.conn,{newBill:true});await h.refreshDraftFinancialTotals(7,1,h.conn);h.bill.total_amount=999
 await assert.rejects(h.confirmFinancialSnapshot(h.bill,h.conn),{code:'BILL_REVIEW_REQUIRED'})
 assert.equal(h.snapshot.confirmed_at,undefined)
})

test('confirmation freezes the allocation and later service setup changes cannot rewrite it',async()=>{
 const h=fixture();await h.ensureBillPolicy(7,1,h.conn,{newBill:true});await h.refreshDraftFinancialTotals(7,1,h.conn);await h.confirmFinancialSnapshot(h.bill,h.conn)
 const saved=h.snapshot.calculation_json,writes=h.writes.length
 h.bill.status='paid';h.bill.items[0].details.pricing.doctor_fee_percentage=90
 await h.refreshDraftFinancialTotals(7,1,h.conn)
 assert.equal(h.snapshot.calculation_json,saved);assert.equal(h.writes.length,writes)
 assert.equal(JSON.parse(saved).doctor_fees[0].doctor_fee_amount,20)
})

test('a reversal on a legacy bill does not create a new policy or reprice it',async()=>{
 const h=fixture(),before=JSON.stringify(h.bill)
 assert.equal(await h.refreshDraftFinancialTotals(7,1,h.conn,{preserveLegacy:true}),null)
 assert.equal(h.writes.length,0);assert.equal(JSON.stringify(h.bill),before);assert.equal(h.policyReads,0)
})
