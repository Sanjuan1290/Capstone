// client/src/pages/staffPage/Staff_WalkInQueue.jsx
// Real-time: polls every 15 seconds (shorter interval — queue changes fast).

import { useState, useCallback } from 'react'
import usePolling from '../../hooks/usePolling'
import { addToQueue, updateQueueStatus, getDoctors, getQueue } from '../../services/staff.service'
import {
  MdAdd, MdCheck, MdClose, MdFace, MdMedicalServices,
  MdAccessTime, MdQueuePlayNext, MdArrowForward, MdRefresh,
} from 'react-icons/md'

const POLL_MS = 15_000 // 15 seconds — queue changes faster than inventory

const STATUS_CONFIG = {
  'in-progress': { label:'In Progress', badge:'bg-sky-50    text-sky-700    border-sky-200',    bar:'bg-sky-500'     },
  'waiting':     { label:'Waiting',     badge:'bg-slate-100 text-slate-500  border-slate-200',  bar:'bg-amber-400'   },
  'done':        { label:'Done',        badge:'bg-emerald-50 text-emerald-700 border-emerald-200',bar:'bg-emerald-500'},
  'removed':     { label:'Removed',     badge:'bg-red-50    text-red-500    border-red-200',    bar:'bg-red-400'     },
}

// ─── Live Badge ───────────────────────────────────────────────────────────────
const LiveBadge = ({ lastUpdated }) => (
  <div className="flex items-center gap-1.5">
    <span className="relative flex h-2 w-2">
      <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" />
      <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500" />
    </span>
    <span className="text-[11px] text-slate-400 font-medium">
      Live · {lastUpdated ? new Date(lastUpdated).toLocaleTimeString('en-PH',{hour:'2-digit',minute:'2-digit',second:'2-digit'}) : '—'}
    </span>
  </div>
)

// ─── Add Walk-in Modal ────────────────────────────────────────────────────────
const AddWalkInModal = ({ onClose, onAdd, nextNo, doctorsList }) => {
  const [form, setForm] = useState({ patient:'', type:'medical', doctorId:'' })

  const filteredDoctors = doctorsList.filter(d => {
    if (d.type) return d.type === form.type
    return form.type === 'derma'
      ? (d.specialty||'').toLowerCase().includes('derm')
      : !(d.specialty||'').toLowerCase().includes('derm')
  })

  const handleSubmit = () => {
    if (!form.patient.trim() || !form.doctorId) return
    const doc = doctorsList.find(d => String(d.id) === String(form.doctorId))
    onAdd({ patient_name:form.patient, type:form.type, doctor_id:Number(form.doctorId), doctor:doc?.name||doc?.full_name||'', queueNo:nextNo })
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm px-4" onClick={onClose}>
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-sm overflow-hidden" onClick={e=>e.stopPropagation()}>
        <div className="flex items-center justify-between px-6 py-5 border-b border-slate-100">
          <div><p className="text-sm font-bold text-slate-800">Add Walk-in Patient</p><p className="text-xs text-slate-500 mt-0.5">Queue #{nextNo}</p></div>
          <button onClick={onClose} className="w-8 h-8 flex items-center justify-center rounded-xl hover:bg-slate-100 text-slate-400"><MdClose className="text-[18px]" /></button>
        </div>
        <div className="px-6 py-5 space-y-4">
          <div>
            <label className="text-xs font-bold text-slate-600 uppercase tracking-wide mb-1.5 block">Patient Name</label>
            <input type="text" value={form.patient} onChange={e=>setForm(f=>({...f,patient:e.target.value}))} placeholder="Full name" autoFocus
              className="w-full text-sm text-slate-700 placeholder-slate-300 bg-slate-50 border-2 border-slate-200 rounded-xl px-3 py-2.5 focus:outline-none focus:border-sky-400" />
          </div>
          <div>
            <label className="text-xs font-bold text-slate-600 uppercase tracking-wide mb-1.5 block">Clinic Type</label>
            <div className="grid grid-cols-2 gap-2">
              {[{v:'medical',l:'General Medicine'},{v:'derma',l:'Dermatology'}].map(({v,l})=>(
                <button key={v} onClick={()=>setForm(f=>({...f,type:v,doctorId:''}))}
                  className={`py-2.5 rounded-xl text-xs font-semibold border-2 transition-all ${form.type===v?'border-sky-400 bg-sky-50 text-sky-700':'border-slate-200 text-slate-600 hover:border-slate-300'}`}>{l}</button>
              ))}
            </div>
          </div>
          <div>
            <label className="text-xs font-bold text-slate-600 uppercase tracking-wide mb-1.5 block">
              Assign Doctor {filteredDoctors.length===0 && <span className="text-red-400 font-normal normal-case">(none available)</span>}
            </label>
            <select value={form.doctorId} onChange={e=>setForm(f=>({...f,doctorId:e.target.value}))}
              className="w-full text-sm text-slate-700 bg-slate-50 border-2 border-slate-200 rounded-xl px-3 py-2.5 focus:outline-none focus:border-sky-400">
              <option value="">Select doctor…</option>
              {filteredDoctors.map(d=><option key={d.id} value={d.id}>{d.name||d.full_name}</option>)}
            </select>
          </div>
        </div>
        <div className="px-6 pb-6 flex gap-3">
          <button onClick={onClose} className="flex-1 py-2.5 text-sm font-semibold text-slate-600 border border-slate-200 rounded-xl hover:bg-slate-50">Cancel</button>
          <button onClick={handleSubmit} disabled={!form.patient.trim()||!form.doctorId}
            className="flex-1 py-2.5 text-sm font-bold text-white bg-[#0b1a2c] hover:bg-[#122236] disabled:opacity-40 rounded-xl">
            Add to Queue
          </button>
        </div>
      </div>
    </div>
  )
}

