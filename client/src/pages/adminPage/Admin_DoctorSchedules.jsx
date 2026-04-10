// client/src/pages/adminPage/Admin_DoctorSchedules.jsx
// REDESIGNED: Doctor picker pills, colorful day cards, amber admin theme

import { useEffect, useState } from 'react'
import { getDoctors, getDoctorSchedules, saveDaySchedule } from '../../services/admin.service'
import {
  MdCalendarToday, MdAccessTime, MdCheck, MdEdit,
  MdFace, MdMedicalServices, MdSave, MdClose,
  MdToggleOn, MdToggleOff, MdExpandMore, MdSchedule,
} from 'react-icons/md'

const DAYS = ['Monday','Tuesday','Wednesday','Thursday','Friday','Saturday','Sunday']

const DAY_CFG = {
  Monday:    { abbr:'Mon', color:'bg-sky-500',     light:'bg-sky-50',     border:'border-sky-200',     text:'text-sky-700'     },
  Tuesday:   { abbr:'Tue', color:'bg-violet-500',  light:'bg-violet-50',  border:'border-violet-200',  text:'text-violet-700'  },
  Wednesday: { abbr:'Wed', color:'bg-emerald-500', light:'bg-emerald-50', border:'border-emerald-200', text:'text-emerald-700' },
  Thursday:  { abbr:'Thu', color:'bg-amber-500',   light:'bg-amber-50',   border:'border-amber-200',   text:'text-amber-700'   },
  Friday:    { abbr:'Fri', color:'bg-rose-500',    light:'bg-rose-50',    border:'border-rose-200',    text:'text-rose-700'    },
  Saturday:  { abbr:'Sat', color:'bg-indigo-500',  light:'bg-indigo-50',  border:'border-indigo-200',  text:'text-indigo-700'  },
  Sunday:    { abbr:'Sun', color:'bg-red-400',     light:'bg-red-50',     border:'border-red-200',     text:'text-red-700'     },
}

function fmtTime(t) {
  if (!t) return '—'
  const [h, m] = t.split(':').map(Number)
  const p = h >= 12 ? 'PM' : 'AM'
  const d = h > 12 ? h - 12 : h === 0 ? 12 : h
  return `${d}:${String(m).padStart(2,'0')} ${p}`
}

