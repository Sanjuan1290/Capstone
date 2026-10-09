import { useEffect, useState } from 'react'
import { MdCheck, MdClose, MdEdit, MdSave, MdToggleOff, MdToggleOn } from 'react-icons/md'
import { formatScheduleTime, scheduleSummary } from '../../utils/schedule'

const DAY_CFG = {
  Monday: { abbr: 'Mon', color: 'bg-sky-500', light: 'bg-sky-50', border: 'border-sky-200', text: 'text-sky-700', ring: 'focus:border-sky-400' },
  Tuesday: { abbr: 'Tue', color: 'bg-violet-500', light: 'bg-violet-50', border: 'border-violet-200', text: 'text-violet-700', ring: 'focus:border-violet-400' },
  Wednesday: { abbr: 'Wed', color: 'bg-emerald-500', light: 'bg-emerald-50', border: 'border-emerald-200', text: 'text-emerald-700', ring: 'focus:border-emerald-400' },
  Thursday: { abbr: 'Thu', color: 'bg-amber-500', light: 'bg-amber-50', border: 'border-amber-200', text: 'text-amber-700', ring: 'focus:border-amber-400' },
  Friday: { abbr: 'Fri', color: 'bg-rose-500', light: 'bg-rose-50', border: 'border-rose-200', text: 'text-rose-700', ring: 'focus:border-rose-400' },
  Saturday: { abbr: 'Sat', color: 'bg-indigo-500', light: 'bg-indigo-50', border: 'border-indigo-200', text: 'text-indigo-700', ring: 'focus:border-indigo-400' },
  Sunday: { abbr: 'Sun', color: 'bg-red-400', light: 'bg-red-50', border: 'border-red-200', text: 'text-red-700', ring: 'focus:border-red-400' },
}

const asBool = (value) => value === true || Number(value) === 1

const scheduleToForm = (schedule) => ({
  start_time: schedule?.start_time || '08:00',
  end_time: schedule?.end_time || '17:00',
  slot_duration_mins: schedule?.slot_duration_mins || 60,
  is_active: schedule?.is_active ?? 0,
  spans_next_day: schedule?.spans_next_day ?? 0,
  is_24_hours: schedule?.is_24_hours ?? 0,
})

