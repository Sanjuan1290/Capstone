// client/src/pages/staffPage/Staff_WalkInQueue.jsx
// REDESIGNED: Live polling, card layout, mobile bottom-sheet add modal, status color bars

import { useState, useCallback } from 'react'
import usePolling from '../../hooks/usePolling'
import { addToQueue, updateQueueStatus, getDoctors, getQueue } from '../../services/staff.service'
import {
  MdAdd, MdCheck, MdClose, MdFace, MdMedicalServices,
  MdAccessTime, MdQueuePlayNext, MdRefresh, MdSkipNext,
  MdPerson, MdArrowForward,
} from 'react-icons/md'

const POLL_MS = 15_000

const STATUS = {
  'in-progress': { label: 'In Progress', badge: 'bg-sky-50     text-sky-700    border-sky-200',    bar: 'bg-sky-500'     },
  waiting:       { label: 'Waiting',     badge: 'bg-amber-50  text-amber-700  border-amber-200',   bar: 'bg-amber-400'   },
  done:          { label: 'Served',      badge: 'bg-emerald-50 text-emerald-700 border-emerald-200',bar: 'bg-emerald-500' },
  removed:       { label: 'Removed',     badge: 'bg-red-50    text-red-500    border-red-200',     bar: 'bg-red-400'     },
}

// ── Live dot ──────────────────────────────────────────────────────────────────
const LiveDot = ({ lastUpdated }) => (
  <div className="flex items-center gap-1.5">
    <span className="relative flex h-2 w-2">
      <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" />
      <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500" />
    </span>
    <span className="text-[11px] text-slate-400 font-medium">
      Live · {lastUpdated ? new Date(lastUpdated).toLocaleTimeString('en-PH', { hour: '2-digit', minute: '2-digit', second: '2-digit' }) : '—'}
    </span>
  </div>
)

