import { useId, useState } from 'react'
import { getClinicToday } from '../../utils/patientBirthdate.mjs'
import { adjacentMonth, followupDates, monthDays } from '../../utils/followupCalendar.mjs'

const displayDate = date => new Date(`${date}T12:00:00`).toLocaleDateString('en-PH', { month: 'long', day: 'numeric', year: 'numeric' })

export default function RecommendedFollowupEditor({ value, onChange, disabled = false }) {
  const dates = followupDates(value)
  const today = getClinicToday()
  const [month, setMonth] = useState(() => (dates[0]?.return_date || today).slice(0, 7))
  const [focusedDate, setFocusedDate] = useState(null)
  const noteId = useId()
  const active = Boolean(value) && value.status !== 'removed'
  const selected = dates.find(date => date.return_date === focusedDate) || dates[0]
  const updateDates = next => onChange(next.length ? { ...value, status: 'active', dates: next.sort((a, b) => a.return_date.localeCompare(b.return_date)) } : null)
  const selectDate = date => {
    if (!dates.some(entry => entry.return_date === date)) updateDates([...dates, { return_date: date, doctor_note: '' }])
    setFocusedDate(date)
  }
  return <section className="rounded-2xl border border-slate-200 bg-white p-4 sm:p-5" aria-label="Recommended Follow-Up">
    <div className="flex flex-wrap items-center justify-between gap-3">
      <h2 className="font-bold text-slate-900">Recommended Follow-Up</h2>
      <button type="button" disabled={disabled} className="button-secondary" onClick={() => onChange(active ? null : { dates: [] })}>{active ? 'Remove Recommendation' : 'Add Recommended Follow-Up'}</button>
    </div>
    <p className="mt-2 text-sm text-slate-500">Select one or more return dates and add a note for each. These recommendations do not book appointments or reserve availability.</p>
    {active && <>
      <div className="mt-5 grid gap-4 lg:grid-cols-[minmax(0,1.6fr)_minmax(240px,1fr)]">
        <div className="min-w-0 rounded-2xl border border-slate-200 p-3 sm:p-4">
          <div className="mb-4 flex items-center justify-between gap-2">
            <button type="button" aria-label="Previous month" disabled={disabled} onClick={() => setMonth(adjacentMonth(month, -1))} className="flex h-9 w-9 items-center justify-center rounded-lg bg-slate-100 text-slate-700 hover:bg-slate-200">◀</button>
            <h3 aria-live="polite" className="text-sm font-bold sm:text-base">{new Date(`${month}-01T12:00:00`).toLocaleDateString('en-PH', { month: 'long', year: 'numeric' })}</h3>
            <button type="button" aria-label="Next month" disabled={disabled} onClick={() => setMonth(adjacentMonth(month, 1))} className="flex h-9 w-9 items-center justify-center rounded-lg bg-slate-100 text-slate-700 hover:bg-slate-200">▶</button>
          </div>
          <div className="grid grid-cols-7 gap-1 sm:gap-2" role="group" aria-label="Follow-up calendar">
            {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map(day => <span key={day} className="pb-1 text-center text-[10px] font-semibold text-slate-500 sm:text-xs">{day}</span>)}
            {monthDays(month).map((date, index) => {
              if (!date) return <span key={`empty-${index}`} />
              const chosen = dates.some(entry => entry.return_date === date)
              const past = date < today && !chosen
              return <button key={date} type="button" aria-label={displayDate(date)} aria-pressed={chosen} aria-current={date === today ? 'date' : undefined} disabled={disabled || past || (!chosen && dates.length >= 60)} onClick={() => selectDate(date)} className={`relative flex min-h-10 items-center justify-center rounded-lg border text-xs transition-colors sm:min-h-14 sm:text-sm ${chosen ? 'border-emerald-600 bg-emerald-600 font-bold text-white' : past ? 'border-slate-100 bg-slate-50 text-slate-300' : 'border-emerald-200 bg-emerald-50 text-slate-800 hover:border-emerald-500 hover:bg-emerald-100'} ${selected?.return_date === date ? 'ring-2 ring-emerald-600 ring-offset-2' : ''}`}>
                {Number(date.slice(-2))}{chosen && <span aria-hidden="true" className="absolute right-1 top-0.5 text-[9px]">✓</span>}
              </button>
            })}
          </div>
        </div>
        <aside className="min-w-0 rounded-2xl border border-slate-200 p-4" aria-label="Date Details">
          <h3 className="font-bold text-slate-900">Date Details</h3>
          {selected ? <div className="mt-4 space-y-4">
            <p className="text-sm font-semibold text-emerald-800">{displayDate(selected.return_date)}</p>
            <label htmlFor={noteId} className="block text-sm font-semibold text-slate-700">Doctor’s Note</label>
            <textarea id={noteId} className="form-control w-full resize-y" rows={5} maxLength={2000} disabled={disabled} placeholder="Notes or instructions for this follow-up…" value={selected.doctor_note} onChange={event => updateDates(dates.map(date => date.return_date === selected.return_date ? { ...date, doctor_note: event.target.value } : date))} />
            <button type="button" disabled={disabled} className="min-h-10 text-sm font-semibold text-rose-700 underline" onClick={() => { updateDates(dates.filter(date => date.return_date !== selected.return_date)); setFocusedDate(null) }}>Remove This Date</button>
          </div> : <p className="mt-4 text-sm text-slate-500">Select a date from the calendar to add follow-up notes.</p>}
        </aside>
      </div>
      <div className="mt-4" aria-label="Selected follow-up dates">
        <p className="text-xs font-semibold text-slate-600">{dates.length} follow-up date{dates.length === 1 ? '' : 's'} selected</p>
        <div className="mt-2 flex flex-wrap gap-2">{dates.map(date => <button key={date.return_date} type="button" disabled={disabled} onClick={() => { setFocusedDate(date.return_date); setMonth(date.return_date.slice(0, 7)) }} className={`rounded-lg border px-3 py-2 text-xs font-semibold ${selected?.return_date === date.return_date ? 'border-emerald-600 bg-emerald-50 text-emerald-800' : 'border-slate-200 text-slate-600'}`}>{displayDate(date.return_date)}{date.doctor_note ? ' · Note added' : ''}</button>)}</div>
      </div>
    </>}
  </section>
}