const ScheduleDayCard = ({ day, schedule, onSave, onSaved }) => {
  const cfg = DAY_CFG[day] || DAY_CFG.Monday
  const [editing, setEditing] = useState(false)
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [error, setError] = useState('')
  const [form, setForm] = useState(() => scheduleToForm(schedule))

  useEffect(() => {
    setForm(scheduleToForm(schedule))
  }, [schedule])

  const cancelEditing = () => {
    setForm(scheduleToForm(schedule))
    setEditing(false)
    setError('')
  }

  const isActive = asBool(form.is_active)
  const is24Hours = asBool(form.is_24_hours)
  const spansNextDay = asBool(form.spans_next_day)

  const savePayload = async (payload) => {
    try {
      return await onSave({ day_of_week: day, ...payload })
    } catch (err) {
      if (err?.code === 'SCHEDULE_CONFLICTS') {
        const count = Number(err.conflict_count || err.conflicts?.length || 0)
        const sample = (err.conflicts || []).slice(0, 5).map((item) => `${item.appointment_date} ${item.appointment_time} — ${item.patient_name || 'Patient'}`).join('\n')
        const proceed = window.confirm(`${count} active appointment${count === 1 ? '' : 's'} fall outside the new schedule. Existing appointments will NOT be cancelled.\n\n${sample}${count > 5 ? '\n…' : ''}\n\nSave the schedule anyway?`)
        if (!proceed) throw Object.assign(new Error('Schedule change cancelled.'), { code: 'SCHEDULE_CHANGE_CANCELLED' })
        return onSave({ day_of_week: day, ...payload, allow_conflicts: true })
      }
      throw err
    }
  }

  const handleToggle = async () => {
    const previous = form.is_active
    const nextForm = { ...form, is_active: isActive ? 0 : 1 }
    setForm(nextForm); setError('')
    try {
      await savePayload(nextForm)
      onSaved?.()
    } catch (err) {
      setForm((current) => ({ ...current, is_active: previous }))
      if (err?.code !== 'SCHEDULE_CHANGE_CANCELLED') setError(err.message || 'Could not update schedule.')
    }
  }

  const handleSave = async () => {
    setError('')
    const start = form.start_time
    const end = form.end_time
    if (!is24Hours) {
      if (!start || !end) return setError('Start and end time are required.')
      if (!spansNextDay && start >= end) return setError('End time must be later than start time, or enable Ends next day.')
      if (spansNextDay && end > start) return setError('An overnight schedule cannot exceed 24 hours. Use an end time at or before the start time.')
    }
    setSaving(true)
    try {
      const payload = is24Hours
        ? { ...form, start_time: '00:00', end_time: '00:00', spans_next_day: 1, is_24_hours: 1 }
        : { ...form, spans_next_day: spansNextDay ? 1 : 0, is_24_hours: 0 }
      await savePayload(payload)
      setSaved(true); setEditing(false); onSaved?.()
      window.setTimeout(() => setSaved(false), 1800)
    } catch (err) {
      if (err?.code !== 'SCHEDULE_CHANGE_CANCELLED') setError(err.message || 'Failed to save schedule.')
    } finally { setSaving(false) }
  }

  return <div className={`overflow-hidden rounded-2xl border transition-all ${isActive ? `${cfg.border} shadow-sm` : 'border-slate-100'}`}>
    <div className={`px-4 py-3 ${isActive ? cfg.light : 'bg-slate-50'}`}>
      <div className="space-y-3">
        <div className="flex min-w-0 items-center gap-3">
          <div className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-xl text-xs font-black text-white ${isActive ? cfg.color : 'bg-slate-200'}`}>{cfg.abbr}</div>
          <div className="min-w-0"><p className={`text-sm font-bold ${isActive ? 'text-slate-800' : 'text-slate-400'}`}>{day}</p>{isActive && <p className="break-words text-[11px] leading-4 text-slate-500">{scheduleSummary(form)}</p>}</div>
        </div>
        <button type="button" onClick={handleToggle} disabled={saving} className={`flex w-full items-center justify-center rounded-2xl border px-3 py-2 transition-all ${isActive ? `${cfg.border} ${cfg.light} ${cfg.text} shadow-sm` : 'border-slate-200 bg-white text-slate-500 hover:border-slate-300 hover:bg-slate-50'}`}>
          <span className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider">{isActive ? <MdToggleOn className={`text-[28px] ${cfg.text}`} /> : <MdToggleOff className="text-[28px] text-slate-300" />}{isActive ? 'Enabled' : 'Enable'}</span>
        </button>
      </div>
    </div>

    {isActive && <div className="space-y-3 bg-white px-4 py-4">
      {!editing ? <>
        <div className="grid grid-cols-3 gap-2">
          {[{label:'Start',value:is24Hours?'12:00 AM':formatScheduleTime(form.start_time)},{label:'End',value:is24Hours?'Next day':formatScheduleTime(form.end_time)},{label:'Slot',value:`${form.slot_duration_mins}m`}].map(({label,value})=><div key={label} className={`${cfg.light} ${cfg.border} rounded-xl border px-2 py-2.5 text-center`}><p className="mb-0.5 text-xs font-bold uppercase tracking-wider text-slate-400">{label}</p><p className={`text-xs font-black ${cfg.text}`}>{value}</p></div>)}
        </div>
        {spansNextDay && !is24Hours && <p className="rounded-xl bg-indigo-50 px-3 py-2 text-xs font-semibold text-indigo-700">Overnight schedule: the end time is on the following day.</p>}
        {is24Hours && <p className="rounded-xl bg-emerald-50 px-3 py-2 text-xs font-semibold text-emerald-700">Available for the full 24-hour calendar day.</p>}
        <button type="button" onClick={()=>{setEditing(true);setError('')}} className={`flex w-full items-center justify-center gap-1.5 rounded-xl border-2 py-2.5 text-xs font-bold ${cfg.border} ${cfg.light} ${cfg.text}`}><MdEdit/> {schedule ? 'Edit Schedule' : 'Set Schedule'}</button>
      </> : <>
        <label className="flex items-center justify-between gap-3 rounded-xl border border-slate-200 bg-slate-50 px-3 py-3 text-sm font-semibold text-slate-700"><span>Available 24 hours</span><input type="checkbox" checked={is24Hours} onChange={(e)=>setForm((v)=>{const checked=e.target.checked;if(checked)return {...v,is_24_hours:1,spans_next_day:1,start_time:'00:00',end_time:'00:00'};const wasFullDay=v.start_time==='00:00'&&v.end_time==='00:00';return {...v,is_24_hours:0,spans_next_day:wasFullDay?0:v.spans_next_day,start_time:wasFullDay?'08:00':v.start_time,end_time:wasFullDay?'17:00':v.end_time}})}/></label>
        {!is24Hours && <>
          <div className="grid grid-cols-2 gap-3"><div><label className="mb-1 block text-xs font-bold uppercase text-slate-500">Start</label><input type="time" step="60" value={form.start_time} onChange={(e)=>setForm(v=>({...v,start_time:e.target.value}))} className={`w-full rounded-xl border-2 border-slate-200 bg-slate-50 px-3 py-3 text-base font-bold outline-none ${cfg.ring}`}/></div><div><label className="mb-1 block text-xs font-bold uppercase text-slate-500">End</label><input type="time" step="60" value={form.end_time} onChange={(e)=>setForm(v=>({...v,end_time:e.target.value}))} className={`w-full rounded-xl border-2 border-slate-200 bg-slate-50 px-3 py-3 text-base font-bold outline-none ${cfg.ring}`}/></div></div>
          <label className="flex items-center justify-between gap-3 rounded-xl border border-slate-200 bg-white px-3 py-3 text-sm font-semibold text-slate-700"><span><strong>Ends next day</strong><span className="mt-0.5 block text-xs font-normal text-slate-500">Use for overnight availability, e.g. 8:00 PM–2:00 AM.</span></span><input type="checkbox" checked={spansNextDay} onChange={(e)=>setForm(v=>({...v,spans_next_day:e.target.checked?1:0}))}/></label>
        </>}
        <div><label className="mb-1 block text-xs font-bold uppercase text-slate-500">Slot Duration</label><select value={form.slot_duration_mins} onChange={(e)=>setForm(v=>({...v,slot_duration_mins:Number(e.target.value)}))} className={`w-full rounded-xl border-2 border-slate-200 bg-slate-50 px-3 py-2.5 text-sm outline-none ${cfg.ring}`}>{[15,20,30,45,60,90].map(v=><option key={v} value={v}>{v} minutes</option>)}</select></div>
        {error && <p className="rounded-xl bg-red-50 px-3 py-2 text-xs font-semibold text-red-600">{error}</p>}
        <div className="flex gap-2"><button type="button" onClick={cancelEditing} className="flex-1 rounded-xl border border-slate-200 py-2.5 text-xs font-semibold text-slate-600"><span className="flex items-center justify-center gap-1"><MdClose/> Cancel</span></button><button type="button" onClick={handleSave} disabled={saving} className={`flex-1 rounded-xl py-2.5 text-xs font-bold text-white disabled:opacity-50 ${saved?'bg-emerald-500':cfg.color}`}><span className="flex items-center justify-center gap-1.5">{saved?<><MdCheck/> Saved!</>:saving?'Saving...':<><MdSave/> Save</>}</span></button></div>
      </>}
      {!editing && error && <p className="rounded-xl bg-red-50 px-3 py-2 text-xs font-semibold text-red-600">{error}</p>}
    </div>}
    {!isActive && <div className="bg-white px-4 py-3 text-center text-xs text-slate-400">Enable this day to accept bookings.</div>}
  </div>
}

export default ScheduleDayCard