// ── Add Walk-in Modal ─────────────────────────────────────────────────────────
const AddWalkInModal = ({ onClose, onAdd, nextNo, doctorsList }) => {
  const [form, setForm] = useState({ patient: '', type: 'medical', doctorId: '' })

  const filteredDoctors = doctorsList.filter(d => {
    if (d.type) return d.type === form.type
    return form.type === 'derma'
      ? (d.specialty || '').toLowerCase().includes('derm')
      : !(d.specialty || '').toLowerCase().includes('derm')
  })

  const handleSubmit = () => {
    if (!form.patient.trim() || !form.doctorId) return
    const doc = doctorsList.find(d => String(d.id) === String(form.doctorId))
    onAdd({
      patient_name: form.patient,
      type: form.type,
      doctor_id: Number(form.doctorId),
      doctor: doc?.name || doc?.full_name || '',
      queueNo: nextNo,
    })
  }

  return (
    <>
      <div className="fixed inset-0 z-40 bg-black/50 backdrop-blur-sm" onClick={onClose} />

      <div className="fixed bottom-0 left-0 right-0 z-50 bg-white rounded-t-3xl shadow-2xl
        flex flex-col max-h-[85vh] overflow-hidden
        sm:static sm:fixed sm:inset-auto sm:top-1/2 sm:left-1/2 sm:-translate-x-1/2 sm:-translate-y-1/2
        sm:w-full sm:max-w-sm sm:rounded-3xl sm:shadow-2xl">

        {/* Handle */}
        <div className="sm:hidden flex justify-center pt-3 pb-1">
          <div className="w-10 h-1 bg-slate-200 rounded-full" />
        </div>

        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100 shrink-0">
          <div>
            <p className="text-sm font-bold text-slate-800">Add Walk-in Patient</p>
            <p className="text-xs text-slate-400 mt-0.5">Queue #{nextNo}</p>
          </div>
          <button onClick={onClose}
            className="w-8 h-8 flex items-center justify-center rounded-xl hover:bg-slate-100 text-slate-400">
            <MdClose />
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto px-6 py-5 space-y-4">
          {/* Name */}
          <div>
            <label className="text-[11px] font-bold text-slate-500 uppercase tracking-widest mb-1.5 block">
              Patient Name <span className="text-red-400">*</span>
            </label>
            <div className="relative">
              <MdPerson className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400 text-[17px]" />
              <input type="text" value={form.patient}
                onChange={e => setForm(f => ({ ...f, patient: e.target.value }))}
                placeholder="Full name or walk-in" autoFocus
                className="w-full pl-10 pr-4 py-3 bg-slate-50 border-2 border-slate-200 rounded-xl text-sm
                  focus:outline-none focus:border-sky-400 focus:bg-white transition-all placeholder-slate-300" />
            </div>
          </div>

          {/* Clinic type */}
          <div>
            <label className="text-[11px] font-bold text-slate-500 uppercase tracking-widest mb-1.5 block">
              Clinic Type <span className="text-red-400">*</span>
            </label>
            <div className="grid grid-cols-2 gap-2">
              {[{ v: 'medical', l: 'General Medicine', Icon: MdMedicalServices }, { v: 'derma', l: 'Dermatology', Icon: MdFace }].map(({ v, l, Icon }) => (
                <button key={v} onClick={() => setForm(f => ({ ...f, type: v, doctorId: '' }))}
                  className={`flex items-center gap-2 p-3 rounded-2xl border-2 text-left transition-all
                    ${form.type === v ? 'border-sky-400 bg-sky-50' : 'border-slate-200 bg-white hover:border-slate-300'}`}>
                  <Icon className={`text-[18px] shrink-0 ${form.type === v ? 'text-sky-600' : 'text-slate-400'}`} />
                  <span className={`text-xs font-bold ${form.type === v ? 'text-sky-700' : 'text-slate-600'}`}>{l}</span>
                </button>
              ))}
            </div>
          </div>

          {/* Doctor */}
          <div>
            <label className="text-[11px] font-bold text-slate-500 uppercase tracking-widest mb-1.5 block">
              Assign Doctor <span className="text-red-400">*</span>
              {filteredDoctors.length === 0 && <span className="text-red-400 font-normal normal-case ml-1">(none available)</span>}
            </label>
            <select value={form.doctorId}
              onChange={e => setForm(f => ({ ...f, doctorId: e.target.value }))}
              className="w-full text-sm bg-slate-50 border-2 border-slate-200 rounded-xl px-3 py-3
                focus:outline-none focus:border-sky-400 appearance-none transition-all">
              <option value="">Select doctor…</option>
              {filteredDoctors.map(d => (
                <option key={d.id} value={d.id}>{d.name || d.full_name}</option>
              ))}
            </select>
          </div>
        </div>

        {/* Footer */}
        <div className="px-6 pb-6 pt-3 flex gap-3 shrink-0 border-t border-slate-100">
          <button onClick={onClose}
            className="flex-1 py-3 text-sm font-semibold text-slate-600 border border-slate-200 rounded-2xl hover:bg-slate-50 transition-colors">
            Cancel
          </button>
          <button onClick={handleSubmit}
            disabled={!form.patient.trim() || !form.doctorId}
            className="flex-1 py-3 text-sm font-bold text-white bg-sky-500 hover:bg-sky-600
              disabled:opacity-40 rounded-2xl transition-colors shadow-lg shadow-sky-500/20">
            Add to Queue
          </button>
        </div>
      </div>
    </>
  )
}

