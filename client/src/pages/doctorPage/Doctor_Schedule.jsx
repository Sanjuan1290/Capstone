// client/src/pages/doctorPage/Doctor_Schedule.jsx
// REDESIGNED: Visual day cards, large toggle switches, inline editing, responsive grid

import { useEffect, useState } from 'react'
import { getMyScheduleAll, saveMyScheduleDay } from '../../services/doctor.service'
import {
  MdCalendarToday, MdAccessTime, MdCheck, MdEdit, MdSave,
  MdToggleOn, MdToggleOff, MdClose, MdInfo, MdSchedule,
} from 'react-icons/md'

const DAYS = ['Monday','Tuesday','Wednesday','Thursday','Friday','Saturday','Sunday']

const DAY_CFG = {
  Monday:    { abbr:'Mon', color:'bg-sky-500',     light:'bg-sky-50',     border:'border-sky-200',     text:'text-sky-700',     ring:'focus:border-sky-400'     },
  Tuesday:   { abbr:'Tue', color:'bg-violet-500',  light:'bg-violet-50',  border:'border-violet-200',  text:'text-violet-700',  ring:'focus:border-violet-400'  },
  Wednesday: { abbr:'Wed', color:'bg-emerald-500', light:'bg-emerald-50', border:'border-emerald-200', text:'text-emerald-700', ring:'focus:border-emerald-400' },
  Thursday:  { abbr:'Thu', color:'bg-amber-500',   light:'bg-amber-50',   border:'border-amber-200',   text:'text-amber-700',   ring:'focus:border-amber-400'   },
  Friday:    { abbr:'Fri', color:'bg-rose-500',    light:'bg-rose-50',    border:'border-rose-200',    text:'text-rose-700',    ring:'focus:border-rose-400'    },
  Saturday:  { abbr:'Sat', color:'bg-indigo-500',  light:'bg-indigo-50',  border:'border-indigo-200',  text:'text-indigo-700',  ring:'focus:border-indigo-400'  },
  Sunday:    { abbr:'Sun', color:'bg-red-400',     light:'bg-red-50',     border:'border-red-200',     text:'text-red-700',     ring:'focus:border-red-400'     },
}

function fmtTime(t) {
  if (!t) return '—'
  const [h, m] = t.split(':').map(Number)
  const p = h >= 12 ? 'PM' : 'AM'
  const d = h > 12 ? h - 12 : h === 0 ? 12 : h
  return `${d}:${String(m).padStart(2,'0')} ${p}`
}

