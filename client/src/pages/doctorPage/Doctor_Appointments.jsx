// client/src/pages/doctorPage/Doctor_Appointments.jsx
// IMPROVEMENTS:
// 1. Enhanced appointment cards — age, gender, reason, appointment type badge
// 2. Walk-in queue panel with "Call Next" and "Mark Done" buttons
// 3. Read-only clinical record viewer for completed appointments
// 4. Status indicators and quick actions on every row

import { useEffect, useState, useCallback } from 'react'
import Pagination from '../../components/ui/Pagination'
import useClientPagination from '../../hooks/useClientPagination'
import { useNavigate } from 'react-router-dom'
import {
  getAppointments, startConsultation,
  getMyQueue, callNextPatient, markQueueEntryDone,
  getConsultation,
} from '../../services/doctor.service'
import usePolling from '../../hooks/usePolling'
import {
  MdCalendarToday, MdAccessTime, MdFace, MdMedicalServices,
  MdChevronRight, MdPerson, MdNotes, MdArrowBack,
  MdCheck, MdClose,
  MdQueuePlayNext, MdSkipNext, MdWc, MdCake,
  MdLocalPharmacy, MdPhone,
} from 'react-icons/md'
import { getLocalDateOnly } from '../../utils/date'

// ── Helpers ───────────────────────────────────────────────────────────────────
const STATUS_CONFIG = {
  completed:   { label: 'Done',        badge: 'bg-slate-100  text-slate-500  border-slate-200',   row: 'border-l-slate-300'   },
  'in-progress':{ label: 'In Progress',badge: 'bg-violet-50  text-violet-700 border-violet-200',  row: 'border-l-violet-400'  },
  pending:     { label: 'Pending',     badge: 'bg-amber-50   text-amber-700  border-amber-200',   row: 'border-l-amber-300'   },
  confirmed:   { label: 'Confirmed',   badge: 'bg-emerald-50 text-emerald-700 border-emerald-200',row: 'border-l-emerald-400' },
  rescheduled: { label: 'Rescheduled', badge: 'bg-sky-50     text-sky-700     border-sky-200',    row: 'border-l-sky-400'     },
  cancelled:   { label: 'Cancelled',   badge: 'bg-red-50     text-red-500    border-red-200',     row: 'border-l-red-300'     },
}

const QUEUE_STATUS = {
  waiting:     { label: 'Waiting',     badge: 'bg-amber-50   text-amber-700  border-amber-200'  },
  'in-progress':{ label: 'In Progress',badge: 'bg-violet-50  text-violet-700 border-violet-200' },
}

function calcAge(birthdate) {
  if (!birthdate) return null
  const b = new Date(birthdate)
  const today = new Date()
  let age = today.getFullYear() - b.getFullYear()
  if (today.getMonth() < b.getMonth() || (today.getMonth() === b.getMonth() && today.getDate() < b.getDate())) age--
  return age
}