// ── Queue Card ────────────────────────────────────────────────────────────────
const QueueCard = ({ entry, onDone, onRemove, onNext }) => {
  const cfg    = STATUS[entry.status] || STATUS.waiting
  const Icon   = entry.type === 'derma' ? MdFace : MdMedicalServices
  const isActive = entry.status === 'in-progress' || entry.status === 'waiting'

  return (
    <div className={`bg-white rounded-2xl border overflow-hidden transition-all duration-300
      ${!isActive ? 'opacity-50 border-slate-100' : 'border-slate-200 shadow-sm'}`}>

      {/* Color bar */}
      <div className={`h-1.5 w-full ${cfg.bar}`} />

      <div className="p-4">
        {/* Top row */}
        <div className="flex items-start gap-3">
          <div className={`w-11 h-11 rounded-2xl flex items-center justify-center font-black text-base shrink-0
            ${entry.status === 'in-progress'
              ? 'bg-sky-500 text-white shadow-md shadow-sky-500/30'
              : entry.status === 'done' ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-100 text-slate-600'}`}>
            {entry.queueNo || entry.queue_number}
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <p className="text-sm font-bold text-slate-800 truncate">{entry.patient || entry.patient_name}</p>
              <span className={`text-[10px] font-bold border px-2 py-0.5 rounded-full ${cfg.badge}`}>
                {cfg.label}
              </span>
            </div>
            <p className="text-xs text-slate-500 mt-0.5 truncate">{entry.doctor || entry.doctor_name}</p>
            <div className="flex items-center gap-3 mt-1.5 text-[11px] text-slate-400 font-medium flex-wrap">
              <span className="flex items-center gap-1">
                <Icon className={`text-[11px] ${entry.type === 'derma' ? 'text-emerald-500' : 'text-slate-400'}`} />
                {entry.type === 'derma' ? 'Dermatology' : 'General Medicine'}
              </span>
              {(entry.arrivedAt || entry.arrived_at) && (
                <span className="flex items-center gap-1">
                  <MdAccessTime className="text-[11px]" />
                  {entry.arrivedAt || entry.arrived_at}
                </span>
              )}
            </div>
          </div>
        </div>

        {/* Actions */}
        {isActive && (
          <div className="flex gap-2 mt-3 pt-3 border-t border-slate-100">
            {entry.status === 'waiting' && (
              <button onClick={() => onNext(entry.id)}
                className="flex-1 flex items-center justify-center gap-1.5 py-2.5 text-xs font-bold
                  text-sky-700 bg-sky-50 border border-sky-200 hover:bg-sky-100 rounded-xl transition-colors">
                <MdSkipNext className="text-[15px]" /> Call
              </button>
            )}
            {entry.status === 'in-progress' && (
              <button onClick={() => onDone(entry.id)}
                className="flex-1 flex items-center justify-center gap-1.5 py-2.5 text-xs font-bold
                  text-emerald-700 bg-emerald-50 border border-emerald-200 hover:bg-emerald-100 rounded-xl transition-colors">
                <MdCheck className="text-[14px]" /> Done
              </button>
            )}
            <button onClick={() => onRemove(entry.id)}
              className="flex items-center justify-center w-10 h-9 text-xs font-bold
                text-red-500 bg-red-50 border border-red-200 hover:bg-red-100 rounded-xl transition-colors shrink-0">
              <MdClose className="text-[14px]" />
            </button>
          </div>
        )}
      </div>
    </div>
  )
}