// ─── Queue Card ────────────────────────────────────────────────────────────────
const QueueCard = ({ entry, onDone, onRemove, onNext }) => {
  const cfg    = STATUS_CONFIG[entry.status] || STATUS_CONFIG.waiting
  const Icon   = entry.type === 'derma' ? MdFace : MdMedicalServices
  const isActive = entry.status==='in-progress' || entry.status==='waiting'
  return (
    <div className={`bg-white rounded-2xl border border-slate-200 overflow-hidden transition-all duration-300 ${!isActive?'opacity-50 grayscale-[0.5]':'shadow-sm'}`}>
      <div className={`h-1 w-full ${cfg.bar}`} />
      <div className="p-4">
        <div className="flex items-start gap-3">
          <div className={`w-10 h-10 rounded-xl flex items-center justify-center font-black text-sm shrink-0 ${entry.status==='in-progress'?'bg-sky-500 text-white':'bg-slate-100 text-slate-500'}`}>
            {entry.queueNo||entry.queue_number}
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <p className="text-sm font-bold text-slate-800 truncate">{entry.patient||entry.patient_name}</p>
              <span className={`text-[10px] font-bold border px-2 py-0.5 rounded-full ${cfg.badge}`}>{cfg.label}</span>
            </div>
            <p className="text-xs text-slate-500 mt-0.5 truncate">{entry.doctor||entry.doctor_name}</p>
            <div className="flex items-center gap-3 mt-1.5 text-[11px] text-slate-400 font-medium">
              <span className="flex items-center gap-1"><Icon className={`text-[11px] ${entry.type==='derma'?'text-emerald-500':'text-slate-400'}`} />{entry.type==='derma'?'Dermatology':'General Medicine'}</span>
              {(entry.arrivedAt||entry.arrived_at) && <span className="flex items-center gap-1"><MdAccessTime className="text-[11px]" /> {entry.arrivedAt||entry.arrived_at}</span>}
            </div>
          </div>
        </div>
        {isActive && (
          <div className="flex gap-2 mt-3 pt-3 border-t border-slate-100">
            {entry.status==='waiting' && (
              <button onClick={()=>onNext(entry.id)} className="flex-1 flex items-center justify-center gap-1.5 py-2 text-xs font-bold text-sky-700 bg-sky-50 border border-sky-200 hover:bg-sky-100 rounded-xl transition-colors">
                <MdArrowForward className="text-[13px]" /> Call Next
              </button>
            )}
            <button onClick={()=>onDone(entry.id)} className="flex-1 flex items-center justify-center gap-1.5 py-2 text-xs font-bold text-emerald-700 bg-emerald-50 border border-emerald-200 hover:bg-emerald-100 rounded-xl transition-colors">
              <MdCheck className="text-[13px]" /> Done
            </button>
            <button onClick={()=>onRemove(entry.id)} className="w-8 h-8 flex items-center justify-center text-slate-400 border border-slate-200 hover:border-red-200 hover:text-red-500 hover:bg-red-50 rounded-xl transition-all shrink-0">
              <MdClose className="text-[14px]" />
            </button>
          </div>
        )}
      </div>
    </div>
  )
}

