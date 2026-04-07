// client/src/pages/doctorPage/Doctor_Schedule.jsx
// Doctors can view and edit ONLY their own schedule.
// Uses GET /api/doctor/schedule (all days) and PUT /api/doctor/schedule (save a day).
// The backend enforces req.user.id so a doctor can never touch another doctor's schedule.

import { useEffect, useState } from 'react'
import { getMyScheduleAll, saveMyScheduleDay } from '../../services/doctor.service'
import {
  MdCalendarToday, MdAccessTime, MdCheck, MdEdit, MdSave,
  MdToggleOn, MdToggleOff, MdInfo,
} from 'react-icons/md'

const DAYS = ['Monday','Tuesday','Wednesday','Thursday','Friday','Saturday','Sunday']
const DAY_ABBR = { Monday:'Mon', Tuesday:'Tue', Wednesday:'Wed', Thursday:'Thu', Friday:'Fri', Saturday:'Sat', Sunday:'Sun' }
const DAY_COLORS = {
  Monday:    { bg:'bg-sky-50',     text:'text-sky-700',     border:'border-sky-200'     },
  Tuesday:   { bg:'bg-violet-50',  text:'text-violet-700',  border:'border-violet-200'  },
  Wednesday: { bg:'bg-emerald-50', text:'text-emerald-700', border:'border-emerald-200' },
  Thursday:  { bg:'bg-amber-50',   text:'text-amber-700',   border:'border-amber-200'   },
  Friday:    { bg:'bg-rose-50',    text:'text-rose-700',    border:'border-rose-200'    },
  Saturday:  { bg:'bg-slate-50',   text:'text-slate-700',   border:'border-slate-200'   },
  Sunday:    { bg:'bg-red-50',     text:'text-red-700',     border:'border-red-200'     },
}

const formatTime = (t) => {
  if (!t) return '—'
  const [h, m] = t.split(':').map(Number)
  const period = h >= 12 ? 'PM' : 'AM'
  const disp   = h > 12 ? h - 12 : h === 0 ? 12 : h
  return `${disp}:${String(m).padStart(2,'0')} ${period}`
}

