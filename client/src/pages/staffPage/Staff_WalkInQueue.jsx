import { useCallback, useEffect, useMemo, useState } from 'react'
import Pagination from '../../components/ui/Pagination'
import useClientPagination from '../../hooks/useClientPagination'
import {
  MdAccessTime,
  MdAdd,
  MdCalendarToday,
  MdCheck,
  MdClose,
  MdEmail,
  MdEventAvailable,
  MdMedicalServices,
  MdPerson,
  MdPhone,
  MdPrint,
  MdQueuePlayNext,
  MdRefresh,
  MdSearch,
} from 'react-icons/md'
import {
  addToQueue,
  createWalkInPatient,
  getAppointmentReasons,
  getPatients,
  getQueue,
  getQueuePrecheck,
  getWalkInAvailableDoctors,
  updateQueueStatus,
} from '../../services/staff.service'
import { printWalkInIntakeForm } from '../../utils/printWalkInIntakeForm'
import { getLocalDateOnly } from '../../utils/date'

const maxPatientBirthdate = () => getLocalDateOnly()
const minPatientBirthdate = () => { const d = new Date(); d.setFullYear(d.getFullYear() - 100); return getLocalDateOnly(d) }
const clinicLabel = (value) => value === 'derma' ? 'Dermatology' : 'General Medicine'

const QueueCard = ({ entry, onCall, onReturn, onRemove }) => {
  const active = ['called', 'in_consultation'].includes(entry.status)
  return <div className="rounded-3xl border border-slate-200 bg-white p-4 shadow-sm">
    <div className="mb-3 flex items-start justify-between gap-3"><div><p className="text-base font-bold text-slate-900">{entry.patient_name || entry.patient}</p><p className="text-sm text-slate-500">{entry.doctor_name || entry.doctor}</p></div><span className={`rounded-full px-3 py-1 text-xs font-bold capitalize ${active ? 'bg-sky-50 text-sky-700' : entry.status === 'done' ? 'bg-emerald-50 text-emerald-700' : entry.status === 'removed' ? 'bg-red-50 text-red-600' : 'bg-amber-50 text-amber-700'}`}>{String(entry.status || '').replace('_', ' ')}</span></div>
    <div className="mb-4 text-sm text-slate-600">Queue #{entry.queue_number || entry.queueNo} • {entry.type === 'derma' ? 'Dermatology' : 'General Medicine'}</div>
    {(entry.status === 'waiting' || entry.status === 'called') && <div className="flex gap-2">{entry.status === 'waiting' && <button onClick={() => onCall(entry)} className="flex-1 rounded-2xl bg-sky-600 px-4 py-3 text-sm font-semibold text-white">Call Patient</button>}{entry.status === 'called' && <button onClick={() => onReturn(entry)} className="flex-1 rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm font-semibold text-slate-700">Return to Waiting</button>}<button onClick={() => onRemove(entry)} className="rounded-2xl border border-red-200 px-4 py-3 text-sm font-semibold text-red-600">Remove</button></div>}
    {entry.status === 'called' && <p className="mt-3 rounded-xl bg-sky-50 px-3 py-2 text-xs font-semibold text-sky-700">Patient called{entry.called_at ? ` · ${new Date(entry.called_at).toLocaleTimeString('en-PH', { hour: 'numeric', minute: '2-digit' })}` : ''}. Waiting for the doctor to start consultation.</p>}
    {entry.status === 'in_consultation' && <p className="mt-3 rounded-xl bg-violet-50 px-3 py-2 text-xs font-semibold text-violet-700">In consultation. This entry will complete automatically when the doctor finalizes the visit.</p>}
  </div>
}

