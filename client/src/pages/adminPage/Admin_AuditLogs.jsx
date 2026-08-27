import { useCallback, useEffect, useMemo, useState } from 'react'
import { MdHistory, MdRefresh, MdSearch, MdVisibility } from 'react-icons/md'
import { getAuditLogs } from '../../services/admin.service'
import Modal from '../../components/ui/Modal'
import Pagination from '../../components/ui/Pagination'
import { useToast } from '../../components/ui/ToastProvider'

const formatDateTime = (value) => value ? new Date(value).toLocaleString('en-PH', {
  month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit',
}) : '—'

const pretty = (value) => {
  if (value === null || value === undefined || value === '') return '—'
  if (typeof value === 'object') return value
  try { return JSON.parse(value) } catch { return value }
}

const DetailGrid = ({ value }) => {
  const data = pretty(value)
  if (!data || typeof data !== 'object' || Array.isArray(data)) return <p className="text-sm text-slate-500">{String(data ?? '—')}</p>
  const entries = Object.entries(data)
  if (!entries.length) return <p className="text-sm text-slate-400">No recorded values.</p>
  return (
    <dl className="divide-y divide-slate-100 rounded-2xl border border-slate-200 bg-white">
      {entries.map(([key, val]) => (
        <div key={key} className="grid gap-1 px-4 py-3 sm:grid-cols-[180px_1fr]">
          <dt className="text-xs font-bold uppercase tracking-wider text-slate-400">{key.replace(/_/g, ' ')}</dt>
          <dd className="break-words text-sm text-slate-700">{typeof val === 'object' && val !== null ? JSON.stringify(val, null, 2) : String(val ?? '—')}</dd>
        </div>
      ))}
    </dl>
  )
}

