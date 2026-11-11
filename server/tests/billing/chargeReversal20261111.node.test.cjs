const test=require('node:test'),assert=require('node:assert/strict')
const finance=require('../../utils/chargeAdjustments'),{billingFixture}=require('../helpers/billingFixture.cjs')
function fixture(){
 const {state,conn:base}=billingFixture()
 Object.assign(state.bill,{subtotal:1000,discount_amount:350,total_amount:650,promotion_discount_amount:100})
 state.requests.push({id:5,billing_id:6,branch_id:1,status:'approved',bill_version:1,requested_amount:200,approved_by_admin_id:8,requester_user_id:3,requester_role:'doctor',reason:'Original courtesy request',admin_note:'Approved originally'})
 const conn={query:async(sql,args=[])=>{
  if(sql.startsWith("UPDATE billing_charge_adjustments SET status='reversed'")){
   const entry=state.requests.find(r=>r.id===args[2]&&r.billing_id===args[3]&&r.branch_id===args[4]&&r.status==='approved')
   if(!entry)return [{affectedRows:0}]
   Object.assign(entry,{status:'reversed',reversed_by_admin_id:args[0],reversal_reason:args[1],reversed_at:'synthetic timestamp'});return [{affectedRows:1}]
  }
  return base.query(sql,args)
 }}
 return {state,conn}
}
const input={billingId:6,branchId:1,requestId:5,adminId:8,actorRole:'admin',reason:'Duplicate financial concession'}
test('reversal removes exactly one reduction, preserving promotion, other discount and original approval',async()=>{
 const {state,conn}=fixture();const original={...state.requests[0]}
 state.requests.push({id:6,billing_id:6,branch_id:1,status:'pending',bill_version:1,requested_amount:10})
 state.legacy.push({id:7,billing_id:6,status:'pending',bill_version:1})
 const result=await finance.reverse(input,conn)
 assert.equal(result.total_amount,850);assert.equal(state.bill.discount_amount,150);assert.equal(state.bill.promotion_discount_amount,100);assert.equal(state.bill.version,2)
 for(const key of ['approved_by_admin_id','requester_user_id','requester_role','reason','admin_note'])assert.equal(state.requests[0][key],original[key])
 assert.equal(state.requests[0].status,'reversed');assert.equal(state.requests[0].reversal_reason,input.reason);assert.equal(state.requests[1].bill_version,2)
 assert.equal(state.legacy[0].bill_version,2)
 assert.equal(state.audit.length,1);assert.ok(state.audit[0].includes('billing.charge_adjustment_reversed'));assert.match(state.audit[0].find(v=>typeof v==='string'&&v.includes('explanation')),/Duplicate financial concession/)
 assert.ok(!state.logs.some(sql=>/UPDATE inventory|UPDATE consultations|DELETE FROM|UPDATE billing_payments/i.test(sql)))
 await assert.rejects(finance.reverse(input,conn),{code:'REDUCTION_ALREADY_REVERSED'});assert.equal(state.bill.total_amount,850);assert.equal(state.audit.length,1)
})
for(const actorRole of ['staff','doctor','patient'])test(`${actorRole} cannot reverse`,async()=>{const {state,conn}=fixture();await assert.rejects(finance.reverse({...input,actorRole},conn),{statusCode:403});assert.equal(state.bill.version,1)})
test('consumable reversal preserves another approved reduction and never changes stock',async()=>{
 const {state,conn}=fixture()
 state.requests.push({id:6,billing_id:6,branch_id:1,status:'approved',bill_version:1,target_type:'consumable',inventory_id:7,requested_amount:40,approved_by_admin_id:8})
 Object.assign(state.bill,{discount_amount:390,total_amount:610})
 await finance.reverse({...input,requestId:6,actorRole:'superadmin'},conn)
 assert.equal(state.bill.total_amount,650);assert.equal(state.bill.discount_amount,350);assert.equal(state.requests[0].status,'approved');assert.equal(state.requests[1].status,'reversed');assert.equal(await finance.approvedTotal(conn,6),200)
 assert.ok(!state.logs.some(sql=>/UPDATE inventory|INSERT INTO inventory|DELETE FROM inventory/i.test(sql)))
})
for(const reason of ['',null,{},'tiny','x'.repeat(256)])test('invalid reversal reason is rejected: '+typeof reason+String(reason).slice(0,8),async()=>{const {conn}=fixture();await assert.rejects(finance.reverse({...input,reason},conn),{code:'REVERSAL_REASON_REQUIRED'})})
for(const status of ['ready','partially_paid','paid','voided'])test('bill status '+status+' is locked',async()=>{const {state,conn}=fixture();state.bill.status=status;await assert.rejects(finance.reverse(input,conn),{code:'BILL_LOCKED'});assert.equal(state.bill.version,1)})
test('any payment history, foreign branch, pending requests and inconsistent ledger reject without updates',async()=>{
 for(const scenario of ['payment','branch','pending','ledger']){const {state,conn}=fixture();let code
  if(scenario==='payment'){state.bill.payment_count=1;code='BILL_LOCKED'}
  if(scenario==='pending'){state.requests[0].status='pending';code='REVERSAL_NOT_APPROVED'}
  if(scenario==='ledger'){state.bill.discount_amount=100;code='DISCOUNT_STATE_CONFLICT'}
  if(scenario==='branch')code='BILL_NOT_FOUND'
  await assert.rejects(finance.reverse({...input,branchId:scenario==='branch'?2:1},conn),{code});assert.equal(state.bill.version,1);assert.equal(state.audit.length,0)
 }
})
