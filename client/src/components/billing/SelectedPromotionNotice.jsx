export default function SelectedPromotionNotice({ promotion }) {
  if (!promotion) return null
  return <div className="mt-4 rounded-2xl border border-amber-300 bg-amber-50 p-4 text-sm text-amber-950" role="note">
    <p className="font-black">Patient selected promotion: {promotion.title_at_booking}</p>
    {promotion.badge_at_booking && <p className="mt-1 text-xs font-semibold">{promotion.badge_at_booking}</p>}
    {promotion.terms_at_booking && <p className="mt-2 whitespace-pre-wrap text-xs">{promotion.terms_at_booking}</p>}
    <p className="mt-2 text-xs">Offer validity at booking: {promotion.starts_on_at_booking || '—'} to {promotion.ends_on_at_booking || '—'}.</p>
    <p className="mt-2 font-semibold text-xs">Selection is not a discount. Validate applicable terms and use the existing manual discount approval process before reducing the bill.</p>
  </div>
}