// ─── Main ─────────────────────────────────────────────────────────────────────
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
        setQueue(Array.isArray(q) ? q.map(e=>({...e, queueNo:e.queue_number||e.queueNo, patient:e.patient_name||e.patient, doctor:e.doctor_name||e.doctor})) : [])
        if (d.length > 0) setDoctors(d)
        setLastUpdated(new Date())
        setLoading(false)
      })
      .catch(err => console.error('Queue load error:', err))
  }, [today, doctors])

  // ── Real-time polling every 15 s ──────────────────────────────────────────
  usePolling(load, POLL_MS)

  const handleAdd = async (entry) => {
    try {
      const res = await addToQueue({ patient_name:entry.patient_name, type:entry.type, doctor_id:entry.doctor_id, queue_date:today })
      setQueue(prev => [...prev, { ...res, queueNo:res.queue_number||entry.queueNo, patient:entry.patient_name, doctor:entry.doctor, type:entry.type, status:'waiting' }])
      setShowAdd(false)
      setLastUpdated(new Date())
    } catch { alert('Error adding to queue.') }
  }

  const handleDone = async (id) => {
    try { await updateQueueStatus(id,'done'); setQueue(p=>p.map(e=>e.id===id?{...e,status:'done'}:e)); setLastUpdated(new Date()) }
    catch { alert('Error updating status.') }
  }

  const handleRemove = async (id) => {
    if (!confirm('Remove this patient from the queue?')) return
    try { await updateQueueStatus(id,'removed'); setQueue(p=>p.map(e=>e.id===id?{...e,status:'removed'}:e)); setLastUpdated(new Date()) }
    catch { alert('Error removing patient.') }
  }

  const handleNext = async (id) => {
    try {
      const cur = queue.find(e=>e.status==='in-progress')
      if (cur) await updateQueueStatus(cur.id,'done')
      await updateQueueStatus(id,'in-progress')
      setQueue(p=>p.map(e=>{if(e.status==='in-progress')return{...e,status:'done'};if(e.id===id)return{...e,status:'in-progress'};return e}))
      setLastUpdated(new Date())
    } catch { alert('Error calling next patient.') }
  }

  const active = queue.filter(q=>q.status==='in-progress'||q.status==='waiting')
  const done   = queue.filter(q=>q.status==='done'||q.status==='removed')
  const nextNo = queue.length>0 ? Math.max(...queue.map(q=>q.queueNo||q.queue_number||0))+1 : 1

  if (loading) return (
    <div className="h-96 flex items-center justify-center">
      <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-[#0b1a2c]"></div>
    </div>
  )

  return (
    <div className="max-w-4xl space-y-5">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-800">Walk-in Queue</h1>
          <p className="text-sm text-slate-500 mt-0.5">Manage walk-in patients and call them in order.</p>
          <div className="mt-1.5"><LiveBadge lastUpdated={lastUpdated} /></div>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <button onClick={load} title="Refresh" className="w-10 h-10 flex items-center justify-center rounded-xl border border-slate-200 text-slate-500 hover:bg-slate-50 transition-colors">
            <MdRefresh className="text-[18px]" />
          </button>
          <button onClick={()=>setShowAdd(true)} className="flex items-center gap-1.5 bg-[#0b1a2c] hover:bg-[#122236] text-white text-xs font-semibold px-4 py-2.5 rounded-xl transition-colors">
            <MdAdd className="text-[15px]" /> Add Walk-in
          </button>
        </div>
      </div>

      <div className="grid grid-cols-3 gap-4">
        {[
          {label:'In Queue',    value:active.length,                                      color:'text-slate-800', bg:'bg-white'     },
          {label:'In Progress', value:queue.filter(q=>q.status==='in-progress').length,   color:'text-sky-600',   bg:'bg-sky-50'    },
          {label:'Served Today',value:queue.filter(q=>q.status==='done').length,           color:'text-emerald-600',bg:'bg-emerald-50'},
        ].map(({label,value,color,bg})=>(
          <div key={label} className={`${bg} border border-slate-200 rounded-2xl px-5 py-4 text-center shadow-sm`}>
            <p className={`text-3xl font-black ${color}`}>{value}</p>
            <p className="text-xs text-slate-500 font-medium mt-0.5">{label}</p>
          </div>
        ))}
      </div>

      {active.length>0 ? (
        <div className="space-y-3">
          <p className="text-xs font-bold text-slate-500 uppercase tracking-widest">Active Queue</p>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {active.map(entry=><QueueCard key={entry.id} entry={entry} onDone={handleDone} onRemove={handleRemove} onNext={handleNext} />)}
          </div>
        </div>
      ) : (
        <div className="bg-white border border-slate-200 rounded-2xl py-14 flex flex-col items-center text-center shadow-sm">
          <div className="w-14 h-14 rounded-2xl bg-slate-100 flex items-center justify-center mb-3"><MdQueuePlayNext className="text-[26px] text-slate-300" /></div>
          <p className="text-sm font-semibold text-slate-500">Queue is empty</p>
          <p className="text-xs text-slate-400 mt-1">Add a walk-in patient to get started.</p>
        </div>
      )}

      {done.length>0 && (
        <div className="pt-4 border-t border-slate-100">
          <p className="text-xs font-bold text-slate-500 uppercase tracking-widest mb-3">Completed / Removed</p>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {done.map(entry=><QueueCard key={entry.id} entry={entry} onDone={handleDone} onRemove={handleRemove} onNext={handleNext} />)}
          </div>
        </div>
      )}

      {showAdd && <AddWalkInModal onClose={()=>setShowAdd(false)} onAdd={handleAdd} nextNo={nextNo} doctorsList={doctors} />}
    </div>
  )
}

export default Staff_WalkInQueue