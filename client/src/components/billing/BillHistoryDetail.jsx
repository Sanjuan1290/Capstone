import { useCallback, useEffect, useMemo, useState } from 'react'
import { Link, useLocation, useParams } from 'react-router-dom'
import { MdArrowBack, MdPrint, MdRefresh, MdReceiptLong } from 'react-icons/md'
import { getBillById as getAdminBill, getAdminBillAdjustmentRequests, getAdminBillChargeAdjustments } from '../../services/admin.service'
import { getBillById as getStaffBill, getBillingAdjustmentRequests as getStaffAdjustments, getStaffBillChargeAdjustments } from '../../services/staff.service'
import { getClinicSettings } from '../../services/clinic.service'
import { branchPortalPath } from '../../utils/branchPortalPath.mjs'
import { formatMoney, paymentMethodLabel } from '../../utils/billingUi'
import { printBillingReceipt } from '../../utils/billingReceipt'
import BillingStatusBadge from './BillingStatusBadge'
import { ErrorState, LoadingState } from '../ui/PageState'

const formatWhen = value => value ? new Date(value).toLocaleString('en-PH', { dateStyle: 'medium', timeStyle: 'short' }) : '—'
const num = value => Number.isFinite(Number(value)) ? Number(value) : 0
const chronological = (bill, requests) => [
  { at: bill.created_at, title: 'Bill generated', detail: 'Consultation charges recorded' },
  ...(requests || []).flatMap(req => [
    { at: req.created_at, title: 'Charge reduction requested', detail: `${formatMoney(req.requested_amount)} · ${req.reason || 'No reason supplied'}` },
    ...(req.resolved_at ? [{ at: req.resolved_at, title: `Charge request ${req.status}`, detail: req.admin_note || '' }] : []),
  ]),
  ...(bill.finalized_at ? [{ at: bill.finalized_at, title: 'Bill confirmed', detail: 'Payable charges finalized' }] : []),
  ...(bill.payments || []).flatMap(pay => [
    { at: pay.paid_at, title: pay.status === 'completed' ? 'Payment recorded' : `Payment ${pay.status}`, detail: `${formatMoney(pay.amount)} · ${paymentMethodLabel(pay.payment_method)} · ${pay.receipt_number || ''}` },
    ...(pay.voided_at ? [{ at: pay.voided_at, title: 'Payment voided', detail: pay.void_reason || '' }] : []),
    ...(pay.refunded_at ? [{ at: pay.refunded_at, title: 'Payment refunded', detail: `${formatMoney(pay.refund_amount)} · ${pay.refund_reason || ''}` }] : []),
  ]),
].filter(item => item.at).sort((a,b)=>new Date(a.at)-new Date(b.at))

