import {test,expect} from '@playwright/test'
const permissions=['dashboard','billing','checkout','appointments','announcements','inventory','system_setup','patient_records','doctor_schedules']
const baseBill=()=>({id:6,branch_id:1,branch_name:'Test Branch',branch_address:'Branch Address',branch_phone:'09123456789',appointment_id:9,consultation_id:11,consultation_status:'finalized',patient_id:4,patient_name:'Test Patient',doctor_id:8,doctor_name:'Dr Test',appointment_date:'2026-11-05',appointment_time:'10:00',status:'draft',version:1,subtotal:540,discount_amount:135,promotion_discount_amount:135,approved_courtesy_discount:0,total_amount:405,paid_amount:0,balance_amount:405,created_at:'2026-11-05T10:00:00+08:00',services_performed:'Wound Dressing',items:[{id:90,item_type:'service',source_type:'consultation',catalog_service_id:77,service_name:'Wound Dressing',quantity:1,unit_price:540,line_total:540,details:{pricing:{consultation_fee:350,original_price:540},materials:[{inventory_id:7,material_name:'Gauze',quantity:1,unit_label:'unit',charge_total:190}]}}],payments:[],selected_promotion:{id:10,service_id:77,title_at_booking:'Christmas Promo',discount_amount:135,applied_discount_amount:135,base_price_at_booking:540,starts_on_at_booking:'2026-11-01',ends_on_at_booking:'2026-12-31'}})
async function mockClinic(page,role='admin',options={}){
 const state={bill:{...baseBill(),...options.bill},paymentKeys:new Set(),paymentResponseLost:false,requests:[1,2,3].map((id)=>({id,billing_id:6,branch_id:1,bill_version:1,target_type:'service_fee',catalog_service_id:77,inventory_id:null,requested_amount:10*id,reason:`Courtesy request ${id}`,requester_role:'doctor',requester_user_id:3,status:'pending'})),calls:[],read:false}
 if(options.requests===false)state.requests=[]
 const root=role==='superadmin'?'/superadmin/branches/1':`/${role}`
 const checkout=`${root}/${role==='staff'?'checkout':'billing/checkout'}/6`
 await page.route('**/api/**',async route=>{
  const request=route.request(),url=new URL(request.url()),path=url.pathname,method=request.method()
  let body;try{body=request.postDataJSON()}catch{}
  state.calls.push({path,method,body,headers:request.headers()})
  const send=(data,status=200)=>route.fulfill({status,json:data})
  if(path.endsWith('/check-auth'))return send({authenticated:true,user:{id:8,full_name:'Test User',role:role==='superadmin'?'admin':role,account_role:role,branch_id:1,branch_name:'Test Branch',permissions:options.permissions||permissions,branches:[{id:1,name:'Test Branch'}],must_change_password:false}})
  if(path==='/api/branches/me')return send({branch_id:1,branch_name:'Test Branch',permissions:options.permissions||permissions})
  if(path==='/api/branches'||path==='/api/branches/')return send([{id:1,name:'Test Branch',is_active:1}])
  if(path.includes('/stream'))return route.fulfill({status:200,contentType:'text/event-stream',body:'retry: 60000\n\n'})
  if(path.endsWith('/clinic-settings'))return send({clinic_name:'Test Branch',receipt_title:'Clinic Receipt'})
  if(path.endsWith('/notifications/4/destination'))return options.deleted?send({message:'This record was deleted or is no longer available.'},410):send({path:checkout})
  if(path.endsWith('/notifications/4/read')){await new Promise(r=>setTimeout(r,100));state.read=true;return send({success:true})}
  if(path.endsWith('/notifications'))return send({items:[{id:4,title:'Bill ready for review',message:'Billing #6 is ready.',reference_type:'billing_record',reference_id:6,branch_id:1,is_read:state.read?1:0,created_at:'2026-11-05T10:00:00+08:00'}],unread:state.read?0:1})
  if(/charge-adjustments\/\d+$/.test(path)){
   const id=Number(path.split('/').at(-1)),entry=state.requests.find(r=>r.id===id)
   if(method==='PATCH'){entry.status=body.status;if(body.status==='approved'){state.bill.discount_amount+=entry.requested_amount;state.bill.approved_courtesy_discount+=entry.requested_amount;state.bill.total_amount-=entry.requested_amount;state.bill.balance_amount=state.bill.total_amount;state.bill.version++}return send({status:entry.status})}
   if(method==='DELETE'){entry.status='rejected';entry.admin_note='Cancelled by requester';return send({status:'rejected'})}
  }
  if(path.endsWith('/charge-adjustments')){
   if(method==='POST'){const direct=['admin','superadmin'].includes(role);if(direct){state.bill.discount_amount+=Number(body.amount);state.bill.approved_courtesy_discount+=Number(body.amount);state.bill.total_amount-=Number(body.amount);state.bill.balance_amount=state.bill.total_amount;state.bill.version++}state.requests.push({id:state.requests.length+1,...body,requester_role:role,requester_user_id:8,status:direct?'approved':'pending'});return send({id:state.requests.length,message:direct?'Applied':'Pending Billing Approval'},201)}
   return send({bill:state.bill,targets:[{target_type:'service_fee',catalog_service_id:77,inventory_id:null,label:'Wound Dressing — Service Fee',original_charge:350}],requests:state.requests,can_adjust_directly:['admin','superadmin'].includes(role),actor:{role,id:8}})
  }
  if(path.endsWith('/history')&&path.includes('/billing/6/'))return send({...state.bill,chargeRequests:state.requests,discountRequests:[],refunds:[],attempts:[{id:1,status:'cancelled',amount_centavos:40500,created_at:'2026-11-05T09:00:00+08:00'},{id:2,status:'expired',amount_centavos:40500,created_at:'2026-11-05T09:30:00+08:00'}],timeline:[{key:'created',at:'2026-11-05T10:00:00+08:00',label:'Bill created'}]})
  if(path.endsWith('/billing/cashier-closing'))return send({expected_cash:100,transactions:1,non_cash_collected:0,cash_refunds:0,closing:method==='POST'?{status:'closed',actual_cash:body.actual_cash,variance:body.actual_cash-100}:null})
  if(path.endsWith('/adjustment-requests')||path.endsWith('/discount-presets'))return send([])
  if(path.endsWith('/payment-settings'))return send({cash_enabled:1})
  if(path.endsWith('/qr-payment/status'))return send({status:'none',current_mode:'test',enabled:true,can_collect_alternate:true})
  if(path.endsWith('/finalize-preview'))return send({billing_id:6,version:state.bill.version,total_amount:state.bill.total_amount,charge_count:1,supply_count:0,supplies:[],pending_requests:state.requests.filter(r=>r.status==='pending').length,can_finalize:!state.requests.some(r=>r.status==='pending'),consultation_completed:true})
  if(path.endsWith('/billing/6/pay')&&method==='POST'){
   if(!state.paymentKeys.has(body.idempotency_key)){
    state.paymentKeys.add(body.idempotency_key)
    state.bill.paid_amount+=Number(body.payment_amount);state.bill.balance_amount=state.bill.total_amount-state.bill.paid_amount;state.bill.status=state.bill.balance_amount>0?'partially_paid':'paid';state.bill.version++
    state.bill.payments.unshift({id:state.paymentKeys.size,amount:Number(body.payment_amount),payment_method:'cash',status:'completed',refund_amount:0,receipt_number:`OR-TEST-${state.paymentKeys.size}`,paid_at:'2026-11-05T11:00:00+08:00'})
   }
   if(options.losePaymentResponse&&!state.paymentResponseLost){state.paymentResponseLost=true;return route.abort('failed')}
   return send(state.bill)
  }
  if(path.endsWith('/billing/6'))return send(state.bill)
  if(path.endsWith('/billing')||path.endsWith('/billing/')){
   let bill=state.bill
   if(url.searchParams.get('payment_view')==='failed')bill={...bill,status:'ready',attempt_status:'failed',failure_reason:'PAYMENT_DECLINED',attempt_date:'2026-11-05T10:00:00+08:00'}
   if(url.searchParams.get('payment_view')==='paid')bill={...bill,status:'paid',paid_amount:405,balance_amount:0,payment_methods:['cash'],latest_paid_at:'2026-11-05T11:00:00+08:00',receipt_numbers:'OR-TEST-6'}
   return send({items:[bill],pagination:{page:1,totalPages:1,total:1}})
  }
  if(path.endsWith('/billing/catalog')||path.endsWith('/appointments/booking-services'))return send([{id:77,service_name:'Wound Dressing',default_price:540,consultation_fee:350,materials:[{inventory_id:7,quantity:1,material_name:'Gauze',unit_label:'unit'}]}])
  if(path.endsWith('/inventory'))return send([{id:7,name:'Gauze',uom:'unit',unit:'unit',selling_price:190,uom_allow_decimal:0}])
  if(path.endsWith('/consultations/9/draft'))return send({consultation_version:2,billing:state.bill})
  if(path.endsWith('/consultations/9'))return send({id:11,appointment_id:9,patient_id:4,patient_name:'Test Patient',doctor_name:'Dr Test',status:'draft',version:1,type:'medical',requested_service_id:77,requested_service_name_snapshot:'Wound Dressing',requested_service_price_snapshot:540,promotion_discount_amount_snapshot:135,prescription:'[]',billing:state.bill,images:[]})
  if(path.includes('/patients')&&url.searchParams.has('search'))return send([{id:4,full_name:'Test Patient',phone:'09123456789'}])
  if(path.endsWith('/walk-in/doctors'))return send([{id:8,full_name:'Dr Test',clinic_type:'medical',available_now:true}])
  if(path.includes('/queue/precheck/'))return send({active_queue:null,today_appointment:null})
  if(path.endsWith('/queue')&&method==='POST')return send({id:12,queue_number:1,appointment_id:10,message:'Patient checked in.'},201)
  if(path.endsWith('/appointment-reasons'))return send([{id:1,label:'Follow up',is_active:1,clinic_type:'medical'}])
  if(path.endsWith('/doctors'))return send([{id:8,full_name:'Dr Test',clinic_type:'medical',is_active:1}])
  if(path.endsWith('/schedules'))return send(['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday'].map(day_of_week=>({day_of_week,is_active:1,start_time:'08:00',end_time:'18:00'})))
  if(path.endsWith('/available-slots'))return send({slots:['10:00','11:00']})
  if(path.endsWith('/unavailable-dates'))return send([])
  if(path.endsWith('/appointments')&&method==='POST')return send({id:10,message:'Appointment created.'},201)
  if(path.endsWith('/appointments'))return send([{id:9,patient_name:'Test Patient',doctor_name:'Dr Test',appointment_date:'2026-11-05',appointment_time:'10:00',status:'confirmed'}])
  return send(path.endsWith('/dashboard')?{}:[])
 })
 return {state,root,checkout}
}
for(const role of ['admin','superadmin','staff'])test(`${role}: two billing tabs and accurate payment filters`,async({page})=>{
 const {state,root}=await mockClinic(page,role)
 await page.goto(`${root}/${role==='staff'?'checkout':'billing'}`)
 const nav=page.getByRole('navigation',{name:'Billing',exact:true})
 await expect(nav.getByRole('link',{name:'Payments',exact:true})).toBeVisible();await expect(nav.getByRole('link',{name:'Receipts & History',exact:true})).toBeVisible()
 await expect(page.getByRole('button',{name:'Pending Payments',exact:true})).toBeVisible()
 await page.getByRole('button',{name:'Failed Payments',exact:true}).click();await expect(page.getByText(/QR Ph failed: PAYMENT_DECLINED/)).toBeVisible()
 await page.getByRole('button',{name:'Paid Payments',exact:true}).click();await expect(page.getByText(/Receipt: OR-TEST-6/)).toBeVisible()
 await expect(page.getByRole('link',{name:'View Receipt',exact:true})).toBeVisible()
 expect(state.calls.some(c=>c.path.endsWith('/billing'))).toBeTruthy()
 if(role==='staff'){await expect(page.getByRole('link',{name:'Reconciliation & End-of-Day Cash',exact:true})).toHaveCount(0);await expect(page.getByRole('link',{name:'Additional Discount Approvals',exact:true})).toHaveCount(0)}
})
for(const role of ['admin','superadmin'])test(`${role}: three requests resolve independently in shared checkout`,async({page})=>{
 const {state,checkout}=await mockClinic(page,role);page.on('dialog',dialog=>dialog.accept('Not eligible'))
 await page.goto(checkout);await page.getByRole('button',{name:/Continue to Confirm Bill/}).click()
 await expect(page.getByRole('heading',{name:'Charge Reductions'})).toBeVisible()
 await expect(page.getByRole('button',{name:'Approve',exact:true})).toHaveCount(3)
 await page.getByRole('button',{name:'Approve',exact:true}).first().click();await expect.poll(()=>state.requests[0].status).toBe('approved')
 await expect(page.getByRole('button',{name:'Approve',exact:true})).toHaveCount(2)
 await page.getByRole('button',{name:'Reject',exact:true}).first().click();await expect.poll(()=>state.requests[1].status).toBe('rejected')
 await page.getByRole('button',{name:'Approve',exact:true}).first().click();await expect.poll(()=>state.requests[2].status).toBe('approved')
 await expect(page.getByRole('button',{name:'Approve',exact:true})).toHaveCount(0)
 expect(state.bill.total_amount).toBe(365)
 await page.reload();await page.getByRole('button',{name:/Continue to Confirm Bill/}).click();expect(state.requests).toHaveLength(3)
 await expect(page.getByText('Service after promotion: ₱405.00')).toBeVisible();await expect(page.getByRole('option',{name:'No Additional Discount'})).toBeAttached()
})
test('Staff sees pending requests without approval controls',async({page})=>{
 const {checkout}=await mockClinic(page,'staff');await page.goto(checkout);await page.getByRole('button',{name:/Continue to Confirm Bill/}).click()
 await expect(page.getByRole('heading',{name:'Charge Reductions'})).toBeVisible();await expect(page.getByRole('button',{name:'Approve',exact:true})).toHaveCount(0);await expect(page.getByRole('button',{name:'Reject',exact:true})).toHaveCount(0)
})
test('notification navigation waits for read acknowledgement and keeps Super Admin branch',async({page})=>{
 const {state,root,checkout}=await mockClinic(page,'superadmin');await page.goto(`${root}/billing`)
 await page.getByRole('button',{name:/Notifications/}).click();await page.getByRole('button',{name:'Bill ready for review: Billing #6 is ready.'}).click()
 await expect(page).toHaveURL(new RegExp(checkout+'$'));expect(state.read).toBe(true)
 await expect(page.getByText('Bill Checkout',{exact:true})).toBeVisible();expect(await page.evaluate(()=>sessionStorage.getItem('auth_role'))).toBe('superadmin')
})
test('deleted notification stays in its portal with an actionable error',async({page})=>{
 const {root,state}=await mockClinic(page,'admin',{deleted:true});await page.goto(`${root}/billing`);await page.getByRole('button',{name:/Notifications/}).click();await page.getByRole('button',{name:'Bill ready for review: Billing #6 is ready.'}).click()
 await expect(page.getByRole('alert')).toContainText('deleted');await expect(page).toHaveURL(/\/admin\/billing$/);expect(state.read).toBe(false)
})
test('dedicated history retains cancelled and expired attempts and receipt details',async({page})=>{
 const {root}=await mockClinic(page,'admin');await page.goto(`${root}/billing/transactions/6`)
 await expect(page.getByRole('heading',{name:'Activity Timeline'})).toBeVisible();await expect(page.getByText(/#1 · cancelled/)).toBeVisible();await expect(page.getByText(/#2 · expired/)).toBeVisible()
})
test('Doctor quantity validation and request-only reduction flow',async({page})=>{
 const {state}=await mockClinic(page,'doctor',{requests:false});await page.goto('/doctor/consultation?id=9')
 const panel=page.getByRole('region',{name:'Request charge reduction'})
 await expect(panel).toBeVisible();await expect(panel.getByRole('button',{name:/Approve|Reject/})).toHaveCount(0)
 const quantity=page.getByRole('spinbutton',{name:'Quantity Used for Gauze'})
 await expect(quantity).toHaveAttribute('step','1');await quantity.fill('1.09');await expect(page.getByText('Use a positive whole number.')).toBeVisible();await quantity.fill('2')
 await expect(page.getByText('Estimated patient charge: ₱405.00')).toBeVisible()
 await panel.getByRole('combobox').selectOption('service_fee:77:0');await panel.getByRole('spinbutton').fill('20');await panel.getByRole('textbox').fill('Patient courtesy request');await panel.getByRole('button',{name:'Submit Request',exact:true}).click()
 await expect(panel.getByRole('status')).toHaveText('Pending Billing Approval');expect(state.requests.at(-1).status).toBe('pending');expect(state.calls.some(c=>c.method==='PATCH'&&c.path.includes('charge-adjustments'))).toBe(false)
})

for(const role of ['admin','superadmin','staff'])test(`${role}: walk-in submission sends only visit data once`,async({page})=>{
 const {root,state}=await mockClinic(page,role)
 await page.goto(`${root}/appointments/new`)
 await page.getByRole('button',{name:/Walk-in Now/}).click()
 await page.getByPlaceholder('Search by name or phone').fill('Test')
 await page.getByRole('button',{name:/Test Patient.*09123456789/}).click()
 await page.getByRole('button',{name:'Continue',exact:true}).click()
 await page.getByRole('button',{name:'General Medicine',exact:true}).click()
 await page.getByRole('button',{name:/Dr Test.*Available for walk-ins/}).click()
 await page.getByRole('button',{name:'Follow up',exact:true}).click()
 await page.getByRole('button',{name:'Continue',exact:true}).click()
 await page.getByRole('checkbox').check()
 await page.getByRole('button',{name:'Check In Patient',exact:true}).click()
 await expect.poll(()=>state.calls.filter(c=>c.path.endsWith('/queue')&&c.method==='POST').length).toBe(1)
 const submitted=state.calls.find(c=>c.path.endsWith('/queue')&&c.method==='POST').body
 expect(submitted).toEqual({patient_id:4,patient_name:'Test Patient',doctor_id:8,type:'medical',reason:'Follow up'})
 await expect(page.getByRole('heading',{name:/Patient Checked In|Walk-in Checked In|Checked In|Patient is checked in/i})).toBeVisible()
})

test('lost partial payment response retries the same key and preserves the remaining balance',async({page})=>{
 const {state,checkout}=await mockClinic(page,'staff',{requests:false,bill:{status:'ready'},losePaymentResponse:true})
 await page.goto(checkout)
 await page.getByRole('button',{name:'Cash',exact:true}).click();await page.getByLabel('Payment Amount',{exact:true}).fill('100')
 await page.getByRole('button',{name:'Confirm Payment ₱100.00',exact:true}).click()
 const confirmation=page.getByRole('dialog')
 await confirmation.getByRole('button',{name:'Confirm Payment ₱100.00',exact:true}).click()
 await expect.poll(()=>state.paymentResponseLost).toBe(true)
 await expect(confirmation.getByRole('button',{name:'Confirm Payment ₱100.00',exact:true})).toBeEnabled()
 await confirmation.getByRole('button',{name:'Confirm Payment ₱100.00',exact:true}).click()
 await expect.poll(()=>state.calls.filter(c=>c.path.endsWith('/billing/6/pay')).length).toBe(2)
 const calls=state.calls.filter(c=>c.path.endsWith('/billing/6/pay'))
 expect(calls[0].body.idempotency_key).toBe(calls[1].body.idempotency_key)
 expect(state.paymentKeys.size).toBe(1);expect(state.bill.balance_amount).toBe(305)
 await page.reload();await expect(page.getByText('₱305.00',{exact:true}).first()).toBeVisible();expect(state.paymentKeys.size).toBe(1)
})
test('a paid bill opens its saved receipt with the promotion total',async({page})=>{
 const payment={id:1,amount:405,payment_method:'cash',status:'completed',refund_amount:0,receipt_number:'OR-TEST-PAID',paid_at:'2026-11-05T11:00:00+08:00'}
 const {root}=await mockClinic(page,'staff',{requests:false,bill:{status:'paid',paid_amount:405,balance_amount:0,payments:[payment]}})
 await page.goto(`${root}/billing/history/6`)
 const popup=page.waitForEvent('popup');await page.getByRole('button',{name:'View Receipt',exact:true}).click();const receipt=await popup
 await expect(receipt.locator('body')).toContainText('OR-TEST-PAID');await expect(receipt.locator('body')).toContainText('Branch Address');await expect(receipt.locator('body')).toContainText('₱405.00');await expect(receipt.locator('body')).toContainText('₱135.00')
})

for(const role of ['admin','superadmin','staff'])test(`${role}: scheduled manual booking never serializes its button event`,async({page})=>{
 const {root,state}=await mockClinic(page,role)
 await page.goto(`${root}/appointments/new`);await page.getByPlaceholder('Search by name or phone').fill('Test');await page.getByRole('button',{name:/Test Patient.*09123456789/}).click();await page.getByRole('button',{name:'Continue',exact:true}).click()
 await page.getByRole('button',{name:/Wound Dressing/}).first().click();await page.getByRole('button',{name:'Continue',exact:true}).click();await page.getByRole('button',{name:/Dr Test/}).click();await page.getByRole('button',{name:'Continue',exact:true}).click()
 await page.getByRole('button',{name:'Next month',exact:true}).click();await page.getByRole('button',{name:/^[A-Z][a-z]+ \d{1,2}, \d{4}$/}).first().click();await page.getByRole('button',{name:'10:00',exact:true}).click();await page.getByRole('button',{name:'Continue',exact:true}).click()
 await page.getByRole('button',{name:'Follow up',exact:true}).click();await page.getByRole('checkbox').check();await page.getByRole('button',{name:'Create Appointment',exact:true}).click()
 await expect(page.getByRole('heading',{name:'Appointment request created',exact:true})).toBeVisible()
 const calls=state.calls.filter(c=>c.path.endsWith('/appointments')&&c.method==='POST');expect(calls).toHaveLength(1);expect(calls[0].body.override_no_show_warning).toBe(false);expect(calls[0].body.patient_id).toBe(4);expect(calls[0].body.doctor_id).toBe(8);expect(calls[0].body.requested_service_id).toBe(77);expect(calls[0].body.appointment_time).toBe('10:00')
})

test('billing-only Staff can view bills without checkout, cash tools, or Admin actions',async({page})=>{
 await mockClinic(page,'staff',{permissions:['billing']});await page.goto('/staff/billing')
 await expect(page.getByRole('heading',{name:'Payments',exact:true})).toBeVisible()
 await expect(page.getByRole('link',{name:'Open Bill',exact:true})).toHaveCount(0)
 await expect(page.getByText('Admin Tools',{exact:true})).toHaveCount(0)
 await page.getByRole('link',{name:'Bill Details & History',exact:true}).click()
 await expect(page.getByRole('heading',{name:'Activity Timeline'})).toBeVisible()
})
test('mobile billing tabs and checkout fit the available viewport',async({page})=>{
 await page.setViewportSize({width:390,height:844})
 const {root,checkout}=await mockClinic(page,'admin');await page.goto(`${root}/billing`)
 await expect(page.getByRole('button',{name:'Pending Payments',exact:true})).toBeVisible()
 expect(await page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth+1)).toBe(true)
 await page.goto(checkout);await page.getByRole('button',{name:/Continue to Confirm Bill/}).click()
 await expect(page.getByRole('heading',{name:'Charge Reductions'})).toBeVisible()
 expect(await page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth+1)).toBe(true)
 await page.evaluate(()=>{document.querySelectorAll('main').forEach(element=>element.scrollTop=0)})
 await page.screenshot({path:'../docs/fix-2026-11-05/evidence/mobile-checkout.png',fullPage:true,animations:'disabled'})
})