const PatientSearch = ({ search, setSearch, results, loading, patient, choosePatient, changePatient, switchToNew }) => {
  if (patient) {
    return <div className="rounded-2xl border border-emerald-200 bg-emerald-50/60 p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div><p className="text-xs font-black uppercase tracking-wider text-emerald-700">Selected Patient</p><p className="mt-1 text-base font-black text-slate-900">{patient.full_name || patient.name}</p><div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-slate-600">{patient.phone && <span><MdPhone className="mr-1 inline" />{patient.phone}</span>}{patient.email && <span><MdEmail className="mr-1 inline" />{patient.email}</span>}{patient.birthdate && <span><MdCalendarToday className="mr-1 inline" />{String(patient.birthdate).slice(0, 10)}</span>}</div></div>
        <button type="button" className="text-sm font-bold text-sky-700" onClick={changePatient}>Change Patient</button>
      </div>
    </div>
  }

  return <div>
    <label className="form-label">Search Existing Patient *</label>
    <div className="relative mt-1.5">
      <MdSearch className="absolute left-4 top-1/2 -translate-y-1/2 text-xl text-slate-400" />
      <input className="form-control pl-12" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search by patient name, mobile number, or email" autoFocus />
      {loading && <div className="absolute right-4 top-1/2 h-4 w-4 -translate-y-1/2 animate-spin rounded-full border-2 border-slate-200 border-t-sky-500" />}
    </div>
    {search.trim().length > 0 && search.trim().length < 2 && <p className="mt-2 text-xs text-slate-400">Type at least 2 characters to search.</p>}
    {search.trim().length >= 2 && !loading && <div className="mt-2 overflow-hidden rounded-2xl border border-slate-200 bg-white">
      {results.length ? results.slice(0, 8).map((row) => <button key={row.id} type="button" onClick={() => choosePatient(row)} className="flex w-full items-start gap-3 border-b border-slate-100 p-3 text-left last:border-b-0 hover:bg-sky-50">
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-sky-100 text-sky-700"><MdPerson /></div>
        <div className="min-w-0"><p className="font-bold text-slate-900">{row.full_name || row.name}</p><div className="mt-1 flex flex-wrap gap-x-3 gap-y-1 text-xs text-slate-500">{row.phone && <span>{row.phone}</span>}{row.email && <span className="truncate">{row.email}</span>}{row.birthdate && <span>DOB {String(row.birthdate).slice(0, 10)}</span>}</div></div>
      </button>) : <div className="p-5 text-center"><p className="font-bold text-slate-700">No matching patient found</p><p className="mt-1 text-xs text-slate-400">Check the spelling or register this person as a new patient.</p><button type="button" onClick={switchToNew} className="button-secondary mt-3"><MdAdd /> Register New Patient</button></div>}
    </div>}
  </div>
}

const DoctorPicker = ({ doctors, loading, error, selectedDoctorId, onSelect, onRefresh }) => {
  const availableCount = doctors.filter((doctor) => doctor.available_now).length
  return <div className="sm:col-span-2">
    <div className="flex items-center justify-between gap-3"><div><span className="form-label">Doctor *</span><p className="mt-1 text-xs text-slate-500">Only doctors who are on duty now and still have an open slot today can be selected.</p></div><button type="button" onClick={onRefresh} className="text-xs font-bold text-sky-700"><MdRefresh className="mr-1 inline" />Refresh</button></div>
    {loading ? <div className="mt-2 rounded-2xl border border-slate-200 bg-slate-50 p-5 text-center text-sm text-slate-500">Checking doctor availability…</div>
      : error ? <div className="mt-2 rounded-2xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-700">{error}</div>
        : doctors.length === 0 ? <div className="mt-2 rounded-2xl border border-dashed border-slate-300 bg-slate-50 p-5 text-center"><p className="font-bold text-slate-700">No doctors are configured for this clinic.</p></div>
          : <div className="mt-2 grid gap-2 sm:grid-cols-2">{doctors.map((doctor) => {
            const selected = Number(selectedDoctorId) === Number(doctor.id)
            return <button key={doctor.id} type="button" disabled={!doctor.available_now} onClick={() => onSelect(String(doctor.id))} className={`rounded-2xl border-2 p-4 text-left transition ${selected ? 'border-sky-400 bg-sky-50' : doctor.available_now ? 'border-slate-200 bg-white hover:border-sky-200 hover:bg-sky-50/40' : 'cursor-not-allowed border-slate-200 bg-slate-50 opacity-65'}`}>
              <div className="flex items-start justify-between gap-2"><div><p className="font-black text-slate-900">{doctor.full_name || doctor.name}</p><p className="mt-0.5 text-xs text-slate-500">{doctor.specialty || 'Doctor'}</p></div><span className={`rounded-full px-2 py-1 text-[10px] font-black ${doctor.available_now ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-200 text-slate-500'}`}>{doctor.available_now ? 'AVAILABLE NOW' : 'UNAVAILABLE'}</span></div>
              {doctor.available_now ? <div className="mt-3 space-y-1 text-xs text-slate-600"><p><MdAccessTime className="mr-1 inline" />{doctor.current_schedule || 'On duty now'}</p><p><MdEventAvailable className="mr-1 inline" />Next open slot: <strong>{doctor.next_available_slot}</strong></p><p>Current walk-in queue: <strong>{doctor.active_queue_count || 0}</strong></p></div> : <p className="mt-3 text-xs font-semibold text-slate-500">{doctor.availability_reason || 'Not currently available.'}</p>}
            </button>
          })}</div>}
    {!loading && !error && doctors.length > 0 && availableCount === 0 && <p className="mt-2 rounded-xl bg-amber-50 px-3 py-2 text-xs font-semibold text-amber-800">No doctor is currently on duty with a remaining open slot for this clinic.</p>}
  </div>
}

