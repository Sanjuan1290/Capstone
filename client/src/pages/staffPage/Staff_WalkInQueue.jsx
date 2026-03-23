import { useState } from "react"
import {
  MdAdd, MdCheck, MdClose, MdFace, MdMedicalServices,
  MdPerson, MdAccessTime, MdQueuePlayNext, MdArrowForward
} from "react-icons/md"

const initialQueue = [
  { queueNo: 1, patient: "Juan Ramos",    type: "medical", doctor: "Dr. Jose Reyes",   status: "in-progress", arrivedAt: "8:45 AM" },
  { queueNo: 2, patient: "Linda Torres",  type: "derma",   doctor: "Dr. Maria Santos", status: "waiting",     arrivedAt: "9:00 AM" },
  { queueNo: 3, patient: "Marco Salazar", type: "medical", doctor: "Dr. Jose Reyes",   status: "waiting",     arrivedAt: "9:10 AM" },
  { queueNo: 4, patient: "Nena Cruz",     type: "derma",   doctor: "Dr. Carlo Lim",    status: "waiting",     arrivedAt: "9:15 AM" },
]

const doctors = [
  { id: "d1", name: "Dr. Jose Reyes",   type: "medical" },
  { id: "d2", name: "Dr. Maria Santos", type: "derma"   },
  { id: "d3", name: "Dr. Carlo Lim",    type: "derma"   },
  { id: "d4", name: "Dr. Ana Villanueva", type: "medical" },
]

const STATUS_CONFIG = {
  "in-progress": { label: "In Progress", badge: "bg-sky-50    text-sky-700    border-sky-200",    bar: "bg-sky-500"     },
  "waiting":     { label: "Waiting",     badge: "bg-slate-100 text-slate-500  border-slate-200",  bar: "bg-amber-400"   },
  "done":        { label: "Done",        badge: "bg-emerald-50 text-emerald-700 border-emerald-200", bar: "bg-emerald-500" },
  "removed":     { label: "Removed",     badge: "bg-red-50    text-red-500    border-red-200",    bar: "bg-red-400"     },
}

// ── Add Walk-in Modal ─────────────────────────────────────────────────────────
const AddWalkInModal = ({ onClose, onAdd, nextNo }) => {
  const [form, setForm] = useState({ patient: "", type: "medical", doctor: "" })
  const set = k => e => setForm(f => ({ ...f, [k]: e.target.value }))

  const filteredDoctors = doctors.filter(d => d.type === form.type)

  const handleAdd = () => {
    if (!form.patient.trim() || !form.doctor) return
    onAdd({ ...form, queueNo: nextNo, status: "waiting", arrivedAt: new Date().toLocaleTimeString("en-PH", { hour: "2-digit", minute: "2-digit" }) })
    onClose()
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm px-4"
      onClick={onClose}>
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-sm overflow-hidden" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between px-6 py-5 border-b border-slate-100">
          <div>
            <p className="text-sm font-bold text-slate-800">Add Walk-in Patient</p>
            <p className="text-xs text-slate-500 mt-0.5">Queue #{nextNo}</p>
          </div>
          <button onClick={onClose} className="w-8 h-8 flex items-center justify-center rounded-xl hover:bg-slate-100 text-slate-400 transition-colors">
            <MdClose className="text-[18px]" />
          </button>
        </div>
        <div className="px-6 py-5 space-y-4">
          <div>
            <label className="text-xs font-bold text-slate-600 uppercase tracking-wide mb-1.5 block">Patient Name</label>
            <input type="text" value={form.patient} onChange={set("patient")}
              placeholder="Full name"
              className="w-full text-sm text-slate-700 placeholder-slate-300 bg-slate-50 border-2 border-slate-200
                rounded-xl px-3 py-2.5 focus:outline-none focus:border-sky-400 transition-colors" />
          </div>
          <div>
            <label className="text-xs font-bold text-slate-600 uppercase tracking-wide mb-1.5 block">Clinic Type</label>
            <div className="grid grid-cols-2 gap-2">
              {[{ v: "medical", l: "General Medicine" }, { v: "derma", l: "Dermatology" }].map(({ v, l }) => (
                <button key={v} onClick={() => { setForm(f => ({ ...f, type: v, doctor: "" })) }}
                  className={`py-2.5 rounded-xl text-xs font-semibold border-2 transition-all
                    ${form.type === v ? "border-sky-400 bg-sky-50 text-sky-700" : "border-slate-200 text-slate-600 hover:border-slate-300"}`}>
                  {l}
                </button>
              ))}
            </div>
          </div>
          <div>
            <label className="text-xs font-bold text-slate-600 uppercase tracking-wide mb-1.5 block">Assign Doctor</label>
            <select value={form.doctor} onChange={set("doctor")}
              className="w-full text-sm text-slate-700 bg-slate-50 border-2 border-slate-200 rounded-xl px-3 py-2.5
                focus:outline-none focus:border-sky-400 transition-colors">
              <option value="">Select doctor…</option>
              {filteredDoctors.map(d => <option key={d.id} value={d.name}>{d.name}</option>)}
            </select>
          </div>
        </div>
        <div className="px-6 pb-6 flex gap-3">
          <button onClick={onClose}
            className="flex-1 py-2.5 text-sm font-semibold text-slate-600 border border-slate-200 rounded-xl hover:bg-slate-50 transition-colors">
            Cancel
          </button>
          <button onClick={handleAdd} disabled={!form.patient.trim() || !form.doctor}
            className="flex-1 py-2.5 text-sm font-bold text-white bg-[#0b1a2c] hover:bg-[#122236]
              disabled:opacity-40 disabled:cursor-not-allowed rounded-xl transition-colors">
            Add to Queue
          </button>
        </div>
      </div>
    </div>
  )
}

