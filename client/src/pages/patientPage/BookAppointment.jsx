// client/src/pages/patientPage/BookAppointment.jsx
// REDESIGNED: 5-step wizard, mobile-first, touch-friendly calendar, clean cards

import { useState, useEffect } from 'react'
import { NavLink } from 'react-router-dom'
import {
  getDoctors, getDoctorSchedule, bookAppointment,
} from '../../services/patient.service'
import {
  MdCheck, MdChevronLeft, MdChevronRight, MdFace, MdMedicalServices,
  MdCalendarToday, MdAccessTime, MdPerson, MdAdd,
  MdArrowForward,
} from 'react-icons/md'

// ── Constants ─────────────────────────────────────────────────────────────────
const CLINIC_TYPES = [
  { id: 'medical', label: 'General Medicine', desc: 'Check-ups, general health concerns, minor procedures.',   Icon: MdMedicalServices, from: 'from-sky-500',     to: 'to-sky-600',     light: 'bg-sky-50',     border: 'border-sky-200',     check: 'bg-sky-500'     },
  { id: 'derma',   label: 'Dermatology',      desc: 'Skin, hair & nail conditions, cosmetic procedures.',      Icon: MdFace,            from: 'from-emerald-500', to: 'to-emerald-600', light: 'bg-emerald-50', border: 'border-emerald-200', check: 'bg-emerald-500' },
]
const REASONS = ['General Consultation','Follow-up Visit','Skin Assessment','Acne Treatment','Annual Check-up','Other']
const MONTHS  = ['January','February','March','April','May','June','July','August','September','October','November','December']
const DAYS    = ['Su','Mo','Tu','We','Th','Fr','Sa']
const STEPS   = ['Clinic','Doctor','Schedule','Details','Confirm']

// ── Helpers ───────────────────────────────────────────────────────────────────
function getDaysInMonth(y, m) { return new Date(y, m+1, 0).getDate() }
function getFirstDay(y, m)    { return new Date(y, m, 1).getDay() }
function pad(n) { return String(n).padStart(2, '0') }
function toISO(y, m, d) { return `${y}-${pad(m+1)}-${pad(d)}` }
function parseLocal(iso) { const [y,m,d] = iso.split('-').map(Number); return new Date(y,m-1,d) }

function buildSlots(sched) {
  const slots = []
  let [h, m]    = sched.start_time.split(':').map(Number)
  const [eh,em] = sched.end_time.split(':').map(Number)
  while (h*60+m < eh*60+em) {
    const ampm = h>=12?'PM':'AM', h12=h>12?h-12:h===0?12:h
    slots.push(`${h12}:${pad(m)} ${ampm}`)
    m += sched.slot_duration_mins
    if (m>=60) { h+=Math.floor(m/60); m%=60 }
  }
  return slots
}
function isPastSlot(slot) {
  const [tp, pd] = slot.split(' ')
  let [h,m] = tp.split(':').map(Number)
  if (pd==='PM'&&h!==12) h+=12
  if (pd==='AM'&&h===12) h=0
  const n = new Date()
  return h*60+m <= n.getHours()*60+n.getMinutes()+5
}

// ── Step bar ──────────────────────────────────────────────────────────────────
const StepBar = ({ current }) => (
  <div className="flex items-center mb-6">
    {STEPS.map((label, i) => {
      const done = i < current, active = i === current
      return (
        <div key={label} className="flex items-center flex-1 last:flex-none">
          <div className="flex flex-col items-center gap-1">
            <div className={`w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold transition-all
              ${done ? 'bg-emerald-500 text-white' : active ? 'bg-[#0b1a2c] text-emerald-400 ring-2 ring-emerald-400/30' : 'bg-slate-100 text-slate-400'}`}>
              {done ? <MdCheck className="text-[13px]" /> : i+1}
            </div>
            <span className={`text-[9px] font-bold hidden sm:block ${active?'text-slate-700':done?'text-emerald-500':'text-slate-400'}`}>
              {label}
            </span>
          </div>
          {i < STEPS.length-1 && (
            <div className={`flex-1 h-0.5 mx-1 mb-3 rounded-full transition-all ${done?'bg-emerald-400':'bg-slate-200'}`} />
          )}
        </div>
      )
    })}
  </div>
)

