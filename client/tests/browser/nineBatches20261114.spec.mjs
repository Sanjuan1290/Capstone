import { test, expect } from '@playwright/test'
import { createRequire } from 'node:module'
import { mockClinic, baseBill } from './helpers/clinic20261111.mjs'
const require=createRequire(import.meta.url)
const {calculateFinancialBill}=require('../../../server/utils/billingCalculation.js')
const policy={enabled:true,tax_name:'VAT',tax_rate:12,tax_mode:'inclusive',version:1,discount_categories:{},rules:[{kind:'service_fee',id:77,treatment:'taxable',statutory_eligible:true},{kind:'inventory',id:7,treatment:'vat_exempt',statutory_eligible:true}]}
function savedBill(){
 const bill=baseBill();bill.items[0].details.pricing.doctor_fee_percentage=20
 Object.assign(bill.items[0].details.materials[0],{charge_quantity:1,charge_unit_price:190})
 const calc=calculateFinancialBill({items:bill.items,policy,discounts:[{key:'promo:1',type:'promotion',name:'Synthetic Promotion',mode:'percentage',value:10}]})
 return {...bill,...calc,financial_calculation:calc,status:'ready',paid_amount:0,balance_amount:calc.total_amount,selected_promotion:null}
}
test.beforeEach(async({page})=>{
 const errors=[];page.on('pageerror',error=>errors.push(error.message));page.errors=errors
 await page.route(/^https?:\/\/(?!127\.0\.0\.1|localhost)/,route=>route.abort())
})
test.afterEach(async({page})=>expect(page.errors).toEqual([]))

for(const role of ['admin','superadmin','staff'])test(`${role}: saved calculation, two payments and transaction-specific receipts`,async({page})=>{
 const bill=savedBill();bill.status='paid';bill.paid_amount=486;bill.balance_amount=0
 bill.payments=[{id:2,amount:386,payment_method:'gcash',reference_number:'ONLINE-EXACT-386',status:'completed',receipt_number:'OR-SECOND',paid_at:'2026-11-14T11:00:00+08:00'},{id:1,amount:100,amount_received:150,change_amount:50,payment_method:'cash',status:'completed',receipt_number:'OR-FIRST',paid_at:'2026-11-14T10:00:00+08:00'}]
 const {root,state}=await mockClinic(page,role,{bill,requests:false})
 await page.goto(`${root}/${role==='staff'?'billing/history':'billing/transactions'}/6`)
 const saved=page.getByRole('region',{name:'Saved bill calculation'})
 await expect(saved).toContainText('Gauze (Included)')
 await expect(saved).toContainText('20% of ₱540.00 = ₱108.00')
 await expect(saved).toContainText('Synthetic Promotion (10%)')
 await expect(saved).toContainText('VAT (12%, inclusive)')
 await expect(saved).toContainText('Total Patient Bill₱486.00')
 await expect(page.getByRole('main',{name:'Bill history'})).not.toContainText(/Clinic.?s Base Share/i)
 for(const receiptNumber of ['OR-FIRST','OR-SECOND']){
  const popup=page.waitForEvent('popup');await page.getByRole('button',{name:'Receipt',exact:true}).nth(receiptNumber==='OR-FIRST'?1:0).click();const receipt=await popup
  await expect(receipt.locator('body')).toContainText("Doctor's Fee")
  await expect(receipt.locator('body')).toContainText('Synthetic Promotion')
  if(receiptNumber==='OR-FIRST'){
   await expect(receipt.locator('.payment-summary')).toContainText('Amount Paid₱100.00')
   await expect(receipt.locator('.payment-summary')).toContainText('Change₱50.00')
   await expect(receipt.locator('.payment-summary')).toContainText('₱386.00')
   if(role==='superadmin')await receipt.pdf({path:'../QA_REPORT/nine-batches-2026-11-14/partial-payment-receipt.pdf',preferCSSPageSize:true,printBackground:true})
  }else{
   await expect(receipt.locator('.payment-summary')).toContainText('Amount Paid₱386.00')
   await expect(receipt.locator('.payment-summary')).not.toContainText(/Change|Cash Received/)
  }
  await receipt.close()
 }
 expect(state.calls.filter(c=>c.method==='POST')).toHaveLength(0)
})

