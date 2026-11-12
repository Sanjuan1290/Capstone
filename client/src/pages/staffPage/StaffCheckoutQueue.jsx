import { useCallback, useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import StaffCashDrawer from '../../components/billing/StaffCashDrawer'
import { MdClose, MdRefresh, MdSearch } from 'react-icons/md'
import { getBills } from '../../services/staff.service'
import { useToast } from '../../components/ui/ToastProvider'
import Pagination from '../../components/ui/Pagination'
import { EmptyState, ErrorState, LoadingState } from '../../components/ui/PageState'
import BillingStatusBadge from '../../components/billing/BillingStatusBadge'
import { formatMoney } from '../../utils/billingUi'

const TABS = [
  { value: 'ready', label: 'Ready for Payment', countKey: 'ready' },
  { value: 'draft,pending', label: 'Check Bill First', countKey: 'draft' },
  { value: 'partially_paid', label: 'Remaining Balances', countKey: 'partially_paid' },
]

const StaffCheckoutQueue = () => {
  const toast = useToast()
  const [filter, setFilter] = useState('ready')
  const [search, setSearch] = useState('')
  const [page, setPage] = useState(1)
  const [pageSize, setPageSize] = useState(10)
  const [data, setData] = useState({ items: [], summary: {}, pagination: { page: 1, total: 0, totalPages: 1 } })
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  const load = useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      setData(await getBills({ status: filter, search, page, limit: pageSize }))
    } catch (err) {
      const message = err.message || 'Checkout queue could not be loaded.'
      setError(message)
      toast.error(message)
    } finally {
      setLoading(false)
    }
  }, [filter, search, page, pageSize, toast])

  useEffect(() => {
    const timer = window.setTimeout(load, search ? 300 : 0)
    return () => window.clearTimeout(timer)
  }, [load, search])

  useEffect(() => {
    const refresh = () => load()
    window.addEventListener('clinic:refresh', refresh)
    return () => window.removeEventListener('clinic:refresh', refresh)
  }, [load])

  const items = Array.isArray(data?.items) ? data.items : []
  const summary = data?.summary || {}
  const pagination = data?.pagination || { page, limit: pageSize, total: items.length, totalPages: 1 }

  return (
    <div className="w-full space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div><h2 className="text-lg font-bold text-slate-900">Choose a patient to collect payment</h2><p className="mt-1 text-sm text-slate-500">Start with Ready for Payment. If charges aren't confirmed, open Check Bill First.</p></div>
        <></>
      </div>
      <div className="grid gap-2 rounded-2xl border border-slate-200 bg-white p-4 text-sm sm:grid-cols-3">
        {['1. Find the patient', '2. Check and confirm charges', '3. Collect payment and issue receipt'].map(label => <p key={label} className="font-semibold text-slate-700">{label}</p>)}
      </div>
      <details className="rounded-2xl border border-slate-200 bg-white p-3 shadow-sm">
        <summary className="min-h-10 cursor-pointer list-item px-2 py-2 text-sm font-semibold text-slate-800">Cash drawer & end-of-shift count <span className="ml-2 font-normal text-slate-500">(open when needed)</span></summary>
        <div className="pt-2"><StaffCashDrawer /></div>
      </details>
      <div className="grid gap-3 sm:grid-cols-3">
        {TABS.map((tab) => (
          <button key={tab.value} onClick={() => { setFilter(tab.value); setPage(1) }} className={`rounded-2xl border p-4 text-left shadow-sm transition ${filter === tab.value ? 'border-amber-300 bg-amber-50' : 'border-slate-200 bg-white hover:border-slate-300'}`}>
            <p className={`text-xs font-black uppercase tracking-wide ${filter === tab.value ? 'text-amber-700' : 'text-slate-400'}`}>{tab.label}</p>
            <p className="mt-2 text-2xl font-black text-slate-900">{Number(summary[tab.countKey] || 0)}</p>
          </button>
        ))}
      </div>

      <section className="overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-sm">
        <div className="border-b border-slate-100 p-5">
          <div className="relative">
            <MdSearch className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <input className="form-control pl-10 pr-10" value={search} onChange={(e) => { setSearch(e.target.value); setPage(1) }} placeholder="Search patient, doctor, reason, or bill number..." aria-label="Search checkout queue" />
            {search && <button className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400" onClick={() => { setSearch(''); setPage(1) }} aria-label="Clear search"><MdClose /></button>}
          </div>
        </div>
        {loading ? <div className="p-5"><LoadingState label="Loading checkout queue..." /></div>
          : error ? <div className="p-5"><ErrorState message={error} onRetry={load} /></div>
            : items.length === 0 ? <div className="p-5"><EmptyState title="No bills in this section" description="No bills match this checkout stage." /></div>
              : <div className="divide-y divide-slate-100">{items.map((bill) => (
                <Link key={bill.id} to={`/staff/checkout/${bill.id}`} className="block p-5 transition hover:bg-slate-50">
                  <div className="flex flex-wrap items-start justify-between gap-4">
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2"><h2 className="text-base font-black text-slate-900">{bill.patient_name}</h2><BillingStatusBadge status={bill.status} audience="staff" /></div>
                      <p className="mt-1 text-sm text-slate-500">{bill.doctor_name} · {bill.appointment_reason || 'Consultation'}</p>
                      <p className="mt-2 text-xs font-semibold text-slate-400">{bill.appointment_date || '—'} · {bill.appointment_time || '—'} · Bill #{bill.id}</p>
                    </div>
                    <div className="text-right">
                      <p className="text-xs font-bold uppercase text-slate-400">{bill.status === 'partially_paid' ? 'Balance' : bill.status === 'paid' ? 'Paid' : 'Amount'}</p>
                      <p className="mt-1 text-xl font-black text-slate-900">{formatMoney(bill.status === 'partially_paid' ? bill.balance_amount : bill.total_amount)}</p>
                      <p className="mt-2 text-xs font-bold text-amber-700">View Bill & Continue →</p>
                    </div>
                  </div>
                </Link>
              ))}</div>}
        <div className="flex flex-wrap items-center justify-between gap-3 border-t border-slate-100 p-4"><Link to="/staff/checkout?tab=transactions" className="text-sm font-semibold text-sky-700 hover:underline">Find completed bills & receipts →</Link><Pagination page={pagination.page || page} totalPages={pagination.totalPages || 1} pageSize={pageSize} total={pagination.total || 0} onPageChange={setPage} onPageSizeChange={(size) => { setPageSize(size); setPage(1) }} /></div>
      </section>
    </div>
  )
}

export default StaffCheckoutQueue