// ── Step 1: Clinic type ───────────────────────────────────────────────────────
const StepClinicType = ({ value, onChange }) => (
  <div className="space-y-3">
    <div>
      <h2 className="text-lg font-bold text-slate-800">Choose Clinic Type</h2>
      <p className="text-sm text-slate-500 mt-0.5">Which type of consultation do you need?</p>
    </div>
    {CLINIC_TYPES.map(({ id, label, desc, Icon, from, to, light, border, check }) => (
      <button key={id} onClick={() => onChange(id)}
        className={`w-full flex items-center gap-4 p-5 rounded-2xl border-2 text-left transition-all
          active:scale-[0.99]
          ${value===id ? `${border} ${light}` : 'border-slate-200 bg-white hover:border-slate-300'}`}>
        <div className={`w-12 h-12 rounded-2xl flex items-center justify-center shrink-0 bg-gradient-to-br ${from} ${to}`}>
          <Icon className="text-white text-[22px]" />
        </div>
        <div className="flex-1 text-left">
          <p className="font-bold text-sm text-slate-800">{label}</p>
          <p className="text-xs text-slate-500 mt-0.5 leading-relaxed">{desc}</p>
        </div>
        <div className={`w-6 h-6 rounded-full border-2 flex items-center justify-center shrink-0 transition-all
          ${value===id ? `${check} border-transparent` : 'border-slate-300 bg-white'}`}>
          {value===id && <MdCheck className="text-white text-[13px]" />}
        </div>
      </button>
    ))}
  </div>
)

// ── Step 2: Doctor ────────────────────────────────────────────────────────────
const StepDoctor = ({ clinicType, value, onChange, doctorList }) => {
  const list = doctorList[clinicType] || []
  const ct = CLINIC_TYPES.find(c => c.id === clinicType)
  return (
    <div className="space-y-3">
      <div>
        <h2 className="text-lg font-bold text-slate-800">Select a Doctor</h2>
        <p className="text-sm text-slate-500 mt-0.5">Doctors available for {ct?.label}.</p>
      </div>
      {list.length === 0 && (
        <div className="py-10 text-center text-slate-400 text-sm">Loading doctors…</div>
      )}
      {list.map(doc => (
        <button key={doc.id} onClick={() => onChange(doc)}
          className={`w-full flex items-center gap-4 p-4 sm:p-5 rounded-2xl border-2 text-left transition-all active:scale-[0.99]
            ${value?.id===doc.id ? 'border-emerald-400 bg-emerald-50' : 'border-slate-200 bg-white hover:border-slate-300'}`}>
          <div className={`w-12 h-12 rounded-2xl flex items-center justify-center shrink-0 font-black text-base
            ${value?.id===doc.id ? 'bg-emerald-500 text-white' : 'bg-slate-100 text-slate-500'}`}>
            {(doc.full_name||doc.name).replace(/^Dr\.?\s*/i,'').split(' ').map(n=>n[0]).slice(0,2).join('').toUpperCase()||'DR'}
          </div>
          <div className="flex-1 min-w-0">
            <p className="font-bold text-sm text-slate-800 truncate">{doc.full_name||doc.name}</p>
            <p className="text-xs text-slate-500 mt-0.5">{doc.specialty||ct?.label}</p>
          </div>
          <div className={`w-6 h-6 rounded-full border-2 flex items-center justify-center shrink-0 transition-all
            ${value?.id===doc.id ? 'bg-emerald-500 border-transparent' : 'border-slate-300 bg-white'}`}>
            {value?.id===doc.id && <MdCheck className="text-white text-[13px]" />}
          </div>
        </button>
      ))}
    </div>
  )
}

