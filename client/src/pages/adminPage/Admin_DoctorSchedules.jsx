import { useEffect, useState } from 'react'
import {
  deleteDoctorUnavailableDate,
  getDoctors,
  getDoctorSchedules,
  getDoctorUnavailableDates,
  saveDaySchedule,
  saveDoctorUnavailableDate,
} from '../../services/admin.service'
import {
  MdCalendarToday, MdFace, MdMedicalServices,
  MdExpandMore, MdSchedule, MdEventBusy, MdSearch, MdWarningAmber,
} from 'react-icons/md'
import { formatDateOnly, getLocalDateOnly } from '../../utils/date'
import ScheduleDayCard from '../../components/schedule/ScheduleDayCard'

const isDermaDoctor = (doctor) => (doctor?.clinic_type || doctor?.type || (String(doctor?.specialty || '').toLowerCase().includes('derm') ? 'derma' : 'medical')) === 'derma'

const DAYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday']


const UnavailableDatesPanel = ({ doctorId, dates, onSaved }) => {
  const [form, setForm] = useState({ unavailable_date: '', reason: '' })
  const [saving, setSaving] = useState(false)
  const [removingDate, setRemovingDate] = useState('')
  const [conflict, setConflict] = useState(null)
  const [cancellationMessage, setCancellationMessage] = useState('')

  const handleSave = async () => {
    if (!doctorId || !form.unavailable_date) return
    setSaving(true)
    try {
      await saveDoctorUnavailableDate(doctorId, form)
      setForm({ unavailable_date: '', reason: '' })
      onSaved()
    } catch (err) {
      if (err.code === 'ACTIVE_APPOINTMENTS_ON_UNAVAILABLE_DATE') {
        setConflict({ date: form.unavailable_date, reason: form.reason, appointments: err.appointments || [] })
        setCancellationMessage(`Dr. ${err.doctor_name || 'the doctor'} will be unavailable on this date. Please contact the clinic if you need help rescheduling.`)
      } else alert(err.message || 'Failed to save unavailable date.')
    } finally {
      setSaving(false)
    }
  }

  const confirmBlockAndCancel = async () => {
    if (!conflict || !cancellationMessage.trim()) return
    setSaving(true)
    try {
      await saveDoctorUnavailableDate(doctorId, {
        unavailable_date: conflict.date,
        reason: conflict.reason,
        cancel_conflicts: true,
        cancellation_message: cancellationMessage.trim(),
      })
      setConflict(null); setCancellationMessage(''); setForm({ unavailable_date: '', reason: '' }); onSaved()
    } catch (err) { alert(err.message || 'Failed to block date and notify patients.') }
    finally { setSaving(false) }
  }

  const handleRemove = async (date) => {
    if (!doctorId) return
    setRemovingDate(date)
    try {
      await deleteDoctorUnavailableDate(doctorId, date)
      onSaved()
    } catch (err) {
      alert(err.message || 'Failed to remove unavailable date.')
    } finally {
      setRemovingDate('')
    }
  }

  return (
    <div className="rounded-2xl border border-rose-200 bg-white p-5 shadow-sm">
      <div className="flex items-start gap-3">
        <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-rose-50">
          <MdEventBusy className="text-[18px] text-rose-500" />
        </div>
        <div className="flex-1">
          <h2 className="text-sm font-bold text-slate-800">Specific Date Unavailable</h2>
          <p className="mt-1 text-xs text-slate-500">
            Use this when the doctor is normally available on that weekday, but needs one exact date blocked off.
          </p>
        </div>
      </div>

      <div className="mt-4 grid gap-3 sm:grid-cols-[1fr_1.2fr_auto]">
        <input
          type="date"
          min={getLocalDateOnly()}
          value={form.unavailable_date}
          onChange={(e) => setForm((current) => ({ ...current, unavailable_date: e.target.value }))}
          className="rounded-2xl border-2 border-slate-200 bg-slate-50 px-4 py-3 text-sm outline-none transition-all focus:border-rose-300"
        />
        <input
          type="text"
          value={form.reason}
          onChange={(e) => setForm((current) => ({ ...current, reason: e.target.value }))}
          placeholder="Reason (optional)"
          className="rounded-2xl border-2 border-slate-200 bg-slate-50 px-4 py-3 text-sm outline-none transition-all focus:border-rose-300"
        />
        <button
          type="button"
          onClick={handleSave}
          disabled={!form.unavailable_date || saving}
          className="rounded-2xl bg-rose-500 px-5 py-3 text-sm font-bold text-white transition-colors hover:bg-rose-600 disabled:opacity-50"
        >
          {saving ? 'Saving...' : 'Block Date'}
        </button>
      </div>

      {conflict && (
        <div className="mt-4 rounded-2xl border border-amber-200 bg-amber-50 p-4">
          <div className="flex items-start gap-3"><MdWarningAmber className="mt-0.5 text-xl text-amber-600"/><div className="flex-1"><p className="font-bold text-amber-900">Appointments scheduled on this date</p><p className="mt-1 text-xs text-amber-800">{conflict.appointments.length} pending/confirmed appointment{conflict.appointments.length===1?'':'s'} must be cancelled or rescheduled before the date is blocked.</p></div></div>
          <div className="mt-3 max-h-40 space-y-2 overflow-y-auto">{conflict.appointments.map((a)=><div key={a.id} className="rounded-xl border border-amber-200 bg-white px-3 py-2 text-xs"><span className="font-bold text-slate-800">{a.appointment_time}</span> · {a.patient_name} · <span className="capitalize">{a.status}</span></div>)}</div>
          <label className="mt-4 block"><span className="form-label">Cancellation Message *</span><textarea rows={3} value={cancellationMessage} onChange={(e)=>setCancellationMessage(e.target.value)} className="form-control mt-1.5" placeholder="Message sent by email and SMS"/></label>
          <div className="mt-3 flex justify-end gap-2"><button className="button-secondary" onClick={()=>setConflict(null)}>Go Back</button><button className="button-danger" disabled={saving||!cancellationMessage.trim()} onClick={confirmBlockAndCancel}>Cancel Appointments, Notify & Block Date</button></div>
        </div>
      )}

      <div className="mt-4 space-y-2">
        {dates.length === 0 ? (
          <p className="rounded-2xl border border-dashed border-slate-200 bg-slate-50 px-4 py-4 text-sm text-slate-400">
            No specific blocked dates yet.
          </p>
        ) : dates.map((item) => (
          <div key={item.unavailable_date} className="flex items-center justify-between gap-3 rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3">
            <div>
              <p className="text-sm font-semibold text-slate-800">{formatDateOnly(item.unavailable_date)}</p>
              <p className="text-[11px] text-slate-400">{item.unavailable_date}</p>
              <p className="text-xs text-slate-500">{item.reason || 'No reason added.'}</p>
            </div>
            <button
              type="button"
              onClick={() => handleRemove(item.unavailable_date)}
              disabled={removingDate === item.unavailable_date}
              className="rounded-xl border border-rose-200 px-3 py-2 text-xs font-bold text-rose-600 hover:bg-rose-50 disabled:opacity-50"
            >
              {removingDate === item.unavailable_date ? 'Removing...' : 'Remove'}
            </button>
          </div>
        ))}
      </div>
    </div>
  )
}

