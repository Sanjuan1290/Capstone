import { useState, useEffect } from "react"
import {
  MdChevronRight, MdChevronLeft, MdCalendarToday,
  MdAccessTime, MdPerson, MdMedicalServices, MdFace,
  MdCheck, MdInfoOutline, MdEventAvailable
} from "react-icons/md"
import { NavLink, useNavigate } from "react-router-dom"
import { getDoctors, getDoctorSchedule, bookAppointment } from '../../services/patient.service'

// ── Data ──────────────────────────────────────────────────────────────────────
const clinicTypes = [
  {
    id: "medical",
    label: "General Medicine",
    desc: "Check-ups, consultations, common illnesses",
    icon: MdMedicalServices,
    color: "sky",
  },
  {
    id: "derma",
    label: "Dermatology",
    desc: "Skin care, acne, cosmetic treatments",
    icon: MdFace,
    color: "emerald",
  },
]

const reasons = [
  "General Consultation","Follow-up Visit","Skin Assessment",
  "Acne Treatment","Annual Check-up","Other",
]

// ── Helpers ───────────────────────────────────────────────────────────────────
function getDaysInMonth(year, month) {
  return new Date(year, month + 1, 0).getDate()
}
function getFirstDay(year, month) {
  return new Date(year, month, 1).getDay()
}
const MONTHS = ["January","February","March","April","May","June",
  "July","August","September","October","November","December"]
const DAYS = ["Sun","Mon","Tue","Wed","Thu","Fri","Sat"]

// ── Step indicators ───────────────────────────────────────────────────────────
const STEPS = ["Clinic Type","Doctor","Schedule","Details","Confirm"]

const StepBar = ({ current }) => (
  <div className="flex items-center gap-0 mb-8">
    {STEPS.map((label, i) => {
      const done    = i < current
      const active  = i === current
      const last    = i === STEPS.length - 1
      return (
        <div key={label} className="flex items-center flex-1 last:flex-none">
          <div className="flex flex-col items-center gap-1.5 relative">
            <div className={`w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold border-2 transition-all duration-300
              ${done   ? "bg-emerald-500 border-emerald-500 text-white"              : ""}
              ${active ? "bg-[#0b1a2c] border-emerald-500 text-emerald-400"          : ""}
              ${!done && !active ? "bg-white border-slate-200 text-slate-400"        : ""}
            `}>
              {done ? <MdCheck className="text-[14px]" /> : i + 1}
            </div>
            <span className={`text-[10px] font-semibold whitespace-nowrap
              ${active ? "text-slate-700" : done ? "text-emerald-600" : "text-slate-400"}
            `}>{label}</span>
          </div>
          {!last && (
            <div className={`flex-1 h-0.5 mb-4 mx-1 rounded transition-colors duration-300
              ${done ? "bg-emerald-400" : "bg-slate-200"}
            `} />
          )}
        </div>
      )
    })}
  </div>
)

// ── Step 1 — Clinic Type ──────────────────────────────────────────────────────
const StepClinicType = ({ value, onChange }) => (
  <div className="space-y-3">
    <div className="mb-5">
      <h2 className="text-lg font-bold text-slate-800">Choose Clinic Type</h2>
      <p className="text-sm text-slate-500 mt-0.5">Select the type of consultation you need.</p>
    </div>
    {clinicTypes.map(({ id, label, desc, icon: Icon, color }) => (
      <button
        key={id}
        onClick={() => onChange(id)}
        className={`w-full flex items-center gap-4 p-5 rounded-2xl border-2 text-left transition-all duration-150
          ${value === id
            ? color === "emerald"
              ? "border-emerald-400 bg-emerald-50"
              : "border-sky-400 bg-sky-50"
            : "border-slate-200 bg-white hover:border-slate-300 hover:bg-slate-50"
          }`}
      >
        <div className={`w-12 h-12 rounded-xl flex items-center justify-center shrink-0
          ${value === id
            ? color === "emerald" ? "bg-emerald-100" : "bg-sky-100"
            : "bg-slate-100"
          }`}>
          <Icon className={`text-[22px]
            ${value === id
              ? color === "emerald" ? "text-emerald-600" : "text-sky-600"
              : "text-slate-400"
            }`} />
        </div>
        <div className="flex-1">
          <p className={`font-bold text-sm ${value === id ? "text-slate-800" : "text-slate-700"}`}>{label}</p>
          <p className="text-xs text-slate-500 mt-0.5">{desc}</p>
        </div>
        {value === id && (
          <div className="w-5 h-5 rounded-full bg-emerald-500 flex items-center justify-center shrink-0">
            <MdCheck className="text-white text-[12px]" />
          </div>
        )}
      </button>
    ))}
  </div>
)

