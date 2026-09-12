import { useCallback, useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { MdArrowBack, MdBlock, MdPrint, MdReceiptLong, MdRefresh, MdUndo } from 'react-icons/md'
import { getBillById, refundBillingPayment, voidBillingPayment, getBillingAdjustmentRequests } from '../../services/admin.service'
import { getClinicSettings } from '../../services/clinic.service'
import { useToast } from '../../components/ui/ToastProvider'
import Modal from '../../components/ui/Modal'
import { LoadingState, ErrorState } from '../../components/ui/PageState'
import AdminBillingNav from '../../components/billing/AdminBillingNav'
import BillingStatusBadge from '../../components/billing/BillingStatusBadge'
import { formatMoney, paymentMethodLabel } from '../../utils/billingUi'
import { formatDateOnly } from '../../utils/date'
import { printBillingReceipt } from '../../utils/billingReceipt'

const Admin_BillingTransactionDetail = () => {
  const { billingId } = useParams()
  const toast = useToast()
  const [bill, setBill] = useState(null)
  const [clinic, setClinic] = useState({})
  const [pendingApprovals, setPendingApprovals] = useState(0)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [paymentAction, setPaymentAction] = useState(null)
  const [reason, setReason] = useState('')
  const [refundAmount, setRefundAmount] = useState('')
  const [busy, setBusy] = useState(false)
  const [shiftLocked, setShiftLocked] = useState(false)

  const load = useCallback(async () => {
    setLoading(true); setError('')
    try {
      const [record, clinicSettings, pending] = await Promise.all([
        getBillById(billingId),
        getClinicSettings().catch(() => ({})),
        getBillingAdjustmentRequests({ status: 'pending' }).catch(() => []),
      ])
      setBill(record)
      setClinic(clinicSettings || {})
      setPendingApprovals(Number(pending?.pagination?.total ?? pending?.items?.length ?? pending?.length ?? 0))
    } catch (err) {
      const message = err.message || 'Could not load the transaction.'
      setError(message); toast.error(message)
    } finally { setLoading(false) }
  }, [billingId, toast])

  useEffect(() => { load() }, [load])

  const openAction = (payment, action) => {
    const available = Math.max(0, Number(payment.amount || 0) - Number(payment.refund_amount || 0))
    setPaymentAction({ payment, action })
    setReason('')
    setRefundAmount(action === 'refund' ? String(available) : '')
  }

  const confirmAction = async () => {
    if (!paymentAction?.payment?.id || !reason.trim()) return
    setBusy(true)
    try {
      const updated = paymentAction.action === 'void'
        ? await voidBillingPayment(paymentAction.payment.id, reason.trim())
        : await refundBillingPayment(paymentAction.payment.id, { reason: reason.trim(), amount: Number(refundAmount) })
      setBill(updated)
      setShiftLocked(false)
      toast.success(paymentAction.action === 'void' ? 'Payment voided.' : 'Refund recorded.')
      setPaymentAction(null); setReason(''); setRefundAmount('')
    } catch (err) { if (err.code === 'CASHIER_SHIFT_CLOSED' || /cashier shift.*closed/i.test(err.message || '')) setShiftLocked(true); toast.error(err.message || 'Payment action failed.') }
    finally { setBusy(false) }
  }

  if (loading) return <div className="mx-auto w-full max-w-7xl space-y-5"><AdminBillingNav pendingApprovals={pendingApprovals} /><LoadingState label="Loading transaction..." /></div>
  if (error || !bill) return <div className="mx-auto w-full max-w-7xl space-y-5"><AdminBillingNav pendingApprovals={pendingApprovals} /><ErrorState message={error || 'Transaction not found.'} onRetry={load} /></div>

  return (
    <div className="mx-auto w-full max-w-7xl space-y-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div><Link to="/admin/billing/transactions" className="mb-2 inline-flex items-center gap-1 text-sm font-bold text-slate-500 hover:text-slate-800"><MdArrowBack /> Back to Transactions</Link><div className="flex flex-wrap items-center gap-3"><h1 className="flex items-center gap-2 text-2xl font-bold text-slate-900"><MdReceiptLong className="text-amber-500" /> Bill #{bill.id}</h1><BillingStatusBadge status={bill.status} /></div><p className="mt-1 text-sm text-slate-500">Complete financial record for {bill.patient_name}.</p></div>
        <button type="button" className="button-secondary" onClick={load}><MdRefresh /> Refresh</button>
      </div>
      <AdminBillingNav pendingApprovals={pendingApprovals} />
      {shiftLocked && <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900"><div><strong>Cashier Shift Closed</strong><p className="mt-1">This payment belongs to a closed cashier shift. Reopen that shift before making a refund or void correction.</p></div><Link to="/admin/billing/reconciliation" className="button-secondary">Open Reconciliation</Link></div>}

      <div className="grid gap-5 xl:grid-cols-[minmax(0,1.45fr)_minmax(320px,.65fr)]">
        <div className="space-y-5">
          <section className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
            <h2 className="text-sm font-black uppercase tracking-widest text-slate-400">Visit</h2>
            <div className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              <div><p className="text-xs font-bold text-slate-400">Patient</p><p className="mt-1 font-bold text-slate-900">{bill.patient_name}</p><p className="text-xs text-slate-500">{bill.patient_phone || 'No phone'}</p></div>
              <div><p className="text-xs font-bold text-slate-400">Doctor</p><p className="mt-1 font-bold text-slate-900">{bill.doctor_name}</p><p className="text-xs text-slate-500">{bill.doctor_specialty || '—'}</p></div>
              <div><p className="text-xs font-bold text-slate-400">Date & Time</p><p className="mt-1 font-bold text-slate-900">{formatDateOnly(bill.appointment_date)}</p><p className="text-xs text-slate-500">{bill.appointment_time}</p></div>
              <div><p className="text-xs font-bold text-slate-400">Reason</p><p className="mt-1 font-bold text-slate-900">{bill.appointment_reason || '—'}</p><p className="text-xs text-slate-500">{bill.clinic_type || 'Clinic visit'}</p></div>
            </div>
          </section>

          <section className="overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-sm">
            <div className="border-b border-slate-100 px-5 py-4"><h2 className="font-black text-slate-900">Charges</h2><p className="mt-1 text-xs text-slate-500">Historical charge snapshot for this bill.</p></div>
            <div className="overflow-x-auto"><table className="min-w-full text-sm"><thead className="bg-slate-50 text-left text-xs uppercase tracking-wider text-slate-500"><tr><th className="px-5 py-3">Item</th><th className="px-4 py-3 text-center">Qty</th><th className="px-4 py-3 text-right">Unit Price</th><th className="px-5 py-3 text-right">Total</th></tr></thead><tbody className="divide-y divide-slate-100">{(bill.items || []).map((item) => <tr key={item.id}><td className="px-5 py-4"><p className="font-bold text-slate-900">{item.service_name}</p><p className="mt-0.5 text-xs text-slate-500">{item.category || String(item.item_type || '').replace(/_/g, ' ')}</p></td><td className="px-4 py-4 text-center text-slate-700">{item.quantity}</td><td className="px-4 py-4 text-right text-slate-700">{formatMoney(item.unit_price)}</td><td className="px-5 py-4 text-right font-black text-slate-900">{formatMoney(item.line_total)}</td></tr>)}</tbody></table></div>
          </section>

          <section className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
            <h2 className="font-black text-slate-900">Payments</h2>
            <p className="mt-1 text-xs text-slate-500">Receipts and protected financial actions are managed per payment.</p>
            <div className="mt-4 space-y-3">
              {(bill.payments || []).length === 0 ? <p className="rounded-2xl bg-slate-50 p-4 text-sm text-slate-500">No payments have been recorded.</p> : bill.payments.map((payment) => {
                const refundable = Math.max(0, Number(payment.amount || 0) - Number(payment.refund_amount || 0))
                return <div key={payment.id} className="rounded-2xl border border-slate-200 p-4"><div className="flex flex-wrap items-start justify-between gap-3"><div><div className="flex flex-wrap items-center gap-2"><p className="font-black text-slate-900">{payment.receipt_number}</p>{payment.status !== 'completed' && <span className="rounded-full bg-rose-50 px-2 py-0.5 text-[10px] font-bold uppercase text-rose-700">{payment.status}</span>}</div><p className="mt-1 text-xs text-slate-500">{paymentMethodLabel(payment.payment_method)} · {new Date(payment.paid_at).toLocaleString('en-PH')}</p>{payment.reference_number && <p className="mt-1 text-xs text-slate-500">Reference: {payment.reference_number}</p>}{Number(payment.refund_amount || 0) > 0 && <p className="mt-1 text-xs font-bold text-violet-700">Refunded: {formatMoney(payment.refund_amount)}</p>}</div><div className="text-right"><p className="text-xl font-black text-emerald-700">{formatMoney(payment.amount)}</p><div className="mt-2 flex flex-wrap justify-end gap-2"><button type="button" className="button-secondary" onClick={() => printBillingReceipt({ bill, payment, clinicSettings: clinic, onPopupBlocked: () => toast.warning('Allow pop-ups to print the receipt.') })}><MdPrint /> Receipt</button>{payment.status === 'completed' && refundable > 0 && <button type="button" className="button-secondary text-violet-700" onClick={() => openAction(payment, 'refund')}><MdUndo /> Refund</button>}{payment.status === 'completed' && Number(payment.refund_amount || 0) <= 0 && <button type="button" className="button-secondary text-rose-700" onClick={() => openAction(payment, 'void')}><MdBlock /> Void</button>}</div></div></div></div>
              })}
            </div>
          </section>
        </div>

        <aside className="space-y-5 xl:sticky xl:top-5 xl:self-start">
          <section className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
            <h2 className="font-black text-slate-900">Payment Summary</h2>
            <div className="mt-4 space-y-3 text-sm"><div className="flex justify-between text-slate-600"><span>Subtotal</span><strong>{formatMoney(bill.subtotal)}</strong></div><div className="flex justify-between gap-4 text-slate-600"><span>{bill.discount_label ? `${bill.discount_label} Discount` : 'Discount'}{bill.discount_reference ? <span className="ml-1 text-xs text-slate-400">({bill.discount_reference})</span> : null}</span><strong>-{formatMoney(bill.discount_amount)}</strong></div><div className="flex justify-between border-t border-slate-200 pt-3 text-base"><span className="font-black text-slate-900">Total</span><strong className="text-slate-900">{formatMoney(bill.total_amount)}</strong></div><div className="flex justify-between text-emerald-700"><span>Paid</span><strong>{formatMoney(bill.paid_amount)}</strong></div><div className="flex justify-between rounded-xl bg-amber-50 px-3 py-2.5 text-amber-800"><span className="font-bold">Balance</span><strong className="text-lg">{formatMoney(bill.balance_amount)}</strong></div></div>
          </section>
          <section className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm"><h2 className="font-black text-slate-900">Record Information</h2><div className="mt-4 space-y-3 text-sm text-slate-600"><div><p className="text-xs font-bold uppercase text-slate-400">Created</p><p className="mt-1">{bill.created_at ? new Date(bill.created_at).toLocaleString('en-PH') : '—'}</p></div><div><p className="text-xs font-bold uppercase text-slate-400">Finalized</p><p className="mt-1">{bill.finalized_at ? new Date(bill.finalized_at).toLocaleString('en-PH') : 'Not finalized'}</p></div><div><p className="text-xs font-bold uppercase text-slate-400">Confirmed By</p><p className="mt-1">{bill.confirmed_by_staff_name || '—'}</p></div></div></section>
        </aside>
      </div>

      <Modal open={Boolean(paymentAction)} onClose={() => !busy && setPaymentAction(null)} closeDisabled={busy} title={paymentAction?.action === 'refund' ? 'Refund Payment' : 'Void Payment'} description={paymentAction?.payment?.receipt_number || ''} size="md">
        {paymentAction && <div className="space-y-4">{paymentAction.action === 'refund' && <div><label className="block"><span className="form-label">Refund Amount</span><input type="number" min="0.01" step="0.01" max={Math.max(0, Number(paymentAction.payment.amount || 0) - Number(paymentAction.payment.refund_amount || 0))} value={refundAmount} onChange={(e) => setRefundAmount(e.target.value)} className="form-control mt-1.5" /></label><p className="mt-1.5 text-xs font-semibold text-slate-500">Maximum refundable: {formatMoney(Math.max(0, Number(paymentAction.payment.amount || 0) - Number(paymentAction.payment.refund_amount || 0)))}</p>{Number(refundAmount || 0) > Math.max(0, Number(paymentAction.payment.amount || 0) - Number(paymentAction.payment.refund_amount || 0)) && <p className="mt-1 text-xs font-bold text-rose-700">Refund cannot exceed the maximum refundable amount.</p>}</div>}<label className="block"><span className="form-label">Reason *</span><textarea rows={4} value={reason} onChange={(e) => setReason(e.target.value)} className="form-control mt-1.5 resize-none" placeholder="Enter a clear reason for the audit record." /></label><div className="rounded-2xl border border-amber-200 bg-amber-50 p-3 text-xs font-semibold text-amber-800">This is a protected financial action and will remain visible in Audit Logs.</div><div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end"><button className="button-secondary" disabled={busy} onClick={() => setPaymentAction(null)}>Cancel</button><button className={paymentAction.action === 'void' ? 'button-danger' : 'button-primary'} disabled={busy || !reason.trim() || (paymentAction.action === 'refund' && (Number(refundAmount) <= 0 || Number(refundAmount) > Math.max(0, Number(paymentAction.payment.amount || 0) - Number(paymentAction.payment.refund_amount || 0))))} onClick={confirmAction}>{busy ? 'Working…' : paymentAction.action === 'refund' ? 'Confirm Refund' : 'Void Payment'}</button></div></div>}
      </Modal>
    </div>
  )
}

export default Admin_BillingTransactionDetail
