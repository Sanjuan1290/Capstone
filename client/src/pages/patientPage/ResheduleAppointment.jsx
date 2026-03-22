import { useState } from "react"
import {
  MdChevronLeft, MdChevronRight, MdCalendarToday,
  MdAccessTime, MdPerson, MdFace, MdMedicalServices,
  MdCheck, MdArrowBack, MdInfoOutline, MdSwapHoriz
} from "react-icons/md"

// ── Mock current appointment ──────────────────────────────────────────────────
const currentAppointment = {
  id: "APT-002",
  type: "medical",
  clinic: "General Medicine",
  doctor: "Dr. Jose Reyes",
  specialty: "General Practitioner",
  date: "April 2, 2026",
  time: "2:30 PM",
  reason: "Annual Check-up",
}

// ── Time slots ────────────────────────────────────────────────────────────────
const timeSlots = [
  "8:00 AM","8:30 AM","9:00 AM","9:30 AM",
  "10:00 AM","10:30 AM","11:00 AM","11:30 AM",
  "1:00 PM","1:30 PM","2:00 PM","2:30 PM",
  "3:00 PM","3:30 PM","4:00 PM","4:30 PM",
]
const takenSlots = ["9:00 AM","10:30 AM","2:30 PM","3:00 PM"]

// ── Calendar helpers ──────────────────────────────────────────────────────────
const MONTHS = ["January","February","March","April","May","June",
  "July","August","September","October","November","December"]
const DAYS   = ["Sun","Mon","Tue","Wed","Thu","Fri","Sat"]

function getDaysInMonth(y, m) { return new Date(y, m + 1, 0).getDate() }
function getFirstDay(y, m)    { return new Date(y, m, 1).getDay() }

// ── Steps ─────────────────────────────────────────────────────────────────────
const STEPS = ["New Schedule", "Reason", "Confirm"]

const StepBar = ({ current }) => (
  <div className="flex items-center gap-0">
    {STEPS.map((label, i) => {
      const done   = i < current
      const active = i === current
      const last   = i === STEPS.length - 1
      return (
        <div key={label} className="flex items-center flex-1 last:flex-none">
          <div className="flex flex-col items-center gap-1.5">
            <div className={`w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold border-2 transition-all duration-300
              ${done   ? "bg-emerald-500 border-emerald-500 text-white"         : ""}
              ${active ? "bg-[#0b1a2c] border-emerald-400 text-emerald-400"     : ""}
              ${!done && !active ? "bg-white border-slate-200 text-slate-400"   : ""}
            `}>
              {done ? <MdCheck className="text-[14px]" /> : i + 1}
            </div>
            <span className={`text-[10px] font-semibold whitespace-nowrap hidden sm:block
              ${active ? "text-slate-700" : done ? "text-emerald-600" : "text-slate-400"}
            `}>{label}</span>
          </div>
          {!last && (
            <div className={`flex-1 h-0.5 mb-3 sm:mb-5 mx-1 rounded transition-colors duration-300
              ${done ? "bg-emerald-400" : "bg-slate-200"}
            `} />
          )}
        </div>
      )
    })}
  </div>
)

