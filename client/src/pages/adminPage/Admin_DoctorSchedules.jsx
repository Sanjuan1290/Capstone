// client/src/pages/adminPage/Admin_DoctorSchedules.jsx
import { useEffect, useState } from 'react'
import { getDoctors, getDoctorSchedules, saveDaySchedule } from '../../services/admin.service'
import {
  MdCalendarToday, MdAccessTime, MdCheck, MdEdit,
  MdPerson, MdFace, MdMedicalServices, MdSave,
  MdChevronDown, MdToggleOn, MdToggleOff
} from 'react-icons/md'

const DAYS = ['Monday','Tuesday','Wednesday','Thursday','Friday','Saturday','Sunday']
const DAY_ABBR = { Monday:'Mon', Tuesday:'Tue', Wednesday:'Wed', Thursday:'Thu', Friday:'Fri', Saturday:'Sat', Sunday:'Sun' }
const DAY_COLORS = {
  Monday:    { bg: 'bg-sky-50',    text: 'text-sky-700',    border: 'border-sky-200'    },
  Tuesday:   { bg: 'bg-violet-50', text: 'text-violet-700', border: 'border-violet-200' },
  Wednesday: { bg: 'bg-emerald-50',text: 'text-emerald-700',border: 'border-emerald-200'},
  Thursday:  { bg: 'bg-amber-50',  text: 'text-amber-700',  border: 'border-amber-200'  },
  Friday:    { bg: 'bg-rose-50',   text: 'text-rose-700',   border: 'border-rose-200'   },
  Saturday:  { bg: 'bg-slate-50',  text: 'text-slate-700',  border: 'border-slate-200'  },
  Sunday:    { bg: 'bg-red-50',    text: 'text-red-700',    border: 'border-red-200'    },
}

