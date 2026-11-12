const test=require('node:test')
const assert=require('node:assert/strict')
const fs=require('node:fs')
const path=require('node:path')
const {resolveSelectedPromotion,isEligiblePatient}=require('../../utils/promotionEligibility')
const {applyServicePromotions,listEligiblePromotions}=require('../../utils/billingServicePromotions')
const root=path.resolve(__dirname,'../../..')
const today='2026-11-12'
const base={id:15,branch_id:3,title:'Exclusive Offer',description:'For verified patients',badge_text:'Special',is_active:1,discount_type:'percentage',discount_value:20,eligibility_type:'verified',starts_on:'2026-11-12',ends_on:'2026-11-30'}
const executor=(registered,{promotion=base,log=[]}={})=>({query:async(sql,params)=>{
 log.push({sql,params})
 if(sql.includes('FROM clinic_promotions WHERE'))return [[promotion]]
 if(sql.includes('SELECT id FROM patients'))return [[registered?{id:11}:undefined]]
 if(sql.includes('SELECT ps.service_id'))return [[{service_id:7}]]
 if(sql.includes('FROM clinic_promotions p'))return [[{...promotion,service_id:7}]]
 throw new Error('Unexpected test SQL '+sql)
}})
const selected={promotionId:15,branchId:3,serviceId:7,patientId:11,appointmentDate:today,servicePrice:1200,today}
test('a registered patient can claim a 20% promotion without email verification',async()=>{
 const result=await resolveSelectedPromotion(executor(true),selected)
 assert.equal(result.discount_amount,240)
 assert.equal(result.eligibility_type,'verified')
})
test('only guest or unregistered patients cannot claim a promotion',async()=>{
 await assert.rejects(resolveSelectedPromotion(executor(false),selected),{code:'PROMOTION_ACCOUNT_REQUIRED'})
 await assert.rejects(resolveSelectedPromotion(executor(false),{...selected,patientId:null}),{code:'PROMOTION_ACCOUNT_REQUIRED'})
})
test('all discount types still require a registered patient account',async()=>{
 await assert.rejects(resolveSelectedPromotion(executor(false,{promotion:{...base,eligibility_type:'all'}}),selected),{code:'PROMOTION_ACCOUNT_REQUIRED'})
})
test('checkout offers check registered account rather than email verification',async()=>{
 const log=[]
 const offers=await listEligiblePromotions(executor(true,{log}),3,today,[7],11)
 assert.equal(offers.length,1)
 assert.doesNotMatch(log[0].sql,/email_verified_at/)
 assert.doesNotMatch(log[0].sql,/phone_verified_at/)
 assert.match(log[0].sql,/pv.password IS NOT NULL/)
 assert.equal(log[0].params.at(-1),11)
})
test('booked discount cannot be finalized after portal account is removed',async()=>{
 const appointment={appointment_date:today,patient_id:11,promotion_selected_for_service_id:7,promotion_id:15,promotion_discount_amount_snapshot:240,promotion_eligibility_snapshot:'verified'}
 const item={item_type:'service',source_type:'consultation',catalog_service_id:7,line_total:1200,service_name:'Service',details_json:'{}'}
 await assert.rejects(applyServicePromotions([item],appointment,executor(false),3),{code:'PROMOTION_ACCOUNT_REQUIRED'})
})
test('legacy public booked discounts still require a registered account',async()=>{
 const appointment={appointment_date:today,patient_id:11,promotion_selected_for_service_id:7,promotion_id:15,promotion_discount_amount_snapshot:240,promotion_eligibility_snapshot:'all'}
 const item={item_type:'service',source_type:'consultation',catalog_service_id:7,line_total:1200,service_name:'Service',details_json:'{}'}
 await assert.rejects(applyServicePromotions([item],appointment,executor(false),3),{code:'PROMOTION_ACCOUNT_REQUIRED'})
})
test('migration defaults existing offers and booking snapshots to public',()=>{
 const sql=fs.readFileSync(path.join(root,'server/db/migrations/2026-11-12-promotion-verified-eligibility.sql'),'utf8')
 assert.match(sql,/clinic_promotions ADD COLUMN eligibility_type VARCHAR\(24\) NOT NULL DEFAULT 'all'/)
 assert.match(sql,/appointments ADD COLUMN promotion_eligibility_snapshot VARCHAR\(24\) NOT NULL DEFAULT 'all'/)
})
test('patient booking allows unverified email and account-based promotions',()=>{
 const client=fs.readFileSync(path.join(root,'client/src/pages/patientPage/BookAppointment.jsx'),'utf8')
 const server=fs.readFileSync(path.join(root,'server/controllers/patient.controller.js'),'utf8')
 assert.match(client,/bookablePromotions=qualifiesForExclusiveOffers \? promotions : \[\]/)
 assert.match(client,/qualifiesForExclusiveOffers/)
 assert.match(client,/You can still book an appointment/)
 assert.doesNotMatch(server,/if \(!patient\.email_verified_at\) return res\.status\(403\)/)
 assert.match(server,/patientId:req\.user\.id, lock:true/)
})

test('promotion publication does not require verification and still requires opt-in',()=>{
 const settings=fs.readFileSync(path.join(root,'server/utils/accountSettings.js'),'utf8')
 const broadcast=fs.readFileSync(path.join(root,'server/utils/publicationNotifications.js'),'utf8')
 const admin=fs.readFileSync(path.join(root,'client/src/pages/adminPage/Admin_Promotions.jsx'),'utf8')
 assert.match(settings,/patient: '[^']*phone_verified_at/)
 assert.match(broadcast,/p.password IS NOT NULL/)
 assert.match(admin,/Registered Patients Only/)
})