test('Admin applies a clearly labelled direct reduction with reason and confirmation',async({page})=>{
 const {state,checkout}=await mockClinic(page,'admin',{requests:false});await page.goto(checkout);await page.getByRole('button',{name:/Continue to Confirm Bill/}).click()
 const panel=page.getByRole('region',{name:'Adjust service and consumable charges'})
 await expect(panel.getByRole('button',{name:'Apply Direct Reduction',exact:true})).toBeDisabled()
 await panel.getByRole('combobox').selectOption('service_fee:77:0');await panel.getByRole('spinbutton').fill('20');await panel.getByRole('textbox').fill('Patient courtesy adjustment')
 page.once('dialog',dialog=>dialog.accept());await panel.getByRole('button',{name:'Apply Direct Reduction',exact:true}).click()
 await expect.poll(()=>state.bill.total_amount).toBe(385);expect(state.requests).toHaveLength(1);expect(state.requests[0].status).toBe('approved')
 await expect(panel.getByRole('button',{name:'Approve',exact:true})).toHaveCount(0)
})

test('Staff retains permission to close only their own cash drawer inside collapsed tools',async({page})=>{
 const {state}=await mockClinic(page,'staff',{permissions:['checkout']});await page.goto('/staff/checkout')
 expect(state.calls.some(call=>call.path.endsWith('/cashier-closing'))).toBe(false)
 await page.getByText('Admin Tools',{exact:true}).click();await expect(page.getByRole('heading',{name:'Your End-of-Day Cash Drawer'})).toBeVisible()
 await page.getByRole('button',{name:'Close My Drawer',exact:true}).click();await page.getByRole('spinbutton',{name:'Counted cash *',exact:true}).fill('100');await page.getByRole('button',{name:'Close Drawer',exact:true}).click()
 await expect(page.getByText('Closed',{exact:true})).toBeVisible()
 const requests=state.calls.filter(call=>call.path.endsWith('/cashier-closing')&&call.method==='POST');expect(requests).toHaveLength(1);expect(requests[0].body).toEqual({actual_cash:100,notes:null})
 await expect(page.getByRole('link',{name:'Reconciliation & End-of-Day Cash',exact:true})).toHaveCount(0)
})
