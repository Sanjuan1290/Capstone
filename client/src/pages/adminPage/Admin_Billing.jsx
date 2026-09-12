import { useCallback, useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { MdPayments, MdRefresh, MdArrowForward, MdWarningAmber, MdReceiptLong, MdApproval, MdSettings, MdCheckCircle } from 'react-icons/md'
import { getBills, getBillingAdjustmentRequests, getBillingReconciliation, getBillingPaymentSettings, getBillingCatalog, getInventory, getClinicSettings } from '../../services/admin.service'
import { useToast } from '../../components/ui/ToastProvider'
import { LoadingState, ErrorState, EmptyState } from '../../components/ui/PageState'
import AdminBillingNav from '../../components/billing/AdminBillingNav'
import BillingStatusBadge from '../../components/billing/BillingStatusBadge'
import { formatMoney, paymentMethodLabel } from '../../utils/billingUi'
import { getLocalDateOnly, formatDateOnly } from '../../utils/date'

const Admin_Billing = () => {
  const toast = useToast()
  const [data, setData] = useState({ items: [], summary: {}, pagination: {} })
  const [pendingApprovalCount, setPendingApprovalCount] = useState(0)
  const [reconciliation, setReconciliation] = useState(null)
  const [setup, setSetup] = useState({ payment: {}, catalog: [], inventory: [], clinic: {} })
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  const load = useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      const [bills, pending, recon, payment, catalog, inventory, clinic] = await Promise.all([
        getBills({ page: 1, limit: 6 }),
        getBillingAdjustmentRequests({ status: 'pending', page: 1, limit: 1 }),
        getBillingReconciliation(getLocalDateOnly()),
        getBillingPaymentSettings(),
        getBillingCatalog({ includeInactive: true }),
        getInventory(),
        getClinicSettings(),
      ])
      setData(bills || { items: [], summary: {}, pagination: {} })
      setPendingApprovalCount(Number(pending?.pagination?.total ?? (Array.isArray(pending) ? pending.length : 0)))
      setReconciliation(recon || null)
      setSetup({
        payment: payment || {},
        catalog: Array.isArray(catalog) ? catalog : [],
        inventory: Array.isArray(inventory) ? inventory : [],
        clinic: clinic || {},
      })
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
  const collectedToday = Number(reconciliation?.summary?.net_collected ?? (Number(reconciliation?.summary?.gross_collected || 0) - Number(reconciliation?.summary?.refunded || 0)))
  const attention = useMemo(() => [
    { label: 'Billing approvals', value: pendingApprovalCount, to: '/admin/billing/approvals', icon: MdApproval, tone: 'amber' },
    { label: 'Partial balances', value: partial, to: '/admin/billing/transactions?status=partially_paid', icon: MdWarningAmber, tone: 'sky' },
    { label: 'Ready for payment', value: ready, to: '/admin/billing/transactions?status=ready', icon: MdReceiptLong, tone: 'slate' },
  ], [pendingApprovalCount, partial, ready])

  const setupIssues = useMemo(() => {
    const payment = setup.payment || {}
    const catalog = Array.isArray(setup.catalog) ? setup.catalog : []
    const inventory = Array.isArray(setup.inventory) ? setup.inventory : []
    const clinic = setup.clinic || {}
    const issues = []
    const enabled = [payment.cash_enabled, payment.gcash_enabled, payment.maya_enabled, payment.bank_transfer_enabled].filter(Boolean).length
    if (!enabled) issues.push({ severity: 'critical', label: 'No payment method is enabled.', to: '/admin/billing/setup/payment-methods' })
    if (payment.bank_transfer_enabled && (!payment.bank_name || !payment.bank_account_name || !payment.bank_account_number)) {
      issues.push({ severity: 'critical', label: 'Bank Transfer is enabled but bank account details are incomplete.', to: '/admin/billing/setup/payment-methods' })
    }
    if (payment.gcash_enabled && (payment.gcash_qr_mode || 'uploaded') === 'uploaded' && !payment.gcash_qr_url) {
      issues.push({ severity: 'critical', label: 'GCash is enabled for an uploaded QR, but no QR image is configured.', to: '/admin/billing/setup/payment-methods' })
    }
    if (payment.maya_enabled && (payment.maya_qr_mode || 'uploaded') === 'uploaded' && !payment.maya_qr_url) {
      issues.push({ severity: 'critical', label: 'Maya is enabled for an uploaded QR, but no QR image is configured.', to: '/admin/billing/setup/payment-methods' })
    }
    const active = catalog.filter((service) => Number(service.is_active) === 1)
    if (!active.length) issues.push({ severity: 'warning', label: 'No active billing services are configured.', to: '/admin/billing/setup/services' })
    const freeCount = active.filter((service) => Number(service.default_price ?? service.patient_price ?? 0) <= 0).length
    if (freeCount) issues.push({ severity: 'warning', label: `${freeCount} active service${freeCount === 1 ? '' : 's'} ${freeCount === 1 ? 'has' : 'have'} a ₱0 patient price.`, to: '/admin/billing/setup/services' })
    const belowCost = active.filter((service) => {
      const patient = Number(service.default_price ?? service.patient_price ?? 0)
      const cost = Number(service.materials_cost || 0) + Number(service.consultation_fee || 0)
      return patient > 0 && cost > 0 && patient < cost
    }).length
    if (belowCost) issues.push({ severity: 'warning', label: `${belowCost} active service${belowCost === 1 ? '' : 's'} ${belowCost === 1 ? 'is' : 'are'} priced below estimated cost.`, to: '/admin/billing/setup/services' })
    const inventoryIds = new Set(inventory.map((item) => Number(item.id)))
    const missingLinks = active.reduce((count, service) => count + (Array.isArray(service.materials) ? service.materials.filter((m) => m.inventory_id && !inventoryIds.has(Number(m.inventory_id))).length : 0), 0)
    if (missingLinks) issues.push({ severity: 'warning', label: `${missingLinks} service consumable link${missingLinks === 1 ? '' : 's'} point${missingLinks === 1 ? 's' : ''} to missing inventory records.`, to: '/admin/billing/setup/services' })
    const unpricedInventory = inventory.filter((item) => item.selling_price === null || item.selling_price === undefined || item.selling_price === '').length
    if (unpricedInventory) issues.push({ severity: 'warning', label: `${unpricedInventory} inventory item${unpricedInventory === 1 ? '' : 's'} ${unpricedInventory === 1 ? 'has' : 'have'} no patient selling price for direct Checkout billing.`, to: '/admin/inventory' })
    if (!String(clinic.receipt_title || '').trim()) issues.push({ severity: 'warning', label: 'Receipt title is not configured.', to: '/admin/billing/setup/receipt' })
    if (!String(clinic.clinic_name || '').trim()) issues.push({ severity: 'critical', label: 'Clinic identity is incomplete for receipts.', to: '/admin/clinic-settings' })
    return issues
  }, [setup])

  return (
    <div className="mx-auto w-full max-w-7xl space-y-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-bold text-slate-900"><MdPayments className="text-amber-500" /> Billing</h1>
          <p className="mt-1 text-sm text-slate-500">Monitor collections, outstanding balances, approvals, and cashier activity without mixing setup tasks into daily operations.</p>
        </div>
        <button type="button" onClick={load} className="button-secondary"><MdRefresh /> Refresh</button>
      </div>

      <AdminBillingNav pendingApprovals={pendingApprovalCount} />

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

          {setupIssues.length > 0 ? (
            <section className="rounded-3xl border border-amber-200 bg-amber-50 p-5 shadow-sm">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="flex gap-3">
                  <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-amber-100 text-xl text-amber-700"><MdWarningAmber /></div>
                  <div><h2 className="font-black text-amber-950">Billing Setup needs attention</h2><p className="mt-1 text-sm text-amber-800">Fix these items before they interrupt Staff during patient checkout.</p></div>
                </div>
                <Link to="/admin/billing/setup" className="button-secondary"><MdSettings /> Review Billing Setup</Link>
              </div>
              <div className="mt-4 grid gap-2 lg:grid-cols-2">
                {setupIssues.slice(0, 6).map((issue, index) => (
                  <Link key={`${issue.label}-${index}`} to={issue.to} className={`flex items-start gap-2 rounded-2xl border px-3 py-3 text-sm font-semibold ${issue.severity === 'critical' ? 'border-rose-200 bg-white text-rose-800' : 'border-amber-200 bg-white text-amber-900'}`}>
                    <MdWarningAmber className="mt-0.5 shrink-0" />
                    <span>{issue.label}</span>
                  </Link>
                ))}
              </div>
              {setupIssues.length > 6 && <p className="mt-3 text-xs font-semibold text-amber-800">+ {setupIssues.length - 6} more setup issue{setupIssues.length - 6 === 1 ? '' : 's'}.</p>}
            </section>
          ) : (
            <section className="flex items-center justify-between gap-3 rounded-3xl border border-emerald-200 bg-emerald-50 p-5 shadow-sm">
              <div className="flex items-center gap-3"><div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-emerald-100 text-xl text-emerald-700"><MdCheckCircle /></div><div><h2 className="font-black text-emerald-950">Billing Setup looks ready</h2><p className="mt-1 text-sm text-emerald-800">No blocking configuration issues were detected.</p></div></div>
              <Link to="/admin/billing/setup" className="text-sm font-black text-emerald-800">Review Setup</Link>
            </section>
          )}

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