// ── Step 2 — Doctor ───────────────────────────────────────────────────────────
const StepDoctor = ({ clinicType, value, onChange, doctorList }) => {
  const list = doctorList[clinicType] || []
  return (
    <div className="space-y-3">
      <div className="mb-5">
        <h2 className="text-lg font-bold text-slate-800">Select a Doctor</h2>
        <p className="text-sm text-slate-500 mt-0.5">Available doctors for your chosen clinic.</p>
      </div>
      {list.length === 0 && (
        <p className="text-sm text-slate-400 text-center py-6">Loading doctors…</p>
      )}
      {list.map(doc => (
        <button
          key={doc.id}
          onClick={() => onChange(doc)}
          className={`w-full flex items-center gap-4 p-5 rounded-2xl border-2 text-left transition-all duration-150
            ${value?.id === doc.id
              ? "border-emerald-400 bg-emerald-50"
              : "border-slate-200 bg-white hover:border-slate-300 hover:bg-slate-50"
            }`}
        >
          <div className={`w-12 h-12 rounded-xl flex items-center justify-center shrink-0 font-bold text-sm
            ${value?.id === doc.id ? "bg-emerald-100 text-emerald-700" : "bg-slate-100 text-slate-500"}`}>
            {doc.name.split(" ").slice(1).map(n => n[0]).join("")}
          </div>
          <div className="flex-1">
            <p className="font-bold text-sm text-slate-800">{doc.name}</p>
            <p className="text-xs text-slate-500 mt-0.5">{doc.specialty}</p>
            {doc.slots != null && (
              <p className="text-[11px] text-emerald-600 font-semibold mt-1">{doc.slots} slots available today</p>
            )}
          </div>
          {value?.id === doc.id && (
            <div className="w-5 h-5 rounded-full bg-emerald-500 flex items-center justify-center shrink-0">
              <MdCheck className="text-white text-[12px]" />
            </div>
          )}
        </button>
      ))}
    </div>
  )
}

