import { useCallback, useEffect, useState } from 'react'
import { Link, useLocation } from 'react-router-dom'
import { MdRefresh, MdWarningAmber } from 'react-icons/md'
import AdminBillingNav from '../../components/billing/AdminBillingNav'
import { getAdminPaymentIssues, getAdminQrStatus, cancelAdminQrPayment, resolveAdminQrReview } from '../../services/admin.service'
import { branchPortalPath } from '../../utils/branchPortalPath.mjs'
import { formatMoney } from '../../utils/billingUi'

export default function Admin_PaymentIssues() {
  const location = useLocation()
  const [issues,setIssues] = useState([])
  const [loading,setLoading] = useState(true)
  const [busy,setBusy] = useState(null)
  const [message,setMessage] = useState('')
  const [refundId,setRefundId] = useState({})
  const [notes,setNotes] = useState({})
  const load = useCallback(async () => {
    setLoading(true)
    try {setIssues(await getAdminPaymentIssues());setMessage('')}
    catch(err){setMessage(err.message||'Could not load payment issues.')}
    finally {setLoading(false)}
  },[])
  useEffect(()=>{void load()},[load])
  const perform = async (row,action) => {
    if (busy) return
    if (action==='cancel'&&!window.confirm('Check PayMongo and cancel this QR so the patient can pay by cash? Cash stays locked unless PayMongo confirms cancellation.')) return
    if (action==='apply'&&!window.confirm('Check PayMongo and apply this verified payment to the bill?')) return
    if (action==='refunded'&&!window.confirm('Has the refund already been completed in PayMongo? The clinic will verify the refund ID before updating this record.')) return
    setBusy(row.id);setMessage('')
    try {
      if(action==='check') await getAdminQrStatus(row.billing_id,{reconcile:true})
      else if(action==='cancel') {
        const result=await cancelAdminQrPayment(row.billing_id,row.id)
        if(result.status!=='cancelled'||!result.can_collect_alternate) throw new Error('QR cancellation was not verified. Do not collect cash.')
      } else if(action==='apply') await resolveAdminQrReview(row.billing_id,row.id,{action:'apply'})
      else if(action==='refunded') await resolveAdminQrReview(row.billing_id,row.id,{action:'refunded',refund_id:(refundId[row.id]||'').trim(),note:(notes[row.id]||'').trim()})
      await load()
    } catch(err){setMessage(err.message||'Payment status could not be confirmed. The payment remains locked.')}
    finally {setBusy(null)}
  }
  return <main className="space-y-5">
    <AdminBillingNav />
    <section className="rounded-2xl border border-slate-200 bg-white p-5">
      <div className="flex flex-wrap items-center justify-between gap-3"><div><h1 className="flex items-center gap-2 text-xl font-black"><MdWarningAmber className="text-amber-500"/> Payment Issues</h1><p className="mt-1 text-sm text-slate-600">Check QR payments that are still pending or need administrator help.</p></div><button type="button" className="button-secondary" onClick={load}><MdRefresh/> Refresh</button></div>
      <p className="mt-3 text-xs font-semibold text-amber-800">Do not accept cash while a QR payment is still locked. An expired QR image does not prove that the payment was cancelled.</p>
    </section>
    {message && <p role="alert" className="rounded-xl bg-amber-50 p-3 text-sm font-semibold text-amber-900">{message}</p>}
    {loading ? <p className="text-sm text-slate-500">Checking payments…</p> : issues.length===0 ? <p className="rounded-xl border bg-white p-6 text-sm text-slate-600">No payment issues found in this branch.</p> : <div className="grid gap-3">{issues.map(row=><section key={row.id} className="space-y-3 rounded-2xl border border-slate-200 bg-white p-5">
      <div className="flex flex-wrap items-center justify-between gap-3"><div><h2 className="font-black">Bill #{row.billing_id} · {formatMoney(row.amount)}</h2><p className="mt-1 text-xs text-slate-500">{row.mode==='live'?'Live payment':'Test payment'} · {row.status==='review'?'Needs checking':row.status==='pending'?'Waiting for payment':'Preparing payment'}</p></div><Link className="button-secondary" to={branchPortalPath(`/admin/billing/checkout/${row.billing_id}`,location.pathname)}>Open Checkout</Link></div>
      <div className="flex flex-wrap gap-2"><button className="button-secondary" disabled={busy===row.id} onClick={()=>perform(row,'check')}>{busy===row.id?'Checking…':'Check PayMongo Status'}</button>
        {row.can_request_cancel && !row.has_provider_payment && <button className="button-primary" disabled={busy===row.id} onClick={()=>perform(row,'cancel')}>Cancel QR for Cash</button>}
        {row.has_provider_payment && <button className="button-primary" disabled={busy===row.id} onClick={()=>perform(row,'apply')}>Check and Apply Payment</button>}
      </div>
      {row.has_provider_payment && row.status==='review' && <details className="rounded-xl bg-slate-50 p-3 text-sm"><summary className="cursor-pointer font-bold">Already refunded in PayMongo?</summary><p className="mt-2 text-xs text-slate-600">Only use this if the refund has actually succeeded. Enter the provider's refund ID and a short explanation; the server verifies both the refund and the original payment.</p><div className="mt-3 grid gap-2 sm:grid-cols-2"><label>PayMongo Refund ID<input className="form-control mt-1" placeholder="ref_..." value={refundId[row.id]||''} onChange={e=>setRefundId(prev=>({...prev,[row.id]:e.target.value}))}/></label><label>Reason<input className="form-control mt-1" maxLength={500} value={notes[row.id]||''} onChange={e=>setNotes(prev=>({...prev,[row.id]:e.target.value}))}/></label></div><button type="button" className="button-secondary mt-3" disabled={busy===row.id||(notes[row.id]||'').trim().length<5||!/^ref_[a-zA-Z0-9_-]{4,115}$/.test(refundId[row.id]||'')} onClick={()=>perform(row,'refunded')}>Verify Completed Refund</button></details>}
      {!row.can_request_cancel && !row.has_provider_payment && <p className="text-xs font-bold text-amber-800">The QR cannot be safely cancelled here yet. Check PayMongo status or request administrator assistance. Do not collect cash.</p>}
    </section>)}</div>}
  </main>
}