// ── Current Appointment Card ──────────────────────────────────────────────────
const CurrentCard = ({ appt }) => {
  const Icon = appt.type === "derma" ? MdFace : MdMedicalServices
  return (
    <div className="bg-slate-50 border border-slate-200 rounded-2xl p-4">
      <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-3">Current Appointment</p>
      <div className="flex items-center gap-3">
        <div className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0
          ${appt.type === "derma" ? "bg-emerald-50" : "bg-slate-100"}`}>
          <Icon className={`text-[18px] ${appt.type === "derma" ? "text-emerald-600" : "text-slate-500"}`} />
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-bold text-slate-800">{appt.doctor}</p>
          <p className="text-xs text-slate-500">{appt.clinic}</p>
        </div>
        <span className="text-[10px] font-mono font-semibold text-slate-400 bg-white border border-slate-200 px-2 py-0.5 rounded-md shrink-0">
          {appt.id}
        </span>
      </div>
      <div className="flex flex-wrap gap-3 mt-3 text-xs text-slate-500 font-medium">
        <span className="flex items-center gap-1.5">
          <MdCalendarToday className="text-[12px] text-slate-400" /> {appt.date}
        </span>
        <span className="flex items-center gap-1.5">
          <MdAccessTime className="text-[12px] text-slate-400" /> {appt.time}
        </span>
        <span className="flex items-center gap-1.5">
          <MdPerson className="text-[12px] text-slate-400" /> {appt.reason}
        </span>
      </div>
    </div>
  )
}

// ── Step 1 — Pick new date & time ─────────────────────────────────────────────
const StepSchedule = ({ date, setDate, time, setTime }) => {
  const today = new Date()
  const [viewYear,  setViewYear]  = useState(today.getFullYear())
  const [viewMonth, setViewMonth] = useState(today.getMonth())

  const daysInMonth = getDaysInMonth(viewYear, viewMonth)
  const firstDay    = getFirstDay(viewYear, viewMonth)
  const cells       = Array(firstDay).fill(null)
    .concat(Array.from({ length: daysInMonth }, (_, i) => i + 1))

  const isPast = (d) =>
    new Date(viewYear, viewMonth, d) < new Date(today.getFullYear(), today.getMonth(), today.getDate())

  const isOriginal = (d) =>
    d === 2 && viewMonth === 3 && viewYear === 2026

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
        <h2 className="text-base sm:text-lg font-bold text-slate-800">Select New Schedule</h2>
        <p className="text-sm text-slate-500 mt-0.5">Choose a new date and time for your appointment.</p>
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
            const past    = isPast(d)
            const orig    = isOriginal(d)
            const selD    = date === d && viewMonth === today.getMonth() + (viewYear > today.getFullYear() ? 12 : 0)
            const isSel   = date?.day === d && date?.month === viewMonth && date?.year === viewYear
            return (
              <button
                key={d}
                disabled={past}
                onClick={() => setDate({ day: d, month: viewMonth, year: viewYear })}
                className={`w-full aspect-square flex items-center justify-center rounded-xl text-xs font-semibold transition-all duration-150
                  ${past ? "text-slate-300 cursor-not-allowed" : ""}
                  ${!past && isSel  ? "bg-[#0b1a2c] text-emerald-400" : ""}
                  ${!past && !isSel && orig ? "bg-amber-50 text-amber-600 border border-amber-300" : ""}
                  ${!past && !isSel && !orig ? "text-slate-700 hover:bg-slate-100" : ""}
                `}
              >
                {d}
              </button>
            )
          })}
        </div>

        <div className="flex items-center gap-4 mt-3 pt-3 border-t border-slate-100">
          <span className="flex items-center gap-1.5 text-[10px] text-slate-400">
            <span className="w-3 h-3 rounded-sm bg-[#0b1a2c] inline-block" /> Selected
          </span>
          <span className="flex items-center gap-1.5 text-[10px] text-slate-400">
            <span className="w-3 h-3 rounded-sm bg-amber-50 border border-amber-300 inline-block" /> Original date
          </span>
        </div>
      </div>

      {/* Time slots */}
      {date && (
        <div className="bg-white border border-slate-200 rounded-2xl p-4 sm:p-5">
          <p className="text-sm font-bold text-slate-800 mb-3 flex items-center gap-2">
            <MdAccessTime className="text-emerald-500 text-[15px]" /> Available Time Slots
          </p>
          <div className="grid grid-cols-3 sm:grid-cols-4 gap-2">
            {timeSlots.map(slot => {
              const taken  = takenSlots.includes(slot)
              const active = time === slot
              return (
                <button
                  key={slot}
                  disabled={taken}
                  onClick={() => setTime(slot)}
                  className={`px-2 py-2.5 rounded-xl text-xs font-semibold transition-all duration-150
                    ${taken  ? "bg-slate-50 text-slate-300 cursor-not-allowed line-through border border-slate-100" : ""}
                    ${active ? "bg-[#0b1a2c] text-emerald-400 border border-emerald-500/30" : ""}
                    ${!taken && !active ? "bg-slate-50 text-slate-600 hover:bg-slate-100 border border-slate-200" : ""}
                  `}
                >
                  {slot}
                </button>
              )
            })}
          </div>
        </div>
      )}
    </div>
  )
}

// ── Step 2 — Reason for reschedule ────────────────────────────────────────────
const rescheduleReasons = [
  "Schedule conflict",
  "Personal emergency",
  "Doctor unavailable",
  "Health improvement",
  "Transportation issue",
  "Other",
]

const StepReason = ({ reason, setReason, notes, setNotes }) => (
  <div className="space-y-5">
    <div>
      <h2 className="text-base sm:text-lg font-bold text-slate-800">Reason for Rescheduling</h2>
      <p className="text-sm text-slate-500 mt-0.5">Let us know why you need to move this appointment.</p>
    </div>

    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
      {rescheduleReasons.map(r => (
        <button
          key={r}
          onClick={() => setReason(r)}
          className={`px-4 py-3 rounded-xl text-sm font-semibold text-left border-2 transition-all duration-150
            ${reason === r
              ? "border-emerald-400 bg-emerald-50 text-emerald-700"
              : "border-slate-200 bg-white text-slate-600 hover:border-slate-300 hover:bg-slate-50"
            }`}
        >
          {r}
        </button>
      ))}
    </div>

    <div>
      <label className="text-xs font-bold text-slate-600 uppercase tracking-wide mb-2 block">
        Additional Notes <span className="text-slate-400 font-normal normal-case">(optional)</span>
      </label>
      <textarea
        value={notes}
        onChange={e => setNotes(e.target.value)}
        rows={3}
        placeholder="Any additional context for the clinic…"
        className="w-full text-sm text-slate-700 placeholder-slate-300 bg-white border-2 border-slate-200 rounded-2xl px-4 py-3 focus:outline-none focus:border-emerald-400 transition-colors resize-none"
      />
    </div>

    <div className="flex items-start gap-2.5 bg-amber-50 border border-amber-200 rounded-xl px-4 py-3">
      <MdInfoOutline className="text-amber-500 text-[16px] shrink-0 mt-0.5" />
      <p className="text-xs text-amber-700 leading-relaxed">
        Rescheduling within <strong>24 hours</strong> of your original appointment may require clinic approval. You will be notified once confirmed.
      </p>
    </div>
  </div>
)

// ── Step 3 — Confirm ──────────────────────────────────────────────────────────
const StepConfirm = ({ current, newDate, newTime, reason }) => {
  const newDateStr = newDate
    ? `${MONTHS[newDate.month]} ${newDate.day}, ${newDate.year}`
    : "—"

  return (
    <div className="space-y-5">
      <div>
        <h2 className="text-base sm:text-lg font-bold text-slate-800">Confirm Reschedule</h2>
        <p className="text-sm text-slate-500 mt-0.5">Review the changes before submitting.</p>
      </div>

      {/* Before / After */}
      <div className="bg-white border border-slate-200 rounded-2xl overflow-hidden">
        <div className="grid grid-cols-1 sm:grid-cols-[1fr_auto_1fr]">
          {/* Old */}
          <div className="p-5 space-y-1">
            <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-3">Current</p>
            <p className="text-sm font-bold text-slate-800">{current.date}</p>
            <p className="text-sm font-semibold text-slate-600">{current.time}</p>
          </div>

          {/* Arrow */}
          <div className="hidden sm:flex items-center justify-center px-2">
            <div className="w-8 h-8 rounded-full bg-slate-100 flex items-center justify-center">
              <MdSwapHoriz className="text-slate-400 text-[18px]" />
            </div>
          </div>
          <div className="sm:hidden border-t border-slate-100 flex items-center justify-center py-2">
            <MdSwapHoriz className="text-slate-400 text-[18px] rotate-90" />
          </div>

          {/* New */}
          <div className="p-5 space-y-1 bg-emerald-50/50">
            <p className="text-[10px] font-bold text-emerald-600 uppercase tracking-widest mb-3">New</p>
            <p className="text-sm font-bold text-slate-800">{newDateStr}</p>
            <p className="text-sm font-semibold text-slate-600">{newTime || "—"}</p>
          </div>
        </div>
      </div>

      {/* Summary */}
      <div className="bg-white border border-slate-200 rounded-2xl divide-y divide-slate-100">
        {[
          { label: "Doctor",  value: current.doctor,  icon: MdPerson          },
          { label: "Clinic",  value: current.clinic,  icon: MdMedicalServices },
          { label: "Reason",  value: current.reason,  icon: MdCalendarToday   },
          { label: "Why rescheduling", value: reason, icon: MdInfoOutline     },
        ].map(({ label, value, icon: Icon }) => (
          <div key={label} className="flex items-center gap-4 px-5 py-4">
            <div className="w-8 h-8 rounded-xl bg-slate-50 border border-slate-100 flex items-center justify-center shrink-0">
              <Icon className="text-[14px] text-slate-400" />
            </div>
            <div>
              <p className="text-[10px] text-slate-400 font-medium">{label}</p>
              <p className="text-sm font-semibold text-slate-800 mt-0.5">{value || "—"}</p>
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
const SuccessScreen = () => (
  <div className="flex flex-col items-center justify-center py-16 text-center px-4">
    <div className="w-20 h-20 rounded-full bg-emerald-100 flex items-center justify-center mb-5">
      <MdCheck className="text-emerald-500 text-[40px]" />
    </div>
    <h2 className="text-xl font-bold text-slate-800 mb-2">Appointment Rescheduled!</h2>
    <p className="text-sm text-slate-500 max-w-xs mb-8">
      Your appointment has been updated. Check <strong>My Appointments</strong> to see the new schedule.
    </p>
    <div className="flex flex-col sm:flex-row gap-3 w-full max-w-xs">
      <a
        href="/patient/appointments"
        className="flex-1 flex items-center justify-center gap-1.5 py-2.5 text-sm font-semibold text-white bg-[#0b1a2c] rounded-xl hover:bg-[#122236] transition-colors"
      >
        View Appointments
      </a>
      <a
        href="/patient"
        className="flex-1 flex items-center justify-center gap-1.5 py-2.5 text-sm font-semibold text-slate-600 border border-slate-200 rounded-xl hover:bg-slate-50 transition-colors"
      >
        Go to Dashboard
      </a>
    </div>
  </div>
)

// ── Main ──────────────────────────────────────────────────────────────────────
const RescheduleAppointment = () => {
  const [step,    setStep]    = useState(0)
  const [done,    setDone]    = useState(false)
  const [newDate, setNewDate] = useState(null)
  const [newTime, setNewTime] = useState("")
  const [reason,  setReason]  = useState("")
  const [notes,   setNotes]   = useState("")

  const canNext = () => {
    if (step === 0) return !!newDate && !!newTime
    if (step === 1) return !!reason
    return true
  }

  const handleNext = () => {
    if (step < STEPS.length - 1) setStep(s => s + 1)
    else setDone(true)
  }

  return (
    <div className="max-w-2xl w-full mx-auto space-y-5 px-0 sm:px-0">

      {/* Page header */}
      <div className="flex items-center gap-3">
        <a
          href="/patient/appointments"
          className="w-9 h-9 flex items-center justify-center rounded-xl border border-slate-200 hover:bg-slate-100 text-slate-500 transition-colors shrink-0"
        >
          <MdArrowBack className="text-[18px]" />
        </a>
        <div>
          <h1 className="text-xl sm:text-2xl font-bold text-slate-800">Reschedule Appointment</h1>
          <p className="text-xs sm:text-sm text-slate-500 mt-0.5">Move your appointment to a new date and time.</p>
        </div>
      </div>

      {/* Current appointment info */}
      <CurrentCard appt={currentAppointment} />

      {/* Wizard card */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
        <div className="px-5 sm:px-8 pt-6 sm:pt-8 pb-4">
          {!done && <StepBar current={step} />}
        </div>

        <div className="px-5 sm:px-8 pb-6 sm:pb-8">
          {done ? (
            <SuccessScreen />
          ) : (
            <>
              {step === 0 && (
                <StepSchedule
                  date={newDate}    setDate={setNewDate}
                  time={newTime}    setTime={setNewTime}
                />
              )}
              {step === 1 && (
                <StepReason
                  reason={reason}  setReason={setReason}
                  notes={notes}    setNotes={setNotes}
                />
              )}
              {step === 2 && (
                <StepConfirm
                  current={currentAppointment}
                  newDate={newDate}
                  newTime={newTime}
                  reason={reason}
                />
              )}

              {/* Footer nav */}
              <div className="flex items-center justify-between mt-8 pt-5 border-t border-slate-100">
                <button
                  onClick={() => setStep(s => s - 1)}
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
                  {step === STEPS.length - 1 ? "Confirm Reschedule" : "Next"}
                  {step < STEPS.length - 1 && <MdChevronRight className="text-[16px]" />}
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