import { useCallback, useEffect, useRef, useState } from 'react'
import { NavLink } from 'react-router-dom'
import { MdChevronLeft, MdChevronRight, MdArrowForward } from 'react-icons/md'
import { visiblePromotions } from '../../utils/promotionPresentation.mjs'
export { visiblePromotions }

const formatOfferEndDate = (value) => {
  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(value || ''))
  if (!match) return null
  const [, year, month, day] = match
  const date = new Date(Number(year), Number(month) - 1, Number(day))
  if (date.getFullYear() !== Number(year) || date.getMonth() + 1 !== Number(month) || date.getDate() !== Number(day)) return null
  return date.toLocaleDateString('en-PH', { month: 'short', day: 'numeric', year: 'numeric' })
}

export function PromotionCard({ promotion: p }) {
  const endDate = formatOfferEndDate(p.ends_on)
  return <article className="flex h-full flex-col overflow-hidden rounded-2xl border border-emerald-100 bg-white shadow-sm dark:border-slate-700 dark:bg-slate-900">
    {p.image_url
      ? <img src={p.image_url} alt="" loading="lazy" className="aspect-video w-full bg-emerald-50 object-cover" />
      : <div className="flex aspect-video items-center justify-center bg-gradient-to-br from-emerald-50 to-sky-100 p-5 text-center text-sm font-bold text-emerald-800 dark:from-emerald-950 dark:to-slate-800 dark:text-emerald-200">CARAIT CLINIC · SPECIAL OFFER</div>}
    <div className="flex flex-1 flex-col gap-2 p-4">
      <span className="text-[11px] font-bold uppercase tracking-wider text-emerald-700 dark:text-emerald-300">{p.badge_text || 'Special offer'}</span>
      <h3 className="text-base font-black text-slate-900">{p.title}</h3>
      <p className="line-clamp-4 text-sm text-slate-600">{p.description}</p>
      <p className="mt-auto pt-2 text-xs text-slate-500">{endDate ? `Valid until ${endDate} · ` : ''}{p.branch_name || 'Selected branch'}</p>
      <NavLink to={`/patient/book?branch_id=${encodeURIComponent(p.branch_id)}&promotion_id=${encodeURIComponent(p.id)}`} className="mt-2 inline-flex items-center gap-1 text-sm font-bold text-emerald-700 dark:text-emerald-300">Explore eligible services <MdArrowForward aria-hidden="true" /></NavLink>
    </div>
  </article>
}

export function FeaturedOffers({ promotions = [] }) {
  const ref = useRef(null)
  const items = visiblePromotions(promotions, true)
  const [edge, setEdge] = useState({ first: true, last: false })
  const syncEdge = useCallback(() => {
    const el = ref.current
    if (!el) return
    setEdge({ first: el.scrollLeft <= 2, last: el.scrollLeft + el.clientWidth >= el.scrollWidth - 2 })
  }, [])
  useEffect(() => {
    syncEdge()
    const el = ref.current
    if (!el) return undefined
    const observer = typeof ResizeObserver === 'function' ? new ResizeObserver(syncEdge) : null
    observer?.observe(el)
    for (const child of el.children) observer?.observe(child)
    window.addEventListener('resize', syncEdge)
    return () => { observer?.disconnect(); window.removeEventListener('resize', syncEdge) }
  }, [syncEdge, items.length])

  if (!items.length) return null
  const slide = (direction) => {
    const el = ref.current
    if (!el) return
    const card = el.firstElementChild
    const gap = Number.parseFloat(window.getComputedStyle(el).columnGap) || 0
    const step = card ? card.getBoundingClientRect().width + gap : el.clientWidth
    const reducedMotion = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches
    el.scrollBy({ left: direction * step, behavior: reducedMotion ? 'auto' : 'smooth' })
  }
  return <section className="space-y-3" aria-label="Featured clinic offers">
    <div className="flex flex-wrap items-center justify-between gap-2"><div><h2 className="text-lg font-black text-slate-900">Special Offers</h2><p className="text-xs text-slate-500">Explore current clinic promotions</p></div><NavLink to="/patient/offers" className="text-sm font-bold text-emerald-700 dark:text-emerald-300">View all offers</NavLink></div>
    <div className="flex justify-end gap-2">
      <button type="button" className="button-secondary disabled:cursor-not-allowed disabled:opacity-40" aria-label="Previous offer" disabled={edge.first} onClick={() => slide(-1)}><MdChevronLeft /></button>
      <button type="button" className="button-secondary disabled:cursor-not-allowed disabled:opacity-40" aria-label="Next offer" disabled={edge.last} onClick={() => slide(1)}><MdChevronRight /></button>
    </div>
    <div ref={ref} onScroll={syncEdge} tabIndex={0} aria-label="Featured promotions, scroll to view" className="flex snap-x snap-mandatory gap-3 overflow-x-auto scroll-smooth pb-2 motion-reduce:scroll-auto">
      {items.map(p => <div key={p.id} className="w-[min(85%,23rem)] shrink-0 snap-start sm:w-[48%] lg:w-[31%]"><PromotionCard promotion={p} /></div>)}
    </div>
  </section>
}


