// client/src/pages/patientPage/ResheduleAppointment.jsx
// REDESIGNED: 3-step wizard, touch-friendly calendar, mobile-first

import { useState, useEffect } from 'react'
import { useLocation, useNavigate, useSearchParams } from 'react-router-dom'
import {
  getMyAppointments, getDoctorSchedule, rescheduleAppointment,
} from '../../services/patient.service'
import {
  MdCheck, MdChevronLeft, MdChevronRight, MdCalendarToday,
  MdAccessTime, MdArrowBack, MdFace, MdMedicalServices,
  MdSwapHoriz, MdEventAvailable,
} from 'react-icons/md'

const MONTHS = ['January','February','March','April','May','June',
  'July','August','September','October','November','December']
const DAYS_SHORT = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat']
const STEPS = ['Date & Time', 'Reason', 'Confirm']

function getDaysInMonth(y, m) { return new Date(y, m + 1, 0).getDate() }
function getFirstDay(y, m)    { return new Date(y, m, 1).getDay() }
function pad(n) { return String(n).padStart(2, '0') }

const RESCHEDULE_REASONS = [
  'Schedule conflict', 'Personal emergency', 'Doctor unavailable',
  'Health improvement', 'Transportation issue', 'Other',
]

// ── Step bar ──────────────────────────────────────────────────────────────────
const StepBar = ({ current }) => (
  <div className="flex items-center justify-between mb-6">
    {STEPS.map((s, i) => (
      <div key={s} className="flex items-center flex-1 last:flex-none">
        <div className="flex flex-col items-center gap-1">
          <div className={`w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold shrink-0 transition-all
            ${i < current ? 'bg-emerald-500 text-white' : i === current ? 'bg-[#0b1a2c] text-emerald-400' : 'bg-slate-100 text-slate-400'}`}>
            {i < current ? <MdCheck className="text-[13px]" /> : i + 1}
          </div>
          <p className={`text-[10px] font-bold hidden sm:block whitespace-nowrap
            ${i === current ? 'text-slate-800' : 'text-slate-400'}`}>{s}</p>
        </div>
        {i < STEPS.length - 1 && (
          <div className={`flex-1 h-0.5 mx-2 rounded-full mt-[-12px] transition-all
            ${i < current ? 'bg-emerald-400' : 'bg-slate-200'}`} />
        )}
      </div>
    ))}
  </div>
)

// ── Current appointment mini-card ─────────────────────────────────────────────
const CurrentCard = ({ appt }) => {
  if (!appt) return null
  const Icon = appt.clinic_type === 'derma' ? MdFace : MdMedicalServices
  return (
    <div className="bg-amber-50 border border-amber-200 rounded-2xl p-4 flex items-center gap-3">
      <div className="w-10 h-10 rounded-xl bg-amber-100 flex items-center justify-center shrink-0">
        <Icon className="text-amber-600 text-[18px]" />
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-xs font-bold text-amber-600 uppercase tracking-wide">Current Appointment</p>
        <p className="text-sm font-semibold text-slate-800 truncate">{appt.doctor_name || appt.doctor}</p>
        <p className="text-xs text-slate-500 mt-0.5">
          {appt.appointment_date || appt.date} · {appt.appointment_time || appt.time}
        </p>
      </div>
      <MdSwapHoriz className="text-amber-400 text-[22px] shrink-0" />
    </div>
  )
}