// ── Step 3: Schedule ──────────────────────────────────────────────────────────
const StepSchedule = ({ date, time, onDateChange, onTimeChange, timeSlots, takenSlots, doctorSchedules }) => {
  const today = new Date()
  const [viewYear,  setViewYear]  = useState(today.getFullYear())
  const [viewMonth, setViewMonth] = useState(today.getMonth())

  const daysInMonth = getDaysInMonth(viewYear, viewMonth)
  const firstDay    = getFirstDay(viewYear, viewMonth)
  const cells = [...Array(firstDay).fill(null), ...Array.from({length:daysInMonth},(_,i)=>i+1)]

  const isPast = d => new Date(viewYear,viewMonth,d) < new Date(today.getFullYear(),today.getMonth(),today.getDate())
  const isUnavailable = d => {
    if (!doctorSchedules?.length) return false
    const dayName = new Date(viewYear,viewMonth,d).toLocaleDateString('en-US',{weekday:'long'})
    return !doctorSchedules.find(s => s.day_of_week===dayName && s.is_active)
  }
  const isSelected = d => date === toISO(viewYear,viewMonth,d)
  const isToday    = d => d===today.getDate()&&viewMonth===today.getMonth()&&viewYear===today.getFullYear()

  const prevM = () => { if(viewMonth===0){setViewMonth(11);setViewYear(y=>y-1)}else setViewMonth(m=>m-1) }
  const nextM = () => { if(viewMonth===11){setViewMonth(0);setViewYear(y=>y+1)}else setViewMonth(m=>m+1) }

  const todayStr = toISO(today.getFullYear(),today.getMonth(),today.getDate())

  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-lg font-bold text-slate-800">Pick a Date & Time</h2>
        <p className="text-sm text-slate-500 mt-0.5">Select a date then choose an available slot.</p>
      </div>

      {/* Calendar */}
      <div className="bg-slate-50 border border-slate-200 rounded-2xl p-4">
        <div className="flex items-center justify-between mb-3">
          <button onClick={prevM}
            className="w-9 h-9 flex items-center justify-center rounded-xl hover:bg-white hover:shadow-sm transition-all">
            <MdChevronLeft className="text-slate-500 text-[20px]" />
          </button>
          <p className="text-sm font-bold text-slate-800">{MONTHS[viewMonth]} {viewYear}</p>
          <button onClick={nextM}
            className="w-9 h-9 flex items-center justify-center rounded-xl hover:bg-white hover:shadow-sm transition-all">
            <MdChevronRight className="text-slate-500 text-[20px]" />
          </button>
        </div>

        <div className="grid grid-cols-7 mb-1">
          {DAYS.map(d => <p key={d} className="text-center text-[10px] font-bold text-slate-400 py-1">{d}</p>)}
        </div>

        <div className="grid grid-cols-7 gap-y-1">
          {cells.map((d, i) => {
            if (!d) return <div key={`e${i}`} />
            const past = isPast(d), unavail = isUnavailable(d)
            const sel  = isSelected(d), td = isToday(d)
            const disabled = past || unavail
            return (
              <button key={d} disabled={disabled}
                onClick={() => { onDateChange(toISO(viewYear,viewMonth,d)); onTimeChange('') }}
                className={`h-9 sm:h-10 w-full rounded-xl text-xs font-semibold transition-all
                  ${sel ? 'bg-[#0b1a2c] text-emerald-400 font-black shadow-md ring-2 ring-emerald-400/20' : ''}
                  ${!sel && td && !disabled ? 'ring-2 ring-emerald-400 text-emerald-700 bg-emerald-50' : ''}
                  ${!sel && !td && !disabled ? 'hover:bg-emerald-50 hover:text-emerald-700 text-slate-700' : ''}
                  ${disabled ? 'text-slate-300 cursor-not-allowed' : ''}`}>
                {d}
              </button>
            )
          })}
        </div>

        {/* Legend */}
        <div className="flex items-center gap-3 mt-3 pt-3 border-t border-slate-200">
          <span className="flex items-center gap-1.5 text-[10px] text-slate-400">
            <span className="w-3 h-3 rounded-full bg-emerald-50 ring-2 ring-emerald-400 inline-block" /> Today
          </span>
          <span className="flex items-center gap-1.5 text-[10px] text-slate-400">
            <span className="w-3 h-3 rounded-full bg-[#0b1a2c] inline-block" /> Selected
          </span>
          <span className="flex items-center gap-1.5 text-[10px] text-slate-400">
            <span className="w-3 h-3 rounded-full bg-slate-100 inline-block" /> Unavailable
          </span>
        </div>
      </div>

      {/* Time slots */}
      {date && (
        <div>
          <p className="text-xs font-bold text-slate-500 uppercase tracking-widest mb-2 flex items-center gap-1">
            <MdAccessTime className="text-[13px]" /> Available Time Slots
            {date === todayStr && <span className="text-amber-500 font-normal normal-case ml-1">(today — past slots hidden)</span>}
          </p>
          {timeSlots.length === 0 ? (
            <div className="text-center py-5 bg-slate-50 rounded-2xl border border-slate-200">
              <p className="text-sm text-slate-400">
                {date===todayStr ? 'No more slots for today. Pick another date.' : 'No slots available.'}
              </p>
            </div>
          ) : (
            <div className="grid grid-cols-3 sm:grid-cols-4 gap-2">
              {timeSlots.map(slot => {
                const taken = takenSlots.includes(slot)
                return (
                  <button key={slot} disabled={taken} onClick={() => onTimeChange(slot)}
                    className={`py-3 rounded-xl text-xs font-semibold transition-all border-2
                      ${taken ? 'bg-slate-50 text-slate-300 border-slate-100 cursor-not-allowed line-through' : ''}
                      ${!taken && time===slot ? 'bg-[#0b1a2c] text-emerald-400 border-transparent shadow-md' : ''}
                      ${!taken && time!==slot ? 'bg-white text-slate-600 border-slate-200 hover:border-emerald-300 hover:bg-emerald-50' : ''}`}>
                    {slot}
                  </button>
                )
              })}
            </div>
          )}
        </div>
      )}
    </div>
  )
}