const WalkInModal = ({ onClose, onSuccess }) => {
  const [mode, setMode] = useState('existing')
  const [search, setSearch] = useState('')
  const [results, setResults] = useState([])
  const [searchLoading, setSearchLoading] = useState(false)
  const [patient, setPatient] = useState(null)
  const [precheck, setPrecheck] = useState(null)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [reviewing, setReviewing] = useState(false)
  const [reasonOptions, setReasonOptions] = useState([])
  const [loadingReasons, setLoadingReasons] = useState(false)
  const [doctors, setDoctors] = useState([])
  const [loadingDoctors, setLoadingDoctors] = useState(false)
  const [doctorError, setDoctorError] = useState('')
  const [reasonError, setReasonError] = useState('')
  const [form, setForm] = useState({
    full_name: '', phone: '', email: '', birthdate: '', sex: '',
    clinic_type: 'medical', doctor_id: '', reason: '', reason_notes: '',
    consent_given: false, consent_method: 'Signed Intake Form',
  })

  const update = (key, value) => setForm((prev) => ({ ...prev, [key]: value }))

  useEffect(() => {
    if (mode !== 'existing' || patient || search.trim().length < 2) {
      setResults([])
      setSearchLoading(false)
      return undefined
    }

    let cancelled = false
    setSearchLoading(true)
    const timer = setTimeout(async () => {
      try {
        const rows = await getPatients(search)
        if (!cancelled) setResults(Array.isArray(rows) ? rows : [])
      } catch {
        if (!cancelled) setResults([])
      } finally {
        if (!cancelled) setSearchLoading(false)
      }
    }, 250)

    return () => {
      cancelled = true
      clearTimeout(timer)
    }
  }, [mode, patient, search])

  const loadVisitOptions = useCallback(async (clinicType) => {
    setLoadingReasons(true)
    setLoadingDoctors(true)
    setDoctorError('')
    setReasonError('')

    const [reasonResult, doctorResult] = await Promise.allSettled([
      getAppointmentReasons(clinicType),
      getWalkInAvailableDoctors(clinicType),
    ])

    if (reasonResult.status === 'fulfilled') {
      const reasons = Array.isArray(reasonResult.value) ? reasonResult.value : []
      setReasonOptions(reasons)
      setForm((prev) => ({
        ...prev,
        reason: reasons.some((item) => item.label === prev.reason) ? prev.reason : '',
      }))
    } else {
      setReasonOptions([])
      setReasonError(reasonResult.reason?.message || 'Could not load Patient Visit reasons.')
    }

    if (doctorResult.status === 'fulfilled') {
      const doctorRows = Array.isArray(doctorResult.value?.doctors) ? doctorResult.value.doctors : []
      setDoctors(doctorRows)
      setForm((prev) => {
        const selected = doctorRows.find((doctor) => Number(doctor.id) === Number(prev.doctor_id))
        return selected?.available_now ? prev : { ...prev, doctor_id: '' }
      })
    } else {
      setDoctors([])
      setDoctorError(doctorResult.reason?.message || 'Could not load doctor availability.')
      setForm((prev) => ({ ...prev, doctor_id: '' }))
    }

    setLoadingReasons(false)
    setLoadingDoctors(false)
  }, [])

  useEffect(() => { loadVisitOptions(form.clinic_type) }, [form.clinic_type, loadVisitOptions])

  const choosePatient = async (row) => {
    setPatient(row)
    setSearch(row.full_name || row.name || '')
    setResults([])
    setError('')
    setReviewing(false)
    try {
      const check = await getQueuePrecheck(row.id)
      setPrecheck(check)
      if (check?.today_appointment?.clinic_type) {
        setForm((prev) => ({ ...prev, clinic_type: check.today_appointment.clinic_type, doctor_id: '', reason: '' }))
      }
    } catch {
      setPrecheck(null)
    }
  }

  const changePatient = () => {
    setPatient(null); setPrecheck(null); setSearch(''); setResults([]); setReviewing(false); setError('')
  }

  const changeClinic = (clinicType) => {
    setForm((prev) => ({ ...prev, clinic_type: clinicType, doctor_id: '', reason: '' }))
    setReviewing(false)
  }

  const validateWalkIn = () => {
    if (mode === 'existing' && !patient?.id) return 'Select an existing patient first.'
    if (mode === 'new' && (!form.full_name.trim() || !form.phone.trim() || !form.birthdate)) return 'Full name, mobile number, and birthdate are required for a new patient.'
    if (mode === 'new' && !form.consent_given) return 'Confirm that the patient provided data-processing consent.'
    if (!form.reason.trim()) return 'Select a reason for visit.'
    if (!Number(form.doctor_id)) return 'Select an available doctor.'
    return ''
  }

  const openReview = () => {
    const message = validateWalkIn()
    if (message) return setError(message)
    setError('')
    setReviewing(true)
  }

  const submit = async ({ checkIn = false } = {}) => {
    setError('')
    if (mode === 'existing' && !patient?.id) return setError('Select an existing patient first.')
    if (!checkIn) {
      const message = validateWalkIn()
      if (message) { setReviewing(false); return setError(message) }
    }

    setSaving(true)
    try {
      let target = patient
      if (mode === 'new') {
        target = await createWalkInPatient({
          full_name: form.full_name, phone: form.phone, email: form.email, birthdate: form.birthdate,
          sex: form.sex || null, consent_given: true, consent_method: form.consent_method,
        })
      }

      const reason = form.reason === 'Other'
        ? (form.reason_notes.trim() || 'Other concern')
        : `${form.reason}${form.reason_notes.trim() ? ` — ${form.reason_notes.trim()}` : ''}`

      const payload = checkIn && precheck?.today_appointment?.id
        ? {
            patient_id: target.id,
            patient_name: target.full_name || target.name,
            doctor_id: Number(precheck.today_appointment.doctor_id),
            type: precheck.today_appointment.clinic_type,
            reason: precheck.today_appointment.reason || reason || 'Scheduled appointment',
            check_in_appointment_id: precheck.today_appointment.id,
          }
        : {
            patient_id: target.id,
            patient_name: target.full_name || target.name,
            doctor_id: Number(form.doctor_id),
            type: form.clinic_type,
            reason,
            ...(precheck?.today_appointment?.id ? { allow_separate_walkin: true } : {}),
          }

      const queued = await addToQueue(payload)
      const selectedDoctor = doctors.find((doctor) => Number(doctor.id) === Number(queued.doctor_id))
      onSuccess({ ...queued, patient_name: target.full_name || target.name, doctor_name: queued.doctor_name || selectedDoctor?.full_name || precheck?.today_appointment?.doctor_name || 'Assigned doctor' })
    } catch (err) {
      setReviewing(false)
      if (err.code === 'ALREADY_IN_QUEUE' && err.queue_entry) setError(`This patient is already in the active queue (Queue #${err.queue_entry.queue_number}).`)
      else if (err.code === 'TODAY_APPOINTMENT' || err.today_appointment) setPrecheck((prev) => ({ ...(prev || {}), today_appointment: err.today_appointment || err.active_appointment }))
      else setError(err.message || 'Could not add the walk-in visit.')
      loadVisitOptions(form.clinic_type)
    } finally { setSaving(false) }
  }

  const todayAppointment = precheck?.today_appointment
  const upcoming = precheck?.upcoming_appointment
  const patientName = mode === 'existing' ? (patient?.full_name || patient?.name || '') : form.full_name.trim()
  const selectedDoctor = doctors.find((doctor) => Number(doctor.id) === Number(form.doctor_id))
  const reasonLabel = form.reason === 'Other' ? (form.reason_notes.trim() || 'Other concern') : `${form.reason}${form.reason_notes.trim() ? ` — ${form.reason_notes.trim()}` : ''}`

  return <>
    <div className="fixed inset-0 z-40 bg-black/40" onClick={saving ? undefined : onClose} />
    <div className="fixed inset-x-0 bottom-0 z-50 max-h-[94vh] overflow-y-auto rounded-t-3xl bg-white p-5 shadow-2xl sm:left-1/2 sm:top-1/2 sm:bottom-auto sm:w-full sm:max-w-3xl sm:-translate-x-1/2 sm:-translate-y-1/2 sm:rounded-3xl">
      <div className="mb-4 flex items-start justify-between gap-4"><div><h2 className="text-lg font-bold text-slate-900">{reviewing ? 'Review Walk-in Visit' : 'Add Walk-in Visit'}</h2><p className="mt-1 text-sm text-slate-500">{reviewing ? 'Confirm the patient, visit reason, and selected doctor before adding this walk-in to the queue.' : 'Find an existing patient first. Register a new patient only when no matching record exists.'}</p></div><button onClick={onClose} disabled={saving} className="rounded-xl p-2 text-slate-400 hover:bg-slate-100 disabled:opacity-50" aria-label="Close"><MdClose /></button></div>
      {error && <div className="mb-4 rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-medium text-red-700">{error}</div>}

      {reviewing ? <div className="space-y-4">
        <div className="grid gap-3 sm:grid-cols-2"><div className="rounded-2xl bg-slate-50 p-4"><p className="text-xs font-black uppercase text-slate-400">Patient</p><p className="mt-1 font-black text-slate-900">{patientName}</p><p className="mt-1 text-xs text-slate-500">{mode === 'existing' ? 'Existing patient' : 'New patient'}</p></div><div className="rounded-2xl bg-slate-50 p-4"><p className="text-xs font-black uppercase text-slate-400">Clinic</p><p className="mt-1 font-black text-slate-900">{clinicLabel(form.clinic_type)}</p></div><div className="rounded-2xl bg-slate-50 p-4"><p className="text-xs font-black uppercase text-slate-400">Reason for Visit</p><p className="mt-1 font-black text-slate-900">{reasonLabel}</p></div><div className="rounded-2xl bg-emerald-50 p-4"><p className="text-xs font-black uppercase text-emerald-700">Doctor</p><p className="mt-1 font-black text-slate-900">{selectedDoctor?.full_name || selectedDoctor?.name}</p><p className="mt-1 text-xs text-slate-600">Next open slot: {selectedDoctor?.next_available_slot || '—'} · Queue {selectedDoctor?.active_queue_count || 0}</p></div></div>
        {upcoming && <div className="rounded-xl border border-sky-200 bg-sky-50 p-3 text-sm text-sky-800"><strong>Future appointment preserved:</strong> {upcoming.appointment_date} at {upcoming.appointment_time} with {upcoming.doctor_name}.</div>}
        <div className="flex justify-end gap-2"><button className="button-secondary" disabled={saving} onClick={() => setReviewing(false)}>Back</button><button className="button-primary" disabled={saving} onClick={() => submit()}>{saving ? 'Adding…' : 'Add to Walk-in Queue'}</button></div>
      </div> : <>
        <div className="grid grid-cols-2 gap-1 rounded-2xl bg-slate-100 p-1 text-sm font-bold"><button className={`rounded-xl px-3 py-2.5 ${mode === 'existing' ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500'}`} onClick={() => { setMode('existing'); setError('') }}>Existing Patient</button><button className={`rounded-xl px-3 py-2.5 ${mode === 'new' ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500'}`} onClick={() => { setMode('new'); setPatient(null); setPrecheck(null); setError('') }}>New Patient</button></div>

        <div className="mt-5 space-y-5">
          {mode === 'existing' ? <PatientSearch search={search} setSearch={setSearch} results={results} loading={searchLoading} patient={patient} choosePatient={choosePatient} changePatient={changePatient} switchToNew={() => { setMode('new'); setError('') }} /> : <div className="grid gap-4 sm:grid-cols-2"><label><span className="form-label">Full Name *</span><input className="form-control mt-1.5" value={form.full_name} onChange={(e) => update('full_name', e.target.value)} /></label><label><span className="form-label">Mobile Number *</span><input className="form-control mt-1.5" value={form.phone} onChange={(e) => update('phone', e.target.value)} placeholder="09XXXXXXXXX" /></label><label><span className="form-label">Birthdate *</span><input type="date" min={minPatientBirthdate()} max={maxPatientBirthdate()} className="form-control mt-1.5" value={form.birthdate} onChange={(e) => update('birthdate', e.target.value)} /></label><label><span className="form-label">Sex</span><select className="form-control mt-1.5" value={form.sex} onChange={(e) => update('sex', e.target.value)}><option value="">Select</option><option>Male</option><option>Female</option><option>Other</option></select></label><label className="sm:col-span-2"><span className="form-label">Email</span><input type="email" className="form-control mt-1.5" value={form.email} onChange={(e) => update('email', e.target.value)} placeholder="Optional" /></label><label className="sm:col-span-2 flex items-start gap-3 rounded-2xl bg-slate-50 p-4 text-sm text-slate-700"><input type="checkbox" className="mt-1" checked={form.consent_given} onChange={(e) => update('consent_given', e.target.checked)} /><span><strong>Patient privacy consent received *</strong><span className="mt-1 block text-xs text-slate-500">Confirm only after the patient has provided consent using the clinic intake process.</span></span></label></div>}

          {todayAppointment && mode === 'existing' && <div className="rounded-2xl border border-sky-200 bg-sky-50 p-4"><div className="flex items-start justify-between gap-3"><div><p className="text-xs font-black uppercase text-sky-700">Scheduled Appointment Today</p><p className="mt-1 font-black text-slate-900">{todayAppointment.doctor_name} · {todayAppointment.appointment_time}</p><p className="mt-1 text-xs text-slate-600">{clinicLabel(todayAppointment.clinic_type)} · {todayAppointment.reason || 'Appointment'}</p></div><MdEventAvailable className="text-2xl text-sky-600" /></div><button className="button-primary mt-3" disabled={saving} onClick={() => submit({ checkIn: true })}>{saving ? 'Checking in…' : 'Check In for Scheduled Appointment'}</button><p className="mt-2 text-xs text-slate-500">Use the walk-in fields below only if the patient needs a separate visit today.</p></div>}

          <div className="grid gap-4 sm:grid-cols-2">
            <label><span className="form-label">Clinic *</span><select className="form-control mt-1.5" value={form.clinic_type} onChange={(e) => changeClinic(e.target.value)}><option value="medical">General Medicine</option><option value="derma">Dermatology</option></select></label>
            <label><span className="form-label">Reason for Visit *</span><select className="form-control mt-1.5" value={form.reason} disabled={loadingReasons || Boolean(reasonError) || reasonOptions.length === 0} onChange={(e) => update('reason', e.target.value)}><option value="">{loadingReasons ? 'Loading reasons…' : reasonError ? 'Could not load reasons' : reasonOptions.length ? 'Select reason' : 'No reasons configured'}</option>{reasonOptions.map((reason) => <option key={reason.id} value={reason.label}>{reason.label}</option>)}</select>{reasonError ? <p className="mt-1 text-xs font-semibold text-rose-700">{reasonError} <button type="button" className="font-black underline" onClick={() => loadVisitOptions(form.clinic_type)}>Try again</button></p> : !loadingReasons && reasonOptions.length === 0 && <p className="mt-1 text-xs font-semibold text-amber-700">No active Patient Visit reasons are configured for {clinicLabel(form.clinic_type)}. Ask Admin to update System Setup → Patient Visits.</p>}</label>
            <label className="sm:col-span-2"><span className="form-label">Additional Notes</span><input className="form-control mt-1.5" value={form.reason_notes} onChange={(e) => update('reason_notes', e.target.value)} placeholder="Optional symptoms, context, or patient preference" /></label>
            <DoctorPicker doctors={doctors} loading={loadingDoctors} error={doctorError} selectedDoctorId={form.doctor_id} onSelect={(id) => update('doctor_id', id)} onRefresh={() => loadVisitOptions(form.clinic_type)} />
          </div>
        </div>

        <div className="mt-6 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end"><button onClick={onClose} className="button-secondary" disabled={saving}>Cancel</button><button onClick={openReview} disabled={saving || loadingDoctors || loadingReasons || Boolean(doctorError) || Boolean(reasonError)} className="button-primary">Review Walk-in</button></div>
      </>}
    </div>
  </>
}

