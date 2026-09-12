import { useCallback, useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { MdApproval, MdCheck, MdClose, MdRefresh, MdSearch } from 'react-icons/md'
import { getBillingAdjustmentRequests, resolveBillingAdjustmentRequest } from '../../services/admin.service'
import { useToast } from '../../components/ui/ToastProvider'
import Modal from '../../components/ui/Modal'
import Pagination from '../../components/ui/Pagination'
import { LoadingState, ErrorState, EmptyState } from '../../components/ui/PageState'
import AdminBillingNav from '../../components/billing/AdminBillingNav'
import { formatMoney } from '../../utils/billingUi'

const TABS = [['pending', 'Pending'], ['approved', 'Approved'], ['rejected', 'Rejected'], ['expired', 'Expired'], ['cancelled', 'Cancelled']]

const Admin_BillingApprovals = () => {
  const toast = useToast()
  const [tab, setTab] = useState('pending')
  const [rows, setRows] = useState([])
  const [pagination, setPagination] = useState({ page: 1, limit: 25, total: 0, total_pages: 1 })
  const [page, setPage] = useState(1)
  const [pageSize, setPageSize] = useState(25)
  const [search, setSearch] = useState('')
  const [pendingCount, setPendingCount] = useState(0)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [action, setAction] = useState(null)
  const [note, setNote] = useState('')
  const [busy, setBusy] = useState(false)

  const load = useCallback(async () => {
    setLoading(true); setError('')
    try {
      const [current, pending] = await Promise.all([
        getBillingAdjustmentRequests({ status: tab, page, limit: pageSize, search }),
        tab === 'pending' ? Promise.resolve(null) : getBillingAdjustmentRequests({ status: 'pending', page: 1, limit: 1 }),
      ])
      setRows(Array.isArray(current?.items) ? current.items : Array.isArray(current) ? current : [])
      setPagination(current?.pagination || { page, limit: pageSize, total: Array.isArray(current) ? current.length : 0, total_pages: 1 })
      setPendingCount(tab === 'pending' ? Number(current?.pagination?.total ?? current?.items?.length ?? current?.length ?? 0) : Number(pending?.pagination?.total ?? pending?.items?.length ?? pending?.length ?? 0))
    } catch (err) { const message = err.message || 'Could not load billing approvals.'; setError(message); toast.error(message) }
    finally { setLoading(false) }
  }, [tab, page, pageSize, search, toast])

  useEffect(() => { const timer = window.setTimeout(load, search ? 250 : 0); return () => window.clearTimeout(timer) }, [load, search])

  const confirm = async () => {
    if (!action?.request?.id) return
    if (action.status === 'rejected' && !note.trim()) return toast.error('Enter a rejection reason so Staff knows what needs to be corrected.')
    setBusy(true)
    try {
      await resolveBillingAdjustmentRequest(action.request.id, { status: action.status, admin_note: note.trim() || null })
      toast.success(`Request ${action.status}.`)
      setAction(null); setNote(''); await load()
    } catch (err) { toast.error(err.message || 'Could not resolve the request.'); await load() }
    finally { setBusy(false) }
  }

  const valueLine = (request) => request.request_type === 'discount'
    ? `${request.discount_label || 'Discount'}${request.requested_amount ? ` · ${formatMoney(request.requested_amount)}` : ''}`
    : `${request.service_name || 'Service'} → ${formatMoney(request.requested_price)}`

  const priceContext = (request) => {
    if (request.request_type !== 'price_override') return null
    const current = Number(request.current_price || 0)
    const requested = Number(request.requested_price || 0)
    const difference = requested - current
    const percentage = current > 0 ? (difference / current) * 100 : null
    return { current, requested, difference, percentage }
  }

  return (
    <div className="mx-auto w-full max-w-7xl space-y-5">
      <div className="flex flex-wrap items-start justify-between gap-3"><div><h1 className="flex items-center gap-2 text-2xl font-bold text-slate-900"><MdApproval className="text-amber-500" /> Billing Approvals</h1><p className="mt-1 text-sm text-slate-500">Review financial exceptions with the bill context that existed when Staff requested them.</p></div><button className="button-secondary" onClick={load}><MdRefresh /> Refresh</button></div>
      <AdminBillingNav pendingApprovals={pendingCount} />
      <div className="flex gap-2 overflow-x-auto">{TABS.map(([value, label]) => <button key={value} type="button" onClick={() => { setTab(value); setPage(1) }} className={`rounded-xl px-4 py-2.5 text-sm font-bold ${tab === value ? 'bg-[#0b1a2c] text-amber-400' : 'border border-slate-200 bg-white text-slate-500 hover:bg-slate-50'}`}>{label}{value === 'pending' && pendingCount > 0 ? ` (${pendingCount})` : ''}</button>)}</div>

      <section className="overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-sm">
        <div className="border-b border-slate-100 p-4"><div className="relative max-w-xl"><MdSearch className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" /><input className="form-control pl-10" value={search} onChange={(e) => { setSearch(e.target.value); setPage(1) }} placeholder="Search patient, staff, service, or discount..." /></div></div>
        <div className="p-5">
          {loading ? <LoadingState label="Loading approval requests..." /> : error ? <ErrorState message={error} onRetry={load} /> : rows.length === 0 ? <EmptyState title={`No ${tab} requests`} description={tab === 'pending' ? 'New discount and price-override requests will appear here.' : 'No requests match this status.'} /> : (
            <div className="grid gap-4 lg:grid-cols-2">
              {rows.map((request) => {
                const context = priceContext(request)
                const stale = Number(request.bill_version || 1) !== Number(request.current_bill_version || 1)
                return <article key={request.id} className={`rounded-2xl border p-4 ${stale && request.status === 'pending' ? 'border-amber-300 bg-amber-50/40' : 'border-slate-200'}`}>
                  <div className="flex flex-wrap items-start justify-between gap-3"><div><span className={`inline-flex rounded-full px-2.5 py-1 text-[10px] font-black uppercase tracking-wider ${request.request_type === 'discount' ? 'bg-violet-50 text-violet-700' : 'bg-sky-50 text-sky-700'}`}>{request.request_type === 'discount' ? 'Discount' : 'Price Override'}</span><h2 className="mt-3 text-lg font-black text-slate-900">{request.patient_name}</h2><p className="mt-1 text-sm font-bold text-slate-700">{valueLine(request)}</p></div><Link to={`/admin/billing/transactions/${request.billing_id}`} className="text-xs font-bold text-amber-700">Bill #{request.billing_id}</Link></div>
                  {stale && <div className="mt-3 rounded-xl bg-amber-100 p-3 text-sm font-bold text-amber-900">This request belongs to bill version {request.bill_version}, while the current bill is version {request.current_bill_version}. It cannot be safely approved.</div>}
                  {context && <div className="mt-4 grid grid-cols-2 gap-2 text-sm sm:grid-cols-4"><div className="rounded-xl bg-slate-50 p-3"><span className="text-xs text-slate-400">Standard</span><strong className="mt-1 block">{formatMoney(context.current)}</strong></div><div className="rounded-xl bg-slate-50 p-3"><span className="text-xs text-slate-400">Requested</span><strong className="mt-1 block">{formatMoney(context.requested)}</strong></div><div className="rounded-xl bg-slate-50 p-3"><span className="text-xs text-slate-400">Difference</span><strong className={`mt-1 block ${context.difference < 0 ? 'text-rose-700' : 'text-emerald-700'}`}>{formatMoney(context.difference)}</strong></div><div className="rounded-xl bg-slate-50 p-3"><span className="text-xs text-slate-400">Change</span><strong className="mt-1 block">{context.percentage === null ? '—' : `${context.percentage.toFixed(1)}%`}</strong></div></div>}
                  {request.request_type === 'discount' && <div className="mt-4 grid grid-cols-3 gap-2 text-sm"><div className="rounded-xl bg-slate-50 p-3"><span className="text-xs text-slate-400">Subtotal</span><strong className="mt-1 block">{formatMoney(request.bill_subtotal)}</strong></div><div className="rounded-xl bg-slate-50 p-3"><span className="text-xs text-slate-400">Requested</span><strong className="mt-1 block text-violet-700">{formatMoney(request.requested_amount)}</strong></div><div className="rounded-xl bg-slate-50 p-3"><span className="text-xs text-slate-400">After</span><strong className="mt-1 block">{formatMoney(Math.max(0, Number(request.bill_subtotal || 0) - Number(request.requested_amount || 0)))}</strong></div></div>}
                  <div className="mt-4 rounded-xl bg-slate-50 p-3 text-sm text-slate-600"><p><strong>Requested by:</strong> {request.staff_name || 'Staff'}</p><p className="mt-2"><strong>Reason:</strong> {request.reason || '—'}</p>{request.reference_text && <p className="mt-2"><strong>Reference:</strong> {request.reference_text}</p>}{request.admin_note && <p className="mt-2"><strong>Admin note:</strong> {request.admin_note}</p>}</div>
                  {tab === 'pending' && <div className="mt-4 flex justify-end gap-2"><button className="button-secondary text-rose-700" onClick={() => { setAction({ request, status: 'rejected' }); setNote('') }}><MdClose /> Reject</button><button className="button-primary" disabled={stale} onClick={() => { setAction({ request, status: 'approved' }); setNote('') }}><MdCheck /> Approve</button></div>}
                </article>
              })}
            </div>
          )}
        </div>
        <div className="border-t border-slate-100 p-4"><Pagination page={pagination.page || page} totalPages={pagination.total_pages || 1} pageSize={pageSize} total={pagination.total || 0} onPageChange={setPage} onPageSizeChange={(size) => { setPageSize(size); setPage(1) }} /></div>
      </section>

      <Modal open={Boolean(action)} onClose={() => !busy && setAction(null)} closeDisabled={busy} title={action?.status === 'approved' ? 'Approve Billing Request?' : 'Reject Billing Request?'} description={action?.request ? `${action.request.patient_name} · Bill #${action.request.billing_id}` : ''} size="md">
        {action && <div className="space-y-4"><div className="rounded-2xl bg-slate-50 p-4 text-sm"><p className="font-black text-slate-900">{valueLine(action.request)}</p><p className="mt-2 text-slate-600">{action.request.reason || 'No reason provided.'}</p></div><label className="block"><span className="form-label">{action.status === 'rejected' ? 'Rejection Reason *' : 'Approval Note (optional)'}</span><textarea rows={3} className="form-control mt-1.5 resize-none" value={note} onChange={(e) => setNote(e.target.value)} placeholder={action.status === 'rejected' ? 'Explain why this request cannot be approved.' : 'Add optional context for the audit record.'} /></label><div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end"><button className="button-secondary" disabled={busy} onClick={() => setAction(null)}>Cancel</button><button className={action.status === 'approved' ? 'button-primary' : 'button-danger'} disabled={busy || (action.status === 'rejected' && !note.trim())} onClick={confirm}>{busy ? 'Working…' : action.status === 'approved' ? 'Approve Request' : 'Reject Request'}</button></div></div>}
      </Modal>
    </div>
  )
}

export default Admin_BillingApprovals
