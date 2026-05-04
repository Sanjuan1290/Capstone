import { useEffect, useState } from 'react'
import { getMyScheduleAll, saveMyScheduleDay } from '../../services/doctor.service'
import {
  MdCalendarToday, MdAccessTime, MdCheck, MdEdit, MdSave,
  MdToggleOn, MdToggleOff, MdClose, MdInfo, MdSchedule,
} from 'react-icons/md'

const DAYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday']

const DAY_CFG = {
  Monday: { abbr: 'Mon', color: 'bg-sky-500', light: 'bg-sky-50', border: 'border-sky-200', text: 'text-sky-700', ring: 'focus:border-sky-400' },
  Tuesday: { abbr: 'Tue', color: 'bg-violet-500', light: 'bg-violet-50', border: 'border-violet-200', text: 'text-violet-700', ring: 'focus:border-violet-400' },
  Wednesday: { abbr: 'Wed', color: 'bg-emerald-500', light: 'bg-emerald-50', border: 'border-emerald-200', text: 'text-emerald-700', ring: 'focus:border-emerald-400' },
  Thursday: { abbr: 'Thu', color: 'bg-amber-500', light: 'bg-amber-50', border: 'border-amber-200', text: 'text-amber-700', ring: 'focus:border-amber-400' },
  Friday: { abbr: 'Fri', color: 'bg-rose-500', light: 'bg-rose-50', border: 'border-rose-200', text: 'text-rose-700', ring: 'focus:border-rose-400' },
  Saturday: { abbr: 'Sat', color: 'bg-indigo-500', light: 'bg-indigo-50', border: 'border-indigo-200', text: 'text-indigo-700', ring: 'focus:border-indigo-400' },
  Sunday: { abbr: 'Sun', color: 'bg-red-400', light: 'bg-red-50', border: 'border-red-200', text: 'text-red-700', ring: 'focus:border-red-400' },
}

function fmtTime(t) {
  if (!t) return '-'
  const [h, m] = t.split(':').map(Number)
  const p = h >= 12 ? 'PM' : 'AM'
  const d = h > 12 ? h - 12 : h === 0 ? 12 : h
  return `${d}:${String(m).padStart(2, '0')} ${p}`
}

