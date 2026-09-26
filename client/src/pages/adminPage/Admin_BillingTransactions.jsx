import { useCallback, useEffect, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { MdReceiptLong, MdRefresh, MdSearch, MdClose } from 'react-icons/md'
import { getBills, getBillingAdjustmentRequests } from '../../services/admin.service'
import { useToast } from '../../components/ui/ToastProvider'
import Pagination from '../../components/ui/Pagination'
import { LoadingState, ErrorState, EmptyState } from '../../components/ui/PageState'
import AdminBillingNav from '../../components/billing/AdminBillingNav'
import BillingStatusBadge from '../../components/billing/BillingStatusBadge'
import { formatMoney, paymentMethodLabel } from '../../utils/billingUi'
import { formatDateOnly } from '../../utils/date'

const STATUS_OPTIONS = [
  ['', 'All Statuses'], ['draft', 'Draft'], ['ready', 'Ready'], ['partially_paid', 'Partially Paid'], ['paid', 'Paid'], ['refunded', 'Refunded'], ['voided', 'Voided'],
]

const Admin_BillingTransactions = () => {
  const toast = useToast()
  const [params, setParams] = useSearchParams()
  const [search, setSearch] = useState(params.get('search') || '')
  const [status, setStatus] = useState(params.get('status') || '')
  const [paymentMethod, setPaymentMethod] = useState(params.get('payment_method') || '')
  const [dateBasis, setDateBasis] = useState(params.get('date_basis') || 'visit')
  const [dateFrom, setDateFrom] = useState(params.get('date_from') || '')
  const [dateTo, setDateTo] = useState(params.get('date_to') || '')
  const [page, setPage] = useState(Number(params.get('page')) || 1)
  const [pageSize, setPageSize] = useState(12)
  const [data, setData] = useState({ items: [], summary: {}, pagination: { page: 1, total: 0, totalPages: 1 } })
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [pendingApprovals, setPendingApprovals] = useState(0)

  const load = useCallback(async () => {
    setLoading(true); setError('')
    try {
      const [bills, pending] = await Promise.all([
        getBills({ search, status, payment_method: paymentMethod, date_basis: dateBasis, date_from: dateFrom, date_to: dateTo, page, limit: pageSize }),
        getBillingAdjustmentRequests({ status: 'pending' }).catch(() => []),
      ])
      setData(bills)
      setPendingApprovals(Number(pending?.pagination?.total ?? pending?.items?.length ?? pending?.length ?? 0))
    } catch (err) {
      const message = err.message || 'Could not load transactions.'
      setError(message); toast.error(message)
    } finally { setLoading(false) }
  }, [dateBasis, dateFrom, dateTo, page, pageSize, paymentMethod, search, status, toast])

  useEffect(() => {
    const timer = window.setTimeout(load, search ? 250 : 0)
    return () => window.clearTimeout(timer)
  }, [load, search])

  useEffect(() => {
    const next = {}
    if (search) next.search = search
    if (status) next.status = status
    if (paymentMethod) next.payment_method = paymentMethod
    if (dateBasis !== 'visit') next.date_basis = dateBasis
    if (dateFrom) next.date_from = dateFrom
    if (dateTo) next.date_to = dateTo
    if (page > 1) next.page = String(page)
    setParams(next, { replace: true })
  }, [dateBasis, dateFrom, dateTo, page, paymentMethod, search, setParams, status])

  const clearFilters = () => { setSearch(''); setStatus(''); setPaymentMethod(''); setDateBasis('visit'); setDateFrom(''); setDateTo(''); setPage(1) }

  return (
    <div className="mx-auto w-full max-w-7xl space-y-5">
      <div className="flex flex-wrap items-start justify-between gap-3"><div><h1 className="flex items-center gap-2 text-2xl font-bold text-slate-900"><MdReceiptLong className="text-amber-500" /> Transactions</h1><p className="mt-1 text-sm text-slate-500">Search and review the complete billing history. Open a transaction for receipts, refunds, and void actions.</p></div><button type="button" className="button-secondary" onClick={load}><MdRefresh /> Refresh</button></div>
      <AdminBillingNav pendingApprovals={pendingApprovals} />

      <section className="rounded-3xl border border-slate-200 bg-white p-4 shadow-sm">
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-7">
          <label className="relative xl:col-span-2"><MdSearch className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" /><input className="form-control pl-10" value={search} onChange={(e) => { setSearch(e.target.value); setPage(1) }} placeholder="Patient, doctor, bill #..." />{search && <button type="button" onClick={() => setSearch('')} className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400"><MdClose /></button>}</label>
          <select className="form-control" value={status} onChange={(e) => { setStatus(e.target.value); setPage(1) }}>{STATUS_OPTIONS.map(([value, label]) => <option key={label} value={value}>{label}</option>)}</select>
          <select className="form-control" value={paymentMethod} onChange={(e) => { setPaymentMethod(e.target.value); setPage(1) }}><option value="">All Methods</option><option value="cash">Cash</option><option value="gcash">GCash</option><option value="maya">Maya</option><option value="bank_transfer">Bank Transfer</option></select>
          <select className="form-control" value={dateBasis} onChange={(e) => { setDateBasis(e.target.value); setPage(1) }} aria-label="Date basis"><option value="visit">Visit Date</option><option value="payment">Payment Date</option><option value="finalized">Bill Finalized Date</option></select>
          <input type="date" className="form-control" value={dateFrom} onChange={(e) => { setDateFrom(e.target.value); setPage(1) }} aria-label="Date from" />
          <input type="date" className="form-control" value={dateTo} onChange={(e) => { setDateTo(e.target.value); setPage(1) }} aria-label="Date to" />
        </div>
        {(search || status || paymentMethod || dateBasis !== 'visit' || dateFrom || dateTo) && <div className="mt-3 flex justify-end"><button type="button" className="text-xs font-bold text-slate-500 hover:text-slate-800" onClick={clearFilters}>Clear filters</button></div>}
      </section>

      <section className="overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-sm">
        {loading ? <LoadingState label="Loading transactions..." /> : error ? <ErrorState message={error} onRetry={load} /> : !data.items?.length ? <EmptyState title="No transactions found" description="Try changing the filters or date range." /> : (
          <div className="overflow-x-auto">
            <table className="min-w-full text-sm"><thead className="bg-slate-50 text-left text-xs uppercase tracking-wider text-slate-500"><tr><th className="px-5 py-3">Bill</th><th className="px-4 py-3">Patient</th><th className="px-4 py-3">Visit</th><th className="px-4 py-3">Total</th><th className="px-4 py-3">Paid</th><th className="px-4 py-3">Balance</th><th className="px-4 py-3">Method</th><th className="px-4 py-3">Status</th><th className="px-5 py-3 text-right">Action</th></tr></thead>
              <tbody className="divide-y divide-slate-100">{data.items.map((bill) => <tr key={bill.id} className="hover:bg-slate-50/70"><td className="px-5 py-4 font-black text-slate-800">#{bill.id}</td><td className="px-4 py-4"><p className="font-bold text-slate-900">{bill.patient_name}</p><p className="mt-0.5 text-xs text-slate-500">{bill.doctor_name}</p></td><td className="px-4 py-4 text-slate-600">{formatDateOnly(bill.appointment_date)}<p className="mt-0.5 text-xs text-slate-400">{bill.appointment_time}</p></td><td className="px-4 py-4 font-bold">{formatMoney(bill.total_amount)}</td><td className="px-4 py-4 text-emerald-700">{formatMoney(bill.paid_amount)}</td><td className="px-4 py-4 font-bold">{formatMoney(bill.balance_amount)}</td><td className="px-4 py-4 text-slate-600">{Array.isArray(bill.payment_methods) && bill.payment_methods.length > 1 ? bill.payment_methods.map(paymentMethodLabel).join(' + ') : Array.isArray(bill.payment_methods) && bill.payment_methods.length === 1 ? paymentMethodLabel(bill.payment_methods[0]) : bill.payment_method ? paymentMethodLabel(bill.payment_method) : '—'}</td><td className="px-4 py-4"><BillingStatusBadge status={bill.status} /></td><td className="px-5 py-4 text-right"><Link to={`/admin/billing/transactions/${bill.id}`} className="font-bold text-amber-700 hover:text-amber-800">View</Link></td></tr>)}</tbody></table>
          </div>
        )}
        <Pagination page={data.pagination?.page || page} totalPages={data.pagination?.totalPages || 1} total={data.pagination?.total || 0} pageSize={pageSize} onPageChange={setPage} onPageSizeChange={(size) => { setPageSize(size); setPage(1) }} disabled={loading} />
      </section>
    </div>
  )
}

export default Admin_BillingTransactions