const Admin_DoctorSchedules = () => {
  const [doctors, setDoctors] = useState([])
  const [selected, setSelected] = useState(null)
  const [schedules, setSchedules] = useState([])
  const [unavailableDates, setUnavailableDates] = useState([])
  const [loading, setLoading] = useState(true)
  const [schedLoading, setSchedLoading] = useState(false)
  const [showPicker, setShowPicker] = useState(false)
  const [doctorSearch, setDoctorSearch] = useState('')

  useEffect(() => {
    getDoctors()
      .then((data) => setDoctors(Array.isArray(data) ? data : []))
      .catch((err) => console.error(err))
      .finally(() => setLoading(false))
  }, [])

  const loadScheduleData = async (doctor) => {
    setSelected(doctor)
    setShowPicker(false)
    setSchedLoading(true)
    try {
      const [scheduleRows, unavailableRows] = await Promise.all([
        getDoctorSchedules(doctor.id),
        getDoctorUnavailableDates(doctor.id),
      ])
      setSchedules(Array.isArray(scheduleRows) ? scheduleRows : [])
      setUnavailableDates(Array.isArray(unavailableRows) ? unavailableRows : [])
    } catch {
      setSchedules([])
      setUnavailableDates([])
    } finally {
      setSchedLoading(false)
    }
  }

  const getForDay = (day) => schedules.find((schedule) => schedule.day_of_week === day)
  const activeDays = DAYS.filter((day) => getForDay(day)?.is_active)
  const inactiveDays = DAYS.filter((day) => !getForDay(day)?.is_active)
  const filteredDoctors = doctors.filter((doctor) => { const q=doctorSearch.trim().toLowerCase(); return !q || String(doctor.full_name||doctor.name||'').toLowerCase().includes(q) || String(doctor.specialty||'').toLowerCase().includes(q) })

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
        <p className="mt-0.5 text-xs text-slate-500 lg:text-sm">Manage weekly availability and specific blocked dates per doctor.</p>
      </div>

      <div className="space-y-3 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <div><p className="text-xs font-bold uppercase tracking-widest text-slate-500">Search Doctor</p><div className="relative mt-2"><input value={doctorSearch} onChange={(e)=>setDoctorSearch(e.target.value)} placeholder="Search by name or specialty..." className="form-control pl-9"/></div></div>
        <p className="text-xs font-bold uppercase tracking-widest text-slate-500">Select Doctor</p>

        <div className="relative sm:hidden">
          <button
            type="button"
            onClick={() => setShowPicker((current) => !current)}
            className="flex w-full items-center justify-between gap-3 rounded-xl border-2 border-slate-200 bg-slate-50 px-4 py-3 text-sm font-bold text-slate-800"
          >
            {selected ? (
              <span className="flex items-center gap-2">
                {isDermaDoctor(selected)
                  ? <MdFace className="text-[16px] text-emerald-600" />
                  : <MdMedicalServices className="text-[16px] text-slate-500" />}
                {selected.full_name || selected.name}
              </span>
            ) : 'Choose a doctor...'}
            <MdExpandMore className={`text-[18px] text-slate-400 transition-transform ${showPicker ? 'rotate-180' : ''}`} />
          </button>
          {showPicker && (
            <div className="absolute left-0 right-0 top-full z-20 mt-1 overflow-hidden rounded-xl border border-slate-200 bg-white shadow-xl">
              {filteredDoctors.map((doctor) => (
                <button
                  key={doctor.id}
                  type="button"
                  onClick={() => loadScheduleData(doctor)}
                  className={`flex w-full items-center gap-3 px-4 py-3 text-left text-sm transition-colors hover:bg-slate-50 ${
                    selected?.id === doctor.id ? 'bg-amber-50 font-bold text-amber-700' : 'text-slate-700'
                  }`}
                >
                  {isDermaDoctor(doctor)
                    ? <MdFace className="text-[15px] text-emerald-600" />
                    : <MdMedicalServices className="text-[15px] text-slate-400" />}
                  {doctor.full_name || doctor.name}
                </button>
              ))}
            </div>
          )}
        </div>

        <div className="hidden flex-wrap gap-2 sm:flex">
          {filteredDoctors.map((doctor) => {
            const isDerma = isDermaDoctor(doctor)
            const chosen = selected?.id === doctor.id
            const Icon = isDerma ? MdFace : MdMedicalServices
            return (
              <button
                key={doctor.id}
                type="button"
                onClick={() => loadScheduleData(doctor)}
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
          <div className={`flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl ${isDermaDoctor(selected) ? 'bg-emerald-50' : 'bg-slate-100'}`}>
            {isDermaDoctor(selected)
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
              <div>
                <p className="text-2xl font-black text-rose-500">{unavailableDates.length}</p>
                <p className="text-[10px] font-medium text-slate-400">Blocked dates</p>
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
              <ScheduleDayCard
                key={day}
                day={day}
                schedule={getForDay(day)}
                onSave={(payload) => saveDaySchedule(selected.id, payload)}
                onSaved={() => loadScheduleData(selected)}
              />
            ))}
          </div>
        )
      )}

      {selected && !schedLoading && (
        <UnavailableDatesPanel
          doctorId={selected.id}
          dates={unavailableDates}
          onSaved={() => loadScheduleData(selected)}
        />
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