const DayCard = ({ day, schedule, onSaved }) => {
  const cfg = DAY_CFG[day]
  const [editing, setEditing] = useState(false)
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [form, setForm] = useState({
    start_time: schedule?.start_time || '08:00',
    end_time: schedule?.end_time || '17:00',
    slot_duration_mins: schedule?.slot_duration_mins || 60,
    is_active: schedule?.is_active ?? 0,
  })

  useEffect(() => {
    if (schedule) {
      setForm({
        start_time: schedule.start_time || '08:00',
        end_time: schedule.end_time || '17:00',
        slot_duration_mins: schedule.slot_duration_mins || 60,
        is_active: schedule.is_active ?? 0,
      })
    }
  }, [schedule])

  const isActive = Boolean(form.is_active)

  const handleToggle = async () => {
    const nextForm = { ...form, is_active: isActive ? 0 : 1 }
    setForm(nextForm)
    try {
      await saveMyScheduleDay({ day_of_week: day, ...nextForm })
      onSaved()
    } catch {
      setForm((current) => ({ ...current, is_active: form.is_active }))
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
    } catch {
      alert('Failed to save.')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className={`overflow-hidden rounded-2xl border transition-all duration-200 ${isActive ? `${cfg.border} shadow-sm` : 'border-slate-100'}`}>
      <div className={`px-4 py-3 ${isActive ? cfg.light : 'bg-slate-50'}`}>
        <div className="space-y-3">
          <div className="flex min-w-0 items-center gap-3">
            <div className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-xl text-xs font-black text-white ${isActive ? cfg.color : 'bg-slate-200'}`}>
              {cfg.abbr}
            </div>
            <div className="min-w-0">
              <p className={`text-sm font-bold ${isActive ? 'text-slate-800' : 'text-slate-400'}`}>{day}</p>
              {isActive && schedule && (
                <p className="break-words text-[10px] leading-4 text-slate-500">
                  {fmtTime(form.start_time)} - {fmtTime(form.end_time)}
                </p>
              )}
            </div>
          </div>

          <button
            type="button"
            onClick={handleToggle}
            className={`flex w-full items-center justify-center rounded-2xl border px-3 py-2 transition-all ${
              isActive
                ? `${cfg.border} ${cfg.light} ${cfg.text} shadow-sm`
                : 'border-slate-200 bg-white text-slate-500 hover:border-slate-300 hover:bg-slate-50'
            }`}
            aria-pressed={isActive}
            title={isActive ? `Disable ${day}` : `Enable ${day}`}
          >
            <span className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider">
              {isActive
                ? <MdToggleOn className={`text-[28px] ${cfg.text}`} />
                : <MdToggleOff className="text-[28px] text-slate-300" />}
              {isActive ? 'Enabled' : 'Enable'}
            </span>
          </button>
        </div>
      </div>

      {isActive && (
        <div className="space-y-3 bg-white px-4 py-4">
          {!editing ? (
            <>
              <div className="grid grid-cols-3 gap-2">
                {[
                  { label: 'Start', value: fmtTime(form.start_time) },
                  { label: 'End', value: fmtTime(form.end_time) },
                  { label: 'Slot', value: `${form.slot_duration_mins}m` },
                ].map(({ label, value }) => (
                  <div key={label} className={`${cfg.light} ${cfg.border} rounded-xl border px-3 py-2.5 text-center`}>
                    <p className="mb-0.5 text-[9px] font-bold uppercase tracking-widest text-slate-400">{label}</p>
                    <p className={`text-sm font-black ${cfg.text}`}>{schedule ? value : '-'}</p>
                  </div>
                ))}
              </div>
              <button
                type="button"
                onClick={() => setEditing(true)}
                className={`flex w-full items-center justify-center gap-1.5 rounded-xl border-2 py-2.5 text-xs font-bold transition-all ${cfg.border} ${cfg.light} ${cfg.text} hover:opacity-80`}
              >
                <MdEdit className="text-[13px]" /> {schedule ? 'Edit Schedule' : 'Set Schedule'}
              </button>
            </>
          ) : (
            <>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="mb-1.5 block text-[10px] font-bold uppercase tracking-widest text-slate-500">Start</label>
                  <input
                    type="time"
                    value={form.start_time}
                    onChange={(e) => setForm((current) => ({ ...current, start_time: e.target.value }))}
                    className={`w-full rounded-xl border-2 border-slate-200 bg-slate-50 px-3 py-2.5 text-sm outline-none transition-all ${cfg.ring}`}
                  />
                </div>
                <div>
                  <label className="mb-1.5 block text-[10px] font-bold uppercase tracking-widest text-slate-500">End</label>
                  <input
                    type="time"
                    value={form.end_time}
                    onChange={(e) => setForm((current) => ({ ...current, end_time: e.target.value }))}
                    className={`w-full rounded-xl border-2 border-slate-200 bg-slate-50 px-3 py-2.5 text-sm outline-none transition-all ${cfg.ring}`}
                  />
                </div>
              </div>
              <div>
                <label className="mb-1.5 block text-[10px] font-bold uppercase tracking-widest text-slate-500">Slot Duration</label>
                <select
                  value={form.slot_duration_mins}
                  onChange={(e) => setForm((current) => ({ ...current, slot_duration_mins: Number(e.target.value) }))}
                  className={`w-full rounded-xl border-2 border-slate-200 bg-slate-50 px-3 py-2.5 text-sm outline-none transition-all ${cfg.ring}`}
                >
                  {[15, 20, 30, 45, 60, 90].map((value) => <option key={value} value={value}>{value} minutes</option>)}
                </select>
              </div>
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => setEditing(false)}
                  className="flex-1 rounded-xl border border-slate-200 py-2.5 text-xs font-semibold text-slate-600 transition-colors hover:bg-slate-50"
                >
                  <span className="flex items-center justify-center gap-1">
                    <MdClose className="text-[13px]" /> Cancel
                  </span>
                </button>
                <button
                  type="button"
                  onClick={handleSave}
                  disabled={saving}
                  className={`flex-1 rounded-xl py-2.5 text-xs font-bold text-white transition-colors disabled:opacity-50 ${saved ? 'bg-emerald-500' : `${cfg.color} hover:opacity-90`}`}
                >
                  <span className="flex items-center justify-center gap-1.5">
                    {saved
                      ? <><MdCheck className="text-[13px]" /> Saved!</>
                      : saving ? 'Saving...'
                      : <><MdSave className="text-[13px]" /> Save</>}
                  </span>
                </button>
              </div>
            </>
          )}
        </div>
      )}

      {!isActive && (
        <div className="bg-white px-4 py-3">
          <p className="text-center text-xs font-semibold text-slate-500">Click the Enable button to open this day for bookings.</p>
        </div>
      )}
    </div>
  )
}

const Doctor_Schedule = () => {
  const [schedules, setSchedules] = useState([])
  const [loading, setLoading] = useState(true)
  const [schedLoading, setSchedLoading] = useState(false)

  const loadSchedules = () => {
    setSchedLoading(true)
    getMyScheduleAll()
      .then((rows) => setSchedules(Array.isArray(rows) ? rows : []))
      .catch((err) => console.error('Schedule load error:', err))
      .finally(() => {
        setLoading(false)
        setSchedLoading(false)
      })
  }

  useEffect(() => {
    loadSchedules()
  }, [])

  const getForDay = (day) => schedules.find((schedule) => schedule.day_of_week === day)
  const activeDays = DAYS.filter((day) => getForDay(day)?.is_active)
  const inactiveDays = DAYS.filter((day) => !getForDay(day)?.is_active)

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center gap-3 py-20">
        <div className="h-10 w-10 animate-spin rounded-full border-4 border-slate-200 border-t-violet-500" />
        <p className="text-sm font-medium text-slate-400">Loading your schedule...</p>
      </div>
    )
  }

  return (
    <div className="mx-auto w-full max-w-5xl space-y-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="flex items-center gap-2 text-xl font-bold text-slate-800 lg:text-2xl">
            <MdSchedule className="text-[22px] text-violet-500" /> My Schedule
          </h1>
          <p className="mt-0.5 text-xs text-slate-500 lg:text-sm">
            Set your weekly availability and appointment slot durations.
          </p>
        </div>
        {schedLoading && (
          <div className="mt-1 h-5 w-5 shrink-0 animate-spin rounded-full border-2 border-slate-200 border-t-violet-500" />
        )}
      </div>

      <div className="flex items-start gap-3 rounded-2xl border border-violet-200 bg-violet-50 px-5 py-4">
        <MdInfo className="mt-0.5 shrink-0 text-[18px] text-violet-500" />
        <div>
          <p className="text-sm font-semibold text-violet-800">Your schedule controls when patients can book appointments.</p>
          <p className="mt-1 text-xs text-violet-600">
            Use the Enable button on each day card first, then set the time window and slot duration. Changes take effect immediately.
          </p>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-6 rounded-2xl border border-slate-200 bg-white px-5 py-4">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-violet-50">
            <MdCalendarToday className="text-[18px] text-violet-500" />
          </div>
          <div>
            <p className="text-2xl font-black text-slate-800">{activeDays.length}</p>
            <p className="text-xs font-medium text-slate-400">Active days</p>
          </div>
        </div>
        <div className="h-10 w-px bg-slate-100" />
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-slate-50">
            <MdAccessTime className="text-[18px] text-slate-400" />
          </div>
          <div>
            <p className="text-2xl font-black text-slate-400">{inactiveDays.length}</p>
            <p className="text-xs font-medium text-slate-400">Inactive</p>
          </div>
        </div>
        {activeDays.length > 0 && (
          <>
            <div className="hidden h-10 w-px bg-slate-100 sm:block" />
            <p className="hidden flex-1 text-xs text-slate-500 sm:block">
              Active on: <span className="font-semibold text-slate-700">{activeDays.join(', ')}</span>
            </p>
          </>
        )}
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
        {DAYS.map((day) => (
          <DayCard
            key={day}
            day={day}
            schedule={getForDay(day)}
            onSaved={loadSchedules}
          />
        ))}
      </div>
    </div>
  )
}

export default Doctor_Schedule
