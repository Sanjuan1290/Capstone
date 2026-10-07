import { useCallback, useEffect, useState } from 'react'
import { MdLockOpen, MdPointOfSale, MdRefresh } from 'react-icons/md'
import { getBillingReconciliation, getBillingAdjustmentRequests, reopenCashierClosing } from '../../services/admin.service'
import { useToast } from '../../components/ui/ToastProvider'
import Modal from '../../components/ui/Modal'
import { ErrorState, LoadingState } from '../../components/ui/PageState'
import AdminBillingNav from '../../components/billing/AdminBillingNav'
import { formatMoney, paymentMethodLabel } from '../../utils/billingUi'
import { getLocalDateOnly } from '../../utils/date'

const formatTime = (value) => (value ? new Date(String(value).replace(' ', 'T')).toLocaleTimeString('en-PH', { hour: 'numeric', minute: '2-digit' }) : '')

const VarianceText = ({ value }) => {
  const amount = Number(value || 0)
  if (Math.abs(amount) < 0.005) return <span className="font-bold text-emerald-700">Balanced</span>
  return <span className="font-bold text-amber-700">{amount < 0 ? 'Short' : 'Over'} {formatMoney(Math.abs(amount))}</span>
}

// Daily close: what was collected on one day (payments, voids and refunds dated by when
// they happened) and whether each cashier counted and closed their cash drawer.
const Admin_BillingReconciliation = () => {
  const toast = useToast()
  const [date, setDate] = useState(getLocalDateOnly())
  const [data, setData] = useState(null)
  const [pendingApprovals, setPendingApprovals] = useState(0)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [reopenTarget, setReopenTarget] = useState(null)
  const [reason, setReason] = useState('')
  const [busy, setBusy] = useState(false)

  const load = useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      const [recon, pending] = await Promise.all([
        getBillingReconciliation(date),
        getBillingAdjustmentRequests({ status: 'pending' }).catch(() => []),
      ])
      setData(recon)
      setPendingApprovals(Number(pending?.pagination?.total ?? pending?.items?.length ?? pending?.length ?? 0))
    } catch (err) {
      setError(err.message || 'Could not load the daily close.')
    } finally {
      setLoading(false)
    }
  }, [date])

  useEffect(() => { load() }, [load])

  const submitReopen = async () => {
    if (!reopenTarget || reason.trim().length < 5) return
    setBusy(true)
    try {
      await reopenCashierClosing(reopenTarget.id, reason.trim())
      toast.success('Cash drawer reopened.')
      setReopenTarget(null)
      load()
    } catch (err) {
      toast.error(err.message || 'Could not reopen the drawer.')
    } finally {
      setBusy(false)
    }
  }

  const summary = data?.summary || {}
  const cashiers = Array.isArray(data?.cashiers) ? data.cashiers : []
  const closings = Array.isArray(data?.closings) ? data.closings : []
  const closingsWithoutPayments = closings.filter((closing) => !cashiers.some((cashier) => cashier.closing?.id === closing.id))
  const cashierRows = [
    ...cashiers,
    ...closingsWithoutPayments.map((closing) => ({ cashier_role: closing.cashier_role, cashier_id: closing.staff_id, cashier_name: closing.cashier_name, transactions: 0, cash_received: 0, non_cash_received: 0, closing })),
  ]

  return (
    <div className="mx-auto w-full max-w-7xl space-y-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-bold text-slate-900"><MdPointOfSale className="text-amber-500" /> Daily Close</h1>
          <p className="mt-1 text-sm text-slate-500">Money collected on one day and each cashier's counted cash. Voids and refunds count on the day they were recorded.</p>
        </div>
        <div className="flex items-end gap-2">
          <label><span className="form-label">Date</span><input type="date" className="form-control mt-1.5" value={date} max={getLocalDateOnly()} onChange={(e) => setDate(e.target.value)} /></label>
          <button type="button" className="button-secondary" onClick={load}><MdRefresh /> Refresh</button>
        </div>
      </div>
      <AdminBillingNav pendingApprovals={pendingApprovals} />

      {loading ? <LoadingState label="Loading daily close..." /> : error ? <ErrorState message={error} onRetry={load} /> : (
        <>
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            {[
              ['Payments received', summary.gross_collected, `${summary.transactions || 0} payment${Number(summary.transactions) === 1 ? '' : 's'}`],
              ['Voided', summary.voided, `${summary.voided_transactions || 0} voided payment${Number(summary.voided_transactions) === 1 ? '' : 's'}`],
              ['Refunded', summary.refunded, 'Refunds given on this day'],
              ['Net collected', summary.net_collected, `${formatMoney(summary.cash_collected)} of it in cash`],
            ].map(([label, value, helper]) => (
              <div key={label} className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
                <p className="text-xs font-bold text-slate-500">{label}</p>
                <p className="mt-2 text-2xl font-black text-slate-900">{formatMoney(value)}</p>
                <p className="mt-1 text-xs text-slate-500">{helper}</p>
              </div>
            ))}
          </div>

          <section className="overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-sm">
            <div className="border-b border-slate-100 px-5 py-4"><h2 className="font-black text-slate-900">Cashiers</h2><p className="mt-1 text-xs text-slate-500">Cash each cashier received, and their end-of-day count.</p></div>
            {cashierRows.length === 0 ? <p className="p-5 text-sm text-slate-500">No payments or cash counts on this day.</p> : (
              <div className="overflow-x-auto">
                <table className="min-w-full text-sm">
                  <thead className="bg-slate-50 text-left text-xs text-slate-500"><tr><th className="px-5 py-3">Cashier</th><th className="px-4 py-3 text-right">Payments</th><th className="px-4 py-3 text-right">Cash received</th><th className="px-4 py-3 text-right">Non-cash</th><th className="px-4 py-3">Drawer</th><th className="px-5 py-3 text-right"><span className="sr-only">Actions</span></th></tr></thead>
                  <tbody className="divide-y divide-slate-100">
                    {cashierRows.map((row) => {
                      const closing = row.closing
                      return (
                        <tr key={`${row.cashier_role}-${row.cashier_id}`}>
                          <td className="px-5 py-4"><p className="font-bold text-slate-900">{row.cashier_name || 'Unknown'}</p><p className="text-xs text-slate-500">{row.cashier_role === 'admin' ? 'Administrator' : 'Staff'}</p></td>
                          <td className="px-4 py-4 text-right">{row.transactions}</td>
                          <td className="px-4 py-4 text-right font-semibold">{formatMoney(row.cash_received)}</td>
                          <td className="px-4 py-4 text-right">{formatMoney(row.non_cash_received)}</td>
                          <td className="px-4 py-4">
                            {!closing ? <span className="text-xs font-bold text-slate-400">Not counted yet</span> : (
                              <div className="text-xs">
                                <p className="font-bold text-slate-700">{closing.status === 'closed' ? `Closed ${formatTime(closing.closed_at)}` : 'Reopened'}</p>
                                <p className="mt-0.5 text-slate-500">Expected {formatMoney(closing.expected_cash)}, counted {formatMoney(closing.actual_cash)}</p>
                                <p className="mt-0.5"><VarianceText value={closing.variance} /></p>
                                {closing.notes && <p className="mt-0.5 text-slate-500">Note: {closing.notes}</p>}
                              </div>
                            )}
                          </td>
                          <td className="px-5 py-4 text-right">
                            {closing?.status === 'closed' && <button type="button" className="button-secondary" onClick={() => { setReopenTarget({ ...closing, cashier_name: row.cashier_name }); setReason('') }}><MdLockOpen /> Reopen</button>}
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </section>

          <section className="overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-sm">
            <div className="border-b border-slate-100 px-5 py-4"><h2 className="font-black text-slate-900">By Payment Method</h2></div>
            {(data?.methods || []).length === 0 ? <p className="p-5 text-sm text-slate-500">No money movement on this day.</p> : (
              <div className="overflow-x-auto">
                <table className="min-w-full text-sm">
                  <thead className="bg-slate-50 text-left text-xs text-slate-500"><tr><th className="px-5 py-3">Method</th><th className="px-4 py-3 text-right">Payments</th><th className="px-4 py-3 text-right">Received</th><th className="px-4 py-3 text-right">Voided</th><th className="px-4 py-3 text-right">Refunded</th><th className="px-5 py-3 text-right">Net</th></tr></thead>
                  <tbody className="divide-y divide-slate-100">
                    {data.methods.map((row) => (
                      <tr key={row.payment_method}>
                        <td className="px-5 py-3 font-bold text-slate-800">{paymentMethodLabel(row.payment_method)}</td>
                        <td className="px-4 py-3 text-right">{row.transactions}</td>
                        <td className="px-4 py-3 text-right">{formatMoney(row.gross)}</td>
                        <td className="px-4 py-3 text-right text-slate-500">{formatMoney(row.voided)}</td>
                        <td className="px-4 py-3 text-right text-slate-500">{formatMoney(row.refunded)}</td>
                        <td className="px-5 py-3 text-right font-black text-slate-900">{formatMoney(row.net)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>
        </>
      )}

      <Modal open={Boolean(reopenTarget)} onClose={() => !busy && setReopenTarget(null)} closeDisabled={busy} title="Reopen Cash Drawer" description={reopenTarget ? `${reopenTarget.cashier_name || 'Cashier'}, ${reopenTarget.closing_date}` : ''} size="md">
        <div className="space-y-4">
          <p className="text-sm text-slate-600">The cashier can take payments again and must count and close the drawer again afterwards. The first count stays in the audit log.</p>
          <label className="block"><span className="form-label">Reason *</span><textarea rows={3} maxLength={500} value={reason} onChange={(e) => setReason(e.target.value)} className="form-control mt-1.5 resize-none" /></label>
          <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
            <button type="button" className="button-secondary" disabled={busy} onClick={() => setReopenTarget(null)}>Cancel</button>
            <button type="button" className="button-primary" disabled={busy || reason.trim().length < 5} onClick={submitReopen}>{busy ? 'Reopening…' : 'Reopen Drawer'}</button>
          </div>
        </div>
      </Modal>
    </div>
  )
}

export default Admin_BillingReconciliation