// ── Finalized clinical record viewer ───────────────────────────────────────────
const PrescriptionModal = ({ appointmentId, patientName, onClose, onOpenFullRecord }) => {
  const [loading, setLoading] = useState(true)
  const [consultation, setConsultation] = useState(null)
  const [prescriptions, setPrescriptions] = useState([])
  const [error, setError] = useState('')

  useEffect(() => {
    getConsultation(appointmentId)
      .then((consult) => {
        setConsultation(consult)
        try {
          const rx = typeof consult.prescription === 'string' ? JSON.parse(consult.prescription) : consult.prescription
          setPrescriptions(Array.isArray(rx) ? rx : [])
        } catch {
          setPrescriptions([])
        }
      })
      .catch(() => setError('Failed to load the finalized clinical record.'))
      .finally(() => setLoading(false))
  }, [appointmentId])

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm px-4" onClick={onClose}>
      <div className="flex max-h-[92vh] w-full max-w-2xl flex-col rounded-2xl bg-white shadow-2xl" onClick={(e) => e.stopPropagation()}>
        <div className="flex shrink-0 items-center justify-between border-b border-slate-100 px-6 py-5">
          <div>
            <p className="flex items-center gap-2 text-sm font-bold text-slate-800">
              <MdLocalPharmacy className="text-violet-500" />
              Clinical Record — {patientName}
            </p>
            <p className="mt-0.5 text-xs text-slate-400">Finalized consultation record · read only</p>
          </div>
          <button onClick={onClose} className="flex h-8 w-8 items-center justify-center rounded-xl text-slate-400 hover:bg-slate-100"><MdClose /></button>
        </div>

        <div className="flex-1 space-y-5 overflow-y-auto px-6 py-5">
          {loading ? (
            <div className="py-12 text-center text-sm text-slate-400">Loading clinical record…</div>
          ) : error ? (
            <div className="py-12 text-center text-sm text-red-500">{error}</div>
          ) : (
            <>
              <div className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-xs leading-relaxed text-amber-800">
                This medical record is finalized and cannot be edited directly. If a correction is required, open the full record and add an amendment so the original record remains auditable.
              </div>

              <div>
                <p className="mb-1.5 text-xs font-bold uppercase tracking-widest text-slate-500">Diagnosis</p>
                <div className="min-h-[52px] whitespace-pre-wrap rounded-xl border border-slate-200 bg-slate-50 px-3 py-3 text-sm text-slate-700">
                  {consultation?.diagnosis || 'No diagnosis recorded.'}
                </div>
              </div>

              <div>
                <p className="mb-2 text-xs font-bold uppercase tracking-widest text-slate-500">Prescription</p>
                {prescriptions.length === 0 ? (
                  <div className="rounded-xl border border-dashed border-slate-200 bg-slate-50 px-4 py-5 text-center text-sm text-slate-400">No prescription recorded.</div>
                ) : (
                  <div className="space-y-3">
                    {prescriptions.map((rx, index) => (
                      <div key={`${rx.medicine || 'medicine'}-${index}`} className="rounded-xl border border-slate-200 bg-slate-50 p-4">
                        <div className="flex items-start justify-between gap-3">
                          <div>
                            <p className="font-bold text-slate-800">{rx.medicine || `Medicine ${index + 1}`}</p>
                            <p className="mt-1 text-xs text-slate-500">
                              {[rx.dosage, rx.frequency, rx.duration].filter(Boolean).join(' · ') || 'No dosage instructions recorded.'}
                            </p>
                          </div>
                          <span className="rounded-full bg-violet-100 px-2.5 py-1 text-[10px] font-bold text-violet-700">#{index + 1}</span>
                        </div>
                        {rx.notes && <p className="mt-3 rounded-lg bg-white px-3 py-2 text-xs text-slate-600">{rx.notes}</p>}
                      </div>
                    ))}
                  </div>
                )}
              </div>

              <div>
                <p className="mb-1.5 text-xs font-bold uppercase tracking-widest text-slate-500">Consultation Notes</p>
                <div className="min-h-[72px] whitespace-pre-wrap rounded-xl border border-slate-200 bg-slate-50 px-3 py-3 text-sm text-slate-700">
                  {consultation?.notes || 'No additional consultation notes recorded.'}
                </div>
              </div>
            </>
          )}
        </div>

        {!loading && !error && (
          <div className="flex shrink-0 gap-3 border-t border-slate-100 px-6 py-5">
            <button onClick={() => onOpenFullRecord(appointmentId)} className="flex-1 rounded-xl border border-violet-200 bg-violet-50 py-2.5 text-sm font-semibold text-violet-700 hover:bg-violet-100">Open Full Record / Amendments</button>
            <button onClick={onClose} className="flex-1 rounded-xl border border-slate-200 py-2.5 text-sm font-semibold text-slate-600 hover:bg-slate-50">Close</button>
          </div>
        )}
      </div>
    </div>
  )
}

