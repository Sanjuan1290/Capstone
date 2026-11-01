import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  MdAdd,
  MdCalendarToday,
  MdCheck,
  MdPriorityHigh,
  MdTune,
  MdCheckCircle,
  MdClose,
  MdRefresh,
  MdSearch,
  MdPersonAdd,
  MdBadge,
  MdPhone,
  MdEmail,
  MdHome,
} from 'react-icons/md'
import { formatDateOnly, getLocalDateOnly } from '../../utils/date'
import Pagination from '../../components/ui/Pagination'
import { APPOINTMENT_PAGE_SIZES, appointmentStats, filterAppointmentList, isAwaitingAction, hasRescheduleRequest, paginateAppointments, sortAppointmentList, visiblePageNumbers } from '../../utils/appointmentList.mjs'
import { getClinicToday, getMinPatientBirthdate } from '../../utils/patientBirthdate.mjs'
import CancellationReasonModal from '../../components/appointments/CancellationReasonModal'
import {
  formatAppointmentRange,
  formatAppointmentTimeRange,
  formatDurationMinutes,
  getReservedDurationMinutes,
  roundToBookingBlock,
} from '../../utils/appointmentTime'

const maxPatientBirthdate = getClinicToday
const minPatientBirthdate = getMinPatientBirthdate

const STATUS_TABS = [
  { key: 'all', label: 'All Appointments' },
  { key: 'needs_action', label: 'Needs Attention' },
  { key: 'pending', label: 'Pending' },
  { key: 'confirmed', label: 'Confirmed' },
  { key: 'completed', label: 'Completed' },
  { key: 'cancelled', label: 'Cancelled' },
  { key: 'rescheduled', label: 'Rescheduled' },
  { key: 'no_show', label: 'Did Not Arrive' },
  { key: 'rejected', label: 'Rejected' },
]

const STATUS_STYLES = {
  pending: 'bg-amber-50 text-amber-700 border-amber-200',
  confirmed: 'bg-emerald-50 text-emerald-700 border-emerald-200',
  completed: 'bg-slate-100 text-slate-600 border-slate-200',
  cancelled: 'bg-red-50 text-red-600 border-red-200',
  rescheduled: 'bg-sky-50 text-sky-700 border-sky-200',
  no_show: 'bg-rose-50 text-rose-700 border-rose-200',
  rejected: 'bg-violet-50 text-violet-700 border-violet-200',
}

const buttonBase = 'rounded-xl px-3 py-2 text-xs font-semibold transition'

const formatDate = (value) => formatDateOnly(value)

const formatStatus = (value) => value?.replace('_', ' ').replace(/\b\w/g, (m) => m.toUpperCase()) || 'Unknown'
const isPendingReschedule = (appt) => appt?.status === 'pending' && Boolean(appt?.reschedule_requested_at)
const reminderReasonText = {
  patient_email_not_verified: 'The patient needs to verify their email address in Settings.',
  patient_email_missing: 'No patient email address is saved.',
  email_disabled_in_reminder_settings: 'Email reminders are disabled in System Setup.',
  sms_disabled_in_reminder_settings: 'SMS reminders are disabled in System Setup.',
  patient_phone_not_verified: 'The patient phone number has not been verified.',
  patient_phone_missing: 'No patient phone number is saved.',
  sms_provider_not_configured: 'The SMS provider is not configured on the server.',
  cooldown: 'A reminder was sent or started within the last ten minutes.',
  already_queued: 'This reminder has already been queued.',
  not_confirmed_or_not_future_or_no_consent: 'Only future confirmed appointments with contact consent can receive reminders.',
  appointment_changed: 'The appointment was changed before delivery.',
  provider_error: 'The delivery provider reported an error. Review the delivery log.',
}
const formatReminderResult = (entry) => `${entry.channel === 'email' ? 'Email' : 'SMS'}: ${entry.status}${entry.reason ? ` — ${reminderReasonText[entry.reason] || entry.reason.replace(/_/g, ' ')}` : ''}`
const clinicLabel = (value) => value === 'derma' ? 'Dermatology' : value === 'medical' ? 'General Medicine' : 'Other'
const getActionsForStatus = (status) => {
  if (status === 'pending') return ['confirm', 'cancel', 'reschedule']
  if (status === 'confirmed') return ['cancel', 'reschedule', 'no_show']
  if (status === 'rescheduled') return ['confirm', 'cancel', 'reschedule']
  return ['view']
}

const StatusBadge = ({ status, appointment }) => (
  isPendingReschedule(appointment) ? <span className="inline-flex rounded-full border border-violet-200 bg-violet-50 px-2.5 py-1 text-[11px] font-bold text-violet-800">Reschedule Request</span> : (
  <span className={`inline-flex rounded-full border px-2.5 py-1 text-[11px] font-bold ${STATUS_STYLES[status] || 'bg-slate-100 text-slate-600 border-slate-200'}`}>
    {formatStatus(status)}
  </span>
  )
)

const ActionDialog = ({ title, message, details, confirmText = 'Continue', confirmTone = 'bg-[#0b1a2c]', onCancel, onConfirm, busy = false }) => (
 <div className="fixed inset-0 z-[110] flex items-center justify-center bg-slate-950/60 p-4" onMouseDown={(event)=>{if(event.target===event.currentTarget&&!busy)onCancel()}}>
  <section role="alertdialog" aria-modal="true" aria-labelledby="appointment-action-title" className="w-full max-w-md rounded-3xl bg-white p-6 shadow-2xl">
   <div className="mb-4 flex h-11 w-11 items-center justify-center rounded-2xl bg-sky-50"><MdCalendarToday className="text-2xl text-sky-700"/></div>
   <h2 id="appointment-action-title" className="text-lg font-black text-slate-900">{title}</h2>
   <p className="mt-2 whitespace-pre-line text-sm leading-relaxed text-slate-700">{message}</p>
   {details && <p className="mt-3 rounded-xl bg-amber-50 p-3 text-xs text-amber-900 whitespace-pre-line">{details}</p>}
   <div className="mt-6 flex flex-wrap justify-end gap-2"><button type="button" disabled={busy} className="rounded-xl border border-slate-200 px-4 py-2.5 text-sm font-bold text-slate-700" onClick={onCancel}>{onConfirm?'Cancel':'Close'}</button>{onConfirm && <button type="button" disabled={busy} autoFocus className={`rounded-xl px-4 py-2.5 text-sm font-bold text-white disabled:opacity-50 ${confirmTone}`} onClick={onConfirm}>{busy?'Working…':confirmText}</button>}</div>
  </section>
 </div>
)

const ActionButtons = ({ appointment, busyId, onConfirm, onCancel, onNoShow, onReschedule, onView, onReminder, compact = false }) => {
  const actions = getActionsForStatus(appointment.status)
  const busy = busyId === appointment.id

  if (compact) return (
    <div className="flex flex-wrap items-center gap-2">
      <button type="button" disabled={busy} onClick={() => onView(appointment)} className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-700 transition hover:border-sky-300 hover:bg-sky-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-sky-600">
        {isPendingReschedule(appointment) ? 'Review Request' : 'View Details'}
      </button>
      {appointment.status === 'pending' && !isPendingReschedule(appointment) && (
        <button type="button" disabled={busy} onClick={() => onConfirm(appointment)} className="rounded-xl bg-emerald-700 px-3 py-2 text-xs font-semibold text-white transition hover:bg-emerald-800 disabled:opacity-50">Confirm</button>
      )}
    </div>
  )

  return (
    <div className="flex flex-wrap gap-2">
      {actions.includes('confirm') && (
        <button disabled={busy} onClick={() => onConfirm(appointment)} className={`${buttonBase} bg-emerald-600 text-white hover:bg-emerald-700 disabled:opacity-60`}>
          Confirm
        </button>
      )}
      {appointment.status === 'confirmed' && typeof onReminder === 'function' && (
        <button disabled={busy} onClick={() => onReminder(appointment)} className={`${buttonBase} bg-amber-50 text-amber-800 hover:bg-amber-100 disabled:opacity-60`}>
          Send Reminder
        </button>
      )}
      {actions.includes('cancel') && (
        <button disabled={busy} onClick={() => onCancel(appointment)} className={`${buttonBase} bg-red-50 text-red-600 hover:bg-red-100 disabled:opacity-60`}>
          Cancel
        </button>
      )}
      {actions.includes('reschedule') && (
        <button disabled={busy} onClick={() => onReschedule(appointment)} className={`${buttonBase} bg-sky-50 text-sky-700 hover:bg-sky-100 disabled:opacity-60`}>
          Reschedule
        </button>
      )}
      {actions.includes('no_show') && (
        <button disabled={busy} onClick={() => onNoShow(appointment)} className={`${buttonBase} bg-rose-50 text-rose-700 hover:bg-rose-100 disabled:opacity-60`}>
          Mark as Did Not Arrive
        </button>
      )}

    </div>
  )
}

const TimeSlotPicker = ({ date, value, onChange, availableSlots = [], loading = false, emptyMessage = 'No slots available for this day.' }) => {
  if (!date) return <div className="rounded-2xl border border-dashed border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-400">Select a date first to view available time slots.</div>
  if (loading) return <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-400">Checking duration-aware availability…</div>
  if (!availableSlots.length) return <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-400">{emptyMessage}</div>
  return <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">{availableSlots.map((slot)=><button key={slot} type="button" onClick={()=>onChange(slot)} className={`rounded-xl border-2 px-3 py-3 text-xs font-semibold transition ${value===slot?'border-transparent bg-[#0b1a2c] text-emerald-400 shadow-md':'border-slate-200 bg-white text-slate-600 hover:border-emerald-300 hover:bg-emerald-50'}`}>{slot}</button>)}</div>
}