// ─── Day Card ─────────────────────────────────────────────────────────────────
const DayCard = ({ day, schedule, onSaved }) => {
  const colors = DAY_COLORS[day]
  const [editing, setEditing] = useState(false)
  const [saving,  setSaving]  = useState(false)
  const [saved,   setSaved]   = useState(false)
  const [form, setForm] = useState({
    start_time:         schedule?.start_time         || '08:00',
    end_time:           schedule?.end_time           || '17:00',
    slot_duration_mins: schedule?.slot_duration_mins || 60,
    is_active:          schedule?.is_active          ?? 0,
  })

  // Sync if parent reloads
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

  const handleToggle = async () => {
    const newVal = form.is_active ? 0 : 1
    const optimistic = { ...form, is_active: newVal }
    setForm(optimistic)
    try {
      await saveMyScheduleDay({ day_of_week: day, ...optimistic })
      onSaved()
    } catch {
      setForm(f => ({ ...f, is_active: form.is_active })) // revert
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
    } catch { alert('Failed to save schedule.') }
    finally   { setSaving(false) }
  }

  const isActive = Boolean(form.is_active)

  return (
    <div className={`bg-white border rounded-2xl overflow-hidden transition-all duration-200
      ${isActive ? 'border-slate-200 shadow-sm' : 'border-slate-100 opacity-60'}`}>

      {/* Day header */}
      <div className={`flex items-center justify-between px-4 py-3 border-b
        ${isActive ? `${colors.border} ${colors.bg}` : 'border-slate-100 bg-slate-50'}`}>
        <div className="flex items-center gap-2">
          <div className={`w-8 h-8 rounded-xl flex items-center justify-center font-black text-xs border
            ${isActive ? `${colors.bg} ${colors.text} ${colors.border}` : 'bg-slate-100 text-slate-400 border-slate-200'}`}>
            {DAY_ABBR[day]}
          </div>
          <p className={`text-sm font-bold ${isActive ? 'text-slate-800' : 'text-slate-400'}`}>{day}</p>
        </div>
        <button onClick={handleToggle} title={isActive ? 'Disable this day' : 'Enable this day'}>
          {isActive
            ? <MdToggleOn  className={`text-[28px] ${colors.text} transition-colors`} />
            : <MdToggleOff className="text-[28px] text-slate-300 transition-colors" />}
        </button>
      </div>

      {/* Body */}
      <div className="px-4 py-4 space-y-3">
        {!editing ? (
          <>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <p className="text-[10px] text-slate-400 font-medium uppercase tracking-widest mb-0.5">Start</p>
                <p className={`text-sm font-bold ${isActive ? 'text-slate-800' : 'text-slate-400'}`}>
                  {schedule ? formatTime(form.start_time) : '—'}
                </p>
              </div>
              <div>
                <p className="text-[10px] text-slate-400 font-medium uppercase tracking-widest mb-0.5">End</p>
                <p className={`text-sm font-bold ${isActive ? 'text-slate-800' : 'text-slate-400'}`}>
                  {schedule ? formatTime(form.end_time) : '—'}
                </p>
              </div>
            </div>
            <div>
              <p className="text-[10px] text-slate-400 font-medium uppercase tracking-widest mb-0.5">Slot Duration</p>
              <p className={`text-sm font-bold ${isActive ? 'text-slate-800' : 'text-slate-400'}`}>
                {schedule ? `${form.slot_duration_mins} min` : '—'}
              </p>
            </div>
            <button onClick={() => setEditing(true)}
              className={`w-full flex items-center justify-center gap-1.5 py-2 text-xs font-bold rounded-xl border transition-all
                ${isActive
                  ? `${colors.border} ${colors.bg} ${colors.text} hover:opacity-80`
                  : 'border-slate-200 text-slate-400 hover:bg-slate-50'}`}>
              <MdEdit className="text-[13px]" /> {schedule ? 'Edit Schedule' : 'Set Schedule'}
            </button>
          </>
        ) : (
          <>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-[10px] text-slate-500 font-bold uppercase tracking-widest mb-1 block">Start Time</label>
                <input type="time" value={form.start_time}
                  onChange={e => setForm(f => ({ ...f, start_time: e.target.value }))}
                  className="w-full text-sm bg-slate-50 border-2 border-slate-200 rounded-xl px-2 py-2 focus:outline-none focus:border-sky-400" />
              </div>
              <div>
                <label className="text-[10px] text-slate-500 font-bold uppercase tracking-widest mb-1 block">End Time</label>
                <input type="time" value={form.end_time}
                  onChange={e => setForm(f => ({ ...f, end_time: e.target.value }))}
                  className="w-full text-sm bg-slate-50 border-2 border-slate-200 rounded-xl px-2 py-2 focus:outline-none focus:border-sky-400" />
              </div>
            </div>
            <div>
              <label className="text-[10px] text-slate-500 font-bold uppercase tracking-widest mb-1 block">Slot Duration</label>
              <select value={form.slot_duration_mins}
                onChange={e => setForm(f => ({ ...f, slot_duration_mins: Number(e.target.value) }))}
                className="w-full text-sm bg-slate-50 border-2 border-slate-200 rounded-xl px-2 py-2 focus:outline-none focus:border-sky-400">
                {[15,20,30,45,60,90].map(v => <option key={v} value={v}>{v} minutes</option>)}
              </select>
            </div>
            <div className="flex gap-2">
              <button onClick={() => setEditing(false)}
                className="flex-1 py-2 text-xs font-semibold text-slate-600 border border-slate-200 rounded-xl hover:bg-slate-50">
                Cancel
              </button>
              <button onClick={handleSave} disabled={saving}
                className={`flex-1 flex items-center justify-center gap-1.5 py-2 text-xs font-bold text-white rounded-xl transition-colors disabled:opacity-50
                  ${saved ? 'bg-emerald-500' : 'bg-[#0b1a2c] hover:bg-[#122236]'}`}>
                {saved
                  ? <><MdCheck className="text-[13px]" /> Saved!</>
                  : saving ? 'Saving…'
                  : <><MdSave className="text-[13px]" /> Save</>}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  )
}

// ─── Main ─────────────────────────────────────────────────────────────────────
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

  const getScheduleForDay = day => schedules.find(s => s.day_of_week === day)

  const activeDays   = DAYS.filter(d =>  getScheduleForDay(d)?.is_active)
  const inactiveDays = DAYS.filter(d => !getScheduleForDay(d)?.is_active)

  if (loading) return (
    <div className="flex flex-col items-center justify-center p-20 space-y-4">
      <div className="w-10 h-10 border-4 border-slate-200 border-t-violet-500 rounded-full animate-spin" />
      <p className="text-slate-400 font-medium animate-pulse text-sm">Loading your schedule…</p>
    </div>
  )

  return (
    <div className="max-w-5xl space-y-6">

      {/* Header */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-800">My Schedule</h1>
          <p className="text-sm text-slate-500 mt-0.5">Set your weekly availability and appointment slot durations.</p>
        </div>
        {schedLoading && (
          <div className="w-5 h-5 border-2 border-slate-200 border-t-violet-500 rounded-full animate-spin shrink-0 mt-1" />
        )}
      </div>

      {/* Info banner */}
      <div className="bg-violet-50 border border-violet-200 rounded-2xl px-5 py-4 flex items-start gap-3">
        <MdInfo className="text-violet-500 text-[18px] shrink-0 mt-0.5" />
        <div>
          <p className="text-sm font-semibold text-violet-800">Your schedule controls when patients can book appointments with you.</p>
          <p className="text-xs text-violet-600 mt-1">
            Toggle days on/off to mark availability. Set start/end times and slot duration per day.
            Changes take effect immediately for new bookings.
          </p>
        </div>
      </div>

      {/* Summary */}
      <div className="bg-white border border-slate-200 rounded-2xl px-6 py-4 flex items-center gap-6">
        <div className="flex items-center gap-2">
          <MdCalendarToday className="text-violet-500 text-[20px]" />
          <div>
            <p className="text-2xl font-black text-slate-800">{activeDays.length}</p>
            <p className="text-xs text-slate-400 font-medium">Active days</p>
          </div>
        </div>
        <div className="w-px h-10 bg-slate-100" />
        <div className="flex items-center gap-2">
          <MdAccessTime className="text-slate-400 text-[20px]" />
          <div>
            <p className="text-2xl font-black text-slate-400">{inactiveDays.length}</p>
            <p className="text-xs text-slate-400 font-medium">Inactive days</p>
          </div>
        </div>
        <div className="w-px h-10 bg-slate-100" />
        <div className="flex-1 text-xs text-slate-500">
          {activeDays.length === 0
            ? 'No active days — patients cannot book appointments with you.'
            : `Active on: ${activeDays.join(', ')}`}
        </div>
      </div>

      {/* Active days */}
      {activeDays.length > 0 && (
        <div>
          <p className="text-xs font-bold text-slate-500 uppercase tracking-widest mb-3">Active Days</p>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {activeDays.map(day => (
              <DayCard
                key={day}
                day={day}
                schedule={getScheduleForDay(day)}
                onSaved={loadSchedules}
              />
            ))}
          </div>
        </div>
      )}

      {/* Inactive / unset days */}
      {inactiveDays.length > 0 && (
        <div>
          <p className="text-xs font-bold text-slate-400 uppercase tracking-widest mb-3">
            {activeDays.length > 0 ? 'Inactive / Not Set' : 'All Days (toggle a day to enable it)'}
          </p>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {inactiveDays.map(day => (
              <DayCard
                key={day}
                day={day}
                schedule={getScheduleForDay(day)}
                onSaved={loadSchedules}
              />
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

export default Doctor_Schedule