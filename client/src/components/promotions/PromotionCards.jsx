import { useRef } from 'react'
import { visiblePromotions } from '../../utils/promotionPresentation.mjs'
export { visiblePromotions }
import { NavLink } from 'react-router-dom'
import { MdChevronLeft, MdChevronRight, MdArrowForward } from 'react-icons/md'


export function PromotionCard({promotion:p}){
  return <article className="flex h-full flex-col overflow-hidden rounded-2xl border border-emerald-100 bg-white shadow-sm">
    {p.image_url?<img src={p.image_url} alt="" loading="lazy" className="aspect-video w-full bg-emerald-50 object-cover"/>:<div className="flex aspect-video items-center justify-center bg-gradient-to-br from-emerald-50 to-sky-100 p-5 text-center text-sm font-bold text-emerald-800">CARAIT CLINIC · SPECIAL OFFER</div>}
    <div className="flex flex-1 flex-col gap-2 p-4"><span className="text-[11px] font-bold uppercase tracking-wider text-emerald-700">{p.badge_text||'Special offer'}</span><h3 className="text-base font-black text-slate-900">{p.title}</h3><p className="line-clamp-4 text-sm text-slate-600">{p.description}</p><p className="mt-auto pt-2 text-xs text-slate-500">Valid until {p.ends_on} · {p.branch_name||'Selected branch'}</p><NavLink to={`/patient/book?branch_id=${encodeURIComponent(p.branch_id)}`} className="mt-2 inline-flex items-center gap-1 text-sm font-bold text-emerald-700">Explore eligible services <MdArrowForward/></NavLink></div>
  </article>
}
export function FeaturedOffers({promotions=[]}){
  const ref=useRef(null),items=visiblePromotions(promotions,true)
  if(!items.length)return null
  const slide=direction=>ref.current?.scrollBy({left:direction*(ref.current?.clientWidth||320),behavior:'smooth'})
  return <section className="space-y-3" aria-label="Featured clinic offers"><div className="flex items-center justify-between gap-2"><div><h2 className="text-lg font-black text-slate-900">Special Offers</h2><p className="text-xs text-slate-500">Explore current clinic promotions</p></div><NavLink to="/patient/offers" className="text-sm font-bold text-emerald-700">View all offers</NavLink></div><div className="flex justify-end gap-2"><button type="button" className="button-secondary" aria-label="Previous offer" onClick={()=>slide(-1)}><MdChevronLeft/></button><button type="button" className="button-secondary" aria-label="Next offer" onClick={()=>slide(1)}><MdChevronRight/></button></div><div ref={ref} tabIndex={0} aria-label="Featured promotions, scroll to view" className="flex snap-x snap-mandatory gap-3 overflow-x-auto pb-2">{items.map(p=><div key={p.id} className="w-[85%] max-w-sm shrink-0 snap-start sm:w-[48%]"><PromotionCard promotion={p}/></div>)}</div></section>
}