// ── Main ──────────────────────────────────────────────────────────────────────
const Staff_WalkInQueue = () => {
  const [queue,       setQueue]       = useState([])
  const [doctors,     setDoctors]     = useState([])
  const [loading,     setLoading]     = useState(true)
  const [showAdd,     setShowAdd]     = useState(false)
  const [lastUpdated, setLastUpdated] = useState(null)
  const today = new Date().toISOString().split('T')[0]

  const load = useCallback(() => {
    Promise.all([getQueue(today), doctors.length === 0 ? getDoctors() : Promise.resolve(doctors)])
      .then(([q, d]) => {
        setQueue(Array.isArray(q)
          ? q.map(e => ({ ...e, queueNo: e.queue_number || e.queueNo, patient: e.patient_name || e.patient, doctor: e.doctor_name || e.doctor }))
          : [])
        if (d.length > 0) setDoctors(d)
        setLastUpdated(new Date())
        setLoading(false)
      })
      .catch(err => console.error('Queue load error:', err))
  }, [today, doctors])

  usePolling(load, POLL_MS)

  const handleAdd = async (entry) => {
    try {
      const res = await addToQueue({ patient_name: entry.patient_name || entry.patient, type: entry.type, doctor_id: entry.doctor_id, queue_date: today })
      setQueue(prev => [...prev, { ...res, queueNo: res.queue_number || entry.queueNo, patient: entry.patient_name || entry.patient, doctor: entry.doctor, type: entry.type, status: 'waiting' }])
      setShowAdd(false)
      setLastUpdated(new Date())
    } catch { alert('Error adding to queue.') }
  }

  const handleDone = async (id) => {
    try { await updateQueueStatus(id, 'done'); setQueue(p => p.map(e => e.id === id ? { ...e, status: 'done' } : e)); setLastUpdated(new Date()) }
    catch { alert('Error updating status.') }
  }

  const handleRemove = async (id) => {
    if (!confirm('Remove this patient from the queue?')) return
    try { await updateQueueStatus(id, 'removed'); setQueue(p => p.map(e => e.id === id ? { ...e, status: 'removed' } : e)); setLastUpdated(new Date()) }
    catch { alert('Error removing patient.') }
  }

  const handleNext = async (id) => {
    try {
      const cur = queue.find(e => e.status === 'in-progress')
      if (cur) await updateQueueStatus(cur.id, 'done')
      await updateQueueStatus(id, 'in-progress')
      setQueue(p => p.map(e => {
        if (e.status === 'in-progress') return { ...e, status: 'done' }
        if (e.id === id) return { ...e, status: 'in-progress' }
        return e
      }))
      setLastUpdated(new Date())
    } catch { alert('Error calling next patient.') }
  }

  const active = queue.filter(q => q.status === 'in-progress' || q.status === 'waiting')
  const done   = queue.filter(q => q.status === 'done' || q.status === 'removed')
  const nextNo = queue.length > 0 ? Math.max(...queue.map(q => q.queueNo || q.queue_number || 0)) + 1 : 1

  const inProgress = queue.filter(q => q.status === 'in-progress').length
  const served     = queue.filter(q => q.status === 'done').length

  if (loading) return (
    <div className="flex items-center justify-center h-64">
      <div className="w-8 h-8 border-4 border-slate-200 border-t-sky-500 rounded-full animate-spin" />
    </div>
  )

  return (
    <div className="max-w-4xl space-y-5">

      {/* Header */}
      <div className="flex items-start justify-between gap-3">
        <div>
          <h1 className="text-xl lg:text-2xl font-bold text-slate-800 flex items-center gap-2">
            <MdQueuePlayNext className="text-sky-500 text-[22px]" /> Walk-in Queue
          </h1>
          <p className="text-xs lg:text-sm text-slate-500 mt-0.5">Manage walk-in patients in real-time.</p>
          <div className="mt-1.5"><LiveDot lastUpdated={lastUpdated} /></div>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <button onClick={load}
            className="w-9 h-9 flex items-center justify-center rounded-xl border border-slate-200 text-slate-500 hover:bg-slate-50 transition-colors">
            <MdRefresh className="text-[18px]" />
          </button>
          <button onClick={() => setShowAdd(true)}
            className="flex items-center gap-1.5 bg-sky-500 hover:bg-sky-600 text-white text-xs font-bold
              px-4 py-2.5 rounded-xl transition-colors shadow-lg shadow-sky-500/20">
            <MdAdd className="text-[15px]" /> Add Walk-in
          </button>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-3 gap-3">
        {[
          { label: 'In Queue',     value: active.length, color: 'text-slate-800',   bg: 'bg-white'        },
          { label: 'In Progress',  value: inProgress,    color: 'text-sky-600',     bg: 'bg-sky-50'       },
          { label: 'Served Today', value: served,        color: 'text-emerald-600', bg: 'bg-emerald-50'   },
        ].map(({ label, value, color, bg }) => (
          <div key={label} className={`${bg} border border-slate-200 rounded-2xl px-4 py-4 text-center shadow-sm`}>
            <p className={`text-3xl font-black ${color}`}>{value}</p>
            <p className="text-xs text-slate-500 font-medium mt-0.5">{label}</p>
          </div>
        ))}
      </div>

      {/* Active queue */}
      {active.length > 0 ? (
        <div className="space-y-3">
          <p className="text-xs font-bold text-slate-500 uppercase tracking-widest">Active Queue ({active.length})</p>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {active.map(entry => (
              <QueueCard key={entry.id} entry={entry} onDone={handleDone} onRemove={handleRemove} onNext={handleNext} />
            ))}
          </div>
        </div>
      ) : (
        <div className="bg-white border border-slate-200 rounded-2xl py-16 flex flex-col items-center text-center shadow-sm">
          <div className="w-16 h-16 rounded-2xl bg-slate-50 flex items-center justify-center mb-4">
            <MdQueuePlayNext className="text-[28px] text-slate-300" />
          </div>
          <p className="text-sm font-bold text-slate-500">Queue is empty</p>
          <p className="text-xs text-slate-400 mt-1">Add a walk-in patient to get started.</p>
          <button onClick={() => setShowAdd(true)}
            className="mt-4 flex items-center gap-1.5 bg-sky-500 text-white text-xs font-bold px-5 py-2.5 rounded-xl">
            <MdAdd className="text-[14px]" /> Add Walk-in
          </button>
        </div>
      )}

      {/* Completed */}
      {done.length > 0 && (
        <div className="pt-2">
          <p className="text-xs font-bold text-slate-400 uppercase tracking-widest mb-3">Completed / Removed ({done.length})</p>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {done.map(entry => (
              <QueueCard key={entry.id} entry={entry} onDone={handleDone} onRemove={handleRemove} onNext={handleNext} />
            ))}
          </div>
        </div>
      )}

      {showAdd && (
        <AddWalkInModal
          onClose={() => setShowAdd(false)}
          onAdd={handleAdd}
          nextNo={nextNo}
          doctorsList={doctors}
        />
      )}
    </div>
  )
}

export default Staff_WalkInQueue