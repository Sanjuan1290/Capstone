// One discount per eligible service line. All rules are checked on the server.
// Booking discounts use their saved snapshot; added services use a currently active
// branch promotion valid on the appointment date. Inventory lines are never discounted.
const {amountFor, money} = require('./promotionPricing')
const {isEligiblePatient}=require('./promotionEligibility')
const fail = (message, code = 'INVALID_SERVICE_PROMOTION') => Object.assign(new Error(message), {statusCode:409,code})
const ymd = value => value instanceof Date ? value.toISOString().slice(0,10) : String(value||'').slice(0,10)
const detailsFor = item => {
 const value=item?.details_json ?? item?.details ?? {}
 if(value && typeof value==='object' && !Array.isArray(value)) return {...value}
 try {const parsed=JSON.parse(value);return parsed && typeof parsed==='object' && !Array.isArray(parsed)?parsed:{}}catch{return {}}
}
const listEligiblePromotions = async (executor, branchId, appointmentDate, serviceIds = [], patientId = null) => {
 const ids=[...new Set(serviceIds.map(Number).filter(id=>Number.isSafeInteger(id)&&id>0))]
 const date=ymd(appointmentDate)
 if(!ids.length || !/^\d{4}-\d{2}-\d{2}$/.test(date))return []
 const [rows]=await executor.query(`SELECT p.id,p.title,p.discount_type,p.discount_value,p.eligibility_type,
   ps.service_id FROM clinic_promotions p
   JOIN clinic_promotion_services ps ON ps.promotion_id=p.id
   JOIN billing_service_catalog svc ON svc.id=ps.service_id AND svc.branch_id=p.branch_id
   WHERE p.branch_id=? AND p.is_active=1 AND p.starts_on<=? AND p.ends_on>=?
     AND ps.service_id IN (${ids.map(()=>'?').join(',')})
     AND (p.eligibility_type='all' OR EXISTS(SELECT 1 FROM patients pv WHERE pv.id=? AND COALESCE(pv.is_walk_in,0)=0
       AND pv.email IS NOT NULL AND pv.email<>'' AND pv.phone IS NOT NULL AND pv.phone<>''
       AND pv.email_verified_at IS NOT NULL AND pv.phone_verified_at IS NOT NULL
       AND pv.password IS NOT NULL AND pv.password<>''))
   ORDER BY p.id,ps.service_id`,[branchId,date,date,...ids,Number(patientId)||0])
 return rows
}
const applyServicePromotions = async (items, appointment, executor, branchId) => {
 const serviceItems=items.filter(item=>item.item_type==='service' && ['consultation','staff_service'].includes(item.source_type))
 const ids=serviceItems.map(item=>Number(item.catalog_service_id))
 const offers=await listEligiblePromotions(executor,branchId,appointment.appointment_date,ids,appointment.patient_id)
 const eligible=new Map(offers.map(offer=>[`${offer.service_id}:${offer.id}`,offer]))
 const bookedId=Number(appointment.promotion_selected_for_service_id||0)
 const bookedOfferId=Number(appointment.promotion_id||0)
 const bookingDiscount=Math.max(0,Number(appointment.promotion_discount_amount_snapshot||0))
 let total=0
 const applied=[]
 for(const item of serviceItems){
  // A booking snapshot retains the original offer rule, but verified-only
  // discounts still require a verified account when the bill is finalized.
  const details=detailsFor(item)
  const id=Number(item.catalog_service_id)
  const base=money(Number(item.line_total||0))
  let offer=null,amount=0,title=''
  // Deleting a live offer clears its FK, not the patient's saved booking price.
  if(item.source_type==='consultation' && bookedId>0 && id===bookedId && (bookedOfferId>0 || bookingDiscount>0)){
   if (appointment.promotion_eligibility_snapshot==='verified' && !await isEligiblePatient(executor,appointment.patient_id))
     throw fail('This booked offer requires verified email and mobile number. Complete verification before payment or have the clinic review the promotion.','PROMOTION_VERIFICATION_REQUIRED')
   amount=Math.min(base,money(bookingDiscount))
   title=String(appointment.promotion_title_snapshot||'Booked promotion')
   offer={id:bookedOfferId>0?bookedOfferId:null,title,discount_type:appointment.promotion_discount_type_snapshot,discount_value:appointment.promotion_discount_value_snapshot}
  }else{
   const chosen=details.requested_promotion_id
   const chosenId=chosen===null || chosen===undefined ? null : Number(chosen)
   if(chosenId!==null && (!Number.isSafeInteger(chosenId)||chosenId<0))throw fail('Select a valid service promotion.')
   const offerId=chosenId===null?bookedOfferId:chosenId
   if(offerId>0){
    offer=eligible.get(`${id}:${offerId}`)||null
    // Explicitly selected offers must still be eligible when a bill is saved.
    if(chosenId>0&&!offer)throw fail('This promotion is not available for the selected service and appointment date.','PROMOTION_SERVICE_MISMATCH')
   }
   if(offer){amount=amountFor(base,offer.discount_type,offer.discount_value);title=offer.title}
  }
  details.applied_promotion=offer && amount>0 ? {id:offer.id==null?null:Number(offer.id),title,amount,discount_type:offer.discount_type,discount_value:Number(offer.discount_value||0)} : null
  item.details_json=JSON.stringify(details)
  if(amount>0){total=money(total+amount);applied.push({catalog_service_id:id,title,amount,service_name:item.service_name})}
 }
 return {total,applied,offers}
}
module.exports={listEligiblePromotions,applyServicePromotions,ymd,detailsFor}

