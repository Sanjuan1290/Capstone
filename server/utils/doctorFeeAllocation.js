const {cents,fromCents,percentage,percentOf,multiply}=require('./billingMoney')
function doctorFeeAllocations(items=[]){
 return items.filter(item=>item.item_type==='service').map(item=>{
  let details=item.details||{}
  if(item.details_json)details=typeof item.details_json==='object'?item.details_json:JSON.parse(item.details_json)
  const rate=percentage(details.pricing?.doctor_fee_percentage??0)
  const original=multiply(cents(details.pricing?.original_price??item.unit_price??0),item.quantity||1)
  const fee=percentOf(original,rate)
  return {billing_item_id:item.id||null,catalog_service_id:item.catalog_service_id||null,service_name:item.service_name,quantity:Number(item.quantity||1),percentage:rate,original_subtotal:fromCents(original),doctor_fee_amount:fromCents(fee),clinic_base_share:fromCents(original-fee)}
 })
}
module.exports={doctorFeeAllocations}
