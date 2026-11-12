import test from 'node:test'
import assert from 'node:assert/strict'
import {readFileSync} from 'node:fs'
import {selectBookingPrice,eligibleBookingPromotions} from '../src/utils/patientBookingFlow.mjs'

const read = path => readFileSync(new URL(path,import.meta.url),'utf8')
const booking=read('../src/pages/patientPage/BookAppointment.jsx')
const adminLayout=read('../src/components/layouts/AdminLayout.jsx')
const staffLayout=read('../src/components/layouts/StaffLayout.jsx')
const doctorLayout=read('../src/components/layouts/DoctorLayout.jsx')
const superLayout=read('../src/pages/superAdminPage/BranchPortals.jsx')
const portalService=read('../src/services/portal.service.js')
const serverBilling=read('../../server/utils/billing.js')
const promotionEngine=read('../../server/utils/billingServicePromotions.js')
const staffBilling=read('../../server/controllers/staff.controller.js')
const patientBooking=read('../../server/controllers/patient.controller.js')

test('booking service and dashboard quote agree: 25% off 600 = 450',()=>{
 const service={id:44,default_price:600}
 const promotions=[{id:5,branch_id:1,service_ids:[44],is_active:1,starts_on:'2026-11-01',ends_on:'2026-12-31',discount_type:'percentage',discount_value:25,title:'Christmas Promo'}]
 const selected=selectBookingPrice(service,promotions,{branchId:1,date:'2026-11-05'})
 assert.equal(selected.promotion.title,'Christmas Promo')
 assert.deepEqual(selected.quote,{original:600,discount:150,current:450})
 assert.equal(selectBookingPrice(service,promotions,{branchId:2,date:'2026-11-05'}).promotion,null)
 assert.equal(selectBookingPrice(service,promotions,{branchId:1,date:'2027-01-01'}).promotion,null)
 assert.equal(selectBookingPrice({...service,id:45},promotions,{branchId:1,date:'2026-11-05'}).promotion,null)
})
test('best eligible offer uses largest savings and a deterministic tie break',()=>{
 const base={branch_id:1,service_ids:[44],is_active:1,starts_on:'2026-11-01',ends_on:'2026-12-31'}
 const promo=[{...base,id:3,title:'small',discount_type:'fixed',discount_value:15},{...base,id:4,title:'large',discount_type:'percentage',discount_value:20}]
 assert.equal(selectBookingPrice({id:44,default_price:200},promo,{branchId:1,date:'2026-11-05'}).promotion.id,4)
 assert.deepEqual(eligibleBookingPromotions(promo,{branchId:1,serviceId:44,date:'2026-11-05'}).map(p=>p.id),[3,4])
})
test('server-calculated current offer can display while offers are still loading, but cannot book from fallback',()=>{
 const svc={id:44,default_price:600,current_offer:{id:5,title:'Christmas Promo',discount_type:'percentage',discount_value:25,quote:{original:600,discount:150,current:450}}}
 assert.equal(selectBookingPrice(svc,[],{branchId:1,date:'2026-11-05',fallbackCurrentOffer:true}).quote.current,450)
 assert.equal(selectBookingPrice(svc,[],{branchId:1,date:'2026-12-31'}).promotion,null)
})
test('all four booking screens and confirmation display promotion price or selected date rules',()=>{
 for(const marker of ['preview.quote?.discount > 0','<BookingPriceNotice service={service} promotion={promotion} />','<BookingPriceNotice service={service} promotion={promotion} date={date} />','<StepReview form={{...form,branchId}}','selectedPromotion={selectedPromotion} />','Expected discounted service price'])assert.ok(booking.includes(marker),marker)
 assert.match(booking,/selectedPromotionId && !effective.some/)
 assert.match(booking,/promotion_id: selectedPromotionId \|\| undefined/)
 assert.match(booking,/\['Expected Service Price',form.service \? \(hasDiscount \? peso\(quote.current\)/)
})
test('all role headers expose a persistent notification bell, including branch admin and central superadmin',()=>{
 assert.match(adminLayout,/<NotificationBell role=\{superBranch \? "superadmin" : "admin"\} \/>/)
 assert.doesNotMatch(adminLayout,/!branch && <NotificationBell/)
 assert.match(staffLayout,/<NotificationBell role="staff" \/>/)
 assert.match(doctorLayout,/<NotificationBell role="doctor" \/>/)
 assert.match(superLayout,/<NotificationBell role=\{superMode \? "superadmin" : "admin"\} \/>/)
 assert.match(portalService,/role === 'admin' && path.startsWith\('\/notifications'\)/)
 assert.match(portalService,/role === 'superadmin' \? 'admin'/)
})
test('backend snapshots discounts at booking and charges them once in consultation and staff checkout',()=>{
 for(const item of ['resolveSelectedPromotion(executor','promotion_discount_amount_snapshot','promotion_discount_type_snapshot'])assert.ok(patientBooking.includes(item),item)
 for(const item of ['promotion_selected_for_service_id','promotion_discount_amount_snapshot','promotion_discount_amount=?','selected_promotion:'])assert.ok(serverBilling.includes(item),item)
 assert.match(promotionEngine,/item\.source_type==='consultation'/)
 assert.match(serverBilling,/Math\.max\(0,Number\(existing\.discount_amount\|\|0\)-Number\(existing\.promotion_discount_amount\|\|0\)\)\+promotionDiscount/)
 assert.match(staffBilling,/const combinedDiscount=toMoney\(discount.amount\+courtesyTotal\+promotionDiscount\)/)
 assert.match(staffBilling,/discount_amount = \?,promotion_discount_amount=\?/)
})