// ── Step 3 — Schedule ─────────────────────────────────────────────────────────
const StepSchedule = ({ date, time, onDateChange, onTimeChange, timeSlots, takenSlots }) => {
  const today = new Date()
  const [viewYear,  setViewYear]  = useState(today.getFullYear())
  const [viewMonth, setViewMonth] = useState(today.getMonth())

  const daysInMonth = getDaysInMonth(viewYear, viewMonth)
  const firstDay    = getFirstDay(viewYear, viewMonth)
  const cells       = Array(firstDay).fill(null).concat(
    Array.from({ length: daysInMonth }, (_, i) => i + 1)
  )

  const isToday = (d) =>
    d === today.getDate() && viewMonth === today.getMonth() && viewYear === today.getFullYear()

  const isPast = (d) => {
    const cell = new Date(viewYear, viewMonth, d)
    const t    = new Date(today.getFullYear(), today.getMonth(), today.getDate())
    return cell < t
  }

  const prevMonth = () => {
    if (viewMonth === 0) { setViewMonth(11); setViewYear(y => y - 1) }
    else setViewMonth(m => m - 1)
  }
  const nextMonth = () => {
    if (viewMonth === 11) { setViewMonth(0); setViewYear(y => y + 1) }
    else setViewMonth(m => m + 1)
  }

  return (
    <div className="space-y-5">
      <div>
        <h2 className="text-lg font-bold text-slate-800">Pick a Schedule</h2>
        <p className="text-sm text-slate-500 mt-0.5">Choose your preferred date and time.</p>
      </div>

      {/* Calendar */}
      <div className="bg-white border border-slate-200 rounded-2xl p-5">
        {/* Month nav */}
        <div className="flex items-center justify-between mb-4">
          <button onClick={prevMonth} className="w-8 h-8 flex items-center justify-center rounded-xl hover:bg-slate-100 transition-colors">
            <MdChevronLeft className="text-slate-500 text-[18px]" />
          </button>
          <p className="text-sm font-bold text-slate-800">{MONTHS[viewMonth]} {viewYear}</p>
          <button onClick={nextMonth} className="w-8 h-8 flex items-center justify-center rounded-xl hover:bg-slate-100 transition-colors">
            <MdChevronRight className="text-slate-500 text-[18px]" />
          </button>
        </div>

        {/* Day headers */}
        <div className="grid grid-cols-7 mb-2">
          {DAYS.map(d => (
            <p key={d} className="text-center text-[10px] font-bold text-slate-400 uppercase">{d}</p>
          ))}
        </div>

        {/* Cells */}
        <div className="grid grid-cols-7 gap-y-1">
          {cells.map((d, i) => {
            if (!d) return <div key={`empty-${i}`} />
            const past    = isPast(d)
            const todayD  = isToday(d)
            const selD    = date === d && viewMonth === today.getMonth()
            return (
              <button
                key={d}
                disabled={past}
                onClick={() => onDateChange(d)}
                className={`w-full aspect-square flex items-center justify-center rounded-xl text-xs font-semibold transition-all duration-150
                  ${past    ? "text-slate-300 cursor-not-allowed"                          : ""}
                  ${!past && selD  ? "bg-[#0b1a2c] text-emerald-400"                      : ""}
                  ${!past && !selD && todayD ? "bg-emerald-50 text-emerald-600 border border-emerald-300" : ""}
                  ${!past && !selD && !todayD ? "text-slate-700 hover:bg-slate-100"        : ""}
                `}
              >
                {d}
              </button>
            )
          })}
        </div>
      </div>

      {/* Time slots */}
      {date && (
        <div className="bg-white border border-slate-200 rounded-2xl p-5">
          <p className="text-sm font-bold text-slate-800 mb-3 flex items-center gap-2">
            <MdAccessTime className="text-emerald-500" /> Available Time Slots
          </p>
          {timeSlots.length === 0 ? (
            <p className="text-sm text-slate-400 text-center py-4">No slots available for this day.</p>
          ) : (
            <>
              <div className="grid grid-cols-4 gap-2">
                {timeSlots.map(slot => {
                  const taken  = takenSlots.includes(slot)
                  const active = time === slot
                  return (
                    <button
                      key={slot}
                      disabled={taken}
                      onClick={() => onTimeChange(slot)}
                      className={`px-2 py-2.5 rounded-xl text-xs font-semibold transition-all duration-150
                        ${taken  ? "bg-slate-50 text-slate-300 cursor-not-allowed line-through"   : ""}
                        ${active ? "bg-[#0b1a2c] text-emerald-400 border border-emerald-500/30"   : ""}
                        ${!taken && !active ? "bg-slate-50 text-slate-600 hover:bg-emerald-50 hover:text-emerald-700 border border-slate-200" : ""}
                      `}
                    >
                      {slot}
                    </button>
                  )
                })}
              </div>
              <p className="text-[10px] text-slate-400 mt-3 flex items-center gap-1">
                <span className="inline-block w-3 h-3 bg-slate-50 border border-slate-200 rounded-sm" /> Available
                <span className="inline-block w-3 h-3 bg-[#0b1a2c] rounded-sm ml-2" /> Selected
                <span className="inline-block w-3 h-3 bg-slate-50 border border-slate-200 rounded-sm ml-2 line-through text-slate-300" /> Taken
              </p>
            </>
          )}
        </div>
      )}
    </div>
  )
}

// ── Step 4 — Details ──────────────────────────────────────────────────────────
const StepDetails = ({ reason, notes, onReasonChange, onNotesChange }) => (
  <div className="space-y-5">
    <div>
      <h2 className="text-lg font-bold text-slate-800">Appointment Details</h2>
      <p className="text-sm text-slate-500 mt-0.5">Tell us a bit about your visit.</p>
    </div>

    {/* Reason */}
    <div>
      <label className="text-xs font-bold text-slate-600 uppercase tracking-wide mb-2 block">
        Reason for Visit
      </label>
      <div className="grid grid-cols-2 gap-2">
        {reasons.map(r => (
          <button
            key={r}
            onClick={() => onReasonChange(r)}
            className={`px-4 py-2.5 rounded-xl text-xs font-semibold text-left border-2 transition-all duration-150
              ${reason === r
                ? "border-emerald-400 bg-emerald-50 text-emerald-700"
                : "border-slate-200 bg-white text-slate-600 hover:border-slate-300 hover:bg-slate-50"
              }`}
          >
            {r}
          </button>
        ))}
      </div>
    </div>

    {/* Notes */}
    <div>
      <label className="text-xs font-bold text-slate-600 uppercase tracking-wide mb-2 block">
        Additional Notes <span className="text-slate-400 font-normal normal-case">(optional)</span>
      </label>
      <textarea
        value={notes}
        onChange={e => onNotesChange(e.target.value)}
        rows={4}
        placeholder="Describe your symptoms or concerns…"
        className="w-full text-sm text-slate-700 placeholder-slate-300 bg-white border-2 border-slate-200 rounded-2xl px-4 py-3 focus:outline-none focus:border-emerald-400 transition-colors resize-none"
      />
    </div>

    <div className="flex items-start gap-2.5 bg-sky-50 border border-sky-200 rounded-xl px-4 py-3">
      <MdInfoOutline className="text-sky-500 text-[16px] shrink-0 mt-0.5" />
      <p className="text-xs text-sky-700 leading-relaxed">
        Please arrive <strong>10–15 minutes</strong> before your scheduled time. Bring any relevant medical records or previous prescriptions.
      </p>
    </div>
  </div>
)

