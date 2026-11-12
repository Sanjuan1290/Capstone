import { useCallback, useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import useClinicRefresh from '../../hooks/useClinicRefresh'
import Pagination from '../../components/ui/Pagination'
import useClientPagination from '../../hooks/useClientPagination'
import { MdAdd, MdCheck, MdMedicalServices, MdPrint, MdQueuePlayNext, MdRefresh } from 'react-icons/md'
import { portalBaseForPath } from '../../utils/branchPortalPath.mjs'
import { printWalkInIntakeForm } from '../../utils/printWalkInIntakeForm'
import { getClinicToday } from '../../utils/patientBirthdate.mjs'
import { formatQueueLabel } from '../../utils/queueLabel.mjs'

const QueueCard = ({ entry, onCall, onReturn, onRemove, busy }) => {
  const active = ['called', 'in_consultation'].includes(entry.status)
  return <div className="rounded-3xl border border-slate-200 bg-white p-4 shadow-sm">
    <div className="mb-3 flex items-start justify-between gap-3"><div><p className="text-base font-bold text-slate-900">{entry.patient_name || entry.patient}</p><p className="text-sm text-slate-500">{entry.doctor_name || entry.doctor}</p></div><span className={`rounded-full px-3 py-1 text-xs font-bold capitalize ${active ? 'bg-sky-50 text-sky-700' : entry.status === 'done' ? 'bg-emerald-50 text-emerald-700' : entry.status === 'removed' ? 'bg-red-50 text-red-600' : 'bg-amber-50 text-amber-700'}`}>{String(entry.status || '').replace('_', ' ')}</span></div>
    <div className="mb-4 text-sm text-slate-600">Queue {formatQueueLabel(entry)} • {entry.type === 'derma' ? 'Dermatology' : 'General Medicine'}</div>
    {(entry.status === 'waiting' || entry.status === 'called') && <div className="flex gap-2">{entry.status === 'waiting' && <button disabled={busy} onClick={() => onCall(entry)} className="flex-1 rounded-2xl bg-sky-600 px-4 py-3 text-sm font-semibold text-white">Call Patient</button>}{entry.status === 'called' && <button disabled={busy} onClick={() => onReturn(entry)} className="flex-1 rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm font-semibold text-slate-700">Return to Waiting</button>}<button disabled={busy} onClick={() => onRemove(entry)} className="rounded-2xl border border-red-200 px-4 py-3 text-sm font-semibold text-red-600">Remove</button></div>}
    {entry.status === 'called' && <p className="mt-3 rounded-xl bg-sky-50 px-3 py-2 text-xs font-semibold text-sky-700">Patient called{entry.called_at ? ` · ${new Date(entry.called_at).toLocaleTimeString('en-PH', { hour: 'numeric', minute: '2-digit' })}` : ''}. Waiting for the doctor to start consultation.</p>}
    {entry.status === 'in_consultation' && <p className="mt-3 rounded-xl bg-violet-50 px-3 py-2 text-xs font-semibold text-violet-700">In consultation. This entry will complete automatically when the doctor finalizes the visit.</p>}
  </div>
}

const WalkInQueuePage = ({ services }) => {
  const base = portalBaseForPath(window.location.pathname)
  const { getQueue, updateQueueStatus } = services
  const navigate = useNavigate()
  const [queue, setQueue] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [actionId, setActionId] = useState(null)
  const [today, setToday] = useState(getClinicToday)
  const request = useRef(0), actionLock = useRef(false)
  const loadData = useCallback(async () => {
    const version = ++request.current
    try { const rows = await getQueue(today); if (version === request.current) { setQueue(Array.isArray(rows) ? rows : []); setError('') } }
    catch (err) { if (version === request.current) setError(err.message || 'Unable to load the walk-in queue. Refresh to retry.') }
    finally { if (version === request.current) setLoading(false) }
  }, [today, getQueue])
  const invalidateRequest = useCallback(() => { request.current++ }, [])
  useEffect(() => { void loadData(); return invalidateRequest }, [loadData, invalidateRequest])
  useEffect(() => { const timer = setInterval(() => setToday(getClinicToday()), 15000); return () => clearInterval(timer) }, [])
  useClinicRefresh(loadData, ['queue.updated', 'appointment.updated'], { fallbackMs: 30000, skip: () => actionLock.current })
  const change = async (entry, status) => {
    if (actionLock.current) return
    actionLock.current = true; setActionId(entry.id); setError('')
    try { await updateQueueStatus(entry.id, status); await loadData() }
    catch (err) { setError(err.message || 'Queue action failed. Refresh before retrying.') }
    finally { actionLock.current = false; setActionId(null) }
  }
  const call = entry => change(entry, 'called')
  const returnToWaiting = entry => change(entry, 'waiting')
  const remove = entry => { if (window.confirm('Remove this patient from the queue?')) void change(entry, 'removed') }
  const active = queue.filter((item) => ['waiting', 'called', 'in_consultation'].includes(item.status))
  const completed = queue.filter((item) => ['done', 'removed'].includes(item.status))
  const activePg = useClientPagination(active, { initialPageSize: 6 })
  const donePg = useClientPagination(completed, { initialPageSize: 6 })

  return <div className="mx-auto w-full max-w-7xl space-y-5"><div className="flex flex-wrap items-start justify-between gap-4"><div><h1 className="flex items-center gap-2 text-2xl font-bold text-slate-900"><MdQueuePlayNext className="text-sky-500" /> Walk-in Queue</h1><p className="mt-1 text-sm text-slate-500">Select a patient, service and accepting doctor to check in a walk-in. Manage today's queue below.</p></div><div className="flex flex-wrap gap-2"><button onClick={() => printWalkInIntakeForm()} className="button-secondary"><MdPrint /> Print Intake Form</button><></><button onClick={() => navigate(`${base}/appointments/new?visit_type=walk_in&return_to=queue`)} className="button-primary"><MdAdd /> Add Walk-in Visit</button></div></div>
    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">{[['Waiting', active.filter((i) => i.status === 'waiting').length, 'bg-amber-50 text-amber-700'], ['Called', active.filter((i) => i.status === 'called').length, 'bg-sky-50 text-sky-700'], ['In Consultation', active.filter((i) => i.status === 'in_consultation').length, 'bg-violet-50 text-violet-700'], ['Completed', completed.filter((i) => i.status === 'done').length, 'bg-emerald-50 text-emerald-700']].map(([label, value, tone]) => <div key={label} className={`rounded-3xl border border-slate-200 p-5 ${tone}`}><p className="text-3xl font-black">{value}</p><p className="mt-1 text-sm font-semibold">{label}</p></div>)}</div>
    {error && <p role="alert" className="rounded-xl border border-red-300 bg-red-50 p-4 text-sm text-red-800">{error} <button type="button" className="ml-2 font-bold underline" onClick={loadData}>Try again</button></p>}
    {loading ? <div className="flex h-64 items-center justify-center rounded-3xl border bg-white"><div className="h-8 w-8 animate-spin rounded-full border-4 border-slate-200 border-t-sky-500" /></div> : <><section className="space-y-3"><div className="flex items-center gap-2 text-xs font-bold uppercase tracking-widest text-slate-400"><MdMedicalServices /> Active Queue</div><div className="grid gap-4 lg:grid-cols-2">{active.length ? activePg.pageItems.map((entry) => <QueueCard busy={Boolean(actionId)} key={entry.id} entry={entry} onCall={call} onReturn={returnToWaiting} onRemove={remove} />) : <div className="rounded-3xl border bg-white p-8 text-center text-sm text-slate-400">No active walk-ins yet.</div>}</div>{active.length > 0 && <Pagination {...activePg} total={active.length} pageSizeOptions={[6, 12, 24]} />}</section><section className="space-y-3"><div className="flex items-center gap-2 text-xs font-bold uppercase tracking-widest text-slate-400"><MdCheck /> Completed / Removed</div><div className="grid gap-4 lg:grid-cols-2">{completed.length ? donePg.pageItems.map((entry) => <div key={entry.id} className="rounded-3xl border bg-white p-4 shadow-sm"><div className="flex justify-between gap-3"><div><p className="font-bold text-slate-900">{entry.patient_name}</p><p className="text-sm text-slate-500">{entry.doctor_name}</p></div><span className="text-xs font-bold capitalize text-slate-500">{entry.status}</span></div><p className="mt-2 text-sm text-slate-500">Queue {formatQueueLabel(entry)} • {entry.type}</p></div>) : <div className="rounded-3xl border bg-white p-8 text-center text-sm text-slate-400">No completed entries yet.</div>}</div>{completed.length > 0 && <Pagination {...donePg} total={completed.length} pageSizeOptions={[6, 12, 24]} />}</section></>}
  </div>
}


export default WalkInQueuePage