const RescheduleDrawer = ({ appointment, services, onClose, onSave }) => {
  const [date, setDate] = useState(appointment?.appointment_date?.slice(0,10) || '')
  const [time, setTime] = useState(appointment?.appointment_time || appointment?.time || '')
  const [availableSlots, setAvailableSlots] = useState([])
  const [slotsLoading, setSlotsLoading] = useState(false)
  const [saving, setSaving] = useState(false)

  useEffect(()=>{ setDate(appointment?.appointment_date?.slice(0,10)||''); setTime(appointment?.appointment_time||appointment?.time||'') },[appointment])
  useEffect(()=>{
    if (!appointment?.doctor_id || !date || !services.getAppointmentAvailableSlots) { setAvailableSlots([]); return }
    let active=true; setSlotsLoading(true)
    services.getAppointmentAvailableSlots(appointment.doctor_id,{date,appointmentId:appointment.id,clinicType:appointment.clinic_type})
      .then((result)=>{ if(!active)return; const slots=Array.isArray(result?.slots)?result.slots:[]; setAvailableSlots(slots); setTime((current)=>current&&slots.includes(current)?current:'') })
      .catch(()=>active&&setAvailableSlots([])).finally(()=>active&&setSlotsLoading(false))
    return()=>{active=false}
  },[appointment,date,services])

  const handleSubmit=async()=>{ if(!date||!time||date<getLocalDateOnly())return; setSaving(true); try{await onSave(date,time);onClose()}finally{setSaving(false)} }

  return <>
    <div className="fixed inset-0 z-40 bg-black/40" onClick={onClose}/>
    <div className="fixed inset-x-0 bottom-0 z-50 flex max-h-[92vh] flex-col overflow-hidden rounded-t-3xl bg-white shadow-2xl sm:left-1/2 sm:top-1/2 sm:bottom-auto sm:w-full sm:max-w-md sm:max-h-[88vh] sm:-translate-x-1/2 sm:-translate-y-1/2 sm:rounded-3xl">
      <div className="shrink-0 border-b border-slate-100 p-5 pb-4">
        <div className="flex items-center justify-between gap-3">
          <div>
            <p className="text-sm font-bold text-slate-800">Reschedule Appointment</p>
            <p className="text-xs text-slate-500">{appointment.patient_name||appointment.patient}</p>
            <p className="mt-1 text-[11px] font-semibold text-sky-700">{appointment.requested_service_name_snapshot || 'Service'} · {formatDurationMinutes(getReservedDurationMinutes(appointment))} reserved</p>
          </div>
          <button onClick={onClose} className="rounded-xl p-2 text-slate-400 hover:bg-slate-100"><MdClose/></button>
        </div>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-5 py-4">
        <div className="space-y-4">
          <label className="block">
            <span className="mb-1 block text-xs font-bold uppercase tracking-widest text-slate-400">Date</span>
            <input type="date" value={date} onChange={(e)=>{setDate(e.target.value);setTime('')}} min={getLocalDateOnly()} className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm outline-none focus:border-sky-400"/>
          </label>
          <div>
            <span className="mb-1 block text-xs font-bold uppercase tracking-widest text-slate-400">Time</span>
            <TimeSlotPicker date={date} value={time} onChange={setTime} availableSlots={availableSlots} loading={slotsLoading} emptyMessage="No start time can fit the full service duration on this date."/>
          </div>
        </div>
      </div>

      <div className="shrink-0 border-t border-slate-100 bg-white p-5 pt-4">
        <div className="flex gap-3">
          <button onClick={onClose} className="flex-1 rounded-2xl border border-slate-200 py-3 text-sm font-semibold text-slate-600">Cancel</button>
          <button onClick={handleSubmit} disabled={!date||!time||saving} className="flex-1 rounded-2xl bg-[#0b1a2c] py-3 text-sm font-semibold text-white disabled:opacity-60">{saving?'Saving...':'Save'}</button>
        </div>
      </div>
    </div>
  </>
}

const AppointmentViewModal = ({ appointment, onClose, busyId, onConfirm, onCancel, onNoShow, onReschedule, onReminder }) => {
  if (!appointment) return null
  return (
    <>
      <div className="fixed inset-0 z-40 bg-black/40" onClick={onClose} />
      <div className="fixed inset-x-0 bottom-0 z-50 rounded-t-3xl bg-white p-5 shadow-2xl sm:left-1/2 sm:top-1/2 sm:bottom-auto sm:w-full sm:max-w-lg sm:-translate-x-1/2 sm:-translate-y-1/2 sm:rounded-3xl max-h-[92vh] overflow-y-auto">
        <div className="mb-4 flex items-center justify-between">
          <div>
            <p className="text-sm font-bold text-slate-800">{appointment.patient_name || appointment.patient}</p>
            <p className="text-xs text-slate-500">{appointment.doctor}</p>
          </div>
          <button onClick={onClose} className="rounded-xl p-2 text-slate-400 hover:bg-slate-100">
            <MdClose />
          </button>
        </div>

        <div className="grid gap-3 rounded-3xl bg-slate-50 p-4 text-sm text-slate-700 sm:grid-cols-2">
          <div><span className="block text-xs text-slate-400">Date</span>{formatDate(appointment.appointment_date || appointment.date)}</div>
          <div><span className="block text-xs text-slate-400">Schedule</span>{formatAppointmentRange(appointment)}</div>
          <div><span className="block text-xs text-slate-400">Appointment Length</span>{formatDurationMinutes(getReservedDurationMinutes(appointment))}</div>
          <div><span className="block text-xs text-slate-400">Service</span>{appointment.requested_service_name_snapshot || '—'}</div>
          <div><span className="block text-xs text-slate-400">Reason</span>{appointment.reason || '—'}</div>
          {isPendingReschedule(appointment) && <div className="sm:col-span-2 rounded-2xl border border-violet-200 bg-violet-50 p-3"><p className="font-bold text-violet-900">Patient requested a new appointment time</p><p className="mt-1 text-sm text-violet-800">Reason: {appointment.reschedule_reason || 'Not provided'}</p>{appointment.reschedule_details && <p className="mt-1 text-xs text-violet-700">Details: {appointment.reschedule_details}</p>}<p className="mt-2 text-xs text-violet-600">Previous schedule: {appointment.reschedule_previous_date ? formatDate(appointment.reschedule_previous_date) : '—'} {appointment.reschedule_previous_time || ''}</p></div>}
          <div><span className="block text-xs text-slate-400">Notes</span>{appointment.notes || '—'}</div>
          <div><span className="block text-xs text-slate-400">Status</span>{formatStatus(appointment.status)}</div>
          {appointment.status === 'pending' && appointment.confirmation_deadline_at && <div><span className="block text-xs text-slate-400">Confirmation Deadline</span>{new Date(String(appointment.confirmation_deadline_at).replace(' ', 'T')).toLocaleString('en-PH', { dateStyle: 'medium', timeStyle: 'short' })}</div>}
          <div><span className="block text-xs text-slate-400">Phone</span>{appointment.patient_phone || '—'}</div>
          <div><span className="block text-xs text-slate-400">Email</span>{appointment.patient_email || '—'}</div>
          {appointment.status === 'rejected' && <div className="sm:col-span-2 rounded-2xl border border-violet-100 bg-violet-50 p-3"><span className="block text-xs font-bold text-violet-500">Rejection Reason</span><p className="mt-1 font-semibold text-violet-800">{appointment.rejection_reason === 'confirmation_timeout' ? 'Clinic confirmation deadline passed' : (appointment.rejection_reason || 'Not recorded')}</p></div>}
          {appointment.status === 'cancelled' && <div className="sm:col-span-2 rounded-2xl border border-red-100 bg-red-50 p-3"><span className="block text-xs font-bold text-red-500">Reason for Cancellation</span><p className="mt-1 font-semibold text-red-800">{appointment.cancellation_reason_snapshot || 'Not recorded'}</p>{appointment.cancellation_details && <p className="mt-1 text-xs text-red-700">{appointment.cancellation_details}</p>}</div>}
        </div>
        {!['completed', 'cancelled', 'rejected', 'no_show'].includes(appointment.status) && (
          <div className="mt-4 border-t border-slate-100 pt-4">
            <p className="mb-2 text-sm font-semibold text-slate-800">Appointment actions</p>
            <ActionButtons appointment={appointment} busyId={busyId} onConfirm={onConfirm} onCancel={onCancel} onNoShow={onNoShow} onReschedule={onReschedule} onReminder={onReminder} onView={() => {}} />
          </div>
        )}
      </div>
    </>
  )
}

