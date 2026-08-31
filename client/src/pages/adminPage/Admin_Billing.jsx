import { useCallback, useEffect, useMemo, useState } from 'react'
import { MdPayments, MdRefresh, MdSearch, MdReceiptLong, MdUndo, MdBlock, MdCalendarToday } from 'react-icons/md'
import Modal from '../../components/ui/Modal'
import Pagination from '../../components/ui/Pagination'
import { useToast } from '../../components/ui/ToastProvider'
import {
  getBills, getBillById, getBillingReconciliation, voidBillingPayment, refundBillingPayment,
  getBillingAdjustmentRequests, resolveBillingAdjustmentRequest,
} from '../../services/admin.service'
import { getLocalDateOnly, formatDateOnly } from '../../utils/date'

const peso = (value) => new Intl.NumberFormat('en-PH', { style: 'currency', currency: 'PHP' }).format(Number(value || 0))
const statusTone = {
  draft: 'bg-slate-100 text-slate-700', pending: 'bg-slate-100 text-slate-700', ready: 'bg-amber-50 text-amber-700',
  partially_paid: 'bg-sky-50 text-sky-700', paid: 'bg-emerald-50 text-emerald-700', voided: 'bg-rose-50 text-rose-700', refunded: 'bg-violet-50 text-violet-700',
}
const Status = ({ value }) => <span className={`inline-flex rounded-full px-2.5 py-1 text-xs font-bold ${statusTone[value] || 'bg-slate-100 text-slate-600'}`}>{String(value || '').replace(/_/g,' ').replace(/\b\w/g, (m) => m.toUpperCase())}</span>