// ── Step 4: Details ───────────────────────────────────────────────────────────
const StepDetails = ({ reason, notes, onReasonChange, onNotesChange }) => (
  <div className="space-y-4">
    <div>
      <h2 className="text-lg font-bold text-slate-800">Visit Details</h2>
      <p className="text-sm text-slate-500 mt-0.5">Tell us why you're visiting.</p>
    </div>
    <div>
      <p className="text-xs font-bold text-slate-500 uppercase tracking-widest mb-2">
        Reason for Visit <span className="text-red-400">*</span>
      </p>
      <div className="grid grid-cols-2 gap-2">
        {REASONS.map(r => (
          <button key={r} onClick={() => onReasonChange(r)}
            className={`p-3 rounded-2xl text-xs font-semibold text-left border-2 transition-all active:scale-[0.98]
              ${reason===r ? 'border-emerald-400 bg-emerald-50 text-emerald-800' : 'border-slate-200 bg-white hover:border-slate-300 text-slate-700'}`}>
            {r}
          </button>
        ))}
      </div>
    </div>
    <div>
      <label className="block text-xs font-bold text-slate-500 uppercase tracking-widest mb-1.5">
        Additional Notes <span className="normal-case font-normal text-slate-300">(optional)</span>
      </label>
      <textarea value={notes} onChange={e => onNotesChange(e.target.value)} rows={3}
        placeholder="Any symptoms, concerns, or information the doctor should know…"
        className="w-full text-sm text-slate-700 placeholder-slate-300 bg-slate-50 border-2 border-slate-200
          rounded-2xl px-4 py-3 focus:outline-none focus:border-emerald-400 focus:ring-2
          focus:ring-emerald-400/10 transition-all resize-none" />
    </div>
  </div>
)

