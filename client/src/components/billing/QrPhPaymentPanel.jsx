import { useCallback, useEffect, useRef, useState } from 'react'
import { MdQrCode2, MdRefresh, MdCheckCircleOutline } from 'react-icons/md'

// QR Ph is an asynchronous, exact-balance payment; never record payment on scan.
// Server webhooks, not this polling component, mutate the billing ledger.
export default function QrPhPaymentPanel({ billId, remainingBalance, getStatus, createQr, cancelQr, onPaid, onPendingChange }) {
  const [attempt, setAttempt] = useState(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const notified = useRef(false)
  const readStatus = useCallback(async () => {
    if (!billId) return
    try {
      const result = await getStatus(billId)
      setAttempt(result)
      if (result.status === 'succeeded' && !notified.current) {
        notified.current = true
        onPaid?.()
      }
    } catch (err) { setError(err.message || 'QR payment status is unavailable.') }
  }, [billId, getStatus, onPaid])
  useEffect(() => { notified.current = false }, [billId])
  useEffect(() => {
    let active = true
    Promise.resolve(getStatus(billId)).then(data => { if (active) setAttempt(data) }).catch(() => {})
    return () => { active = false }
  }, [billId, getStatus])
  useEffect(() => {
    if (!['pending', 'creating', 'review'].includes(attempt?.status)) return undefined
    const timer = window.setInterval(readStatus, 3500)
    return () => window.clearInterval(timer)
  }, [attempt?.status, readStatus])
  const generate = async () => {
    setBusy(true); setError('')
    try { setAttempt(await createQr(billId)) }
    catch (err) { setError(err.message || 'Could not create a QR payment.') }
    finally { setBusy(false) }
  }
  const requestCancellation = async () => {
    if (!cancelQr || !attempt?.can_request_cancel || !window.confirm('Cancel the current PayMongo QR? Cash remains blocked unless PayMongo confirms cancellation.')) return
    setBusy(true); setError('')
    try {
      const result = await cancelQr(billId,attempt.id)
      setAttempt(result)
      if (result?.status !== 'cancelled') setError('Cancellation was not confirmed. Contact an administrator; do not collect cash.')
    } catch (err) {
      setError(err.message || 'PayMongo cancellation is not verified. Cash remains locked.')
      await readStatus()
    } finally {setBusy(false)}
  }
  const pending = ['pending', 'creating', 'review'].includes(attempt?.status)
  const mode = attempt?.current_mode || attempt?.mode || null
  const modeKnown = ['test', 'live'].includes(mode)
  const liveDisabled = mode === 'live' && attempt?.enabled === false
  const displayedMode = attempt?.status === 'pending' ? attempt?.mode : mode
  useEffect(() => { onPendingChange?.(pending) }, [onPendingChange, pending])
  return (
    <section className="mt-5 rounded-2xl border border-violet-200 bg-violet-50/60 p-4" aria-label="PayMongo QR Ph Payment">
      <div className="flex items-center gap-2 text-violet-900"><MdQrCode2 className="text-2xl" /><h3 className="font-black">QR Ph · PayMongo {!modeKnown ? 'Checking mode…' : displayedMode === 'live' ? 'LIVE Mode' : 'TEST Mode'}</h3></div>
      <p className="mt-2 text-sm text-slate-600">Generate a unique QR only after confirming this bill. Exact remaining balance: <strong>₱{Number(remainingBalance || 0).toFixed(2)}</strong>.</p>
      {modeKnown && (displayedMode === 'test' ? <p className="mt-2 text-xs font-bold text-rose-700">TEST QR: do not scan or send real money. Use PayMongo's test payment simulator URL when available.</p> : <p className="mt-2 text-xs font-bold text-rose-700">LIVE QR: scanning and paying this code will move real money and may incur processing fees.</p>)}
      {liveDisabled && <p role="alert" className="mt-2 text-sm font-bold text-amber-900">LIVE payments are not enabled by the clinic yet.</p>}
      {!pending && attempt?.status !== 'succeeded' && <button type="button" className="button-primary mt-4" disabled={busy || !modeKnown || liveDisabled || Number(remainingBalance) < 1} onClick={generate}><MdQrCode2 />{busy ? 'Generating…' : `Generate ${mode === 'live' ? 'LIVE' : 'Test'} QR Ph`}</button>}
      {attempt?.status === 'creating' && <p className="mt-3 text-sm font-semibold">Preparing your QR. Please wait…</p>}
      {attempt?.status === 'pending' && <div className="mt-4 flex flex-col items-center gap-3 rounded-xl border border-violet-100 bg-white p-4">
        {attempt.qr_image ? <img className="h-56 w-56 max-w-full object-contain" alt={`PayMongo ${displayedMode} QR Ph payment code`} src={attempt.qr_image} /> : <p className="text-sm">QR image is unavailable; please review this payment with an administrator.</p>}
        <p className="text-sm font-bold">Awaiting verified payment — ₱{Number(attempt.amount || 0).toFixed(2)}</p>
        {attempt.expires_at && <p className="text-xs text-slate-500">QR expiry: {String(attempt.expires_at).replace('T',' ').slice(0,19)}</p>}
        {attempt.mode === 'test' && attempt.test_url && <a href={attempt.test_url} rel="noopener noreferrer" target="_blank" className="button-primary">Open PayMongo Test Simulator</a>}
        <button type="button" className="button-secondary" onClick={readStatus}><MdRefresh /> Refresh status</button>
        {attempt?.can_request_cancel && cancelQr && <button type="button" className="button-secondary" disabled={busy} onClick={requestCancellation}>{busy ? 'Verifying…' : 'Request QR cancellation'}</button>}
        <p className="text-xs text-slate-500">Manual payments and bill edits are locked while this payment is pending.</p>
      </div>}
      {attempt?.status === 'review' && <div role="alert" className="mt-3 rounded-xl bg-amber-100 p-3 text-sm font-bold text-amber-900">
        <p>PayMongo status could not be confirmed. Do not generate another QR or record a manual payment; contact an administrator to reconcile this attempt.</p>
        {attempt?.can_request_cancel && cancelQr && <button type="button" className="button-secondary mt-3" disabled={busy} onClick={requestCancellation}>{busy ? 'Verifying…' : 'Request verified cancellation'}</button>}
      </div>}
      {attempt?.status === 'cancelled' && <p role="status" className="mt-3 text-sm font-bold text-emerald-800">PayMongo cancellation verified. You can select another payment method after refreshing the bill.</p>}
      {attempt?.status === 'succeeded' && <p role="status" className="mt-3 flex items-center gap-2 text-sm font-bold text-emerald-700"><MdCheckCircleOutline /> Verified payment recorded. Receipt is available on the updated bill.</p>}
      {['expired','failed'].includes(attempt?.status) && <p className="mt-3 text-sm font-bold text-amber-800">Previous QR expired or failed. You may generate another QR for the outstanding balance.</p>}
      {error && <p role="alert" className="mt-3 text-sm font-bold text-rose-700">{error}</p>}
    </section>
  )
}