// ── Day Card ──────────────────────────────────────────────────────────────────
const DayCard = ({ day, schedule, onSaved }) => {
  const cfg = DAY_CFG[day]
  const [editing, setEditing] = useState(false)
  const [saving,  setSaving]  = useState(false)
  const [saved,   setSaved]   = useState(false)
  const [form, setForm] = useState({
    start_time:         schedule?.start_time         || '08:00',
    end_time:           schedule?.end_time           || '17:00',
    slot_duration_mins: schedule?.slot_duration_mins || 60,
    is_active:          schedule?.is_active          ?? 0,
  })

  useEffect(() => {
    if (schedule) {
      setForm({
        start_time:         schedule.start_time         || '08:00',
        end_time:           schedule.end_time           || '17:00',
        slot_duration_mins: schedule.slot_duration_mins || 60,
        is_active:          schedule.is_active          ?? 0,
      })
    }
  }, [schedule])

  const isActive = Boolean(form.is_active)

  const handleToggle = async () => {
    const newVal   = isActive ? 0 : 1
    const optimistic = { ...form, is_active: newVal }
    setForm(optimistic)
    try {
      await saveMyScheduleDay({ day_of_week: day, ...optimistic })
      onSaved()
    } catch {
      setForm(f => ({ ...f, is_active: form.is_active }))
    }
  }

  const handleSave = async () => {
    setSaving(true)
    try {
      await saveMyScheduleDay({ day_of_week: day, ...form })
      setSaved(true)
      setEditing(false)
      onSaved()
      setTimeout(() => setSaved(false), 2000)
    } catch { alert('Failed to save.') }
    finally  { setSaving(false) }
  }

  return (
    <div className={`rounded-2xl border overflow-hidden transition-all duration-200
      ${isActive ? `${cfg.border} shadow-sm` : 'border-slate-100'}`}>

      {/* Header */}
      <div className={`flex items-center justify-between px-4 py-3
        ${isActive ? cfg.light : 'bg-slate-50'}`}>
        <div className="flex items-center gap-3">
          <div className={`w-9 h-9 rounded-xl flex items-center justify-center font-black text-xs text-white shrink-0
            ${isActive ? cfg.color : 'bg-slate-200'}`}>
            {cfg.abbr}
          </div>
          <div>
            <p className={`text-sm font-bold ${isActive ? 'text-slate-800' : 'text-slate-400'}`}>{day}</p>
            {isActive && schedule && (
              <p className="text-[10px] text-slate-500">{fmtTime(form.start_time)} – {fmtTime(form.end_time)}</p>
            )}
          </div>
        </div>

        {/* Toggle */}
        <button onClick={handleToggle} className="shrink-0">
          {isActive
            ? <MdToggleOn  className={`text-[32px] ${cfg.text}`} />
            : <MdToggleOff className="text-[32px] text-slate-300" />}
        </button>
      </div>

      {/* Body */}
      {isActive && (
        <div className="px-4 py-4 bg-white space-y-3">
          {!editing ? (
            <>
              <div className="grid grid-cols-3 gap-2">
                {[
                  { label: 'Start',    value: fmtTime(form.start_time) },
                  { label: 'End',      value: fmtTime(form.end_time)   },
                  { label: 'Slot',     value: `${form.slot_duration_mins}m` },
                ].map(({ label, value }) => (
                  <div key={label} className={`${cfg.light} ${cfg.border} border rounded-xl px-3 py-2.5 text-center`}>
                    <p className="text-[9px] font-bold text-slate-400 uppercase tracking-widest mb-0.5">{label}</p>
                    <p className={`text-sm font-black ${cfg.text}`}>{schedule ? value : '—'}</p>
                  </div>
                ))}
              </div>
              <button onClick={() => setEditing(true)}
                className={`w-full flex items-center justify-center gap-1.5 py-2.5 text-xs font-bold
                  rounded-xl border-2 transition-all ${cfg.border} ${cfg.light} ${cfg.text} hover:opacity-80`}>
                <MdEdit className="text-[13px]" /> {schedule ? 'Edit Schedule' : 'Set Schedule'}
              </button>
            </>
          ) : (
            <>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-1.5 block">Start</label>
                  <input type="time" value={form.start_time}
                    onChange={e => setForm(f => ({ ...f, start_time: e.target.value }))}
                    className={`w-full text-sm bg-slate-50 border-2 border-slate-200 rounded-xl px-3 py-2.5
                      outline-none transition-all ${cfg.ring}`} />
                </div>
                <div>
                  <label className="text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-1.5 block">End</label>
                  <input type="time" value={form.end_time}
                    onChange={e => setForm(f => ({ ...f, end_time: e.target.value }))}
                    className={`w-full text-sm bg-slate-50 border-2 border-slate-200 rounded-xl px-3 py-2.5
                      outline-none transition-all ${cfg.ring}`} />
                </div>
              </div>
              <div>
                <label className="text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-1.5 block">
                  Slot Duration
                </label>
                <select value={form.slot_duration_mins}
                  onChange={e => setForm(f => ({ ...f, slot_duration_mins: Number(e.target.value) }))}
                  className={`w-full text-sm bg-slate-50 border-2 border-slate-200 rounded-xl px-3 py-2.5
                    outline-none transition-all ${cfg.ring}`}>
                  {[15,20,30,45,60,90].map(v => <option key={v} value={v}>{v} minutes</option>)}
                </select>
              </div>
              <div className="flex gap-2">
                <button onClick={() => setEditing(false)}
                  className="flex-1 flex items-center justify-center gap-1 py-2.5 text-xs font-semibold
                    text-slate-600 border border-slate-200 rounded-xl hover:bg-slate-50 transition-colors">
                  <MdClose className="text-[13px]" /> Cancel
                </button>
                <button onClick={handleSave} disabled={saving}
                  className={`flex-1 flex items-center justify-center gap-1.5 py-2.5 text-xs font-bold
                    text-white rounded-xl transition-colors disabled:opacity-50
                    ${saved ? 'bg-emerald-500' : `${cfg.color.replace('bg-','bg-')} hover:opacity-90`}`}>
                  {saved
                    ? <><MdCheck className="text-[13px]" /> Saved!</>
                    : saving ? 'Saving…'
                    : <><MdSave className="text-[13px]" /> Save</>}
                </button>
              </div>
            </>
          )}
        </div>
      )}

      {/* Inactive hint */}
      {!isActive && (
        <div className="px-4 py-3 bg-white">
          <p className="text-xs text-slate-400 text-center">Toggle on to enable this day</p>
        </div>
      )}
    </div>
  )
}

