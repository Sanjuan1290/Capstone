// client/src/pages/patientPage/ResheduleAppointment.jsx
// FIX: was using a hardcoded static `currentAppointment` constant.
// Now reads the appointment from location.state (passed by MyAppointments)
// OR fetches it fresh from the API using a ?id= query param.
// FIX: calls the real rescheduleAppointment() API on submit.

import { useState, useEffect } from 'react'
import { useLocation, useNavigate, useSearchParams } from 'react-router-dom'
import {
  getMyAppointments, getDoctorSchedule, rescheduleAppointment,
} from '../../services/patient.service'
import {
  MdCheck, MdChevronLeft, MdChevronRight,
  MdCalendarToday, MdAccessTime, MdInfoOutline,
  MdMedicalServices, MdArrowBack, MdPerson,
  MdSwapHoriz,
} from 'react-icons/md'

const MONTHS = ['January','February','March','April','May','June',
  'July','August','September','October','November','December']
const DAYS   = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat']

function getDaysInMonth(y, m) { return new Date(y, m + 1, 0).getDate() }
function getFirstDay(y, m)    { return new Date(y, m, 1).getDay() }

// ── Step bar ─────────────────────────────────────────────────────────────────
const STEPS = ['New Date & Time', 'Reason', 'Confirm']
const StepBar = ({ current }) => (
  <div className="flex items-center gap-0 mb-6">
    {STEPS.map((s, i) => (
      <div key={s} className="flex items-center flex-1 last:flex-none">
        <div className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold shrink-0
          ${i < current ? 'bg-emerald-500 text-white' : i === current ? 'bg-[#0b1a2c] text-emerald-400' : 'bg-slate-100 text-slate-400'}`}>
          {i < current ? <MdCheck className="text-[14px]" /> : i + 1}
        </div>
        <p className={`text-[11px] font-semibold ml-1.5 ${i === current ? 'text-slate-800' : 'text-slate-400'}`}>{s}</p>
        {i < STEPS.length - 1 && <div className={`flex-1 h-px mx-3 ${i < current ? 'bg-emerald-300' : 'bg-slate-200'}`} />}
      </div>
    ))}
  </div>
)

// ── Current card ─────────────────────────────────────────────────────────────
const CurrentCard = ({ appt }) => {
  if (!appt) return null
  return (
    <div className="bg-amber-50 border border-amber-200 rounded-2xl p-4 flex items-start gap-3">
      <div className="w-8 h-8 rounded-xl bg-amber-100 flex items-center justify-center shrink-0">
        <MdCalendarToday className="text-amber-600 text-[15px]" />
      </div>
      <div>
        <p className="text-xs font-bold text-amber-700 uppercase tracking-wide mb-0.5">Current Appointment</p>
        <p className="text-sm font-semibold text-slate-800">{appt.doctor_name || appt.doctor}</p>
        <p className="text-sm text-slate-600">{appt.appointment_date || appt.date} · {appt.appointment_time || appt.time}</p>
        <p className="text-xs text-slate-500 mt-0.5 capitalize">{appt.clinic_type === 'derma' ? 'Dermatology' : 'General Medicine'}</p>
      </div>
    </div>
  )
}

// ── Step 1 — Pick date & time ─────────────────────────────────────────────────
const rescheduleReasons = [
  'Schedule conflict', 'Personal emergency', 'Doctor unavailable',
  'Health improvement', 'Transportation issue', 'Other',
]

const StepSchedule = ({ appt, date, setDate, time, setTime }) => {
  const today = new Date()
  const [viewYear,  setViewYear]  = useState(today.getFullYear())
  const [viewMonth, setViewMonth] = useState(today.getMonth())
  const [schedule,  setSchedule]  = useState([])
  const [takenSlots, setTakenSlots] = useState([])

  useEffect(() => {
    if (!appt?.doctor_id) return
    getDoctorSchedule(appt.doctor_id)
      .then(s => setSchedule(s))
      .catch(() => {})
  }, [appt?.doctor_id])

  const prevMonth = () => { if (viewMonth === 0) { setViewYear(y => y - 1); setViewMonth(11) } else setViewMonth(m => m - 1) }
  const nextMonth = () => { if (viewMonth === 11) { setViewYear(y => y + 1); setViewMonth(0) } else setViewMonth(m => m + 1) }

  const daysInMonth = getDaysInMonth(viewYear, viewMonth)
  const firstDay    = getFirstDay(viewYear, viewMonth)
  const cells = [...Array(firstDay).fill(null), ...Array.from({length: daysInMonth}, (_, i) => i + 1)]

  const isPast = (d) => {
    const cellDate = new Date(viewYear, viewMonth, d)
    cellDate.setHours(0,0,0,0)
    const t = new Date(); t.setHours(0,0,0,0)
    return cellDate <= t
  }

  // Which days of week does this doctor work?
  const DAYS_MAP = { Sunday:0, Monday:1, Tuesday:2, Wednesday:3, Thursday:4, Friday:5, Saturday:6 }
  const activeDays = new Set(schedule.map(s => DAYS_MAP[s.day_of_week]))

  const isDayOff = (d) => {
    const dayOfWeek = new Date(viewYear, viewMonth, d).getDay()
    return schedule.length > 0 && !activeDays.has(dayOfWeek)
  }

  // Build time slots from schedule
  const selectedDayOfWeek = date ? new Date(viewYear, viewMonth, date.day).getDay() : null
  const daySchedule = schedule.find(s => selectedDayOfWeek !== null && DAYS_MAP[s.day_of_week] === selectedDayOfWeek)
  const timeSlots = []
  if (daySchedule) {
    const [sh, sm] = daySchedule.start_time.split(':').map(Number)
    const [eh, em] = daySchedule.end_time.split(':').map(Number)
    let cur = sh * 60 + sm
    const end = eh * 60 + em
    const dur = daySchedule.slot_duration_mins || 60
    while (cur + dur <= end) {
      const h = Math.floor(cur / 60)
      const m = cur % 60
      const ampm = h >= 12 ? 'PM' : 'AM'
      const h12 = h % 12 || 12
      timeSlots.push(`${h12}:${String(m).padStart(2,'0')} ${ampm}`)
      cur += dur
    }
  }

  const isSel = (d) => date?.day === d && date?.month === viewMonth && date?.year === viewYear

  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-base sm:text-lg font-bold text-slate-800">Choose a New Date & Time</h2>
        <p className="text-sm text-slate-500 mt-0.5">Select an available date and time slot.</p>
      </div>

      {/* Calendar */}
      <div className="bg-white border border-slate-200 rounded-2xl p-4 sm:p-5">
        <div className="flex items-center justify-between mb-4">
          <button onClick={prevMonth} className="w-8 h-8 flex items-center justify-center rounded-xl hover:bg-slate-100 transition-colors">
            <MdChevronLeft className="text-slate-500 text-[18px]" />
          </button>
          <p className="text-sm font-bold text-slate-800">{MONTHS[viewMonth]} {viewYear}</p>
          <button onClick={nextMonth} className="w-8 h-8 flex items-center justify-center rounded-xl hover:bg-slate-100 transition-colors">
            <MdChevronRight className="text-slate-500 text-[18px]" />
          </button>
        </div>

        <div className="grid grid-cols-7 mb-2">
          {DAYS.map(d => (
            <p key={d} className="text-center text-[10px] font-bold text-slate-400 uppercase">{d}</p>
          ))}
        </div>

        <div className="grid grid-cols-7 gap-y-1">
          {cells.map((d, i) => {
            if (!d) return <div key={`e-${i}`} />
            const past   = isPast(d)
            const dayOff = isDayOff(d)
            const sel    = isSel(d)
            const disabled = past || dayOff
            return (
              <button key={d} disabled={disabled}
                onClick={() => { setDate({ day: d, month: viewMonth, year: viewYear }); setTime('') }}
                className={`w-full aspect-square flex items-center justify-center rounded-xl text-xs font-semibold transition-all duration-150
                  ${disabled ? 'text-slate-300 cursor-not-allowed' : ''}
                  ${!disabled && sel    ? 'bg-[#0b1a2c] text-emerald-400' : ''}
                  ${!disabled && !sel   ? 'text-slate-700 hover:bg-slate-100' : ''}
                `}
              >{d}</button>
            )
          })}
        </div>
      </div>

      {/* Time slots */}
      {date && (
        <div className="bg-white border border-slate-200 rounded-2xl p-4 sm:p-5">
          <p className="text-sm font-bold text-slate-800 mb-3 flex items-center gap-2">
            <MdAccessTime className="text-emerald-500 text-[15px]" /> Available Time Slots
          </p>
          {timeSlots.length === 0 ? (
            <p className="text-sm text-slate-400 text-center py-4">No schedule found for this day.</p>
          ) : (
            <div className="grid grid-cols-3 sm:grid-cols-4 gap-2">
              {timeSlots.map(slot => {
                const taken  = takenSlots.includes(slot)
                const active = time === slot
                return (
                  <button key={slot} disabled={taken} onClick={() => setTime(slot)}
                    className={`px-2 py-2.5 rounded-xl text-xs font-semibold transition-all duration-150
                      ${taken  ? 'bg-slate-50 text-slate-300 cursor-not-allowed line-through border border-slate-100' : ''}
                      ${active ? 'bg-[#0b1a2c] text-emerald-400 border border-emerald-500/30' : ''}
                      ${!taken && !active ? 'bg-slate-50 text-slate-600 hover:bg-slate-100 border border-slate-200' : ''}
                    `}
                  >{slot}</button>
                )
              })}
            </div>
          )}
        </div>
      )}
    </div>
  )
}

// ── Step 2 — Reason ───────────────────────────────────────────────────────────
const StepReason = ({ reason, setReason, notes, setNotes }) => (
  <div className="space-y-5">
    <div>
      <h2 className="text-base sm:text-lg font-bold text-slate-800">Reason for Rescheduling</h2>
      <p className="text-sm text-slate-500 mt-0.5">Let us know why you need to move this appointment.</p>
    </div>
    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
      {rescheduleReasons.map(r => (
        <button key={r} onClick={() => setReason(r)}
          className={`px-4 py-3 rounded-xl text-sm font-semibold text-left border-2 transition-all duration-150
            ${reason === r ? 'border-emerald-400 bg-emerald-50 text-emerald-700' : 'border-slate-200 bg-white text-slate-600 hover:border-slate-300 hover:bg-slate-50'}`}>
          {r}
        </button>
      ))}
    </div>
    <div>
      <label className="text-xs font-bold text-slate-600 uppercase tracking-wide mb-2 block">
        Additional Notes <span className="text-slate-400 font-normal normal-case">(optional)</span>
      </label>
      <textarea value={notes} onChange={e => setNotes(e.target.value)} rows={3}
        placeholder="Any additional context for the clinic…"
        className="w-full text-sm text-slate-700 placeholder-slate-300 bg-white border-2 border-slate-200 rounded-2xl px-4 py-3 focus:outline-none focus:border-emerald-400 transition-colors resize-none" />
    </div>
    <div className="flex items-start gap-2.5 bg-amber-50 border border-amber-200 rounded-xl px-4 py-3">
      <MdInfoOutline className="text-amber-500 text-[16px] shrink-0 mt-0.5" />
      <p className="text-xs text-amber-700 leading-relaxed">
        Rescheduling within <strong>24 hours</strong> of your original appointment may require clinic approval.
      </p>
    </div>
  </div>
)

// ── Step 3 — Confirm ──────────────────────────────────────────────────────────
const StepConfirm = ({ current, newDate, newTime, reason }) => {
  const newDateStr = newDate ? `${MONTHS[newDate.month]} ${newDate.day}, ${newDate.year}` : '—'
  return (
    <div className="space-y-5">
      <div>
        <h2 className="text-base sm:text-lg font-bold text-slate-800">Confirm Reschedule</h2>
        <p className="text-sm text-slate-500 mt-0.5">Review the changes before submitting.</p>
      </div>
      <div className="bg-white border border-slate-200 rounded-2xl overflow-hidden">
        <div className="grid grid-cols-1 sm:grid-cols-[1fr_auto_1fr]">
          <div className="p-5 space-y-1">
            <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-3">Current</p>
            <p className="text-sm font-bold text-slate-800">{current?.appointment_date || current?.date}</p>
            <p className="text-sm font-semibold text-slate-600">{current?.appointment_time || current?.time}</p>
          </div>
          <div className="hidden sm:flex items-center justify-center px-2">
            <div className="w-8 h-8 rounded-full bg-slate-100 flex items-center justify-center">
              <MdSwapHoriz className="text-slate-400 text-[18px]" />
            </div>
          </div>
          <div className="p-5 space-y-1 bg-emerald-50/50">
            <p className="text-[10px] font-bold text-emerald-600 uppercase tracking-widest mb-3">New</p>
            <p className="text-sm font-bold text-slate-800">{newDateStr}</p>
            <p className="text-sm font-semibold text-slate-600">{newTime || '—'}</p>
          </div>
        </div>
      </div>
      <div className="bg-white border border-slate-200 rounded-2xl divide-y divide-slate-100">
        {[
          { label: 'Doctor',  value: current?.doctor_name || current?.doctor },
          { label: 'Clinic',  value: current?.clinic_type === 'derma' ? 'Dermatology' : 'General Medicine' },
          { label: 'Reason',  value: current?.reason },
          { label: 'Why rescheduling', value: reason },
        ].map(({ label, value }) => (
          <div key={label} className="flex items-center gap-4 px-5 py-4">
            <div>
              <p className="text-[10px] text-slate-400 font-medium">{label}</p>
              <p className="text-sm font-semibold text-slate-800 mt-0.5">{value || '—'}</p>
            </div>
          </div>
        ))}
      </div>
      <div className="flex items-start gap-2.5 bg-emerald-50 border border-emerald-200 rounded-xl px-4 py-3">
        <MdInfoOutline className="text-emerald-500 text-[16px] shrink-0 mt-0.5" />
        <p className="text-xs text-emerald-700 leading-relaxed">
          Once confirmed, your appointment will be updated and visible in <strong>My Appointments</strong>.
        </p>
      </div>
    </div>
  )
}

// ── Success ───────────────────────────────────────────────────────────────────
const SuccessScreen = ({ navigate }) => (
  <div className="flex flex-col items-center justify-center py-16 text-center px-4">
    <div className="w-20 h-20 rounded-full bg-emerald-100 flex items-center justify-center mb-5">
      <MdCheck className="text-emerald-500 text-[40px]" />
    </div>
    <h2 className="text-xl font-bold text-slate-800 mb-2">Appointment Rescheduled!</h2>
    <p className="text-sm text-slate-500 max-w-xs mb-8">
      Your appointment has been updated. Check <strong>My Appointments</strong> to see the new schedule.
    </p>
    <div className="flex flex-col sm:flex-row gap-3 w-full max-w-xs">
      <button onClick={() => navigate('/patient/appointments')}
        className="flex-1 flex items-center justify-center gap-1.5 py-2.5 text-sm font-semibold text-white bg-[#0b1a2c] rounded-xl hover:bg-[#122236] transition-colors">
        View Appointments
      </button>
      <button onClick={() => navigate('/patient')}
        className="flex-1 flex items-center justify-center gap-1.5 py-2.5 text-sm font-semibold text-slate-600 border border-slate-200 rounded-xl hover:bg-slate-50 transition-colors">
        Go to Dashboard
      </button>
    </div>
  </div>
)

// ── Main ──────────────────────────────────────────────────────────────────────
const RescheduleAppointment = () => {
  const location   = useLocation()
  const navigate   = useNavigate()
  const [searchParams] = useSearchParams()

  // FIX: get appointment from navigation state OR from the API
  const [currentAppointment, setCurrentAppointment] = useState(location.state?.appointment || null)
  const [loadingAppt, setLoadingAppt] = useState(!location.state?.appointment)

  useEffect(() => {
    if (currentAppointment) return
    // Try to load via ?id= param
    const apptId = searchParams.get('id')
    if (!apptId) { navigate('/patient/appointments'); return }
    getMyAppointments()
      .then(list => {
        const found = list.find(a => String(a.id) === String(apptId))
        if (!found) navigate('/patient/appointments')
        else setCurrentAppointment(found)
      })
      .catch(() => navigate('/patient/appointments'))
      .finally(() => setLoadingAppt(false))
  }, []) // eslint-disable-line

  const [step,    setStep]    = useState(0)
  const [done,    setDone]    = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [error,   setError]   = useState('')
  const [newDate, setNewDate] = useState(null)
  const [newTime, setNewTime] = useState('')
  const [reason,  setReason]  = useState('')
  const [notes,   setNotes]   = useState('')

  const canNext = () => {
    if (step === 0) return !!newDate && !!newTime
    if (step === 1) return !!reason
    return true
  }

  const handleNext = async () => {
    if (step < STEPS.length - 1) { setStep(s => s + 1); return }
    // Final step — submit
    if (!currentAppointment) return
    setSubmitting(true)
    setError('')
    try {
      const dateStr = `${newDate.year}-${String(newDate.month + 1).padStart(2,'0')}-${String(newDate.day).padStart(2,'0')}`
      await rescheduleAppointment(currentAppointment.id, {
        appointment_date: dateStr,
        appointment_time: newTime,
        notes: notes || reason,
      })
      setDone(true)
    } catch (err) {
      setError(err.message || 'Failed to reschedule. Please try again.')
    } finally {
      setSubmitting(false)
    }
  }

  if (loadingAppt) return (
    <div className="flex items-center justify-center h-64">
      <div className="w-8 h-8 border-4 border-slate-200 border-t-emerald-500 rounded-full animate-spin" />
    </div>
  )

  if (!currentAppointment) return null

  return (
    <div className="max-w-2xl w-full mx-auto space-y-5 px-0 sm:px-0">
      {/* Page header */}
      <div className="flex items-center gap-3">
        <button onClick={() => navigate('/patient/appointments')}
          className="w-9 h-9 flex items-center justify-center rounded-xl border border-slate-200 hover:bg-slate-100 text-slate-500 transition-colors shrink-0">
          <MdArrowBack className="text-[18px]" />
        </button>
        <div>
          <h1 className="text-xl sm:text-2xl font-bold text-slate-800">Reschedule Appointment</h1>
          <p className="text-xs sm:text-sm text-slate-500 mt-0.5">Move your appointment to a new date and time.</p>
        </div>
      </div>

      <CurrentCard appt={currentAppointment} />

      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
        <div className="px-5 sm:px-8 pt-6 sm:pt-8 pb-4">
          {!done && <StepBar current={step} />}
        </div>

        <div className="px-5 sm:px-8 pb-6 sm:pb-8">
          {done ? (
            <SuccessScreen navigate={navigate} />
          ) : (
            <>
              {step === 0 && (
                <StepSchedule appt={currentAppointment}
                  date={newDate} setDate={setNewDate}
                  time={newTime} setTime={setNewTime} />
              )}
              {step === 1 && (
                <StepReason reason={reason} setReason={setReason} notes={notes} setNotes={setNotes} />
              )}
              {step === 2 && (
                <StepConfirm current={currentAppointment} newDate={newDate} newTime={newTime} reason={reason} />
              )}

              {error && (
                <div className="mt-4 bg-red-50 border border-red-200 text-red-700 text-sm rounded-xl px-4 py-3">
                  {error}
                </div>
              )}

              {/* Footer nav */}
              <div className="flex items-center justify-between mt-8 pt-5 border-t border-slate-100">
                <button onClick={() => setStep(s => s - 1)} disabled={step === 0}
                  className="flex items-center gap-1.5 px-4 py-2.5 text-sm font-semibold text-slate-500 border border-slate-200 rounded-xl hover:bg-slate-50 disabled:opacity-30 disabled:cursor-not-allowed transition-all">
                  <MdChevronLeft className="text-[16px]" /> Back
                </button>
                <p className="text-xs text-slate-400 font-medium">Step {step + 1} of {STEPS.length}</p>
                <button onClick={handleNext} disabled={!canNext() || submitting}
                  className="flex items-center gap-1.5 px-5 py-2.5 text-sm font-semibold text-white bg-[#0b1a2c] rounded-xl hover:bg-[#122236] disabled:opacity-30 disabled:cursor-not-allowed transition-all">
                  {submitting ? 'Submitting…' : step === STEPS.length - 1 ? 'Confirm Reschedule' : 'Next'}
                  {step < STEPS.length - 1 && !submitting && <MdChevronRight className="text-[16px]" />}
                </button>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  )
}

export default RescheduleAppointment