import { useCallback, useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { MdPayments, MdRefresh, MdArrowForward, MdWarningAmber, MdReceiptLong, MdApproval, MdAccountBalanceWallet } from 'react-icons/md'
import { getBills, getBillingAdjustmentRequests, getBillingReconciliation } from '../../services/admin.service'
import { useToast } from '../../components/ui/ToastProvider'
import { LoadingState, ErrorState, EmptyState } from '../../components/ui/PageState'
import AdminBillingNav from '../../components/billing/AdminBillingNav'
import BillingStatusBadge from '../../components/billing/BillingStatusBadge'
import { formatMoney, paymentMethodLabel } from '../../utils/billingUi'
import { getLocalDateOnly, formatDateOnly } from '../../utils/date'

const Admin_Billing = () => {
  const toast = useToast()
  const [data, setData] = useState({ items: [], summary: {}, pagination: {} })
  const [adjustments, setAdjustments] = useState([])
  const [reconciliation, setReconciliation] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  const load = useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      const [bills, pending, recon] = await Promise.all([
        getBills({ page: 1, limit: 6 }),
        getBillingAdjustmentRequests({ status: 'pending' }),
        getBillingReconciliation(getLocalDateOnly()),
      ])
      setData(bills || { items: [], summary: {}, pagination: {} })
      setAdjustments(Array.isArray(pending) ? pending : [])
      setReconciliation(recon || null)
    } catch (err) {
      const message = err.message || 'Could not load billing overview.'
      setError(message)
      toast.error(message)
    } finally {
      setLoading(false)
    }
  }, [toast])

  useEffect(() => { load() }, [load])
  useEffect(() => {
    const refresh = () => load()
    window.addEventListener('clinic:refresh', refresh)
    return () => window.removeEventListener('clinic:refresh', refresh)
  }, [load])

  const summary = data.summary || {}
  const partial = Number(summary.partially_paid || 0)
  const ready = Number(summary.ready || 0)
  const collectedToday = Number(reconciliation?.summary?.gross_collected || 0) - Number(reconciliation?.summary?.refunded || 0)
  const attention = useMemo(() => [
    { label: 'Billing approvals', value: adjustments.length, to: '/admin/billing/approvals', icon: MdApproval, tone: 'amber' },
    { label: 'Partial balances', value: partial, to: '/admin/billing/transactions?status=partially_paid', icon: MdWarningAmber, tone: 'sky' },
    { label: 'Ready for payment', value: ready, to: '/admin/billing/transactions?status=ready', icon: MdReceiptLong, tone: 'slate' },
  ], [adjustments.length, partial, ready])

  return (
    <div className="mx-auto w-full max-w-7xl space-y-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-bold text-slate-900"><MdPayments className="text-amber-500" /> Billing</h1>
          <p className="mt-1 text-sm text-slate-500">Monitor collections, outstanding balances, approvals, and cashier activity without mixing setup tasks into daily operations.</p>
        </div>
        <button type="button" onClick={load} className="button-secondary"><MdRefresh /> Refresh</button>
      </div>

      <AdminBillingNav pendingApprovals={adjustments.length} />

      {loading ? <LoadingState label="Loading billing overview..." /> : error ? <ErrorState message={error} onRetry={load} /> : (
        <>
          <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            {[
              ['Ready for Payment', ready, 'text-amber-700 bg-amber-50 border-amber-200'],
              ['Partial Balances', partial, 'text-sky-700 bg-sky-50 border-sky-200'],
              ['Collected Today', formatMoney(collectedToday), 'text-emerald-700 bg-emerald-50 border-emerald-200'],
              ['Outstanding', formatMoney(summary.outstanding), 'text-violet-700 bg-violet-50 border-violet-200'],
            ].map(([label, value, tone]) => (
              <div key={label} className={`rounded-2xl border p-4 shadow-sm ${tone}`}>
                <p className="text-[11px] font-bold uppercase tracking-widest opacity-80">{label}</p>
                <p className="mt-2 text-2xl font-black">{value}</p>
              </div>
            ))}
          </section>

          <div className="grid gap-5 xl:grid-cols-[minmax(0,1.45fr)_minmax(320px,.75fr)]">
            <section className="overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-sm">
              <div className="flex items-center justify-between gap-3 border-b border-slate-100 px-5 py-4">
                <div><h2 className="font-black text-slate-900">Recent Transactions</h2><p className="mt-1 text-xs text-slate-500">Latest billing activity across the clinic.</p></div>
                <Link to="/admin/billing/transactions" className="button-secondary">View All <MdArrowForward /></Link>
              </div>
              {!data.items?.length ? <EmptyState title="No billing records yet" description="Bills will appear after consultations create charges." /> : (
                <div className="overflow-x-auto">
                  <table className="min-w-full text-sm">
                    <thead className="bg-slate-50 text-left text-xs uppercase tracking-wider text-slate-500"><tr><th className="px-5 py-3">Patient</th><th className="px-4 py-3">Visit</th><th className="px-4 py-3">Total</th><th className="px-4 py-3">Balance</th><th className="px-4 py-3">Status</th><th className="px-5 py-3 text-right">View</th></tr></thead>
                    <tbody className="divide-y divide-slate-100">
                      {data.items.map((bill) => (
                        <tr key={bill.id} className="hover:bg-slate-50/70">
                          <td className="px-5 py-4"><p className="font-bold text-slate-900">{bill.patient_name}</p><p className="mt-0.5 text-xs text-slate-500">Bill #{bill.id} · {bill.doctor_name}</p></td>
                          <td className="px-4 py-4 text-slate-600">{formatDateOnly(bill.appointment_date)}<p className="mt-0.5 text-xs text-slate-400">{bill.appointment_time}</p></td>
                          <td className="px-4 py-4 font-bold text-slate-800">{formatMoney(bill.total_amount)}</td>
                          <td className="px-4 py-4 font-bold text-slate-800">{formatMoney(bill.balance_amount)}</td>
                          <td className="px-4 py-4"><BillingStatusBadge status={bill.status} /></td>
                          <td className="px-5 py-4 text-right"><Link className="text-sm font-bold text-amber-700 hover:text-amber-800" to={`/admin/billing/transactions/${bill.id}`}>Open</Link></td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </section>

            <div className="space-y-5">
              <section className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
                <div className="flex items-center justify-between"><div><h2 className="font-black text-slate-900">Attention Required</h2><p className="mt-1 text-xs text-slate-500">Items that need action or follow-up.</p></div></div>
                <div className="mt-4 space-y-2">
                  {attention.map((item) => { const Icon = item.icon; return (
                    <Link key={item.label} to={item.to} className="flex items-center gap-3 rounded-2xl border border-slate-200 p-3 hover:bg-slate-50">
                      <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-slate-100 text-slate-600"><Icon /></div>
                      <div className="min-w-0 flex-1"><p className="text-sm font-bold text-slate-800">{item.label}</p><p className="text-xs text-slate-500">Open the related billing queue</p></div>
                      <span className="text-xl font-black text-slate-900">{item.value}</span>
                    </Link>
                  )})}
                </div>
              </section>

              <section className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
                <div className="flex items-center justify-between gap-3"><div><h2 className="font-black text-slate-900">Today’s Collection Mix</h2><p className="mt-1 text-xs text-slate-500">{formatDateOnly(reconciliation?.date || getLocalDateOnly())}</p></div><Link to="/admin/billing/reconciliation" className="text-sm font-bold text-amber-700">Open</Link></div>
                <div className="mt-4 space-y-3">
                  {(reconciliation?.methods || []).length === 0 ? <p className="text-sm text-slate-500">No payments recorded today.</p> : reconciliation.methods.slice(0, 4).map((method) => (
                    <div key={method.payment_method} className="flex items-center justify-between gap-3"><span className="text-sm font-semibold text-slate-600">{paymentMethodLabel(method.payment_method)}</span><strong className="text-sm text-slate-900">{formatMoney(method.net)}</strong></div>
                  ))}
                </div>
              </section>
            </div>
          </div>
        </>
      )}
    </div>
  )
}

export default Admin_Billing
