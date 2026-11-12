import { calculateBalancePaymentPreview } from '../../utils/paymentPreview.mjs'
import { formatMoney, paymentMethodLabel } from '../../utils/billingUi'

// Presentation only. Each portal retains its existing authorization, confirmation,
// idempotency key, QR lifecycle and server-ledger payment handlers.
export default function CheckoutPaymentSection({bill,draft,setDraft,paymentMethods,paymentSettings,qrPending,paying,requestPay,printReceipt,qrPayment}){
 const preview=calculateBalancePaymentPreview({bill,draft})
 const selected=Boolean(draft.payment_method)
 const row=(label,value,emphasized=false)=><div className={`flex justify-between gap-4 ${emphasized?'border-t border-slate-200 pt-3 font-bold':''}`}><dt>{label}</dt><dd className="shrink-0 font-semibold tabular-nums">{formatMoney(value)}</dd></div>
 return <div className="grid min-w-0 gap-6 rounded-2xl border border-slate-200 bg-white p-4 sm:p-6 xl:grid-cols-[minmax(0,1fr)_minmax(280px,0.8fr)]">
  <section className="min-w-0" aria-label="Payment details">
   <h2 className="text-lg font-bold text-slate-900">Payment Details</h2>
   <div className="my-6"><p className="text-sm text-slate-500">Amount Due</p><p className="mt-1 text-3xl font-bold tracking-tight text-slate-900">{formatMoney(bill.balance_amount)}</p></div>
   {qrPending?<div role="status" className="mb-5 border-l-2 border-amber-500 pl-3 text-sm text-amber-900"><p className="font-semibold">QR status is being checked or payment is active — Cash is not available yet.</p><p className="mt-1">Use Cancel QR & Switch to Cash and wait for server confirmation before accepting another payment.</p></div>:<>
    <fieldset disabled={paying} className="mb-5"><legend className="text-sm font-semibold text-slate-800">Payment method</legend><div className="mt-2 flex flex-wrap gap-2">{paymentMethods.map(method=><button type="button" key={method.value} aria-pressed={draft.payment_method===method.value} onClick={()=>setDraft(current=>({...current,payment_method:current.payment_method===method.value?'':method.value,reference_number:'',payment_amount:bill.balance_amount,amount_received:bill.balance_amount}))} className={`min-h-11 rounded-xl border px-5 text-sm font-semibold ${draft.payment_method===method.value?'border-sky-700 bg-sky-50 text-sky-800':'border-slate-200 text-slate-700 hover:bg-slate-50'}`}>{method.label}</button>)}</div>{paymentMethods.length===0&&<p className="mt-2 text-sm text-rose-700">No manual payment methods are enabled. Ask an administrator to review payment settings.</p>}{selected&&<button type="button" className="mt-3 text-sm text-sky-700 underline" onClick={()=>setDraft(current=>({...current,payment_method:'',reference_number:''}))}>Clear selected payment method</button>}</fieldset>
    {selected&&<fieldset disabled={paying} className="space-y-4">
     {draft.payment_method==='cash'?<div className="grid gap-4 sm:grid-cols-2"><label className="block text-sm font-semibold">Cash Received<input type="number" min="0" step="0.01" className="form-control mt-2" value={draft.amount_received} onChange={event=>setDraft(current=>({...current,amount_received:event.target.value}))}/></label><div className="self-end py-3 text-sm"><span className="text-slate-500">Change</span><p aria-live="polite" className="mt-1 font-bold text-emerald-700">{preview.valid?formatMoney(preview.change):'—'}</p></div></div>:<>
      <label className="block text-sm font-semibold">Reference Number *<input required maxLength={120} className="form-control mt-2" value={draft.reference_number} onChange={event=>setDraft(current=>({...current,reference_number:event.target.value}))}/></label>
      {['gcash','maya'].includes(draft.payment_method)&&<div className="text-sm text-slate-600">{paymentSettings[`${draft.payment_method}_qr_mode`]==='external'?<p>Use the clinic’s {paymentMethodLabel(draft.payment_method)} QR at the front desk.</p>:paymentSettings[`${draft.payment_method}_qr_url`]?<img src={paymentSettings[`${draft.payment_method}_qr_url`]} alt={`${paymentMethodLabel(draft.payment_method)} QR`} className="max-h-64 max-w-full object-contain"/>:<p>QR instructions are incomplete. Ask an administrator to review payment settings.</p>}</div>}
      {draft.payment_method==='bank_transfer'&&<div className="space-y-1 break-words text-sm text-slate-600"><p>Bank: {paymentSettings.bank_name||'Not configured'}</p><p>Account Name: {paymentSettings.bank_account_name||'—'}</p><p>Account Number: {paymentSettings.bank_account_number||'—'}</p></div>}
     </>}
     <label className="block text-sm font-semibold">Payment Notes<textarea maxLength={500} rows={2} className="form-control mt-2 resize-y" value={draft.payment_notes||''} onChange={event=>setDraft(current=>({...current,payment_notes:event.target.value}))}/></label>
     {!preview.valid&&<p role="status" className="text-sm text-amber-800">{preview.message}</p>}
    </fieldset>}
   </>}
   {qrPayment&&<details className="mt-6 border-t border-slate-200 pt-4" open={qrPending?true:undefined}><summary className="min-h-11 cursor-pointer py-2 text-sm font-semibold text-slate-700">{qrPending ? 'Existing QR payment - view status' : Number(paymentSettings.qrph_enabled) === 1 ? 'Pay with QR Ph (optional) - open QR payment' : 'QR Ph is disabled for this branch'}</summary>{qrPayment}</details>}
  </section>
  <aside className="min-w-0 border-t border-slate-200 pt-5 xl:border-l xl:border-t-0 xl:pl-6 xl:pt-0" aria-label="Payment summary">
   <h2 className="text-lg font-bold text-slate-900">Payment Summary</h2>
   <dl className="mt-6 space-y-3 text-sm text-slate-700">{row('Original bill amount',bill.subtotal)}{row('Applied discounts',bill.discount_amount)}{row('Total bill',bill.total_amount,true)}{row('Previously paid amount',bill.paid_amount)}{row('Current payment',selected&&preview.valid?preview.amount:0)}{row('Remaining balance',selected&&preview.valid?preview.balanceAfter:bill.balance_amount,true)}</dl>
   <p className="mt-4 text-xs leading-relaxed text-slate-500">Estimate only. The saved balance changes after the server confirms payment. Record a payment only after receiving the money.</p>
   <button type="button" className="button-primary mt-5 w-full justify-center" disabled={paying||qrPending||!selected||!preview.valid} onClick={requestPay}>{paying?'Recording…':'Record Payment'}</button>
   {bill.payments?.length>0&&<div className="mt-6 border-t border-slate-200 pt-4"><h3 className="text-sm font-semibold">Previous Payments</h3><div className="mt-2 divide-y divide-slate-100">{bill.payments.slice(0,3).map(payment=><div key={payment.id} className="py-3 text-xs"><p className="flex flex-wrap justify-between gap-2"><strong className="break-all">{payment.receipt_number}</strong><strong>{formatMoney(payment.amount)}</strong></p>{Number(payment.refund_amount)>0&&<p className="mt-1 text-violet-700">Refunded: {formatMoney(payment.refund_amount)}</p>}<button type="button" className="mt-2 min-h-9 font-semibold text-sky-700 underline" onClick={()=>printReceipt(payment)}>Print Receipt</button></div>)}</div></div>}
  </aside>
 </div>
}
