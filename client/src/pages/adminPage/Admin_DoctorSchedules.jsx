import { useEffect, useState } from 'react'
import { getDoctors, getDoctorSchedules, saveDaySchedule } from '../../services/admin.service'
import {
  MdCalendarToday, MdCheck, MdEdit, MdFace, MdMedicalServices,
  MdSave, MdClose, MdToggleOn, MdToggleOff, MdExpandMore, MdSchedule,
} from 'react-icons/md'

const DAYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday']

const DAY_CFG = {
  Monday: { abbr: 'Mon', color: 'bg-sky-500', light: 'bg-sky-50', border: 'border-sky-200', text: 'text-sky-700' },
  Tuesday: { abbr: 'Tue', color: 'bg-violet-500', light: 'bg-violet-50', border: 'border-violet-200', text: 'text-violet-700' },
  Wednesday: { abbr: 'Wed', color: 'bg-emerald-500', light: 'bg-emerald-50', border: 'border-emerald-200', text: 'text-emerald-700' },
  Thursday: { abbr: 'Thu', color: 'bg-amber-500', light: 'bg-amber-50', border: 'border-amber-200', text: 'text-amber-700' },
  Friday: { abbr: 'Fri', color: 'bg-rose-500', light: 'bg-rose-50', border: 'border-rose-200', text: 'text-rose-700' },
  Saturday: { abbr: 'Sat', color: 'bg-indigo-500', light: 'bg-indigo-50', border: 'border-indigo-200', text: 'text-indigo-700' },
  Sunday: { abbr: 'Sun', color: 'bg-red-400', light: 'bg-red-50', border: 'border-red-200', text: 'text-red-700' },
}

function fmtTime(t) {
  if (!t) return '-'
  const [h, m] = t.split(':').map(Number)
  const p = h >= 12 ? 'PM' : 'AM'
  const d = h > 12 ? h - 12 : h === 0 ? 12 : h
  return `${d}:${String(m).padStart(2, '0')} ${p}`
}

const DayCard = ({ day, schedule, doctorId, onSaved }) => {
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
      await saveDaySchedule(doctorId, { day_of_week: day, ...nextForm })
      onSaved()
    } catch {
      setForm((current) => ({ ...current, is_active: form.is_active }))
    }
  }

  const handleSave = async () => {
    setSaving(true)
    try {
      await saveDaySchedule(doctorId, { day_of_week: day, ...form })
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
    <div className={`overflow-hidden rounded-2xl border transition-all ${isActive ? `${cfg.border} shadow-sm` : 'border-slate-100'}`}>
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
                  <div key={label} className={`${cfg.light} ${cfg.border} rounded-xl border px-2 py-2.5 text-center`}>
                    <p className="mb-0.5 text-[9px] font-bold uppercase tracking-widest text-slate-400">{label}</p>
                    <p className={`text-xs font-black ${cfg.text}`}>{schedule ? value : '-'}</p>
                  </div>
                ))}
              </div>
              <button
                type="button"
                onClick={() => setEditing(true)}
                className={`flex w-full items-center justify-center gap-1.5 rounded-xl border-2 py-2.5 text-xs font-bold transition-all ${cfg.border} ${cfg.light} ${cfg.text} hover:opacity-80`}
              >
                <MdEdit className="text-[13px]" /> {schedule ? 'Edit' : 'Set Schedule'}
              </button>
            </>
          ) : (
            <>
              <div className="grid grid-cols-2 gap-3">
                {[
                  { label: 'Start', key: 'start_time' },
                  { label: 'End', key: 'end_time' },
                ].map(({ label, key }) => (
                  <div key={key}>
                    <label className="mb-1 block text-[10px] font-bold uppercase tracking-widest text-slate-500">{label}</label>
                    <input
                      type="time"
                      value={form[key]}
                      onChange={(e) => setForm((current) => ({ ...current, [key]: e.target.value }))}
                      className="w-full rounded-xl border-2 border-slate-200 bg-slate-50 px-2 py-2 text-sm focus:border-amber-400 focus:outline-none"
                    />
                  </div>
                ))}
              </div>
              <div>
                <label className="mb-1 block text-[10px] font-bold uppercase tracking-widest text-slate-500">Slot Duration</label>
                <select
                  value={form.slot_duration_mins}
                  onChange={(e) => setForm((current) => ({ ...current, slot_duration_mins: Number(e.target.value) }))}
                  className="w-full rounded-xl border-2 border-slate-200 bg-slate-50 px-2 py-2 text-sm focus:border-amber-400 focus:outline-none"
                >
                  {[15, 20, 30, 45, 60, 90].map((value) => <option key={value} value={value}>{value} minutes</option>)}
                </select>
              </div>
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => setEditing(false)}
                  className="flex-1 rounded-xl border border-slate-200 py-2.5 text-xs font-semibold text-slate-600 hover:bg-slate-50"
                >
                  <span className="flex items-center justify-center gap-1">
                    <MdClose className="text-[13px]" /> Cancel
                  </span>
                </button>
                <button
                  type="button"
                  onClick={handleSave}
                  disabled={saving}
                  className={`flex-1 rounded-xl py-2.5 text-xs font-bold text-white disabled:opacity-50 ${saved ? 'bg-emerald-500' : `${cfg.color} hover:opacity-90`}`}
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
        <div className="bg-white px-4 py-3 text-center text-xs text-slate-400">Toggle on to enable</div>
      )}
    </div>
  )
}