const SuccessModal = ({ entry, onClose }) => <><div className="fixed inset-0 z-40 bg-black/40" /><div className="fixed left-1/2 top-1/2 z-50 w-[calc(100%-2rem)] max-w-md -translate-x-1/2 -translate-y-1/2 rounded-3xl bg-white p-6 text-center shadow-2xl"><div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-emerald-50 text-2xl text-emerald-600"><MdCheck /></div><h2 className="mt-4 text-xl font-bold text-slate-900">Added to Walk-in Queue</h2><p className="mt-1 text-sm text-slate-500">{entry.patient_name}</p><div className="mt-5 rounded-2xl bg-slate-50 p-5"><p className="text-xs font-bold uppercase tracking-wider text-slate-400">Queue Position</p><p className="mt-1 text-4xl font-black text-slate-900">#{entry.queue_number}</p><p className="mt-2 text-sm text-slate-600">{entry.doctor_name}</p></div><button onClick={onClose} className="button-primary mt-5 w-full">Done</button></div></>

const StaffWalkInQueue = () => {
  const [queue, setQueue] = useState([])
  const [loading, setLoading] = useState(true)
  const [showModal, setShowModal] = useState(false)
  const [success, setSuccess] = useState(null)
  const today = getLocalDateOnly()
  const loadData = useCallback(async () => { setLoading(true); try { const q = await getQueue(today); setQueue(Array.isArray(q) ? q : []) } finally { setLoading(false) } }, [today])
  useEffect(() => { loadData() }, [loadData])
  useEffect(() => { const fn = () => loadData(); window.addEventListener('clinic:refresh', fn); return () => window.removeEventListener('clinic:refresh', fn) }, [loadData])
  const onSuccess = async (entry) => { setShowModal(false); setSuccess(entry); await loadData() }
  const call = async (entry) => { await updateQueueStatus(entry.id, 'called'); await loadData() }
  const returnToWaiting = async (entry) => { await updateQueueStatus(entry.id, 'waiting'); await loadData() }
  const remove = async (entry) => { if (!window.confirm('Remove this patient from the queue?')) return; await updateQueueStatus(entry.id, 'removed'); await loadData() }
  const active = queue.filter((item) => ['waiting', 'called', 'in_consultation'].includes(item.status))
  const completed = queue.filter((item) => ['done', 'removed'].includes(item.status))
  const activePg = useClientPagination(active, { initialPageSize: 6 })
  const donePg = useClientPagination(completed, { initialPageSize: 6 })

  return <div className="mx-auto w-full max-w-7xl space-y-5"><div className="flex flex-wrap items-start justify-between gap-4"><div><h1 className="flex items-center gap-2 text-2xl font-bold text-slate-900"><MdQueuePlayNext className="text-sky-500" /> Walk-in Queue</h1><p className="mt-1 text-sm text-slate-500">Find an existing patient, choose the visit reason, select a currently available doctor, and manage today&apos;s queues.</p></div><div className="flex flex-wrap gap-2"><button onClick={printWalkInIntakeForm} className="button-secondary"><MdPrint /> Print Intake Form</button><button onClick={loadData} className="button-secondary"><MdRefresh /> Refresh</button><button onClick={() => setShowModal(true)} className="button-primary"><MdAdd /> Add Walk-in Visit</button></div></div>
    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">{[['Waiting', active.filter((i) => i.status === 'waiting').length, 'bg-amber-50 text-amber-700'], ['Called', active.filter((i) => i.status === 'called').length, 'bg-sky-50 text-sky-700'], ['In Consultation', active.filter((i) => i.status === 'in_consultation').length, 'bg-violet-50 text-violet-700'], ['Completed', completed.filter((i) => i.status === 'done').length, 'bg-emerald-50 text-emerald-700']].map(([label, value, tone]) => <div key={label} className={`rounded-3xl border border-slate-200 p-5 ${tone}`}><p className="text-3xl font-black">{value}</p><p className="mt-1 text-sm font-semibold">{label}</p></div>)}</div>
    {loading ? <div className="flex h-64 items-center justify-center rounded-3xl border bg-white"><div className="h-8 w-8 animate-spin rounded-full border-4 border-slate-200 border-t-sky-500" /></div> : <><section className="space-y-3"><div className="flex items-center gap-2 text-xs font-bold uppercase tracking-widest text-slate-400"><MdMedicalServices /> Active Queue</div><div className="grid gap-4 lg:grid-cols-2">{active.length ? activePg.pageItems.map((entry) => <QueueCard key={entry.id} entry={entry} onCall={call} onReturn={returnToWaiting} onRemove={remove} />) : <div className="rounded-3xl border bg-white p-8 text-center text-sm text-slate-400">No active walk-ins yet.</div>}</div>{active.length > 0 && <Pagination {...activePg} total={active.length} pageSizeOptions={[6, 12, 24]} />}</section><section className="space-y-3"><div className="flex items-center gap-2 text-xs font-bold uppercase tracking-widest text-slate-400"><MdCheck /> Completed / Removed</div><div className="grid gap-4 lg:grid-cols-2">{completed.length ? donePg.pageItems.map((entry) => <div key={entry.id} className="rounded-3xl border bg-white p-4 shadow-sm"><div className="flex justify-between gap-3"><div><p className="font-bold text-slate-900">{entry.patient_name}</p><p className="text-sm text-slate-500">{entry.doctor_name}</p></div><span className="text-xs font-bold capitalize text-slate-500">{entry.status}</span></div><p className="mt-2 text-sm text-slate-500">Queue #{entry.queue_number} • {entry.type}</p></div>) : <div className="rounded-3xl border bg-white p-8 text-center text-sm text-slate-400">No completed entries yet.</div>}</div>{completed.length > 0 && <Pagination {...donePg} total={completed.length} pageSizeOptions={[6, 12, 24]} />}</section></>}
    {showModal && <WalkInModal onClose={() => setShowModal(false)} onSuccess={onSuccess} />}
    {success && <SuccessModal entry={success} onClose={() => setSuccess(null)} />}
  </div>
}

export default StaffWalkInQueue