/** Read-only history for all three billing portals; protected actions stay in checkout. */
export default function BillHistoryDetail({ role = 'admin' }) {
  const { billingId } = useParams()
  const staff = role === 'staff'
  const location = useLocation()
  const [bill, setBill] = useState(null)
  const [requests, setRequests] = useState([])
  const [historyPartial, setHistoryPartial] = useState(false)
  const [clinic, setClinic] = useState({})
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(true)
  const back = staff ? '/staff/billing?tab=history' : branchPortalPath('/admin/billing?tab=history', location.pathname)
  const load = useCallback(async () => {
    setLoading(true); setError('')
    try {
      const getBill = staff ? getStaffBill : getAdminBill
      const getRequests = staff ? getStaffAdjustments : getAdminBillAdjustmentRequests
      const [record, changes, charges, settings] = await Promise.all([
        getBill(billingId),getRequests(billingId).catch(() => []),
        (staff ? getStaffBillChargeAdjustments : getAdminBillChargeAdjustments)(billingId).catch(() => null),
        getClinicSettings().catch(() => ({})),
      ])
      setBill(record)
      setRequests([
        ...(Array.isArray(changes) ? changes : changes?.items || []),
        ...(Array.isArray(charges?.requests) ? charges.requests : []).map(r => ({...r, discount_label: r.target_type === 'service_fee' ? 'Service fee reduction' : 'Consumable reduction', requested_amount: r.requested_amount, status: r.status})),
      ])
      setHistoryPartial(charges === null)
      setClinic(settings || {})
    } catch (err) { setError(err.message || 'Bill history could not be loaded.') }
    finally { setLoading(false) }
  }, [billingId, staff])
  useEffect(() => { if (/^[1-9]\d*$/.test(String(billingId))) void load(); else {setError('Invalid bill number.');setLoading(false)} }, [billingId, load])
  const timeline = useMemo(() => bill ? chronological(bill, requests) : [], [bill,requests])
  if (loading) return <LoadingState label="Loading bill history…"/>
  if (error || !bill) return <div className="space-y-3"><ErrorState message={error || 'Bill not found.'} onRetry={load}/><Link className="button-secondary" to={back}>Back to Billing</Link></div>
  return <main className="mx-auto w-full max-w-6xl space-y-5" aria-label="Bill history">
    <header className="flex flex-wrap items-center justify-between gap-3"><div><Link to={back} className="mb-2 inline-flex items-center gap-1 text-sm font-semibold text-slate-600"><MdArrowBack/> Back to Receipts & History</Link><h1 className="flex items-center gap-2 text-2xl font-black"><MdReceiptLong/> Bill #{bill.id} <BillingStatusBadge status={bill.status}/></h1><p className="mt-1 text-sm text-slate-500">Complete bill summary and recorded payments.</p></div><button className="button-secondary" type="button" onClick={load}><MdRefresh/> Refresh</button></header>
    <section className="grid gap-3 rounded-2xl border border-slate-200 bg-white p-5 sm:grid-cols-3"><div><p className="text-xs font-semibold text-slate-500">Patient</p><p className="font-bold">{bill.patient_name}</p></div><div><p className="text-xs font-semibold text-slate-500">Doctor</p><p className="font-bold">{bill.doctor_name}</p></div><div><p className="text-xs font-semibold text-slate-500">Visit</p><p className="font-bold">{bill.appointment_date || '—'} {bill.appointment_time || ''}</p></div></section>
    <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white"><h2 className="border-b border-slate-100 p-4 font-bold">Bill Charges</h2><div className="divide-y divide-slate-100">{(bill.items||[]).map(line=><div className="flex justify-between gap-3 px-4 py-3 text-sm" key={line.id}><span>{line.service_name} <span className="text-slate-500">× {line.quantity}</span></span><span className="font-semibold tabular-nums">{formatMoney(line.line_total)}</span></div>)}</div><div className="space-y-2 bg-slate-50 p-4 text-sm"><div className="flex justify-between"><span>Subtotal</span><span>{formatMoney(bill.subtotal)}</span></div>{num(bill.discount_amount)>0&&<div className="flex justify-between text-emerald-700"><span>{bill.discount_label || 'Discounts & adjustments'}</span><span>−{formatMoney(bill.discount_amount)}</span></div>}{num(bill.promotion_discount_amount_snapshot)>0&&<p className="text-xs text-slate-600">Saved promotion: {bill.promotion_title_snapshot || 'Promotion'} · {formatMoney(bill.promotion_discount_amount_snapshot)} in booked service savings (included in final bill calculations)</p>}<div className="flex justify-between border-t border-slate-200 pt-2 font-bold"><span>Bill Total</span><span>{formatMoney(bill.total_amount)}</span></div><div className="flex justify-between"><span>Net paid</span><span>{formatMoney(bill.paid_amount)}</span></div><div className="flex justify-between font-bold"><span>Remaining Balance</span><span>{formatMoney(bill.balance_amount)}</span></div></div></section>
    <section className="rounded-2xl border border-slate-200 bg-white p-4"><h2 className="mb-3 font-bold">Adjustment Requests</h2>{historyPartial && <p className="mb-3 text-xs text-amber-800">Some adjustment details could not be loaded for this account.</p>}{!requests.length?<p className="text-sm text-slate-500">No additional discount requests were recorded.</p>:<div className="space-y-2">{requests.map(r=><div key={r.id} className="rounded-xl bg-slate-50 p-3 text-sm"><div className="flex flex-wrap items-center justify-between gap-2"><strong>{r.discount_label || 'Charge reduction'} · {formatMoney(r.requested_amount)}</strong><span className="font-semibold capitalize">{r.status}</span></div><p className="mt-1 text-slate-600">{r.reason || 'No reason supplied.'}</p>{r.admin_note&&<p className="text-xs text-slate-500">Reviewer note: {r.admin_note}</p>}</div>)}</div>}</section>
    <section className="rounded-2xl border border-slate-200 bg-white p-4"><h2 className="mb-3 font-bold">Payments & Receipts</h2>{!(bill.payments||[]).length?<p className="text-sm text-slate-500">No payments recorded.</p>:(bill.payments||[]).map(payment=><article key={payment.id} className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 py-3 text-sm"><div><strong>{payment.receipt_number || 'Payment'}</strong><p className="text-slate-500">{paymentMethodLabel(payment.payment_method)} · {formatWhen(payment.paid_at)}</p><p className="text-slate-500">{payment.status}{num(payment.refund_amount)>0 ? ` · Refunded ${formatMoney(payment.refund_amount)}` : ''}</p></div><div className="flex items-center gap-2"><strong>{formatMoney(payment.amount)}</strong><button type="button" className="button-secondary" onClick={()=>printBillingReceipt({bill,payment,clinicSettings:clinic,onPopupBlocked:()=>window.alert('Allow pop-ups to print the receipt.')})}><MdPrint/> Receipt</button></div></article>)}</section>
    <section className="rounded-2xl border border-slate-200 bg-white p-4"><h2 className="mb-3 font-bold">Bill Activity</h2>{!timeline.length?<p className="text-sm text-slate-500">No activity recorded.</p>:<ol className="space-y-3 border-l-2 border-slate-200 pl-4">{timeline.map((entry,index)=><li key={`${entry.title}:${index}`} className="text-sm"><p className="font-semibold">{entry.title}</p><p className="text-xs text-slate-500">{formatWhen(entry.at)} · {entry.detail}</p></li>)}</ol>}</section>
  </main>
}
