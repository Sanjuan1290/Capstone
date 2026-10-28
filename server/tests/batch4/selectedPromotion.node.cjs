const {test} = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const {parsePromotionId,resolveSelectedPromotion} = require('../../utils/promotionEligibility')

const promo={id:12,branch_id:2,title:'Clinic Visit Offer',description:'An offer subject to review',badge_text:'OFFER',is_active:1,starts_on:'2026-10-01',ends_on:'2026-11-30'}
const executor=(p=promo,linked=true)=>({async query(sql,args){
  if (sql.includes('FROM clinic_promotions WHERE id=? AND branch_id=?')){
    assert.deepEqual(args,[12,2]); assert.match(sql,/FOR UPDATE/);return [[p]]
  }
  if (sql.includes('FROM clinic_promotion_services ps')){
    assert.deepEqual(args,[2,12,99]);return [[linked?{service_id:99}:undefined].filter(Boolean)]
  }
  throw new Error('unexpected query')
}})
const input={promotionId:12,branchId:2,serviceId:99,appointmentDate:'2026-10-31',today:'2026-10-26',lock:true}

test('optional promotion is absent for legacy booking',async()=>{
  assert.equal(parsePromotionId(undefined),null)
  assert.equal(await resolveSelectedPromotion(executor(),{...input,promotionId:null}),null)
})
test('rejects invalid and forged promotion IDs',()=>{
  for(const v of [-1,0,1.5,'x','1 OR 1=1','+10',' 10',Number.MAX_SAFE_INTEGER+1])assert.throws(()=>parsePromotionId(v),{status:400})
  assert.equal(parsePromotionId('12'),12)
})
test('saves trusted branch/service/date/terms snapshot, not client-supplied terms',async()=>{
 const r=await resolveSelectedPromotion(executor(),input)
 assert.deepEqual(r,{id:12,title:promo.title,terms:promo.description,badge:promo.badge_text,starts_on:promo.starts_on,ends_on:promo.ends_on,service_id:99})
})
test('rejects inactive, expired and wrong-branch offers',async()=>{
 for(const p of [{...promo,is_active:0},{...promo,ends_on:'2026-10-25'},null]){
  await assert.rejects(resolveSelectedPromotion(executor(p),input),{status:409})
 }
})
test('appointment date outside offer validity is rejected',async()=>{
 await assert.rejects(resolveSelectedPromotion(executor(),{...input,appointmentDate:'2026-12-01'}),{status:409})
 await assert.rejects(resolveSelectedPromotion(executor(),{...input,appointmentDate:'2026-09-30'}),{status:409})
})
test('rejects promotion not linked to active branch-owned service',async()=>{
 await assert.rejects(resolveSelectedPromotion(executor(promo,false),input),{status:409,code:'PROMOTION_SERVICE_MISMATCH'})
})
test('billing review is informational and does not touch payment ledger or auto-discount',()=>{
 const bill=fs.readFileSync(path.join(__dirname,'../../utils/billing.js'),'utf8')
 const notice=fs.readFileSync(path.join(__dirname,'../../../client/src/components/billing/SelectedPromotionNotice.jsx'),'utf8')
 assert.match(bill,/selected_promotion: records\[0\].promotion_title_snapshot/)
 assert.match(notice,/not a discount/)
 assert.doesNotMatch(notice,/billing_payments|discount_amount/)
})
test('migration is additive and preserves snapshots on legacy promotion hard deletes',()=>{
 const sql=fs.readFileSync(path.join(__dirname,'../../db/migrations/2026-10-26-batch4-selected-promotion.sql'),'utf8')
 assert.match(sql,/ON DELETE SET NULL/)
 assert.match(sql,/ADD COLUMN promotion_title_snapshot/)
 assert.doesNotMatch(sql.split('\n').filter(line=>!line.trim().startsWith('--')).join('\n'),/\b(DROP|TRUNCATE|DELETE FROM|UPDATE appointments)\b/i)
})
test('manual promotional discount outcome uses existing discount authorization and atomic audit',()=>{
 const src=fs.readFileSync(path.join(__dirname,'../../controllers/staff.controller.js'),'utf8')
 assert.match(src,/manual_discount_applied/)
 assert.match(src,/!discount.preset \|\| totals.discount <= 0/)
 assert.match(src,/promotion_review_outcome=\?/)
 assert.match(src,/await writeAuditLog\(/)
 assert.match(src,/await conn.commit\(\)/)
})
test('offer deep-link and patient form pass only selected promotion ID',()=>{
 const card=fs.readFileSync(path.join(__dirname,'../../../client/src/components/promotions/PromotionCards.jsx'),'utf8')
 const form=fs.readFileSync(path.join(__dirname,'../../../client/src/pages/patientPage/BookAppointment.jsx'),'utf8')
 assert.match(card,/promotion_id=\$\{encodeURIComponent\(p.id\)\}/)
 assert.match(form,/promotion_id: selectedPromotionId \|\| undefined/)
 assert.match(form,/onPromotionChange=\{setSelectedPromotionId\}/)
 assert.doesNotMatch(card,/discount_amount|billing_payments/)
})
