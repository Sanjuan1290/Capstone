import { useCallback, useEffect, useRef, useState } from 'react'
import { useBlocker, useNavigate, useOutletContext } from 'react-router-dom'
import useClinicRefresh from '../../hooks/useClinicRefresh'
import {
  MdArrowBack, MdArrowForward, MdCheck, MdCheckCircle,
  MdOpenInNew, MdSearch,
  MdWarningAmber,
} from 'react-icons/md'
import {
  StepBar, StepService, StepDoctor, StepSchedule, StepDetails, BookingSummary,
} from '../patientPage/BookAppointment'
import { normalizeBookingServiceResults } from '../../utils/patientBookingFlow.mjs'
import { formatPublicServicePrice } from '../../utils/patientServicePresentation.mjs'
import { getMaxPatientBirthdate, getMinPatientBirthdate, validatePatientBirthdate } from '../../utils/patientBirthdate.mjs'

const SCHEDULED_STEPS = ['Patient', 'Service', 'Doctor', 'Date & Time', 'Review']
const WALKIN_STEPS = ['Patient', 'Visit Details', 'Review']
const emptyVisit = () => ({ clinicType: '', service: null, doctor: null, date: '', time: '', reason: '', reasonDetails: '', notes: '' })
const emptyPatient = () => ({ full_name: '', birthdate: '', reported_age: '', sex: '', phone: '', address: '', email: '', consent_given: false })
const outpatientName = (person) => person?.full_name || person?.name || 'Patient'
const validPhone = (phone) => /^09\d{9}$/.test(String(phone || '').replace(/\s/g, ''))
const safeArray = (result) => Array.isArray(result) ? result : Array.isArray(result?.doctors) ? result.doctors : Array.isArray(result?.items) ? result.items : []
const QUEUE_DISPLAY = '/display/queue'

const Field = ({ label, value, onChange, required = false, type = 'text', placeholder = '', ...rest }) => <label className="block min-w-0">
  <span className="mb-1.5 block text-xs font-bold uppercase tracking-wide text-slate-600">{label}{required && ' *'}</span>
  <input type={type} value={value} onChange={(event) => onChange(event.target.value)} placeholder={placeholder}
    className="min-h-11 w-full rounded-xl border border-slate-300 bg-white px-3 py-2.5 text-sm text-slate-800 outline-none focus:border-emerald-600 focus:ring-2 focus:ring-emerald-100" {...rest} />
</label>

