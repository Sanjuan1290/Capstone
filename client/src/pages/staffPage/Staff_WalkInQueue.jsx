import { useCallback, useEffect, useMemo, useState } from 'react'
import Pagination from '../../components/ui/Pagination'
import useClientPagination from '../../hooks/useClientPagination'
import { MdAdd, MdCheck, MdClose, MdMedicalServices, MdPrint, MdQueuePlayNext, MdRefresh, MdPersonSearch, MdEventAvailable } from 'react-icons/md'
import { addToQueue, createWalkInPatient, getPatients, getDoctors, getQueue, getQueuePrecheck, updateQueueStatus } from '../../services/staff.service'
import { printWalkInIntakeForm } from '../../utils/printWalkInIntakeForm'

const REASONS = ['General Consultation', 'Follow-up', 'Skin Concern', 'Rash / Allergy', 'Medication Concern', 'Vaccination', 'Animal Bite', 'Other']

const QueueCard = ({ entry, onCall, onDone, onRemove }) => {
  const active = entry.status === 'in-progress'
  return <div className="rounded-3xl border border-slate-200 bg-white p-4 shadow-sm">
    <div className="mb-3 flex items-start justify-between gap-3"><div><p className="text-base font-bold text-slate-900">{entry.patient_name || entry.patient}</p><p className="text-sm text-slate-500">{entry.doctor_name || entry.doctor}</p></div><span className={`rounded-full px-3 py-1 text-xs font-bold capitalize ${active ? 'bg-sky-50 text-sky-700' : entry.status === 'done' ? 'bg-emerald-50 text-emerald-700' : entry.status === 'removed' ? 'bg-red-50 text-red-600' : 'bg-amber-50 text-amber-700'}`}>{entry.status}</span></div>
    <div className="mb-4 text-sm text-slate-600">Queue #{entry.queue_number || entry.queueNo} • {entry.type === 'derma' ? 'Dermatology' : 'General Medicine'}</div>
    {(entry.status === 'waiting' || entry.status === 'in-progress') && <div className="flex gap-2">{entry.status === 'waiting' && <button onClick={() => onCall(entry)} className="flex-1 rounded-2xl bg-sky-600 px-4 py-3 text-sm font-semibold text-white">Call Patient</button>}{entry.status === 'in-progress' && <button onClick={() => onDone(entry)} className="flex-1 rounded-2xl bg-emerald-600 px-4 py-3 text-sm font-semibold text-white">Mark Done</button>}<button onClick={() => onRemove(entry)} className="rounded-2xl border border-red-200 px-4 py-3 text-sm font-semibold text-red-600">Remove</button></div>}
  </div>
}

