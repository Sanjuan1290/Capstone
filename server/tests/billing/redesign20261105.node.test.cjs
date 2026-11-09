const test=require('node:test'),assert=require('node:assert/strict')
const finance=require('../../utils/chargeAdjustments'),{billingFixture}=require('../helpers/billingFixture.cjs')
const request=(conn,values={})=>finance.request({billingId:6,branchId:1,actorRole:'staff',actorId:4,targetType:'service_fee',serviceId:77,amount:30,reason:'Patient specific courtesy',...values},conn)
const resolve=(conn,id,status='approved',extra={})=>finance.resolve({billingId:6,branchId:1,requestId:id,adminId:8,actorRole:'admin',status,note:status==='rejected'?'Not eligible':'Reviewed clinical request',...extra},conn)
test('three independent requests approve, reject, approve without losing siblings',async()=>{
 const {conn,state}=billingFixture();state.bill.discount_amount=100;state.bill.total_amount=355
 const ids=[await request(conn),await request(conn,{amount:20}),await request(conn,{amount:40})]
 await resolve(conn,ids[0]);assert.deepEqual(state.requests.map(r=>r.status),['approved','pending','pending'])
 await resolve(conn,ids[1],'rejected');await resolve(conn,ids[2])
 assert.deepEqual(state.requests.map(r=>r.status),['approved','rejected','approved']);assert.equal(state.bill.discount_amount,170);assert.equal(state.bill.total_amount,285);assert.equal(state.bill.version,3);assert.equal(state.audit.length,6)
 assert.equal(state.logs.some(s=>/UPDATE inventory|INSERT INTO inventory_logs/.test(s)),false)
})
test('Admin direct adjustment is approved once with mandatory reason and audit',async()=>{
 const {conn,state}=billingFixture();await request(conn,{actorRole:'superadmin',actorId:8,amount:50})
 assert.equal(state.requests[0].status,'approved');assert.equal(state.requests[0].admin_note,'Authorized direct adjustment');assert.equal(state.bill.total_amount,405);assert.equal(state.audit.length,1)
 await assert.rejects(()=>request(conn,{actorRole:'admin',actorId:8,reason:''}),{code:'REASON_REQUIRED'})
})
test('doctor can request from a saved draft but approval waits for completion',async()=>{
 const {conn,state}=billingFixture();state.clinical.status='draft'
 const id=await request(conn,{actorRole:'doctor',actorId:3,allowDraft:true})
 await assert.rejects(()=>resolve(conn,id),{code:'CONSULTATION_NOT_COMPLETED'});assert.equal(state.bill.total_amount,455)
 state.clinical.status='finalized';await resolve(conn,id);assert.equal(state.bill.total_amount,425)
})
test('Doctor and Staff cannot approve, including their own request',async()=>{
 for(const role of ['doctor','staff','patient']){const {conn}=billingFixture();const id=await request(conn);await assert.rejects(()=>resolve(conn,id,'approved',{actorRole:role,adminId:4}),{code:'ADJUSTMENT_FORBIDDEN'})}
})
test('legacy admin self-approval is denied, while an explicit rejection is allowed',async()=>{
 const {conn,state}=billingFixture();const id=await request(conn);Object.assign(state.requests[0],{requester_role:'superadmin',requester_user_id:8})
 await assert.rejects(()=>resolve(conn,id),{code:'SELF_APPROVAL_DENIED'});await resolve(conn,id,'rejected');assert.equal(state.bill.total_amount,455)
})
test('one approved target cannot be reduced twice beyond its charge',async()=>{
 const {conn,state}=billingFixture();const id=await request(conn,{targetType:'consumable',inventoryId:7,amount:35});await resolve(conn,id)
 await assert.rejects(()=>request(conn,{targetType:'consumable',inventoryId:7,amount:6}),{code:'DISCOUNT_EXCEEDS_CHARGE'})
 assert.equal(state.bill.total_amount,420);await assert.rejects(()=>resolve(conn,id),{code:'ADJUSTMENT_RESOLVED'})
})
test('version conflict blocks approval but still permits rejection',async()=>{
 const {conn,state}=billingFixture();const id=await request(conn);state.bill.version++
 await assert.rejects(()=>resolve(conn,id),{code:'ADJUSTMENT_STALE'});await resolve(conn,id,'rejected');assert.equal(state.requests[0].status,'rejected')
})
test('payments and confirmed bills are immutable to charge reductions',async()=>{
 for(const patch of [{status:'ready'},{status:'paid'},{status:'draft',payment_count:1},{paid_at:'2026-11-05'}]){
  const {conn,state}=billingFixture();const id=await request(conn);Object.assign(state.bill,patch)
  await assert.rejects(()=>resolve(conn,id),{code:'BILL_LOCKED'});assert.equal(state.bill.total_amount,455)
 }
})
test('branch mismatch, malformed amounts, and discount overdraw are rejected',async()=>{
 const {conn,state}=billingFixture();await assert.rejects(()=>request(conn,{branchId:2}),{code:'BILL_NOT_FOUND'})
 for(const amount of [0,-1,Infinity,1.001,[],{}])await assert.rejects(()=>request(conn,{amount}),{code:'INVALID_DISCOUNT'})
 state.bill.discount_amount=440;await assert.rejects(()=>request(conn,{amount:20}),{code:'DISCOUNT_EXCEEDS_SUBTOTAL'})
})
test('booked promotion and courtesy are subtracted only once from legacy or explicit discounts',()=>{
 assert.equal(finance.requestedPresetDiscount({discount_amount:135},0,135),0)
 assert.equal(finance.requestedPresetDiscount({discount_amount:175},20,135),20)
 assert.equal(finance.requestedPresetDiscount({preset_discount_amount:20,discount_amount:175},20,135),20)
})