// ── Day Card ──────────────────────────────────────────────────────────────────
const DayCard = ({ day, schedule, doctorId, onSaved }) => {
  const cfg = DAY_CFG[day]
  const [editing, setEditing] = useState(false)
  const [saving,  setSaving]  = useState(false)
  const [saved,   setSaved]   = useState(false)
  const [form, setForm] = useState({
    start_time:        schedule?.start_time        || '08:00',
    end_time:          schedule?.end_time          || '17:00',
    slot_duration_mins: schedule?.slot_duration_mins || 60,
    is_active:         schedule?.is_active         ?? 0,
  })

  useEffect(() => {
    if (schedule) setForm({
      start_time:        schedule.start_time         || '08:00',
      end_time:          schedule.end_time           || '17:00',
      slot_duration_mins: schedule.slot_duration_mins || 60,
      is_active:         schedule.is_active          ?? 0,
    })
  }, [schedule])

  const isActive = Boolean(form.is_active)

  const handleToggle = async () => {
    const newVal = isActive ? 0 : 1
    setForm(f => ({ ...f, is_active: newVal }))
    try { await saveDaySchedule(doctorId, { day_of_week: day, ...form, is_active: newVal }); onSaved() }
    catch { setForm(f => ({ ...f, is_active: form.is_active })) }
  }

  const handleSave = async () => {
    setSaving(true)
    try {
      await saveDaySchedule(doctorId, { day_of_week: day, ...form })
      setSaved(true); setEditing(false); onSaved()
      setTimeout(() => setSaved(false), 2000)
    } catch { alert('Failed to save.') }
    finally { setSaving(false) }
  }

  return (
    <div className={`rounded-2xl border overflow-hidden transition-all ${isActive ? `${cfg.border} shadow-sm` : 'border-slate-100'}`}>
      <div className={`flex items-center justify-between px-4 py-3 ${isActive ? cfg.light : 'bg-slate-50'}`}>
        <div className="flex items-center gap-3">
          <div className={`w-9 h-9 rounded-xl flex items-center justify-center font-black text-xs text-white shrink-0 ${isActive ? cfg.color : 'bg-slate-200'}`}>
            {cfg.abbr}
          </div>
          <div>
            <p className={`text-sm font-bold ${isActive ? 'text-slate-800' : 'text-slate-400'}`}>{day}</p>
            {isActive && schedule && (
              <p className="text-[10px] text-slate-500">{fmtTime(form.start_time)} – {fmtTime(form.end_time)}</p>
            )}
          </div>
        </div>
        <button onClick={handleToggle}>
          {isActive
            ? <MdToggleOn  className={`text-[32px] ${cfg.text}`} />
            : <MdToggleOff className="text-[32px] text-slate-300" />}
        </button>
      </div>

      {isActive && (
        <div className="px-4 py-4 bg-white space-y-3">
          {!editing ? (
            <>
              <div className="grid grid-cols-3 gap-2">
                {[{ l:'Start', v:fmtTime(form.start_time) },{ l:'End', v:fmtTime(form.end_time) },{ l:'Slot', v:`${form.slot_duration_mins}m` }].map(({l,v})=>(
                  <div key={l} className={`${cfg.light} ${cfg.border} border rounded-xl px-2 py-2.5 text-center`}>
                    <p className="text-[9px] font-bold text-slate-400 uppercase tracking-widest mb-0.5">{l}</p>
                    <p className={`text-xs font-black ${cfg.text}`}>{schedule ? v : '—'}</p>
                  </div>
                ))}
              </div>
              <button onClick={() => setEditing(true)}
                className={`w-full flex items-center justify-center gap-1.5 py-2.5 text-xs font-bold
                  rounded-xl border-2 transition-all ${cfg.border} ${cfg.light} ${cfg.text} hover:opacity-80`}>
                <MdEdit className="text-[13px]" /> {schedule ? 'Edit' : 'Set Schedule'}
              </button>
            </>
          ) : (
            <>
              <div className="grid grid-cols-2 gap-3">
                {[{l:'Start',k:'start_time'},{l:'End',k:'end_time'}].map(({l,k}) => (
                  <div key={k}>
                    <label className="text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-1 block">{l}</label>
                    <input type="time" value={form[k]} onChange={e => setForm(f => ({ ...f, [k]: e.target.value }))}
                      className="w-full text-sm bg-slate-50 border-2 border-slate-200 rounded-xl px-2 py-2 focus:outline-none focus:border-amber-400" />
                  </div>
                ))}
              </div>
              <div>
                <label className="text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-1 block">Slot Duration</label>
                <select value={form.slot_duration_mins} onChange={e => setForm(f => ({ ...f, slot_duration_mins: Number(e.target.value) }))}
                  className="w-full text-sm bg-slate-50 border-2 border-slate-200 rounded-xl px-2 py-2 focus:outline-none focus:border-amber-400">
                  {[15,20,30,45,60,90].map(v => <option key={v} value={v}>{v} minutes</option>)}
                </select>
              </div>
              <div className="flex gap-2">
                <button onClick={() => setEditing(false)} className="flex-1 flex items-center justify-center gap-1 py-2.5 text-xs font-semibold text-slate-600 border border-slate-200 rounded-xl hover:bg-slate-50">
                  <MdClose className="text-[13px]" /> Cancel
                </button>
                <button onClick={handleSave} disabled={saving}
                  className={`flex-1 flex items-center justify-center gap-1.5 py-2.5 text-xs font-bold text-white rounded-xl disabled:opacity-50
                    ${saved ? 'bg-emerald-500' : `${cfg.color} hover:opacity-90`}`}>
                  {saved ? <><MdCheck className="text-[13px]" /> Saved!</> : saving ? 'Saving…' : <><MdSave className="text-[13px]" /> Save</>}
                </button>
              </div>
            </>
          )}
        </div>
      )}
      {!isActive && <div className="px-4 py-3 bg-white text-center text-xs text-slate-400">Toggle on to enable</div>}
    </div>
  )
}