// ── Step 5 — Confirm ──────────────────────────────────────────────────────────
const StepConfirm = ({ form }) => {
  const clinicLabel = clinicTypes.find(c => c.id === form.clinicType)?.label
  const today = new Date()
  const dateStr = form.date
    ? `${MONTHS[today.getMonth()]} ${form.date}, ${today.getFullYear()}`
    : "—"

  const rows = [
    { label: "Clinic",   value: clinicLabel,        icon: MdMedicalServices },
    { label: "Doctor",   value: form.doctor?.name,  icon: MdPerson          },
    { label: "Date",     value: dateStr,             icon: MdCalendarToday   },
    { label: "Time",     value: form.time,           icon: MdAccessTime      },
    { label: "Reason",   value: form.reason,         icon: MdEventAvailable  },
  ]

  return (
    <div className="space-y-5">
      <div>
        <h2 className="text-lg font-bold text-slate-800">Confirm Appointment</h2>
        <p className="text-sm text-slate-500 mt-0.5">Review your details before submitting.</p>
      </div>

      <div className="bg-white border border-slate-200 rounded-2xl overflow-hidden divide-y divide-slate-100">
        {rows.map(({ label, value, icon: Icon }) => (
          <div key={label} className="flex items-center gap-4 px-5 py-4">
            <div className="w-8 h-8 rounded-xl bg-slate-50 border border-slate-100 flex items-center justify-center shrink-0">
              <Icon className="text-[15px] text-slate-400" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-[11px] text-slate-400 font-medium">{label}</p>
              <p className="text-sm font-semibold text-slate-800 mt-0.5">{value || "—"}</p>
            </div>
          </div>
        ))}
      </div>

      {form.notes && (
        <div className="bg-slate-50 border border-slate-200 rounded-2xl px-5 py-4">
          <p className="text-[11px] text-slate-400 font-medium mb-1">Notes</p>
          <p className="text-sm text-slate-700">{form.notes}</p>
        </div>
      )}

      <div className="flex items-start gap-2.5 bg-emerald-50 border border-emerald-200 rounded-xl px-4 py-3">
        <MdInfoOutline className="text-emerald-500 text-[16px] shrink-0 mt-0.5" />
        <p className="text-xs text-emerald-700 leading-relaxed">
          By confirming, you agree to the clinic's appointment policy. A confirmation will appear in <strong>My Appointments</strong>.
        </p>
      </div>
    </div>
  )
}

// ── Success ───────────────────────────────────────────────────────────────────
const SuccessScreen = ({ onReset }) => (
  <div className="flex flex-col items-center justify-center py-16 text-center">
    <div className="w-20 h-20 rounded-full bg-emerald-100 flex items-center justify-center mb-5">
      <MdCheck className="text-emerald-500 text-[40px]" />
    </div>
    <h2 className="text-xl font-bold text-slate-800 mb-2">Appointment Booked!</h2>
    <p className="text-sm text-slate-500 max-w-xs mb-8">
      Your appointment has been successfully scheduled. You can view it in <strong>My Appointments</strong>.
    </p>
    <div className="flex gap-3">
      <button
        onClick={onReset}
        className="px-5 py-2.5 text-sm font-semibold text-slate-600 border border-slate-200 rounded-xl hover:bg-slate-50 transition-colors"
      >
        Book Another
      </button>
      <NavLink to={'/patient/appointments'} className="px-5 py-2.5 text-sm font-semibold text-white bg-[#0b1a2c] rounded-xl hover:bg-[#122236] transition-colors">
        View Appointments
      </NavLink>
    </div>
  </div>
)

