import { useCallback, useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { MdAdd, MdInventory2, MdRefresh, MdSearch, MdWarningAmber } from 'react-icons/md'
import Pagination from '../../components/ui/Pagination'
import useClientPagination from '../../hooks/useClientPagination'
import { getInventoryItems, getMyRequests } from '../../services/doctor.service'

const STATUS_CFG = {
  pending: 'border-amber-200 bg-amber-50 text-amber-700',
  approved: 'border-emerald-200 bg-emerald-50 text-emerald-700',
  rejected: 'border-rose-200 bg-rose-50 text-rose-700',
}
const TABS = ['all', 'pending', 'approved', 'rejected']
const formatDate = (value) => value ? new Date(value).toLocaleDateString('en-PH', { month: 'short', day: 'numeric', year: 'numeric' }) : '-'

const RequestCard = ({ request }) => (
  <article className="overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-sm">
    <div className="p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div><p className="text-xs font-bold uppercase tracking-[0.2em] text-slate-400">Transfer Request #{request.id}</p><h3 className="mt-1 font-black text-slate-900">{request.item_count} item{request.item_count === 1 ? '' : 's'} → {request.destination_location}</h3><p className="mt-1 text-xs text-slate-500">Requested {formatDate(request.requested_at)}</p><p className="mt-2 text-xs font-semibold text-violet-700">{request.patient_name || 'Unlinked patient'} · Appointment #{request.appointment_id || '—'}{request.requested_service_name ? ` · ${request.requested_service_name}` : ''}</p></div>
        <span className={`rounded-full border px-3 py-1 text-xs font-bold capitalize ${STATUS_CFG[request.status] || 'border-slate-200 bg-slate-50 text-slate-600'}`}>{request.status}</span>
      </div>
      <div className="mt-4 divide-y divide-slate-100 rounded-2xl border border-slate-200">
        {(request.items || []).map((item) => <div key={item.id} className="flex items-center justify-between gap-4 px-4 py-3"><div><p className="font-semibold text-slate-800">{item.item_name}</p><p className="text-xs text-slate-400">{item.category === 'derma' ? 'Dermatology' : 'General Medicine'}</p></div><p className="shrink-0 text-sm font-black text-slate-700">{item.qty_requested} {item.unit}</p></div>)}
      </div>
      <div className="mt-3 rounded-2xl bg-slate-50 px-4 py-3"><p className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Reason</p><p className="mt-1 text-sm text-slate-600">{request.reason || 'No reason provided.'}</p>{request.resolution_note && <p className="mt-2 text-xs text-slate-500"><strong>Resolution note:</strong> {request.resolution_note}</p>}</div>
    </div>
  </article>
)

const Doctor_Request = () => {
  const [inventoryItems, setInventoryItems] = useState([])
  const [requests, setRequests] = useState([])
  const [loading, setLoading] = useState(true)
  const [filter, setFilter] = useState('all')
  const [search, setSearch] = useState('')
  const [error, setError] = useState('')

  const load = useCallback(async () => {
    setLoading(true); setError('')
    try {
      const [items, groups] = await Promise.all([getInventoryItems(), getMyRequests()])
      setInventoryItems(Array.isArray(items) ? items : [])
      setRequests(Array.isArray(groups) ? groups : [])
    } catch (err) { setError(err.message || 'Failed to load stock transfer requests.') }
    finally { setLoading(false) }
  }, [])

  useEffect(() => { load() }, [load])
  useEffect(() => { const refresh = () => load(); window.addEventListener('clinic:refresh', refresh); return () => window.removeEventListener('clinic:refresh', refresh) }, [load])

  const counts = useMemo(() => Object.fromEntries(TABS.map((tab) => [tab, tab === 'all' ? requests.length : requests.filter((request) => request.status === tab).length])), [requests])
  const filtered = useMemo(() => requests.filter((request) => {
    if (filter !== 'all' && request.status !== filter) return false
    const needle = search.trim().toLowerCase()
    if (!needle) return true
    return String(request.reason || '').toLowerCase().includes(needle) || String(request.patient_name || '').toLowerCase().includes(needle) || String(request.requested_service_name || '').toLowerCase().includes(needle) || String(request.destination_location || '').toLowerCase().includes(needle) || (request.items || []).some((item) => `${item.item_name} ${item.category}`.toLowerCase().includes(needle))
  }), [requests, filter, search])
  const pagination = useClientPagination(filtered, { resetDeps: [filter, search] })
  const availableItems = inventoryItems.filter((item) => Number(item.main_stockroom_stock || 0) > 0).length

  if (loading) return <div className="flex items-center justify-center py-20"><div className="h-10 w-10 animate-spin rounded-full border-4 border-slate-200 border-t-violet-500" /></div>

  return <div className="mx-auto max-w-6xl space-y-6">
    <section className="rounded-[30px] border border-violet-200 bg-white p-6 shadow-sm">
      <div className="flex flex-wrap items-start justify-between gap-4"><div><p className="text-xs font-bold uppercase tracking-[0.24em] text-violet-500">Doctor Stock Desk</p><h1 className="mt-2 text-2xl font-black text-slate-900">Stock Transfer Requests</h1><p className="mt-2 text-sm text-slate-600">Request several items in one transfer. Approved requests move all lines atomically from Main Stockroom to the selected treatment location.</p></div><div className="flex gap-2"><button onClick={load} className="button-secondary"><MdRefresh /> Refresh</button><Link to="/doctor/request/stock-transfer" className="button-primary"><MdAdd /> Request Stock Transfer</Link></div></div>
      <div className="mt-5 grid gap-3 sm:grid-cols-3"><div className="rounded-2xl bg-amber-50 p-4"><p className="text-3xl font-black text-amber-700">{counts.pending || 0}</p><p className="text-xs font-bold uppercase text-amber-700">Pending Requests</p></div><div className="rounded-2xl bg-emerald-50 p-4"><p className="text-3xl font-black text-emerald-700">{counts.approved || 0}</p><p className="text-xs font-bold uppercase text-emerald-700">Approved Requests</p></div><div className="rounded-2xl bg-sky-50 p-4"><p className="text-3xl font-black text-sky-700">{availableItems}</p><p className="text-xs font-bold uppercase text-sky-700">Items Available in Main Stockroom</p></div></div>
    </section>
    {error && <div className="flex gap-2 rounded-2xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-700"><MdWarningAmber /> {error}</div>}
    <div className="grid gap-3 lg:grid-cols-[1fr_auto]"><div className="relative"><MdSearch className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" /><input className="form-control pl-10" value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search patient, appointment, service, item, destination, or reason..." /></div><div className="flex gap-2 overflow-x-auto">{TABS.map((tab) => <button key={tab} onClick={() => setFilter(tab)} className={`rounded-xl px-4 py-2 text-sm font-bold capitalize ${filter === tab ? 'bg-violet-600 text-white' : 'border border-slate-200 bg-white text-slate-600'}`}>{tab} <span className="ml-1 text-xs">{counts[tab] || 0}</span></button>)}</div></div>
    {!filtered.length ? <section className="rounded-3xl border border-dashed border-slate-200 bg-white p-12 text-center"><MdInventory2 className="mx-auto text-5xl text-slate-300" /><p className="mt-3 text-sm font-semibold text-slate-600">No stock transfer requests found.</p></section> : <div className="space-y-3">{pagination.pageItems.map((request) => <RequestCard key={request.id} request={request} />)}</div>}
    {filtered.length > 0 && <Pagination {...pagination} total={filtered.length} />}
  </div>
}

export default Doctor_Request
