import { MdCheck, MdCreditCard, MdEditNote, MdInfoOutline, MdLockOutline, MdSync, MdWarningAmber } from 'react-icons/md'
import './checkoutExperience.css'
import { checkoutNotice, checkoutOverviewValues } from '../../utils/checkoutPresentation.mjs'

const stepMeta = [
  { title: 'Review charges', help: 'Check services and adjustments', icon: MdEditNote },
  { title: 'Confirm bill', help: 'Lock reviewed charges', icon: MdLockOutline },
  { title: 'Collect payment', help: 'Record money received', icon: MdCreditCard },
]

export function CheckoutProgress({ active, complete }) {
  return <nav aria-label="Checkout progress" className="grid grid-cols-1 gap-2 sm:grid-cols-3">
    {stepMeta.map(({ title, help, icon: Icon }, index) => {
      const number = index + 1
      const finished = complete >= number
      const current = active === number
      return <div key={title} aria-current={current ? 'step' : undefined} className={`flex items-center gap-3 rounded-2xl border px-4 py-3 transition-colors duration-200 motion-reduce:transition-none ${finished ? 'border-emerald-200 bg-emerald-50' : current ? 'border-sky-300 bg-sky-50 shadow-sm' : 'border-slate-200 bg-white'}`}>
        <span aria-hidden="true" className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-xl ${finished ? 'bg-emerald-600 text-white' : current ? 'bg-sky-700 text-white' : 'bg-slate-100 text-slate-500'}`}>
          {finished ? <MdCheck /> : current ? <Icon className="text-lg" /> : number}
        </span>
        <div className="min-w-0">
          <p className={`text-sm font-bold ${finished ? 'text-emerald-800' : current ? 'text-sky-900' : 'text-slate-600'}`}>{title}</p>
          <p className="mt-0.5 text-xs text-slate-500">{finished ? 'Completed' : help}</p>
        </div>
      </div>
    })}
  </nav>
}

export function CheckoutStatus({ bill, dirty, saving, finalizing, paying, qrPending, reopening, versionConflict }) {
  const { tone, kind, title, message } = checkoutNotice({ bill, dirty, saving, finalizing, paying, qrPending, reopening, versionConflict })
  const icons = { warning: MdWarningAmber, busy: MdSync, payment: MdCreditCard, success: MdCheck, info: MdInfoOutline }
  const Icon = icons[kind] || MdInfoOutline
  const tones = {sky:'border-sky-200 bg-sky-50 text-sky-900',amber:'border-amber-200 bg-amber-50 text-amber-900',rose:'border-rose-200 bg-rose-50 text-rose-900',emerald:'border-emerald-200 bg-emerald-50 text-emerald-900',slate:'border-slate-200 bg-slate-50 text-slate-700'}
  return <div role={versionConflict ? 'alert' : 'status'} aria-live={versionConflict ? 'assertive' : 'polite'} aria-atomic="true" className={`flex items-start gap-3 rounded-2xl border px-4 py-3 text-sm transition-colors duration-200 motion-reduce:transition-none ${tones[tone]}`}>
    <Icon aria-hidden="true" className={`mt-0.5 shrink-0 text-lg ${saving || paying || finalizing || reopening ? 'motion-safe:animate-spin' : ''}`} />
    <div><p className="font-bold">{title}</p><p className="mt-1 text-xs leading-relaxed opacity-85">{message}</p></div>
  </div>
}

export function CheckoutOverview({ bill, totals, dirty, formatMoney }) {
  const { draft: pending, total, paid, balance } = checkoutOverviewValues({ bill, totals })
  const cards = [
    { label: pending ? 'Draft total (preview)' : 'Confirmed bill', value: total, note: pending ? 'Not final until saved and confirmed' : 'Based on saved bill' },
    { label: 'Payments received', value: paid, note: 'Recorded payments only' },
    { label: 'Remaining balance', value: balance, note: pending && dirty ? 'Unsaved estimate' : pending ? 'Before payment' : 'To collect' },
  ]
  return <section aria-label="Checkout amount overview" className="grid grid-cols-1 gap-3 sm:grid-cols-3">
    {cards.map((card, i) => <div key={card.label} className={`rounded-2xl border bg-white px-4 py-4 shadow-sm ${i === 2 ? 'border-sky-200' : 'border-slate-200'}`}>
      <p className="text-xs font-semibold text-slate-500">{card.label}</p>
      <p className={`mt-1 text-xl font-black tabular-nums sm:text-2xl ${i === 2 ? 'text-sky-800' : 'text-slate-900'}`}>{formatMoney(card.value || 0)}</p>
      <p className="mt-1 text-xs text-slate-500">{card.note}</p>
    </div>)}
  </section>
}