// ── Main Component ────────────────────────────────────────────────────────────
const BookAppointment = () => {
  const navigate = useNavigate()
  const [step, setStep] = useState(0)
  const [done, setDone] = useState(false)
  const [form, setForm] = useState({
    clinicType: "",
    doctor:     null,
    date:       null,
    time:       "",
    reason:     "",
    notes:      "",
  })

  // ── API-backed state ────────────────────────────────────────────────────────
  const [doctorList,  setDoctorList]  = useState({ medical: [], derma: [] })
  const [timeSlots,   setTimeSlots]   = useState([])
  const [takenSlots,  setTakenSlots]  = useState([])

  // Fetch doctors on mount
  useEffect(() => {
    getDoctors()
      .then(data => {
        const medical = data.filter(d => d.specialty !== 'Dermatologist')
        const derma   = data.filter(d => d.specialty === 'Dermatologist')
        setDoctorList({ medical, derma })
      })
      .catch(() => {})
  }, [])

  // Fetch time slots whenever doctor or date changes
  useEffect(() => {
    if (!form.doctor || !form.date) return
    setTimeSlots([])
    setTakenSlots([])
    getDoctorSchedule(form.doctor.id)
      .then(schedules => {
        const dayName = new Date(form.date).toLocaleDateString('en-US', { weekday: 'long' })
        const sched   = schedules.find(s => s.day_of_week === dayName && s.is_active)
        if (!sched) { setTimeSlots([]); return }
        const slots = []
        let [h, m]       = sched.start_time.split(':').map(Number)
        const [eh, em]   = sched.end_time.split(':').map(Number)
        while (h * 60 + m < eh * 60 + em) {
          const period   = h >= 12 ? 'PM' : 'AM'
          const displayH = h > 12 ? h - 12 : h === 0 ? 12 : h
          slots.push(`${displayH}:${String(m).padStart(2, '0')} ${period}`)
          m += sched.slot_duration_mins
          if (m >= 60) { h += Math.floor(m / 60); m = m % 60 }
        }
        setTimeSlots(slots)
        setTakenSlots([]) // optionally fetch booked slots for this date
      })
      .catch(() => {})
  }, [form.doctor, form.date])

  const set = (key) => (val) => setForm(f => ({ ...f, [key]: val }))

  const canNext = () => {
    if (step === 0) return !!form.clinicType
    if (step === 1) return !!form.doctor
    if (step === 2) return !!form.date && !!form.time
    if (step === 3) return !!form.reason
    return true
  }

  const handleNext = () => {
    if (step < 4) setStep(s => s + 1)
    else handleConfirm()
  }

  const handleBack = () => setStep(s => s - 1)

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
    setStep(0)
    setDone(false)
    setTimeSlots([])
    setTakenSlots([])
    setForm({ clinicType: "", doctor: null, date: null, time: "", reason: "", notes: "" })
  }

  return (
    <div className="max-w-2xl">
      {/* Page title */}
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-slate-800">Book an Appointment</h1>
        <p className="text-sm text-slate-500 mt-0.5">Follow the steps to schedule your clinic visit.</p>
      </div>

      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
        <div className="px-8 pt-8 pb-2">
          {!done && <StepBar current={step} />}
        </div>

        <div className="px-8 pb-6">
          {done ? (
            <SuccessScreen onReset={handleReset} />
          ) : (
            <>
              {step === 0 && <StepClinicType value={form.clinicType} onChange={set("clinicType")} />}
              {step === 1 && (
                <StepDoctor
                  clinicType={form.clinicType}
                  value={form.doctor}
                  onChange={set("doctor")}
                  doctorList={doctorList}
                />
              )}
              {step === 2 && (
                <StepSchedule
                  date={form.date} time={form.time}
                  onDateChange={set("date")} onTimeChange={set("time")}
                  timeSlots={timeSlots} takenSlots={takenSlots}
                />
              )}
              {step === 3 && (
                <StepDetails
                  reason={form.reason} notes={form.notes}
                  onReasonChange={set("reason")} onNotesChange={set("notes")}
                />
              )}
              {step === 4 && <StepConfirm form={form} />}

              {/* Footer nav */}
              <div className="flex items-center justify-between mt-8 pt-5 border-t border-slate-100">
                <button
                  onClick={handleBack}
                  disabled={step === 0}
                  className="flex items-center gap-1.5 px-4 py-2.5 text-sm font-semibold text-slate-500 border border-slate-200 rounded-xl hover:bg-slate-50 disabled:opacity-30 disabled:cursor-not-allowed transition-all"
                >
                  <MdChevronLeft className="text-[16px]" /> Back
                </button>

                <p className="text-xs text-slate-400 font-medium">
                  Step {step + 1} of {STEPS.length}
                </p>

                <button
                  onClick={handleNext}
                  disabled={!canNext()}
                  className="flex items-center gap-1.5 px-5 py-2.5 text-sm font-semibold text-white bg-[#0b1a2c] rounded-xl hover:bg-[#122236] disabled:opacity-30 disabled:cursor-not-allowed transition-all"
                >
                  {step === 4 ? "Confirm Booking" : "Next"}
                  {step < 4 && <MdChevronRight className="text-[16px]" />}
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