// ── Step 1: Calendar + Time Picker ────────────────────────────────────────────
const StepSchedule = ({ appt, date, setDate, time, setTime }) => {
  const today = new Date()
  const [viewYear,  setViewYear]  = useState(today.getFullYear())
  const [viewMonth, setViewMonth] = useState(today.getMonth())
  const [schedule,  setSchedule]  = useState([])

  useEffect(() => {
    if (!appt?.doctor_id) return
    getDoctorSchedule(appt.doctor_id).then(s => setSchedule(s)).catch(() => {})
  }, [appt?.doctor_id])

  const prevMonth = () => {
    if (viewMonth === 0) { setViewYear(y => y - 1); setViewMonth(11) }
    else setViewMonth(m => m - 1)
  }
  const nextMonth = () => {
    if (viewMonth === 11) { setViewYear(y => y + 1); setViewMonth(0) }
    else setViewMonth(m => m + 1)
  }

  const daysInMonth = getDaysInMonth(viewYear, viewMonth)
  const firstDay    = getFirstDay(viewYear, viewMonth)
  const cells = [...Array(firstDay).fill(null), ...Array.from({ length: daysInMonth }, (_, i) => i + 1)]

  const DAYS_MAP = { Sunday:0,Monday:1,Tuesday:2,Wednesday:3,Thursday:4,Friday:5,Saturday:6 }
  const activeDays = new Set(schedule.map(s => DAYS_MAP[s.day_of_week]))

  const isPast   = d => { const c = new Date(viewYear,viewMonth,d); c.setHours(0,0,0,0); const t=new Date(); t.setHours(0,0,0,0); return c<t }
  const isDayOff = d => schedule.length > 0 && !activeDays.has(new Date(viewYear,viewMonth,d).getDay())
  const isSel    = d => date?.day===d && date?.month===viewMonth && date?.year===viewYear

  // Build time slots for selected day
  const selDOW = date ? new Date(date.year, date.month, date.day).getDay() : null
  const daySchedule = schedule.find(s => selDOW !== null && DAYS_MAP[s.day_of_week] === selDOW)
  const timeSlots = []
  if (daySchedule) {
    const [sh,sm] = daySchedule.start_time.split(':').map(Number)
    const [eh,em] = daySchedule.end_time.split(':').map(Number)
    let cur = sh*60+sm, end = eh*60+em, dur = daySchedule.slot_duration_mins||60
    while (cur+dur<=end) {
      const h=Math.floor(cur/60), m=cur%60, ampm=h>=12?'PM':'AM', h12=h%12||12
      timeSlots.push(`${h12}:${pad(m)} ${ampm}`)
      cur+=dur
    }
  }

  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-base font-bold text-slate-800">Choose a New Date & Time</h2>
        <p className="text-xs text-slate-500 mt-0.5">Select an available date on the calendar.</p>
      </div>

      {/* Calendar */}
      <div className="bg-slate-50 border border-slate-200 rounded-2xl p-4">
        {/* Month nav */}
        <div className="flex items-center justify-between mb-4">
          <button onClick={prevMonth} className="w-8 h-8 flex items-center justify-center rounded-xl hover:bg-white hover:shadow-sm transition-all">
            <MdChevronLeft className="text-slate-500 text-[20px]" />
          </button>
          <p className="text-sm font-bold text-slate-800">{MONTHS[viewMonth]} {viewYear}</p>
          <button onClick={nextMonth} className="w-8 h-8 flex items-center justify-center rounded-xl hover:bg-white hover:shadow-sm transition-all">
            <MdChevronRight className="text-slate-500 text-[20px]" />
          </button>
        </div>

        {/* Day headers */}
        <div className="grid grid-cols-7 mb-1">
          {DAYS_SHORT.map(d => (
            <p key={d} className="text-center text-[10px] font-bold text-slate-400 uppercase py-1">{d}</p>
          ))}
        </div>

        {/* Days */}
        <div className="grid grid-cols-7 gap-y-1">
          {cells.map((d, i) => {
            if (!d) return <div key={`e-${i}`} />
            const past = isPast(d), off = isDayOff(d), sel = isSel(d)
            const disabled = past || off
            return (
              <button key={d} disabled={disabled}
                onClick={() => { setDate({ day: d, month: viewMonth, year: viewYear }); setTime('') }}
                className={`h-9 w-full rounded-xl text-xs font-semibold transition-all
                  ${sel     ? 'bg-[#0b1a2c] text-emerald-400 font-black shadow-md'           : ''}
                  ${!sel && !disabled ? 'hover:bg-emerald-50 hover:text-emerald-700 text-slate-700' : ''}
                  ${disabled ? 'text-slate-300 cursor-not-allowed line-through'              : ''}`}>
                {d}
              </button>
            )
          })}
        </div>
      </div>

      {/* Time slots */}
      {date && (
        <div>
          <p className="text-xs font-bold text-slate-500 uppercase tracking-widest mb-2 flex items-center gap-1">
            <MdAccessTime className="text-[13px]" /> Available Time Slots
          </p>
          {timeSlots.length === 0 ? (
            <p className="text-sm text-slate-400 text-center py-4 bg-slate-50 rounded-xl">
              No slots available for this day.
            </p>
          ) : (
            <div className="grid grid-cols-3 sm:grid-cols-4 gap-2">
              {timeSlots.map(slot => (
                <button key={slot} onClick={() => setTime(slot)}
                  className={`py-2.5 rounded-xl text-xs font-semibold transition-all border-2
                    ${time === slot
                      ? 'bg-[#0b1a2c] text-emerald-400 border-transparent shadow-md'
                      : 'bg-white text-slate-600 border-slate-200 hover:border-emerald-300 hover:bg-emerald-50'}`}>
                  {slot}
                </button>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  )
}

// ── Step 2: Reason ─────────────────────────────────────────────────────────────
const StepReason = ({ reason, setReason, notes, setNotes }) => (
  <div className="space-y-4">
    <div>
      <h2 className="text-base font-bold text-slate-800">Reason for Rescheduling</h2>
      <p className="text-xs text-slate-500 mt-0.5">Why do you need to move this appointment?</p>
    </div>
    <div className="grid grid-cols-2 gap-2">
      {RESCHEDULE_REASONS.map(r => (
        <button key={r} onClick={() => setReason(r)}
          className={`p-3 rounded-xl text-xs font-semibold text-left border-2 transition-all
            ${reason === r
              ? 'border-emerald-400 bg-emerald-50 text-emerald-800'
              : 'border-slate-200 bg-white hover:border-slate-300 text-slate-700'}`}>
          {r}
        </button>
      ))}
    </div>
    <div>
      <label className="block text-[11px] font-bold text-slate-500 uppercase tracking-widest mb-1.5">
        Additional Notes <span className="normal-case font-normal text-slate-300">(optional)</span>
      </label>
      <textarea value={notes} onChange={e => setNotes(e.target.value)} rows={3}
        placeholder="Any other details…"
        className="w-full text-sm bg-slate-50 border-2 border-slate-200 rounded-xl px-4 py-3
          focus:outline-none focus:border-emerald-400 focus:ring-2 focus:ring-emerald-400/10 resize-none transition-all" />
    </div>
  </div>
)

// ── Step 3: Confirm ────────────────────────────────────────────────────────────
const StepConfirm = ({ current, newDate, newTime, reason }) => {
  const dateStr = newDate
    ? `${newDate.year}-${pad(newDate.month + 1)}-${pad(newDate.day)}`
    : '—'
  const Icon = current?.clinic_type === 'derma' ? MdFace : MdMedicalServices

  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-base font-bold text-slate-800">Confirm Reschedule</h2>
        <p className="text-xs text-slate-500 mt-0.5">Review the changes before submitting.</p>
      </div>

      <div className="bg-slate-50 rounded-2xl p-4 space-y-3">
        <div className="flex items-center gap-3 pb-3 border-b border-slate-200">
          <div className={`w-9 h-9 rounded-xl flex items-center justify-center shrink-0
            ${current?.clinic_type === 'derma' ? 'bg-emerald-50' : 'bg-slate-100'}`}>
            <Icon className={`text-[17px] ${current?.clinic_type === 'derma' ? 'text-emerald-600' : 'text-slate-500'}`} />
          </div>
          <div>
            <p className="text-sm font-bold text-slate-800">{current?.doctor_name || current?.doctor}</p>
            <p className="text-xs text-slate-400">{current?.clinic_type === 'derma' ? 'Dermatology' : 'General Medicine'}</p>
          </div>
        </div>

        {[
          { label: 'New Date', value: dateStr, icon: MdCalendarToday },
          { label: 'New Time', value: newTime || '—', icon: MdAccessTime },
          { label: 'Reason',   value: reason || '—', icon: MdEventAvailable },
        ].map(({ label, value, icon: I }) => (
          <div key={label} className="flex items-start gap-3">
            <div className="w-6 h-6 rounded-lg bg-white border border-slate-200 flex items-center justify-center shrink-0 mt-0.5">
              <I className="text-[11px] text-slate-400" />
            </div>
            <div>
              <p className="text-[10px] text-slate-400 font-medium">{label}</p>
              <p className="text-sm font-semibold text-slate-800">{value}</p>
            </div>
          </div>
        ))}
      </div>

      <div className="bg-emerald-50 border border-emerald-200 rounded-xl px-4 py-3 flex items-start gap-2">
        <MdCheck className="text-emerald-500 text-[15px] shrink-0 mt-0.5" />
        <p className="text-xs text-emerald-700">Your original appointment will be updated once you confirm.</p>
      </div>
    </div>
  )
}

// ── Success screen ─────────────────────────────────────────────────────────────
const SuccessScreen = ({ navigate }) => (
  <div className="flex flex-col items-center text-center py-8">
    <div className="w-20 h-20 rounded-full bg-emerald-100 flex items-center justify-center mb-5">
      <MdCheck className="text-emerald-500 text-[40px]" />
    </div>
    <h2 className="text-xl font-bold text-slate-800 mb-2">Appointment Rescheduled!</h2>
    <p className="text-sm text-slate-500 max-w-xs mb-7">
      Your appointment has been updated. Check <strong>My Appointments</strong> for the new schedule.
    </p>
    <div className="flex flex-col sm:flex-row gap-3 w-full max-w-xs">
      <button onClick={() => navigate('/patient/appointments')}
        className="flex-1 py-3 text-sm font-bold text-white bg-[#0b1a2c] hover:bg-[#122236] rounded-xl transition-colors">
        View Appointments
      </button>
      <button onClick={() => navigate('/patient')}
        className="flex-1 py-3 text-sm font-semibold text-slate-600 border border-slate-200 hover:bg-slate-50 rounded-xl transition-colors">
        Dashboard
      </button>
    </div>
  </div>
)

// ── Main ──────────────────────────────────────────────────────────────────────
const RescheduleAppointment = () => {
  const location = useLocation()
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()

  const [currentAppt,  setCurrentAppt]  = useState(location.state?.appointment || null)
  const [loadingAppt,  setLoadingAppt]  = useState(!location.state?.appointment)
  const [step,         setStep]         = useState(0)
  const [done,         setDone]         = useState(false)
  const [submitting,   setSubmitting]   = useState(false)
  const [error,        setError]        = useState('')
  const [newDate,      setNewDate]      = useState(null)
  const [newTime,      setNewTime]      = useState('')
  const [reason,       setReason]       = useState('')
  const [notes,        setNotes]        = useState('')

  useEffect(() => {
    if (currentAppt) return
    const id = searchParams.get('id')
    if (!id) { navigate('/patient/appointments'); return }
    getMyAppointments()
      .then(list => {
        const found = list.find(a => String(a.id) === String(id))
        if (!found) navigate('/patient/appointments')
        else setCurrentAppt(found)
      })
      .catch(() => navigate('/patient/appointments'))
      .finally(() => setLoadingAppt(false))
  }, []) // eslint-disable-line

  const canNext = () => {
    if (step === 0) return !!newDate && !!newTime
    if (step === 1) return !!reason
    return true
  }

  const handleNext = async () => {
    if (step < STEPS.length - 1) { setStep(s => s + 1); return }
    if (!currentAppt) return
    setSubmitting(true); setError('')
    try {
      const dateStr = `${newDate.year}-${pad(newDate.month+1)}-${pad(newDate.day)}`
      await rescheduleAppointment(currentAppt.id, {
        appointment_date: dateStr,
        appointment_time: newTime,
        notes: notes || reason,
      })
      setDone(true)
    } catch (err) {
      setError(err.message || 'Failed to reschedule. Please try again.')
    } finally { setSubmitting(false) }
  }

  if (loadingAppt) return (
    <div className="flex items-center justify-center h-64">
      <div className="w-8 h-8 border-4 border-slate-200 border-t-emerald-500 rounded-full animate-spin" />
    </div>
  )

  if (!currentAppt) return null

  return (
    <div className="max-w-2xl mx-auto space-y-4">

      {/* Header */}
      <div className="flex items-center gap-3">
        <button onClick={() => navigate('/patient/appointments')}
          className="w-9 h-9 flex items-center justify-center rounded-xl bg-white border border-slate-200
            hover:bg-slate-50 text-slate-500 transition-colors shrink-0">
          <MdArrowBack className="text-[18px]" />
        </button>
        <div>
          <h1 className="text-xl font-bold text-slate-800">Reschedule Appointment</h1>
          <p className="text-xs text-slate-500 mt-0.5">Move your appointment to a new date and time.</p>
        </div>
      </div>

      <CurrentCard appt={currentAppt} />

      {/* Card */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
        <div className="px-5 sm:px-8 pt-6 sm:pt-8 pb-2">
          {!done && <StepBar current={step} />}
        </div>

        <div className="px-5 sm:px-8 pb-6 sm:pb-8">
          {done ? (
            <SuccessScreen navigate={navigate} />
          ) : (
            <>
              {step === 0 && <StepSchedule appt={currentAppt} date={newDate} setDate={setNewDate} time={newTime} setTime={setNewTime} />}
              {step === 1 && <StepReason reason={reason} setReason={setReason} notes={notes} setNotes={setNotes} />}
              {step === 2 && <StepConfirm current={currentAppt} newDate={newDate} newTime={newTime} reason={reason} />}

              {error && (
                <div className="mt-4 bg-red-50 border border-red-200 text-red-700 text-sm rounded-xl px-4 py-3">
                  {error}
                </div>
              )}

              {/* Footer nav */}
              <div className="flex items-center justify-between mt-6 pt-5 border-t border-slate-100">
                <button onClick={() => setStep(s => s - 1)} disabled={step === 0}
                  className="flex items-center gap-1.5 px-4 py-2.5 text-sm font-semibold text-slate-500
                    border border-slate-200 rounded-xl hover:bg-slate-50 disabled:opacity-30 transition-all">
                  <MdChevronLeft className="text-[16px]" /> Back
                </button>
                <p className="text-xs text-slate-400 font-medium">Step {step + 1} / {STEPS.length}</p>
                <button onClick={handleNext} disabled={!canNext() || submitting}
                  className="flex items-center gap-1.5 px-5 py-2.5 text-sm font-bold text-white
                    bg-[#0b1a2c] hover:bg-[#122236] rounded-xl disabled:opacity-30 transition-all">
                  {submitting ? 'Submitting…' : step === STEPS.length - 1 ? 'Confirm' : 'Next'}
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
