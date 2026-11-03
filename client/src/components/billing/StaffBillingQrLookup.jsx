import { useState } from 'react'
import { Link } from 'react-router-dom'
import { MdRefresh, MdSearch } from 'react-icons/md'
import { getBillById, getStaffQrStatus } from '../../services/staff.service'
import { formatMoney } from '../../utils/billingUi'

const statusText = {
  not_created: 'No QR attempt for this bill', creating: 'Creating QR', pending: 'Awaiting payment',
  succeeded: 'Payment confirmed', failed: 'Payment failed', expired: 'QR expired',
  review: 'Administrator review required', refunded: 'Refunded', cancelled: 'Cancelled',
}

// This is a read-only lookup. The Staff gateway endpoint checks the selected
// branch and reconciles status; it cannot create, cancel, void, or refund here.
export default function StaffBillingQrLookup() {
  const [billId, setBillId] = useState('')
  const [result, setResult] = useState(null)
  const [record, setRecord] = useState(null)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const check = async (event) => {
    event.preventDefault()
    if (!/^[1-9]\d*$/.test(billId) || !Number.isSafeInteger(Number(billId))) {
      setError('Enter a valid bill number.'); setResult(null); return
    }
    setLoading(true); setError(''); setResult(null); setRecord(null)
    try {
      // Require a branch-owned bill before displaying gateway status.
      const bill = await getBillById(billId)
      const status = await getStaffQrStatus(billId)
      setRecord(bill); setResult(status)
    } catch (err) {
      setError(err.message || 'Could not check QR payment status.')
    } finally {
      setLoading(false)
    }
  }
  return (
    <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
      <h3 className="font-bold text-slate-900">Check QR Ph payment status</h3>
      <p className="mt-1 text-sm text-slate-500">Enter the bill number. This only reads the latest QR attempt; no payment is created or cancelled.</p>
      <form className="mt-3 flex flex-wrap gap-2" onSubmit={check}>
        <label className="sr-only" htmlFor="staff-qr-bill-id">Bill number</label>
        <input id="staff-qr-bill-id" inputMode="numeric" value={billId} onChange={event => setBillId(event.target.value)} placeholder="Bill number" className="form-control w-full sm:max-w-[250px]" />
        <button type="submit" disabled={loading} className="button-secondary"><MdSearch /> {loading ? 'Checking…' : 'Check Status'}</button>
      </form>
      {error && <p role="alert" className="mt-3 rounded-xl bg-rose-50 p-3 text-sm font-semibold text-rose-700">{error}</p>}
      {result && record && <div role="status" className="mt-3 space-y-2 rounded-xl border border-slate-200 bg-slate-50 p-4 text-sm">
        <div className="flex flex-wrap items-center justify-between gap-2"><strong>Bill #{record.id} · {record.patient_name}</strong><span className="font-bold text-slate-800">{statusText[result.status] || result.status || 'Status unavailable'}</span></div>
        {result.amount != null && <p>QR amount: <strong>{formatMoney(result.amount)}</strong></p>}
        {result.expires_at && <p className="text-slate-500">QR expiry: {result.expires_at}</p>}
        {result.error_code && <p className="text-rose-700">Provider code: {result.error_code}</p>}
        {result.needs_admin_review && <p className="font-semibold text-amber-800">Administrator review is required. Do not collect another payment until resolved.</p>}
        {result.status === 'not_created' && <p className="text-slate-500">This does not mean payment failed. No QR attempt has been recorded for this bill.</p>}
        <Link to={`/staff/checkout/${record.id}`} className="inline-flex min-h-10 items-center gap-2 font-bold text-sky-700">Open Bill in Checkout <MdRefresh aria-hidden="true" /></Link>
      </div>}
    </section>
  )
}