const AppointmentRow = ({ appt, isSelected, onSelect }) => {
  const cfg  = STATUS_CONFIG[appt.status] || STATUS_CONFIG.pending
  const Icon = appt.type === 'derma' ? MdFace : MdMedicalServices
  const age  = appt.patient_age ?? calcAge(appt.birthdate)

  return (
    <button onClick={() => onSelect(appt)}
      className={`w-full flex items-center gap-3 px-4 py-3.5 border-l-[3px] text-left transition-all duration-150
        ${isSelected ? `${cfg.row} bg-slate-50` : 'border-l-transparent hover:bg-slate-50/70'}`}>
      <div className={`w-9 h-9 rounded-xl flex items-center justify-center shrink-0
        ${appt.type === 'derma' ? 'bg-emerald-50' : 'bg-slate-100'}`}>
        <Icon className={`text-[16px] ${appt.type === 'derma' ? 'text-emerald-600' : 'text-slate-500'}`} />
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 mb-0.5 flex-wrap">
          <p className="text-sm font-bold text-slate-800 truncate">{appt.patient_name || appt.patient}</p>
          <span className={`text-[10px] font-bold border px-2 py-0.5 rounded-full whitespace-nowrap ${cfg.badge}`}>
            {cfg.label}
          </span>
        </div>
        <p className="text-xs text-slate-500 truncate">{appt.reason || 'No reason provided'}</p>
        <div className="flex items-center gap-3 mt-0.5 text-[11px] text-slate-400 font-medium flex-wrap">
          <span className="flex items-center gap-0.5"><MdAccessTime className="text-[11px]" /> {appt.time}</span>
          {age !== null && <span className="flex items-center gap-0.5"><MdCake className="text-[11px]" /> {age} yrs</span>}
          {appt.patient_sex && <span className="flex items-center gap-0.5"><MdWc className="text-[11px]" /> {appt.patient_sex}</span>}
        </div>
      </div>
      <MdChevronRight className={`text-[16px] shrink-0 ${isSelected ? 'text-slate-500' : 'text-slate-300'}`} />
    </button>
  )
}

