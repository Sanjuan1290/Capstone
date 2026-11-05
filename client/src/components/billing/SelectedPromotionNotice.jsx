export default function SelectedPromotionNotice({ promotion, items = [], discountAmount = 0, courtesyAmount = 0 }) {
  if (!promotion) return null
  const amount = Number(promotion.applied_discount_amount || 0)
  const booked = promotion.base_price_at_booking == null ? null : Number(promotion.base_price_at_booking)
  const lines = items.filter(item => item.item_type === 'service' && item.source_type === 'consultation' && Number(item.catalog_service_id) === Number(promotion.service_id))
  const current = lines.length ? lines.reduce((sum,item) => sum + Number(item.quantity || 1)*Number(item.unit_price || 0),0) : booked
  const additional = Math.max(0,Number(discountAmount)-amount-Number(courtesyAmount || 0))
  const peso = value => `₱${Number(value).toLocaleString('en-PH',{minimumFractionDigits:2,maximumFractionDigits:2})}`
  return <div className={`mt-4 rounded-2xl border p-4 text-sm ${amount>0?'border-emerald-300 bg-emerald-50 text-emerald-950':'border-amber-300 bg-amber-50 text-amber-950'}`} role="note">
    <p className="font-black">{amount>0?'Promotion applied':'Selected offer'}: {promotion.title_at_booking}</p>
    {promotion.terms_at_booking && <p className="mt-2 whitespace-pre-wrap text-xs">{promotion.terms_at_booking}</p>}
    <p className="mt-2 text-xs">Offer at booking: {promotion.starts_on_at_booking || '\u2014'} to {promotion.ends_on_at_booking || '\u2014'}.</p>
    {amount>0 ? <div className="mt-3 space-y-1 text-xs">
      <p>Original service price: {peso(current)}</p>
      {booked!==null && current!==booked && <p>Price at booking: {peso(booked)}. The booked savings are retained, up to the current service price.</p>}
      <p>Service promotion: −{peso(amount)}</p>
      <p className="font-bold">Service after promotion: {peso(Math.max(0,current-amount))}</p>
      <p>Additional Discount: {peso(additional)}</p>
      <p>Approved charge reductions: {peso(courtesyAmount)}</p>
      <p>Additional discounts apply to the remaining bill. Separately billable supplies appear as their own charges.</p>
    </div> : <p className="mt-2 text-xs">This offer has no automatic price reduction. Any additional discount needs separate authorization.</p>}
  </div>
}
