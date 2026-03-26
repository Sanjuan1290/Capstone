import { useEffect, useState } from 'react'
import { getDoctors, getDoctorSchedules, saveDaySchedule } from '../../services/admin.service'
import {
  MdFace, MdMedicalServices, MdEdit, MdCheck, MdClose,
  MdAdd, MdCalendarToday, MdAccessTime, MdChevronLeft, MdChevronRight
} from "react-icons/md"

const DAYS = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"]
const TIMES = ["8:00 AM", "9:00 AM", "10:00 AM", "11:00 AM", "1:00 PM", "2:00 PM", "3:00 PM", "4:00 PM", "5:00 PM"]

const Admin_DoctorSchedules = () => {
  const [doctors, setDoctors] = useState([])
  const [schedules, setSchedules] = useState({}) // { doctorId: { Monday: [...], ... } }
  const [loading, setLoading] = useState(true)
  const [activeDoc, setActiveDoc] = useState(null)
  const [editMode, setEditMode] = useState(false)
  const [editDay, setEditDay] = useState(null)
  const [draftTimes, setDraftTimes] = useState([])

  // 1. Initial Load: Fetch Doctors
  useEffect(() => {
    getDoctors()
      .then(data => {
        setDoctors(data)
        if (data[0]) setActiveDoc(data[0].id)
      })
      .catch(err => console.error("Fetch Doctors Error:", err))
      .finally(() => setLoading(false))
  }, [])

  // 2. Fetch active doctor's schedule on change
  useEffect(() => {
    if (!activeDoc) return
    setLoading(true)
    getDoctorSchedules(activeDoc)
      .then(rows => {
        const built = {}
        DAYS.forEach(day => {
          const row = rows.find(r => r.day_of_week === day)
          if (!row || !row.is_active) { built[day] = []; return }

          const slots = []
          const [sh, sm] = row.start_time.split(':').map(Number)
          const [eh, em] = row.end_time.split(':').map(Number)
          let h = sh, m = sm

          while (h * 60 + m < eh * 60 + em) {
            const p = h >= 12 ? 'PM' : 'AM'
            const dh = h > 12 ? h - 12 : h === 0 ? 12 : h
            slots.push(`${dh}:${String(m).padStart(2, '0')} ${p}`)
            m += row.slot_duration_mins || 60
            if (m >= 60) { h += Math.floor(m / 60); m = m % 60 }
          }
          built[day] = slots
        })
        setSchedules(prev => ({ ...prev, [activeDoc]: built }))
      })
      .catch(err => console.error("Fetch Schedule Error:", err))
      .finally(() => setLoading(false))
  }, [activeDoc])

  const doc = doctors.find(d => d.id === activeDoc)
  const schedule = schedules[activeDoc] || {}
  const totalSlots = Object.values(schedule).flat().length

  const startEdit = (day) => {
    setEditDay(day)
    setDraftTimes([...(schedule[day] || [])])
  }

  const toggleTime = (t) => {
    setDraftTimes(prev =>
      prev.includes(t)
        ? prev.filter(x => x !== t)
        : [...prev, t].sort((a, b) => TIMES.indexOf(a) - TIMES.indexOf(b))
    )
  }

  // 3. Save Logic: Convert slots back to DB format
  const handleSaveDay = async () => {
    const slots = draftTimes
    let start_time = null, end_time = null, slot_duration_mins = 60

    if (slots.length > 0) {
      const toMins = t => {
        const [time, period] = t.split(' ')
        let [h, m] = time.split(':').map(Number)
        if (period === 'PM' && h !== 12) h += 12
        if (period === 'AM' && h === 12) h = 0
        return h * 60 + m
      }
      const sorted = [...slots].sort((a, b) => toMins(a) - toMins(b))
      const startM = toMins(sorted[0])
      const lastM = toMins(sorted[sorted.length - 1])
      
      if (sorted.length > 1) slot_duration_mins = toMins(sorted[1]) - startM
      const endM = lastM + slot_duration_mins

      start_time = `${String(Math.floor(startM / 60)).padStart(2, '0')}:${String(startM % 60).padStart(2, '0')}:00`
      end_time = `${String(Math.floor(endM / 60)).padStart(2, '0')}:${String(endM % 60).padStart(2, '0')}:00`
    }

    try {
      await saveDaySchedule(activeDoc, {
        day_of_week: editDay,
        start_time,
        end_time,
        slot_duration_mins,
        is_active: slots.length > 0 ? 1 : 0,
      })

      setSchedules(prev => ({
        ...prev,
        [activeDoc]: { ...(prev[activeDoc] || {}), [editDay]: draftTimes }
      }))
      setEditDay(null)
    } catch (err) {
      alert("Failed to save schedule changes.")
    }
  }

  if (loading && doctors.length === 0) return <div className="p-10 text-center text-slate-500">Loading Doctor Data...</div>

  return (
    <div className="max-w-5xl space-y-5">
      <div>
        <h1 className="text-2xl font-bold text-slate-800">Doctor Schedules</h1>
        <p className="text-sm text-slate-500 mt-0.5">Manage consultation availability and time slots.</p>
      </div>

      <div className="flex gap-3 flex-wrap">
        {doctors.map(d => {
          const Icon = d.type === "derma" ? MdFace : MdMedicalServices
          const isActive = activeDoc === d.id
          return (
            <button key={d.id} onClick={() => { setActiveDoc(d.id); setEditDay(null) }}
              className={`flex items-center gap-2.5 px-4 py-2.5 rounded-2xl border-2 transition-all
                ${isActive ? "border-amber-400 bg-amber-50 shadow-sm" : "border-slate-200 bg-white hover:border-slate-300"}`}>
              <div className={`w-7 h-7 rounded-lg flex items-center justify-center ${d.type === "derma" ? "bg-emerald-50" : "bg-slate-100"}`}>
                <Icon className={`text-[14px] ${d.type === "derma" ? "text-emerald-600" : "text-slate-500"}`} />
              </div>
              <div className="text-left">
                <p className={`text-xs font-bold ${isActive ? "text-amber-700" : "text-slate-700"}`}>{d.full_name || d.name}</p>
                <p className={`text-[10px] ${isActive ? "text-amber-600" : "text-slate-400"}`}>{d.specialty}</p>
              </div>
            </button>
          )
        })}
      </div>

      <div className="bg-white border border-slate-200 rounded-2xl px-5 py-4 flex items-center justify-between shadow-sm">
        <div>
          <p className="text-sm font-bold text-slate-800">{doc?.full_name || doc?.name}</p>
          <p className="text-xs text-slate-500 mt-0.5">{doc?.specialty} · <span className="font-semibold text-slate-700">{totalSlots} available slots weekly</span></p>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={() => { setEditMode(e => !e); setEditDay(null) }}
            className={`flex items-center gap-1.5 text-xs font-bold px-3.5 py-2 rounded-xl transition-all shadow-sm
              ${editMode ? "bg-emerald-500 text-white hover:bg-emerald-600" : "bg-[#0b1a2c] text-amber-400 hover:bg-[#122236]"}`}>
            {editMode ? <><MdCheck className="text-[14px]" /> Exit Edit Mode</> : <><MdEdit className="text-[14px]" /> Modify Schedule</>}
          </button>
        </div>
      </div>

      <div className="bg-white border border-slate-200 rounded-2xl overflow-hidden shadow-sm">
        <div className="grid grid-cols-6 border-b border-slate-100 bg-slate-50/30">
          {DAYS.map(day => (
            <div key={day} className="px-3 py-3 border-r border-slate-100 last:border-r-0">
              <p className="text-[11px] font-bold text-slate-500 uppercase tracking-widest">{day.slice(0, 3)}</p>
              <p className="text-[10px] text-slate-400 mt-0.5">{(schedule[day] || []).length} slots</p>
            </div>
          ))}
        </div>
        <div className="grid grid-cols-6">
          {DAYS.map(day => {
            const slots = schedule[day] || []
            const isEditing = editMode && editDay === day
            return (
              <div key={day} className={`p-3 border-r border-slate-100 last:border-r-0 min-h-[180px] transition-colors
                ${isEditing ? "bg-amber-50/40" : ""}`}>
                <div className="space-y-1 mb-3">
                  {slots.length === 0 ? (
                    <p className="text-[10px] text-slate-300 italic py-2">Not available</p>
                  ) : slots.map(t => (
                    <span key={t} className={`block text-[10px] font-semibold px-2 py-1 rounded-lg text-center border
                      ${isEditing ? "bg-amber-100 text-amber-700 border-amber-200" : "bg-slate-50 text-slate-600 border-slate-100"}`}>
                      {t}
                    </span>
                  ))}
                </div>
                {editMode && !isEditing && (
                  <button onClick={() => startEdit(day)}
                    className="w-full text-[10px] font-bold text-amber-600 border border-dashed border-amber-300
                      rounded-lg py-1 hover:bg-amber-50 transition-colors flex items-center justify-center gap-1">
                    <MdEdit className="text-[11px]" /> Edit {day.slice(0, 3)}
                  </button>
                )}
              </div>
            )
          })}
        </div>
      </div>

      {editDay && (
        <div className="bg-white border-2 border-amber-200 rounded-2xl p-5 shadow-xl animate-in fade-in slide-in-from-bottom-4 duration-300">
          <div className="flex items-center justify-between mb-5">
            <div>
              <p className="text-sm font-bold text-slate-800">Assign Slots — {editDay}</p>
              <p className="text-xs text-slate-500 mt-0.5">Toggle times to mark availability for this doctor.</p>
            </div>
            <div className="flex gap-2">
              <button onClick={() => setEditDay(null)} className="text-xs font-bold text-slate-600 border border-slate-200 px-4 py-2 rounded-xl hover:bg-slate-50">Cancel</button>
              <button onClick={handleSaveDay} className="flex items-center gap-1.5 text-xs font-bold text-white bg-emerald-500 hover:bg-emerald-600 px-4 py-2 rounded-xl shadow-sm">
                <MdCheck className="text-[14px]" /> Update {editDay}
              </button>
            </div>
          </div>
          <div className="grid grid-cols-3 sm:grid-cols-5 gap-2">
            {TIMES.map(t => {
              const active = draftTimes.includes(t)
              return (
                <button key={t} onClick={() => toggleTime(t)}
                  className={`py-2.5 rounded-xl text-xs font-bold border-2 transition-all
                    ${active ? "border-emerald-400 bg-emerald-50 text-emerald-700" : "border-slate-200 text-slate-500 hover:border-slate-300"}`}>
                  {active && <MdCheck className="inline text-[11px] mr-1" />}{t}
                </button>
              )
            })}
          </div>
        </div>
      )}
    </div>
  )
}
export default Admin_DoctorSchedules