const test=require('node:test')
const assert=require('node:assert/strict')
const fs=require('node:fs')
const path=require('node:path')
const {resolveSelectedPromotion,isEligiblePatient}=require('../../utils/promotionEligibility')
const {applyServicePromotions,listEligiblePromotions}=require('../../utils/billingServicePromotions')
const root=path.resolve(__dirname,'../../..')
const today='2026-11-12'
const base={id:15,branch_id:3,title:'Exclusive Offer',description:'For verified patients',badge_text:'Special',is_active:1,discount_type:'percentage',discount_value:20,eligibility_type:'verified',starts_on:'2026-11-12',ends_on:'2026-11-30'}
const executor=(verified,{promotion=base,log=[]}={})=>({query:async(sql,params)=>{
 log.push({sql,params})
 if(sql.includes('FROM clinic_promotions WHERE'))return [[promotion]]
 if(sql.includes('SELECT id FROM patients'))return [[verified?{id:11}:undefined]]
 if(sql.includes('SELECT ps.service_id'))return [[{service_id:7}]]
 if(sql.includes('FROM clinic_promotions p'))return [[{...promotion,service_id:7}]]
 throw new Error('Unexpected test SQL '+sql)
}})
const selected={promotionId:15,branchId:3,serviceId:7,patientId:11,appointmentDate:today,servicePrice:1200,today}
test('a verified registered patient can claim a 20% exclusive promotion',async()=>{
 const result=await resolveSelectedPromotion(executor(true),selected)
 assert.equal(result.discount_amount,240)
 assert.equal(result.eligibility_type,'verified')
})
test('unverified or guest patient cannot claim exclusive promotion',async()=>{
 await assert.rejects(resolveSelectedPromotion(executor(false),selected),{code:'PROMOTION_VERIFICATION_REQUIRED'})
 await assert.rejects(resolveSelectedPromotion(executor(false),{...selected,patientId:null}),{code:'PROMOTION_VERIFICATION_REQUIRED'})
})
test('public promotion remains available without verified contacts',async()=>{
 const result=await resolveSelectedPromotion(executor(false,{promotion:{...base,eligibility_type:'all'}}),selected)
 assert.equal(result.discount_amount,240)
})
test('checkout service offers include a patient-specific verified-contact SQL condition',async()=>{
 const log=[]
 const offers=await listEligiblePromotions(executor(true,{log}),3,today,[7],11)
 assert.equal(offers.length,1)
 assert.match(log[0].sql,/email_verified_at IS NOT NULL/)
 assert.match(log[0].sql,/phone_verified_at IS NOT NULL/)
 assert.equal(log[0].params.at(-1),11)
})
test('booked verified discount cannot be finalized after verification is lost',async()=>{
 const appointment={appointment_date:today,patient_id:11,promotion_selected_for_service_id:7,promotion_id:15,promotion_discount_amount_snapshot:240,promotion_eligibility_snapshot:'verified'}
 const item={item_type:'service',source_type:'consultation',catalog_service_id:7,line_total:1200,service_name:'Service',details_json:'{}'}
 await assert.rejects(applyServicePromotions([item],appointment,executor(false),3),{code:'PROMOTION_VERIFICATION_REQUIRED'})
})
test('existing public booked discounts remain valid as saved',async()=>{
 const appointment={appointment_date:today,patient_id:11,promotion_selected_for_service_id:7,promotion_id:15,promotion_discount_amount_snapshot:240,promotion_eligibility_snapshot:'all'}
 const item={item_type:'service',source_type:'consultation',catalog_service_id:7,line_total:1200,service_name:'Service',details_json:'{}'}
 assert.equal((await applyServicePromotions([item],appointment,executor(false),3)).total,240)
})
test('migration defaults existing offers and booking snapshots to public',()=>{
 const sql=fs.readFileSync(path.join(root,'server/db/migrations/2026-11-12-promotion-verified-eligibility.sql'),'utf8')
 assert.match(sql,/clinic_promotions ADD COLUMN eligibility_type VARCHAR\(24\) NOT NULL DEFAULT 'all'/)
 assert.match(sql,/appointments ADD COLUMN promotion_eligibility_snapshot VARCHAR\(24\) NOT NULL DEFAULT 'all'/)
})
test('patient booking allows unverified email but never sends exclusive offer selection',()=>{
 const client=fs.readFileSync(path.join(root,'client/src/pages/patientPage/BookAppointment.jsx'),'utf8')
 const server=fs.readFileSync(path.join(root,'server/controllers/patient.controller.js'),'utf8')
 assert.match(client,/bookablePromotions=promotions\.filter/)
 assert.match(client,/qualifiesForExclusiveOffers/)
 assert.match(client,/You can still book an appointment/)
 assert.doesNotMatch(server,/if \(!patient\.email_verified_at\) return res\.status\(403\)/)
 assert.match(server,/patientId:req\.user\.id, lock:true/)
})

test('patient settings exposes mobile verification and exclusive promotions remain opt-in',()=>{
 const settings=fs.readFileSync(path.join(root,'server/utils/accountSettings.js'),'utf8')
 const broadcast=fs.readFileSync(path.join(root,'server/utils/publicationNotifications.js'),'utf8')
 const admin=fs.readFileSync(path.join(root,'client/src/pages/adminPage/Admin_Promotions.jsx'),'utf8')
 assert.match(settings,/patient: '[^']*phone_verified_at/)
 assert.match(broadcast,/item.eligibility_type\|\|'all'/)
 assert.match(broadcast,/p.email_verified_at IS NOT NULL AND p.phone_verified_at IS NOT NULL/)
 assert.match(admin,/Verified Patients Only/)
})
