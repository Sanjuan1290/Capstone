const test=require('node:test')
const assert=require('node:assert/strict')
const {applyServicePromotions}=require('../../utils/billingServicePromotions')
const appointment={appointment_date:'2026-11-11',branch_id:1,promotion_id:9,promotion_selected_for_service_id:1,promotion_discount_amount_snapshot:100,promotion_title_snapshot:'Christmas Promo',promotion_discount_type_snapshot:'percentage',promotion_discount_value_snapshot:25}
const fixture=offers=>({query:async(sql,args)=>{
 assert.match(sql,/clinic_promotions/)
 assert.equal(args[0],1)
 assert.equal(args[1],'2026-11-11')
 return [offers]
}})
const service=(id,price,requested=undefined,kind='consultation')=>({item_type:'service',source_type:kind,catalog_service_id:id,service_name:`Service ${id}`,line_total:price,details_json:JSON.stringify({requested_promotion_id:requested??null})})
const supply=()=>({item_type:'supply',source_type:'staff_supply',line_total:45,details_json:'{}'})
const christmas={id:9,title:'Christmas Promo',discount_type:'percentage',discount_value:25,service_id:2}

test('booked and eligible added service both receive Christmas 25%; stock items do not',async()=>{
 const items=[service(1,400),service(2,540),supply()]
 const result=await applyServicePromotions(items,appointment,fixture([christmas]),1)
 assert.equal(result.total,235)
 assert.equal(result.applied.length,2)
 assert.equal(JSON.parse(items[0].details_json).applied_promotion.amount,100)
 assert.equal(JSON.parse(items[1].details_json).applied_promotion.amount,135)
 assert.equal(JSON.parse(items[2].details_json).applied_promotion,undefined)
 assert.equal(985-result.total,750)
})
test('non-eligible added services receive no booked promotion',async()=>{
 const items=[service(1,400),service(3,300)]
 const result=await applyServicePromotions(items,appointment,fixture([christmas]),1)
 assert.equal(result.total,100)
})
test('staff-added billing service gets eligible offer without adding inventory use',async()=>{
 const items=[service(2,540,9,'staff_service')]
 const result=await applyServicePromotions(items,appointment,fixture([christmas]),1)
 assert.equal(result.total,135)
 assert.deepEqual(JSON.parse(items[0].details_json).applied_promotion.amount,135)
})
test('choosing no promotion blocks an automatic offer',async()=>{
 const items=[service(2,540,0)]
 const result=await applyServicePromotions(items,appointment,fixture([christmas]),1)
 assert.equal(result.total,0)
})
test('explicit promotion must be linked to the actual service',async()=>{
 const items=[service(3,540,9)]
 await assert.rejects(applyServicePromotions(items,appointment,fixture([christmas]),1),{code:'PROMOTION_SERVICE_MISMATCH'})
})
test('one hundred percent cap never discounts above the line price',async()=>{
 const items=[service(2,40,10)]
 const result=await applyServicePromotions(items,appointment,fixture([{id:10,title:'Discount',discount_type:'fixed',discount_value:900,service_id:2}]),1)
 assert.equal(result.total,40)
})
test('no promotion on new service cannot apply to inventory',async()=>{
 const items=[supply()]
 const result=await applyServicePromotions(items,appointment,fixture([]),1)
 assert.equal(result.total,0)
})