// ── Queue Card ────────────────────────────────────────────────────────────────
const QueueCard = ({ entry, onDone, onRemove, onNext }) => {
  const cfg  = STATUS_CONFIG[entry.status]
  const Icon = entry.type === "derma" ? MdFace : MdMedicalServices
  const isActive = entry.status === "in-progress" || entry.status === "waiting"

  return (
    <div className={`bg-white rounded-2xl border border-slate-200 overflow-hidden transition-opacity duration-300
      ${entry.status === "done" || entry.status === "removed" ? "opacity-50" : ""}`}>
      {/* Status bar */}
      <div className={`h-1 w-full ${cfg.bar}`} />
      <div className="p-4">
        <div className="flex items-start gap-3">
          {/* Queue number */}
          <div className={`w-10 h-10 rounded-xl flex items-center justify-center font-black text-sm shrink-0
            ${entry.status === "in-progress" ? "bg-sky-500 text-white" : "bg-slate-100 text-slate-500"}`}>
            {entry.queueNo}
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <p className="text-sm font-bold text-slate-800">{entry.patient}</p>
              <span className={`text-[10px] font-bold border px-2 py-0.5 rounded-full ${cfg.badge}`}>
                {cfg.label}
              </span>
            </div>
            <p className="text-xs text-slate-500 mt-0.5">{entry.doctor}</p>
            <div className="flex items-center gap-3 mt-1.5 text-[11px] text-slate-400 font-medium">
              <span className="flex items-center gap-1">
                <Icon className={`text-[11px] ${entry.type === "derma" ? "text-emerald-500" : "text-slate-400"}`} />
                {entry.type === "derma" ? "Dermatology" : "General Medicine"}
              </span>
              <span className="flex items-center gap-1">
                <MdAccessTime className="text-[11px]" /> Arrived {entry.arrivedAt}
              </span>
            </div>
          </div>
        </div>

        {isActive && (
          <div className="flex gap-2 mt-3 pt-3 border-t border-slate-100">
            {entry.status === "waiting" && (
              <button onClick={() => onNext(entry.queueNo)}
                className="flex-1 flex items-center justify-center gap-1.5 py-2 text-xs font-bold
                  text-sky-700 bg-sky-50 border border-sky-200 hover:bg-sky-100 rounded-xl transition-colors">
                <MdArrowForward className="text-[13px]" /> Call Next
              </button>
            )}
            <button onClick={() => onDone(entry.queueNo)}
              className="flex-1 flex items-center justify-center gap-1.5 py-2 text-xs font-bold
                text-emerald-700 bg-emerald-50 border border-emerald-200 hover:bg-emerald-100 rounded-xl transition-colors">
              <MdCheck className="text-[13px]" /> Done
            </button>
            <button onClick={() => onRemove(entry.queueNo)}
              className="w-8 h-8 flex items-center justify-center text-slate-400 border border-slate-200
                hover:border-red-200 hover:text-red-500 hover:bg-red-50 rounded-xl transition-all shrink-0">
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
  const [queue,    setQueue]    = useState(initialQueue)
  const [showAdd,  setShowAdd]  = useState(false)

  const active  = queue.filter(q => q.status === "in-progress" || q.status === "waiting")
  const done    = queue.filter(q => q.status === "done" || q.status === "removed")
  const nextNo  = Math.max(...queue.map(q => q.queueNo), 0) + 1

  const handleAdd    = entry => setQueue(q => [...q, entry])
  const handleDone   = no    => setQueue(q => q.map(e => e.queueNo === no ? { ...e, status: "done"    } : e))
  const handleRemove = no    => setQueue(q => q.map(e => e.queueNo === no ? { ...e, status: "removed" } : e))
  const handleNext   = no    => {
    // Mark current in-progress as done, set this one as in-progress
    setQueue(q => q.map(e => {
      if (e.status === "in-progress") return { ...e, status: "done" }
      if (e.queueNo === no)           return { ...e, status: "in-progress" }
      return e
    }))
  }

  return (
    <div className="max-w-4xl space-y-5">
      {/* Header */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-800">Walk-in Queue</h1>
          <p className="text-sm text-slate-500 mt-0.5">Manage walk-in patients and call them in order.</p>
        </div>
        <button onClick={() => setShowAdd(true)}
          className="flex items-center gap-1.5 bg-[#0b1a2c] hover:bg-[#122236] text-white
            text-xs font-semibold px-4 py-2.5 rounded-xl transition-colors shrink-0">
          <MdAdd className="text-[15px]" /> Add Walk-in
        </button>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-3 gap-4">
        {[
          { label: "In Queue",    value: active.length,                                         color: "text-slate-800",   bg: "bg-white"        },
          { label: "In Progress", value: queue.filter(q => q.status === "in-progress").length,  color: "text-sky-600",     bg: "bg-sky-50"       },
          { label: "Served Today",value: queue.filter(q => q.status === "done").length,          color: "text-emerald-600", bg: "bg-emerald-50"   },
        ].map(({ label, value, color, bg }) => (
          <div key={label} className={`${bg} border border-slate-200 rounded-2xl px-5 py-4 text-center`}>
            <p className={`text-3xl font-black ${color}`}>{value}</p>
            <p className="text-xs text-slate-500 font-medium mt-0.5">{label}</p>
          </div>
        ))}
      </div>

      {/* Active queue */}
      {active.length > 0 ? (
        <div>
          <p className="text-xs font-bold text-slate-500 uppercase tracking-widest mb-3">Active Queue</p>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {active.map(entry => (
              <QueueCard key={entry.queueNo} entry={entry}
                onDone={handleDone} onRemove={handleRemove} onNext={handleNext} />
            ))}
          </div>
        </div>
      ) : (
        <div className="bg-white border border-slate-200 rounded-2xl py-14 flex flex-col items-center text-center">
          <div className="w-14 h-14 rounded-2xl bg-slate-100 flex items-center justify-center mb-3">
            <MdQueuePlayNext className="text-[26px] text-slate-300" />
          </div>
          <p className="text-sm font-semibold text-slate-500">Queue is empty</p>
          <p className="text-xs text-slate-400 mt-1">Add a walk-in patient to get started.</p>
          <button onClick={() => setShowAdd(true)}
            className="mt-4 flex items-center gap-1.5 bg-[#0b1a2c] text-white text-xs font-semibold
              px-4 py-2.5 rounded-xl hover:bg-[#122236] transition-colors">
            <MdAdd className="text-[14px]" /> Add Walk-in
          </button>
        </div>
      )}

      {/* Done / removed */}
      {done.length > 0 && (
        <div>
          <p className="text-xs font-bold text-slate-500 uppercase tracking-widest mb-3">Completed / Removed</p>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {done.map(entry => (
              <QueueCard key={entry.queueNo} entry={entry}
                onDone={handleDone} onRemove={handleRemove} onNext={handleNext} />
            ))}
          </div>
        </div>
      )}

      {/* Modal */}
      {showAdd && <AddWalkInModal onClose={() => setShowAdd(false)} onAdd={handleAdd} nextNo={nextNo} />}
    </div>
  )
}

export default Staff_WalkInQueue