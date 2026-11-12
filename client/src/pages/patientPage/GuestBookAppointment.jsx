import { useCallback, useEffect, useRef, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { MdArrowForward, MdCalendarToday, MdCheckCircle, MdChevronLeft, MdLock, MdRefresh, MdSms } from 'react-icons/md'
import { StepBar, StepService, StepDoctor, StepSchedule, StepDetails, BookingSummary } from './BookAppointment'
import { GUEST_BOOKING_STEPS, guestPatientError, normalizeGuestPhone, normalizeGuestServices } from '../../utils/guestBookingFlow.mjs'
import { getClinicToday, getMinPatientBirthdate } from '../../utils/patientBirthdate.mjs'
import { normalizeBookingServiceResults } from '../../utils/patientBookingFlow.mjs'
import { buildBookingPolicyUrl } from '../../utils/bookingPolicyNavigation.mjs'
import { getGuestBranches, guestRequest, guestPost } from '../../services/guestBooking.service'

const emptyVisit = () => ({ clinicType: '', service: null, doctor: null, date: '', time: '', reason: '', reasonDetails: '', notes: '' })
const emptyPatient = () => ({ full_name: '', gender: '', birthdate: '', reported_age: '', phone: '', email: '', address: '', consent_given: false })
const list = value => Array.isArray(value) ? value : Array.isArray(value?.items) ? value.items : []
const query = (path, parameters) => path + '?' + new URLSearchParams(parameters)
const inputClass = 'mt-1.5 min-h-11 w-full rounded-xl border border-slate-300 bg-white px-3 py-2.5 text-sm text-slate-800 outline-none focus:border-emerald-600 focus:ring-2 focus:ring-emerald-100 disabled:bg-slate-50 disabled:text-slate-600'
const pendingKey = phone => 'carait.guest.pending.' + phone
const readPending = phone => { try { return sessionStorage.getItem(pendingKey(phone)) } catch { return null } }
const savePending = (phone, key) => { try { sessionStorage.setItem(pendingKey(phone), key) } catch { /* Booking retries still retain the key in memory. */ } }
const clearPending = phone => { try { sessionStorage.removeItem(pendingKey(phone)) } catch { /* Storage may be unavailable. */ } }
const Field = ({ label, ...props }) => <label className="block min-w-0"><span className="text-xs font-bold uppercase tracking-wide text-slate-600">{label}</span><input {...props} className={inputClass} /></label>

export default function GuestBookAppointment() {
  const navigate = useNavigate()
  const [step, setStep] = useState(0)
  const [branches, setBranches] = useState([])
  const [branchId, setBranchId] = useState('')
  const [branchError, setBranchError] = useState('')
  const [phone, setPhone] = useState('')
  const [code, setCode] = useState('')
  const [verification, setVerification] = useState({ verified: false })
  const [verificationLoading, setVerificationLoading] = useState(true)
  const [phoneBusy, setPhoneBusy] = useState(false)
  const [resendAt, setResendAt] = useState(0)
  const [clock, setClock] = useState(Date.now())
  const [message, setMessage] = useState('')
  const [error, setError] = useState('')
  const [recoveryBusy, setRecoveryBusy] = useState(false)
  const [form, setForm] = useState(emptyVisit)
  const [patient, setPatient] = useState(emptyPatient)
  const [category, setCategory] = useState('all')
  const [services, setServices] = useState([])
  const [readiness, setReadiness] = useState({})
  const [serviceLoading, setServiceLoading] = useState(false)
  const [serviceError, setServiceError] = useState('')
  const [doctors, setDoctors] = useState({ medical: [], derma: [] })
  const [doctorLoading, setDoctorLoading] = useState(false)
  const [doctorError, setDoctorError] = useState('')
  const [schedules, setSchedules] = useState([])
  const [unavailable, setUnavailable] = useState([])
  const [scheduleLoading, setScheduleLoading] = useState(false)
  const [scheduleError, setScheduleError] = useState('')
  const [slots, setSlots] = useState([])
  const [slotsLoading, setSlotsLoading] = useState(false)
  const [slotsError, setSlotsError] = useState('')
  const [reasons, setReasons] = useState([])
  const [reasonsLoading, setReasonsLoading] = useState(false)
  const [reasonsError, setReasonsError] = useState('')
  const [reload, setReload] = useState(0)
  const [submitting, setSubmitting] = useState(false)
  const submitted = useRef(false)
  const intent = useRef(null)
  const contentRef = useRef(null)
  const normalizedPhone = normalizeGuestPhone(phone)
  const verified = verification.verified && verification.phone === normalizedPhone && Date.parse(verification.expires_at) > clock
  const quota = verified ? verification.daily_limit : null
  const profileLocked = verified && Boolean(verification.patient)
  const branchName = branches.find(branch => String(branch.id) === branchId)?.name || 'Select a clinic branch'
  const retry = () => setReload(value => value + 1)

  const openStatus = useCallback(result => {
    clearPending(normalizeGuestPhone(phone) || verification.phone)
    navigate('/guest/appointments/' + result.id + '#' + encodeURIComponent(result.access_token), { replace: true })
  }, [navigate, phone, verification.phone])

  const recover = useCallback(async verifiedNumber => {
    const key = readPending(verifiedNumber)
    if (!key) return
    setRecoveryBusy(true)
    try {
      const result = await guestPost('appointments/recover', { phone: verifiedNumber, submission_key: key })
      clearPending(verifiedNumber)
      navigate('/guest/appointments/' + result.id + '#' + encodeURIComponent(result.access_token), { replace: true })
    } catch (failure) {
      if (failure.status === 404) clearPending(verifiedNumber)
      else setError(failure.message)
    } finally { setRecoveryBusy(false) }
  }, [navigate])

  const applyVerification = useCallback(result => {
    setVerification(result)
    if (!result.verified) return
    setPhone('0' + result.phone.slice(2))
    if (result.patient) setPatient({ ...emptyPatient(), ...result.patient, reported_age: String(result.patient.reported_age ?? ''), consent_given: false })
    void recover(result.phone)
  }, [recover])

  useEffect(() => {
    let active = true
    getGuestBranches().then(result => {
      if (!active) return
      const rows = list(result)
      setBranches(rows)
      if (rows.length === 1) setBranchId(String(rows[0].id))
    }).catch(() => { if (active) setBranchError('Could not load clinic branches. Refresh this page to try again.') })
    guestRequest('phone/status').then(result => { if (active) applyVerification(result) }).catch(() => {}).finally(() => { if (active) setVerificationLoading(false) })
    return () => { active = false }
  }, [applyVerification])
  useEffect(() => { const timer = window.setInterval(() => setClock(Date.now()), 1000); return () => window.clearInterval(timer) }, [])
  useEffect(() => { contentRef.current?.focus() }, [step])

  useEffect(() => {
    if (!branchId) { setServices([]); setReadiness({}); setServiceLoading(false); setDoctorLoading(false); return }
    let active = true
    setServiceLoading(true); setServiceError('')
    Promise.all([
      Promise.allSettled(['medical', 'derma'].map(clinic_type => guestRequest(query('booking-services', { branch_id: branchId, clinic_type })))),
      guestRequest(query('booking-readiness', { branch_id: branchId })),
    ]).then(([results, availability]) => {
      if (!active) return
      const failed = results.some(result => result.status === 'rejected')
      setServices(normalizeGuestServices(normalizeBookingServiceResults(results)))
      setReadiness(availability)
      if (failed) setServiceError('Some services could not be loaded. Try again before continuing.')
    }).catch(failure => { if (active) { setServices([]); setReadiness({}); setServiceError(failure.message) } }).finally(() => { if (active) setServiceLoading(false) })
    setDoctorLoading(true); setDoctorError('')
    guestRequest(query('doctors/availability', { branch_id: branchId, start_date: getClinicToday(), days: '7' })).then(result => {
      if (!active) return
      const available = Array.isArray(result.doctors) ? result.doctors : []
      setDoctors(Object.fromEntries(['medical', 'derma'].map(type => [type, available.filter(doctor => doctor.clinic_type === type && (doctor.weekly_schedule || []).some(schedule => Number(schedule.is_active) !== 0))])))
    }).catch(failure => { if (active) { setDoctors({ medical: [], derma: [] }); setDoctorError(failure.message) } }).finally(() => { if (active) setDoctorLoading(false) })
    return () => { active = false }
  }, [branchId, reload])

  useEffect(() => {
    setSchedules([]); setUnavailable([]); setScheduleError('')
    if (!branchId || !form.doctor) { setScheduleLoading(false); return }
    let active = true
    setScheduleLoading(true)
    Promise.all([
      guestRequest(query('doctors/' + form.doctor.id + '/schedule', { branch_id: branchId })),
      guestRequest(query('doctors/' + form.doctor.id + '/unavailable-dates', { branch_id: branchId, start_date: getClinicToday() })),
    ]).then(([weekly, blocked]) => { if (active) { setSchedules(list(weekly)); setUnavailable(list(blocked)) } })
      .catch(failure => { if (active) setScheduleError(failure.message) }).finally(() => { if (active) setScheduleLoading(false) })
    return () => { active = false }
  }, [branchId, form.doctor, reload])

  useEffect(() => {
    setSlots([]); setSlotsError('')
    if (!branchId || !form.doctor || !form.service || !form.date) { setSlotsLoading(false); return }
    let active = true
    setSlotsLoading(true)
    guestRequest(query('doctors/' + form.doctor.id + '/available-slots', { branch_id: branchId, clinic_type: form.clinicType, service_id: String(form.service.id), date: form.date }))
      .then(result => { if (active) setSlots(Array.isArray(result.slots) ? result.slots : []) })
      .catch(failure => { if (active) setSlotsError(failure.message) }).finally(() => { if (active) setSlotsLoading(false) })
    return () => { active = false }
  }, [branchId, form.doctor, form.service, form.clinicType, form.date, reload])

  useEffect(() => {
    setReasons([])
    if (!branchId || !form.clinicType) { setReasonsLoading(false); setReasonsError(''); return }
    let active = true
    setReasonsLoading(true); setReasonsError('')
    guestRequest(query('appointment-reasons', { branch_id: branchId, clinic_type: form.clinicType })).then(result => {
      if (!active) return
      const options = list(result).filter(reason => Number(reason.is_active ?? 1) !== 0)
      setReasons(options.some(reason => reason.label === 'Other') ? options : [...options, { id: 'other', label: 'Other' }])
    }).catch(failure => { if (active) { setReasons([{ id: 'other', label: 'Other' }]); setReasonsError(failure.message) } }).finally(() => { if (active) setReasonsLoading(false) })
    return () => { active = false }
  }, [branchId, form.clinicType, reload])

  const changeVisit = updates => {
    intent.current = null
    if (normalizedPhone) clearPending(normalizedPhone)
    setError('')
    setForm(current => ({ ...current, ...updates }))
  }
  const requestCode = async () => {
    if (!normalizedPhone || phoneBusy) return
    setPhoneBusy(true); setError(''); setMessage('')
    try {
      const result = await guestPost('phone/request-code', { phone: normalizedPhone })
      setResendAt(Date.now() + Number(result.resend_after_seconds || 60) * 1000)
      setMessage('We sent a 6-digit code to your mobile number. It expires in 10 minutes.')
    } catch (failure) { setError(failure.message); if (failure.retryAfter > 0) setResendAt(Date.now() + failure.retryAfter * 1000) } finally { setPhoneBusy(false) }
  }
  const verifyCode = async () => {
    if (phoneBusy || !/^\d{6}$/.test(code)) return
    setPhoneBusy(true); setError(''); setMessage('')
    try { applyVerification(await guestPost('phone/verify-code', { phone: normalizedPhone, code })); setCode(''); setMessage('Your mobile number is verified.') }
    catch (failure) { setError(failure.message) } finally { setPhoneBusy(false) }
  }
  const patientError = guestPatientError(patient)
  const reasonValid = reasons.some(reason => reason.label === form.reason) && (form.reason !== 'Other' || form.reasonDetails.trim().length >= 2)
  const unavailableGuest = verification.requires_sign_in || verification.needs_clinic_help
  const canContinue = verified && !recoveryBusy && !unavailableGuest && (quota?.remaining ?? 1) > 0 && (
    step === 0 ? Boolean(branchId) && !readPending(normalizedPhone) : step === 1 ? Boolean(form.service) && !serviceLoading && !serviceError : step === 2 ? Boolean(form.doctor) && !doctorLoading : step === 3 ? Boolean(form.date && form.time && slots.includes(form.time)) && !slotsLoading && !scheduleLoading && !scheduleError : !patientError && reasonValid && !reasonsLoading
  )
  const submit = async () => {
    if (!canContinue || submitting || submitted.current) return
    submitted.current = true; setSubmitting(true); setError('')
    try {
      const key = intent.current || readPending(normalizedPhone) || crypto.randomUUID()
      intent.current = key; savePending(normalizedPhone, key)
      const result = await guestPost('appointments', {
        ...patient, phone: normalizedPhone, branch_id: Number(branchId), clinic_type: form.clinicType,
        doctor_id: Number(form.doctor.id), requested_service_id: Number(form.service.id),
        appointment_date: form.date, appointment_time: form.time, reason: form.reason, reason_details: form.reasonDetails, notes: form.notes,
        submission_key: key,
      })
      openStatus(result)
    } catch (failure) {
      setError(failure.message)
      if (failure.code === 'GUEST_PHONE_VERIFICATION_REQUIRED') { setVerification({ verified: false }); setStep(0) }
      if (failure.code === 'GUEST_DAILY_LIMIT') setVerification(current => ({ ...current, daily_limit: failure.details }))
    } finally { submitted.current = false; setSubmitting(false) }
  }
  const updatePatient = (key, value) => setPatient(current => ({ ...current, [key]: value }))
  const resendSeconds = Math.max(0, Math.ceil((resendAt - clock) / 1000))

  return <main className="min-h-screen bg-slate-50 px-4 py-7 sm:px-6 sm:py-10">
    <div className="mx-auto max-w-6xl space-y-5">
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div><Link to="/" className="text-sm font-semibold text-emerald-700">← Carait Clinic</Link><h1 className="mt-3 flex items-center gap-2 text-2xl font-bold text-slate-900"><MdCalendarToday className="shrink-0 text-emerald-700" />Guest Online Appointment</h1><p className="mt-1 text-sm text-slate-600">Book without creating a patient portal account.</p></div>
        <label className="block w-full sm:w-72"><span className="text-xs font-bold uppercase tracking-wide text-slate-600">Clinic branch</span><select aria-label="Clinic branch" value={branchId} onChange={event => { setBranchId(event.target.value); setForm(emptyVisit()); intent.current = null; setStep(verified ? 1 : 0); setError('') }} className={inputClass}><option value="">Choose a clinic branch</option>{branches.map(branch => <option key={branch.id} value={branch.id}>{branch.name}</option>)}</select></label>
      </header>
      {branchError && <p role="alert" className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">{branchError}</p>}
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-950"><p><strong>Before you book:</strong> Arrive 10 minutes early. The clinic confirms each request.</p><a href={buildBookingPolicyUrl({ branchId, clinicType: form.clinicType, serviceId: form.service?.id, doctorId: form.doctor?.id })} target="_blank" rel="noopener noreferrer" className="font-bold underline underline-offset-2">Read booking policy</a></div>
      <div className="flex flex-wrap items-start justify-between gap-3 rounded-xl border border-sky-200 bg-sky-50 px-4 py-3 text-sm text-sky-900"><p>Up to <strong>3 guest bookings per verified mobile number each day</strong>. The limit resets at midnight, Philippine time.{quota && <span className="mt-1 block font-semibold">{quota.remaining} of {quota.limit} bookings remaining today.</span>}</p><p>Guest bookings use regular prices. <Link to="/patient/login?next=%2Fpatient%2Fbook" className="font-bold underline">Sign in for eligible patient promotions.</Link></p></div>
      <div className="grid items-start gap-5 lg:grid-cols-[minmax(0,1.7fr)_minmax(270px,0.85fr)]">
        <section className="min-w-0 overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
          <div className="p-4 sm:p-6 lg:p-7">
            <StepBar current={step} labels={GUEST_BOOKING_STEPS} />
            <div ref={contentRef} tabIndex={-1} className="outline-none" aria-label={GUEST_BOOKING_STEPS[step]}>
              {step === 0 && <section className="space-y-5" aria-labelledby="guest-phone-title">
                <div><h2 id="guest-phone-title" className="flex items-center gap-2 text-xl font-bold text-slate-900"><MdSms className="text-emerald-700" />Verify your mobile number</h2><p className="mt-1 text-sm leading-relaxed text-slate-600">Enter the SMS code sent to your number before requesting an appointment.</p></div>
                <Field label="Mobile number" type="tel" autoComplete="tel" inputMode="tel" maxLength={16} placeholder="09XXXXXXXXX" value={phone} disabled={phoneBusy || verificationLoading} onChange={event => { setPhone(event.target.value); setCode(''); setMessage(''); setVerification({ verified: false }); intent.current = null }} />
                {verificationLoading ? <p role="status" className="text-sm text-slate-500">Checking mobile verification…</p> : verified ? <div role="status" className="rounded-xl border border-emerald-200 bg-emerald-50 p-4 text-sm font-semibold text-emerald-800"><MdCheckCircle className="mr-2 inline" />Mobile number verified.</div> : <div className="space-y-4"><button type="button" className="button-secondary" onClick={requestCode} disabled={!normalizedPhone || phoneBusy || resendSeconds > 0}>{phoneBusy ? 'Please wait…' : resendSeconds ? 'Resend code in ' + resendSeconds + 's' : 'Send verification code'}</button><Field label="SMS verification code" inputMode="numeric" autoComplete="one-time-code" maxLength={6} value={code} onChange={event => setCode(event.target.value.replace(/\D/g, ''))} placeholder="6-digit code" /><button type="button" className="button-primary" onClick={verifyCode} disabled={phoneBusy || !/^\d{6}$/.test(code)}>Verify mobile number</button></div>}
                {message && <p role="status" className="text-sm text-emerald-800">{message}</p>}
                {recoveryBusy && <p role="status" className="text-sm text-sky-700">Checking your earlier booking request…</p>}
                {verified && readPending(normalizedPhone) && !recoveryBusy && <button type="button" className="button-secondary" onClick={() => void recover(normalizedPhone)}>Check earlier request</button>}
                {verified && verification.requires_sign_in && <p role="alert" className="rounded-xl bg-amber-50 p-4 text-sm text-amber-900">This mobile number is linked to a patient account. <Link className="font-bold underline" to="/patient/login">Sign in to book an appointment.</Link></p>}
                {verified && verification.needs_clinic_help && <p role="alert" className="rounded-xl bg-amber-50 p-4 text-sm text-amber-900">Please contact the clinic to confirm the patient record for this number.</p>}
              </section>}
              {step === 1 && <StepService category={category} onCategoryChange={setCategory} value={form.service} onChange={service => changeVisit({ ...emptyVisit(), service, clinicType: service.booking_clinic_type })} services={services} branchId={branchId} readiness={readiness} readinessLoading={serviceLoading} readinessError={serviceError} loading={serviceLoading} error={serviceError} onRetry={retry} onRetryReadiness={retry} allowPromotions={false} />}
              {step === 2 && <StepDoctor clinicType={form.clinicType} service={form.service} value={form.doctor} onChange={doctor => changeVisit({ doctor, date: '', time: '' })} doctorList={doctors} loadingDoctors={doctorLoading} doctorError={doctorError} onRetry={retry} />}
              {step === 3 && <div className="space-y-3"><StepSchedule date={form.date} time={form.time} onDateChange={date => changeVisit({ date, time: '' })} onTimeChange={time => changeVisit({ time })} timeSlots={slots} doctorSchedules={schedules} unavailableDates={unavailable} loadingSlots={slotsLoading || scheduleLoading} slotsError={slotsError || scheduleError} service={form.service} />{(scheduleError || slotsError) && <button type="button" className="button-secondary" onClick={retry}><MdRefresh />Retry availability</button>}</div>}
              {step === 4 && <div className="space-y-6">
                <section className="space-y-4" aria-labelledby="guest-patient-title"><div><h2 id="guest-patient-title" className="text-lg font-bold text-slate-900">Patient information</h2><p className="mt-1 text-sm text-slate-600">{profileLocked ? 'Your saved guest details have been loaded for this verified number. Contact the clinic to correct them.' : 'Provide your name, gender, and age or birthdate. Email and address are optional.'}</p></div><div className="grid gap-4 sm:grid-cols-2">
                  <div className="sm:col-span-2"><Field label="Full name *" maxLength={150} autoComplete="name" value={patient.full_name} disabled={profileLocked} onChange={event => updatePatient('full_name', event.target.value)} /></div>
                  <label className="block"><span className="text-xs font-bold uppercase tracking-wide text-slate-600">Gender *</span><select aria-label="Gender" value={patient.gender} disabled={profileLocked} onChange={event => updatePatient('gender', event.target.value)} className={inputClass}><option value="">Select gender</option><option>Male</option><option>Female</option><option>Other</option></select></label>
                  <Field label="Verified mobile number" value={phone} readOnly />
                  <Field label="Birthdate (optional if age is provided)" type="date" min={getMinPatientBirthdate()} max={getClinicToday()} value={patient.birthdate} disabled={profileLocked} onChange={event => setPatient(current => ({ ...current, birthdate: event.target.value, reported_age: event.target.value ? '' : current.reported_age }))} />
                  <Field label="Age (required without birthdate)" type="number" min="0" max="120" value={patient.reported_age} disabled={profileLocked || Boolean(patient.birthdate)} onChange={event => updatePatient('reported_age', event.target.value)} />
                  <Field label="Email address (optional)" type="email" maxLength={150} autoComplete="email" value={patient.email} disabled={profileLocked} onChange={event => updatePatient('email', event.target.value)} />
                  <Field label="Address (optional)" maxLength={500} autoComplete="street-address" value={patient.address} disabled={profileLocked} onChange={event => updatePatient('address', event.target.value)} />
                </div></section>
                <section className="border-t border-slate-100 pt-5">{reasonsError && <p className="mb-3 rounded-xl bg-amber-50 p-3 text-sm text-amber-800">Custom reasons could not be loaded. Choose Other and describe your concern, or <button type="button" className="font-bold underline" onClick={retry}>try again</button>.</p>}<StepDetails reason={form.reason} reasonDetails={form.reasonDetails} notes={form.notes} reasonOptions={reasons} loadingReasons={reasonsLoading} onReasonChange={reason => changeVisit({ reason, reasonDetails: reason === 'Other' ? form.reasonDetails : '' })} onReasonDetailsChange={reasonDetails => changeVisit({ reasonDetails })} onNotesChange={notes => changeVisit({ notes })} /></section>
                <div className="rounded-xl border border-slate-200 bg-slate-50 p-4 lg:hidden"><BookingSummary form={form} branchName={branchName} /></div>
                <label className="flex items-start gap-3 rounded-xl border border-slate-200 bg-slate-50 p-4 text-sm text-slate-700"><input type="checkbox" checked={patient.consent_given} onChange={event => updatePatient('consent_given', event.target.checked)} className="mt-1" /><span>I have read the <Link to="/privacy-policy" target="_blank" className="font-bold text-emerald-700 underline">Privacy Policy</Link> and consent to processing my booking details.</span></label>
                <p className="flex items-start gap-2 text-xs leading-relaxed text-slate-500"><MdLock className="mt-0.5 shrink-0" />After submitting, save your private booking link to view updates. The clinic will not send automatic appointment emails or SMS for this guest booking.</p>
              </div>}
            </div>
            {error && <p role="alert" className="mt-5 rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">{error}</p>}
            {verified && quota?.remaining === 0 && <p role="alert" className="mt-5 rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">You have used your 3 guest bookings today. You can request another tomorrow, Philippine time.</p>}
            {step > 0 && !verified && <p role="alert" className="mt-5 rounded-xl bg-amber-50 p-4 text-sm text-amber-900">Verify your mobile number again before submitting. <button type="button" className="font-bold underline" onClick={() => setStep(0)}>Return to verification</button></p>}
            <div className="mt-7 flex items-center justify-between gap-3 border-t border-slate-100 pt-5">
              <button type="button" disabled={step === 0 || submitting} onClick={() => setStep(value => Math.max(0, value - 1))} className="inline-flex min-h-11 items-center gap-1 rounded-xl border border-slate-200 px-4 text-sm font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-30"><MdChevronLeft />Back</button>
              <button type="button" disabled={!canContinue || submitting} onClick={() => step === 4 ? void submit() : setStep(value => value + 1)} className="inline-flex min-h-11 items-center gap-2 rounded-xl bg-emerald-700 px-5 text-sm font-bold text-white hover:bg-emerald-800 disabled:cursor-not-allowed disabled:opacity-40">{step === 4 ? submitting ? 'Submitting…' : 'Request Appointment' : 'Continue'}{step < 4 && <MdArrowForward />}</button>
            </div>
          </div>
        </section>
        <aside className="hidden rounded-2xl border border-slate-200 bg-white p-5 shadow-sm lg:sticky lg:top-20 lg:block" aria-label="Appointment summary"><BookingSummary form={form} branchName={branchName} /></aside>
      </div>
    </div>
  </main>
}
