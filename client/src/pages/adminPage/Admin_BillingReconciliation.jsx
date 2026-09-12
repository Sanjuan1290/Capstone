import { useCallback, useEffect, useState } from 'react'
import { MdAccountBalanceWallet, MdLockOpen, MdRefresh } from 'react-icons/md'
import { getBillingReconciliation, getBillingAdjustmentRequests, reopenCashierShift } from '../../services/admin.service'
import { useToast } from '../../components/ui/ToastProvider'
import Modal from '../../components/ui/Modal'
import { LoadingState, ErrorState, EmptyState } from '../../components/ui/PageState'
import AdminBillingNav from '../../components/billing/AdminBillingNav'
import { formatMoney, paymentMethodLabel } from '../../utils/billingUi'
import { getLocalDateOnly } from '../../utils/date'

const Admin_BillingReconciliation = () => {
  const toast = useToast()
  const [date, setDate] = useState(getLocalDateOnly())
  const [data, setData] = useState(null)
  const [pendingCount, setPendingCount] = useState(0)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [reopen, setReopen] = useState(null)
  const [reason, setReason] = useState('')
  const [busy, setBusy] = useState(false)

  const load = useCallback(async () => {
    setLoading(true); setError('')
    try {
      const [result, pending] = await Promise.all([
        getBillingReconciliation(date),
        getBillingAdjustmentRequests({ status: 'pending' }),
      ])
      setData(result || null)
      setPendingCount(Number(pending?.pagination?.total ?? pending?.items?.length ?? pending?.length ?? 0))
    } catch (err) {
      const message = err.message || 'Could not load cashier reconciliation.'
      setError(message); toast.error(message)
    } finally { setLoading(false) }
  }, [date, toast])

  useEffect(() => { load() }, [load])

  const confirmReopen = async () => {
    if (!reopen?.id || !reason.trim()) return
    setBusy(true)
    try {
      await reopenCashierShift(reopen.id, reason.trim())
      toast.success('Cashier shift reopened.')
      setReopen(null); setReason(''); await load()
    } catch (err) { toast.error(err.message || 'Could not reopen cashier shift.') }
    finally { setBusy(false) }
  }

  const summary = data?.summary || {}
  const cards = [
    ['Net Collected', formatMoney(summary.net_collected)],
    ['Gross Collected', formatMoney(summary.gross_collected)],
    ['Refunded', formatMoney(summary.refunded)],
    ['Expected Cash', formatMoney(summary.expected_cash)],
  ]

  return (
    <div className="mx-auto w-full max-w-7xl space-y-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div><h1 className="flex items-center gap-2 text-2xl font-bold text-slate-900"><MdAccountBalanceWallet className="text-amber-500" /> Cashier Reconciliation</h1><p className="mt-1 text-sm text-slate-500">Compare collections and cashier closings without mixing them into transaction management.</p></div>
        <div className="flex items-center gap-2"><input type="date" className="form-control w-auto" value={date} onChange={(e) => setDate(e.target.value)} /><button className="button-secondary" onClick={load}><MdRefresh /> Refresh</button></div>
      </div>
      <AdminBillingNav pendingApprovals={pendingCount} />

      {loading ? <LoadingState label="Loading reconciliation..." /> : error ? <ErrorState message={error} onRetry={load} /> : <>
        <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">{cards.map(([label, value]) => <div key={label} className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm"><p className="text-xs font-bold uppercase tracking-wide text-slate-400">{label}</p><p className="mt-2 text-2xl font-black text-slate-900">{value}</p></div>)}</section>

        <section className="grid gap-5 xl:grid-cols-[0.9fr_1.1fr]">
          <div className="space-y-5">
            <div className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
              <h2 className="text-base font-black text-slate-900">Collection by Method</h2>
              <p className="mt-1 text-sm text-slate-500">Net amounts collected on {data?.date || date}.</p>
              <div className="mt-4 space-y-2">{Array.isArray(data?.methods) && data.methods.length ? data.methods.map((method) => <div key={method.payment_method} className="rounded-2xl border border-slate-200 p-4"><div className="flex items-center justify-between gap-4"><div><p className="font-bold text-slate-800">{paymentMethodLabel(method.payment_method)}</p><p className="mt-1 text-xs text-slate-500">{method.transactions} transaction{Number(method.transactions) === 1 ? '' : 's'}</p></div><p className="text-lg font-black text-slate-900">{formatMoney(method.net)}</p></div>{Number(method.refunded || 0) > 0 && <p className="mt-2 text-xs font-bold text-rose-600">Refunded: {formatMoney(method.refunded)}</p>}</div>) : <EmptyState title="No collections" description="No payments were recorded for this date." />}</div>
            </div>
            <div className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
              <h2 className="text-base font-black text-slate-900">Open / Reopened Shifts</h2>
              <p className="mt-1 text-sm text-slate-500">Cashiers with payments today whose shift is still able to accept payments.</p>
              <div className="mt-4 space-y-2">{Array.isArray(data?.open_shifts) && data.open_shifts.length ? data.open_shifts.map((shift) => <div key={shift.staff_id} className={`rounded-2xl border p-4 ${shift.status === 'reopened' ? 'border-amber-200 bg-amber-50' : 'border-emerald-200 bg-emerald-50'}`}><div className="flex flex-wrap items-center justify-between gap-3"><div><p className="font-black text-slate-900">{shift.staff_name}</p><p className="mt-1 text-xs text-slate-600">{shift.payment_count} payment(s) · Expected cash {formatMoney(shift.expected_cash)}</p>{shift.status === 'reopened' && <p className="mt-1 text-xs font-bold text-amber-800">REOPENED{shift.reopen_reason ? ` · ${shift.reopen_reason}` : ''}</p>}</div><span className={`rounded-full px-2.5 py-1 text-xs font-black ${shift.status === 'reopened' ? 'bg-amber-100 text-amber-900' : 'bg-emerald-100 text-emerald-800'}`}>{String(shift.status || 'open').toUpperCase()}</span></div></div>) : <p className="text-sm text-slate-500">No open cashier shifts with payments for this date.</p>}</div>
            </div>
          </div>

          <div className="space-y-5">
            <div className="overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-sm">
              <div className="border-b border-slate-100 p-5"><h2 className="text-base font-black text-slate-900">Cashier Closings</h2><p className="mt-1 text-sm text-slate-500">Closing records remain visible after reopening so the financial history is preserved.</p></div>
              {!Array.isArray(data?.closings) || data.closings.length === 0 ? <div className="p-5"><EmptyState title="No closing records" description="Cashier shift closings for this date will appear here." /></div> : <div className="overflow-x-auto"><table className="min-w-full text-sm"><thead className="bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-500"><tr><th className="px-5 py-3">Cashier</th><th className="px-5 py-3">Expected</th><th className="px-5 py-3">Actual</th><th className="px-5 py-3">Variance</th><th className="px-5 py-3">Status</th><th className="px-5 py-3 text-right">Action</th></tr></thead><tbody className="divide-y divide-slate-100">{data.closings.map((closing) => <tr key={closing.id}><td className="px-5 py-4 font-bold text-slate-800">{closing.staff_name || `Staff #${closing.staff_id}`}<p className="mt-1 text-xs font-normal text-slate-400">{closing.closed_at || '—'}</p></td><td className="px-5 py-4">{formatMoney(closing.expected_cash)}</td><td className="px-5 py-4">{formatMoney(closing.actual_cash)}</td><td className={`px-5 py-4 font-bold ${Math.abs(Number(closing.variance || 0)) > 0.009 ? 'text-rose-600' : 'text-emerald-600'}`}>{formatMoney(closing.variance)}</td><td className="px-5 py-4"><span className={`rounded-full px-2.5 py-1 text-xs font-black ${closing.status === 'reopened' ? 'bg-amber-100 text-amber-900' : 'bg-slate-100 text-slate-700'}`}>{String(closing.status || 'closed').toUpperCase()}</span></td><td className="px-5 py-4 text-right">{String(closing.status || 'closed') === 'closed' && Number(closing.is_locked ?? 1) === 1 ? <button className="button-secondary" onClick={() => { setReopen(closing); setReason('') }}><MdLockOpen /> Reopen</button> : <span className="text-xs text-slate-400">Awaiting re-close</span>}</td></tr>)}</tbody></table></div>}
            </div>
            <div className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm"><h2 className="text-base font-black text-slate-900">Closing History</h2><p className="mt-1 text-sm text-slate-500">Append-only events for closing, reopening, and re-closing.</p><div className="mt-4 space-y-2">{Array.isArray(data?.closing_events) && data.closing_events.length ? data.closing_events.map((event) => <div key={event.id} className="rounded-xl bg-slate-50 p-3 text-sm"><div className="flex flex-wrap justify-between gap-2"><strong>{event.staff_name} · {String(event.event_type || '').replace(/_/g, ' ').toUpperCase()}</strong><span className="text-xs text-slate-400">{event.created_at}</span></div><p className="mt-1 text-xs text-slate-600">Actor: {event.actor_name || `${event.actor_role} #${event.actor_id}`}{event.reason ? ` · ${event.reason}` : ''}</p></div>) : <p className="text-sm text-slate-500">No closing events for this date.</p>}</div></div>
          </div>
        </section>
      </>}

      <Modal open={Boolean(reopen)} onClose={() => !busy && setReopen(null)} closeDisabled={busy} title="Reopen Cashier Shift?" description={reopen ? `${reopen.staff_name || 'Cashier'} · ${date}` : ''} size="md">
        <div className="space-y-4"><p className="text-sm text-slate-600">Reopening allows payments from this shift to be corrected, voided, or refunded before the cashier closes it again.</p><label className="block"><span className="form-label">Reason <span className="text-rose-500">*</span></span><textarea rows={3} className="form-control mt-1.5 resize-none" value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Explain why this shift must be reopened." /></label><div className="flex justify-end gap-2"><button className="button-secondary" disabled={busy} onClick={() => setReopen(null)}>Cancel</button><button className="button-primary" disabled={busy || !reason.trim()} onClick={confirmReopen}>{busy ? 'Reopening…' : 'Reopen Shift'}</button></div></div>
      </Modal>
    </div>
  )
}

export default Admin_BillingReconciliation
