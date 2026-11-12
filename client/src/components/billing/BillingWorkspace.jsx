import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Link, useLocation, useSearchParams } from 'react-router-dom'
import { MdArrowForward, MdClose, MdPayments, MdReceiptLong, MdRefresh, MdSearch } from 'react-icons/md'
import { getBills as getAdminBills } from '../../services/admin.service'
import { getBills as getStaffBills } from '../../services/staff.service'
import { useAuth } from '../../context/AuthContext'
import { hasStaffPermission } from '../../config/staffPermissions'
import { branchPortalPath } from '../../utils/branchPortalPath.mjs'
import { formatMoney, paymentMethodLabel } from '../../utils/billingUi'
import BillingStatusBadge from './BillingStatusBadge'
import Pagination from '../ui/Pagination'
import { normalizedBillingTab, statusQueryFor } from './billingWorkspaceModel.mjs'
import { EmptyState, ErrorState, LoadingState } from '../ui/PageState'

const sections = [{ id: 'payments', label: 'Payments', icon: MdPayments }, { id: 'history', label: 'Receipts & History', icon: MdReceiptLong }]
const paymentTabs = [{ id: 'pending', label: 'Pending' }, { id: 'failed', label: 'Failed' }, { id: 'paid', label: 'Paid' }]
const cleanAmount = value => Number.isFinite(Number(value)) ? Math.max(0, Number(value)) : 0
const settled = bill => bill.status === 'paid'
const failure = bill => bill.latest_gateway_failure_message || bill.latest_gateway_error_code || 'The latest payment attempt failed. Open the bill to review the payment status.'