for(const role of ['admin','superadmin','staff'])test(`${role}: partial cash payment uses saved amount and disabled QR stays unavailable`,async({page})=>{
 const {state,checkout}=await mockClinic(page,role,{bill:savedBill(),requests:false})
 await page.goto(checkout)
 await page.getByRole('button',{name:'Cash',exact:true}).click()
 await page.getByRole('checkbox',{name:/Record a partial payment/}).check()
 await page.getByRole('spinbutton',{name:/Current payment amount/i}).fill('100')
 await page.getByRole('spinbutton',{name:'Cash Received',exact:true}).fill('150')
 await expect(page.getByRole('region',{name:'Saved bill calculation'})).toContainText('₱486.00')
 await expect(page.getByRole('button',{name:/Pay with QR|Open QR payment/i})).toHaveCount(0)
 await page.getByRole('button',{name:'Record Payment',exact:true}).click()
 await page.getByRole('button',{name:/Confirm Payment|Confirm and Record|Yes, Record/i}).click()
 await expect.poll(()=>state.calls.filter(c=>c.path.endsWith('/billing/6/pay')).length).toBe(1)
 const body=state.calls.find(c=>c.path.endsWith('/billing/6/pay')).body
 expect(Number(body.payment_amount)).toBe(100);expect(Number(body.amount_received)).toBe(150)
 expect(state.bill.balance_amount).toBe(386)
})

