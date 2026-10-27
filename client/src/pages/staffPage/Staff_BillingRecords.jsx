import { useEffect, useState } from 'react'
import { MdPayments, MdRefresh } from 'react-icons/md'
import { getBills } from '../../services/staff.service'
import Pagination from '../../components/ui/Pagination'
import BillingStatusBadge from '../../components/billing/BillingStatusBadge'
import { EmptyState, ErrorState, LoadingState } from '../../components/ui/PageState'
import { formatMoney } from '../../utils/billingUi'

const Staff_BillingRecords = () => {
  const [page, setPage] = useState(1)
  const [data, setData] = useState({ items: [], pagination: {} })
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const load = async () => { setLoading(true); setError(''); try { setData(await getBills({ page, limit: 15 })) } catch (err) { setError(err.message || 'Could not load billing records.') } finally { setLoading(false) } }
  useEffect(() => { load() }, [page]) // eslint-disable-line react-hooks/exhaustive-deps
  const items = data.items || [], p = data.pagination || {}
  return <div className="mx-auto max-w-7xl space-y-5"><div className="flex items-start justify-between gap-3"><div><h1 className="flex items-center gap-2 text-2xl font-black text-slate-900"><MdPayments className="text-sky-500" /> Billing</h1><p className="mt-1 text-sm text-slate-500">View billing records, balances, and payment status. Payment collection requires the separate Checkout permission.</p></div><button className="button-secondary" onClick={load}><MdRefresh /> Refresh</button></div><section className="overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-sm">{loading?<div className="p-5"><LoadingState label="Loading billing records..."/></div>:error?<div className="p-5"><ErrorState message={error} onRetry={load}/></div>:!items.length?<div className="p-5"><EmptyState title="No billing records" /></div>:<div className="overflow-x-auto"><table className="min-w-full text-sm"><thead className="bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-400"><tr><th className="px-5 py-3">Bill</th><th className="px-5 py-3">Patient</th><th className="px-5 py-3">Doctor</th><th className="px-5 py-3">Status</th><th className="px-5 py-3 text-right">Total</th><th className="px-5 py-3 text-right">Balance</th></tr></thead><tbody className="divide-y divide-slate-100">{items.map((bill)=><tr key={bill.id}><td className="px-5 py-4 font-bold text-slate-700">#{bill.id}</td><td className="px-5 py-4"><p className="font-bold text-slate-900">{bill.patient_name}</p><p className="text-xs text-slate-400">{bill.appointment_date || '—'}</p></td><td className="px-5 py-4 text-slate-600">{bill.doctor_name || '—'}</td><td className="px-5 py-4"><BillingStatusBadge status={bill.status} audience="staff" /></td><td className="px-5 py-4 text-right font-bold text-slate-800">{formatMoney(bill.total_amount)}</td><td className="px-5 py-4 text-right font-black text-slate-900">{formatMoney(bill.balance_amount)}</td></tr>)}</tbody></table></div>}<div className="border-t border-slate-100 p-4"><Pagination page={p.page||page} totalPages={p.totalPages||1} pageSize={p.limit||15} total={p.total||0} onPageChange={setPage}/></div></section></div>
}
export default Staff_BillingRecords