/** Shared billing workspace. Same visual flow; server permissions still control actions. */
export default function BillingWorkspace({ role = 'admin' }) {
  const staff = role === 'staff'
  const { user } = useAuth()
  const canCheckout = !staff || hasStaffPermission(user, 'checkout')
  const canRead = !staff || canCheckout || hasStaffPermission(user, 'billing')
  const location = useLocation()
  const [params, setParams] = useSearchParams()
  const selectedTab = normalizedBillingTab(params.get('tab'))
  const section = staff && !canCheckout ? 'history' : selectedTab
  const [status, setStatus] = useState(params.get('status') === 'failed' || params.get('tab') === 'payment-issues' ? 'failed' : 'pending')
  const [search, setSearch] = useState('')
  const [method, setMethod] = useState('')
  const [from, setFrom] = useState('')
  const [to, setTo] = useState('')
  const [page, setPage] = useState(1)
  const [pageSize, setPageSize] = useState(10)
  const [result, setResult] = useState({ items: [], pagination: {} })
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const latestRequest = useRef(0)
  const fetchBills = staff ? getStaffBills : getAdminBills
  const portalPath = path => staff ? path : branchPortalPath(path, location.pathname)
  const base = staff ? (location.pathname.startsWith('/staff/checkout') ? '/staff/checkout' : '/staff/billing') : portalPath('/admin/billing')
  const canFilterMethod = section === 'history' || status === 'paid'
  const query = useMemo(() => ({
    status: statusQueryFor(section, status), search: search.trim(),
    payment_method: canFilterMethod ? method : '', date_from: from, date_to: to,
    date_basis: canFilterMethod && method ? 'payment' : 'visit', page, limit: pageSize,
  }), [section, status, search, canFilterMethod, method, from, to, page, pageSize])
  const load = useCallback(async () => {
    if (!canRead) return
    const requestId = ++latestRequest.current
    setLoading(true); setError('')
    try {
      const data = await fetchBills(query)
      if (requestId === latestRequest.current) setResult({ items: Array.isArray(data?.items) ? data.items : [], pagination: data?.pagination || {}, summary: data?.summary || {} })
    } catch (err) { if (requestId === latestRequest.current) setError(err.message || 'Unable to load bills.') }
    finally { if (requestId === latestRequest.current) setLoading(false) }
  }, [canRead, fetchBills, query, location.pathname])
  useEffect(() => {
    const timer = window.setTimeout(() => { void load() }, search ? 250 : 0)
    return () => window.clearTimeout(timer)
  }, [load, search])
  useEffect(() => {
    const onUpdate = () => { void load() }
    window.addEventListener('clinic:refresh', onUpdate)
    return () => window.removeEventListener('clinic:refresh', onUpdate)
  }, [load])
  if (!canRead) return <p role="alert" className="rounded-2xl border border-amber-200 bg-amber-50 p-5">You do not have Billing access.</p>
  const records = result.items || []
  const pagination = result.pagination || {}
  const pendingCount = Number(result?.summary?.draft || 0) + Number(result?.summary?.ready || 0) + Number(result?.summary?.partially_paid || 0)
  const historyPath = id => staff ? `${base}/history/${id}` : portalPath(`/admin/billing/transactions/${id}`)
  const checkoutPath = id => staff ? `/staff/checkout/${id}` : portalPath(`/admin/billing/checkout/${id}`)
  const showSection = next => { setParams({ tab: next }, { replace: false }); setPage(1); setMethod('') }
  const changeStatus = next => { setStatus(next); setPage(1); setMethod('') }
  const clear = () => { setSearch(''); setMethod(''); setFrom(''); setTo(''); setPage(1) }
  return <main className="mx-auto w-full max-w-7xl space-y-5" aria-label="Billing workspace">
    <header className="flex flex-wrap items-start justify-between gap-3">
      <div><h1 className="text-2xl font-black text-slate-900">Billing</h1><p className="mt-1 text-sm text-slate-500">Review bills, collect payments and find receipts in one place.</p></div>
      <></>
    </header>
    <nav aria-label="Billing sections" className="flex flex-wrap gap-2 border-b border-slate-200 pb-3">
      {sections.filter(tab => !(staff && !canCheckout && tab.id === 'payments')).map(tab => {
        const Icon = tab.icon
        return <button type="button" key={tab.id} onClick={() => showSection(tab.id)} aria-current={section === tab.id ? 'page' : undefined}
          className={`inline-flex min-h-11 items-center gap-2 rounded-xl px-4 text-sm font-bold transition-colors ${section === tab.id ? 'bg-slate-900 text-white' : 'border border-slate-200 bg-white text-slate-700 hover:bg-slate-50'}`}><Icon/>{tab.label}</button>
      })}
    </nav>
    {section === 'payments' && <div className="flex flex-wrap gap-2" role="group" aria-label="Payment status">
      {paymentTabs.map(tab => <button type="button" key={tab.id} onClick={() => changeStatus(tab.id)} aria-pressed={status === tab.id}
        className={`min-h-10 rounded-xl px-4 text-sm font-bold ${status === tab.id ? 'bg-emerald-700 text-white' : 'border border-slate-200 bg-white text-slate-700 hover:bg-slate-50'}`}>{tab.label}{tab.id === 'pending' && status === 'pending' && !loading ? ` (${pendingCount})` : ''}</button>)}
    </div>}
    <section aria-label="Search and filter bills" className="grid gap-3 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:grid-cols-2 xl:grid-cols-[minmax(0,1fr)_190px_180px_180px_auto] xl:items-end">
      <label className="block"><span className="mb-1 block text-xs font-semibold text-slate-600">Search bills</span><span className="relative block"><MdSearch className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400"/><input className="form-control pl-10" value={search} onChange={e => { setSearch(e.target.value); setPage(1) }} placeholder="Patient or bill number" /></span></label>
      {canFilterMethod && <label className="block"><span className="mb-1 block text-xs font-semibold text-slate-600">Payment method</span><select className="form-control" value={method} onChange={e => { setMethod(e.target.value); setPage(1) }}><option value="">All methods</option><option value="cash">Cash</option><option value="gcash">GCash</option><option value="maya">Maya</option><option value="bank_transfer">Bank transfer</option><option value="qrph">QR Ph</option></select></label>}
      <label className="block"><span className="mb-1 block text-xs font-semibold text-slate-600">From</span><input type="date" className="form-control" value={from} onChange={e => { setFrom(e.target.value); setPage(1) }}/></label>
      <label className="block"><span className="mb-1 block text-xs font-semibold text-slate-600">To</span><input type="date" min={from || undefined} className="form-control" value={to} onChange={e => { setTo(e.target.value); setPage(1) }}/></label>
      <button type="button" onClick={clear} className="button-secondary">Clear</button>
    </section>
    {from && to && from > to ? <p role="alert" className="rounded-xl bg-rose-50 p-4 text-sm text-rose-700">The end date must be on or after the start date.</p> :
    <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm" aria-label="Bills">
      <div className="flex items-center justify-between gap-3 border-b border-slate-100 px-4 py-3"><h2 className="font-bold text-slate-900">{section === 'history' ? 'Receipts & History' : `${paymentTabs.find(tab=>tab.id === status)?.label} Payments`}</h2><span className="text-xs text-slate-500">{pagination.total ?? records.length} bill(s)</span></div>
      {loading ? <div className="p-5"><LoadingState label="Loading bills…" /></div>
        : error ? <div className="p-5"><ErrorState message={error} onRetry={load}/></div>
        : records.length === 0 ? <div className="p-5"><EmptyState title="No bills found" description="Try a different date range or search." /></div>
        : <div className="divide-y divide-slate-100">{records.map(bill => {
            const amountDue = cleanAmount(bill.balance_amount ?? (Number(bill.total_amount || 0) - Number(bill.paid_amount || 0)))
            const to = section === 'history' || status === 'paid' || !canCheckout ? historyPath(bill.id) : checkoutPath(bill.id)
            return <article key={bill.id} className="flex flex-wrap items-center justify-between gap-3 px-4 py-4 hover:bg-slate-50 sm:px-5">
              <div className="min-w-0"><div className="flex flex-wrap items-center gap-2"><strong className="text-sm text-slate-900">{bill.patient_name || 'Patient'}</strong><BillingStatusBadge status={bill.status}/>{status === 'failed' && <span className="rounded-lg bg-rose-50 px-2 py-1 text-xs font-semibold text-rose-700">Payment failed</span>}</div>
                <p className="mt-1 text-xs text-slate-500">Bill #{bill.id} · {bill.doctor_name || 'Doctor'} · {bill.appointment_date || '—'}</p>
                <p className="mt-1 text-sm text-slate-600">{bill.appointment_reason || 'Clinic consultation'}</p>
                {status === 'failed' && section === 'payments' && <p className="mt-2 max-w-lg text-xs text-rose-700">{failure(bill)}</p>}
                {settled(bill) && <p className="mt-1 text-xs text-slate-500">{(Array.isArray(bill.payment_methods) ? bill.payment_methods : []).map(paymentMethodLabel).join(', ')}</p>}
              </div>
              <div className="flex flex-wrap items-center gap-3 sm:gap-5"><div className="text-right"><p className="text-xs text-slate-500">{section === 'history' && settled(bill) ? 'Total' : 'Balance due'}</p><p className="text-lg font-black tabular-nums text-slate-900">{formatMoney(section === 'history' && settled(bill) ? bill.total_amount : amountDue)}</p></div>
                <Link to={to} className="button-secondary inline-flex items-center gap-1">{section === 'history' || status === 'paid' || !canCheckout ? 'View Bill' : status === 'failed' ? 'Review Payment' : 'Bill Checkout'} <MdArrowForward/></Link></div>
            </article>
          })}</div>}
      <div className="p-3"><Pagination page={pagination.page || page} totalPages={pagination.totalPages || 1} pageSize={pageSize} total={pagination.total || 0} disabled={loading} onPageChange={setPage} onPageSizeChange={size => {setPageSize(size);setPage(1)}} /></div>
    </section>}
  </main>
}