const WalkInModal = ({ doctors, onClose, onSuccess }) => {
  const [mode, setMode] = useState('existing')
  const [search, setSearch] = useState('')
  const [results, setResults] = useState([])
  const [patient, setPatient] = useState(null)
  const [precheck, setPrecheck] = useState(null)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [reviewing, setReviewing] = useState(false)
  const [form, setForm] = useState({
    full_name: '',
    phone: '',
    email: '',
    birthdate: '',
    sex: '',
    clinic_type: 'medical',
    doctor_id: 'first_available',
    reason: 'General Consultation',
    reason_notes: '',
    consent_given: false,
    consent_method: 'Signed Intake Form',
  })

  const update = (key, value) => setForm((prev) => ({ ...prev, [key]: value }))

  useEffect(() => {
    if (mode !== 'existing' || patient || search.trim().length < 2) {
      setResults([])
      return
    }
    const timer = setTimeout(() => {
      getPatients(search)
        .then((rows) => setResults(Array.isArray(rows) ? rows : []))
        .catch(() => setResults([]))
    }, 250)
    return () => clearTimeout(timer)
  }, [mode, patient, search])

  const choosePatient = async (row) => {
    setPatient(row)
    setSearch(row.full_name || row.name || '')
    setResults([])
    setError('')
    setReviewing(false)
    try {
      setPrecheck(await getQueuePrecheck(row.id))
    } catch {
      setPrecheck(null)
    }
  }

  const changePatient = () => {
    setPatient(null)
    setPrecheck(null)
    setSearch('')
    setResults([])
    setReviewing(false)
  }

  const filteredDoctors = useMemo(() => doctors.filter((doctor) => {
    const specialty = String(doctor.specialty || '').toLowerCase()
    return form.clinic_type === 'derma' ? specialty.includes('derm') : !specialty.includes('derm')
  }), [doctors, form.clinic_type])

  const validate = () => {
    if (mode === 'existing' && !patient?.id) return 'Select an existing patient first.'
    if (mode === 'new' && (!form.full_name.trim() || !form.phone.trim() || !form.birthdate)) {
      return 'Full name, mobile number, and birthdate are required for a new patient.'
    }
    if (mode === 'new' && !form.consent_given) return 'Confirm that the patient provided data-processing consent.'
    if (!form.reason.trim()) return 'Select a reason for visit.'
    return ''
  }

  const openReview = () => {
    const message = validate()
    if (message) {
      setError(message)
      return
    }
    setError('')
    setReviewing(true)
  }

  const submit = async ({ checkIn = false } = {}) => {
    setError('')
    const message = validate()
    if (message) {
      setReviewing(false)
      setError(message)
      return
    }

    setSaving(true)
    try {
      let target = patient
      if (mode === 'new') {
        target = await createWalkInPatient({
          full_name: form.full_name,
          phone: form.phone,
          email: form.email,
          birthdate: form.birthdate,
          sex: form.sex || null,
          consent_given: true,
          consent_method: form.consent_method,
        })
      }

      const reason = form.reason === 'Other'
        ? (form.reason_notes.trim() || 'Other concern')
        : `${form.reason}${form.reason_notes.trim() ? ` — ${form.reason_notes.trim()}` : ''}`

      const payload = {
        patient_id: target.id,
        patient_name: target.full_name || target.name,
        doctor_id: form.doctor_id === 'first_available' ? 'first_available' : Number(form.doctor_id),
        type: form.clinic_type,
        reason,
      }

      if (checkIn && precheck?.today_appointment?.id) payload.check_in_appointment_id = precheck.today_appointment.id
      if (!checkIn && precheck?.today_appointment?.id) payload.allow_separate_walkin = true

      const queued = await addToQueue(payload)
      onSuccess({
        ...queued,
        patient_name: target.full_name || target.name,
        doctor_name: queued.doctor_name
          || filteredDoctors.find((doctor) => Number(doctor.id) === Number(queued.doctor_id))?.full_name
          || 'Assigned doctor',
      })
    } catch (err) {
      setReviewing(false)
      if (err.code === 'ALREADY_IN_QUEUE' && err.queue_entry) {
        setError(`This patient is already in the active queue (Queue #${err.queue_entry.queue_number}).`)
      } else if (err.code === 'TODAY_APPOINTMENT' || err.today_appointment) {
        setPrecheck((prev) => ({
          ...(prev || {}),
          today_appointment: err.today_appointment || err.active_appointment,
        }))
      } else {
        setError(err.message || 'Could not add the walk-in visit.')
      }
    } finally {
      setSaving(false)
    }
  }

  const todayAppointment = precheck?.today_appointment
  const upcoming = precheck?.upcoming_appointment
  const patientName = mode === 'existing'
    ? (patient?.full_name || patient?.name || '')
    : form.full_name.trim()
  const selectedDoctor = form.doctor_id === 'first_available'
    ? null
    : filteredDoctors.find((doctor) => Number(doctor.id) === Number(form.doctor_id))
  const doctorLabel = form.doctor_id === 'first_available'
    ? 'First Available'
    : (selectedDoctor?.full_name || selectedDoctor?.name || 'Selected doctor')
  const reasonLabel = form.reason === 'Other'
    ? (form.reason_notes.trim() || 'Other concern')
    : `${form.reason}${form.reason_notes.trim() ? ` — ${form.reason_notes.trim()}` : ''}`

  return (
    <>
      <div className="fixed inset-0 z-40 bg-black/40" onClick={saving ? undefined : onClose} />
      <div className="fixed inset-x-0 bottom-0 z-50 max-h-[94vh] overflow-y-auto rounded-t-3xl bg-white p-5 shadow-2xl sm:left-1/2 sm:top-1/2 sm:bottom-auto sm:w-full sm:max-w-2xl sm:-translate-x-1/2 sm:-translate-y-1/2 sm:rounded-3xl">
        <div className="mb-4 flex items-start justify-between gap-4">
          <div>
            <h2 className="text-lg font-bold text-slate-900">{reviewing ? 'Review Walk-in Visit' : 'Add Walk-in Visit'}</h2>
            <p className="mt-1 text-sm text-slate-500">
              {reviewing
                ? 'Confirm the patient and visit details before adding this visit to the queue.'
                : 'Find an existing patient first. Register a new patient only when no matching record exists.'}
            </p>
          </div>
          <button onClick={onClose} disabled={saving} className="rounded-xl p-2 text-slate-400 hover:bg-slate-100 disabled:opacity-50">
            <MdClose />
          </button>
        </div>

        {error && (
          <div className="mb-4 rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-medium text-red-700">
            {error}
          </div>
        )}

        {reviewing ? (
          <div className="space-y-4">
            <div className="rounded-2xl border border-emerald-200 bg-emerald-50/50 p-4">
              <p className="text-xs font-bold uppercase tracking-wider text-emerald-700">Patient</p>
              <p className="mt-1 text-base font-bold text-slate-900">{patientName}</p>
              <p className="mt-1 text-sm text-slate-500">
                {mode === 'existing' ? 'Existing patient record' : 'New walk-in patient'}
              </p>
            </div>

            <div className="grid gap-3 sm:grid-cols-2">
              <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                <p className="text-xs font-bold uppercase tracking-wider text-slate-400">Clinic</p>
                <p className="mt-1 font-bold text-slate-900">{form.clinic_type === 'derma' ? 'Dermatology' : 'General Medicine'}</p>
              </div>
              <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                <p className="text-xs font-bold uppercase tracking-wider text-slate-400">Doctor / Queue</p>
                <p className="mt-1 font-bold text-slate-900">{doctorLabel}</p>
              </div>
              <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4 sm:col-span-2">
                <p className="text-xs font-bold uppercase tracking-wider text-slate-400">Reason for Visit</p>
                <p className="mt-1 font-bold text-slate-900">{reasonLabel}</p>
              </div>
            </div>

            {upcoming && !todayAppointment && (
              <div className="rounded-2xl border border-violet-200 bg-violet-50 p-4">
                <p className="text-xs font-bold uppercase tracking-wider text-violet-700">Upcoming Appointment Kept</p>
                <p className="mt-2 font-bold text-slate-900">{upcoming.appointment_date} • {upcoming.appointment_time}</p>
                <p className="text-sm text-slate-600">{upcoming.doctor_name} — {upcoming.reason || 'Scheduled visit'}</p>
              </div>
            )}

            {todayAppointment && mode === 'existing' && (
              <div className="rounded-2xl border border-amber-200 bg-amber-50 p-4">
                <p className="text-xs font-bold uppercase tracking-wider text-amber-700">Separate Walk-in</p>
                <p className="mt-2 text-sm text-amber-900">
                  Today&apos;s existing appointment will remain separate because you chose to create another walk-in visit.
                </p>
              </div>
            )}

            <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
              <button onClick={() => setReviewing(false)} disabled={saving} className="button-secondary">Back</button>
              <button onClick={() => submit({ checkIn: false })} disabled={saving} className="button-primary">
                {saving ? 'Adding…' : 'Confirm & Add to Queue'}
              </button>
            </div>
          </div>
        ) : (
          <>
            <div className="mb-5 grid grid-cols-2 gap-2 rounded-2xl bg-slate-100 p-1">
              <button
                onClick={() => { setMode('existing'); setError(''); setReviewing(false) }}
                className={`rounded-xl px-3 py-2.5 text-sm font-semibold ${mode === 'existing' ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500'}`}
              >
                Existing Patient
              </button>
              <button
                onClick={() => { setMode('new'); setPatient(null); setPrecheck(null); setError(''); setReviewing(false) }}
                className={`rounded-xl px-3 py-2.5 text-sm font-semibold ${mode === 'new' ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500'}`}
              >
                New Patient
              </button>
            </div>

            {mode === 'existing' ? (
              <div className="space-y-4">
                <label className="block">
                  <span className="form-label">Search Patient</span>
                  <div className="relative mt-1.5">
                    <MdPersonSearch className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" />
                    <input
                      className="form-control pl-11"
                      value={search}
                      disabled={Boolean(patient)}
                      onChange={(event) => { setSearch(event.target.value); setPatient(null); setPrecheck(null) }}
                      placeholder="Name, mobile number, or email"
                    />
                  </div>
                </label>

                {results.length > 0 && (
                  <div className="max-h-48 overflow-y-auto rounded-2xl border border-slate-200">
                    {results.map((row) => (
                      <button key={row.id} onClick={() => choosePatient(row)} className="block w-full border-b border-slate-100 px-4 py-3 text-left last:border-0 hover:bg-slate-50">
                        <p className="font-bold text-slate-900">{row.full_name || row.name}</p>
                        <p className="mt-1 text-xs text-slate-500">
                          {row.phone || 'No phone'} • {row.email || 'No email'}{row.birthdate ? ` • ${row.birthdate}` : ''}
                        </p>
                      </button>
                    ))}
                  </div>
                )}

                {patient && (
                  <div className="rounded-2xl border border-emerald-200 bg-emerald-50/50 p-4">
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <p className="text-xs font-bold uppercase tracking-wider text-emerald-700">Selected Patient</p>
                        <p className="mt-1 font-bold text-slate-900">{patient.full_name || patient.name}</p>
                        <p className="mt-1 text-xs text-slate-500">{patient.phone || 'No phone'} • {patient.email || 'No email'}</p>
                      </div>
                      <button onClick={changePatient} className="text-xs font-bold text-sky-700">Change Patient</button>
                    </div>
                  </div>
                )}

                {todayAppointment && (
                  <div className="rounded-2xl border border-sky-200 bg-sky-50 p-4">
                    <p className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-sky-700"><MdEventAvailable /> Today&apos;s Appointment Found</p>
                    <p className="mt-2 font-bold text-slate-900">{todayAppointment.appointment_time} • {todayAppointment.doctor_name}</p>
                    <p className="text-sm text-slate-600">{todayAppointment.reason || 'Scheduled consultation'}</p>
                    <p className="mt-2 text-xs text-slate-500">Use Check In to reuse the existing appointment instead of creating a duplicate.</p>
                  </div>
                )}

                {upcoming && !todayAppointment && (
                  <div className="rounded-2xl border border-violet-200 bg-violet-50 p-4">
                    <p className="text-xs font-bold uppercase tracking-wider text-violet-700">Upcoming Appointment</p>
                    <p className="mt-2 font-bold text-slate-900">{upcoming.appointment_date} • {upcoming.appointment_time}</p>
                    <p className="text-sm text-slate-600">{upcoming.doctor_name} — {upcoming.reason || 'Scheduled visit'}</p>
                    <p className="mt-2 text-xs text-slate-500">This future appointment will remain scheduled if today&apos;s walk-in continues.</p>
                  </div>
                )}
              </div>
            ) : (
              <div className="grid gap-4 sm:grid-cols-2">
                <label className="sm:col-span-2">
                  <span className="form-label">Full Name *</span>
                  <input className="form-control mt-1.5" value={form.full_name} onChange={(event) => update('full_name', event.target.value)} />
                </label>
                <label>
                  <span className="form-label">Mobile Number *</span>
                  <input className="form-control mt-1.5" value={form.phone} onChange={(event) => update('phone', event.target.value)} placeholder="09XXXXXXXXX" />
                </label>
                <label>
                  <span className="form-label">Birthdate *</span>
                  <input type="date" className="form-control mt-1.5" value={form.birthdate} onChange={(event) => update('birthdate', event.target.value)} />
                </label>
                <label>
                  <span className="form-label">Sex</span>
                  <select className="form-control mt-1.5" value={form.sex} onChange={(event) => update('sex', event.target.value)}>
                    <option value="">Not specified</option>
                    <option>Male</option>
                    <option>Female</option>
                    <option>Other</option>
                  </select>
                </label>
                <label>
                  <span className="form-label">Email (optional)</span>
                  <input type="email" className="form-control mt-1.5" value={form.email} onChange={(event) => update('email', event.target.value)} />
                </label>
                <label className="sm:col-span-2 rounded-2xl border border-slate-200 bg-slate-50 p-4">
                  <div className="flex gap-3">
                    <input type="checkbox" className="mt-1 h-4 w-4" checked={form.consent_given} onChange={(event) => update('consent_given', event.target.checked)} />
                    <span className="text-sm text-slate-600">Patient provided consent to the collection and processing of personal data.</span>
                  </div>
                  <select className="form-control mt-3" value={form.consent_method} onChange={(event) => update('consent_method', event.target.value)}>
                    <option>Signed Intake Form</option>
                    <option>Patient Digital Consent</option>
                    <option>Other Approved Method</option>
                  </select>
                </label>
              </div>
            )}

            <div className="mt-5 grid gap-4 sm:grid-cols-2">
              <label>
                <span className="form-label">Clinic Type *</span>
                <select
                  className="form-control mt-1.5"
                  value={form.clinic_type}
                  onChange={(event) => {
                    update('clinic_type', event.target.value)
                    update('doctor_id', 'first_available')
                  }}
                >
                  <option value="medical">General Medicine</option>
                  <option value="derma">Dermatology</option>
                </select>
              </label>
              <label>
                <span className="form-label">Doctor / Queue *</span>
                <select className="form-control mt-1.5" value={form.doctor_id} onChange={(event) => update('doctor_id', event.target.value)}>
                  <option value="first_available">First Available</option>
                  {filteredDoctors.map((doctor) => (
                    <option key={doctor.id} value={doctor.id}>{doctor.full_name || doctor.name} — {doctor.specialty}</option>
                  ))}
                </select>
              </label>
              <label>
                <span className="form-label">Reason for Visit *</span>
                <select className="form-control mt-1.5" value={form.reason} onChange={(event) => update('reason', event.target.value)}>
                  {REASONS.map((reason) => <option key={reason}>{reason}</option>)}
                </select>
              </label>
              <label>
                <span className="form-label">Additional Notes</span>
                <input className="form-control mt-1.5" value={form.reason_notes} onChange={(event) => update('reason_notes', event.target.value)} placeholder="Optional details" />
              </label>
            </div>

            <div className="mt-6 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
              <button onClick={onClose} className="button-secondary" disabled={saving}>Cancel</button>
              {todayAppointment && mode === 'existing' ? (
                <>
                  <button onClick={openReview} disabled={saving} className="button-secondary">Review Separate Walk-in</button>
                  <button onClick={() => submit({ checkIn: true })} disabled={saving} className="button-primary">
                    {saving ? 'Working…' : 'Check In for Appointment'}
                  </button>
                </>
              ) : (
                <button onClick={openReview} disabled={saving} className="button-primary">Review Walk-in</button>
              )}
            </div>
          </>
        )}
      </div>
    </>
  )
}