// ── Step 5: Confirm ───────────────────────────────────────────────────────────
const StepConfirm = ({ form }) => {
  const ct   = CLINIC_TYPES.find(c => c.id === form.clinicType)
  const Icon = ct?.Icon || MdMedicalServices
  const [y,m,d] = (form.date||'').split('-').map(Number)
  const dateLabel = y&&m&&d ? new Date(y,m-1,d).toLocaleDateString('en-PH',{weekday:'long',year:'numeric',month:'long',day:'numeric'}) : '—'

  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-lg font-bold text-slate-800">Confirm Appointment</h2>
        <p className="text-sm text-slate-500 mt-0.5">Review your details before booking.</p>
      </div>

      <div className="bg-gradient-to-br from-slate-800 to-[#0b1a2c] rounded-2xl p-5 text-white">
        <div className="flex items-center gap-3 mb-4 pb-4 border-b border-white/10">
          <div className={`w-11 h-11 rounded-xl flex items-center justify-center bg-gradient-to-br ${ct?.from} ${ct?.to}`}>
            <Icon className="text-white text-[20px]" />
          </div>
          <div>
            <p className="font-bold text-sm">{ct?.label}</p>
            <p className="text-xs text-white/60">{form.doctor?.full_name || form.doctor?.name}</p>
          </div>
        </div>
        {[
          { label: 'Date',   value: dateLabel,   icon: MdCalendarToday },
          { label: 'Time',   value: form.time,   icon: MdAccessTime    },
          { label: 'Reason', value: form.reason, icon: MdPerson        },
        ].filter(r=>r.value).map(({ label, value, icon: I }) => (
          <div key={label} className="flex items-center gap-3 mb-3 last:mb-0">
            <I className="text-white/40 text-[14px] shrink-0" />
            <div className="flex-1 min-w-0">
              <p className="text-[10px] text-white/40 font-medium">{label}</p>
              <p className="text-sm font-semibold truncate">{value}</p>
            </div>
          </div>
        ))}
      </div>

      {form.notes && (
        <div className="bg-slate-50 rounded-xl px-4 py-3 border border-slate-200">
          <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-1">Notes</p>
          <p className="text-sm text-slate-600 leading-relaxed">{form.notes}</p>
        </div>
      )}

      <div className="bg-emerald-50 border border-emerald-200 rounded-xl px-4 py-3 flex items-start gap-2">
        <MdCheck className="text-emerald-500 text-[15px] shrink-0 mt-0.5" />
        <p className="text-xs text-emerald-700 leading-relaxed">
          By confirming, you agree to the clinic's appointment policy. Your appointment will appear in <strong>My Appointments</strong>.
        </p>
      </div>
    </div>
  )
}

// ── Success ───────────────────────────────────────────────────────────────────
const SuccessScreen = ({ onReset }) => (
  <div className="flex flex-col items-center text-center py-10">
    <div className="w-20 h-20 rounded-full bg-emerald-100 flex items-center justify-center mb-5">
      <MdCheck className="text-emerald-500 text-[40px]" />
    </div>
    <h2 className="text-xl font-bold text-slate-800 mb-2">Appointment Booked!</h2>
    <p className="text-sm text-slate-500 max-w-xs mb-8 leading-relaxed">
      Your appointment has been scheduled. You can view it in <strong>My Appointments</strong>.
    </p>
    <div className="flex flex-col sm:flex-row gap-3 w-full max-w-xs">
      <button onClick={onReset}
        className="flex-1 py-3 text-sm font-semibold text-slate-600 border border-slate-200 rounded-xl hover:bg-slate-50 transition-colors">
        Book Another
      </button>
      <NavLink to="/patient/appointments"
        className="flex-1 py-3 text-sm font-bold text-white bg-emerald-500 hover:bg-emerald-600 rounded-xl transition-colors text-center">
        My Appointments
      </NavLink>
    </div>
  </div>
)

