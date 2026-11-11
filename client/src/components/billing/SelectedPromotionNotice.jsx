export default function SelectedPromotionNotice({promotion,items=[],discountAmount=0,courtesyAmount=0}){
 const lines=items.filter(item=>item.item_type==='service' && Number(item?.details?.applied_promotion?.amount||0)>0)
 if(!promotion && !lines.length)return null
 const total=Number(promotion?.applied_discount_amount||0) || lines.reduce((sum,line)=>sum+Number(line.details.applied_promotion.amount||0),0)
 const otherDiscounts=Math.max(0,Number(discountAmount||0)-total-Number(courtesyAmount||0))
 const peso=n=>`₱${Number(n||0).toLocaleString('en-PH',{minimumFractionDigits:2,maximumFractionDigits:2})}`
 return <div className={`mt-4 rounded-2xl border p-4 text-sm ${total>0?'border-emerald-300 bg-emerald-50 text-emerald-950':'border-amber-300 bg-amber-50 text-amber-950'}`} role="note">
  <p className="font-black">{total>0?'Promotion applied to eligible services':'Selected offer'}{promotion?.title_at_booking?`: ${promotion.title_at_booking}`:''}</p>
  {promotion?.terms_at_booking && <p className="mt-2 whitespace-pre-wrap text-xs">{promotion.terms_at_booking}</p>}
  {lines.length>0 && <div className="mt-3 space-y-1 text-xs">
   {lines.map(line=><div key={line.id||`${line.catalog_service_id}-${line.service_name}`} className="flex flex-wrap justify-between gap-3"><span>{line.service_name} · {line.details.applied_promotion.title}</span><strong>−{peso(line.details.applied_promotion.amount)}</strong></div>)}
  </div>}
  {total>0 ? <div className="mt-3 space-y-1 border-t border-emerald-200 pt-3 text-xs">
   <p className="flex justify-between gap-3 font-bold"><span>Total service promotion discount</span><span>−{peso(total)}</span></p>
   <p>Approved charge reductions: {peso(courtesyAmount)}</p>
   <p>Other discounts: {peso(otherDiscounts)}</p>
   <p>Each service gets its own eligible promotion. Inventory items and custom charges are not discounted by service promotions.</p>
  </div> : <p className="mt-2 text-xs">No promotion discount is applied. The clinic reviews any manual price reduction separately.</p>}
 </div>
}
