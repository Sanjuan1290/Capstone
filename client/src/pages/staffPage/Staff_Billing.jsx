import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { MdClose, MdPayments, MdRefresh, MdSearch } from 'react-icons/md'
import { getBills } from '../../services/staff.service'
import { useToast } from '../../components/ui/ToastProvider'
import Pagination from '../../components/ui/Pagination'
import { EmptyState, ErrorState, LoadingState } from '../../components/ui/PageState'
import BillingStatusBadge from '../../components/billing/BillingStatusBadge'
import { formatMoney } from '../../utils/billingUi'

const TABS = [
  { value: 'draft,pending', label: 'Needs Review', countKey: 'draft' },
  { value: 'ready', label: 'Ready to Collect', countKey: 'ready' },
  { value: 'partially_paid', label: 'Partial Balances', countKey: 'partially_paid' },
  { value: 'paid', label: 'Completed', countKey: 'paid' },
]

const Staff_Billing = () => {
  const toast = useToast()
  const [filter, setFilter] = useState('draft,pending')
  const [search, setSearch] = useState('')
  const [page, setPage] = useState(1)
  const [pageSize, setPageSize] = useState(10)
  const [data, setData] = useState({ items: [], summary: {}, pagination: { page: 1, total: 0, totalPages: 1 } })
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  const load = async () => {
    setLoading(true); setError('')
    try { setData(await getBills({ status: filter, search, page, limit: pageSize })) }
    catch (err) { const message = err.message || 'Checkout queue could not be loaded.'; setError(message); toast.error(message) }
    finally { setLoading(false) }
  }

  useEffect(() => { const timer = window.setTimeout(load, search ? 300 : 0); return () => window.clearTimeout(timer) }, [filter, search, page, pageSize]) // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { const refresh = () => load(); window.addEventListener('clinic:refresh', refresh); return () => window.removeEventListener('clinic:refresh', refresh) }) // eslint-disable-line react-hooks/exhaustive-deps

  const items = Array.isArray(data?.items) ? data.items : []
  const summary = data?.summary || {}
  const pagination = data?.pagination || { page, limit: pageSize, total: items.length, totalPages: 1 }

  return <div className="mx-auto w-full max-w-6xl space-y-5">
    <div className="flex flex-wrap items-start justify-between gap-3"><div><h1 className="flex items-center gap-2 text-2xl font-bold text-slate-900"><MdPayments className="text-sky-500" /> Checkout</h1><p className="mt-1 text-sm text-slate-500">Move each completed consultation from charge review to payment and receipt.</p></div><button className="button-secondary" onClick={load}><MdRefresh /> Refresh</button></div>

    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">{TABS.map((tab) => <button key={tab.value} onClick={() => { setFilter(tab.value); setPage(1) }} className={`rounded-2xl border p-4 text-left shadow-sm transition ${filter === tab.value ? 'border-sky-300 bg-sky-50' : 'border-slate-200 bg-white hover:border-slate-300'}`}><p className={`text-xs font-black uppercase tracking-wide ${filter === tab.value ? 'text-sky-700' : 'text-slate-400'}`}>{tab.label}</p><p className="mt-2 text-2xl font-black text-slate-900">{Number(summary[tab.countKey] || 0)}</p></button>)}</div>

    <section className="overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-sm">
      <div className="border-b border-slate-100 p-5"><div className="relative"><MdSearch className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" /><input className="form-control pl-10 pr-10" value={search} onChange={(e) => { setSearch(e.target.value); setPage(1) }} placeholder="Search patient, doctor, reason, or bill number..." aria-label="Search checkout queue" />{search && <button className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400" onClick={() => setSearch('')}><MdClose /></button>}</div></div>
      {loading ? <div className="p-5"><LoadingState label="Loading checkout queue..." /></div> : error ? <div className="p-5"><ErrorState message={error} onRetry={load} /></div> : items.length === 0 ? <div className="p-5"><EmptyState title="Nothing in this queue" description={filter === 'draft,pending' ? 'Bills appear here automatically after a Doctor completes a consultation.' : 'No bills match this checkout stage.'} /></div> : <div className="divide-y divide-slate-100">{items.map((bill) => <Link key={bill.id} to={`/staff/checkout/${bill.id}`} className="block p-5 transition hover:bg-slate-50"><div className="flex flex-wrap items-start justify-between gap-4"><div className="min-w-0"><div className="flex flex-wrap items-center gap-2"><h2 className="text-base font-black text-slate-900">{bill.patient_name}</h2><BillingStatusBadge status={bill.status} audience="staff" /></div><p className="mt-1 text-sm text-slate-500">{bill.doctor_name} · {bill.appointment_reason || 'Consultation'}</p><p className="mt-2 text-xs font-semibold text-slate-400">{bill.appointment_date || '—'} · {bill.appointment_time || '—'} · Bill #{bill.id}</p></div><div className="text-right"><p className="text-xs font-bold uppercase text-slate-400">{bill.status === 'partially_paid' ? 'Balance' : bill.status === 'paid' ? 'Paid' : 'Amount'}</p><p className="mt-1 text-xl font-black text-slate-900">{formatMoney(bill.status === 'partially_paid' ? bill.balance_amount : bill.total_amount)}</p><p className="mt-2 text-xs font-bold text-sky-700">Open Checkout →</p></div></div></Link>)}</div>}
      <div className="border-t border-slate-100 p-4"><Pagination page={pagination.page || page} totalPages={pagination.totalPages || 1} pageSize={pageSize} total={pagination.total || 0} onPageChange={setPage} onPageSizeChange={(size) => { setPageSize(size); setPage(1) }} /></div>
    </section>
  </div>
}
export default Staff_Billing