// ── Main ──────────────────────────────────────────────────────────────────────
const Admin_DoctorSchedules = () => {
  const [doctors,     setDoctors]     = useState([])
  const [selected,    setSelected]    = useState(null)
  const [schedules,   setSchedules]   = useState([])
  const [loading,     setLoading]     = useState(true)
  const [schedLoading,setSchedLoading]= useState(false)
  const [showPicker,  setShowPicker]  = useState(false)

  useEffect(() => {
    getDoctors()
      .then(data => { setDoctors(Array.isArray(data) ? data : []) })
      .catch(err => console.error(err))
      .finally(() => setLoading(false))
  }, [])

  const loadSchedules = async (doc) => {
    setSelected(doc); setShowPicker(false); setSchedLoading(true)
    try { setSchedules(await getDoctorSchedules(doc.id)) }
    catch { setSchedules([]) }
    finally { setSchedLoading(false) }
  }

  const getForDay = day => schedules.find(s => s.day_of_week === day)
  const activeDays   = DAYS.filter(d =>  getForDay(d)?.is_active)
  const inactiveDays = DAYS.filter(d => !getForDay(d)?.is_active)

  if (loading) return (
    <div className="flex items-center justify-center py-20">
      <div className="w-8 h-8 border-4 border-slate-200 border-t-amber-500 rounded-full animate-spin" />
    </div>
  )

  return (
    <div className="max-w-5xl space-y-6">

      <div>
        <h1 className="text-xl lg:text-2xl font-bold text-slate-800 flex items-center gap-2">
          <MdSchedule className="text-amber-500 text-[22px]" /> Doctor Schedules
        </h1>
        <p className="text-xs lg:text-sm text-slate-500 mt-0.5">Manage weekly availability per doctor.</p>
      </div>

      {/* Doctor picker */}
      <div className="bg-white border border-slate-200 rounded-2xl p-5 shadow-sm space-y-3">
        <p className="text-xs font-bold text-slate-500 uppercase tracking-widest">Select Doctor</p>

        {/* Mobile dropdown */}
        <div className="relative sm:hidden">
          <button onClick={() => setShowPicker(v => !v)}
            className="w-full flex items-center justify-between gap-3 px-4 py-3 bg-slate-50 border-2 border-slate-200 rounded-xl text-sm font-bold text-slate-800">
            {selected ? (
              <span className="flex items-center gap-2">
                {(selected.specialty || '').toLowerCase().includes('derm') ? <MdFace className="text-emerald-600 text-[16px]" /> : <MdMedicalServices className="text-slate-500 text-[16px]" />}
                {selected.full_name || selected.name}
              </span>
            ) : 'Choose a doctor…'}
            <MdExpandMore className={`text-slate-400 text-[18px] transition-transform ${showPicker ? 'rotate-180' : ''}`} />
          </button>
          {showPicker && (
            <div className="absolute top-full mt-1 left-0 right-0 bg-white border border-slate-200 rounded-xl shadow-xl z-20 overflow-hidden">
              {doctors.map(d => (
                <button key={d.id} onClick={() => loadSchedules(d)}
                  className={`w-full flex items-center gap-3 px-4 py-3 text-sm text-left hover:bg-slate-50 transition-colors
                    ${selected?.id === d.id ? 'bg-amber-50 text-amber-700 font-bold' : 'text-slate-700'}`}>
                  {(d.specialty||'').toLowerCase().includes('derm') ? <MdFace className="text-emerald-600 text-[15px]" /> : <MdMedicalServices className="text-slate-400 text-[15px]" />}
                  {d.full_name || d.name}
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Desktop pills */}
        <div className="hidden sm:flex flex-wrap gap-2">
          {doctors.map(d => {
            const isDerma = (d.specialty || '').toLowerCase().includes('derm')
            const chosen  = selected?.id === d.id
            const DIcon   = isDerma ? MdFace : MdMedicalServices
            return (
              <button key={d.id} onClick={() => loadSchedules(d)}
                className={`flex items-center gap-2 px-4 py-2.5 rounded-xl text-xs font-bold border-2 transition-all
                  ${chosen ? 'bg-amber-500 border-amber-500 text-white' : 'border-slate-200 text-slate-600 hover:border-slate-300 hover:bg-slate-50'}`}>
                <DIcon className={`text-[14px] ${chosen ? 'text-white' : isDerma ? 'text-emerald-600' : 'text-slate-400'}`} />
                {d.full_name || d.name}
              </button>
            )
          })}
        </div>
      </div>

      {/* Selected doctor summary */}
      {selected && (
        <div className="bg-white border border-slate-200 rounded-2xl px-5 py-4 flex items-center gap-4 shadow-sm">
          <div className={`w-12 h-12 rounded-2xl flex items-center justify-center shrink-0
            ${(selected.specialty||'').toLowerCase().includes('derm') ? 'bg-emerald-50' : 'bg-slate-100'}`}>
            {(selected.specialty||'').toLowerCase().includes('derm')
              ? <MdFace className="text-emerald-600 text-[22px]" />
              : <MdMedicalServices className="text-slate-500 text-[22px]" />}
          </div>
          <div className="flex-1 min-w-0">
            <p className="font-bold text-slate-800 truncate">{selected.full_name || selected.name}</p>
            <p className="text-xs text-slate-500">{selected.specialty || 'General Practitioner'}</p>
          </div>
          <div className="flex items-center gap-6 shrink-0 text-right">
            <div>
              <p className="text-2xl font-black text-amber-600">{activeDays.length}</p>
              <p className="text-[10px] text-slate-400 font-medium">Active</p>
            </div>
            <div>
              <p className="text-2xl font-black text-slate-300">{inactiveDays.length}</p>
              <p className="text-[10px] text-slate-400 font-medium">Inactive</p>
            </div>
          </div>
        </div>
      )}

      {/* Schedule grid */}
      {selected && (
        schedLoading ? (
          <div className="flex items-center justify-center py-16">
            <div className="w-8 h-8 border-4 border-slate-200 border-t-amber-500 rounded-full animate-spin" />
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
            {DAYS.map(day => (
              <DayCard
                key={day}
                day={day}
                schedule={getForDay(day)}
                doctorId={selected.id}
                onSaved={() => getDoctorSchedules(selected.id).then(setSchedules).catch(() => {})}
              />
            ))}
          </div>
        )
      )}

      {!selected && !loading && (
        <div className="bg-white border border-slate-200 rounded-2xl flex flex-col items-center justify-center py-20 text-center px-8">
          <MdCalendarToday className="text-[32px] text-slate-300 mb-3" />
          <p className="text-sm font-semibold text-slate-500">Select a doctor to manage their schedule</p>
          <p className="text-xs text-slate-400 mt-1">Pick from the doctor list above.</p>
        </div>
      )}
    </div>
  )
}

export default Admin_DoctorSchedules