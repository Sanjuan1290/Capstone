import { useCallback, useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { MdClose, MdPrint, MdReceiptLong, MdRefresh, MdSearch } from 'react-icons/md'
import { getBills, getBillById } from '../../services/staff.service'
import { getClinicSettings } from '../../services/clinic.service'
import { useToast } from '../../components/ui/ToastProvider'
import Pagination from '../../components/ui/Pagination'
import Modal from '../../components/ui/Modal'
import BillingStatusBadge from '../../components/billing/BillingStatusBadge'
import { EmptyState, ErrorState, LoadingState } from '../../components/ui/PageState'
import { formatMoney, paymentMethodLabel } from '../../utils/billingUi'
import { printBillingReceipt } from '../../utils/billingReceipt'

const STATUS_OPTIONS = [
  ['', 'Any status'], ['draft', 'Needs Review'], ['ready', 'Ready to Collect'],
  ['partially_paid', 'Balance Remaining'], ['paid', 'Completed'],
  ['refunded', 'Refunded'], ['voided', 'Voided'],
]

// Read-only Staff transaction browser. This is intentionally not an Admin screen:
// no approval, void, refund, or payment mutation controls are exposed here.
export default function Staff_BillingRecords({ embedded = false, canCheckout = false, paymentHelp = false }) {
  const toast = useToast()
  const [search, setSearch] = useState('')
  const [status, setStatus] = useState('')
  const [dateFrom, setDateFrom] = useState('')
  const [dateTo, setDateTo] = useState('')
  const [page, setPage] = useState(1)
  const [pageSize, setPageSize] = useState(12)
  const [data, setData] = useState({ items: [], pagination: {} })
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [openId, setOpenId] = useState(null)
  const [bill, setBill] = useState(null)
  const [detailError, setDetailError] = useState('')
  const [detailLoading, setDetailLoading] = useState(false)
  const [clinicSettings, setClinicSettings] = useState({})

  const load = useCallback(async () => {
    setLoading(true); setError('')
    try {
      const result = await getBills({ search, status, date_from: dateFrom, date_to: dateTo, page, limit: pageSize })
      setData(result || { items: [], pagination: {} })
    } catch (err) {
      setError(err.message || 'Could not load billing records.')
    } finally {
      setLoading(false)
    }
  }, [search, status, dateFrom, dateTo, page, pageSize])

  useEffect(() => {
    const timer = window.setTimeout(load, search ? 250 : 0)
    return () => window.clearTimeout(timer)
  }, [load, search])
  useEffect(() => {
    const refresh = () => load()
    window.addEventListener('clinic:refresh', refresh)
    return () => window.removeEventListener('clinic:refresh', refresh)
  }, [load])
  const openDetail = async (id) => {
    if (detailLoading) return
    setOpenId(id); setBill(null); setDetailError(''); setDetailLoading(true)
    try {
      const [record, clinic] = await Promise.all([getBillById(id), getClinicSettings().catch(() => ({}))])
      setBill(record); setClinicSettings(clinic || {})
    } catch (err) {
      setDetailError(err.message || 'Could not load this bill.')
    } finally {
      setDetailLoading(false)
    }
  }
  const clearFilters = () => { setSearch(''); setStatus(''); setDateFrom(''); setDateTo(''); setPage(1) }
  const printReceipt = (payment) => printBillingReceipt({
    bill, payment, clinicSettings,
    onPopupBlocked: () => toast.error('Your browser blocked the receipt window. Allow pop-ups and try again.'),
  })
  const items = Array.isArray(data?.items) ? data.items : []
  const pagination = data?.pagination || {}
  return (
    <div className="w-full space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          {embedded ? <h2 className="text-lg font-bold text-slate-900">{paymentHelp ? 'Find a bill to inspect' : 'Bills & Receipts'}</h2> : <h1 className="text-2xl font-bold text-slate-900">Bills & Receipts</h1>}
          <p className="mt-1 text-sm text-slate-500">Search recorded bills, payments and balances. Billing history is read-only here.</p>
        </div>
        <button type="button" onClick={load} className="button-secondary"><MdRefresh /> Refresh List</button>
      </div>
      <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
          <label className="relative md:col-span-2 xl:col-span-4">
            <MdSearch className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" aria-hidden="true" />
            <input className="form-control pl-10 pr-10" value={search} onChange={(e) => { setSearch(e.target.value); setPage(1) }} placeholder="Patient, doctor, bill # or receipt number..." aria-label="Search billing records" />
            {search && <button type="button" aria-label="Clear search" onClick={() => { setSearch(''); setPage(1) }} className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400"><MdClose /></button>}
          </label>
          <label className="text-xs font-semibold text-slate-600">Bill status<select className="form-control mt-1" value={status} onChange={e => { setStatus(e.target.value); setPage(1) }}>{STATUS_OPTIONS.map(([value, label]) => <option value={value} key={label}>{label}</option>)}</select></label>
          <label className="text-xs font-semibold text-slate-600">Visit date from<input type="date" className="form-control mt-1" value={dateFrom} onChange={e => { setDateFrom(e.target.value); setPage(1) }} /></label>
          <label className="text-xs font-semibold text-slate-600">Visit date to<input type="date" className="form-control mt-1" value={dateTo} onChange={e => { setDateTo(e.target.value); setPage(1) }} /></label>
          <div className="flex items-end justify-end"><button type="button" onClick={clearFilters} className="min-h-11 px-3 text-sm font-semibold text-slate-600 hover:text-slate-900">Clear filters</button></div>
        </div>
      </section>
      <section className="overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-sm">
        {loading ? <div className="p-5"><LoadingState label="Loading billing records..." /></div> : error ? <div className="p-5"><ErrorState message={error} onRetry={load} /></div> : !items.length ? <div className="p-5"><EmptyState title="No billing records found" description="Try changing the search or filters." /></div> : (
          <div className="overflow-x-auto">
            <table className="min-w-full text-sm">
              <thead className="bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-500"><tr><th className="px-4 py-3">Bill</th><th className="px-4 py-3">Patient</th><th className="px-4 py-3">Doctor / Visit</th><th className="px-4 py-3 text-right">Total</th><th className="px-4 py-3 text-right">Paid</th><th className="px-4 py-3 text-right">Balance</th><th className="px-4 py-3">Status</th><th className="px-4 py-3 text-right">Actions</th></tr></thead>
              <tbody className="divide-y divide-slate-100">{items.map(record => (
                <tr key={record.id} className="hover:bg-slate-50">
                  <td className="px-4 py-4 font-bold text-slate-800">#{record.id}</td>
                  <td className="px-4 py-4 font-bold text-slate-900">{record.patient_name}</td>
                  <td className="px-4 py-4 text-slate-600">{record.doctor_name || '—'}<p className="mt-1 text-xs text-slate-400">{record.appointment_date || '—'}</p></td>
                  <td className="px-4 py-4 text-right font-semibold">{formatMoney(record.total_amount)}</td>
                  <td className="px-4 py-4 text-right text-emerald-700">{formatMoney(record.paid_amount)}</td>
                  <td className="px-4 py-4 text-right font-semibold">{formatMoney(record.balance_amount)}</td>
                  <td className="px-4 py-4"><BillingStatusBadge status={record.status} audience="staff" /></td>
                  <td className="px-4 py-4 text-right"><div className="flex flex-wrap justify-end gap-3"><button type="button" onClick={() => openDetail(record.id)} className="font-semibold text-amber-700 hover:text-amber-900">View Bill</button>{canCheckout && ['draft','pending','ready','partially_paid'].includes(record.status) && <Link to={`/staff/checkout/${record.id}`} className="font-semibold text-sky-700 hover:text-sky-900">{record.status === 'ready' || record.status === 'partially_paid' ? 'Checkout' : 'Check Charges'}</Link>}</div></td>
                </tr>
              ))}</tbody>
            </table>
          </div>
        )}
        <div className="border-t border-slate-100 p-4"><Pagination page={pagination.page || page} totalPages={pagination.totalPages || 1} total={pagination.total || 0} pageSize={pageSize} onPageChange={setPage} onPageSizeChange={size => { setPageSize(size); setPage(1) }} disabled={loading} /></div>
      </section>
      <Modal open={openId !== null} title={bill ? `Bill #${bill.id} · ${bill.patient_name}` : 'Bill Details'} description="Recorded charges and payment receipts · Read-only" onClose={() => { setOpenId(null); setBill(null) }} size="lg" closeOnEscape>
        {detailLoading ? <LoadingState label="Loading bill details..." /> : detailError ? <ErrorState message={detailError} onRetry={() => openDetail(openId)} /> : bill && <div className="space-y-5">
          <div className="grid grid-cols-2 gap-3 rounded-2xl bg-slate-50 p-4 sm:grid-cols-3">
            <div><p className="text-xs text-slate-500">Total</p><p className="text-lg font-bold">{formatMoney(bill.total_amount)}</p></div>
            <div><p className="text-xs text-slate-500">Paid</p><p className="text-lg font-bold text-emerald-700">{formatMoney(bill.paid_amount)}</p></div>
            <div><p className="text-xs text-slate-500">Balance</p><p className="text-lg font-bold">{formatMoney(bill.balance_amount)}</p></div>
          </div>
          <div><h3 className="mb-2 font-bold text-slate-900">Bill Items</h3><div className="divide-y rounded-xl border border-slate-200">{(bill.items || []).map((item, index) => <div key={item.id || index} className="flex justify-between gap-3 p-3 text-sm"><span>{item.service_name} <span className="text-slate-500">× {item.quantity}</span></span><strong>{formatMoney(item.line_total ?? (Number(item.quantity || 0) * Number(item.unit_price || 0)))}</strong></div>)}</div></div>
          {Number(bill.discount_amount || 0) > 0 && <p className="text-sm text-slate-600">Recorded discount: <strong>{formatMoney(bill.discount_amount)}</strong></p>}
          <div><h3 className="mb-2 font-bold text-slate-900">Payments & Receipts</h3>{(bill.payments || []).length ? <div className="space-y-2">{bill.payments.map(payment => <div key={payment.id} className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-slate-200 p-3 text-sm"><div><p className="font-bold">{payment.receipt_number || `Payment #${payment.id}`}</p><p className="text-xs text-slate-500">{paymentMethodLabel(payment.payment_method)} · {payment.status || 'Recorded'}</p>{Number(payment.refund_amount || 0) > 0 && <p className="text-xs font-semibold text-violet-700">Refunded: {formatMoney(payment.refund_amount)}</p>}</div><div className="text-right"><p className="font-bold">{formatMoney(payment.amount)}</p><button type="button" onClick={() => printReceipt(payment)} className="mt-1 inline-flex items-center gap-1 font-semibold text-amber-700"><MdPrint /> Print Receipt</button></div></div>)}</div> : <p className="rounded-xl bg-slate-50 p-4 text-sm text-slate-500">No recorded payments for this bill.</p>}</div>
        </div>}
      </Modal>
    </div>
  )
}