const Admin_DoctorSchedules = () => {
  const [doctors, setDoctors] = useState([])
  const [selected, setSelected] = useState(null)
  const [schedules, setSchedules] = useState([])
  const [loading, setLoading] = useState(true)
  const [schedLoading, setSchedLoading] = useState(false)
  const [showPicker, setShowPicker] = useState(false)

  useEffect(() => {
    getDoctors()
      .then((data) => setDoctors(Array.isArray(data) ? data : []))
      .catch((err) => console.error(err))
      .finally(() => setLoading(false))
  }, [])

  const loadSchedules = async (doctor) => {
    setSelected(doctor)
    setShowPicker(false)
    setSchedLoading(true)
    try {
      setSchedules(await getDoctorSchedules(doctor.id))
    } catch {
      setSchedules([])
    } finally {
      setSchedLoading(false)
    }
  }

  const getForDay = (day) => schedules.find((schedule) => schedule.day_of_week === day)
  const activeDays = DAYS.filter((day) => getForDay(day)?.is_active)
  const inactiveDays = DAYS.filter((day) => !getForDay(day)?.is_active)

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-slate-200 border-t-amber-500" />
      </div>
    )
  }

  return (
    <div className="mx-auto w-full max-w-5xl space-y-6">
      <div>
        <h1 className="flex items-center gap-2 text-xl font-bold text-slate-800 lg:text-2xl">
          <MdSchedule className="text-[22px] text-amber-500" /> Doctor Schedules
        </h1>
        <p className="mt-0.5 text-xs text-slate-500 lg:text-sm">Manage weekly availability per doctor.</p>
      </div>

      <div className="space-y-3 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <p className="text-xs font-bold uppercase tracking-widest text-slate-500">Select Doctor</p>

        <div className="relative sm:hidden">
          <button
            type="button"
            onClick={() => setShowPicker((current) => !current)}
            className="flex w-full items-center justify-between gap-3 rounded-xl border-2 border-slate-200 bg-slate-50 px-4 py-3 text-sm font-bold text-slate-800"
          >
            {selected ? (
              <span className="flex items-center gap-2">
                {(selected.specialty || '').toLowerCase().includes('derm')
                  ? <MdFace className="text-[16px] text-emerald-600" />
                  : <MdMedicalServices className="text-[16px] text-slate-500" />}
                {selected.full_name || selected.name}
              </span>
            ) : 'Choose a doctor...'}
            <MdExpandMore className={`text-[18px] text-slate-400 transition-transform ${showPicker ? 'rotate-180' : ''}`} />
          </button>
          {showPicker && (
            <div className="absolute left-0 right-0 top-full z-20 mt-1 overflow-hidden rounded-xl border border-slate-200 bg-white shadow-xl">
              {doctors.map((doctor) => (
                <button
                  key={doctor.id}
                  type="button"
                  onClick={() => loadSchedules(doctor)}
                  className={`flex w-full items-center gap-3 px-4 py-3 text-left text-sm transition-colors hover:bg-slate-50 ${
                    selected?.id === doctor.id ? 'bg-amber-50 font-bold text-amber-700' : 'text-slate-700'
                  }`}
                >
                  {(doctor.specialty || '').toLowerCase().includes('derm')
                    ? <MdFace className="text-[15px] text-emerald-600" />
                    : <MdMedicalServices className="text-[15px] text-slate-400" />}
                  {doctor.full_name || doctor.name}
                </button>
              ))}
            </div>
          )}
        </div>

        <div className="hidden flex-wrap gap-2 sm:flex">
          {doctors.map((doctor) => {
            const isDerma = (doctor.specialty || '').toLowerCase().includes('derm')
            const chosen = selected?.id === doctor.id
            const Icon = isDerma ? MdFace : MdMedicalServices
            return (
              <button
                key={doctor.id}
                type="button"
                onClick={() => loadSchedules(doctor)}
                className={`flex items-center gap-2 rounded-xl border-2 px-4 py-2.5 text-xs font-bold transition-all ${
                  chosen ? 'border-amber-500 bg-amber-500 text-white' : 'border-slate-200 text-slate-600 hover:border-slate-300 hover:bg-slate-50'
                }`}
              >
                <Icon className={`text-[14px] ${chosen ? 'text-white' : isDerma ? 'text-emerald-600' : 'text-slate-400'}`} />
                {doctor.full_name || doctor.name}
              </button>
            )
          })}
        </div>
      </div>

      {selected && (
        <div className="flex items-center gap-4 rounded-2xl border border-slate-200 bg-white px-5 py-4 shadow-sm">
          <div className={`flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl ${(selected.specialty || '').toLowerCase().includes('derm') ? 'bg-emerald-50' : 'bg-slate-100'}`}>
            {(selected.specialty || '').toLowerCase().includes('derm')
              ? <MdFace className="text-[22px] text-emerald-600" />
              : <MdMedicalServices className="text-[22px] text-slate-500" />}
          </div>
          <div className="min-w-0 flex-1">
            <p className="truncate font-bold text-slate-800">{selected.full_name || selected.name}</p>
            <p className="text-xs text-slate-500">{selected.specialty || 'General Medicine'}</p>
          </div>
          <div className="shrink-0 text-right">
            <div className="flex items-center gap-6">
              <div>
                <p className="text-2xl font-black text-amber-600">{activeDays.length}</p>
                <p className="text-[10px] font-medium text-slate-400">Active</p>
              </div>
              <div>
                <p className="text-2xl font-black text-slate-300">{inactiveDays.length}</p>
                <p className="text-[10px] font-medium text-slate-400">Inactive</p>
              </div>
            </div>
          </div>
        </div>
      )}

      {selected && (
        schedLoading ? (
          <div className="flex items-center justify-center py-16">
            <div className="h-8 w-8 animate-spin rounded-full border-4 border-slate-200 border-t-amber-500" />
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            {DAYS.map((day) => (
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
        <div className="flex flex-col items-center justify-center rounded-2xl border border-slate-200 bg-white px-8 py-20 text-center">
          <MdCalendarToday className="mb-3 text-[32px] text-slate-300" />
          <p className="text-sm font-semibold text-slate-500">Select a doctor to manage their schedule</p>
          <p className="mt-1 text-xs text-slate-400">Pick from the doctor list above.</p>
        </div>
      )}
    </div>
  )
}

export default Admin_DoctorSchedules
