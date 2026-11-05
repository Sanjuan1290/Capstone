export default function SelectedPromotionNotice({ promotion }) {
  if (!promotion) return null
  const amount=Number(promotion.applied_discount_amount||0)
  const original=promotion.base_price_at_booking==null?null:Number(promotion.base_price_at_booking)
  const peso=value=>`₱${Number(value).toLocaleString('en-PH',{minimumFractionDigits:2,maximumFractionDigits:2})}`
  return <div className={`mt-4 rounded-2xl border p-4 text-sm ${amount>0?'border-emerald-300 bg-emerald-50 text-emerald-950':'border-amber-300 bg-amber-50 text-amber-950'}`} role="note">
    <p className="font-black">{amount>0?'Promotion applied':'Selected offer'}: {promotion.title_at_booking}</p>
    {promotion.badge_at_booking && <p className="mt-1 text-xs font-semibold">{promotion.badge_at_booking}</p>}
    {promotion.terms_at_booking && <p className="mt-2 whitespace-pre-wrap text-xs">{promotion.terms_at_booking}</p>}
    <p className="mt-2 text-xs">Offer at booking: {promotion.starts_on_at_booking || '—'} to {promotion.ends_on_at_booking || '—'}.</p>
    {amount>0 ? <p className="mt-2 font-semibold">Service promotion: −{peso(amount)}{original!==null?` · Original service price: ${peso(original)}`:''}</p>
      : <p className="mt-2 text-xs">This offer has no automatic price reduction. Any manual discount needs separate approval.</p>}
  </div>
}