test('requesters can cancel pending requests, without changing the bill or another user request',async()=>{
 const {conn,state}=billingFixture();const id=await request(conn)
 await assert.rejects(()=>finance.cancel({billingId:6,branchId:1,requestId:id,actorRole:'staff',actorId:99},conn),{code:'ADJUSTMENT_FORBIDDEN'})
 await finance.cancel({billingId:6,branchId:1,requestId:id,actorRole:'staff',actorId:4},conn)
 assert.equal(state.requests[0].status,'rejected');assert.equal(state.requests[0].admin_note,'Cancelled by requester');assert.equal(state.bill.total_amount,455)
 await assert.rejects(()=>finance.cancel({billingId:6,branchId:1,requestId:id,actorRole:'staff',actorId:4},conn),{code:'ADJUSTMENT_RESOLVED'})
})

test('reopening a saved bill preserves an existing additional discount and its authorization',async()=>{
 const {resolveDiscountForDraft}=require('../../utils/billingSecurity')
 const savedBill={discount_amount:175,promotion_discount_amount:135,approved_courtesy_discount:20,discount_type:'fixed',discount_label:'Christmas Promo + Courtesy preset + Approved charge reductions',selected_promotion:{title_at_booking:'Christmas Promo'}}
 const executor={query:async()=>[[{id:5,label:'Courtesy preset',discount_type:'fixed',is_active:0,requires_admin_approval:1}]]}
 const existing=await resolveDiscountForDraft({presetId:5,subtotal:385,requestedAmount:20},executor,{savedBill})
 assert.equal(existing.amount,20);assert.equal(existing.preserved,true)
 const removedPreset=await resolveDiscountForDraft({presetId:null,subtotal:385,requestedAmount:20},executor,{savedBill})
 assert.equal(removedPreset.amount,20);assert.equal(removedPreset.label,'Courtesy preset')
 const explicitClear=await resolveDiscountForDraft({presetId:null,subtotal:385,requestedAmount:0},executor,{savedBill})
 assert.equal(explicitClear.amount,0)
 await assert.rejects(()=>resolveDiscountForDraft({presetId:5,subtotal:385,requestedAmount:40},executor,{savedBill}),{statusCode:400})
})
