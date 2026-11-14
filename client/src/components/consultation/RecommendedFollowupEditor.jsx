import { getClinicToday } from '../../utils/patientBirthdate.mjs'

export default function RecommendedFollowupEditor({ value, onChange, disabled = false }) {
  const active = value?.status !== 'removed' && Boolean(value)
  return <section className="rounded-2xl border border-slate-200 bg-white p-5" aria-label="Recommended Follow-Up">
    <div className="flex flex-wrap items-center justify-between gap-3"><h2 className="font-bold">Recommended Follow-Up</h2>
      <button type="button" disabled={disabled} className="button-secondary" onClick={() => onChange(active ? null : { return_date:'', doctor_note:'' })}>{active ? 'Remove Recommendation' : 'Add Recommended Follow-Up'}</button></div>
    <p className="mt-2 text-sm text-slate-500">An optional recommendation. This does not book an appointment or reserve availability.</p>
    {active && <div className="mt-4 space-y-4"><label className="block"><span className="form-label">Recommended Return Date</span><input className="form-control mt-1" type="date" required disabled={disabled} min={value.return_date && value.return_date < getClinicToday() ? value.return_date : getClinicToday()} value={value.return_date || ''} onChange={e => onChange({ ...value, return_date:e.target.value })}/></label>
      <label className="block"><span className="form-label">Doctor’s Note</span><textarea className="form-control mt-1" rows={3} maxLength={2000} disabled={disabled} value={value.doctor_note || ''} onChange={e => onChange({ ...value, doctor_note:e.target.value })}/></label></div>}
  </section>
}