// ── Main ──────────────────────────────────────────────────────────────────────
const Doctor_Schedule = () => {
  const [schedules,    setSchedules]    = useState([])
  const [loading,      setLoading]      = useState(true)
  const [schedLoading, setSchedLoading] = useState(false)

  const loadSchedules = () => {
    setSchedLoading(true)
    getMyScheduleAll()
      .then(rows => setSchedules(Array.isArray(rows) ? rows : []))
      .catch(err => console.error('Schedule load error:', err))
      .finally(() => { setLoading(false); setSchedLoading(false) })
  }

  useEffect(() => { loadSchedules() }, [])

  const getForDay = day => schedules.find(s => s.day_of_week === day)
  const activeDays   = DAYS.filter(d =>  getForDay(d)?.is_active)
  const inactiveDays = DAYS.filter(d => !getForDay(d)?.is_active)

  if (loading) return (
    <div className="flex flex-col items-center justify-center py-20 gap-3">
      <div className="w-10 h-10 border-4 border-slate-200 border-t-violet-500 rounded-full animate-spin" />
      <p className="text-slate-400 text-sm font-medium">Loading your schedule…</p>
    </div>
  )

  return (
    <div className="max-w-5xl space-y-6">

      {/* Header */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-xl lg:text-2xl font-bold text-slate-800 flex items-center gap-2">
            <MdSchedule className="text-violet-500 text-[22px]" /> My Schedule
          </h1>
          <p className="text-xs lg:text-sm text-slate-500 mt-0.5">
            Set your weekly availability and appointment slot durations.
          </p>
        </div>
        {schedLoading && (
          <div className="w-5 h-5 border-2 border-slate-200 border-t-violet-500 rounded-full animate-spin shrink-0 mt-1" />
        )}
      </div>

      {/* Info banner */}
      <div className="bg-violet-50 border border-violet-200 rounded-2xl px-5 py-4 flex items-start gap-3">
        <MdInfo className="text-violet-500 text-[18px] shrink-0 mt-0.5" />
        <div>
          <p className="text-sm font-semibold text-violet-800">Your schedule controls when patients can book appointments.</p>
          <p className="text-xs text-violet-600 mt-1">
            Toggle days on/off, then set start/end times and slot duration. Changes take effect immediately.
          </p>
        </div>
      </div>

      {/* Summary bar */}
      <div className="bg-white border border-slate-200 rounded-2xl px-5 py-4 flex items-center gap-6 flex-wrap">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-violet-50 flex items-center justify-center">
            <MdCalendarToday className="text-violet-500 text-[18px]" />
          </div>
          <div>
            <p className="text-2xl font-black text-slate-800">{activeDays.length}</p>
            <p className="text-xs text-slate-400 font-medium">Active days</p>
          </div>
        </div>
        <div className="w-px h-10 bg-slate-100" />
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-slate-50 flex items-center justify-center">
            <MdAccessTime className="text-slate-400 text-[18px]" />
          </div>
          <div>
            <p className="text-2xl font-black text-slate-400">{inactiveDays.length}</p>
            <p className="text-xs text-slate-400 font-medium">Inactive</p>
          </div>
        </div>
        {activeDays.length > 0 && (
          <>
            <div className="hidden sm:block w-px h-10 bg-slate-100" />
            <p className="hidden sm:block text-xs text-slate-500 flex-1">
              Active on: <span className="font-semibold text-slate-700">{activeDays.join(', ')}</span>
            </p>
          </>
        )}
      </div>

      {/* All 7 days in one responsive grid */}
      <div>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
          {DAYS.map(day => (
            <DayCard
              key={day}
              day={day}
              schedule={getForDay(day)}
              onSaved={loadSchedules}
            />
          ))}
        </div>
      </div>
    </div>
  )
}

export default Doctor_Schedule