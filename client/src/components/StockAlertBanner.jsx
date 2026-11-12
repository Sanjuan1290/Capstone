import { NavLink } from 'react-router-dom'
import { MdWarningAmber } from 'react-icons/md'

export default function StockAlertBanner({ count, to, onReview }) {
  if (!Number.isFinite(Number(count)) || Number(count) <= 0) return null
  const action = 'Review stock alerts'
  return <div role="status" className="grid grid-cols-[auto_minmax(0,1fr)] items-start gap-x-3 gap-y-4 rounded-2xl border-2 border-rose-400 border-l-8 border-l-rose-600 bg-rose-50 p-5 text-rose-950 shadow-sm">
    <MdWarningAmber aria-hidden="true" className="mt-0.5 text-3xl text-rose-700" />
    <div className="min-w-0"><p className="text-base font-black leading-snug">Stock needs attention: {count} item{Number(count) === 1 ? '' : 's'}</p><p className="mt-2 text-sm leading-relaxed text-rose-800">Low or out of stock. Review availability and replenish these items.</p></div>
    {to ? <NavLink to={to} className="col-span-2 inline-flex w-full max-w-xs items-center justify-center rounded-xl bg-rose-700 px-4 py-3 text-center text-sm font-bold text-white hover:bg-rose-800">{action}</NavLink>
      : onReview ? <button type="button" onClick={onReview} className="col-span-2 inline-flex w-full max-w-xs items-center justify-center rounded-xl bg-rose-700 px-4 py-3 text-center text-sm font-bold text-white hover:bg-rose-800">{action}</button> : null}
  </div>
}
