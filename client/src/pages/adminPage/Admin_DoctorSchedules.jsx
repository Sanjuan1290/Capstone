import { useState } from "react"
import {
  MdFace, MdMedicalServices, MdEdit, MdCheck, MdClose,
  MdAdd, MdCalendarToday, MdAccessTime, MdChevronLeft, MdChevronRight
} from "react-icons/md"

const doctors = [
  { id: "DOC-001", name: "Dr. Maria Santos",   specialty: "Dermatologist",        type: "derma"   },
  { id: "DOC-002", name: "Dr. Jose Reyes",      specialty: "General Practitioner", type: "medical" },
  { id: "DOC-003", name: "Dr. Carlo Lim",       specialty: "Cosmetic Dermatology", type: "derma"   },
  { id: "DOC-004", name: "Dr. Ana Villanueva",  specialty: "Internal Medicine",    type: "medical" },
]

const DAYS = ["Monday","Tuesday","Wednesday","Thursday","Friday","Saturday"]
const TIMES = ["8:00 AM","9:00 AM","10:00 AM","11:00 AM","1:00 PM","2:00 PM","3:00 PM","4:00 PM","5:00 PM"]

const initialSchedules = {
  "DOC-001": { Monday:["8:00 AM","9:00 AM","10:00 AM","11:00 AM"], Tuesday:["8:00 AM","9:00 AM"], Wednesday:["1:00 PM","2:00 PM","3:00 PM"], Thursday:[], Friday:["8:00 AM","9:00 AM","10:00 AM"], Saturday:["8:00 AM","9:00 AM"] },
  "DOC-002": { Monday:["9:00 AM","10:00 AM","11:00 AM"], Tuesday:["9:00 AM","10:00 AM","11:00 AM","1:00 PM"], Wednesday:[], Thursday:["9:00 AM","10:00 AM"], Friday:["9:00 AM","10:00 AM","11:00 AM"], Saturday:[] },
  "DOC-003": { Monday:[], Tuesday:["1:00 PM","2:00 PM","3:00 PM"], Wednesday:["1:00 PM","2:00 PM"], Thursday:["1:00 PM","2:00 PM","3:00 PM","4:00 PM"], Friday:[], Saturday:["10:00 AM","11:00 AM"] },
  "DOC-004": { Monday:["8:00 AM","9:00 AM","10:00 AM"], Tuesday:[], Wednesday:["8:00 AM","9:00 AM","10:00 AM","11:00 AM"], Thursday:[], Friday:["8:00 AM","9:00 AM"], Saturday:[] },
}

