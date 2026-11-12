const permissions=['dashboard','billing','checkout','appointments','announcements','inventory','system_setup','patient_records','doctor_schedules']
export const baseBill=()=>({id:6,branch_id:1,branch_name:'Test Branch',branch_address:'Branch Address',branch_phone:'09123456789',appointment_id:9,consultation_id:11,consultation_status:'finalized',patient_id:4,patient_name:'Test Patient',doctor_id:8,doctor_name:'Dr Test',appointment_date:'2026-11-05',appointment_time:'10:00',status:'draft',version:1,subtotal:540,discount_amount:135,promotion_discount_amount:135,approved_courtesy_discount:0,total_amount:405,paid_amount:0,balance_amount:405,created_at:'2026-11-05T10:00:00+08:00',services_performed:'Wound Dressing',items:[{id:90,item_type:'service',source_type:'consultation',catalog_service_id:77,service_name:'Wound Dressing',quantity:1,unit_price:540,line_total:540,details:{pricing:{consultation_fee:350,original_price:540},materials:[{inventory_id:7,material_name:'Gauze',quantity:1,unit_label:'unit',charge_total:190}]}}],payments:[],selected_promotion:{id:10,service_id:77,title_at_booking:'Christmas Promo',discount_amount:135,applied_discount_amount:135,base_price_at_booking:540,starts_on_at_booking:'2026-11-01',ends_on_at_booking:'2026-12-31'}})
export async function mockClinic(page,role='admin',options={}){
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