const AddAppointmentModal = ({ services, onClose, onCreated }) => {
  const [patients, setPatients] = useState([])
  const [doctors, setDoctors] = useState([])
  const [serviceOptions, setServiceOptions] = useState([])
  const [availableSlots, setAvailableSlots] = useState([])
  const [slotsLoading, setSlotsLoading] = useState(false)
  const [search, setSearch] = useState('')
  const [mode, setMode] = useState('existing')
  const [visitType, setVisitType] = useState('scheduled')
  const [walkInDoctors, setWalkInDoctors] = useState([])
  const [walkInLoading, setWalkInLoading] = useState(false)
  const [createdPatientId, setCreatedPatientId] = useState(null)
  const [queueReceipt, setQueueReceipt] = useState(null)
  const [step, setStep] = useState(1)
  const [selectedPatient, setSelectedPatient] = useState(null)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [noShowWarning, setNoShowWarning] = useState(null)
  const [form, setForm] = useState({
    patient_id: '',
    doctor_id: '',
    clinic_type: 'medical',
    requested_service_id: '',
    reason: '',
    appointment_date: '',
    appointment_time: '',
    notes: '',
  })
  const [patientForm, setPatientForm] = useState({
    full_name: '',
    birthdate: '',
    sex: 'Female',
    civil_status: 'Single',
    phone: '',
    address: '',
    email: '',
    consent_given: true,
  })

  useEffect(() => {
    services.getDoctors?.().then((rows) => setDoctors(Array.isArray(rows) ? rows : [])).catch(() => {})
  }, [services])

  useEffect(() => {
    if (mode !== 'existing' || search.trim().length < 2 || (selectedPatient?.full_name || selectedPatient?.name) === search) {
      setPatients([])
      return
    }
    const timeout = window.setTimeout(() => {
      services.getPatients?.(search).then((rows) => setPatients(Array.isArray(rows) ? rows : [])).catch(() => {})
    }, 300)
    return () => window.clearTimeout(timeout)
  }, [mode, search, selectedPatient, services])

  const filteredDoctors = doctors.filter((doctor) => String(doctor.clinic_type || doctor.type || '') === form.clinic_type)
  const selectedDoctor = (visitType === 'walk_in' ? walkInDoctors : doctors).find((doctor) => String(doctor.id) === String(form.doctor_id))
  const selectedService = serviceOptions.find((service) => String(service.id) === String(form.requested_service_id))

  useEffect(() => {
    if (visitType !== 'scheduled' || !services.getBookingServices) { setServiceOptions([]); return }
    let active = true
    setServiceOptions([])
    services.getBookingServices(form.clinic_type)
      .then((rows) => {
        if (!active) return
        setServiceOptions((Array.isArray(rows) ? rows : []).filter((service) =>
          Number(service.is_active ?? 1) === 1 && ['all', form.clinic_type].includes(String(service.clinic_type || ''))))
      })
      .catch(() => { if (active) setServiceOptions([]) })
    return () => { active = false }
  }, [form.clinic_type, services, visitType])

  useEffect(() => {
    if (visitType !== 'walk_in' || !services.getWalkInAvailableDoctors) { setWalkInDoctors([]); return }
    let active = true
    setWalkInLoading(true)
    services.getWalkInAvailableDoctors(form.clinic_type)
      .then((response) => { if (active) setWalkInDoctors((response?.doctors || []).filter((d) => d.available_now)) })
      .catch(() => { if (active) setWalkInDoctors([]) })
      .finally(() => { if (active) setWalkInLoading(false) })
    return () => { active = false }
  }, [visitType, form.clinic_type, services])

  useEffect(() => {
    if (visitType !== 'scheduled' || !form.doctor_id || !form.appointment_date || !form.requested_service_id || !services.getAppointmentAvailableSlots) { setAvailableSlots([]); return }
    let active=true; setSlotsLoading(true)
    services.getAppointmentAvailableSlots(form.doctor_id,{date:form.appointment_date,serviceId:form.requested_service_id,clinicType:form.clinic_type})
      .then((result)=>{ if(!active)return; const slots=Array.isArray(result?.slots)?result.slots:[]; setAvailableSlots(slots); setForm((current)=>current.appointment_time&&!slots.includes(current.appointment_time)?{...current,appointment_time:''}:current) })
      .catch(()=>active&&setAvailableSlots([])).finally(()=>active&&setSlotsLoading(false))
    return()=>{active=false}
  }, [form.doctor_id, form.appointment_date, form.requested_service_id, form.clinic_type, services, visitType])

  const patientReady = mode === 'existing'
    ? Boolean(form.patient_id && selectedPatient)
    : Boolean(patientForm.full_name.trim() && patientForm.birthdate && patientForm.phone.trim() && patientForm.consent_given)
  const scheduleReady = visitType === 'walk_in'
    ? Boolean(form.doctor_id && form.reason.trim() && walkInDoctors.some((d) => String(d.id) === String(form.doctor_id)))
    : Boolean(form.requested_service_id && form.doctor_id && form.appointment_date && form.appointment_time && form.reason.trim())

  const goNext = () => {
    setError('')
    if (step === 1 && !patientReady) {
      setError(mode === 'existing' ? 'Select a patient before continuing.' : 'Complete the required patient details and confirm privacy consent.')
      return
    }
    if (step === 2 && !scheduleReady) {
      setError(visitType === 'walk_in' ? 'Choose a currently available doctor and a reason for this walk-in.' : 'Select the service, doctor, date, time, and appointment reason before continuing.')
      return
    }
    setStep((current) => Math.min(3, current + 1))
  }

  const handleCreate = async (overrideNoShowWarning = false) => {
    setSaving(true)
    setError('')
    try {
      let patientId = mode === 'new' ? createdPatientId : form.patient_id
      if (mode === 'new' && !patientId) {
        const createdPatient = await services.createWalkInPatient?.(patientForm)
        patientId = createdPatient?.id
        if (patientId) setCreatedPatientId(patientId) // Reuse after a failed booking/queue request.
      }
      if (!patientId) throw new Error('Select an existing patient or complete the new patient details first.')
      if (visitType === 'walk_in') {
        if (!services.getQueuePrecheck || !services.addToQueue) throw new Error('Walk-in registration is not available for this role.')
        const precheck = await services.getQueuePrecheck(patientId)
        if (precheck?.active_queue) throw new Error('This patient is already in today’s queue. Open the Walk-in Queue to continue.')
        const existing = precheck?.today_appointment
        if (existing && !window.confirm(`This patient already has an appointment today with ${existing.doctor_name || 'their doctor'}. Check in to that appointment instead of creating another visit?`)) {
          throw new Error('Walk-in registration cancelled. Review the patient’s existing appointment.')
        }
        const queued = await services.addToQueue({
          patient_id: patientId,
          patient_name: patientName,
          doctor_id: existing ? existing.doctor_id : Number(form.doctor_id),
          type: existing ? existing.clinic_type : form.clinic_type,
          reason: existing ? (existing.reason || form.reason) : form.reason,
          ...(existing ? {check_in_appointment_id:existing.id} : {}),
        })
        setQueueReceipt(queued)
        await onCreated().catch(() => {})
      } else {
        await services.createAppointment({
          ...form,
          patient_id: patientId,
          override_no_show_warning: overrideNoShowWarning,
        })
        await onCreated()
        onClose()
      }
    } catch (err) {
      if (err.code === 'NO_SHOW_WARNING') {
        setNoShowWarning({ message: err.message, policy: err.policy, lastNoShow: err.last_no_show })
      } else {
        setError(err.message || 'Failed to create appointment.')
      }
    } finally {
      setSaving(false)
    }
  }

  const patientName = mode === 'existing'
    ? selectedPatient?.full_name || selectedPatient?.name || '—'
    : patientForm.full_name || '—'

  const steps = [
    { number: 1, label: 'Patient' },
    { number: 2, label: 'Visit Details' },
    { number: 3, label: 'Review' },
  ]

  return (
    <>
      <div className="fixed inset-0 z-40 bg-black/40" onClick={saving ? undefined : onClose} />
      <div className="fixed inset-x-0 bottom-0 z-50 h-[100dvh] bg-white shadow-2xl sm:left-1/2 sm:top-1/2 sm:h-auto sm:max-h-[92vh] sm:w-full sm:max-w-2xl sm:-translate-x-1/2 sm:-translate-y-1/2 sm:rounded-3xl">
        <div className="flex h-full flex-col sm:max-h-[92vh]">
          <div className="border-b border-slate-100 px-4 py-4 sm:px-6">
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="text-base font-bold text-slate-900">New Appointment</p>
                <p className="mt-0.5 text-xs text-slate-500">Choose a patient, select scheduled or walk-in, then review.</p>
              </div>
              <button disabled={saving} onClick={onClose} className="rounded-xl p-2 text-slate-400 hover:bg-slate-100 disabled:opacity-40"><MdClose /></button>
            </div>
            <div className="mt-4 grid grid-cols-3 gap-2 rounded-2xl bg-slate-100 p-1">
              {steps.map((item) => (
                <div key={item.number} className={`flex items-center justify-center gap-2 rounded-xl px-2 py-2.5 text-xs font-bold transition ${step === item.number ? 'bg-white text-slate-900 shadow-sm' : step > item.number ? 'text-emerald-700' : 'text-slate-400'}`}>
                  <span className={`flex h-5 w-5 items-center justify-center rounded-full text-[10px] ${step > item.number ? 'bg-emerald-100 text-emerald-700' : step === item.number ? 'bg-[#0b1a2c] text-white' : 'bg-slate-200 text-slate-500'}`}>
                    {step > item.number ? <MdCheck /> : item.number}
                  </span>
                  {item.label}
                </div>
              ))}
            </div>
          </div>

          <div className="flex-1 overflow-y-auto px-4 py-5 sm:px-6">
            {step === 1 && (
              <div className="space-y-5">
                <div className="grid grid-cols-2 gap-2 rounded-2xl bg-slate-100 p-1">
                  {[
                    { key: 'existing', label: 'Existing Patient' },
                    { key: 'new', label: 'Register New Patient' },
                  ].map((option) => (
                    <button
                      key={option.key}
                      type="button"
                      onClick={() => {
                        setMode(option.key)
                        setCreatedPatientId(null)
                        setError('')
                        setSelectedPatient(null)
                        setForm((prev) => ({ ...prev, patient_id: '' }))
                        setSearch('')
                      }}
                      className={`rounded-xl px-4 py-2.5 text-sm font-semibold transition ${mode === option.key ? 'bg-white text-slate-800 shadow-sm' : 'text-slate-500'}`}
                    >
                      {option.label}
                    </button>
                  ))}
                </div>

                {mode === 'existing' ? (
                  <div>
                    <label className="block">
                      <span className="mb-1.5 block text-xs font-bold uppercase tracking-widest text-slate-400">Patient</span>
                      <div className="relative">
                        <MdSearch className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" />
                        <input
                          value={search}
                          onChange={(e) => {
                            setSearch(e.target.value)
                            if (selectedPatient && e.target.value !== (selectedPatient.full_name || selectedPatient.name)) {
                              setSelectedPatient(null)
                              setForm((prev) => ({ ...prev, patient_id: '' }))
                            }
                          }}
                          className="w-full rounded-2xl border border-slate-200 bg-slate-50 py-3 pl-11 pr-4 text-sm outline-none focus:border-sky-400"
                          placeholder="Search patient by name"
                        />
                      </div>
                    </label>
                    {patients.length > 0 && (
                      <div className="mt-2 max-h-48 overflow-auto rounded-2xl border border-slate-200 bg-white shadow-sm">
                        {patients.map((patient) => (
                          <button
                            type="button"
                            key={patient.id}
                            onClick={() => {
                              setForm((prev) => ({ ...prev, patient_id: patient.id }))
                              setSelectedPatient(patient)
                              setSearch(patient.full_name || patient.name)
                              setPatients([])
                            }}
                            className="block w-full border-b border-slate-100 px-4 py-3 text-left last:border-0 hover:bg-slate-50"
                          >
                            <p className="text-sm font-bold text-slate-800">{patient.full_name || patient.name}</p>
                            <p className="mt-0.5 text-xs text-slate-500">{patient.phone || 'No phone'}{patient.email ? ` · ${patient.email}` : ''}</p>
                          </button>
                        ))}
                      </div>
                    )}
                    {selectedPatient && (
                      <div className="mt-4 rounded-2xl border border-emerald-200 bg-emerald-50 p-4">
                        <div className="flex items-start gap-3">
                          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-emerald-100 text-emerald-700"><MdCheck /></div>
                          <div className="min-w-0">
                            <p className="font-bold text-slate-900">{selectedPatient.full_name || selectedPatient.name}</p>
                            <p className="mt-1 text-xs text-slate-600">{selectedPatient.phone || 'No phone'}{selectedPatient.email ? ` · ${selectedPatient.email}` : ''}</p>
                            {selectedPatient.address && <p className="mt-1 text-xs text-slate-500">{selectedPatient.address}</p>}
                          </div>
                        </div>
                      </div>
                    )}
                  </div>
                ) : (
                  <div className="grid gap-4 sm:grid-cols-2">
                    <label className="block sm:col-span-2"><span className="mb-1 block text-xs font-bold uppercase tracking-widest text-slate-400">Full Name *</span><input value={patientForm.full_name} onChange={(e) => setPatientForm((prev) => ({ ...prev, full_name: e.target.value }))} className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm outline-none focus:border-sky-400" placeholder="Patient full name" /></label>
                    <label className="block"><span className="mb-1 block text-xs font-bold uppercase tracking-widest text-slate-400">Birthdate *</span><input type="date" min={minPatientBirthdate()} max={maxPatientBirthdate()} value={patientForm.birthdate} onChange={(e) => setPatientForm((prev) => ({ ...prev, birthdate: e.target.value }))} className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm outline-none focus:border-sky-400" /></label>
                    <label className="block"><span className="mb-1 block text-xs font-bold uppercase tracking-widest text-slate-400">Phone *</span><input value={patientForm.phone} onChange={(e) => setPatientForm((prev) => ({ ...prev, phone: e.target.value }))} className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm outline-none focus:border-sky-400" placeholder="09XXXXXXXXX" /></label>
                    <label className="block"><span className="mb-1 block text-xs font-bold uppercase tracking-widest text-slate-400">Sex</span><select value={patientForm.sex} onChange={(e) => setPatientForm((prev) => ({ ...prev, sex: e.target.value }))} className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm outline-none focus:border-sky-400"><option value="Female">Female</option><option value="Male">Male</option></select></label>
                    <label className="block"><span className="mb-1 block text-xs font-bold uppercase tracking-widest text-slate-400">Civil Status</span><select value={patientForm.civil_status} onChange={(e) => setPatientForm((prev) => ({ ...prev, civil_status: e.target.value }))} className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm outline-none focus:border-sky-400"><option value="Single">Single</option><option value="Married">Married</option><option value="Widowed">Widowed</option><option value="Separated">Separated</option></select></label>
                    <label className="block sm:col-span-2"><span className="mb-1 block text-xs font-bold uppercase tracking-widest text-slate-400">Address</span><input value={patientForm.address} onChange={(e) => setPatientForm((prev) => ({ ...prev, address: e.target.value }))} className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm outline-none focus:border-sky-400" placeholder="Street, barangay, city" /></label>
                    <label className="block sm:col-span-2"><span className="mb-1 block text-xs font-bold uppercase tracking-widest text-slate-400">Email</span><input type="email" value={patientForm.email} onChange={(e) => setPatientForm((prev) => ({ ...prev, email: e.target.value }))} className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm outline-none focus:border-sky-400" placeholder="Optional email" /></label>
                    <label className="flex items-start gap-3 rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-700 sm:col-span-2"><input className="mt-1" type="checkbox" checked={patientForm.consent_given} onChange={(e) => setPatientForm((prev) => ({ ...prev, consent_given: e.target.checked }))} /><span>Data privacy consent has been obtained during intake. *</span></label>
                  </div>
                )}
              </div>
            )}

            {step === 2 && (
              <div className="space-y-5">
                <div className="grid gap-2 sm:grid-cols-2" role="group" aria-label="Visit type">
                  {[{value:'scheduled',label:'Scheduled Appointment',help:'Choose a date and available time.'},{value:'walk_in',label:'Walk-in Now',help:'Check in immediately and receive a queue number.'}].map((option) => (
                    <button type="button" key={option.value} aria-pressed={visitType===option.value}
                      onClick={()=>{setVisitType(option.value);setError('');setForm((current)=>({...current,doctor_id:'',requested_service_id:'',appointment_date:'',appointment_time:''}))}}
                      className={`rounded-2xl border p-3 text-left text-sm ${visitType===option.value?'border-emerald-500 bg-emerald-50 text-emerald-900':'border-slate-200 bg-white text-slate-700'}`}>
                      <strong className="block">{option.label}</strong><span className="mt-1 block text-xs">{option.help}</span>
                    </button>
                  ))}
                </div>
                <div className="grid gap-4 sm:grid-cols-2">
                  <label className="block"><span className="mb-1 block text-xs font-bold uppercase tracking-widest text-slate-400">Clinic Type</span><select value={form.clinic_type} onChange={(e) => setForm((prev) => ({ ...prev, clinic_type: e.target.value, requested_service_id: '', doctor_id: '', appointment_time: '' }))} className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm outline-none focus:border-sky-400"><option value="medical">Medical</option><option value="derma">Dermatology</option></select></label>
                  {visitType === 'scheduled' && <label className="block"><span className="mb-1 block text-xs font-bold uppercase tracking-widest text-slate-400">Service *</span><select value={form.requested_service_id} onChange={(e)=>setForm((prev)=>({...prev,requested_service_id:e.target.value,appointment_time:''}))} className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm outline-none focus:border-sky-400"><option value="">Select service</option>{serviceOptions.map((service)=><option key={service.id} value={service.id}>{service.service_name} · {formatDurationMinutes(roundToBookingBlock(service.average_duration_minutes || 60))} reserved</option>)}</select></label>}
                  <label className="block"><span className="mb-1 block text-xs font-bold uppercase tracking-widest text-slate-400">Doctor *</span><select value={form.doctor_id} onChange={(e) => setForm((prev) => ({ ...prev, doctor_id: e.target.value, appointment_time: '' }))} className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm outline-none focus:border-sky-400"><option value="">Select doctor</option>{(visitType === 'walk_in' ? walkInDoctors : filteredDoctors).map((doctor) => <option key={doctor.id} value={doctor.id}>{doctor.full_name || doctor.name}</option>)}</select></label>
                  {visitType === 'scheduled' && <label className="block sm:col-span-2"><span className="mb-1 block text-xs font-bold uppercase tracking-widest text-slate-400">Date *</span><input type="date" min={getLocalDateOnly()} value={form.appointment_date} onChange={(e) => setForm((prev) => ({ ...prev, appointment_date: e.target.value, appointment_time: '' }))} className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm outline-none focus:border-sky-400" /></label>}
                </div>
                {visitType === 'walk_in' && <p className="rounded-xl bg-sky-50 p-3 text-xs text-sky-800">{walkInLoading ? 'Checking doctors available now…' : 'Only doctors currently accepting walk-ins are listed. The queue will assign the visit time and number.'} No service price is automatically selected; billing is reviewed at checkout.</p>}
                {visitType === 'scheduled' && <div>
                  <span className="mb-2 block text-xs font-bold uppercase tracking-widest text-slate-400">Available Time *</span>
                  <TimeSlotPicker date={form.appointment_date} value={form.appointment_time} onChange={(slot) => setForm((prev) => ({ ...prev, appointment_time: slot }))} availableSlots={availableSlots} loading={slotsLoading} emptyMessage={form.doctor_id && form.requested_service_id ? 'No start time can fit the full service duration on this date.' : 'Select a service and doctor first to view available time slots.'} />
                </div>}
                <label className="block"><span className="mb-1 block text-xs font-bold uppercase tracking-widest text-slate-400">Reason *</span><input value={form.reason} onChange={(e) => setForm((prev) => ({ ...prev, reason: e.target.value }))} className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm outline-none focus:border-sky-400" placeholder="e.g. General Consultation" /></label>
              </div>
            )}

            {step === 3 && (
              <div className="space-y-4">
                <div className="rounded-2xl border border-slate-200 bg-slate-50 p-5">
                  <p className="text-xs font-bold uppercase tracking-widest text-slate-400">Patient</p>
                  <p className="mt-2 text-lg font-black text-slate-900">{patientName}</p>
                  <p className="mt-1 text-sm text-slate-500">{mode === 'existing' ? selectedPatient?.phone || 'No phone' : patientForm.phone}</p>
                </div>
                <div className="grid gap-3 sm:grid-cols-2">
{visitType === 'scheduled' && <div className="rounded-2xl border border-slate-200 bg-white p-4"><p className="text-xs font-bold uppercase tracking-widest text-slate-400">Service</p><p className="mt-1 font-bold text-slate-900">{selectedService?.service_name || '—'}</p><p className="text-xs text-slate-500">{selectedService ? `${formatDurationMinutes(roundToBookingBlock(selectedService.average_duration_minutes || 60))} reserved` : ''}</p></div>}                  <div className="rounded-2xl border border-slate-200 bg-white p-4"><p className="text-xs font-bold uppercase tracking-widest text-slate-400">Doctor</p><p className="mt-1 font-bold text-slate-900">{selectedDoctor?.full_name || selectedDoctor?.name || '—'}</p><p className="text-xs text-slate-500">{form.clinic_type === 'derma' ? 'Dermatology' : 'Medical'}</p></div>
                  {visitType === 'scheduled' && <div className="rounded-2xl border border-slate-200 bg-white p-4"><p className="text-xs font-bold uppercase tracking-widest text-slate-400">Schedule</p><p className="mt-1 font-bold text-slate-900">{formatDate(form.appointment_date)}</p><p className="text-xs text-slate-500">{form.appointment_time ? formatAppointmentTimeRange(form.appointment_time, roundToBookingBlock(selectedService?.average_duration_minutes || 60)) : '—'}</p></div>}
                  {visitType === 'walk_in' && <div className="rounded-2xl border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-900"><strong>Walk-in now</strong><p>The queue number and appointment time are assigned at check-in.</p></div>}
                </div>
                <div className="rounded-2xl border border-slate-200 bg-white p-4"><p className="text-xs font-bold uppercase tracking-widest text-slate-400">Reason</p><p className="mt-1 font-semibold text-slate-800">{form.reason || '—'}</p></div>
                {visitType === 'scheduled' && <label className="block"><span className="mb-1 block text-xs font-bold uppercase tracking-widest text-slate-400">Scheduling Notes</span><textarea value={form.notes} onChange={(e) => setForm((prev) => ({ ...prev, notes: e.target.value }))} rows={3} className="w-full resize-none rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm outline-none focus:border-sky-400" placeholder="Optional referral notes, symptoms, intake remarks, preferred contact, etc." /></label>}
                <div className="rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800">{visitType === 'walk_in' ? 'Review the walk-in. If the patient already has an appointment today, you will be prompted to check them in instead.' : 'Review the patient and schedule above before creating the appointment.'}</div>
              </div>
            )}

            {queueReceipt && <div role="status" className="mt-4 rounded-2xl border border-emerald-300 bg-emerald-50 p-5 text-emerald-900"><strong>Walk-in successfully checked in</strong><p className="mt-2 text-lg font-bold">Queue #{queueReceipt.queue_number}</p><p className="text-sm">Appointment #{queueReceipt.appointment_id}. {queueReceipt.checked_in_existing_appointment ? 'Existing appointment checked in.' : 'New walk-in visit linked to the queue.'}</p></div>}
            {error && <div className="mt-4 rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div>}
          </div>

          <div className="shrink-0 border-t border-slate-100 bg-white px-4 py-4 pb-[calc(env(safe-area-inset-bottom,0px)+16px)] sm:px-6">
            <div className="flex flex-col-reverse gap-3 sm:flex-row sm:items-center sm:justify-between">
              <button disabled={saving || Boolean(queueReceipt)} onClick={step === 1 ? onClose : () => { setError(''); setStep((current) => current - 1) }} className="w-full rounded-2xl border border-slate-200 px-5 py-3 text-sm font-semibold text-slate-600 disabled:opacity-50 sm:w-auto sm:min-w-[120px]">
                {step === 1 ? 'Cancel' : 'Back'}
              </button>
              {queueReceipt ? (
                <button onClick={onClose} className="w-full rounded-2xl bg-emerald-700 px-5 py-3 text-sm font-semibold text-white sm:w-auto">Done</button>
              ) : step < 3 ? (
                <button onClick={goNext} className="w-full rounded-2xl bg-[#0b1a2c] px-5 py-3 text-sm font-semibold text-white sm:w-auto sm:min-w-[140px]">Next</button>
              ) : (
                <button onClick={() => handleCreate()} disabled={saving} className="w-full rounded-2xl bg-[#0b1a2c] px-5 py-3 text-sm font-semibold text-white disabled:opacity-60 sm:w-auto sm:min-w-[180px]">{saving ? 'Creating...' : (visitType === 'walk_in' ? 'Check In Walk-in' : 'Create Appointment')}</button>
              )}
            </div>
          </div>
        </div>
      </div>

      {noShowWarning && (
        <>
          <div className="fixed inset-0 z-[60] bg-black/50" />
          <div className="fixed left-1/2 top-1/2 z-[70] w-[calc(100%-2rem)] max-w-lg -translate-x-1/2 -translate-y-1/2 rounded-3xl bg-white p-6 shadow-2xl">
            <h3 className="text-lg font-black text-slate-900">Previous No-Show</h3>
            <p className="mt-2 text-sm text-slate-600">{noShowWarning.message}</p>
            {noShowWarning.lastNoShow && <div className="mt-4 rounded-2xl bg-amber-50 p-4 text-sm text-amber-800">Last no-show: {noShowWarning.lastNoShow.appointment_date} at {noShowWarning.lastNoShow.appointment_time} with {noShowWarning.lastNoShow.doctor_name}.</div>}
            {noShowWarning.policy && <p className="mt-3 text-xs text-slate-500">Policy reminder: {noShowWarning.policy}</p>}
            <div className="mt-5 flex gap-3"><button onClick={() => setNoShowWarning(null)} className="flex-1 rounded-2xl border border-slate-200 py-3 text-sm font-semibold text-slate-600">Go Back</button><button disabled={saving} onClick={async () => { setNoShowWarning(null); await handleCreate(true) }} className="flex-1 rounded-2xl bg-[#0b1a2c] py-3 text-sm font-semibold text-white disabled:opacity-60">Continue Anyway</button></div>
          </div>
        </>
      )}
    </>
  )
}

const Appointments = ({ services }) => {
  const [appointments, setAppointments] = useState([])
  const [reminding, setReminding] = useState(null)
  const [dialog, setDialog] = useState(null)
  const [loading, setLoading] = useState(true)
  const [tab, setTab] = useState('all')
  const [sortOrder, setSortOrder] = useState('priority')
  const [pageSize, setPageSize] = useState(10)
  const [moreFilters, setMoreFilters] = useState(false)
  const [loadError, setLoadError] = useState('')
  const [query, setQuery] = useState('')
  const [dateFrom, setDateFrom] = useState('')
  const [dateTo, setDateTo] = useState('')
  const [clinicFilter, setClinicFilter] = useState('all')
  const [doctorFilter, setDoctorFilter] = useState('all')
  const [page, setPage] = useState(1)
  const [busyId, setBusyId] = useState(null)
  const [viewAppointment, setViewAppointment] = useState(null)
  const [rescheduleAppointment, setRescheduleAppointment] = useState(null)
  const [cancelAppointmentTarget, setCancelAppointmentTarget] = useState(null)
  const [showAdd, setShowAdd] = useState(false)

  const loadAppointments = useCallback(async () => {
    setLoading(true)
    setLoadError('')
    try {
      const rows = await services.getAppointments()
      setAppointments(Array.isArray(rows) ? rows : [])
    } catch (error) {
      setLoadError(error?.message || 'Appointments could not be loaded. Please try again.')
    } finally {
      setLoading(false)
    }
  }, [services])

  useEffect(() => {
    loadAppointments()
  }, [loadAppointments])

  useEffect(() => {
    const refresh = () => loadAppointments()
    window.addEventListener('clinic:refresh', refresh)
    return () => window.removeEventListener('clinic:refresh', refresh)
  }, [loadAppointments])

  const today = getClinicToday()
  const stats = useMemo(() => appointmentStats(appointments, today), [appointments, today])
  const doctorOptions = useMemo(() => Array.from(new Set(appointments.map((appointment) => appointment.doctor).filter(Boolean))).sort((a,b) => a.localeCompare(b)), [appointments])
  const clinicOptions = useMemo(() => Array.from(new Set(appointments.map((appointment) => appointment.clinic_type || appointment.type).filter(Boolean))), [appointments])
  const needsAttention = useMemo(() => sortAppointmentList(appointments.filter(isAwaitingAction), { tab: 'needs_action', today }), [appointments, today])
  const filteredAppointments = useMemo(() => {
    const filtered = filterAppointmentList(appointments, { tab, query, dateFrom, dateTo, clinicFilter, doctorFilter })
    return sortAppointmentList(filtered, { tab, order: sortOrder, today })
  }, [appointments, tab, query, dateFrom, dateTo, clinicFilter, doctorFilter, sortOrder, today])
  const pagination = useMemo(() => paginateAppointments(filteredAppointments, page, pageSize), [filteredAppointments, page, pageSize])
  const { totalPages, currentPage, items: paginatedAppointments } = pagination
  const hasFilters = Boolean(query || dateFrom || dateTo || clinicFilter !== 'all' || doctorFilter !== 'all' || tab !== 'all')

  useEffect(() => { setPage(1) }, [tab, query, dateFrom, dateTo, clinicFilter, doctorFilter, sortOrder, pageSize])

  const clearFilters = () => {
    setTab('all')
    setQuery('')
    setDateFrom('')
    setDateTo('')
    setClinicFilter('all')
    setDoctorFilter('all')
    setSortOrder('priority')
    setPage(1)
  }
  const showToday = () => {
    setTab('all')
    setDateFrom(today)
    setDateTo(today)
    setQuery('')
    setClinicFilter('all')
    setDoctorFilter('all')
    setPage(1)
  }

  const runAction = async (appointment, action) => {
    setBusyId(appointment.id)
    try {
      const result = await action()
      if (result?.message && /failed|not found|invalid/i.test(result.message)) {
        setDialog({ type: 'message', title: 'Appointment action could not be completed', message: result.message })
      } else {
        await loadAppointments()
      }
    } catch (err) {
      setDialog({ type: 'message', title: 'Appointment action could not be completed', message: err.message || 'Please try again.' })
    } finally {
      setBusyId(null)
    }
  }

  const performConfirmation = async (appointment, override = false) => {
    setDialog(null)
    setBusyId(appointment.id)
    try {
      await services.confirmAppointment(appointment.id, override ? {override_no_show_warning:true} : {})
      await loadAppointments()
    } catch (err) {
      if (err.code === 'NO_SHOW_WARNING' && !override) {
        const previous = err.last_no_show
        setDialog({type:'no_show_warning',appointment,message:err.message || 'This patient has a prior missed appointment.',details: previous ? `Last missed appointment: ${previous.appointment_date} at ${previous.appointment_time} with ${previous.doctor_name}.\n${err.policy||''}` : err.policy})
      } else setDialog({type:'message',title:'Confirmation could not be completed',message:err.message || 'Please try again.'})
    } finally { setBusyId(null) }
  }
  const handleConfirm = (appointment) => setDialog({type:'confirm',appointment})
  const handleReminder = (appointment) => {
    if (!services.sendAppointmentReminderNow) return
    setDialog({type:'reminder',appointment})
  }
  const performReminder = async (appointment) => {
    setDialog(null)
    setReminding(appointment.id)
    try {
      const result = await services.sendAppointmentReminderNow(appointment.id,['email','sms'])
      const entries = result.results || []
      const sent = entries.filter((entry) => entry.status==='sent').length
      setDialog({type:'message',title:sent ? 'Reminder results' : 'No reminders sent',message:entries.map(formatReminderResult).join('\n\n') || 'No eligible contact channels were found.',details:'The appointment status has not changed.'})
    } catch (err) { setDialog({type:'message',title:'Reminder could not be sent',message:err.message || 'Please check reminder settings and contact verification.'}) }
    finally { setReminding(null) }
  }

  const handleCancel = (appointment) => {
    setCancelAppointmentTarget(appointment)
  }
  const confirmCancellation = async (payload) => {
    if (!cancelAppointmentTarget) return
    setBusyId(cancelAppointmentTarget.id)
    try {
      await services.cancelAppointment(cancelAppointmentTarget.id, payload)
      await loadAppointments()
    } finally {
      setBusyId(null)
    }
  }
  const handleNoShow = (appointment) => {
    if (!services.markAppointmentNoShow) return
    setDialog({ type: 'no_show_confirm', appointment, title: 'Mark as Did Not Arrive?', message: `Mark ${appointment.patient_name || appointment.patient || 'this patient'} as not arrived for this appointment? This will update the appointment status.` })
  }

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-800">Appointments</h1>
          <p className="mt-1 text-sm text-slate-500">Review requests needing confirmation, manage schedules, and find previous appointments.</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button type="button" disabled={loading} onClick={loadAppointments} className="inline-flex items-center gap-2 rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm font-semibold text-slate-600 hover:bg-slate-50 disabled:opacity-50">
            <MdRefresh /> Refresh
          </button>
          {services.createAppointment && (
            <button onClick={() => setShowAdd(true)} className="inline-flex items-center gap-2 rounded-2xl bg-[#0b1a2c] px-4 py-3 text-sm font-semibold text-white">
              <MdAdd /> New Appointment
            </button>
          )}
        </div>
      </div>

      {/* Immediate priorities, visible without selecting the Pending tab. */}
      <div className="grid gap-3 sm:grid-cols-3" aria-label="Appointment summary">
        <button type="button" onClick={() => {setTab('needs_action');setDateFrom('');setDateTo('');setQuery('');setClinicFilter('all');setDoctorFilter('all')}} className="flex items-center justify-between rounded-2xl border border-amber-200 bg-amber-50 p-4 text-left transition hover:bg-amber-100 focus-visible:outline focus-visible:outline-2 focus-visible:outline-amber-700">
          <div><p className="text-sm font-semibold text-amber-900">Needs Attention</p><p className="mt-1 text-xs text-amber-800">Awaiting confirmation or reschedule review</p></div>
          <span className="ml-3 text-3xl font-black tabular-nums text-amber-900">{loading ? '…' : stats.needsAction}</span>
        </button>
        <button type="button" onClick={showToday} className="flex items-center justify-between rounded-2xl border border-sky-200 bg-sky-50 p-4 text-left transition hover:bg-sky-100 focus-visible:outline focus-visible:outline-2 focus-visible:outline-sky-700">
          <div><p className="text-sm font-semibold text-sky-900">Today's Visits</p><p className="mt-1 text-xs text-sky-700">Appointments dated today</p></div>
          <span className="ml-3 text-3xl font-black tabular-nums text-sky-900">{loading ? '…' : stats.today}</span>
        </button>
        <button type="button" onClick={clearFilters} className="flex items-center justify-between rounded-2xl border border-slate-200 bg-white p-4 text-left transition hover:bg-slate-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-slate-600">
          <div><p className="text-sm font-semibold text-slate-900">All Appointments</p><p className="mt-1 text-xs text-slate-600">View every status and date</p></div>
          <span className="ml-3 text-3xl font-black tabular-nums text-slate-900">{loading ? '…' : stats.all}</span>
        </button>
      </div>

      {!loading && !loadError && (needsAttention.length > 0 ? (
        <section aria-labelledby="needs-attention-title" className="rounded-3xl border border-amber-200 bg-amber-50/70 p-4 sm:p-5">
          <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
            <div>
              <h2 id="needs-attention-title" className="flex items-center gap-2 text-base font-bold text-slate-900"><MdPriorityHigh className="text-xl text-amber-700" /> Requests needing attention ({needsAttention.length})</h2>
              <p className="mt-1 text-sm text-slate-700">Review these requests first. They are also listed at the top of All Appointments.</p>
            </div>
            <button type="button" onClick={() => {setTab('needs_action');setDateFrom('');setDateTo('');setQuery('');setClinicFilter('all');setDoctorFilter('all')}} className="rounded-xl border border-amber-300 bg-white px-3 py-2 text-sm font-semibold text-amber-950 transition hover:bg-amber-100">View all {needsAttention.length} requests</button>
          </div>
          <div className="grid gap-2 lg:grid-cols-3">
            {needsAttention.slice(0, 3).map((appointment) => (
              <div key={appointment.id} className="rounded-2xl border border-amber-200 bg-white p-4 shadow-sm motion-safe:transition-shadow motion-safe:duration-200 hover:shadow-md">
                <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
                  <p className="text-sm font-bold text-slate-900">{appointment.patient_name || appointment.patient || 'Patient'}</p>
                  <StatusBadge status={appointment.status} appointment={appointment} />
                </div>
                <p className="text-xs text-slate-700">{formatDate(appointment.appointment_date || appointment.date)} · {formatAppointmentRange(appointment)}</p>
                <p className="mt-1 truncate text-xs text-slate-500">{appointment.requested_service_name_snapshot || appointment.reason || 'Clinic visit'} · {appointment.doctor || 'Doctor not recorded'}</p>
                <div className="mt-3 flex flex-wrap gap-2">
                  <button type="button" onClick={() => setViewAppointment(appointment)} className="rounded-xl bg-[#0b1a2c] px-3 py-2 text-xs font-semibold text-white transition hover:bg-slate-800">{hasRescheduleRequest(appointment) ? 'Review Reschedule' : 'Review Request'}</button>
                  {!hasRescheduleRequest(appointment) && <button type="button" onClick={() => handleConfirm(appointment)} className="rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs font-semibold text-emerald-800 hover:bg-emerald-100">Confirm</button>}
                </div>
              </div>
            ))}
          </div>
        </section>
      ) : (
        <div className="flex items-center gap-2 rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800"><MdCheckCircle className="shrink-0 text-lg" /> No appointments are waiting for confirmation.</div>
      ))}

      <div className="overflow-x-auto" aria-label="Filter appointments by status">
        <div className="flex min-w-max gap-2">
          {STATUS_TABS.map((status) => (
            <button
              key={status.key}
              type="button"
              aria-pressed={tab === status.key}
              onClick={() => setTab(status.key)}
              className={`rounded-full border px-4 py-2.5 text-sm font-semibold transition focus-visible:outline focus-visible:outline-2 focus-visible:outline-sky-600 ${tab === status.key ? 'border-[#0b1a2c] bg-[#0b1a2c] text-white' : 'border-slate-200 bg-white text-slate-700 hover:bg-slate-50'}`}
            >
              {status.label} <span className={`ml-1 rounded-full px-1.5 py-0.5 text-xs tabular-nums ${tab === status.key ? 'bg-white/20' : status.key === 'needs_action' && stats.needsAction ? 'bg-amber-100 text-amber-900' : 'bg-slate-100'}`}>{status.key === 'all' ? stats.all : status.key === 'needs_action' ? stats.needsAction : (stats.byStatus[status.key] || 0)}</span>
            </button>
          ))}
        </div>
      </div>

      <div className="rounded-3xl border border-slate-200 bg-white p-4">
        <div className="flex flex-wrap items-end gap-3">
          <label className="block min-w-[220px] flex-1">
            <span className="mb-1.5 block text-xs font-bold uppercase tracking-wide text-slate-600">Find an appointment</span>
            <div className="relative"><MdSearch className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" /><input value={query} onChange={(e)=>setQuery(e.target.value)} className="w-full rounded-xl border border-slate-200 bg-slate-50 py-3 pl-11 pr-4 text-sm outline-none focus:border-sky-400" placeholder="Patient, phone, email, doctor or service" /></div>
          </label>
          <button type="button" onClick={showToday} className="rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm font-semibold text-slate-700 hover:bg-slate-50">Today</button>
          <button type="button" onClick={() => setMoreFilters(current => !current)} aria-expanded={moreFilters} className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm font-semibold text-slate-700 hover:bg-slate-50"><MdTune /> {moreFilters ? 'Hide Filters' : 'More Filters'}</button>
          {hasFilters && <button type="button" onClick={clearFilters} className="rounded-xl px-3 py-3 text-sm font-semibold text-sky-800 hover:bg-sky-50">Clear All</button>}
        </div>
        {(dateFrom || dateTo || clinicFilter !== 'all' || doctorFilter !== 'all') && (
          <div className="mt-3 flex flex-wrap items-center gap-2" aria-label="Active appointment filters">
            <span className="text-xs font-semibold text-slate-600">Active filters:</span>
            {(dateFrom || dateTo) && <button type="button" onClick={() => {setDateFrom('');setDateTo('')}} className="inline-flex items-center gap-2 rounded-full bg-sky-50 px-3 py-1.5 text-xs font-semibold text-sky-900 hover:bg-sky-100">Date: {dateFrom === dateTo ? formatDate(dateFrom) : `${dateFrom ? formatDate(dateFrom) : 'Any'} – ${dateTo ? formatDate(dateTo) : 'Any'}`} <MdClose aria-hidden="true" /></button>}
            {clinicFilter !== 'all' && <button type="button" onClick={() => setClinicFilter('all')} className="inline-flex items-center gap-2 rounded-full bg-sky-50 px-3 py-1.5 text-xs font-semibold text-sky-900 hover:bg-sky-100">{clinicLabel(clinicFilter)} <MdClose aria-hidden="true" /></button>}
            {doctorFilter !== 'all' && <button type="button" onClick={() => setDoctorFilter('all')} className="inline-flex items-center gap-2 rounded-full bg-sky-50 px-3 py-1.5 text-xs font-semibold text-sky-900 hover:bg-sky-100">Doctor: {doctorFilter} <MdClose aria-hidden="true" /></button>}
          </div>
        )}
        {moreFilters && <div className="mt-4 grid gap-4 border-t border-slate-100 pt-4 md:grid-cols-2 xl:grid-cols-6">
          <label className="block">
            <span className="mb-1.5 block text-xs font-bold uppercase tracking-widest text-slate-400">From Date</span>
            <input type="date" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} className="form-control" />
          </label>
          <label className="block">
            <span className="mb-1.5 block text-xs font-bold uppercase tracking-widest text-slate-400">To Date</span>
            <input type="date" value={dateTo} onChange={(e) => setDateTo(e.target.value)} className="form-control" />
          </label>
          <label className="block">
            <span className="mb-1.5 block text-xs font-bold uppercase tracking-widest text-slate-400">Visit Type</span>
            <select value={clinicFilter} onChange={(e) => setClinicFilter(e.target.value)} className="form-control">
              <option value="all">All Visit Types</option>
              {clinicOptions.map((clinic) => <option key={clinic} value={clinic}>{clinicLabel(clinic)}</option>)}
            </select>
          </label>
          <label className="block">
            <span className="mb-1.5 block text-xs font-bold uppercase tracking-widest text-slate-400">Doctor</span>
            <select value={doctorFilter} onChange={(e) => setDoctorFilter(e.target.value)} className="form-control">
              <option value="all">All Doctors</option>
              {doctorOptions.map((doctor) => <option key={doctor} value={doctor}>{doctor}</option>)}
            </select>
          </label>
        </div>}
        <div className="mt-4 flex flex-wrap items-center justify-between gap-3 border-t border-slate-100 pt-4">
          <div>
            <p className="text-sm font-semibold text-slate-800">{filteredAppointments.length} appointment{filteredAppointments.length === 1 ? '' : 's'} found</p>
            <p className="mt-0.5 text-xs text-slate-500">{tab === 'all' && sortOrder === 'priority' ? 'Requests requiring attention appear first.' : 'Showing appointments matching your selected filters.'}</p>
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <label className="flex items-center gap-2 text-xs font-semibold text-slate-700">Sort by
              <select value={sortOrder} onChange={(event)=>setSortOrder(event.target.value)} className="rounded-lg border border-slate-200 bg-white px-2 py-2 text-sm text-slate-800">
                <option value="priority">Needs attention first</option>
                <option value="soonest">Upcoming first</option>
                <option value="newest">Newest requests</option>
              </select>
            </label>
            <label className="flex items-center gap-2 text-xs font-semibold text-slate-700">Rows per page
              <select value={pageSize} onChange={(event)=>setPageSize(Number(event.target.value))} className="rounded-lg border border-slate-200 bg-white px-2 py-2 text-sm text-slate-800">{APPOINTMENT_PAGE_SIZES.map((size)=><option key={size} value={size}>{size}</option>)}</select>
            </label>
            {totalPages > 1 && <div className="flex items-center gap-1" aria-label="Quick page controls">
              <button type="button" disabled={currentPage === 1} onClick={()=>setPage(currentPage-1)} className="rounded-lg border border-slate-200 px-3 py-2 text-xs font-semibold text-slate-700 disabled:opacity-40">Previous</button>
              <span className="px-2 text-xs font-semibold text-slate-700">{currentPage} / {totalPages}</span>
              <button type="button" disabled={currentPage === totalPages} onClick={()=>setPage(currentPage+1)} className="rounded-lg border border-slate-200 px-3 py-2 text-xs font-semibold text-slate-700 disabled:opacity-40">Next</button>
            </div>}
          </div>
        </div>
      </div>

      {loadError && <div role="alert" className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3"><p className="text-sm font-medium text-rose-800">We couldn't refresh the appointments: {loadError}</p><button type="button" onClick={loadAppointments} className="rounded-xl bg-white px-4 py-2 text-sm font-semibold text-rose-800 hover:bg-rose-100">Try Again</button></div>}
      {loading ? (
        <div className="flex h-64 items-center justify-center rounded-3xl border border-slate-200 bg-white">
          <div className="h-8 w-8 animate-spin rounded-full border-4 border-slate-200 border-t-sky-500" />
        </div>
      ) : (
        <>
          <div className="space-y-4 md:hidden">
            {paginatedAppointments.length === 0 ? (
              <div className="rounded-3xl border border-slate-200 bg-white p-10 text-center text-sm text-slate-400">{hasFilters ? 'No appointments match these filters. Try another status or clear the filters.' : 'No appointments recorded yet.'}</div>
            ) : paginatedAppointments.map((appointment) => (
              <div key={appointment.id} className="rounded-3xl border border-slate-200 bg-white p-4 shadow-sm motion-safe:transition-shadow motion-safe:duration-200">
                <div className="mb-3 flex items-start justify-between gap-3">
                  <div>
                    <p className="text-base font-bold text-slate-800">{appointment.patient_name || appointment.patient}</p>
                    <p className="text-sm text-slate-500">{appointment.doctor}</p>
                  </div>
                  <StatusBadge status={appointment.status} appointment={appointment} />
                </div>
                <div className="grid grid-cols-2 gap-3 text-sm text-slate-600">
                  <div><span className="block text-xs text-slate-400">Date</span>{formatDate(appointment.appointment_date || appointment.date)}</div>
                  <div><span className="block text-xs text-slate-400">Schedule</span>{formatAppointmentRange(appointment)}</div>
                  <div><span className="block text-xs text-slate-400">Appointment Length</span>{formatDurationMinutes(getReservedDurationMinutes(appointment))}</div>
                  <div><span className="block text-xs text-slate-400">Service</span>{appointment.requested_service_name_snapshot || '—'}</div>
                  <div><span className="block text-xs text-slate-400">Reason</span>{appointment.reason || '—'}</div>
          {isPendingReschedule(appointment) && <div className="sm:col-span-2 rounded-2xl border border-violet-200 bg-violet-50 p-3"><p className="font-bold text-violet-900">Patient requested a new appointment time</p><p className="mt-1 text-sm text-violet-800">Reason: {appointment.reschedule_reason || 'Not provided'}</p>{appointment.reschedule_details && <p className="mt-1 text-xs text-violet-700">Details: {appointment.reschedule_details}</p>}<p className="mt-2 text-xs text-violet-600">Previous schedule: {appointment.reschedule_previous_date ? formatDate(appointment.reschedule_previous_date) : '—'} {appointment.reschedule_previous_time || ''}</p></div>}
                </div>
                {isPendingReschedule(appointment) && <div className="mt-3 rounded-2xl border border-violet-200 bg-violet-50 p-3 text-xs text-violet-900"><strong>Reschedule requested</strong><p className="mt-1">Reason: {appointment.reschedule_reason || 'Not provided'}</p>{appointment.reschedule_details && <p className="mt-1">{appointment.reschedule_details}</p>}</div>}
                <div className="mt-4">
                  <ActionButtons
                    appointment={appointment}
                    busyId={reminding || busyId}
                    onConfirm={handleConfirm}
                    onCancel={handleCancel}
                    onNoShow={handleNoShow}
                    onReschedule={setRescheduleAppointment}
                    onReminder={handleReminder}
                    onView={setViewAppointment}
                    compact
                  />
                </div>
              </div>
            ))}
          </div>

          <div className="hidden overflow-x-auto rounded-3xl border border-slate-200 bg-white md:block">
            <table className="min-w-[1050px] w-full text-left">
              <thead className="bg-slate-50 text-xs uppercase tracking-widest text-slate-400">
                <tr>
                  <th className="px-5 py-4">Patient</th>
                  <th className="px-5 py-4">Doctor</th>
                  <th className="px-5 py-4">Date</th>
                  <th className="px-5 py-4">Schedule</th>
                  <th className="px-5 py-4">Service</th>
                  <th className="px-5 py-4">Reason</th>
                  <th className="px-5 py-4">Status</th>
                  <th className="px-5 py-4">Actions</th>
                </tr>
              </thead>
              <tbody>
                {paginatedAppointments.length === 0 ? (
                  <tr>
                    <td colSpan="8" className="px-5 py-12 text-center text-sm text-slate-400">{hasFilters ? 'No appointments match these filters. Try another status or clear the filters.' : 'No appointments recorded yet.'}</td>
                  </tr>
                ) : paginatedAppointments.map((appointment) => (
                  <tr key={appointment.id} className="border-t border-slate-100 align-top motion-safe:transition-colors motion-safe:duration-150 hover:bg-sky-50/30">
                    <td className="px-5 py-4">
                      <p className="text-base font-bold text-slate-900">{appointment.patient_name || appointment.patient}</p>
                    </td>
                    <td className="px-5 py-4 text-sm text-slate-600">{appointment.doctor}</td>
                    <td className="px-5 py-4 text-sm text-slate-600">{formatDate(appointment.appointment_date || appointment.date)}</td>
                    <td className="px-5 py-4 text-sm text-slate-600"><p className="font-semibold text-slate-700">{formatAppointmentRange(appointment)}</p><p className="mt-0.5 text-[11px] text-slate-400">{formatDurationMinutes(getReservedDurationMinutes(appointment))}</p></td>
                    <td className="px-5 py-4 text-sm text-slate-600">{appointment.requested_service_name_snapshot || '—'}</td>
                    <td className="px-5 py-4 text-sm text-slate-600">{appointment.reason || '—'}{isPendingReschedule(appointment) && <div className="mt-2 max-w-[240px] rounded-xl border border-violet-200 bg-violet-50 p-2 text-xs text-violet-900"><strong>Reschedule request</strong><p className="mt-1">{appointment.reschedule_reason || 'Reason not provided'}</p>{appointment.reschedule_details && <p className="mt-1 text-violet-700">{appointment.reschedule_details}</p>}</div>}</td>
                    <td className="px-5 py-4"><StatusBadge status={appointment.status} appointment={appointment} /></td>
                    <td className="px-5 py-4">
                      <ActionButtons
                        appointment={appointment}
                        busyId={reminding || busyId}
                        onConfirm={handleConfirm}
                        onCancel={handleCancel}
                        onNoShow={handleNoShow}
                        onReschedule={setRescheduleAppointment}
                            onReminder={handleReminder}
                        onView={setViewAppointment}
                        compact
                      />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white">
            <Pagination page={currentPage} totalPages={totalPages} total={pagination.total} pageSize={pageSize} onPageChange={setPage} onPageSizeChange={setPageSize} pageSizeOptions={APPOINTMENT_PAGE_SIZES} disabled={loading} />
            {totalPages > 1 && <nav aria-label="Appointment page numbers" className="flex flex-wrap items-center justify-center gap-2 border-t border-slate-100 px-3 py-3">
              {visiblePageNumbers(currentPage, totalPages).map(number => (
                <button key={number} type="button" aria-label={`Go to page ${number}`} aria-current={number === currentPage ? 'page' : undefined} onClick={() => setPage(number)} className={`min-h-10 min-w-10 rounded-xl px-3 py-2 text-sm font-semibold transition ${number === currentPage ? 'bg-[#0b1a2c] text-white' : 'border border-slate-200 bg-white text-slate-700 hover:bg-slate-50'}`}>{number}</button>
              ))}
            </nav>}
          </div>
        </>
      )}

      {rescheduleAppointment && (
        <RescheduleDrawer
          appointment={rescheduleAppointment}
          appointments={appointments}
          services={services}
          onClose={() => setRescheduleAppointment(null)}
          onSave={(date, time) => runAction(rescheduleAppointment, () => services.rescheduleAppointment(rescheduleAppointment.id, { appointment_date: date, appointment_time: time }))}
        />
      )}
      {viewAppointment && <AppointmentViewModal appointment={viewAppointment} onClose={() => setViewAppointment(null)} busyId={busyId || reminding}
        onConfirm={(appt) => {setViewAppointment(null);handleConfirm(appt)}}
        onCancel={(appt) => {setViewAppointment(null);handleCancel(appt)}}
        onNoShow={(appt) => {setViewAppointment(null);handleNoShow(appt)}}
        onReschedule={(appt) => {setViewAppointment(null);setRescheduleAppointment(appt)}}
        onReminder={(appt) => {setViewAppointment(null);handleReminder(appt)}}
      />}
      {dialog && <ActionDialog
        title={dialog.title || (dialog.type==='confirm'?'Confirm appointment?':dialog.type==='reminder'?'Send appointment reminder?':'Previous missed appointment')}
        message={dialog.message || (dialog.type==='confirm'?`Have you contacted ${dialog.appointment?.patient_name || 'this patient'} and confirmed they can attend?`: `Send reminders to ${dialog.appointment?.patient_name || 'this patient'} using only verified and permitted contact channels?`)}
        details={dialog.details}
        confirmText={dialog.type==='confirm'?'Confirm Appointment':dialog.type==='reminder'?'Send Reminder':dialog.type==='no_show_confirm'?'Mark as Did Not Arrive':'Confirm Anyway'}
        onCancel={()=>setDialog(null)}
        onConfirm={dialog.type==='message'?null:()=>dialog.type==='confirm'?performConfirmation(dialog.appointment):dialog.type==='reminder'?performReminder(dialog.appointment):dialog.type==='no_show_confirm'?(setDialog(null),runAction(dialog.appointment,() => services.markAppointmentNoShow(dialog.appointment.id))):performConfirmation(dialog.appointment,true)}
        busy={Boolean(busyId||reminding)}
      />}
      <CancellationReasonModal
        open={Boolean(cancelAppointmentTarget)}
        appointment={cancelAppointmentTarget}
        loadReasons={services.getAppointmentCancellationReasons}
        onClose={() => setCancelAppointmentTarget(null)}
        onConfirm={confirmCancellation}
      />
      {showAdd && <AddAppointmentModal services={services} onClose={() => setShowAdd(false)} onCreated={loadAppointments} />}
    </div>
  )
}

export default Appointments