const SuccessModal = ({ entry, onClose }) => <><div className="fixed inset-0 z-40 bg-black/40"/><div className="fixed left-1/2 top-1/2 z-50 w-[calc(100%-2rem)] max-w-md -translate-x-1/2 -translate-y-1/2 rounded-3xl bg-white p-6 text-center shadow-2xl"><div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-emerald-50 text-2xl text-emerald-600"><MdCheck/></div><h2 className="mt-4 text-xl font-bold text-slate-900">Added to Walk-in Queue</h2><p className="mt-1 text-sm text-slate-500">{entry.patient_name}</p><div className="mt-5 rounded-2xl bg-slate-50 p-5"><p className="text-xs font-bold uppercase tracking-wider text-slate-400">Queue Position</p><p className="mt-1 text-4xl font-black text-slate-900">#{entry.queue_number}</p><p className="mt-2 text-sm text-slate-600">{entry.doctor_name}</p></div><button onClick={onClose} className="button-primary mt-5 w-full">Done</button></div></>

const StaffWalkInQueue = () => {
  const [queue,setQueue]=useState([]),[doctors,setDoctors]=useState([]),[loading,setLoading]=useState(true),[showModal,setShowModal]=useState(false),[success,setSuccess]=useState(null)
  const today=new Date().toISOString().slice(0,10)
  const loadData=useCallback(async()=>{setLoading(true);try{const [q,d]=await Promise.all([getQueue(today),getDoctors()]);setQueue(Array.isArray(q)?q:[]);setDoctors(Array.isArray(d)?d:[])}finally{setLoading(false)}},[today])
  useEffect(()=>{loadData()},[loadData]);useEffect(()=>{const fn=()=>loadData();window.addEventListener('clinic:refresh',fn);return()=>window.removeEventListener('clinic:refresh',fn)},[loadData])
  const onSuccess=async(entry)=>{setShowModal(false);setSuccess(entry);await loadData()}
  const call=async(entry)=>{const active=queue.find((i)=>i.status==='in-progress');if(active&&active.id!==entry.id)await updateQueueStatus(active.id,'done');await updateQueueStatus(entry.id,'in-progress');await loadData()}
  const done=async(entry)=>{await updateQueueStatus(entry.id,'done');await loadData()}
  const remove=async(entry)=>{if(!window.confirm('Remove this patient from the queue?'))return;await updateQueueStatus(entry.id,'removed');await loadData()}
  const active=queue.filter((i)=>['waiting','in-progress'].includes(i.status)),completed=queue.filter((i)=>['done','removed'].includes(i.status));const activePg=useClientPagination(active,{initialPageSize:6}),donePg=useClientPagination(completed,{initialPageSize:6})
  return <div className="mx-auto w-full max-w-7xl space-y-5"><div className="flex flex-wrap items-start justify-between gap-4"><div><h1 className="flex items-center gap-2 text-2xl font-bold text-slate-900"><MdQueuePlayNext className="text-sky-500"/> Walk-in Queue</h1><p className="mt-1 text-sm text-slate-500">Check in existing patients, register new walk-ins, and manage today&apos;s doctor queues.</p></div><div className="flex flex-wrap gap-2"><button onClick={printWalkInIntakeForm} className="button-secondary"><MdPrint/> Print Intake Form</button><button onClick={loadData} className="button-secondary"><MdRefresh/> Refresh</button><button onClick={()=>setShowModal(true)} className="button-primary"><MdAdd/> Add Walk-in Visit</button></div></div>
    <div className="grid gap-3 sm:grid-cols-3">{[['Waiting',active.filter(i=>i.status==='waiting').length,'bg-amber-50 text-amber-700'],['In Progress',active.filter(i=>i.status==='in-progress').length,'bg-sky-50 text-sky-700'],['Completed',completed.filter(i=>i.status==='done').length,'bg-emerald-50 text-emerald-700']].map(([label,value,tone])=><div key={label} className={`rounded-3xl border border-slate-200 p-5 ${tone}`}><p className="text-3xl font-black">{value}</p><p className="mt-1 text-sm font-semibold">{label}</p></div>)}</div>
    {loading?<div className="flex h-64 items-center justify-center rounded-3xl border bg-white"><div className="h-8 w-8 animate-spin rounded-full border-4 border-slate-200 border-t-sky-500"/></div>:<><section className="space-y-3"><div className="flex items-center gap-2 text-xs font-bold uppercase tracking-widest text-slate-400"><MdMedicalServices/> Active Queue</div><div className="grid gap-4 lg:grid-cols-2">{active.length?activePg.pageItems.map((entry)=><QueueCard key={entry.id} entry={entry} onCall={call} onDone={done} onRemove={remove}/>):<div className="rounded-3xl border bg-white p-8 text-center text-sm text-slate-400">No active walk-ins yet.</div>}</div>{active.length>0&&<Pagination {...activePg} total={active.length} pageSizeOptions={[6,12,24]}/>}</section><section className="space-y-3"><div className="flex items-center gap-2 text-xs font-bold uppercase tracking-widest text-slate-400"><MdCheck/> Completed / Removed</div><div className="grid gap-4 lg:grid-cols-2">{completed.length?donePg.pageItems.map((entry)=><div key={entry.id} className="rounded-3xl border bg-white p-4 shadow-sm"><div className="flex justify-between gap-3"><div><p className="font-bold text-slate-900">{entry.patient_name}</p><p className="text-sm text-slate-500">{entry.doctor_name}</p></div><span className="text-xs font-bold capitalize text-slate-500">{entry.status}</span></div><p className="mt-2 text-sm text-slate-500">Queue #{entry.queue_number} • {entry.type}</p></div>):<div className="rounded-3xl border bg-white p-8 text-center text-sm text-slate-400">No completed entries yet.</div>}</div>{completed.length>0&&<Pagination {...donePg} total={completed.length} pageSizeOptions={[6,12,24]}/>}</section></>}
    {showModal&&<WalkInModal doctors={doctors} onClose={()=>setShowModal(false)} onSuccess={onSuccess}/>} {success&&<SuccessModal entry={success} onClose={()=>setSuccess(null)}/>} </div>
}
export default StaffWalkInQueue



