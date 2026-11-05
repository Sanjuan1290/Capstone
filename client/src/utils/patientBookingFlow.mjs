import {promotionQuote} from './promotionPricing.mjs'
// Pure helpers for the patient-facing four-step booking flow.
// These only prepare UI data. The booking API remains the authority on eligibility.
export const BOOKING_STEPS = Object.freeze(['Service', 'Doctor', 'Date & Time', 'Review'])
const CLINIC_CATEGORIES = ['medical', 'derma']

export function normalizeBookingServiceResults(results) {
  const seen = new Set()
  return results.flatMap((result, index) => {
    if (result?.status !== 'fulfilled' || !Array.isArray(result.value) || !CLINIC_CATEGORIES[index]) return []
    return result.value.flatMap(service => {
      const id = Number(service?.id)
      if (!Number.isSafeInteger(id) || id <= 0 || Number(service?.is_active) === 0) return []
      const type = CLINIC_CATEGORIES[index]
      const key = `${type}:${id}`
      if (seen.has(key)) return []
      seen.add(key)
      return [{...service, booking_clinic_type:type}]
    })
  })
}

export function eligibleBookingPromotions(promotions, {branchId,serviceId,date}) {
  if (!Number(branchId) || !Number(serviceId) || !/^\d{4}-\d{2}-\d{2}$/.test(String(date||''))) return []
  return (Array.isArray(promotions) ? promotions : []).filter(promo =>
    Number(promo.branch_id)===Number(branchId) &&
    Number(promo.is_active ?? 1)!==0 &&
    Array.isArray(promo.service_ids) && promo.service_ids.some(id=>Number(id)===Number(serviceId)) &&
    String(date) >= String(promo.starts_on) && String(date) <= String(promo.ends_on)
  )
}


// Choose the same eligible promotion in booking that the service dashboard presents.
// Before the appointment date is known, previews use today's active offers only.
// The server still validates date, service, branch, price, and the selected promotion.
export function selectBookingPrice(service, promotions, {branchId,date,selectedPromotionId, fallbackCurrentOffer=false}={}) {
  const valid=eligibleBookingPromotions(promotions,{branchId,serviceId:service?.id,date})
  const price=service?.default_price
  const candidates=valid.map(promotion=>({promotion,quote:promotionQuote(price,promotion)}))
    .filter(({quote})=>quote?.discount>0)
    .sort((a,b)=>b.quote.discount-a.quote.discount || Number(a.promotion.id)-Number(b.promotion.id))
  const selected=selectedPromotionId ? candidates.find(({promotion})=>Number(promotion.id)===Number(selectedPromotionId)) : candidates[0]
  if(selected) return selected
  // The service API may include a server-calculated current offer before the
  // separate promotions request has finished. Never use this fallback for a
  // chosen future appointment date or to submit a promotion ID.
  if(fallbackCurrentOffer && !candidates.length && service?.current_offer?.quote?.discount>0) {
    return {promotion:service.current_offer, quote:service.current_offer.quote}
  }
  return {promotion:null,quote:null}
}