// ── Detail Panel ──────────────────────────────────────────────────────────────
const DetailPanel = ({ appt, onClose, onStart, onViewPrescription, allowStart = true }) => {
  if (!appt) return null
  const cfg  = STATUS_CONFIG[appt.status] || STATUS_CONFIG.pending
  const Icon = appt.type === 'derma' ? MdFace : MdMedicalServices
  const age  = appt.patient_age ?? calcAge(appt.birthdate)

  const typeLabel = appt.type === 'derma' ? 'Dermatology' : 'General Medicine'

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="flex items-center gap-3 px-6 py-5 border-b border-slate-100 shrink-0">
        <button onClick={onClose}
          className="w-8 h-8 flex items-center justify-center rounded-xl hover:bg-slate-100 text-slate-400 lg:hidden">
          <MdArrowBack className="text-[18px]" />
        </button>
        <div className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0
          ${appt.type === 'derma' ? 'bg-emerald-50' : 'bg-slate-100'}`}>
          <Icon className={`text-[18px] ${appt.type === 'derma' ? 'text-emerald-600' : 'text-slate-500'}`} />
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-bold text-slate-800 truncate">{appt.patient_name || appt.patient}</p>
          <p className="text-xs text-slate-500">{typeLabel}</p>
        </div>
        <span className={`text-[11px] font-bold border px-2.5 py-0.5 rounded-full shrink-0 ${cfg.badge}`}>
          {cfg.label}
        </span>
      </div>

      {/* Body */}
      <div className="flex-1 overflow-y-auto px-6 py-4 space-y-4">

        {/* Patient Info */}
        <div className="bg-slate-50 rounded-2xl p-4 space-y-3">
          <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Patient Information</p>
          <div className="grid grid-cols-2 gap-3">
            {age !== null && (
              <div className="flex items-start gap-2">
                <div className="w-6 h-6 rounded-lg bg-white border border-slate-200 flex items-center justify-center shrink-0 mt-0.5">
                  <MdCake className="text-[11px] text-slate-400" />
                </div>
                <div>
                  <p className="text-[10px] text-slate-400">Age</p>
                  <p className="text-sm font-semibold text-slate-800">{age} years old</p>
                </div>
              </div>
            )}
            {appt.patient_sex && (
              <div className="flex items-start gap-2">
                <div className="w-6 h-6 rounded-lg bg-white border border-slate-200 flex items-center justify-center shrink-0 mt-0.5">
                  <MdWc className="text-[11px] text-slate-400" />
                </div>
                <div>
                  <p className="text-[10px] text-slate-400">Sex</p>
                  <p className="text-sm font-semibold text-slate-800">{appt.patient_sex}</p>
                </div>
              </div>
            )}
            {appt.patient_phone && (
              <div className="flex items-start gap-2 col-span-2">
                <div className="w-6 h-6 rounded-lg bg-white border border-slate-200 flex items-center justify-center shrink-0 mt-0.5">
                  <MdPhone className="text-[11px] text-slate-400" />
                </div>
                <div>
                  <p className="text-[10px] text-slate-400">Phone</p>
                  <p className="text-sm font-semibold text-slate-800">{appt.patient_phone}</p>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Visit Info */}
        <div className="bg-slate-50 rounded-2xl p-4 space-y-3">
          <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Visit Information</p>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <p className="text-[11px] text-slate-400 flex items-center gap-1 mb-0.5">
                <MdAccessTime className="text-[11px]" /> Time Scheduled
              </p>
              <p className="text-sm font-semibold text-slate-800">{appt.time}</p>
            </div>
            <div>
              <p className="text-[11px] text-slate-400 mb-0.5">Type</p>
              <p className="text-sm font-semibold text-slate-800">{typeLabel}</p>
            </div>
          </div>
          <div>
            <p className="text-[11px] text-slate-400 flex items-center gap-1 mb-0.5">
              <MdPerson className="text-[11px]" /> Reason for Visit
            </p>
            <p className="text-sm font-semibold text-slate-800">{appt.reason || '—'}</p>
          </div>
          {appt.notes && (
            <div>
              <p className="text-[11px] text-slate-400 flex items-center gap-1 mb-0.5">
                <MdNotes className="text-[11px]" /> Pre-visit Notes
              </p>
              <p className="text-sm text-slate-700 leading-relaxed">{appt.notes}</p>
            </div>
          )}
        </div>
      </div>

      {/* Actions */}
      <div className="px-6 pb-6 pt-4 border-t border-slate-100 shrink-0 space-y-2">
        {allowStart && appt.status === 'in-progress' && (
          <button onClick={() => onStart(appt)}
            className="w-full flex items-center justify-center gap-2 py-2.5 text-xs font-bold
              text-white bg-violet-600 hover:bg-violet-700 rounded-xl transition-colors">
            <MdMedicalServices className="text-[14px]" /> Resume Consultation
          </button>
        )}
        {allowStart && (appt.status === 'pending' || appt.status === 'confirmed' || appt.status === 'rescheduled') && (
          <button onClick={() => onStart(appt)}
            className="w-full flex items-center justify-center gap-2 py-2.5 text-xs font-bold
              text-white bg-[#0b1a2c] hover:bg-[#122236] rounded-xl transition-colors">
            <MdCheck className="text-[14px]" /> Start Consultation
          </button>
        )}
        {!allowStart && appt.status !== 'completed' && (
          <div className="rounded-xl border border-violet-100 bg-violet-50 px-3 py-2.5 text-center text-xs font-semibold text-violet-700">
            Consultation actions become available on the appointment date.
          </div>
        )}
        {appt.status === 'completed' && (
          <>
            <div className="flex items-center justify-center gap-2 py-1 text-xs font-semibold text-emerald-600">
              <MdCheck className="text-[14px]" /> Consultation Completed
            </div>
            <button onClick={() => onViewPrescription(appt)}
              className="w-full flex items-center justify-center gap-2 py-2.5 text-xs font-bold
                text-violet-700 bg-violet-50 border border-violet-200 hover:bg-violet-100 rounded-xl transition-colors">
              <MdLocalPharmacy className="text-[14px]" /> View Clinical Record
            </button>
          </>
        )}
      </div>
    </div>
  )
}

// ── Walk-in Queue Panel ───────────────────────────────────────────────────────
const WalkInPanel = ({ queue, onCallNext, onMarkDone, onConsultWalkIn, calling }) => (
  <div className="bg-white border border-slate-200 rounded-2xl overflow-hidden">
    <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100">
      <div>
        <h2 className="text-sm font-bold text-slate-800 flex items-center gap-2">
          <MdQueuePlayNext className="text-amber-500" /> Walk-in Queue
        </h2>
        <p className="text-xs text-slate-400 mt-0.5">{queue.length} patient{queue.length !== 1 ? 's' : ''} waiting</p>
      </div>
      <button
        onClick={onCallNext}
        disabled={calling || queue.length === 0}
        className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold text-white bg-amber-500 hover:bg-amber-600
          disabled:opacity-40 disabled:cursor-not-allowed rounded-xl transition-colors">
        <MdSkipNext className="text-[15px]" />
        {calling ? 'Calling…' : 'Call Next'}
      </button>
    </div>

    <div className="divide-y divide-slate-100">
      {queue.length === 0 ? (
        <div className="flex flex-col items-center py-8">
          <MdQueuePlayNext className="text-slate-200 text-[32px] mb-2" />
          <p className="text-xs text-slate-400">No walk-in patients in queue</p>
        </div>
      ) : queue.map((q, idx) => {
        const qcfg = QUEUE_STATUS[q.status] || QUEUE_STATUS.waiting
        return (
          <div key={q.id} className={`flex items-center gap-3 px-4 py-3 ${q.status === 'in-progress' ? 'bg-violet-50/50' : ''}`}>
            <div className={`w-9 h-9 rounded-xl flex items-center justify-center font-black text-sm shrink-0
              ${q.status === 'in-progress' ? 'bg-violet-100 text-violet-700' : 'bg-amber-100 text-amber-700'}`}>
              {q.queue_number}
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-semibold text-slate-800 truncate">{q.patient_name}</p>
              <div className="flex items-center gap-2 mt-0.5">
                <span className={`text-[10px] font-bold border px-1.5 py-0.5 rounded-full ${qcfg.badge}`}>
                  {qcfg.label}
                </span>
                <span className="text-[10px] text-slate-400">{q.arrivedAt || ''}</span>
              </div>
            </div>
            {q.status === 'in-progress' && (
              <div className="flex items-center gap-2 shrink-0">
                {q.appointment_id && (
                  <button onClick={() => onConsultWalkIn(q)}
                    className="text-[11px] font-bold text-violet-700 bg-violet-50 border border-violet-200
                      px-2.5 py-1 rounded-lg hover:bg-violet-100 transition-colors">
                    Consult
                  </button>
                )}
                <button onClick={() => onMarkDone(q.id)}
                  className="text-[11px] font-bold text-emerald-700 bg-emerald-50 border border-emerald-200
                    px-2.5 py-1 rounded-lg hover:bg-emerald-100 transition-colors">
                  Done
                </button>
              </div>
            )}
            {q.status === 'waiting' && idx === 0 && (
              <span className="text-[10px] font-bold text-amber-600 shrink-0">Up next</span>
            )}
          </div>
        )
      })}
    </div>
  </div>
)

// ── Main Component ────────────────────────────────────────────────────────────
const formatAppointmentDate = (dateValue, includeYear = true) => {
  if (!dateValue) return 'Unknown date'
  const date = new Date(`${String(dateValue).slice(0, 10)}T00:00:00`)
  if (Number.isNaN(date.getTime())) return String(dateValue)
  return date.toLocaleDateString('en-PH', {
    weekday: 'long', month: 'long', day: 'numeric', ...(includeYear ? { year: 'numeric' } : {}),
  })
}

const Doctor_Appointments = () => {
  const navigate = useNavigate()
  const [appointments, setAppointments] = useState([])
  const [selected, setSelected] = useState(null)
  const [loading, setLoading] = useState(true)
  const [walkInQueue, setWalkInQueue] = useState([])
  const [calling, setCalling] = useState(false)
  const [prescModal, setPrescModal] = useState(null)
  const [mobileDetailOpen, setMobileDetailOpen] = useState(false)
  const [viewMode, setViewMode] = useState('today')
  const today = getLocalDateOnly()
  const [dateFilter, setDateFilter] = useState(today)

  const loadAppointments = useCallback(async () => {
    try {
      const params = viewMode === 'upcoming'
        ? { scope: 'upcoming' }
        : viewMode === 'date'
          ? { scope: 'date', date: dateFilter }
          : { scope: 'today' }
      const data = await getAppointments(params)
      const arr = Array.isArray(data) ? data : []
      setAppointments(arr)
      setSelected(prev => prev ? (arr.find(a => a.id === prev.id) || arr[0] || null) : (arr[0] || null))
    } catch (err) {
      console.error('Fetch error:', err)
      setAppointments([])
      setSelected(null)
    } finally {
      setLoading(false)
    }
  }, [dateFilter, viewMode])

  const loadQueue = useCallback(() => {
    getMyQueue()
      .then(data => setWalkInQueue(Array.isArray(data) ? data : []))
      .catch(() => {})
  }, [])

  useEffect(() => {
    setLoading(true)
    setSelected(null)
    setMobileDetailOpen(false)
    loadAppointments()
    const timer = window.setInterval(loadAppointments, viewMode === 'today' ? 15000 : 30000)
    return () => window.clearInterval(timer)
  }, [loadAppointments, viewMode])

  usePolling(loadQueue, 10000, viewMode !== 'today')

  const handleStart = async (appt) => {
    const appointmentDate = String(appt.appointment_date || '').slice(0, 10)
    if (appointmentDate && appointmentDate !== today) {
      alert('Consultations can only be started on the appointment date.')
      return
    }
    try {
      if (appt.status !== 'in-progress') {
        await startConsultation(appt.id)
        setAppointments(prev => prev.map(a => a.id === appt.id ? { ...a, status: 'in-progress' } : a))
      }
      navigate('/doctor/consultation', { state: { appointment: { ...appt, status: 'in-progress' } } })
    } catch (err) {
      console.error('Failed to start consultation', err)
    }
  }

  const handleCallNext = async () => {
    setCalling(true)
    try {
      await callNextPatient()
      loadQueue()
    } catch (err) {
      console.error('Call next failed', err)
    } finally {
      setCalling(false)
    }
  }

  const handleMarkDone = async (id) => {
    try {
      await markQueueEntryDone(id)
      loadQueue()
    } catch (err) {
      console.error('Mark done failed', err)
    }
  }

  const handleViewPrescription = (appt) => {
    setPrescModal({ id: appt.id, patientName: appt.patient_name || appt.patient })
  }

  const handleSelectAppointment = (appt) => {
    setSelected(appt)
    setMobileDetailOpen(true)
  }

  const handleConsultWalkIn = async (entry) => {
    if (!entry?.appointment_id) {
      alert('This walk-in does not have a linked appointment record yet.')
      return
    }

    const walkInAppt = {
      id: entry.appointment_id,
      patient_id: entry.patient_id,
      patient_name: entry.patient_name,
      patient: entry.patient_name,
      patient_age: entry.patient_age,
      patient_sex: entry.patient_sex,
      patient_phone: entry.patient_phone,
      reason: entry.reason || 'Walk-in consultation',
      time: entry.time || entry.arrivedAt,
      type: entry.type,
      appointment_date: today,
      status: 'in-progress',
    }

    try {
      await startConsultation(entry.appointment_id)
      navigate('/doctor/consultation', { state: { appointment: walkInAppt } })
    } catch (err) {
      console.error('Failed to open walk-in consultation', err)
      alert('Failed to open walk-in consultation. Please try again.')
    }
  }

  const openConsultationRecord = (appointmentId) => {
    setPrescModal(null)
    navigate(`/doctor/consultation?id=${appointmentId}`)
  }

  const done = appointments.filter(a => a.status === 'completed').length
  const inProgressCount = appointments.filter(a => a.status === 'in-progress').length
  const pendingCount = appointments.filter(a => a.status === 'pending').length
  const confirmedCount = appointments.filter(a => a.status === 'confirmed' || a.status === 'rescheduled').length
  const appointmentPagination = useClientPagination(appointments, { initialPageSize: 10, resetDeps: [viewMode, dateFilter] })
  const walkInPagination = useClientPagination(walkInQueue, { initialPageSize: 8 })

  const groupedPageItems = appointmentPagination.pageItems.reduce((groups, appt) => {
    const key = String(appt.appointment_date || '').slice(0, 10) || 'Unknown date'
    if (!groups[key]) groups[key] = []
    groups[key].push(appt)
    return groups
  }, {})

  const selectedDateLabel = viewMode === 'today'
    ? formatAppointmentDate(today)
    : viewMode === 'upcoming'
      ? 'Future confirmed, pending, and rescheduled appointments'
      : formatAppointmentDate(dateFilter)

  const allowStart = String(selected?.appointment_date || (viewMode === 'date' ? dateFilter : today)).slice(0, 10) === today
  const showWalkInQueue = viewMode === 'today'

  return (
    <>
      <div className="mx-auto max-w-6xl space-y-5">
        <div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
          <div>
            <h1 className="text-2xl font-bold text-slate-800">Appointments</h1>
            <p className="text-sm text-slate-500 mt-0.5">{selectedDateLabel}</p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => setViewMode('today')}
              className={`rounded-xl border px-3.5 py-2 text-xs font-bold transition-colors ${viewMode === 'today' ? 'border-violet-500 bg-violet-600 text-white' : 'border-slate-200 bg-white text-slate-600 hover:bg-slate-50'}`}
            >
              Today
            </button>
            <button
              type="button"
              onClick={() => setViewMode('upcoming')}
              className={`rounded-xl border px-3.5 py-2 text-xs font-bold transition-colors ${viewMode === 'upcoming' ? 'border-violet-500 bg-violet-600 text-white' : 'border-slate-200 bg-white text-slate-600 hover:bg-slate-50'}`}
            >
              Upcoming
            </button>
            <label className={`flex items-center gap-2 rounded-xl border px-3 py-1.5 ${viewMode === 'date' ? 'border-violet-400 bg-violet-50' : 'border-slate-200 bg-white'}`}>
              <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Date</span>
              <input
                type="date"
                value={dateFilter}
                onFocus={() => setViewMode('date')}
                onChange={(event) => { setDateFilter(event.target.value || today); setViewMode('date') }}
                className="bg-transparent text-xs font-bold text-slate-700 outline-none"
              />
            </label>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {viewMode === 'today' ? (
            <>
              <span className="text-[11px] font-bold bg-amber-50 text-amber-700 border border-amber-200 px-2.5 py-1 rounded-full">{confirmedCount} waiting</span>
              {inProgressCount > 0 && <span className="text-[11px] font-bold bg-violet-50 text-violet-700 border border-violet-200 px-2.5 py-1 rounded-full">{inProgressCount} in progress</span>}
              <span className="text-[11px] font-bold bg-slate-100 text-slate-500 border border-slate-200 px-2.5 py-1 rounded-full">{done}/{appointments.length} done</span>
            </>
          ) : (
            <>
              <span className="text-[11px] font-bold bg-violet-50 text-violet-700 border border-violet-200 px-2.5 py-1 rounded-full">{appointments.length} appointment{appointments.length !== 1 ? 's' : ''}</span>
              {pendingCount > 0 && <span className="text-[11px] font-bold bg-amber-50 text-amber-700 border border-amber-200 px-2.5 py-1 rounded-full">{pendingCount} pending</span>}
              {confirmedCount > 0 && <span className="text-[11px] font-bold bg-emerald-50 text-emerald-700 border border-emerald-200 px-2.5 py-1 rounded-full">{confirmedCount} scheduled</span>}
            </>
          )}
        </div>

        {loading ? (
          <div className="flex h-64 items-center justify-center rounded-2xl border border-slate-200 bg-white text-sm text-slate-400">Loading appointments…</div>
        ) : (
          <div className={`grid grid-cols-1 gap-5 items-start ${showWalkInQueue ? 'xl:grid-cols-[minmax(0,1fr)_300px]' : ''}`}>
            <div className="bg-white border border-slate-200 rounded-2xl overflow-hidden flex" style={{ minHeight: '560px' }}>
              <div className="flex flex-col border-r border-slate-100 w-full lg:w-[340px] xl:w-[390px] shrink-0">
                <div className="px-4 py-3 border-b border-slate-100 bg-slate-50/70">
                  <p className="text-[11px] font-bold text-slate-400 uppercase tracking-widest">
                    {viewMode === 'today'
                      ? `${appointments.length} scheduled today`
                      : viewMode === 'upcoming'
                        ? `${appointments.length} upcoming appointments`
                        : `${appointments.length} appointment${appointments.length !== 1 ? 's' : ''}`}
                  </p>
                </div>

                <div className="flex-1 overflow-y-auto">
                  {appointments.length === 0 ? (
                    <div className="flex flex-col items-center py-12 text-center px-6">
                      <MdCalendarToday className="text-slate-200 text-[32px] mb-2" />
                      <p className="text-xs text-slate-400">{viewMode === 'upcoming' ? 'No upcoming appointments.' : 'No appointments scheduled for this date.'}</p>
                    </div>
                  ) : viewMode === 'upcoming' ? (
                    Object.entries(groupedPageItems).map(([date, items]) => (
                      <div key={date}>
                        <div className="sticky top-0 z-10 border-y border-slate-100 bg-slate-50 px-4 py-2 text-[11px] font-black uppercase tracking-wider text-violet-600 first:border-t-0">
                          {formatAppointmentDate(date, false)}
                        </div>
                        <div className="divide-y divide-slate-100">
                          {items.map(appt => (
                            <AppointmentRow key={appt.id} appt={appt} isSelected={selected?.id === appt.id} onSelect={handleSelectAppointment} />
                          ))}
                        </div>
                      </div>
                    ))
                  ) : (
                    <div className="divide-y divide-slate-100">
                      {appointmentPagination.pageItems.map(appt => (
                        <AppointmentRow key={appt.id} appt={appt} isSelected={selected?.id === appt.id} onSelect={handleSelectAppointment} />
                      ))}
                    </div>
                  )}
                </div>

                {appointments.length > 0 && (
                  <div className="border-t border-slate-100 p-3">
                    <Pagination compact {...appointmentPagination} total={appointments.length} pageSizeOptions={[10, 20, 30]} />
                  </div>
                )}
              </div>

              <div className="hidden lg:flex flex-col flex-1 min-w-0">
                {selected ? (
                  <DetailPanel
                    appt={selected}
                    onClose={() => setSelected(null)}
                    onStart={handleStart}
                    onViewPrescription={handleViewPrescription}
                    allowStart={allowStart}
                  />
                ) : (
                  <div className="flex flex-col items-center justify-center flex-1 text-center px-8">
                    <div className="w-14 h-14 rounded-2xl bg-slate-50 border border-slate-100 flex items-center justify-center mb-3">
                      <MdCalendarToday className="text-[24px] text-slate-300" />
                    </div>
                    <p className="text-sm font-semibold text-slate-500">Select an appointment</p>
                    <p className="text-xs text-slate-400 mt-1">Choose an appointment on the left to see patient and visit details.</p>
                  </div>
                )}
              </div>
            </div>

            {showWalkInQueue && (
              <div className="space-y-3">
                <WalkInPanel
                  queue={walkInPagination.pageItems}
                  onCallNext={handleCallNext}
                  onMarkDone={handleMarkDone}
                  onConsultWalkIn={handleConsultWalkIn}
                  calling={calling}
                />
                {walkInQueue.length > 0 && <Pagination compact {...walkInPagination} total={walkInQueue.length} pageSizeOptions={[8, 16, 24]} />}
              </div>
            )}
          </div>
        )}
      </div>

      {mobileDetailOpen && selected && (
        <div className="fixed inset-0 z-50 bg-black/50 lg:hidden" onClick={() => setMobileDetailOpen(false)}>
          <div className="absolute inset-x-0 bottom-0 h-[86vh] overflow-hidden rounded-t-3xl bg-white shadow-2xl" onClick={(event) => event.stopPropagation()}>
            <DetailPanel
              appt={selected}
              onClose={() => setMobileDetailOpen(false)}
              onStart={handleStart}
              onViewPrescription={handleViewPrescription}
              allowStart={allowStart}
            />
          </div>
        </div>
      )}

      {prescModal && (
        <PrescriptionModal
          appointmentId={prescModal.id}
          patientName={prescModal.patientName}
          onClose={() => setPrescModal(null)}
          onOpenFullRecord={openConsultationRecord}
        />
      )}
    </>
  )
}

export default Doctor_Appointments