export default function AppointmentCreatePage({ services }) {
  const navigate = useNavigate()
  const outlet = useOutletContext() || {}
  const branchName = outlet.branch?.name || 'Current Clinic Branch'
  const [visitType, setVisitType] = useState('scheduled')
  const [step, setStep] = useState(0)
  const [patientMode, setPatientMode] = useState('existing')
  const [search, setSearch] = useState('')
  const [patientResults, setPatientResults] = useState([])
  const [searchLoading, setSearchLoading] = useState(false)
  const [selectedPatient, setSelectedPatient] = useState(null)
  const [patientFields, setPatientFields] = useState(emptyPatient)
  const [createdPatientId, setCreatedPatientId] = useState(null)
  const [form, setForm] = useState(emptyVisit)
  const [serviceCategory, setServiceCategory] = useState('all')
  const [availableServices, setAvailableServices] = useState([])
  const [servicesLoading, setServicesLoading] = useState(true)
  const [servicesError, setServicesError] = useState('')
  const [doctorList, setDoctorList] = useState({ medical: [], derma: [] })
  const [doctorLoading, setDoctorLoading] = useState(true)
  const [doctorError, setDoctorError] = useState('')
  const [doctorSchedules, setDoctorSchedules] = useState([])
  const [unavailableDates, setUnavailableDates] = useState([])
  const [scheduleError, setScheduleError] = useState('')
  const [availableSlots, setAvailableSlots] = useState([])
  const [slotsLoading, setSlotsLoading] = useState(false)
  const [slotsError, setSlotsError] = useState('')
  const [walkInDoctors, setWalkInDoctors] = useState([])
  const [walkInLoading, setWalkInLoading] = useState(false)
  const [walkInError, setWalkInError] = useState('')
  const [reasons, setReasons] = useState([])
  const [reasonsLoading, setReasonsLoading] = useState(false)
  const [precheck, setPrecheck] = useState(null)
  const [checkingQueue, setCheckingQueue] = useState(false)
  const [informedPatient, setInformedPatient] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [noShowWarning, setNoShowWarning] = useState(null)
  const [success, setSuccess] = useState(null)
  const submitting = useRef(false)
  const searchSequence = useRef(0)
  const formRef = useRef(null)
  const appointmentsUrl = `${window.location.pathname.replace(/\/new\/?$/, '')}`
  const steps = visitType === 'scheduled' ? SCHEDULED_STEPS : WALKIN_STEPS
  const patientId = patientMode === 'existing' ? selectedPatient?.id : createdPatientId
  const patientName = patientMode === 'existing' ? outpatientName(selectedPatient) : patientFields.full_name
  const dirty = Boolean(selectedPatient || search || patientFields.full_name || form.service || form.doctor || form.reason)
  const blocker = useBlocker(({ currentLocation, nextLocation }) => !success && !busy && dirty && currentLocation.pathname !== nextLocation.pathname)

  useEffect(() => {
    const warn = (event) => { if (!success && dirty && !busy) { event.preventDefault(); event.returnValue = '' } }
    window.addEventListener('beforeunload', warn)
    return () => window.removeEventListener('beforeunload', warn)
  }, [dirty, busy, success])

  useEffect(() => { formRef.current?.focus() }, [step, visitType])

  const loadServices = useCallback(async () => {
    setServicesLoading(true); setServicesError('')
    try {
      const results = await Promise.allSettled(['medical', 'derma'].map((type) => services.getBookingServices(type)))
      const rows = normalizeBookingServiceResults(results)
      setAvailableServices(rows)
      if (results.every((result) => result.status === 'rejected')) setServicesError('Services could not be loaded. Try again.')
    } catch (err) { setServicesError(err.message || 'Services could not be loaded.') }
    finally { setServicesLoading(false) }
  }, [services])
  useEffect(() => { void loadServices() }, [loadServices])

  const loadDoctors = useCallback(async () => {
    setDoctorLoading(true); setDoctorError('')
    try {
      const raw = safeArray(await services.getDoctors())
      const active = raw.filter((doctor) => Number(doctor.is_active ?? 1) !== 0 && ['medical', 'derma'].includes(String(doctor.clinic_type || doctor.type)))
      // Read-only scheduling is available to staff who have Appointments permission.
      const schedules = await Promise.allSettled(active.map((doctor) => services.getDoctorSchedules(doctor.id)))
      const enriched = active.map((doctor, i) => ({
        ...doctor,
        clinic_type: String(doctor.clinic_type || doctor.type),
        weekly_schedule: schedules[i].status === 'fulfilled' ? safeArray(schedules[i].value) : [],
      }))
      setDoctorList({ medical: enriched.filter((d) => d.clinic_type === 'medical'), derma: enriched.filter((d) => d.clinic_type === 'derma') })
    } catch (err) { setDoctorError(err.message || 'Doctors could not be loaded.') }
    finally { setDoctorLoading(false) }
  }, [services])
  useEffect(() => { void loadDoctors() }, [loadDoctors])

  useEffect(() => {
    if (patientMode !== 'existing' || search.trim().length < 2 || (selectedPatient && search === outpatientName(selectedPatient))) {
      setPatientResults([]); setSearchLoading(false); return
    }
    let cancelled = false
    const id = ++searchSequence.current
    const timer = window.setTimeout(async () => {
      setSearchLoading(true)
      try { const rows = safeArray(await services.getPatients(search.trim())); if (!cancelled && id === searchSequence.current) setPatientResults(rows) }
      catch { if (!cancelled && id === searchSequence.current) setPatientResults([]) }
      finally { if (!cancelled && id === searchSequence.current) setSearchLoading(false) }
    }, 300)
    return () => { cancelled = true; clearTimeout(timer) }
  }, [search, patientMode, selectedPatient, services])

  useEffect(() => {
    if (!form.clinicType) { setReasons([]); return }
    let active = true
    setReasonsLoading(true)
    services.getAppointmentReasons(form.clinicType)
      .then((rows) => { if (active) { const filtered = safeArray(rows).filter((r) => Number(r.is_active ?? 1) !== 0 && ['all', form.clinicType, ''].includes(String(r.clinic_type || ''))); setReasons(filtered.length ? filtered : [{ id: 'other', label: 'Other' }]) } })
      .catch(() => { if (active) setReasons([{ id: 'other', label: 'Other' }]) })
      .finally(() => { if (active) setReasonsLoading(false) })
    return () => { active = false }
  }, [form.clinicType, services])

  const walkInRequestId = useRef(0)
  const refreshWalkInDoctors = useCallback(async () => {
    if (visitType !== 'walk_in' || !form.clinicType) return
    const requestId=++walkInRequestId.current
    setWalkInLoading(true);setWalkInError('')
    try {
      const result=await services.getWalkInAvailableDoctors(form.clinicType)
      if(requestId!==walkInRequestId.current)return
      const doctors=safeArray(result)
      setWalkInDoctors(doctors)
      setForm(prev=>prev.doctor && !doctors.some(d=>Number(d.id)===Number(prev.doctor.id)&&d.available_now) ? {...prev,doctor:null} : prev)
    } catch(err) {
      if(requestId!==walkInRequestId.current)return
      setWalkInError(err.message||'Unable to check walk-in doctors.')
      setWalkInDoctors([])
      setForm(prev=>prev.doctor?{...prev,doctor:null}:prev)
    } finally {if(requestId===walkInRequestId.current)setWalkInLoading(false)}
  },[visitType,form.clinicType,services])
  useEffect(()=>{
    if (visitType !== 'walk_in' || !form.clinicType){walkInRequestId.current++;setWalkInDoctors([]);return}
    void refreshWalkInDoctors()
    return()=>{walkInRequestId.current++}
  },[refreshWalkInDoctors,visitType,form.clinicType])
  useClinicRefresh(refreshWalkInDoctors,['schedule.updated','appointment.updated','queue.updated','accounts.updated'],{fallbackMs:30000,skip:()=>visitType!=='walk_in'||!form.clinicType})

  useEffect(() => {
    if (visitType !== 'scheduled' || !form.doctor) { setDoctorSchedules([]); setUnavailableDates([]); setScheduleError(''); return }
    let active = true
    setScheduleError('')
    Promise.all([services.getDoctorSchedules(form.doctor.id), services.getDoctorUnavailableDates?.(form.doctor.id) || Promise.resolve([])])
      .then(([schedule, dates]) => { if (active) { setDoctorSchedules(safeArray(schedule)); setUnavailableDates(Array.isArray(dates) ? dates : dates?.unavailable_dates || []) } })
      .catch((err) => { if (active) { setDoctorSchedules([]); setUnavailableDates([]); setScheduleError(err.message || 'Unable to verify the doctor schedule.') } })
    return () => { active = false }
  }, [form.doctor?.id, visitType, services])

  useEffect(() => {
    if (visitType !== 'scheduled' || !form.service || !form.doctor || !form.date || scheduleError) { setAvailableSlots([]); return }
    let active = true
    setSlotsLoading(true); setSlotsError('')
    services.getAppointmentAvailableSlots(form.doctor.id, { date: form.date, serviceId: form.service.id, clinicType: form.clinicType })
      .then((response) => { if (active) { const slots = Array.isArray(response?.slots) ? response.slots : []; setAvailableSlots(slots); setForm((prev) => (prev.time && !slots.includes(prev.time) ? { ...prev, time: '' } : prev)) } })
      .catch((err) => { if (active) { setAvailableSlots([]); setSlotsError(err.message || 'Available times could not be checked.') } })
      .finally(() => { if (active) setSlotsLoading(false) })
    return () => { active = false }
  }, [visitType, form.doctor?.id, form.service?.id, form.date, form.clinicType, services, scheduleError])

  const changeVisitType = (type) => {
    if (type === visitType) return
    setVisitType(type); setStep(0); setError(''); setForm(emptyVisit()); setServiceCategory('all'); setPrecheck(null); setInformedPatient(false)
  }
  const chooseService = (service) => setForm((old) => ({ ...emptyVisit(), clinicType: service.booking_clinic_type, service, notes: old.notes }))
  const chooseDoctor = (doctor) => setForm((old) => ({ ...old, doctor, date: '', time: '' }))
  const patientReady = patientMode === 'existing' ? Boolean(selectedPatient?.id) :
    Boolean(patientFields.full_name.trim() && ['Male','Female','Other'].includes(patientFields.sex) && (patientFields.birthdate ? !validatePatientBirthdate(patientFields.birthdate) : /^\d{1,3}$/.test(String(patientFields.reported_age)) && Number(patientFields.reported_age)>=18 && Number(patientFields.reported_age)<=120) && (!patientFields.phone.trim() || validPhone(patientFields.phone)) && (!patientFields.email.trim() || /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(patientFields.email.trim())) && patientFields.consent_given)
  const hasReason = Boolean(form.reason && (form.reason !== 'Other' || form.reasonDetails.trim().length >= 2))
  const stepReady = () => {
    if (step === 0) return patientReady
    if (visitType === 'walk_in') return step === 1 ? Boolean(form.clinicType && form.doctor && hasReason && !walkInLoading && !walkInError && walkInDoctors.some((d) => Number(d.id) === Number(form.doctor?.id))) : !checkingQueue && informedPatient
    if (step === 1) return Boolean(form.service)
    if (step === 2) return Boolean(form.doctor)
    if (step === 3) return Boolean(form.date && form.time && !slotsLoading && !slotsError && !scheduleError && availableSlots.includes(form.time))
    return hasReason && informedPatient
  }

  const next = async () => {
    setError('')
    if (!stepReady()) { setError(step === 0 ? 'Select an existing patient or complete the new patient details.' : 'Complete the required information before continuing.'); return }
    if (visitType === 'walk_in' && step === 1 && patientId) {
      setCheckingQueue(true)
      try { const result = await services.getQueuePrecheck(patientId); setPrecheck(result); if (result?.active_queue) { setError('This patient is already in today’s queue. Use the Walk-in Queue to continue.'); return } }
      catch (err) { setError(err.message || 'Unable to check the queue. Try again.'); return }
      finally { setCheckingQueue(false) }
    }
    setStep((index) => Math.min(steps.length - 1, index + 1))
  }

  const submit = async (overrideNoShowWarning = false) => {
    if (submitting.current || busy || !patientReady || !hasReason || !stepReady()) return
    submitting.current = true; setBusy(true); setError('')
    try {
      let savedPatientId = patientId
      if (patientMode === 'new' && !savedPatientId) {
        const created = await services.createWalkInPatient(patientFields)
        savedPatientId = Number(created?.id)
        if (!savedPatientId) throw new Error('Could not confirm the new patient record. No appointment has been created.')
        setCreatedPatientId(savedPatientId)
      }
      const reason = form.reason === 'Other' ? `Other — ${form.reasonDetails.trim()}` : form.reason
      if (visitType === 'walk_in') {
        const verified = await services.getQueuePrecheck(savedPatientId)
        if (verified?.active_queue) throw new Error('This patient is already in the active queue.')
        const existing = verified?.today_appointment
        const payload = existing ? {
          patient_id: savedPatientId, patient_name: patientName,
          doctor_id: Number(existing.doctor_id), type: existing.clinic_type,
          reason: existing.reason || reason,
          check_in_appointment_id: existing.id,
        } : {
          patient_id: savedPatientId, patient_name: patientName, doctor_id: Number(form.doctor.id),
          type: form.clinicType, reason,
        }
        const receipt = await services.addToQueue(payload)
        setSuccess({ type: 'walk_in', patient: patientName, doctor: existing?.doctor_name || outpatientName(form.doctor), receipt, existing: Boolean(existing) })
      } else {
        if (!form.service || !form.doctor || !form.date || !availableSlots.includes(form.time)) throw new Error('Choose a valid service, doctor, date, and time.')
        const created = await services.createAppointment({
          patient_id: savedPatientId, doctor_id: Number(form.doctor.id), clinic_type: form.clinicType,
          requested_service_id: Number(form.service.id), appointment_date: form.date, appointment_time: form.time,
          reason: reason.slice(0, 255), notes: form.notes, override_no_show_warning: overrideNoShowWarning,
        })
        setSuccess({ type: 'scheduled', patient: patientName, doctor: outpatientName(form.doctor), id: created?.id, date: form.date, time: form.time, service: form.service })
      }
    } catch (err) { if (err.code === 'NO_SHOW_WARNING' && visitType === 'scheduled') setNoShowWarning(err); else setError(err.message || 'Could not finish this appointment. Your entries are still here.') }
    finally { submitting.current = false; setBusy(false) }
  }

  const selectExistingPatient = (p) => { setSelectedPatient(p); setSearch(outpatientName(p)); setPatientResults([]); setPrecheck(null) }
  const summary = <div className="space-y-3">
    <h2 className="text-base font-bold text-slate-900">Appointment Summary</h2>
    <p className="text-xs font-bold uppercase text-slate-500">Patient</p><p className="text-sm font-semibold text-slate-900">{patientName || 'Not selected yet'}</p>
    <div className="border-t border-slate-200 pt-3"><p className="text-xs text-slate-500">Visit Type</p><p className="text-sm font-semibold">{visitType === 'scheduled' ? 'Scheduled Appointment' : 'Walk-in Now'}</p></div>
    {visitType === 'scheduled' && <BookingSummary form={form} branchName={branchName} selectedPromotion={null} />}
    {visitType === 'walk_in' && <><div className="border-t border-slate-200 pt-3"><p className="text-xs text-slate-500">Clinic Department</p><p className="text-sm font-semibold">{form.clinicType === 'derma' ? 'Dermatology' : form.clinicType ? 'General Medicine' : 'Not selected'}</p></div><div><p className="text-xs text-slate-500">Doctor</p><p className="text-sm font-semibold">{form.doctor ? outpatientName(form.doctor) : 'Not selected'}</p></div><p className="text-xs text-slate-600">A queue number is assigned when the check-in succeeds.</p></>}
  </div>

  const finish = () => navigate(appointmentsUrl, { replace: true })
  if (success) return <section className="mx-auto max-w-3xl rounded-3xl border border-slate-200 bg-white p-6 text-center shadow-sm sm:p-10" role="status">
    <MdCheckCircle className="mx-auto mb-4 text-6xl text-emerald-600" />
    <h1 className="text-2xl font-black text-slate-900">{success.type === 'walk_in' ? 'Patient checked in' : 'Appointment request created'}</h1>
    <p className="mt-2 text-sm text-slate-600">{success.patient} · {success.doctor}</p>
    {success.type === 'walk_in' ? <div className="mx-auto mt-6 max-w-md rounded-2xl border border-emerald-200 bg-emerald-50 p-5"><p className="text-xs font-bold uppercase text-emerald-700">Queue Number</p><p className="mt-2 text-4xl font-black text-emerald-900">{success.receipt?.queue_number ?? 'Assigned'}</p><p className="mt-2 text-sm text-emerald-800">{success.existing ? 'Existing appointment checked in.' : 'Walk-in added to the queue.'}</p></div> : <div className="mx-auto mt-6 max-w-md rounded-2xl border border-amber-200 bg-amber-50 p-5 text-left text-sm"><p className="font-bold text-amber-900">Pending clinic confirmation</p><p className="mt-2 text-slate-700">{success.service?.service_name} · {success.date} · {success.time}</p><p className="mt-1 text-slate-600">Final charges are reviewed at billing checkout.</p></div>}
    <div className="mt-6 flex flex-wrap justify-center gap-3"><button type="button" onClick={finish} className="min-h-11 rounded-xl bg-[#0b1a2c] px-5 py-3 text-sm font-bold text-white">Back to Appointments</button>{success.type === 'walk_in' && <a href={QUEUE_DISPLAY} target="_blank" rel="noopener noreferrer" className="inline-flex min-h-11 items-center gap-2 rounded-xl border border-emerald-300 px-5 py-3 text-sm font-bold text-emerald-800">Open Queue Display <MdOpenInNew /></a>}</div>
  </section>

  return <div className="mx-auto max-w-6xl space-y-5 pb-10">
    <div className="flex flex-wrap items-start justify-between gap-3"><div><button type="button" onClick={() => navigate(appointmentsUrl)} className="mb-2 inline-flex items-center gap-2 text-sm font-semibold text-slate-600 hover:text-slate-900"><MdArrowBack /> Back to Appointments</button><h1 className="text-2xl font-black text-slate-900">New Appointment</h1><p className="mt-1 text-sm text-slate-600">Choose a patient and register a scheduled visit or walk-in.</p></div><a href={QUEUE_DISPLAY} target="_blank" rel="noopener noreferrer" className="inline-flex min-h-11 items-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-semibold text-slate-700">Open Queue Display <MdOpenInNew /></a></div>

    <section className="grid gap-3 sm:grid-cols-2" aria-label="Appointment type">
      {[{ key: 'scheduled', title: 'Scheduled Appointment', help: 'Select a service, doctor, date, and available time.' }, { key: 'walk_in', title: 'Walk-in Now', help: 'Select a doctor accepting walk-ins, then check the patient into the queue.' }].map((item) => <button key={item.key} type="button" aria-pressed={visitType === item.key} onClick={() => changeVisitType(item.key)} className={`min-h-24 rounded-2xl border-2 p-4 text-left transition-colors ${visitType === item.key ? 'border-emerald-600 bg-emerald-50' : 'border-slate-200 bg-white hover:border-emerald-300'}`}><div className="flex items-center justify-between gap-2"><p className="font-bold text-slate-900">{item.title}</p>{visitType === item.key && <MdCheck className="text-emerald-700" />}</div><p className="mt-1 text-sm text-slate-600">{item.help}</p></button>)}
    </section>
    <div className="grid items-start gap-5 lg:grid-cols-[minmax(0,1.85fr)_minmax(270px,0.85fr)]">
      <section className="min-w-0 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:p-6 lg:p-7">
        <StepBar current={step} labels={steps} />
        <div ref={formRef} tabIndex={-1} className="space-y-5 outline-none" aria-label={`Step ${step + 1}: ${steps[step]}`}>
          {step === 0 && <div className="space-y-5"><div><h2 className="text-xl font-bold text-slate-900">Who is the patient?</h2><p className="mt-1 text-sm text-slate-600">Search for an existing patient before creating a new record.</p></div>
            <div className="grid grid-cols-2 gap-2 rounded-2xl bg-slate-100 p-1">{[{ key: 'existing', label: 'Existing Patient' }, { key: 'new', label: 'Register New Patient' }].map((o) => <button key={o.key} type="button" aria-pressed={patientMode === o.key} onClick={() => { setPatientMode(o.key); setError(''); setPrecheck(null) }} className={`min-h-11 rounded-xl px-3 py-2 text-sm font-bold ${patientMode === o.key ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-600'}`}>{o.label}</button>)}</div>
            {patientMode === 'existing' ? <div className="space-y-3"><label className="block text-sm font-semibold text-slate-800" htmlFor="appointment-patient-search">Find Patient</label><div className="relative"><MdSearch className="absolute left-4 top-3.5 text-slate-400"/><input id="appointment-patient-search" value={search} onChange={(e) => { setSearch(e.target.value); setSelectedPatient(null) }} className="min-h-11 w-full rounded-xl border border-slate-300 py-3 pl-11 pr-3 text-sm outline-none focus:border-emerald-600" placeholder="Search by name or phone" /></div>{searchLoading && <p role="status" className="text-sm text-slate-500">Searching patients…</p>}{patientResults.length > 0 && <div className="overflow-hidden rounded-2xl border border-slate-200">{patientResults.map((p) => <button type="button" key={p.id} onClick={() => selectExistingPatient(p)} className="block w-full border-b border-slate-100 px-4 py-3 text-left hover:bg-slate-50 last:border-none"><strong className="text-sm text-slate-900">{outpatientName(p)}</strong><span className="ml-2 block text-xs text-slate-500 sm:inline">{p.phone || 'No phone'} · {p.email || 'No email'}</span></button>)}</div>}{selectedPatient && <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-4"><p className="font-bold text-emerald-950">Selected: {outpatientName(selectedPatient)}</p><p className="text-xs text-emerald-800">{selectedPatient.phone || 'No phone number'}</p></div>}{!selectedPatient && search.length >= 2 && !patientResults.length && !searchLoading && <p className="text-sm text-slate-600">No matching patient found. Check the spelling or register a new patient.</p>}</div> : <div className="grid gap-4 sm:grid-cols-2"><div className="sm:col-span-2"><Field label="Full Name" required value={patientFields.full_name} disabled={Boolean(createdPatientId)} onChange={(v) => setPatientFields((p) => ({ ...p, full_name: v }))} /></div><Field label="Birthdate (Optional if age is provided; 18+)" type="date" min={getMinPatientBirthdate()} max={getMaxPatientBirthdate()} disabled={Boolean(createdPatientId)} value={patientFields.birthdate} onChange={(v) => setPatientFields((p) => ({ ...p, birthdate: v, reported_age: v ? '' : p.reported_age }))} /><Field label="Age (Required without birthdate; 18+)" type="number" min="18" max="120" value={patientFields.reported_age} disabled={Boolean(createdPatientId) || Boolean(patientFields.birthdate)} onChange={(v) => setPatientFields((p) => ({ ...p, reported_age:v }))}/><Field label="Mobile Number (Optional for walk-in)" value={patientFields.phone} disabled={Boolean(createdPatientId)} placeholder="09XXXXXXXXX" onChange={(v) => setPatientFields((p) => ({ ...p, phone: v }))} /><label className="block text-xs font-bold uppercase text-slate-600">Gender *<select value={patientFields.sex} disabled={Boolean(createdPatientId)} onChange={(e) => setPatientFields((p) => ({ ...p, sex: e.target.value }))} className="mt-1.5 min-h-11 w-full rounded-xl border border-slate-300 bg-white px-3"><option value="">Select gender</option><option>Male</option><option>Female</option><option>Other</option></select></label><div className="sm:col-span-2"><Field label="Address" value={patientFields.address} disabled={Boolean(createdPatientId)} onChange={(v) => setPatientFields((p) => ({ ...p, address: v }))}/></div><div className="sm:col-span-2"><Field label="Email (Optional)" type="email" value={patientFields.email} disabled={Boolean(createdPatientId)} onChange={(v) => setPatientFields((p) => ({ ...p, email: v }))} /></div><label className="sm:col-span-2 flex items-start gap-2 rounded-xl border border-slate-200 bg-slate-50 p-3 text-sm"><input type="checkbox" disabled={Boolean(createdPatientId)} checked={patientFields.consent_given} onChange={(e) => setPatientFields((p) => ({ ...p, consent_given: e.target.checked }))} className="mt-1"/> The patient has provided the required privacy consent.</label>{createdPatientId && <p className="sm:col-span-2 text-xs text-sky-700">Patient record created. It will be reused if appointment submission needs a retry.</p>}</div>}</div>}
          {visitType === 'scheduled' && step === 1 && <StepService category={serviceCategory} onCategoryChange={(category) => { setServiceCategory(category); if (category !== 'all' && form.clinicType && form.clinicType !== category) setForm(emptyVisit()) }} value={form.service} onChange={chooseService} services={availableServices} readiness={{ medical: { bookable: true }, derma: { bookable: true } }} readinessLoading={false} readinessError="" loading={servicesLoading} error={servicesError} onRetry={loadServices} onRetryReadiness={loadServices} />}
          {visitType === 'scheduled' && step === 2 && <StepDoctor clinicType={form.clinicType} value={form.doctor} onChange={chooseDoctor} doctorList={doctorList} loadingDoctors={doctorLoading} doctorError={doctorError} onRetry={loadDoctors} />}
          {visitType === 'scheduled' && step === 3 && <div className="space-y-3">{scheduleError && <p role="alert" className="rounded-xl border border-rose-200 bg-rose-50 p-3 text-sm text-rose-700">{scheduleError}</p>}<StepSchedule date={form.date} time={form.time} onDateChange={(date) => setForm((p) => ({ ...p, date, time: '' }))} onTimeChange={(time) => setForm((p) => ({ ...p, time }))} timeSlots={availableSlots} doctorSchedules={doctorSchedules} unavailableDates={unavailableDates} loadingSlots={slotsLoading} slotsError={slotsError} /></div>}
          {visitType === 'walk_in' && step === 1 && <div className="space-y-5"><h2 className="text-xl font-bold text-slate-900">Walk-in Visit Details</h2><p className="rounded-xl border border-sky-200 bg-sky-50 p-3 text-xs text-sky-900">No service selection is needed at check-in. The doctor records the actual services during consultation; billing calculates the charges after completion.</p><div><p className="mb-2 text-sm font-semibold text-slate-700">Clinic Department</p><div className="grid grid-cols-2 gap-2">{[{ id: 'medical', label: 'General Medicine' }, { id: 'derma', label: 'Dermatology' }].map((c) => <button type="button" key={c.id} aria-pressed={form.clinicType === c.id} onClick={() => setForm((p) => ({ ...p, clinicType: c.id, doctor: null, reason: '', reasonDetails: '' }))} className={`min-h-12 rounded-xl border-2 px-3 py-2 text-sm font-semibold ${form.clinicType === c.id ? 'border-emerald-600 bg-emerald-50' : 'border-slate-200 bg-white'}`}>{c.label}</button>)}</div></div>{form.clinicType && <><div><p className="mb-2 text-sm font-semibold text-slate-700">Doctor accepting walk-ins</p>{walkInLoading && <p role="status" className="text-sm text-slate-500">Checking currently available doctors…</p>}{walkInError && <p role="alert" className="text-sm text-red-700">{walkInError}</p>}{!walkInLoading && !walkInError && !walkInDoctors.length && <p className="rounded-xl bg-amber-50 p-4 text-sm text-amber-900">No doctors are assigned to this department at the selected clinic branch.</p>}<div className="grid gap-2 sm:grid-cols-2">{walkInDoctors.map((d) => <button key={d.id} type="button" disabled={!d.available_now||walkInLoading} aria-pressed={form.doctor?.id === d.id} onClick={() => setForm((p) => ({ ...p, doctor: d }))} className={`rounded-xl border-2 p-4 text-left transition-colors ${form.doctor?.id === d.id ? 'border-emerald-600 bg-emerald-50' : d.available_now ? 'border-slate-200 hover:border-emerald-300' : 'border-slate-200 bg-slate-50 opacity-75'}`}><p className="font-bold text-slate-900">{outpatientName(d)}</p><p className={`mt-1 text-xs ${d.available_now?'text-emerald-700':'text-amber-700'}`}>{d.available_now?'Accepting walk-ins':d.availability_reason||'Not accepting walk-ins'}</p><p className="mt-1 text-xs text-slate-500">{d.current_schedule||'Outside scheduled working hours'} · {d.active_queue_count||0} in queue</p></button>)}</div></div><StepDetails reason={form.reason} reasonDetails={form.reasonDetails} notes={form.notes} reasonOptions={reasons} loadingReasons={reasonsLoading} onReasonChange={(reason) => setForm((p) => ({ ...p, reason, reasonDetails: '' }))} onReasonDetailsChange={(reasonDetails) => setForm((p) => ({ ...p, reasonDetails }))} onNotesChange={(notes) => setForm((p) => ({ ...p, notes }))} /></>}</div>}
          {step === steps.length - 1 && <div className="space-y-5"><h2 className="text-xl font-bold text-slate-900">Review & {visitType === 'walk_in' ? 'Check In' : 'Create Appointment'}</h2><div className="rounded-xl bg-slate-50 p-4 lg:hidden">{summary}</div>{visitType === 'scheduled' && <StepDetails reason={form.reason} reasonDetails={form.reasonDetails} notes={form.notes} reasonOptions={reasons} loadingReasons={reasonsLoading} onReasonChange={(reason) => setForm((p) => ({ ...p, reason, reasonDetails: '' }))} onReasonDetailsChange={(reasonDetails) => setForm((p) => ({ ...p, reasonDetails }))} onNotesChange={(notes) => setForm((p) => ({ ...p, notes }))} />}{visitType === 'scheduled' && form.service && <p className="rounded-xl bg-emerald-50 p-4 text-sm text-emerald-900">Standard service price: <strong>{formatPublicServicePrice(form.service)}</strong>. Actual charges are confirmed at checkout.</p>}{visitType === 'walk_in' && precheck?.today_appointment && <div className="rounded-xl border border-amber-300 bg-amber-50 p-4 text-sm text-amber-900"><strong>Patient already has an appointment today.</strong><p className="mt-2">The system will check in appointment #{precheck.today_appointment.id} instead of creating a duplicate visit.</p></div>}{visitType === 'walk_in' && <p className="rounded-xl bg-sky-50 p-3 text-sm text-sky-900">The queue will assign the check-in time and number. Payment is handled at checkout, not during check-in.</p>}<p className="text-sm text-slate-600">Please explain the clinic rules to the patient. <a href="/booking-policy" target="_blank" rel="noopener noreferrer" className="font-semibold text-emerald-800 underline">Read Booking Policy</a></p><label className="flex items-start gap-3 rounded-xl border border-slate-200 p-4 text-sm text-slate-800"><input type="checkbox" checked={informedPatient} onChange={(e) => setInformedPatient(e.target.checked)} className="mt-1 h-5 w-5 accent-emerald-700" /><span>I have checked these details and informed the patient about the clinic's appointment policy.</span></label></div>}
        </div>
        {error && <div role="alert" className="mt-5 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-semibold text-red-700">{error}</div>}
        <div className="mt-7 flex flex-wrap items-center justify-between gap-3 border-t border-slate-200 pt-5"><button type="button" disabled={busy} onClick={() => step === 0 ? navigate(appointmentsUrl) : (setError(''), setStep((i) => i - 1))} className="min-h-11 rounded-xl border border-slate-300 bg-white px-5 py-2.5 text-sm font-semibold text-slate-700 disabled:opacity-50">{step === 0 ? 'Cancel' : 'Back'}</button>{step < steps.length - 1 ? <button type="button" disabled={busy || checkingQueue || !stepReady()} onClick={next} className="inline-flex min-h-11 items-center gap-2 rounded-xl bg-[#0b1a2c] px-5 py-2.5 text-sm font-bold text-white disabled:opacity-40">Continue <MdArrowForward /></button> : <button type="button" disabled={busy || !stepReady() || !patientReady} onClick={submit} className="inline-flex min-h-11 items-center gap-2 rounded-xl bg-emerald-700 px-5 py-2.5 text-sm font-bold text-white disabled:opacity-40">{busy ? 'Processing…' : visitType === 'walk_in' ? 'Check In Patient' : 'Create Appointment'} <MdCheck /></button>}</div>
      </section>
      <aside className="hidden rounded-2xl border border-slate-200 bg-white p-5 shadow-sm lg:sticky lg:top-5 lg:block">{summary}</aside>
    </div>
    {noShowWarning && <div className="fixed inset-0 z-[90] flex items-center justify-center bg-black/50 p-4"><div role="alertdialog" aria-modal="true" aria-labelledby="no-show-title" className="w-full max-w-md rounded-2xl bg-white p-6 shadow-xl"><MdWarningAmber className="text-3xl text-amber-600"/><h2 id="no-show-title" className="mt-2 text-lg font-bold text-slate-900">Previous missed appointment</h2><p className="mt-2 text-sm text-slate-600">{noShowWarning.message}</p><p className="mt-2 text-xs text-slate-500">Check clinic policy before proceeding. This manual override is recorded with the booking.</p><div className="mt-5 flex flex-wrap justify-end gap-2"><button type="button" onClick={() => setNoShowWarning(null)} className="rounded-xl border border-slate-200 px-4 py-2 text-sm font-semibold">Go Back</button><button type="button" disabled={busy} onClick={() => { setNoShowWarning(null); void submit(true) }} className="rounded-xl bg-[#0b1a2c] px-4 py-2 text-sm font-bold text-white disabled:opacity-40">Continue Anyway</button></div></div></div>}
    {blocker.state === 'blocked' && <div className="fixed inset-0 z-[80] flex items-center justify-center bg-black/50 p-4"><div role="alertdialog" aria-modal="true" aria-labelledby="unsaved-title" className="w-full max-w-md rounded-2xl bg-white p-6 shadow-xl"><MdWarningAmber className="text-3xl text-amber-600"/><h2 id="unsaved-title" className="mt-2 text-lg font-bold text-slate-900">Leave this appointment?</h2><p className="mt-2 text-sm text-slate-600">Your changes have not been submitted. Leaving this page will discard the unfinished form.</p><div className="mt-5 flex justify-end gap-2"><button type="button" onClick={() => blocker.reset()} className="rounded-xl border border-slate-200 px-4 py-2 text-sm font-semibold">Keep Editing</button><button type="button" onClick={() => blocker.proceed()} className="rounded-xl bg-rose-700 px-4 py-2 text-sm font-bold text-white">Discard & Leave</button></div></div></div>}
  </div>
}



