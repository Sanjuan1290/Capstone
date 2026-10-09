import { useCallback, useEffect, useMemo, useState } from 'react'
import { MdCheck, MdClose, MdInventory2, MdPerson, MdLocationOn, MdRefresh, MdSearch } from 'react-icons/md'
import Modal from '../ui/Modal'

const STATUS_CFG = {
  pending: { label: 'Pending', badge: 'border-amber-200 bg-amber-50 text-amber-700' },
  approved: { label: 'Approved', badge: 'border-emerald-200 bg-emerald-50 text-emerald-700' },
  rejected: { label: 'Rejected', badge: 'border-rose-200 bg-rose-50 text-rose-700' },
}
const TABS = ['all', 'pending', 'approved', 'rejected']
const DEFAULT_THEME = {
  accentSoft: 'bg-sky-50',
  accentBorder: 'border-sky-200',
  accentText: 'text-sky-700',
}
const formatDate = (value) => value ? new Date(value).toLocaleDateString('en-PH', { month: 'short', day: 'numeric', year: 'numeric' }) : '-'
const hasEnoughStock = (request) => (request.items || []).every((item) => Number(item.main_stockroom_stock || 0) >= Number(item.qty_requested || 0))

const SupplyRequestReviewPanel = ({
  title = 'Stock Transfer Requests',
  subtitle = 'Review doctor requests and transfer approved stock from Main Stockroom to the selected treatment location.',
  getRequests,
  resolveRequest,
  theme = DEFAULT_THEME,
  compact = false,
  itemsPerPage = 10,
}) => {
  const mergedTheme = { ...DEFAULT_THEME, ...theme }
  const [requests, setRequests] = useState([])
  const [loading, setLoading] = useState(true)
  const [resolving, setResolving] = useState(null)
  const [decision, setDecision] = useState(null)
  const [resolutionNote, setResolutionNote] = useState('')
  const [filter, setFilter] = useState('all')
  const [search, setSearch] = useState('')
  const [feedback, setFeedback] = useState(null)
  const [page, setPage] = useState(1)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const data = await getRequests()
      setRequests(Array.isArray(data) ? data : [])
    } catch (err) {
      setFeedback({ type: 'error', message: err.message || 'Failed to load stock transfer requests.' })
    } finally {
      setLoading(false)
    }
  }, [getRequests])

  useEffect(() => { load() }, [load])
  useEffect(() => { const refresh = () => load(); window.addEventListener('clinic:refresh', refresh); return () => window.removeEventListener('clinic:refresh', refresh) }, [load])
  useEffect(() => { if (!feedback) return undefined; const timer = window.setTimeout(() => setFeedback(null), 4000); return () => window.clearTimeout(timer) }, [feedback])
  useEffect(() => { setPage(1) }, [filter, search])

  const counts = useMemo(() => Object.fromEntries(TABS.map((tab) => [tab, tab === 'all' ? requests.length : requests.filter((request) => request.status === tab).length])), [requests])
  const filtered = useMemo(() => requests.filter((request) => {
    if (filter !== 'all' && request.status !== filter) return false
    const needle = search.trim().toLowerCase()
    if (!needle) return true
    return String(request.doctor_name || '').toLowerCase().includes(needle)
      || String(request.patient_name || '').toLowerCase().includes(needle)
      || String(request.requested_service_name || '').toLowerCase().includes(needle)
      || String(request.appointment_id || '').includes(needle)
      || String(request.destination_location || '').toLowerCase().includes(needle)
      || String(request.reason || '').toLowerCase().includes(needle)
      || (request.items || []).some((item) => `${item.item_name} ${item.category} ${item.item_type}`.toLowerCase().includes(needle))
  }), [requests, filter, search])
  const totalPages = Math.max(1, Math.ceil(filtered.length / itemsPerPage))
  const currentPage = Math.min(page, totalPages)
  const paginated = filtered.slice((currentPage - 1) * itemsPerPage, currentPage * itemsPerPage)

  const openDecision = (request, status) => { setDecision({ request, status }); setResolutionNote('') }
  const closeDecision = () => { if (!resolving) { setDecision(null); setResolutionNote('') } }

  const handleResolve = async () => {
    if (!decision?.request?.id) return
    if (decision.status === 'rejected' && !resolutionNote.trim()) {
      setFeedback({ type: 'error', message: 'Enter a rejection reason before rejecting this request.' })
      return
    }
    if (decision.status === 'approved' && (!hasEnoughStock(decision.request) || (decision.request.appointment_id && !['confirmed','rescheduled','in-progress'].includes(String(decision.request.appointment_status || ''))))) {
      setFeedback({ type: 'error', message: 'At least one item has insufficient Main Stockroom stock. Nothing can be transferred until all lines are fulfillable.' })
      return
    }
    setResolving(decision.request.id)
    try {
      const result = await resolveRequest(decision.request.id, decision.status, resolutionNote.trim())
      setRequests((current) => current.map((entry) => entry.id === decision.request.id ? { ...entry, status: decision.status, resolution_note: resolutionNote.trim() || null } : entry))
      setFeedback({ type: 'success', message: result?.message || (decision.status === 'approved' ? 'Stock transfer approved.' : 'Stock transfer rejected.') })
      setDecision(null); setResolutionNote('')
      await load()
    } catch (err) {
      setFeedback({ type: 'error', message: err.message || 'Failed to resolve stock transfer request.' })
    } finally {
      setResolving(null)
    }
  }

  if (loading) return <section className="rounded-[28px] border border-slate-200 bg-white p-8 shadow-sm"><div className="flex justify-center py-12"><div className={`h-9 w-9 animate-spin rounded-full border-4 border-slate-200 border-t-current ${mergedTheme.accentText}`} /></div></section>

  return <section className={`rounded-[28px] border border-slate-200 bg-white shadow-sm ${compact ? 'p-5' : 'p-6'}`}>
    <div className="flex flex-wrap items-start justify-between gap-4"><div><div className={`inline-flex items-center gap-2 rounded-full border px-3 py-1 text-[11px] font-bold uppercase tracking-[0.24em] ${mergedTheme.accentBorder} ${mergedTheme.accentSoft} ${mergedTheme.accentText}`}><MdInventory2 /> Admin and Staff Review</div><h2 className="mt-2 text-xl font-bold text-slate-900">{title}</h2><p className="mt-1 text-sm text-slate-500">{subtitle}</p></div><button onClick={load} className="button-secondary"><MdRefresh /> Refresh</button></div>
    {feedback && <div className={`mt-5 rounded-2xl border px-4 py-3 text-sm ${feedback.type === 'error' ? 'border-rose-200 bg-rose-50 text-rose-700' : 'border-emerald-200 bg-emerald-50 text-emerald-700'}`}>{feedback.message}</div>}
    <div className="mt-5 grid gap-3 lg:grid-cols-[1fr_auto]"><div className="relative"><MdSearch className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" /><input className="form-control pl-10" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search patient, doctor, appointment, service, item, or destination..." /></div><div className="flex gap-2 overflow-x-auto">{TABS.map((tab) => <button key={tab} onClick={() => setFilter(tab)} className={`rounded-xl px-4 py-2 text-sm font-bold capitalize ${filter === tab ? 'bg-slate-900 text-white' : 'border border-slate-200 bg-white text-slate-600'}`}>{tab} <span className="ml-1 text-xs">{counts[tab] || 0}</span></button>)}</div></div>

    {!filtered.length ? <div className="mt-5 rounded-2xl border border-dashed border-slate-200 p-10 text-center text-sm text-slate-400">No stock transfer requests found.</div> : <div className="mt-5 space-y-4">{paginated.map((request) => {
      const status = STATUS_CFG[request.status] || { label: request.status, badge: 'border-slate-200 bg-slate-50 text-slate-600' }
      const enough = hasEnoughStock(request)
      const appointmentActive = !request.appointment_id || ['confirmed','rescheduled','in-progress'].includes(String(request.appointment_status || ''))
      const isResolving = resolving === request.id
      return <article key={request.id} className="rounded-3xl border border-slate-200 p-5">
        <div className="flex flex-wrap items-start justify-between gap-3"><div><p className="text-xs font-bold uppercase tracking-wider text-slate-400">Request #{request.id}</p><h3 className="mt-1 text-lg font-black text-slate-900">{request.item_count} item{request.item_count === 1 ? '' : 's'} → {request.destination_location}</h3></div><span className={`rounded-full border px-3 py-1 text-xs font-bold ${status.badge}`}>{status.label}</span></div>
        <div className="mt-3 grid gap-2 text-sm sm:grid-cols-2 lg:grid-cols-4"><div className="rounded-xl bg-slate-50 px-3 py-2"><MdPerson className="mr-1 inline text-slate-400" /> {request.patient_name || 'Unlinked patient'}</div><div className="rounded-xl bg-slate-50 px-3 py-2">Appointment #{request.appointment_id || '—'} · {request.appointment_status || 'legacy'}{request.appointment_date ? ` · ${request.appointment_date} ${request.appointment_time || ''}` : ''}</div><div className="rounded-xl bg-slate-50 px-3 py-2"><MdPerson className="mr-1 inline text-slate-400" /> {request.doctor_name || 'Doctor'}{request.requested_service_name ? ` · ${request.requested_service_name}` : ''}</div><div className="rounded-xl bg-slate-50 px-3 py-2"><MdLocationOn className="mr-1 inline text-slate-400" /> {request.destination_location}</div></div>
        <div className="mt-3 overflow-hidden rounded-2xl border border-slate-200"><div className="grid grid-cols-[1fr_auto_auto] gap-3 bg-slate-50 px-4 py-2 text-[10px] font-bold uppercase tracking-wider text-slate-400"><span>Item</span><span>Requested</span><span>Main Stockroom</span></div>{(request.items || []).map((item) => <div key={item.id} className="grid grid-cols-[1fr_auto_auto] gap-3 border-t border-slate-100 px-4 py-3 text-sm"><span className="font-semibold text-slate-800">{item.item_name}</span><span className="font-bold text-slate-700">{item.qty_requested} {item.unit}</span><span className={Number(item.main_stockroom_stock) >= Number(item.qty_requested) ? 'text-emerald-700' : 'font-bold text-rose-600'}>{item.main_stockroom_stock} {item.unit}</span></div>)}</div>
        <div className="mt-3 rounded-xl bg-slate-50 px-4 py-3 text-sm text-slate-600"><strong>Reason:</strong> {request.reason || 'No reason provided.'}</div>
        {request.status === 'pending' ? <div className="mt-4 grid gap-2 sm:grid-cols-2"><button onClick={() => openDecision(request, 'approved')} disabled={isResolving || !enough || !appointmentActive} className="button-primary disabled:opacity-50"><MdCheck /> Approve & Transfer All Items</button><button onClick={() => openDecision(request, 'rejected')} disabled={isResolving} className="button-secondary !border-rose-200 !text-rose-600"><MdClose /> Reject Request</button>{!enough && <p className="sm:col-span-2 rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-xs text-rose-700">At least one item does not have enough usable Main Stockroom stock. Approval is blocked because grouped requests are all-or-nothing.</p>}{!appointmentActive && <p className="sm:col-span-2 rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-xs text-rose-700">This request is linked to an appointment that is no longer active. Reject the request instead of transferring stock.</p>}</div> : request.resolution_note ? <p className="mt-3 text-xs text-slate-500"><strong>Resolution note:</strong> {request.resolution_note}</p> : null}
      </article>
    })}</div>}

    {filtered.length > 0 && <div className="mt-5 flex items-center justify-between rounded-2xl bg-slate-50 px-4 py-3 text-sm text-slate-500"><span>Showing {((currentPage - 1) * itemsPerPage) + 1}-{Math.min(currentPage * itemsPerPage, filtered.length)} of {filtered.length} requests</span><div className="flex gap-2"><button className="button-secondary" disabled={currentPage === 1} onClick={() => setPage((value) => Math.max(1, value - 1))}>Previous</button><span className="px-2 py-2 text-xs font-bold">{currentPage}/{totalPages}</span><button className="button-secondary" disabled={currentPage === totalPages} onClick={() => setPage((value) => Math.min(totalPages, value + 1))}>Next</button></div></div>}

    <Modal open={Boolean(decision)} onClose={closeDecision} closeDisabled={Boolean(resolving)} title={decision?.status === 'approved' ? 'Approve & Transfer All Items' : 'Reject Stock Transfer?'} description={decision?.status === 'approved' ? 'Every line is processed in one database transaction. If one item fails, none are transferred.' : 'The grouped request will remain in history with your rejection reason.'} size="lg">
      {decision?.request && <div className="space-y-4"><div className="rounded-2xl border border-violet-200 bg-violet-50 p-4"><p className="text-xs font-bold uppercase tracking-wider text-violet-500">Appointment Context</p><p className="mt-1 font-bold text-violet-950">{decision.request.patient_name || 'Unlinked patient'} · Appointment #{decision.request.appointment_id || '—'}</p><p className="mt-1 text-xs text-violet-800">{decision.request.requested_service_name || 'Service not specified'} · {decision.request.appointment_status || 'legacy request'}{decision.request.consultation_id ? ` · Consultation #${decision.request.consultation_id}` : ''}</p></div><div className="rounded-2xl border border-slate-200 bg-slate-50 p-4"><div className="flex justify-between gap-4"><div><p className="text-xs font-bold uppercase tracking-wider text-slate-400">Destination</p><p className="mt-1 font-bold text-slate-900">{decision.request.destination_location}</p></div><div className="text-right"><p className="text-xs font-bold uppercase tracking-wider text-slate-400">Items</p><p className="mt-1 font-bold text-slate-900">{decision.request.item_count}</p></div></div><div className="mt-4 space-y-2">{(decision.request.items || []).map((item) => <div key={item.id} className="flex justify-between rounded-xl bg-white px-3 py-3 text-sm"><span className="font-semibold text-slate-800">{item.item_name}</span><span className={Number(item.main_stockroom_stock) >= Number(item.qty_requested) ? 'font-bold text-emerald-700' : 'font-bold text-rose-600'}>{item.qty_requested} {item.unit} requested · {item.main_stockroom_stock} available</span></div>)}</div>{decision.status === 'approved' && <p className="mt-3 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">FEFO chooses the earliest usable batches per item. Clinic-wide stock is unchanged because this is a location transfer, not consumption.</p>}</div><label className="block"><span className="form-label">{decision.status === 'rejected' ? 'Rejection Reason *' : 'Resolution Note (optional)'}</span><textarea rows={3} className="form-control mt-1.5" value={resolutionNote} onChange={(event) => setResolutionNote(event.target.value)} /></label><div className="flex justify-end gap-2"><button type="button" className="button-secondary" disabled={Boolean(resolving)} onClick={closeDecision}>Cancel</button><button type="button" className={decision.status === 'approved' ? 'button-primary' : 'button-danger'} disabled={Boolean(resolving) || (decision.status === 'rejected' && !resolutionNote.trim()) || (decision.status === 'approved' && !hasEnoughStock(decision.request))} onClick={handleResolve}>{resolving ? 'Working…' : decision.status === 'approved' ? 'Approve & Transfer All Items' : 'Reject Request'}</button></div></div>}
    </Modal>
  </section>
}

export default SupplyRequestReviewPanel