const Admin_AuditLogs = () => {
  const toast = useToast()
  const [data, setData] = useState({ items: [], pagination: { page: 1, totalPages: 1, total: 0, limit: 20 } })
  const [page, setPage] = useState(1)
  const [loading, setLoading] = useState(true)
  const [selected, setSelected] = useState(null)
  const [filters, setFilters] = useState({ search: '', start_date: '', end_date: '', user_role: '', entity_type: '', action: '' })

  const load = useCallback(async () => {
    setLoading(true)
    try { setData(await getAuditLogs({ ...filters, page, limit: 20 })) }
    catch (error) { toast.error(error.message || 'Could not load audit logs.') }
    finally { setLoading(false) }
  }, [filters, page, toast])

  useEffect(() => { load() }, [load])

  const modules = useMemo(() => Array.from(new Set((data.items || []).map((row) => row.entity_type).filter(Boolean))).sort(), [data.items])
  const update = (key, value) => { setPage(1); setFilters((prev) => ({ ...prev, [key]: value })) }

  return (
    <div className="mx-auto w-full max-w-7xl space-y-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-bold text-slate-900"><MdHistory className="text-amber-500" /> Audit Logs</h1>
          <p className="mt-1 text-sm text-slate-500">Review important financial, appointment, inventory, account, and system changes.</p>
        </div>
        <button type="button" className="button-secondary" onClick={load}><MdRefresh /> Refresh</button>
      </div>

      <section className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-6">
          <label className="relative md:col-span-2"><MdSearch className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" /><input className="form-control pl-11" placeholder="Search action, module, or reference…" value={filters.search} onChange={(e) => update('search', e.target.value)} /></label>
          <input type="date" className="form-control" value={filters.start_date} onChange={(e) => update('start_date', e.target.value)} aria-label="Start date" />
          <input type="date" className="form-control" value={filters.end_date} onChange={(e) => update('end_date', e.target.value)} aria-label="End date" />
          <select className="form-control" value={filters.user_role} onChange={(e) => update('user_role', e.target.value)}><option value="">All roles</option><option value="admin">Admin</option><option value="staff">Staff</option><option value="doctor">Doctor</option><option value="patient">Patient</option><option value="system">System</option></select>
          <select className="form-control" value={filters.entity_type} onChange={(e) => update('entity_type', e.target.value)}><option value="">All modules</option>{modules.map((value) => <option key={value} value={value}>{value.replace(/_/g, ' ')}</option>)}</select>
        </div>

        <div className="mt-4 overflow-x-auto">
          <table className="min-w-full text-left text-sm">
            <thead className="border-b border-slate-100 text-xs uppercase tracking-wider text-slate-400"><tr><th className="px-3 py-3">Date / Time</th><th className="px-3 py-3">Action</th><th className="px-3 py-3">Module</th><th className="px-3 py-3">Performed By</th><th className="px-3 py-3">Reference</th><th className="px-3 py-3"></th></tr></thead>
            <tbody className="divide-y divide-slate-100">
              {loading ? <tr><td colSpan="6" className="p-10 text-center text-slate-400">Loading audit activity…</td></tr> : data.items?.length ? data.items.map((row) => (
                <tr key={row.id} className="hover:bg-slate-50">
                  <td className="whitespace-nowrap px-3 py-3 text-slate-500">{formatDateTime(row.created_at)}</td>
                  <td className="px-3 py-3 font-semibold text-slate-900">{String(row.action || '').replace(/[._]/g, ' ')}</td>
                  <td className="px-3 py-3"><span className="rounded-full bg-slate-100 px-2.5 py-1 text-xs font-semibold text-slate-600">{String(row.entity_type || 'system').replace(/_/g, ' ')}</span></td>
                  <td className="px-3 py-3"><p className="font-medium text-slate-700">{row.performed_by || 'System'}</p><p className="text-xs capitalize text-slate-400">{row.user_role || 'system'}</p></td>
                  <td className="px-3 py-3 text-slate-500">{row.entity_id || '—'}</td>
                  <td className="px-3 py-3 text-right"><button type="button" className="button-secondary" onClick={() => setSelected(row)}><MdVisibility /> Details</button></td>
                </tr>
              )) : <tr><td colSpan="6" className="p-10 text-center text-slate-400">No audit events match these filters.</td></tr>}
            </tbody>
          </table>
        </div>
        <Pagination page={data.pagination?.page || page} totalPages={data.pagination?.totalPages || 1} total={data.pagination?.total || 0} pageSize={data.pagination?.limit || 20} onPageChange={setPage} disabled={loading} />
      </section>

      <Modal open={Boolean(selected)} onClose={() => setSelected(null)} title="Audit Event Details" description={selected ? `${formatDateTime(selected.created_at)} • ${selected.performed_by || 'System'}` : ''} size="xl">
        {selected && <div className="space-y-5">
          <div className="grid gap-3 sm:grid-cols-3"><div className="rounded-2xl bg-slate-50 p-4"><p className="text-xs uppercase tracking-wider text-slate-400">Action</p><p className="mt-1 font-bold text-slate-900">{selected.action}</p></div><div className="rounded-2xl bg-slate-50 p-4"><p className="text-xs uppercase tracking-wider text-slate-400">Entity</p><p className="mt-1 font-bold text-slate-900">{selected.entity_type} {selected.entity_id ? `• ${selected.entity_id}` : ''}</p></div><div className="rounded-2xl bg-slate-50 p-4"><p className="text-xs uppercase tracking-wider text-slate-400">IP Address</p><p className="mt-1 font-bold text-slate-900">{selected.ip_address || 'Not recorded'}</p></div></div>
          <div className="grid gap-5 lg:grid-cols-2"><div><h3 className="mb-2 text-sm font-bold text-slate-900">Before</h3><DetailGrid value={selected.old_values} /></div><div><h3 className="mb-2 text-sm font-bold text-slate-900">After</h3><DetailGrid value={selected.new_values} /></div></div>
        </div>}
      </Modal>
    </div>
  )
}

export default Admin_AuditLogs
