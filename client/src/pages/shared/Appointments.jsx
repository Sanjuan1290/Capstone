import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  MdAdd,
  MdCalendarToday,
  MdCheck,
  MdChevronLeft,
  MdChevronRight,
  MdClose,
  MdEventAvailable,
  MdOutlineRemoveRedEye,
  MdRefresh,
  MdSchedule,
  MdSearch,
  MdPersonAdd,
  MdBadge,
  MdPhone,
  MdEmail,
  MdHome,
} from 'react-icons/md'
import { formatDateOnly, getLocalDateOnly } from '../../utils/date'
import CancellationReasonModal from '../../components/appointments/CancellationReasonModal'
import {
  formatAppointmentRange,
  formatAppointmentTimeRange,
  formatDurationMinutes,
  getReservedDurationMinutes,
  parseAppointmentTimeMinutes,
  roundToBookingBlock,
} from '../../utils/appointmentTime'

const maxPatientBirthdate = () => new Date().toISOString().slice(0,10)
const minPatientBirthdate = () => { const d = new Date(); d.setFullYear(d.getFullYear()-100); return d.toISOString().slice(0,10) }

const PAGE_SIZE = 10
const STATUS_TABS = [
  { key: 'all', label: 'All' },
  { key: 'pending', label: 'Pending' },
  { key: 'confirmed', label: 'Confirmed' },
  { key: 'completed', label: 'Completed' },
  { key: 'cancelled', label: 'Cancelled' },
  { key: 'rescheduled', label: 'Rescheduled' },
  { key: 'no_show', label: 'No Show' },
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
const clinicLabel = (value) => value === 'derma' ? 'Dermatology' : value === 'medical' ? 'General Medicine' : 'Other'
const timeToMinutes = (value) => parseAppointmentTimeMinutes(value) ?? 0
const compareVisitTime = (a, b, direction = 1) => {
  const aDate = String(a.appointment_date || a.date || '').slice(0, 10)
  const bDate = String(b.appointment_date || b.date || '').slice(0, 10)
  if (aDate !== bDate) return aDate.localeCompare(bDate) * direction
  return (timeToMinutes(a.appointment_time || a.time) - timeToMinutes(b.appointment_time || b.time)) * direction
}
const getActionsForStatus = (status) => {
  if (status === 'pending') return ['confirm', 'cancel', 'reschedule']
  if (status === 'confirmed') return ['cancel', 'reschedule', 'no_show']
  if (status === 'rescheduled') return ['confirm', 'cancel', 'reschedule']
  return ['view']
}

const StatusBadge = ({ status }) => (
  <span className={`inline-flex rounded-full border px-2.5 py-1 text-[11px] font-bold ${STATUS_STYLES[status] || 'bg-slate-100 text-slate-600 border-slate-200'}`}>
    {formatStatus(status)}
  </span>
)

const ActionButtons = ({ appointment, busyId, onConfirm, onCancel, onNoShow, onReschedule, onView }) => {
  const actions = getActionsForStatus(appointment.status)
  const busy = busyId === appointment.id

  return (
    <div className="flex flex-wrap gap-2">
      {actions.includes('confirm') && (
        <button disabled={busy} onClick={() => onConfirm(appointment)} className={`${buttonBase} bg-emerald-600 text-white hover:bg-emerald-700 disabled:opacity-60`}>
          Confirm
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
          Mark No-Show
        </button>
      )}
      {actions.includes('view') && (
        <button onClick={() => onView(appointment)} className={`${buttonBase} bg-slate-100 text-slate-700 hover:bg-slate-200`}>
          View
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

const AppointmentViewModal = ({ appointment, onClose }) => {
  if (!appointment) return null
  return (
    <>
      <div className="fixed inset-0 z-40 bg-black/40" onClick={onClose} />
      <div className="fixed inset-x-0 bottom-0 z-50 rounded-t-3xl bg-white p-5 shadow-2xl sm:left-1/2 sm:top-1/2 sm:bottom-auto sm:w-full sm:max-w-lg sm:-translate-x-1/2 sm:-translate-y-1/2 sm:rounded-3xl">
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
          <div><span className="block text-xs text-slate-400">Reserved Duration</span>{formatDurationMinutes(getReservedDurationMinutes(appointment))}</div>
          <div><span className="block text-xs text-slate-400">Service</span>{appointment.requested_service_name_snapshot || '—'}</div>
          <div><span className="block text-xs text-slate-400">Reason</span>{appointment.reason || '—'}</div>
          <div><span className="block text-xs text-slate-400">Notes</span>{appointment.notes || '—'}</div>
          <div><span className="block text-xs text-slate-400">Status</span>{formatStatus(appointment.status)}</div>
          {appointment.status === 'pending' && appointment.confirmation_deadline_at && <div><span className="block text-xs text-slate-400">Confirmation Deadline</span>{new Date(String(appointment.confirmation_deadline_at).replace(' ', 'T')).toLocaleString('en-PH', { dateStyle: 'medium', timeStyle: 'short' })}</div>}
          <div><span className="block text-xs text-slate-400">Phone</span>{appointment.patient_phone || '—'}</div>
          <div><span className="block text-xs text-slate-400">Email</span>{appointment.patient_email || '—'}</div>
          {appointment.status === 'rejected' && <div className="sm:col-span-2 rounded-2xl border border-violet-100 bg-violet-50 p-3"><span className="block text-xs font-bold text-violet-500">Rejection Reason</span><p className="mt-1 font-semibold text-violet-800">{appointment.rejection_reason === 'confirmation_timeout' ? 'Clinic confirmation deadline passed' : (appointment.rejection_reason || 'Not recorded')}</p></div>}
          {appointment.status === 'cancelled' && <div className="sm:col-span-2 rounded-2xl border border-red-100 bg-red-50 p-3"><span className="block text-xs font-bold text-red-500">Reason for Cancellation</span><p className="mt-1 font-semibold text-red-800">{appointment.cancellation_reason_snapshot || 'Not recorded'}</p>{appointment.cancellation_details && <p className="mt-1 text-xs text-red-700">{appointment.cancellation_details}</p>}</div>}
        </div>
      </div>
    </>
  )
}

const AddAppointmentModal = ({ services, appointments, onClose, onCreated }) => {
  const [patients, setPatients] = useState([])
  const [doctors, setDoctors] = useState([])
  const [serviceOptions, setServiceOptions] = useState([])
  const [availableSlots, setAvailableSlots] = useState([])
  const [slotsLoading, setSlotsLoading] = useState(false)
  const [search, setSearch] = useState('')
  const [mode, setMode] = useState('existing')
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
  const selectedDoctor = doctors.find((doctor) => String(doctor.id) === String(form.doctor_id))
  const selectedService = serviceOptions.find((service) => String(service.id) === String(form.requested_service_id))

  useEffect(() => {
    if (!services.getBookingServices) { setServiceOptions([]); return }
    services.getBookingServices(form.clinic_type).then((rows)=>setServiceOptions((Array.isArray(rows)?rows:[]).filter((service)=>Number(service.is_active??1)===1))).catch(()=>setServiceOptions([]))
  }, [form.clinic_type, services])

  useEffect(() => {
    if (!form.doctor_id || !form.appointment_date || !form.requested_service_id || !services.getAppointmentAvailableSlots) { setAvailableSlots([]); return }
    let active=true; setSlotsLoading(true)
    services.getAppointmentAvailableSlots(form.doctor_id,{date:form.appointment_date,serviceId:form.requested_service_id,clinicType:form.clinic_type})
      .then((result)=>{ if(!active)return; const slots=Array.isArray(result?.slots)?result.slots:[]; setAvailableSlots(slots); setForm((current)=>current.appointment_time&&!slots.includes(current.appointment_time)?{...current,appointment_time:''}:current) })
      .catch(()=>active&&setAvailableSlots([])).finally(()=>active&&setSlotsLoading(false))
    return()=>{active=false}
  }, [form.doctor_id, form.appointment_date, form.requested_service_id, form.clinic_type, services])

  const patientReady = mode === 'existing'
    ? Boolean(form.patient_id && selectedPatient)
    : Boolean(patientForm.full_name.trim() && patientForm.birthdate && patientForm.phone.trim() && patientForm.consent_given)
  const scheduleReady = Boolean(form.requested_service_id && form.doctor_id && form.appointment_date && form.appointment_time && form.reason.trim())

  const goNext = () => {
    setError('')
    if (step === 1 && !patientReady) {
      setError(mode === 'existing' ? 'Select a patient before continuing.' : 'Complete the required patient details and confirm privacy consent.')
      return
    }
    if (step === 2 && !scheduleReady) {
      setError('Select the service, doctor, date, time, and appointment reason before continuing.')
      return
    }
    setStep((current) => Math.min(3, current + 1))
  }

  const handleCreate = async (overrideNoShowWarning = false) => {
    setSaving(true)
    setError('')
    try {
      let patientId = form.patient_id
      if (mode === 'new') {
        const createdPatient = await services.createWalkInPatient?.(patientForm)
        patientId = createdPatient?.id
      }
      if (!patientId) throw new Error('Select an existing patient or complete the new patient details first.')
      await services.createAppointment({
        ...form,
        patient_id: patientId,
        override_no_show_warning: overrideNoShowWarning,
      })
      await onCreated()
      onClose()
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
    { number: 2, label: 'Schedule' },
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
                <p className="mt-0.5 text-xs text-slate-500">Choose a patient, schedule the visit, then review before creating.</p>
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
                <div className="grid gap-4 sm:grid-cols-2">
                  <label className="block"><span className="mb-1 block text-xs font-bold uppercase tracking-widest text-slate-400">Clinic Type</span><select value={form.clinic_type} onChange={(e) => setForm((prev) => ({ ...prev, clinic_type: e.target.value, requested_service_id: '', doctor_id: '', appointment_time: '' }))} className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm outline-none focus:border-sky-400"><option value="medical">Medical</option><option value="derma">Dermatology</option></select></label>
                  <label className="block"><span className="mb-1 block text-xs font-bold uppercase tracking-widest text-slate-400">Service *</span><select value={form.requested_service_id} onChange={(e)=>setForm((prev)=>({...prev,requested_service_id:e.target.value,appointment_time:''}))} className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm outline-none focus:border-sky-400"><option value="">Select service</option>{serviceOptions.map((service)=><option key={service.id} value={service.id}>{service.service_name} · {formatDurationMinutes(roundToBookingBlock(service.average_duration_minutes || 60))} reserved</option>)}</select></label>
                  <label className="block"><span className="mb-1 block text-xs font-bold uppercase tracking-widest text-slate-400">Doctor *</span><select value={form.doctor_id} onChange={(e) => setForm((prev) => ({ ...prev, doctor_id: e.target.value, appointment_time: '' }))} className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm outline-none focus:border-sky-400"><option value="">Select doctor</option>{filteredDoctors.map((doctor) => <option key={doctor.id} value={doctor.id}>{doctor.full_name || doctor.name}</option>)}</select></label>
                  <label className="block sm:col-span-2"><span className="mb-1 block text-xs font-bold uppercase tracking-widest text-slate-400">Date *</span><input type="date" min={getLocalDateOnly()} value={form.appointment_date} onChange={(e) => setForm((prev) => ({ ...prev, appointment_date: e.target.value, appointment_time: '' }))} className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm outline-none focus:border-sky-400" /></label>
                </div>
                <div>
                  <span className="mb-2 block text-xs font-bold uppercase tracking-widest text-slate-400">Available Time *</span>
                  <TimeSlotPicker date={form.appointment_date} value={form.appointment_time} onChange={(slot) => setForm((prev) => ({ ...prev, appointment_time: slot }))} availableSlots={availableSlots} loading={slotsLoading} emptyMessage={form.doctor_id && form.requested_service_id ? 'No start time can fit the full service duration on this date.' : 'Select a service and doctor first to view available time slots.'} />
                </div>
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
<div className="rounded-2xl border border-slate-200 bg-white p-4"><p className="text-xs font-bold uppercase tracking-widest text-slate-400">Service</p><p className="mt-1 font-bold text-slate-900">{selectedService?.service_name || '—'}</p><p className="text-xs text-slate-500">{selectedService ? `${formatDurationMinutes(roundToBookingBlock(selectedService.average_duration_minutes || 60))} reserved` : ''}</p></div>                  <div className="rounded-2xl border border-slate-200 bg-white p-4"><p className="text-xs font-bold uppercase tracking-widest text-slate-400">Doctor</p><p className="mt-1 font-bold text-slate-900">{selectedDoctor?.full_name || selectedDoctor?.name || '—'}</p><p className="text-xs text-slate-500">{form.clinic_type === 'derma' ? 'Dermatology' : 'Medical'}</p></div>
                  <div className="rounded-2xl border border-slate-200 bg-white p-4"><p className="text-xs font-bold uppercase tracking-widest text-slate-400">Schedule</p><p className="mt-1 font-bold text-slate-900">{formatDate(form.appointment_date)}</p><p className="text-xs text-slate-500">{form.appointment_time ? formatAppointmentTimeRange(form.appointment_time, roundToBookingBlock(selectedService?.average_duration_minutes || 60)) : '—'}</p></div>
                </div>
                <div className="rounded-2xl border border-slate-200 bg-white p-4"><p className="text-xs font-bold uppercase tracking-widest text-slate-400">Reason</p><p className="mt-1 font-semibold text-slate-800">{form.reason || '—'}</p></div>
                <label className="block"><span className="mb-1 block text-xs font-bold uppercase tracking-widest text-slate-400">Scheduling Notes</span><textarea value={form.notes} onChange={(e) => setForm((prev) => ({ ...prev, notes: e.target.value }))} rows={3} className="w-full resize-none rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm outline-none focus:border-sky-400" placeholder="Optional referral notes, symptoms, intake remarks, preferred contact, etc." /></label>
                <div className="rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800">Review the patient and schedule above before creating the appointment.</div>
              </div>
            )}

            {error && <div className="mt-4 rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div>}
          </div>

          <div className="shrink-0 border-t border-slate-100 bg-white px-4 py-4 pb-[calc(env(safe-area-inset-bottom,0px)+16px)] sm:px-6">
            <div className="flex flex-col-reverse gap-3 sm:flex-row sm:items-center sm:justify-between">
              <button disabled={saving} onClick={step === 1 ? onClose : () => { setError(''); setStep((current) => current - 1) }} className="w-full rounded-2xl border border-slate-200 px-5 py-3 text-sm font-semibold text-slate-600 disabled:opacity-50 sm:w-auto sm:min-w-[120px]">
                {step === 1 ? 'Cancel' : 'Back'}
              </button>
              {step < 3 ? (
                <button onClick={goNext} className="w-full rounded-2xl bg-[#0b1a2c] px-5 py-3 text-sm font-semibold text-white sm:w-auto sm:min-w-[140px]">Next</button>
              ) : (
                <button onClick={() => handleCreate()} disabled={saving} className="w-full rounded-2xl bg-[#0b1a2c] px-5 py-3 text-sm font-semibold text-white disabled:opacity-60 sm:w-auto sm:min-w-[180px]">{saving ? 'Creating...' : 'Create Appointment'}</button>
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
  const [loading, setLoading] = useState(true)
  const [tab, setTab] = useState('all')
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
    try {
      const rows = await services.getAppointments()
      setAppointments(Array.isArray(rows) ? rows : [])
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

  const pendingCount = useMemo(() => appointments.filter((appointment) => appointment.status === 'pending').length, [appointments])
  const doctorOptions = useMemo(() => Array.from(new Set(appointments.map((appointment) => appointment.doctor).filter(Boolean))).sort((a,b) => a.localeCompare(b)), [appointments])
  const clinicOptions = useMemo(() => Array.from(new Set(appointments.map((appointment) => appointment.clinic_type || appointment.type).filter(Boolean))), [appointments])

  const filteredAppointments = useMemo(() => {
    const filtered = appointments.filter((appointment) => {
      const matchesTab = tab === 'all' || appointment.status === tab
      const searchNeedle = query.trim().toLowerCase()
      const matchesSearch = !searchNeedle || [appointment.patient_name, appointment.patient, appointment.doctor, appointment.requested_service_name_snapshot, appointment.reason, appointment.cancellation_reason_snapshot, appointment.cancellation_details]
        .filter(Boolean)
        .some((value) => value.toLowerCase().includes(searchNeedle))

      const appointmentDate = (appointment.appointment_date || appointment.date || '').slice(0, 10)
      const matchesFrom = !dateFrom || appointmentDate >= dateFrom
      const matchesTo = !dateTo || appointmentDate <= dateTo
      const appointmentClinic = appointment.clinic_type || appointment.type || ''
      const matchesClinic = clinicFilter === 'all' || appointmentClinic === clinicFilter
      const matchesDoctor = doctorFilter === 'all' || appointment.doctor === doctorFilter
      return matchesTab && matchesSearch && matchesFrom && matchesTo && matchesClinic && matchesDoctor
    })

    const today = getLocalDateOnly()
    return [...filtered].sort((a, b) => {
      if (tab === 'pending') return new Date(b.created_at || 0) - new Date(a.created_at || 0) || Number(b.id || 0) - Number(a.id || 0)
      if (tab === 'confirmed' || tab === 'rescheduled') return compareVisitTime(a, b, 1)
      if (['completed','cancelled','no_show','rejected'].includes(tab)) return new Date(b.updated_at || b.created_at || 0) - new Date(a.updated_at || a.created_at || 0) || Number(b.id || 0) - Number(a.id || 0)

      const aDate = String(a.appointment_date || a.date || '').slice(0,10)
      const bDate = String(b.appointment_date || b.date || '').slice(0,10)
      const aActive = aDate >= today && !['completed','cancelled','no_show','rejected'].includes(a.status)
      const bActive = bDate >= today && !['completed','cancelled','no_show','rejected'].includes(b.status)
      if (aActive !== bActive) return aActive ? -1 : 1
      return aActive ? compareVisitTime(a,b,1) : compareVisitTime(a,b,-1)
    })
  }, [appointments, tab, query, dateFrom, dateTo, clinicFilter, doctorFilter])

  const totalPages = Math.max(1, Math.ceil(filteredAppointments.length / PAGE_SIZE))
  const currentPage = Math.min(page, totalPages)
  const paginatedAppointments = filteredAppointments.slice((currentPage - 1) * PAGE_SIZE, currentPage * PAGE_SIZE)

  useEffect(() => {
    setPage(1)
  }, [tab, query, dateFrom, dateTo, clinicFilter, doctorFilter])

  const runAction = async (appointment, action) => {
    setBusyId(appointment.id)
    try {
      const result = await action()
      if (result?.message && /failed|not found|invalid/i.test(result.message)) {
        alert(result.message)
      } else {
        await loadAppointments()
      }
    } catch (err) {
      alert(err.message || 'Action failed.')
    } finally {
      setBusyId(null)
    }
  }

  const confirmWithPolicyWarnings = async (appointment, payload = {}) => {
    try {
      return await services.confirmAppointment(appointment.id, payload)
    } catch (err) {
      if (err.code === 'NO_SHOW_WARNING') {
        const lastNoShow = err.last_no_show
        const detail = lastNoShow
          ? `Last no-show: ${lastNoShow.appointment_date} at ${lastNoShow.appointment_time} with ${lastNoShow.doctor_name}.`
          : 'This patient has a previous no-show appointment.'
        const proceed = window.confirm(`${err.message}

${detail}

Policy reminder: ${err.policy}

Confirm this appointment anyway?`)
        if (proceed) return services.confirmAppointment(appointment.id, { ...payload, override_no_show_warning: true })
      }
      throw err
    }
  }

  const handleConfirm = async (appointment) => {
    // Explicit staff confirmation step prevents accidental confirmation.
    if (!window.confirm(`Have you contacted or verified ${appointment.patient_name || appointment.full_name || 'this patient'} and confirmed they can attend?\n\nSelect OK to finalize this appointment confirmation.`)) return
    setBusyId(appointment.id)
    try {
      await confirmWithPolicyWarnings(appointment)
      await loadAppointments()
    } catch (err) {
      alert(err.message || 'Could not confirm appointment.')
    } finally {
      setBusyId(null)
    }
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
    if (!window.confirm('Mark this appointment as no-show?')) return
    runAction(appointment, () => services.markAppointmentNoShow(appointment.id))
  }

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-800">Appointments</h1>
          <p className="mt-1 text-sm text-slate-500">Track patient schedules, confirmations, and missed visits.</p>
        </div>
        <div className="flex gap-2">
          <button onClick={loadAppointments} className="inline-flex items-center gap-2 rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm font-semibold text-slate-600 hover:bg-slate-50">
            <MdRefresh /> Refresh
          </button>
          {services.createAppointment && (
            <button onClick={() => setShowAdd(true)} className="inline-flex items-center gap-2 rounded-2xl bg-[#0b1a2c] px-4 py-3 text-sm font-semibold text-white">
              <MdAdd /> New Appointment
            </button>
          )}
        </div>
      </div>

      <div className="overflow-x-auto">
        <div className="flex min-w-max gap-2">
          {STATUS_TABS.map((status) => (
            <button
              key={status.key}
              onClick={() => setTab(status.key)}
              className={`rounded-full px-4 py-2 text-sm font-semibold transition ${tab === status.key ? 'bg-[#0b1a2c] text-white' : 'bg-white text-slate-600 border border-slate-200'}`}
            >
              {status.label}{status.key === 'pending' && pendingCount > 0 ? ` ${pendingCount}` : ''}
            </button>
          ))}
        </div>
      </div>

      <div className="rounded-3xl border border-slate-200 bg-white p-4">
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-6">
          <label className="block md:col-span-2 xl:col-span-2">
            <span className="mb-1.5 block text-xs font-bold uppercase tracking-widest text-slate-400">Search</span>
            <div className="relative">
              <MdSearch className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" />
              <input value={query} onChange={(e) => setQuery(e.target.value)} className="w-full rounded-2xl border border-slate-200 bg-slate-50 py-3 pl-11 pr-4 text-sm outline-none focus:border-sky-400" placeholder="Search patient, doctor, service or reason..." />
            </div>
          </label>
          <label className="block">
            <span className="mb-1.5 block text-xs font-bold uppercase tracking-widest text-slate-400">From Date</span>
            <input type="date" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} className="form-control" />
          </label>
          <label className="block">
            <span className="mb-1.5 block text-xs font-bold uppercase tracking-widest text-slate-400">To Date</span>
            <input type="date" value={dateTo} onChange={(e) => setDateTo(e.target.value)} className="form-control" />
          </label>
          <label className="block">
            <span className="mb-1.5 block text-xs font-bold uppercase tracking-widest text-slate-400">Clinic</span>
            <select value={clinicFilter} onChange={(e) => setClinicFilter(e.target.value)} className="form-control">
              <option value="all">All Clinics</option>
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
        </div>
        <div className="mt-4 flex flex-wrap items-center justify-between gap-3 border-t border-slate-100 pt-4">
          <p className="text-sm text-slate-500"><strong className="text-slate-800">{filteredAppointments.length}</strong> appointment{filteredAppointments.length === 1 ? '' : 's'} found</p>
          <button type="button" className="button-secondary" onClick={() => { setQuery(''); setDateFrom(''); setDateTo(''); setClinicFilter('all'); setDoctorFilter('all') }}>Clear Filters</button>
        </div>
      </div>

      {loading ? (
        <div className="flex h-64 items-center justify-center rounded-3xl border border-slate-200 bg-white">
          <div className="h-8 w-8 animate-spin rounded-full border-4 border-slate-200 border-t-sky-500" />
        </div>
      ) : (
        <>
          <div className="space-y-4 md:hidden">
            {paginatedAppointments.length === 0 ? (
              <div className="rounded-3xl border border-slate-200 bg-white p-10 text-center text-sm text-slate-400">No appointments found.</div>
            ) : paginatedAppointments.map((appointment) => (
              <div key={appointment.id} className="rounded-3xl border border-slate-200 bg-white p-4 shadow-sm">
                <div className="mb-3 flex items-start justify-between gap-3">
                  <div>
                    <p className="text-base font-bold text-slate-800">{appointment.patient_name || appointment.patient}</p>
                    <p className="text-sm text-slate-500">{appointment.doctor}</p>
                  </div>
                  <StatusBadge status={appointment.status} />
                </div>
                <div className="grid grid-cols-2 gap-3 text-sm text-slate-600">
                  <div><span className="block text-xs text-slate-400">Date</span>{formatDate(appointment.appointment_date || appointment.date)}</div>
                  <div><span className="block text-xs text-slate-400">Schedule</span>{formatAppointmentRange(appointment)}</div>
                  <div><span className="block text-xs text-slate-400">Reserved Duration</span>{formatDurationMinutes(getReservedDurationMinutes(appointment))}</div>
                  <div><span className="block text-xs text-slate-400">Service</span>{appointment.requested_service_name_snapshot || '—'}</div>
                  <div><span className="block text-xs text-slate-400">Reason</span>{appointment.reason || '—'}</div>
                </div>
                <div className="mt-4">
                  <ActionButtons
                    appointment={appointment}
                    busyId={busyId}
                    onConfirm={handleConfirm}
                    onCancel={handleCancel}
                    onNoShow={handleNoShow}
                    onReschedule={setRescheduleAppointment}
                    onView={setViewAppointment}
                  />
                </div>
              </div>
            ))}
          </div>

          <div className="hidden overflow-hidden rounded-3xl border border-slate-200 bg-white md:block">
            <table className="min-w-full text-left">
              <thead className="bg-slate-50 text-xs uppercase tracking-widest text-slate-400">
                <tr>
                  <th className="px-5 py-4">Patient</th>
                  <th className="px-5 py-4">Doctor</th>
                  <th className="px-5 py-4">Date</th>
                  <th className="px-5 py-4">Schedule</th>
                  <th className="px-5 py-4">Requested Service</th>
                  <th className="px-5 py-4">Reason</th>
                  <th className="px-5 py-4">Status</th>
                  <th className="px-5 py-4">Actions</th>
                </tr>
              </thead>
              <tbody>
                {paginatedAppointments.length === 0 ? (
                  <tr>
                    <td colSpan="8" className="px-5 py-12 text-center text-sm text-slate-400">No appointments found.</td>
                  </tr>
                ) : paginatedAppointments.map((appointment) => (
                  <tr key={appointment.id} className="border-t border-slate-100 align-top">
                    <td className="px-5 py-4">
                      <p className="text-base font-bold text-slate-900">{appointment.patient_name || appointment.patient}</p>
                    </td>
                    <td className="px-5 py-4 text-sm text-slate-600">{appointment.doctor}</td>
                    <td className="px-5 py-4 text-sm text-slate-600">{formatDate(appointment.appointment_date || appointment.date)}</td>
                    <td className="px-5 py-4 text-sm text-slate-600"><p className="font-semibold text-slate-700">{formatAppointmentRange(appointment)}</p><p className="mt-0.5 text-[11px] text-slate-400">{formatDurationMinutes(getReservedDurationMinutes(appointment))}</p></td>
                    <td className="px-5 py-4 text-sm text-slate-600">{appointment.requested_service_name_snapshot || '—'}</td>
                    <td className="px-5 py-4 text-sm text-slate-600">{appointment.reason || '—'}</td>
                    <td className="px-5 py-4"><StatusBadge status={appointment.status} /></td>
                    <td className="px-5 py-4">
                      <ActionButtons
                        appointment={appointment}
                        busyId={busyId}
                        onConfirm={handleConfirm}
                        onCancel={handleCancel}
                        onNoShow={handleNoShow}
                        onReschedule={setRescheduleAppointment}
                        onView={setViewAppointment}
                      />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="flex flex-wrap items-center justify-between gap-3 rounded-3xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-600">
            <p>Page {currentPage} of {totalPages}</p>
            <div className="flex flex-wrap gap-2">
              <button onClick={() => setPage(1)} disabled={currentPage === 1} className="rounded-xl border border-slate-200 px-3 py-2 disabled:opacity-50">First</button>
              <button onClick={() => setPage((prev) => Math.max(1, prev - 1))} disabled={currentPage === 1} className="inline-flex items-center gap-1 rounded-xl border border-slate-200 px-3 py-2 disabled:opacity-50">
                <MdChevronLeft /> Previous
              </button>
              <button onClick={() => setPage((prev) => Math.min(totalPages, prev + 1))} disabled={currentPage === totalPages} className="inline-flex items-center gap-1 rounded-xl border border-slate-200 px-3 py-2 disabled:opacity-50">
                Next <MdChevronRight />
              </button>
              <button onClick={() => setPage(totalPages)} disabled={currentPage === totalPages} className="rounded-xl border border-slate-200 px-3 py-2 disabled:opacity-50">Last</button>
            </div>
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
      {viewAppointment && <AppointmentViewModal appointment={viewAppointment} onClose={() => setViewAppointment(null)} />}
      <CancellationReasonModal
        open={Boolean(cancelAppointmentTarget)}
        appointment={cancelAppointmentTarget}
        loadReasons={services.getAppointmentCancellationReasons}
        onClose={() => setCancelAppointmentTarget(null)}
        onConfirm={confirmCancellation}
      />
      {showAdd && <AddAppointmentModal services={services} appointments={appointments} onClose={() => setShowAdd(false)} onCreated={loadAppointments} />}
    </div>
  )
}

export default Appointments


