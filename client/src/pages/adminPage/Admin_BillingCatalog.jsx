import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { MdAdd, MdClose, MdDelete, MdEdit, MdPayments, MdRefresh, MdSearch } from 'react-icons/md'
import { deleteBillingCatalogService, getBillingAdjustmentRequests, getBillingCatalog } from '../../services/admin.service'
import { useToast } from '../../components/ui/ToastProvider'
import Pagination from '../../components/ui/Pagination'
import ConfirmDialog from '../../components/ui/ConfirmDialog'
import { EmptyState, ErrorState, LoadingState } from '../../components/ui/PageState'
import AdminBillingNav from '../../components/billing/AdminBillingNav'
import BillingSetupNav from '../../components/billing/BillingSetupNav'
import { formatMoney } from '../../utils/billingUi'

const CLINIC_TYPES = [
  { value: 'all', label: 'All Clinics' },
  { value: 'medical', label: 'General Medicine' },
  { value: 'derma', label: 'Dermatology' },
]
const clinicLabel = (value) => CLINIC_TYPES.find((item) => item.value === value)?.label || value

const Admin_BillingCatalog = () => {
  const toast = useToast()
  const [services, setServices] = useState([])
  const [pendingCount, setPendingCount] = useState(0)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [search, setSearch] = useState('')
  const [filter, setFilter] = useState('all')
  const [page, setPage] = useState(1)
  const [pageSize, setPageSize] = useState(10)
  const [deleteCandidate, setDeleteCandidate] = useState(null)
  const [deleting, setDeleting] = useState(false)

  const load = async () => {
    setLoading(true); setError('')
    try {
      const [catalog, pending] = await Promise.all([getBillingCatalog({ includeInactive: true }), getBillingAdjustmentRequests({ status: 'pending' })])
      setServices(Array.isArray(catalog) ? catalog : []); setPendingCount(Array.isArray(pending) ? pending.length : 0)
    } catch (err) { const message = err.message || 'Billing services could not be loaded.'; setError(message); toast.error(message) }
    finally { setLoading(false) }
  }
  useEffect(() => { load() }, []) // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { setPage(1) }, [filter, search])

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase()
    return services.filter((service) => (filter === 'all' || service.clinic_type === filter) && (!q || [service.category, service.service_name, clinicLabel(service.clinic_type)].join(' ').toLowerCase().includes(q)))
  }, [services, filter, search])
  const totalPages = Math.max(1, Math.ceil(filtered.length / pageSize))
  const rows = filtered.slice((page - 1) * pageSize, page * pageSize)
  const activeCount = services.filter((service) => Number(service.is_active) === 1).length
  const linkedConsumables = services.reduce((sum, service) => sum + (service.materials?.length || 0), 0)

  const remove = async () => {
    if (!deleteCandidate?.id) return
    setDeleting(true)
    try { await deleteBillingCatalogService(deleteCandidate.id); toast.success('Service removed or archived.'); setDeleteCandidate(null); await load() }
    catch (err) { toast.error(err.message || 'Service could not be removed.') }
    finally { setDeleting(false) }
  }

  return <div className="mx-auto w-full max-w-7xl space-y-5">
    <div className="flex flex-wrap items-start justify-between gap-3"><div><h1 className="flex items-center gap-2 text-2xl font-bold text-slate-900"><MdPayments className="text-amber-500" /> Services & Pricing</h1><p className="mt-1 text-sm text-slate-500">Manage billable services, default consumables, internal costing, and patient prices.</p></div><div className="flex gap-2"><button className="button-secondary" onClick={load}><MdRefresh /> Refresh</button><Link className="button-primary" to="/admin/billing/setup/services/new"><MdAdd /> Add Service</Link></div></div>
    <AdminBillingNav pendingApprovals={pendingCount} /><BillingSetupNav />
    <div className="grid gap-3 sm:grid-cols-3"><div className="rounded-2xl border border-slate-200 bg-white p-4"><p className="text-xs font-bold uppercase text-slate-400">Services</p><p className="mt-2 text-2xl font-black">{services.length}</p></div><div className="rounded-2xl border border-slate-200 bg-white p-4"><p className="text-xs font-bold uppercase text-slate-400">Active</p><p className="mt-2 text-2xl font-black text-emerald-600">{activeCount}</p></div><div className="rounded-2xl border border-slate-200 bg-white p-4"><p className="text-xs font-bold uppercase text-slate-400">Linked Consumables</p><p className="mt-2 text-2xl font-black text-violet-600">{linkedConsumables}</p></div></div>
    <section className="overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-sm"><div className="space-y-3 border-b border-slate-100 p-5"><div className="flex flex-wrap gap-2">{CLINIC_TYPES.map((item) => <button key={item.value} className={`rounded-xl px-3 py-2 text-xs font-bold ${filter === item.value ? 'bg-[#0b1a2c] text-amber-400' : 'bg-slate-100 text-slate-500 hover:bg-slate-200'}`} onClick={() => setFilter(item.value)}>{item.label}</button>)}</div><div className="relative"><MdSearch className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" /><input className="form-control pl-10 pr-10" placeholder="Search service or category..." value={search} onChange={(e) => setSearch(e.target.value)} />{search && <button className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400" onClick={() => setSearch('')}><MdClose /></button>}</div></div>
      {loading ? <div className="p-5"><LoadingState label="Loading services..." /></div> : error ? <div className="p-5"><ErrorState message={error} onRetry={load} /></div> : rows.length === 0 ? <div className="p-5"><EmptyState title="No services found" description="Add a service or adjust the filters." /></div> : <><div className="overflow-x-auto"><table className="min-w-full text-sm"><thead className="bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-500"><tr><th className="px-5 py-3">Service</th><th className="px-5 py-3">Clinic</th><th className="px-5 py-3">Patient Price</th><th className="px-5 py-3">Consumables</th><th className="px-5 py-3">Status</th><th className="px-5 py-3 text-right">Actions</th></tr></thead><tbody className="divide-y divide-slate-100">{rows.map((service) => <tr key={service.id}><td className="px-5 py-4"><p className="font-black text-slate-800">{service.service_name}</p><p className="mt-1 text-xs text-slate-500">{service.category || 'Uncategorized'}</p></td><td className="px-5 py-4">{clinicLabel(service.clinic_type)}</td><td className="px-5 py-4 font-black text-slate-900">{formatMoney(service.default_price ?? service.patient_price ?? service.suggested_price)}</td><td className="px-5 py-4">{service.materials?.length || 0}</td><td className="px-5 py-4"><span className={`rounded-full px-2.5 py-1 text-xs font-bold ${Number(service.is_active) === 1 ? 'bg-emerald-50 text-emerald-700' : 'bg-slate-100 text-slate-500'}`}>{Number(service.is_active) === 1 ? 'Active' : 'Inactive'}</span></td><td className="px-5 py-4"><div className="flex justify-end gap-2"><Link className="button-secondary" to={`/admin/billing/setup/services/${service.id}/edit`}><MdEdit /> Edit</Link><button className="button-secondary text-rose-700" onClick={() => setDeleteCandidate(service)}><MdDelete /> Remove</button></div></td></tr>)}</tbody></table></div><div className="border-t border-slate-100 p-4"><Pagination page={page} totalPages={totalPages} pageSize={pageSize} total={filtered.length} onPageChange={setPage} onPageSizeChange={(size) => { setPageSize(size); setPage(1) }} /></div></>}
    </section>
    <ConfirmDialog open={Boolean(deleteCandidate)} title="Remove billing service?" message={`Remove ${deleteCandidate?.service_name || 'this service'}? If it already belongs to billing history, the server will deactivate it instead of destroying historical records.`} confirmLabel="Remove Service" loading={deleting} onCancel={() => !deleting && setDeleteCandidate(null)} onConfirm={remove} />
  </div>
}
export default Admin_BillingCatalog