// ── Day Schedule Card ─────────────────────────────────────────────────────────
const DayCard = ({ day, schedule, doctorId, onSaved }) => {
  const colors    = DAY_COLORS[day]
  const [editing, setEditing] = useState(false)
  const [saving,  setSaving]  = useState(false)
  const [saved,   setSaved]   = useState(false)
  const [form, setForm] = useState({
    start_time:        schedule?.start_time        || '08:00',
    end_time:          schedule?.end_time          || '17:00',
    slot_duration_mins: schedule?.slot_duration_mins || 60,
    is_active:         schedule?.is_active         ?? 0,
  })

  // Sync when schedule prop changes (e.g. after reload)
  useEffect(() => {
    if (schedule) {
      setForm({
        start_time:        schedule.start_time         || '08:00',
        end_time:          schedule.end_time           || '17:00',
        slot_duration_mins: schedule.slot_duration_mins || 60,
        is_active:         schedule.is_active          ?? 0,
      })
    }
  }, [schedule])

  const handleToggleActive = async () => {
    const newVal = form.is_active ? 0 : 1
    setForm(f => ({ ...f, is_active: newVal }))
    try {
      await saveDaySchedule(doctorId, { day_of_week: day, ...form, is_active: newVal })
      onSaved()
    } catch { /* revert */ setForm(f => ({ ...f, is_active: form.is_active })) }
  }

  const handleSave = async () => {
    setSaving(true)
    try {
      await saveDaySchedule(doctorId, { day_of_week: day, ...form })
      setSaved(true)
      setEditing(false)
      onSaved()
      setTimeout(() => setSaved(false), 2000)
    } catch { alert('Failed to save schedule.') }
    finally   { setSaving(false) }
  }

  const formatTime = (t) => {
    if (!t) return '—'
    const [h, m] = t.split(':').map(Number)
    const period = h >= 12 ? 'PM' : 'AM'
    const disp   = h > 12 ? h - 12 : h === 0 ? 12 : h
    return `${disp}:${String(m).padStart(2,'0')} ${period}`
  }

  const isActive = Boolean(form.is_active)

  return (
    <div className={`bg-white border rounded-2xl overflow-hidden transition-all duration-200 ${isActive ? 'border-slate-200 shadow-sm' : 'border-slate-100 opacity-60'}`}>
      {/* Day header */}
      <div className={`flex items-center justify-between px-4 py-3 border-b ${isActive ? colors.border + ' ' + colors.bg : 'border-slate-100 bg-slate-50'}`}>
        <div className="flex items-center gap-2">
          <div className={`w-8 h-8 rounded-xl flex items-center justify-center font-black text-xs ${isActive ? colors.bg + ' ' + colors.text : 'bg-slate-100 text-slate-400'} border ${isActive ? colors.border : 'border-slate-200'}`}>
            {DAY_ABBR[day]}
          </div>
          <p className={`text-sm font-bold ${isActive ? 'text-slate-800' : 'text-slate-400'}`}>{day}</p>
        </div>
        {/* Toggle active */}
        <button onClick={handleToggleActive} className="flex items-center gap-1.5">
          {isActive
            ? <MdToggleOn  className={`text-[28px] ${colors.text} transition-colors`} />
            : <MdToggleOff className="text-[28px] text-slate-300 transition-colors" />
          }
        </button>
      </div>

      {/* Schedule body */}
      <div className="px-4 py-4 space-y-3">
        {!editing ? (
          // View mode
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
              <MdEdit className="text-[13px]" />
              {schedule ? 'Edit Schedule' : 'Set Schedule'}
            </button>
          </>
        ) : (
          // Edit mode
          <>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-[10px] text-slate-500 font-bold uppercase tracking-widest mb-1 block">Start Time</label>
                <input type="time" value={form.start_time} onChange={e => setForm(f => ({ ...f, start_time: e.target.value }))}
                  className="w-full text-sm bg-slate-50 border-2 border-slate-200 rounded-xl px-2 py-2 focus:outline-none focus:border-sky-400 transition-colors" />
              </div>
              <div>
                <label className="text-[10px] text-slate-500 font-bold uppercase tracking-widest mb-1 block">End Time</label>
                <input type="time" value={form.end_time} onChange={e => setForm(f => ({ ...f, end_time: e.target.value }))}
                  className="w-full text-sm bg-slate-50 border-2 border-slate-200 rounded-xl px-2 py-2 focus:outline-none focus:border-sky-400 transition-colors" />
              </div>
            </div>
            <div>
              <label className="text-[10px] text-slate-500 font-bold uppercase tracking-widest mb-1 block">Slot Duration</label>
              <select value={form.slot_duration_mins} onChange={e => setForm(f => ({ ...f, slot_duration_mins: Number(e.target.value) }))}
                className="w-full text-sm bg-slate-50 border-2 border-slate-200 rounded-xl px-2 py-2 focus:outline-none focus:border-sky-400 transition-colors">
                {[15, 20, 30, 45, 60, 90].map(v => <option key={v} value={v}>{v} minutes</option>)}
              </select>
            </div>
            <div className="flex gap-2">
              <button onClick={() => setEditing(false)} className="flex-1 py-2 text-xs font-semibold text-slate-600 border border-slate-200 rounded-xl hover:bg-slate-50">
                Cancel
              </button>
              <button onClick={handleSave} disabled={saving}
                className={`flex-1 flex items-center justify-center gap-1.5 py-2 text-xs font-bold text-white rounded-xl transition-colors disabled:opacity-50
                  ${saved ? 'bg-emerald-500' : 'bg-[#0b1a2c] hover:bg-[#122236]'}`}>
                {saved ? <><MdCheck className="text-[13px]" /> Saved!</> : saving ? 'Saving…' : <><MdSave className="text-[13px]" /> Save</>}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  )
}

// ── Main ──────────────────────────────────────────────────────────────────────
const Admin_DoctorSchedules = () => {
  const [doctors,    setDoctors]    = useState([])
  const [selected,   setSelected]   = useState(null)
  const [schedules,  setSchedules]  = useState([])
  const [loading,    setLoading]    = useState(true)
  const [schedLoading, setSchedLoading] = useState(false)
  const [showPicker, setShowPicker] = useState(false)

  useEffect(() => {
    getDoctors()
      .then(data => {
        setDoctors(data)
        if (data.length > 0) loadSchedules(data[0])
      })
      .catch(err => console.error('Doctors error:', err))
      .finally(() => setLoading(false))
  }, [])

  const loadSchedules = async (doctor) => {
    setSelected(doctor)
    setShowPicker(false)
    setSchedLoading(true)
    try {
      const rows = await getDoctorSchedules(doctor.id)
      setSchedules(rows)
    } catch (err) {
      console.error('Schedule error:', err)
    } finally {
      setSchedLoading(false)
    }
  }

  const getScheduleForDay = (day) => schedules.find(s => s.day_of_week === day)

  const activeDays   = DAYS.filter(d => getScheduleForDay(d)?.is_active)
  const inactiveDays = DAYS.filter(d => !getScheduleForDay(d)?.is_active)

  if (loading) return (
    <div className="flex flex-col items-center justify-center p-20 space-y-4">
      <div className="w-10 h-10 border-4 border-slate-200 border-t-sky-500 rounded-full animate-spin" />
      <p className="text-slate-400 font-medium animate-pulse text-sm">Loading schedules…</p>
    </div>
  )

  return (
    <div className="max-w-5xl space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-slate-800">Doctor Schedules</h1>
        <p className="text-sm text-slate-500 mt-0.5">Set and manage weekly availability for each doctor.</p>
      </div>

      {/* Doctor selector */}
      <div className="bg-white border border-slate-200 rounded-2xl p-4 space-y-3">
        <p className="text-xs font-bold text-slate-500 uppercase tracking-widest">Select Doctor</p>
        {/* Mobile dropdown */}
        <div className="relative sm:hidden">
          <button onClick={() => setShowPicker(v => !v)}
            className="w-full flex items-center justify-between gap-3 px-4 py-3 bg-slate-50 border-2 border-slate-200 rounded-xl text-sm font-bold text-slate-800 transition-all">
            {selected ? (
              <span className="flex items-center gap-2">
                {(selected.specialty || '').toLowerCase().includes('derm')
                  ? <MdFace className="text-emerald-600 text-[16px]" />
                  : <MdMedicalServices className="text-slate-500 text-[16px]" />}
                {selected.full_name || selected.name}
              </span>
            ) : 'Choose a doctor…'}
            <MdChevronDown className={`text-slate-400 text-[18px] transition-transform ${showPicker ? 'rotate-180' : ''}`} />
          </button>
          {showPicker && (
            <div className="absolute top-full mt-1 left-0 right-0 bg-white border border-slate-200 rounded-xl shadow-xl z-20 overflow-hidden">
              {doctors.map(d => (
                <button key={d.id} onClick={() => loadSchedules(d)}
                  className={`w-full flex items-center gap-3 px-4 py-3 text-sm text-left hover:bg-slate-50 transition-colors
                    ${selected?.id === d.id ? 'bg-sky-50 text-sky-700 font-bold' : 'text-slate-700'}`}>
                  {(d.specialty||'').toLowerCase().includes('derm')
                    ? <MdFace className="text-emerald-600 text-[15px] shrink-0" />
                    : <MdMedicalServices className="text-slate-400 text-[15px] shrink-0" />}
                  {d.full_name || d.name}
                </button>
              ))}
            </div>
          )}
        </div>
        {/* Desktop grid */}
        <div className="hidden sm:flex flex-wrap gap-2">
          {doctors.map(d => {
            const isDerma   = (d.specialty || '').toLowerCase().includes('derm')
            const isChosen  = selected?.id === d.id
            const DIcon     = isDerma ? MdFace : MdMedicalServices
            return (
              <button key={d.id} onClick={() => loadSchedules(d)}
                className={`flex items-center gap-2 px-4 py-2.5 rounded-xl text-xs font-bold border-2 transition-all
                  ${isChosen
                    ? 'bg-[#0b1a2c] border-[#0b1a2c] text-sky-400'
                    : 'border-slate-200 text-slate-600 hover:border-slate-300 hover:bg-slate-50'}`}>
                <DIcon className={`text-[14px] ${isChosen ? 'text-sky-400' : isDerma ? 'text-emerald-600' : 'text-slate-400'}`} />
                {d.full_name || d.name}
              </button>
            )
          })}
        </div>
      </div>

      {/* Selected doctor summary */}
      {selected && (
        <div className="bg-white border border-slate-200 rounded-2xl px-5 py-4 flex items-center gap-4">
          <div className={`w-12 h-12 rounded-2xl flex items-center justify-center shrink-0
            ${(selected.specialty||'').toLowerCase().includes('derm') ? 'bg-emerald-50' : 'bg-slate-100'}`}>
            {(selected.specialty||'').toLowerCase().includes('derm')
              ? <MdFace className="text-emerald-600 text-[22px]" />
              : <MdMedicalServices className="text-slate-500 text-[22px]" />}
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-base font-bold text-slate-800 truncate">{selected.full_name || selected.name}</p>
            <p className="text-xs text-slate-500">{selected.specialty || 'General Practitioner'}</p>
          </div>
          <div className="flex items-center gap-4 shrink-0 text-right">
            <div>
              <p className="text-2xl font-black text-slate-800">{activeDays.length}</p>
              <p className="text-[10px] text-slate-400 font-medium">Active days</p>
            </div>
            <div>
              <p className="text-2xl font-black text-slate-400">{inactiveDays.length}</p>
              <p className="text-[10px] text-slate-400 font-medium">Inactive</p>
            </div>
          </div>
        </div>
      )}

      {/* Schedule grid */}
      {selected && (
        schedLoading ? (
          <div className="flex items-center justify-center py-16">
            <div className="w-8 h-8 border-4 border-slate-200 border-t-sky-500 rounded-full animate-spin" />
          </div>
        ) : (
          <>
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
                      doctorId={selected.id}
                      onSaved={() => getDoctorSchedules(selected.id).then(setSchedules).catch(()=>{})}
                    />
                  ))}
                </div>
              </div>
            )}

            {/* Inactive / unset days */}
            {inactiveDays.length > 0 && (
              <div>
                <p className="text-xs font-bold text-slate-400 uppercase tracking-widest mb-3">
                  {activeDays.length > 0 ? 'Inactive / Not Set' : 'All Days (Not Configured)'}
                </p>
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                  {inactiveDays.map(day => (
                    <DayCard
                      key={day}
                      day={day}
                      schedule={getScheduleForDay(day)}
                      doctorId={selected.id}
                      onSaved={() => getDoctorSchedules(selected.id).then(setSchedules).catch(()=>{})}
                    />
                  ))}
                </div>
              </div>
            )}
          </>
        )
      )}

      {!selected && !loading && (
        <div className="bg-white border border-slate-200 rounded-2xl flex flex-col items-center justify-center py-20 text-center px-8">
          <MdCalendarToday className="text-[32px] text-slate-300 mb-3" />
          <p className="text-sm font-semibold text-slate-500">Select a doctor to manage their schedule</p>
        </div>
      )}
    </div>
  )
}

export default Admin_DoctorSchedules