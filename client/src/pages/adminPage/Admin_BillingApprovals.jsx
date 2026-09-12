import { useCallback, useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { MdApproval, MdCheck, MdClose, MdRefresh } from 'react-icons/md'
import { getBillingAdjustmentRequests, resolveBillingAdjustmentRequest } from '../../services/admin.service'
import { useToast } from '../../components/ui/ToastProvider'
import Modal from '../../components/ui/Modal'
import { LoadingState, ErrorState, EmptyState } from '../../components/ui/PageState'
import AdminBillingNav from '../../components/billing/AdminBillingNav'
import { formatMoney } from '../../utils/billingUi'

const TABS = [['pending', 'Pending'], ['approved', 'Approved'], ['rejected', 'Rejected']]

const Admin_BillingApprovals = () => {
  const toast = useToast()
  const [tab, setTab] = useState('pending')
  const [rows, setRows] = useState([])
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
        getBillingAdjustmentRequests({ status: tab }),
        tab === 'pending' ? Promise.resolve(null) : getBillingAdjustmentRequests({ status: 'pending' }),
      ])
      setRows(Array.isArray(current) ? current : [])
      setPendingCount(tab === 'pending' ? (Array.isArray(current) ? current.length : 0) : (Array.isArray(pending) ? pending.length : 0))
    } catch (err) { const message = err.message || 'Could not load billing approvals.'; setError(message); toast.error(message) }
    finally { setLoading(false) }
  }, [tab, toast])

  useEffect(() => { load() }, [load])

  const confirm = async () => {
    if (!action?.request?.id) return
    setBusy(true)
    try {
      await resolveBillingAdjustmentRequest(action.request.id, { status: action.status, admin_note: note.trim() || null })
      toast.success(`Request ${action.status}.`)
      setAction(null); setNote(''); await load()
    } catch (err) { toast.error(err.message || 'Could not resolve the request.') }
    finally { setBusy(false) }
  }

  const valueLine = (request) => request.request_type === 'discount'
    ? `${request.discount_label || 'Discount'}${request.requested_amount ? ` · ${formatMoney(request.requested_amount)}` : ''}`
    : `${request.service_name || 'Service'} → ${formatMoney(request.requested_price)}`

  return (
    <div className="mx-auto w-full max-w-7xl space-y-5">
      <div className="flex flex-wrap items-start justify-between gap-3"><div><h1 className="flex items-center gap-2 text-2xl font-bold text-slate-900"><MdApproval className="text-amber-500" /> Billing Approvals</h1><p className="mt-1 text-sm text-slate-500">Review discount and price-override requests separately from transaction history.</p></div><button className="button-secondary" onClick={load}><MdRefresh /> Refresh</button></div>
      <AdminBillingNav pendingApprovals={pendingCount} />
      <div className="flex gap-2 overflow-x-auto">{TABS.map(([value, label]) => <button key={value} type="button" onClick={() => setTab(value)} className={`rounded-xl px-4 py-2.5 text-sm font-bold ${tab === value ? 'bg-[#0b1a2c] text-amber-400' : 'border border-slate-200 bg-white text-slate-500 hover:bg-slate-50'}`}>{label}{value === 'pending' && pendingCount > 0 ? ` (${pendingCount})` : ''}</button>)}</div>

      <section className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
        {loading ? <LoadingState label="Loading approval requests..." /> : error ? <ErrorState message={error} onRetry={load} /> : rows.length === 0 ? <EmptyState title={`No ${tab} requests`} description={tab === 'pending' ? 'New discount and price-override requests will appear here.' : 'Resolved requests will appear here for reference.'} /> : (
          <div className="grid gap-4 lg:grid-cols-2">
            {rows.map((request) => <article key={request.id} className="rounded-2xl border border-slate-200 p-4"><div className="flex flex-wrap items-start justify-between gap-3"><div><span className={`inline-flex rounded-full px-2.5 py-1 text-[10px] font-black uppercase tracking-wider ${request.request_type === 'discount' ? 'bg-violet-50 text-violet-700' : 'bg-sky-50 text-sky-700'}`}>{request.request_type === 'discount' ? 'Discount' : 'Price Override'}</span><h2 className="mt-3 text-lg font-black text-slate-900">{request.patient_name}</h2><p className="mt-1 text-sm font-bold text-slate-700">{valueLine(request)}</p></div><Link to={`/admin/billing/transactions/${request.billing_id}`} className="text-xs font-bold text-amber-700">Bill #{request.billing_id}</Link></div><div className="mt-4 rounded-xl bg-slate-50 p-3 text-sm text-slate-600"><p><strong>Requested by:</strong> {request.staff_name || 'Staff'}</p><p className="mt-2"><strong>Reason:</strong> {request.reason || '—'}</p>{request.reference_text && <p className="mt-2"><strong>Reference:</strong> {request.reference_text}</p>}{request.admin_note && <p className="mt-2"><strong>Admin note:</strong> {request.admin_note}</p>}</div>{tab === 'pending' && <div className="mt-4 flex justify-end gap-2"><button className="button-secondary text-rose-700" onClick={() => { setAction({ request, status: 'rejected' }); setNote('') }}><MdClose /> Reject</button><button className="button-primary" onClick={() => { setAction({ request, status: 'approved' }); setNote('') }}><MdCheck /> Approve</button></div>}</article>)}
          </div>
        )}
      </section>

      <Modal open={Boolean(action)} onClose={() => !busy && setAction(null)} closeDisabled={busy} title={action?.status === 'approved' ? 'Approve Billing Request?' : 'Reject Billing Request?'} description={action?.request ? `${action.request.patient_name} · Bill #${action.request.billing_id}` : ''} size="md">
        {action && <div className="space-y-4"><div className="rounded-2xl bg-slate-50 p-4 text-sm"><p className="font-black text-slate-900">{valueLine(action.request)}</p><p className="mt-2 text-slate-600">{action.request.reason || 'No reason provided.'}</p></div><label className="block"><span className="form-label">{action.status === 'rejected' ? 'Rejection Note' : 'Approval Note'} (optional)</span><textarea rows={3} className="form-control mt-1.5 resize-none" value={note} onChange={(e) => setNote(e.target.value)} placeholder="Add context for the audit record." /></label><div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end"><button className="button-secondary" disabled={busy} onClick={() => setAction(null)}>Cancel</button><button className={action.status === 'approved' ? 'button-primary' : 'button-danger'} disabled={busy} onClick={confirm}>{busy ? 'Working…' : action.status === 'approved' ? 'Approve Request' : 'Reject Request'}</button></div></div>}
      </Modal>
    </div>
  )
}

export default Admin_BillingApprovals
