import { useState } from 'react'
import { refundBillingPayment, confirmBillingPaymentAction } from '../../services/admin.service'
import { formatMoney } from '../../utils/billingUi'

// Uses the existing Admin password + email-code protected refund endpoints.
// Recording a refund is NOT a payment-provider transfer and does not restock items.
export default function BillingPaymentRefundControl({ payment, onUpdated }) {
  const refundable = Math.max(0, Math.round((Number(payment?.amount || 0) - Number(payment?.refund_amount || 0)) * 100) / 100)
  const [open, setOpen] = useState(false)
  const [reason, setReason] = useState('')
  const [amount, setAmount] = useState(String(refundable))
  const [password, setPassword] = useState('')
  const [code, setCode] = useState('')
  const [sent, setSent] = useState(false)
  const [destination, setDestination] = useState('')
  const [moneyReturned, setMoneyReturned] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  if (payment?.status !== 'completed' || refundable <= 0) return null
  const start = async () => {
    const requested = Number(amount)
    if (!Number.isFinite(requested) || requested <= 0 || requested > refundable || Math.abs(Math.round(requested * 100) - requested * 100) > 0.000001) {
      setError(`Enter a valid refund amount up to ${formatMoney(refundable)}.`); return
    }
    if (reason.trim().length < 5) { setError('Enter a reason with at least 5 characters.'); return }
    if (!password) { setError('Enter your Admin password.'); return }
    if (!moneyReturned) { setError('Confirm that the refund has been processed outside the system first.'); return }
    setBusy(true); setError('')
    try {
      const result = await refundBillingPayment(payment.id, { amount: requested, reason: reason.trim(), password })
      setPassword('')
      setDestination(result?.destination || 'your Admin email')
      setSent(true)
    } catch (e) { setError(e.message || 'Could not send refund verification.') }
    finally { setBusy(false) }
  }
  const confirm = async () => {
    if (!/^\d{6}$/.test(code)) { setError('Enter the 6-digit email code.'); return }
    setBusy(true); setError('')
    try {
      await confirmBillingPaymentAction(payment.id, code)
      setOpen(false); setSent(false); setCode(''); setReason(''); setMoneyReturned(false)
      await onUpdated?.()
    } catch (e) { setError(e.message || 'Refund could not be recorded.') }
    finally { setBusy(false) }
  }
  return <div className="mt-2 w-full sm:w-auto">
    <button type="button" className="button-secondary" disabled={busy} onClick={() => {setOpen(value => !value);setError('')}} aria-expanded={open}>Record Refund</button>
    {open && <div className="mt-3 w-full space-y-3 rounded-xl border border-amber-200 bg-amber-50 p-4 sm:min-w-[330px]" role="region" aria-label={`Refund payment ${payment.id}`}>
      <p className="text-sm font-bold text-amber-950">Refund {payment.receipt_number || `Payment #${payment.id}`}</p>
      <p className="text-xs text-amber-900">Record a refund only after returning the money to the patient. This action does not send money through PayMongo or add medicines back to stock.</p>
      {!sent ? <>
        <label className="block text-xs font-bold">Refund amount (max {formatMoney(refundable)})<input className="form-control mt-1" type="number" min="0.01" step="0.01" max={refundable} value={amount} onChange={e=>setAmount(e.target.value)}/></label>
        <label className="block text-xs font-bold">Reason<input className="form-control mt-1" maxLength={500} value={reason} onChange={e=>setReason(e.target.value)} placeholder="Medicine not dispensed" /></label>
        <label className="block text-xs font-bold">Admin password<input className="form-control mt-1" type="password" autoComplete="current-password" value={password} onChange={e=>setPassword(e.target.value)} /></label>
        <label className="flex items-start gap-2 text-xs text-amber-950"><input type="checkbox" className="mt-0.5" checked={moneyReturned} onChange={e=>setMoneyReturned(e.target.checked)}/><span>I confirm that the patient has already received this refund using the correct payment method.</span></label>
        <button type="button" className="button-primary" disabled={busy} onClick={start}>{busy ? 'Sending code…' : 'Send Admin Verification Code'}</button>
      </> : <>
        <p className="text-xs text-amber-900">Verification code sent to {destination}. Check the amount and reason before confirming.</p>
        <label className="block text-xs font-bold">6-digit email code<input className="form-control mt-1" inputMode="numeric" maxLength={6} value={code} onChange={e=>setCode(e.target.value.replace(/\D/g,''))} /></label>
        <button type="button" className="button-primary" disabled={busy || code.length !== 6} onClick={confirm}>{busy ? 'Recording…' : 'Confirm Refund Record'}</button>
      </>}
      {error && <p role="alert" className="rounded-lg bg-rose-50 p-2 text-xs text-rose-800">{error}</p>}
      <button type="button" className="button-secondary" disabled={busy} onClick={()=>{setOpen(false);setSent(false);setPassword('');setCode('');setError('')}}>Cancel</button>
    </div>}
  </div>
}