for(const role of ['admin','superadmin','staff'])test(`${role}: service fee preview includes listed item and preserves patient price`,async({page})=>{
 const {root}=await mockClinic(page,role),saved=[]
 await page.route('**/api/**',async route=>{
  const path=new URL(route.request().url()).pathname
  if(path.endsWith('/system-setup'))return route.fulfill({json:{service_categories:[{id:1,name:'Medical Category',clinic_type:'medical',is_active:1}]}})
  if(path.endsWith('/billing/catalog')){
   if(route.request().method()==='POST'){saved.push(route.request().postDataJSON());return route.fulfill({status:201,json:{id:77,...saved[0]}})}
   return route.fulfill({json:[]})
  }
  return route.fallback()
 })
 await page.goto(root+'/system-setup/billing/services/new')
 const fee=page.getByRole('spinbutton',{name:/Doctor's Fee/})
 if(role==='staff')await expect(fee).toBeDisabled()
 else{await fee.fill('101');await page.getByRole('button',{name:'Continue',exact:true}).click();await expect(page.getByText('Enter a percentage from 0 to 100, with at most two decimal places.')).toBeVisible();await fee.fill('20')}
 await page.getByRole('combobox',{name:/^Service Category/}).selectOption('1')
 await page.getByRole('textbox',{name:/^Service Name/}).fill('Synthetic Fee Service')
 await page.getByRole('spinbutton',{name:/Service Price/}).fill('350')
 await page.getByRole('button',{name:'Continue',exact:true}).click()
 await page.getByRole('button',{name:'Add Item',exact:true}).click()
 const inventory=page.getByRole('combobox',{name:'Inventory item 1',exact:true})
 await inventory.selectOption('7')
 await expect(inventory).toHaveValue('7')
 await expect(page.getByText('Patient subtotal remains ₱540.00.')).toBeVisible()
 if(role!=='staff')await expect(page.getByText('20% of ₱540.00 = ₱108.00')).toBeVisible()
 await page.getByRole('button',{name:'Continue',exact:true}).click();await page.getByRole('button',{name:'Add Service',exact:true}).click()
 await expect.poll(()=>saved.length).toBe(1);expect(saved[0].default_price).toBe(540)
 if(role==='staff')expect(saved[0]).not.toHaveProperty('doctor_fee_percentage');else expect(saved[0].doctor_fee_percentage).toBe(20)
})

for(const role of ['admin','superadmin','staff'])test(`${role}: tax settings show only name and percentage and stay branch scoped`,async({page})=>{
 const {root}=await mockClinic(page,role);const saves=[]
 await page.route('**/api/**',async route=>{
  const path=new URL(route.request().url()).pathname
  if(path.endsWith('/billing/settings')){
   if(route.request().method()==='PUT'){saves.push({path,body:route.request().postDataJSON()});return route.fulfill({json:{tax_name:saves[0].body.tax_name,tax_percentage:Number(saves[0].body.tax_percentage),version:2}})}
   return route.fulfill({json:{tax_name:'VAT',tax_percentage:0,version:1}})
  }
  if(path.endsWith('/system-setup'))return route.fulfill({json:{}})
  return route.fallback()
 })
 await page.goto(root+'/system-setup?tab=tax_discounts')
 if(role==='staff'){await expect(page.getByText('Tax settings are managed by authorized Admins.')).toBeVisible();expect(saves).toHaveLength(0);return}
 const settings=page.getByRole('region',{name:'Tax Settings',exact:true})
 await expect(settings.locator('input')).toHaveCount(2)
 await expect(settings.getByRole('combobox')).toHaveCount(0)
 await expect(settings.getByRole('checkbox')).toHaveCount(0)
 await expect(settings).not.toContainText(/Charge Classification|Discount Categories|Authorized Discount Preset|Tax Treatment/)
 await settings.getByRole('textbox',{name:'Tax Name',exact:true}).fill('Clinic VAT')
 await settings.getByRole('spinbutton',{name:'Tax Percentage',exact:true}).fill('12')
 await settings.getByRole('button',{name:'Save Tax Settings',exact:true}).click()
 await expect(settings.getByRole('status')).toHaveText('Tax settings saved.')
 expect(saves[0].body).toEqual({tax_name:'Clinic VAT',tax_percentage:'12',expected_version:1})
 if(role==='superadmin')await settings.screenshot({path:'../QA_REPORT/tax-settings-simplified-2026-11-14/tax-settings.png'})
 expect(saves).toHaveLength(1);expect(saves[0].body.expected_version).toBe(1);expect(saves[0].path).toContain(role==='superadmin'?'/1/':'/my/')
})

for(const finalized of [false,true])test(`doctor: ${finalized?'completed':'draft'} recommendation has only date and note, and never creates a booking`,async({page})=>{
 const {state}=await mockClinic(page,'doctor'),writes=[]
 await page.route('**/api/**',async route=>{
  const path=new URL(route.request().url()).pathname,method=route.request().method()
  if(path.endsWith('/consultations/9'))return route.fulfill({json:{id:11,appointment_id:9,patient_id:4,patient_name:'Test Patient',status:finalized?'finalized':'draft',version:1,type:'medical',requested_service_id:77,requested_service_name_snapshot:'Wound Dressing',prescription:'[]',billing:state.bill,images:[]}})
  if(path.endsWith('/consultations/9/follow-up')){writes.push(route.request().postDataJSON());return route.fulfill({json:{follow_up:{id:1,...writes.at(-1).follow_up,status:'active',version:1}}})}
  if(method==='PUT'&&path.endsWith('/consultations/9/draft')){writes.push(route.request().postDataJSON());return route.fulfill({json:{consultation_version:2,billing:state.bill}})}
  return route.fallback()
 })
 await page.goto('/doctor/consultation?id=9')
 await page.getByRole('button',{name:'Add Recommended Follow-Up',exact:true}).click()
 const editor=page.getByRole('region',{name:'Recommended Follow-Up',exact:true})
 await expect(editor.locator('input,textarea')).toHaveCount(2)
 await editor.getByLabel('Recommended Return Date').fill('2026-11-20');await editor.getByLabel('Doctor’s Note').fill('Return for review.')
 if(finalized){await page.getByRole('button',{name:'Save Recommendation',exact:true}).click();await expect.poll(()=>writes.length).toBe(1);expect(writes[0]).toEqual({follow_up:{return_date:'2026-11-20',doctor_note:'Return for review.'},expected_version:0})}
 else{await expect.poll(()=>writes.some(w=>w.follow_up?.return_date==='2026-11-20'),{timeout:12000}).toBe(true)}
 await editor.getByRole('button',{name:'Remove Recommendation',exact:true}).click();await expect(editor.locator('input,textarea')).toHaveCount(0)
 expect(state.calls.filter(c=>c.method==='POST'&&(/appointments$|\/queue$|\/pay$/.test(c.path)))).toHaveLength(0)
})

test('patient: recommendations filter old/booked dates on dashboard, history retains them, booking stays patient initiated',async({page})=>{
 const {state}=await mockClinic(page,'patient');const rows=[{id:1,appointment_id:9,branch_id:2,status:'active',return_date:'2026-11-20',doctor_note:'Return for review.',doctor_name:'Dr Test',branch_name:'Second Branch',original_date:'2026-11-14'},{id:2,appointment_id:10,branch_id:1,status:'active',return_date:'2020-01-01',doctor_note:'Old recommendation',doctor_name:'Dr Old'},{id:3,branch_id:1,status:'active',return_date:'2026-11-21',doctor_note:'Already booked',booked_appointment_id:12}]
 await page.route('**/api/**',async route=>{
  const path=new URL(route.request().url()).pathname
  if(path.endsWith('/profile-status'))return route.fulfill({json:{is_profile_complete:true,missing_fields:[],onboarding_completed_at:'2026-01-01'}})
  if(path.endsWith('/branches'))return route.fulfill({json:[{id:1,name:'Test Branch'},{id:2,name:'Second Branch'}]})
  if(path.endsWith('/follow-ups'))return route.fulfill({json:rows})
  if(path.endsWith('/settings'))return route.fulfill({json:{id:8,role:'patient',email:'synthetic@example.test',email_verified_at:'2026-01-01',phone_verified_at:'2026-01-01'}})
  if(path.endsWith('/appointments'))return route.fulfill({json:[]})
  if(path.endsWith('/booking-readiness'))return route.fulfill({json:{medical:{bookable:true},derma:{bookable:true}}})
  return route.fallback()
 })
 await page.goto('/patient')
 await page.getByRole('button',{name:'Second Branch',exact:true}).click()
 const upcoming=page.getByRole('region',{name:'Recommended Follow-Up',exact:true})
 await expect(upcoming).toContainText('Return for review.')
 await expect(upcoming).not.toContainText(/Old recommendation|Already booked/)
 await page.getByRole('link',{name:'History',exact:true}).click()
 const cards=page.getByRole('region',{name:'Recommended Follow-Up',exact:true})
 await expect(cards).toContainText('Old recommendation');await expect(cards).toContainText('not a confirmed appointment')
 await cards.getByRole('link',{name:'Book Appointment',exact:true}).first().click()
 await expect(page).toHaveURL(/follow_up_id=2/)
 await page.getByRole('link',{name:'History',exact:true}).click()
 await cards.getByRole('link',{name:'Book Appointment',exact:true}).last().click()
 await expect(page).toHaveURL(/follow_up_id=1/)
 await expect(page.getByRole('combobox').first()).toHaveValue('2')
 expect(state.calls.filter(c=>c.method==='POST'&&c.path.endsWith('/appointments'))).toHaveLength(0)
 await page.screenshot({path:'../QA_REPORT/nine-batches-2026-11-14/patient-followup-booking.png',fullPage:true})
})

for(const failed of [false,true])test(`clinical upload: ${failed?'provider failure is visible':'single validated upload attaches authorization'} without scanner polling`,async({page})=>{
 const {state}=await mockClinic(page,'doctor'),uploads=[],drafts=[]
 await page.route('**/api/**',async route=>{
  const request=route.request(),path=new URL(request.url()).pathname
  if(path.endsWith('/uploads/clinical')){
   uploads.push(request)
   return route.fulfill({status:failed?503:200,json:failed?{message:'Synthetic provider unavailable'}:{status:'uploaded',url:'https://res.cloudinary.com/qa/image/upload/new.png',security_token:'signed-clinical-test-token',asset_id:'synthetic'}})
  }
  if(path.endsWith('/consultations/9/draft')){drafts.push(request.postDataJSON());return route.fulfill({json:{consultation_version:2,billing:state.bill}})}
  return route.fallback()
 })
 await page.goto('/doctor/consultation?id=9')
 await page.locator('input[type="file"]').first().setInputFiles({name:'synthetic.png',mimeType:'image/png',buffer:Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Y9Zl1sAAAAASUVORK5CYII=','base64')})
 if(failed)await expect(page.getByText('Synthetic provider unavailable',{exact:true})).toBeVisible()
 else{
  await expect(page.getByText('Upload complete.',{exact:true})).toBeVisible()
  await expect.poll(()=>drafts.some(d=>d.images?.some(i=>i.security_token==='signed-clinical-test-token')),{timeout:12000}).toBe(true)
 }
 expect(uploads).toHaveLength(1);expect(uploads[0].method()).toBe('POST')
 expect(state.calls.filter(c=>/uploads.*status|scan|bypass/i.test(c.path))).toHaveLength(0)
 await expect(page.getByText(/Security scan passed|Bypass scan|Awaiting scan/)).toHaveCount(0)
})

test('doctor consultation history retains the completed recommendation',async({page})=>{
 await mockClinic(page,'doctor')
 await page.route('**/api/doctor/appointments?*',route=>route.fulfill({json:[{id:9,patient_id:4,patient_name:'Test Patient',appointment_date:'2026-11-14',appointment_time:'10:00',status:'completed',consultation_status:'finalized',clinic_type:'medical',follow_up:{id:1,status:'active',return_date:'2026-11-20',doctor_note:'Review completed treatment.'}}]}))
 await page.goto('/doctor/consultation-history')
 await expect(page.getByText(/Recommended Follow-Up:/)).toContainText('Nov 20, 2026')
 await expect(page.getByText('Review completed treatment.',{exact:true})).toBeVisible()
})

for(const role of ['admin','superadmin','staff'])test(`${role}: internal allocation reporting follows role restrictions`,async({page})=>{
 const {root}=await mockClinic(page,role,{permissions:['dashboard','billing','checkout','reports','inventory','system_setup']})
 const report={rows:[{billing_id:6,branch_name:'Test Branch',doctor_name:'Dr Test',status:'paid',service_name:'Wound Dressing',original_subtotal:540,percentage:20,doctor_fee_amount:108,clinic_base_share:432}],legacy_bills_excluded:2,totals:{patient_bill:486,doctor_fee:108,clinic_base_share:432}},calls=[]
 await page.route('**/api/**',async route=>{
  const path=new URL(route.request().url()).pathname
  if(path.endsWith('/financial-report')||path.endsWith('/financial-allocations')){calls.push(path);return route.fulfill({json:report})}
  return route.fallback()
 })
 await page.goto(role==='superadmin'?'/superadmin/reports':root+'/reports')
 if(role==='superadmin')await page.getByRole('button',{name:'Financial',exact:true}).click()
 const allocation=page.getByRole('region',{name:'Confirmed bill allocations',exact:true})
 if(role==='staff'){await expect(allocation).toHaveCount(0);expect(calls).toHaveLength(0);return}
 await expect(allocation).toContainText('₱108.00');await expect(allocation).toContainText('₱432.00')
 const popup=page.waitForEvent('popup');await allocation.getByRole('button',{name:'Print / Save Allocation PDF',exact:true}).click();const printed=await popup
 await expect(printed.locator('body')).toContainText('Clinic base share')
 await expect(printed.locator('body')).toContainText('₱108.00')
 expect(calls.length).toBeGreaterThan(0);await printed.close()
})

test('patient books from a recommendation only after choosing service, doctor, slot and consent',async({page})=>{
 await page.addInitScript(()=>sessionStorage.setItem('carait:selected-branch:8','1'))
 await mockClinic(page,'patient');const bookings=[],week=['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday'].map(day_of_week=>({day_of_week,is_active:1,start_time:'08:00',end_time:'18:00'}))
 await page.route('**/api/**',async route=>{
  const request=route.request(),url=new URL(request.url()),path=url.pathname,send=json=>route.fulfill({json})
  if(path.endsWith('/branches'))return send([{id:1,name:'Test Branch',is_active:1}])
  if(path.endsWith('/profile-status'))return send({is_profile_complete:true,missing_fields:[],onboarding_completed_at:'2026-01-01'})
  if(path.endsWith('/settings'))return send({id:8,role:'patient',email:'synthetic@example.test',email_verified_at:'2026-01-01',phone_verified_at:'2026-01-01'})
  if(path.endsWith('/appointments')){if(request.method()==='POST'){bookings.push(request.postDataJSON());return send({id:13,message:'Appointment requested.'})}return send([])}
  if(path.endsWith('/booking-readiness'))return send({medical:{bookable:true},derma:{bookable:true}})
  if(path.endsWith('/booking-services'))return send(url.searchParams.get('clinic_type')==='medical'?[{id:77,service_name:'Wound Dressing',clinic_type:'medical',default_price:540,average_duration_minutes:30}]:[])
  if(path.endsWith('/doctors/availability'))return send({doctors:[{id:8,full_name:'Dr Test',clinic_type:'medical',weekly_schedule:week}]})
  if(path.endsWith('/schedule'))return send(week)
  if(path.endsWith('/available-slots'))return send({slots:['10:00 AM']})
  return route.fallback()
 })
 await page.goto('/patient/book?branch_id=1&follow_up_id=5&date=2026-11-20')
 expect(bookings).toHaveLength(0)
 await page.getByRole('button',{name:/Wound Dressing.*540/}).click();await page.getByRole('button',{name:'Continue',exact:true}).click()
 await page.getByRole('button',{name:/Dr Test.*Clinic Assignment/}).click();await page.getByRole('button',{name:'Continue',exact:true}).click()
 await expect(page.getByRole('button',{name:'November 20, 2026',exact:true})).toHaveAttribute('aria-pressed','true')
 await expect(page.getByRole('button',{name:'Continue',exact:true})).toBeDisabled()
 await page.getByRole('button',{name:'10:00 AM',exact:true}).click();await page.getByRole('button',{name:'Continue',exact:true}).click()
 await page.getByRole('button',{name:'Follow up',exact:true}).click();await page.getByRole('checkbox').check()
 await page.getByRole('button',{name:'Request Appointment',exact:true}).click()
 await expect.poll(()=>bookings.length).toBe(1)
 expect(bookings[0]).toMatchObject({follow_up_id:5,branch_id:1,requested_service_id:77,doctor_id:8,appointment_date:'2026-11-20'})
})