const Admin_DoctorSchedules = () => {
  const [schedules,  setSchedules]  = useState(initialSchedules)
  const [activeDoc,  setActiveDoc]  = useState("DOC-001")
  const [editMode,   setEditMode]   = useState(false)
  const [editDay,    setEditDay]    = useState(null)
  const [draftTimes, setDraftTimes] = useState([])

  const doc       = doctors.find(d => d.id === activeDoc)
  const schedule  = schedules[activeDoc] || {}
  const totalSlots = Object.values(schedule).flat().length

  const startEdit = (day) => {
    setEditDay(day)
    setDraftTimes([...(schedule[day] || [])])
  }

  const toggleTime = (t) => {
    setDraftTimes(prev => prev.includes(t) ? prev.filter(x=>x!==t) : [...prev, t].sort((a,b) => TIMES.indexOf(a)-TIMES.indexOf(b)))
  }

  const saveDay = () => {
    setSchedules(prev => ({ ...prev, [activeDoc]: { ...prev[activeDoc], [editDay]: draftTimes } }))
    setEditDay(null)
  }

  return (
    <div className="max-w-5xl space-y-5">
      <div>
        <h1 className="text-2xl font-bold text-slate-800">Doctor Schedules</h1>
        <p className="text-sm text-slate-500 mt-0.5">Set available consultation slots per doctor per day.</p>
      </div>

      {/* Doctor picker */}
      <div className="flex gap-3 flex-wrap">
        {doctors.map(d => {
          const Icon = d.type==="derma" ? MdFace : MdMedicalServices
          const isActive = activeDoc === d.id
          return (
            <button key={d.id} onClick={()=>{ setActiveDoc(d.id); setEditDay(null) }}
              className={`flex items-center gap-2.5 px-4 py-2.5 rounded-2xl border-2 transition-all
                ${isActive ? "border-amber-400 bg-amber-50" : "border-slate-200 bg-white hover:border-slate-300"}`}>
              <div className={`w-7 h-7 rounded-lg flex items-center justify-center ${d.type==="derma"?"bg-emerald-50":"bg-slate-100"}`}>
                <Icon className={`text-[14px] ${d.type==="derma"?"text-emerald-600":"text-slate-500"}`} />
              </div>
              <div className="text-left">
                <p className={`text-xs font-bold ${isActive?"text-amber-700":"text-slate-700"}`}>{d.name}</p>
                <p className={`text-[10px] ${isActive?"text-amber-600":"text-slate-400"}`}>{d.specialty}</p>
              </div>
            </button>
          )
        })}
      </div>

      {/* Summary */}
      <div className="bg-white border border-slate-200 rounded-2xl px-5 py-4 flex items-center justify-between">
        <div>
          <p className="text-sm font-bold text-slate-800">{doc?.name}</p>
          <p className="text-xs text-slate-500 mt-0.5">{doc?.specialty} · <span className="font-semibold text-slate-700">{totalSlots} total slots per week</span></p>
        </div>
        <div className="flex items-center gap-2">
          <span className={`text-[11px] font-bold border px-2.5 py-1 rounded-full ${editMode ? "bg-amber-50 text-amber-700 border-amber-200" : "bg-slate-100 text-slate-500 border-slate-200"}`}>
            {editMode ? "Edit Mode On" : "View Mode"}
          </span>
          <button onClick={()=>{ setEditMode(e=>!e); setEditDay(null) }}
            className={`flex items-center gap-1.5 text-xs font-bold px-3.5 py-2 rounded-xl transition-colors
              ${editMode ? "bg-emerald-500 text-white hover:bg-emerald-600" : "bg-[#0b1a2c] text-amber-400 hover:bg-[#122236]"}`}>
            {editMode ? <><MdCheck className="text-[14px]" /> Done Editing</> : <><MdEdit className="text-[14px]" /> Edit Schedule</>}
          </button>
        </div>
      </div>

      {/* Schedule grid */}
      <div className="bg-white border border-slate-200 rounded-2xl overflow-hidden">
        <div className="grid grid-cols-6 border-b border-slate-100">
          {DAYS.map(day => (
            <div key={day} className="px-3 py-3 border-r border-slate-100 last:border-r-0">
              <p className="text-[11px] font-bold text-slate-500 uppercase tracking-widest">{day.slice(0,3)}</p>
              <p className="text-[10px] text-slate-400 mt-0.5">{(schedule[day]||[]).length} slots</p>
            </div>
          ))}
        </div>
        <div className="grid grid-cols-6">
          {DAYS.map(day => {
            const slots   = schedule[day] || []
            const isEditing = editMode && editDay === day
            return (
              <div key={day} className={`p-3 border-r border-slate-100 last:border-r-0 min-h-[180px]
                ${isEditing ? "bg-amber-50/40" : ""}`}>
                <div className="space-y-1 mb-2">
                  {slots.length === 0 ? (
                    <p className="text-[10px] text-slate-300 italic py-2">No slots</p>
                  ) : slots.map(t => (
                    <span key={t} className={`block text-[10px] font-semibold px-2 py-1 rounded-lg text-center
                      ${isEditing ? "bg-amber-100 text-amber-700 border border-amber-200" : "bg-slate-100 text-slate-600"}`}>
                      {t}
                    </span>
                  ))}
                </div>
                {editMode && !isEditing && (
                  <button onClick={()=>startEdit(day)}
                    className="w-full text-[10px] font-bold text-amber-600 border border-dashed border-amber-300
                      rounded-lg py-1 hover:bg-amber-50 transition-colors flex items-center justify-center gap-1">
                    <MdEdit className="text-[11px]" /> Edit
                  </button>
                )}
              </div>
            )
          })}
        </div>
      </div>

      {/* Time picker panel for editing a day */}
      {editDay && (
        <div className="bg-white border border-amber-200 rounded-2xl p-5">
          <div className="flex items-center justify-between mb-4">
            <div>
              <p className="text-sm font-bold text-slate-800">Edit slots — {editDay}</p>
              <p className="text-xs text-slate-500 mt-0.5">Click times to toggle availability</p>
            </div>
            <div className="flex gap-2">
              <button onClick={()=>setEditDay(null)} className="flex items-center gap-1.5 text-xs font-bold text-slate-600 border border-slate-200 px-3.5 py-2 rounded-xl hover:bg-slate-50 transition-colors">
                <MdClose className="text-[14px]" /> Cancel
              </button>
              <button onClick={saveDay} className="flex items-center gap-1.5 text-xs font-bold text-white bg-emerald-500 hover:bg-emerald-600 px-3.5 py-2 rounded-xl transition-colors">
                <MdCheck className="text-[14px]" /> Save {editDay}
              </button>
            </div>
          </div>
          <div className="grid grid-cols-3 sm:grid-cols-5 gap-2">
            {TIMES.map(t => {
              const active = draftTimes.includes(t)
              return (
                <button key={t} onClick={()=>toggleTime(t)}
                  className={`py-2.5 rounded-xl text-xs font-semibold border-2 transition-all
                    ${active ? "border-emerald-400 bg-emerald-50 text-emerald-700" : "border-slate-200 text-slate-600 hover:border-slate-300"}`}>
                  {active && <MdCheck className="inline text-[11px] mr-0.5" />}{t}
                </button>
              )
            })}
          </div>
          <p className="text-[11px] text-slate-400 mt-3">{draftTimes.length} slot{draftTimes.length !== 1 ? "s" : ""} selected</p>
        </div>
      )}
    </div>
  )
}
export default Admin_DoctorSchedules