const Admin_Billing = () => {
  const toast = useToast()
  const [data, setData] = useState({ items: [], summary: {}, pagination: { page: 1, totalPages: 1 } })
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [status, setStatus] = useState('')
  const [page, setPage] = useState(1)
  const [selected, setSelected] = useState(null)
  const [reconciliation, setReconciliation] = useState(null)
  const [reconDate, setReconDate] = useState(getLocalDateOnly())
  const [busy, setBusy] = useState(false)
  const [adjustments, setAdjustments] = useState([])
  const [adjustmentLoading, setAdjustmentLoading] = useState(true)

  const load = useCallback(async () => {
    setLoading(true)
    try { setData(await getBills({ search, status, page, limit: 12 })) }
    catch (error) { toast.error(error.message || 'Could not load billing records.') }
    finally { setLoading(false) }
  }, [page, search, status, toast])

  const loadAdjustments = useCallback(async () => {
    setAdjustmentLoading(true)
    try {
      const rows = await getBillingAdjustmentRequests({ status: 'pending' })
      setAdjustments(Array.isArray(rows) ? rows : [])
    } catch (error) {
      setAdjustments([])
      toast.error(error.message || 'Could not load billing approval requests.')
    } finally { setAdjustmentLoading(false) }
  }, [toast])

  useEffect(() => { load(); loadAdjustments() }, [load, loadAdjustments])
  useEffect(() => {
    const refresh = () => { load(); loadAdjustments() }
    window.addEventListener('clinic:refresh', refresh)
    return () => window.removeEventListener('clinic:refresh', refresh)
  }, [load, loadAdjustments])

  const openBill = async (id) => {
    try { setSelected(await getBillById(id)) }
    catch (error) { toast.error(error.message || 'Could not load bill.') }
  }
  const loadReconciliation = async () => {
    try { setReconciliation(await getBillingReconciliation(reconDate)) }
    catch (error) { toast.error(error.message || 'Could not load reconciliation.') }
  }
  const actPayment = async (payment, action) => {
    const reason = window.prompt(`${action === 'void' ? 'Void' : 'Refund'} reason:`)
    if (!reason?.trim()) return
    setBusy(true)
    try {
      const updated = action === 'void'
        ? await voidBillingPayment(payment.id, reason)
        : await refundBillingPayment(payment.id, { reason })
      setSelected(updated)
      toast.success(action === 'void' ? 'Payment voided.' : 'Payment refunded.')
      await load()
    } catch (error) { toast.error(error.message || 'Action failed.') }
    finally { setBusy(false) }
  }

  const resolveAdjustment = async (request, nextStatus) => {
    const note = window.prompt(`${nextStatus === 'approved' ? 'Approval' : 'Rejection'} note (optional):`)
    if (note === null) return
    setBusy(true)
    try {
      await resolveBillingAdjustmentRequest(request.id, { status: nextStatus, admin_note: note.trim() || null })
      toast.success(`Billing request ${nextStatus}.`)
      await Promise.all([loadAdjustments(), load()])
    } catch (error) { toast.error(error.message || 'Could not resolve billing approval request.') }
    finally { setBusy(false) }
  }

  const cards = useMemo(() => [
    ['Draft', data.summary?.draft ?? data.summary?.pending ?? 0],
    ['Ready', data.summary?.ready ?? 0],
    ['Partially Paid', data.summary?.partially_paid ?? 0],
    ['Paid', data.summary?.paid ?? 0],
    ['Outstanding', peso(data.summary?.outstanding)],
    ['Collected', peso(data.summary?.collected)],
  ], [data.summary])

  return (
    <div className="mx-auto w-full max-w-7xl space-y-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div><h1 className="flex items-center gap-2 text-2xl font-bold text-slate-900"><MdPayments className="text-amber-500" /> Billing</h1><p className="mt-1 text-sm text-slate-500">Financial oversight, payment history, refunds, voids, and cashier reconciliation.</p></div>
        <button className="button-secondary" onClick={load}><MdRefresh /> Refresh</button>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-6">
        {cards.map(([label,value]) => <div key={label} className="rounded-2xl border border-slate-200 bg-white p-4"><p className="text-xs font-bold uppercase tracking-wider text-slate-400">{label}</p><p className="mt-2 text-xl font-black text-slate-900">{value}</p></div>)}
      </div>

      <section className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
        <div className="flex flex-wrap gap-3">
          <label className="relative min-w-[260px] flex-1"><MdSearch className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" /><input className="form-control pl-11" placeholder="Search patient, doctor, bill..." value={search} onChange={(e)=>{setSearch(e.target.value);setPage(1)}} /></label>
          <select className="form-control max-w-[210px]" value={status} onChange={(e)=>{setStatus(e.target.value);setPage(1)}}><option value="">All statuses</option><option value="draft">Draft</option><option value="ready">Ready for Payment</option><option value="partially_paid">Partially Paid</option><option value="paid">Paid</option><option value="voided">Voided</option><option value="refunded">Refunded</option></select>
        </div>
        <div className="mt-4 overflow-x-auto">
          <table className="min-w-full text-left text-sm">
            <thead className="border-b border-slate-100 text-xs uppercase tracking-wider text-slate-400"><tr><th className="px-3 py-3">Patient</th><th className="px-3 py-3">Doctor</th><th className="px-3 py-3">Date</th><th className="px-3 py-3 text-right">Total</th><th className="px-3 py-3 text-right">Paid</th><th className="px-3 py-3 text-right">Balance</th><th className="px-3 py-3">Status</th><th className="px-3 py-3"></th></tr></thead>
            <tbody className="divide-y divide-slate-100">
              {loading ? <tr><td colSpan="8" className="p-10 text-center text-slate-400">Loading billing records…</td></tr> : data.items?.length ? data.items.map((bill)=><tr key={bill.id}><td className="px-3 py-3 font-bold text-slate-900">{bill.patient_name}</td><td className="px-3 py-3 text-slate-600">{bill.doctor_name}</td><td className="px-3 py-3 text-slate-600">{formatDateOnly(bill.appointment_date)}</td><td className="px-3 py-3 text-right font-semibold">{peso(bill.total_amount)}</td><td className="px-3 py-3 text-right text-emerald-700">{peso(bill.paid_amount)}</td><td className="px-3 py-3 text-right font-bold">{peso(bill.balance_amount)}</td><td className="px-3 py-3"><Status value={bill.status}/></td><td className="px-3 py-3 text-right"><button className="button-secondary" onClick={()=>openBill(bill.id)}><MdReceiptLong/> View</button></td></tr>) : <tr><td colSpan="8" className="p-10 text-center text-slate-400">No billing records found.</td></tr>}
            </tbody>
          </table>
        </div>
        <div className="mt-4"><Pagination page={data.pagination?.page || page} totalPages={data.pagination?.totalPages || 1} onPageChange={setPage} /></div>
      </section>

      <section className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2 className="text-lg font-bold text-slate-900">Pending Billing Approvals</h2>
            <p className="text-sm text-slate-500">Review Staff requests for protected discounts and clinic-service Patient Price overrides.</p>
          </div>
          <span className="rounded-full bg-amber-50 px-3 py-1 text-xs font-bold text-amber-700">{adjustments.length} pending</span>
        </div>
        <div className="mt-4 space-y-3">
          {adjustmentLoading ? (
            <p className="rounded-2xl bg-slate-50 p-4 text-sm text-slate-400">Loading approval requests…</p>
          ) : adjustments.length === 0 ? (
            <p className="rounded-2xl border border-dashed border-slate-200 bg-slate-50 p-4 text-sm text-slate-400">No billing approval requests are waiting.</p>
          ) : adjustments.map((request) => (
            <div key={request.id} className="rounded-2xl border border-slate-200 p-4">
              <div className="flex flex-wrap items-start justify-between gap-4">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="rounded-full bg-violet-50 px-2.5 py-1 text-[11px] font-bold uppercase tracking-wider text-violet-700">{String(request.request_type || '').replace('_', ' ')}</span>
                    <span className="text-xs text-slate-400">Bill #{request.billing_id}</span>
                  </div>
                  <p className="mt-2 font-bold text-slate-900">{request.patient_name || 'Patient'}</p>
                  <p className="text-xs text-slate-500">Requested by {request.staff_name || 'Staff'} · {new Date(request.created_at).toLocaleString('en-PH')}</p>
                  <p className="mt-2 text-sm text-slate-700">
                    {request.request_type === 'discount'
                      ? `${request.discount_label || 'Discount'} · Requested ${peso(request.requested_amount)}`
                      : `${request.service_name || 'Clinic Service'} · Requested Patient Price ${peso(request.requested_price)}`}
                  </p>
                  {request.reference_text && <p className="mt-1 text-xs text-slate-500"><strong>Reference:</strong> {request.reference_text}</p>}
                  <p className="mt-1 text-xs text-slate-500"><strong>Reason:</strong> {request.reason || '—'}</p>
                </div>
                <div className="flex gap-2">
                  <button disabled={busy} className="button-secondary" onClick={() => resolveAdjustment(request, 'rejected')}>Reject</button>
                  <button disabled={busy} className="button-primary" onClick={() => resolveAdjustment(request, 'approved')}>Approve</button>
                </div>
              </div>
            </div>
          ))}
        </div>
      </section>

      <section className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
        <div className="flex flex-wrap items-end justify-between gap-3"><div><h2 className="text-lg font-bold text-slate-900">Cashier Reconciliation</h2><p className="text-sm text-slate-500">Compare collections, refunds, cash expectations, and closed shifts.</p></div><div className="flex gap-2"><label className="relative"><MdCalendarToday className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400"/><input type="date" className="form-control pl-9" value={reconDate} onChange={(e)=>setReconDate(e.target.value)}/></label><button className="button-primary" onClick={loadReconciliation}>Load</button></div></div>
        {reconciliation && <div className="mt-4 grid gap-3 md:grid-cols-4"><div className="rounded-2xl bg-slate-50 p-4"><p className="text-xs text-slate-500">Gross Collected</p><p className="mt-1 text-xl font-bold">{peso(reconciliation.summary?.gross_collected)}</p></div><div className="rounded-2xl bg-slate-50 p-4"><p className="text-xs text-slate-500">Refunded</p><p className="mt-1 text-xl font-bold">{peso(reconciliation.summary?.refunded)}</p></div><div className="rounded-2xl bg-slate-50 p-4"><p className="text-xs text-slate-500">Expected Cash</p><p className="mt-1 text-xl font-bold">{peso(reconciliation.summary?.expected_cash)}</p></div><div className="rounded-2xl bg-slate-50 p-4"><p className="text-xs text-slate-500">Discounts</p><p className="mt-1 text-xl font-bold">{peso(reconciliation.summary?.discounts)}</p></div></div>}
      </section>

      <Modal open={Boolean(selected)} onClose={()=>setSelected(null)} title="Billing Details" description={selected ? `${selected.patient_name} • ${selected.doctor_name}` : ''} size="xl">
        {selected && <div className="space-y-5">
          <div className="grid gap-3 sm:grid-cols-4"><div className="rounded-2xl bg-slate-50 p-3"><p className="text-xs text-slate-400">Total</p><p className="font-bold">{peso(selected.total_amount)}</p></div><div className="rounded-2xl bg-slate-50 p-3"><p className="text-xs text-slate-400">Paid</p><p className="font-bold text-emerald-700">{peso(selected.paid_amount)}</p></div><div className="rounded-2xl bg-slate-50 p-3"><p className="text-xs text-slate-400">Balance</p><p className="font-bold">{peso(selected.balance_amount)}</p></div><div className="rounded-2xl bg-slate-50 p-3"><p className="text-xs text-slate-400">Status</p><Status value={selected.status}/></div></div>
          <div><h3 className="mb-2 text-sm font-bold text-slate-900">Bill Items</h3><div className="divide-y rounded-2xl border border-slate-200">{selected.items?.map((item)=><div key={item.id} className="flex justify-between gap-4 p-3 text-sm"><div><p className="font-semibold text-slate-800">{item.service_name}</p><p className="text-xs text-slate-500">{item.quantity} × {peso(item.unit_price)}</p></div><p className="font-bold">{peso(item.line_total)}</p></div>)}</div></div>
          <div><h3 className="mb-2 text-sm font-bold text-slate-900">Payments</h3>{selected.payments?.length ? <div className="space-y-2">{selected.payments.map((payment)=><div key={payment.id} className="rounded-2xl border border-slate-200 p-3"><div className="flex flex-wrap items-center justify-between gap-3"><div><p className="font-semibold text-slate-900">{peso(payment.amount)} • {String(payment.payment_method).toUpperCase()}</p><p className="text-xs text-slate-500">{payment.receipt_number} • {new Date(payment.paid_at).toLocaleString('en-PH')}</p>{Number(payment.refund_amount||0)>0&&<p className="text-xs font-semibold text-violet-600">Refunded: {peso(payment.refund_amount)}</p>}{payment.status==='voided'&&<p className="text-xs font-semibold text-rose-600">VOIDED — {payment.void_reason}</p>}</div>{payment.status==='completed'&&<div className="flex gap-2"><button disabled={busy} className="button-secondary" onClick={()=>actPayment(payment,'refund')}><MdUndo/> Refund</button><button disabled={busy} className="button-danger" onClick={()=>actPayment(payment,'void')}><MdBlock/> Void</button></div>}</div></div>)}</div> : <p className="text-sm text-slate-400">No payments yet.</p>}</div>
        </div>}
      </Modal>
    </div>
  )
}

export default Admin_Billing