// ── Main ──────────────────────────────────────────────────────────────────────
const BookAppointment = () => {
  const [step, setStep] = useState(0)
  const [done, setDone] = useState(false)
  const [form, setForm] = useState({
    clinicType: '', doctor: null, date: null, time: '', reason: '', notes: '',
  })
  const [doctorList,      setDoctorList]      = useState({ medical: [], derma: [] })
  const [timeSlots,       setTimeSlots]       = useState([])
  const [takenSlots,      setTakenSlots]      = useState([])
  const [doctorSchedules, setDoctorSchedules] = useState([])

  useEffect(() => {
    getDoctors()
      .then(data => {
        const medical = data.filter(d => d.specialty !== 'Dermatologist')
        const derma   = data.filter(d => d.specialty === 'Dermatologist')
        setDoctorList({ medical, derma })
      })
      .catch(() => {})
  }, [])

  useEffect(() => {
    if (!form.doctor) { setDoctorSchedules([]); setTimeSlots([]); setTakenSlots([]); return }
    getDoctorSchedule(form.doctor.id)
      .then(s => setDoctorSchedules(s))
      .catch(() => setDoctorSchedules([]))
  }, [form.doctor])

  useEffect(() => {
    if (!form.doctor || !form.date || !doctorSchedules.length) { setTimeSlots([]); return }
    const localDate = parseLocal(form.date)
    const dayName   = localDate.toLocaleDateString('en-US', { weekday: 'long' })
    const sched     = doctorSchedules.find(s => s.day_of_week === dayName && s.is_active)
    if (!sched) { setTimeSlots([]); return }
    let slots = buildSlots(sched)
    const todayStr = toISO(new Date().getFullYear(), new Date().getMonth(), new Date().getDate())
    if (form.date === todayStr) slots = slots.filter(s => !isPastSlot(s))
    setTimeSlots(slots)
    setTakenSlots([])
  }, [form.date, doctorSchedules])

  const set = key => val => setForm(f => ({ ...f, [key]: val }))

  const canNext = () => {
    if (step===0) return !!form.clinicType
    if (step===1) return !!form.doctor
    if (step===2) return !!form.date && !!form.time
    if (step===3) return !!form.reason
    return true
  }

  const handleNext = () => {
    if (step < 4) setStep(s => s+1)
    else handleConfirm()
  }

  const handleConfirm = async () => {
    try {
      await bookAppointment({
        doctor_id:        form.doctor.id,
        clinic_type:      form.clinicType,
        reason:           form.reason,
        appointment_date: form.date,
        appointment_time: form.time,
        notes:            form.notes || '',
      })
      setDone(true)
    } catch (err) {
      alert(err.message)
    }
  }

  const handleReset = () => {
    setStep(0); setDone(false)
    setTimeSlots([]); setTakenSlots([]); setDoctorSchedules([])
    setForm({ clinicType:'', doctor:null, date:null, time:'', reason:'', notes:'' })
  }

  return (
    <div className="max-w-2xl mx-auto space-y-4">

      {/* Header */}
      <div>
        <h1 className="text-xl lg:text-2xl font-bold text-slate-800 flex items-center gap-2">
          <MdAdd className="text-emerald-500 text-[22px]" /> Book an Appointment
        </h1>
        <p className="text-xs lg:text-sm text-slate-500 mt-0.5">Schedule your clinic visit in a few steps.</p>
      </div>

      {/* Main card */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">

        {/* Progress strip */}
        <div className="h-1 bg-slate-100">
          <div className="h-1 bg-emerald-500 transition-all duration-500 rounded-full"
            style={{ width: `${(step/4)*100}%` }} />
        </div>

        <div className="p-5 sm:p-8">
          {!done && <StepBar current={step} />}

          {done ? (
            <SuccessScreen onReset={handleReset} />
          ) : (
            <>
              {step===0 && <StepClinicType value={form.clinicType} onChange={set('clinicType')} />}
              {step===1 && <StepDoctor clinicType={form.clinicType} value={form.doctor} onChange={set('doctor')} doctorList={doctorList} />}
              {step===2 && (
                <StepSchedule
                  date={form.date} time={form.time}
                  onDateChange={set('date')} onTimeChange={set('time')}
                  timeSlots={timeSlots} takenSlots={takenSlots}
                  doctorSchedules={doctorSchedules}
                />
              )}
              {step===3 && <StepDetails reason={form.reason} notes={form.notes} onReasonChange={set('reason')} onNotesChange={set('notes')} />}
              {step===4 && <StepConfirm form={form} />}

              {/* Nav */}
              <div className="flex items-center justify-between mt-8 pt-5 border-t border-slate-100">
                <button onClick={() => setStep(s=>s-1)} disabled={step===0}
                  className="flex items-center gap-1.5 px-4 py-2.5 text-sm font-semibold text-slate-500
                    border border-slate-200 rounded-xl hover:bg-slate-50 disabled:opacity-30 transition-all">
                  <MdChevronLeft className="text-[16px]" /> Back
                </button>
                <p className="text-xs text-slate-400 font-medium">{step+1} / {STEPS.length}</p>
                <button onClick={handleNext} disabled={!canNext()}
                  className="flex items-center gap-1.5 px-5 py-2.5 text-sm font-bold text-white
                    bg-emerald-500 hover:bg-emerald-600 rounded-xl disabled:opacity-30 transition-all
                    shadow-lg shadow-emerald-500/20">
                  {step===4 ? 'Confirm Booking' : 'Next'}
                  {step<4 && <MdArrowForward className="text-[15px]" />}
                </button>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  )
}

export default BookAppointment