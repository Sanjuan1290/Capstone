import { useState } from "react"
import {
  MdCalendarToday, MdAccessTime, MdFace, MdMedicalServices,
  MdChevronRight, MdPerson, MdNotes, MdLocalHospital,
  MdArrowBack, MdCheck, MdHistory
} from "react-icons/md"
import { NavLink } from "react-router-dom"

// ── Mock Data ─────────────────────────────────────────────────────────────────
const appointments = [
  {
    id: "APT-001", patient: "Maria Cruz",      patientId: "PAT-001",
    type: "derma",  time: "9:00 AM",  duration: "30 min",
    reason: "Acne Treatment Follow-up",     status: "completed",
    notes: "Bring previous prescriptions.",
    lastVisit: "Dec 10, 2025", lastDiagnosis: "Acne vulgaris with hyperpigmentation.",
  },
  {
    id: "APT-002", patient: "Ana Villanueva",  patientId: "PAT-003",
    type: "derma",  time: "9:30 AM",  duration: "30 min",
    reason: "Skin Brightening Consultation",  status: "completed",
    notes: "",
    lastVisit: "—", lastDiagnosis: "—",
  },
  {
    id: "APT-003", patient: "Rosa Reyes",      patientId: "PAT-005",
    type: "derma",  time: "10:00 AM", duration: "30 min",
    reason: "Initial Skin Assessment",        status: "in-progress",
    notes: "First visit.",
    lastVisit: "—", lastDiagnosis: "—",
  },
  {
    id: "APT-004", patient: "Grace Tan",       patientId: "PAT-007",
    type: "derma",  time: "10:30 AM", duration: "45 min",
    reason: "Follow-up Visit",               status: "pending",
    notes: "Bring maintenance medicine.",
    lastVisit: "Jan 5, 2026", lastDiagnosis: "Melasma, mild grade.",
  },
  {
    id: "APT-005", patient: "Linda Torres",    patientId: "PAT-008",
    type: "derma",  time: "11:00 AM", duration: "30 min",
    reason: "Cosmetic Consultation",          status: "pending",
    notes: "",
    lastVisit: "—", lastDiagnosis: "—",
  },
]

const STATUS_CONFIG = {
  "completed":    { label: "Done",        badge: "bg-slate-100  text-slate-500  border-slate-200",  row: "border-l-slate-300"   },
  "in-progress":  { label: "In Progress", badge: "bg-violet-50  text-violet-700 border-violet-200", row: "border-l-violet-400"  },
  "pending":      { label: "Waiting",     badge: "bg-amber-50   text-amber-700  border-amber-200",  row: "border-l-amber-300"   },
}

// ── Detail Panel ──────────────────────────────────────────────────────────────
const DetailPanel = ({ appt, onClose }) => {
  if (!appt) return null
  const cfg  = STATUS_CONFIG[appt.status]
  const Icon = appt.type === "derma" ? MdFace : MdMedicalServices

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="flex items-center gap-3 px-6 py-5 border-b border-slate-100 shrink-0">
        <button onClick={onClose}
          className="w-8 h-8 flex items-center justify-center rounded-xl hover:bg-slate-100 text-slate-400 transition-colors lg:hidden">
          <MdArrowBack className="text-[18px]" />
        </button>
        <div className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0
          ${appt.type === "derma" ? "bg-emerald-50" : "bg-slate-100"}`}>
          <Icon className={`text-[18px] ${appt.type === "derma" ? "text-emerald-600" : "text-slate-500"}`} />
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-bold text-slate-800 truncate">{appt.patient}</p>
          <p className="text-xs text-slate-500 font-mono">{appt.patientId} · {appt.id}</p>
        </div>
        <span className={`text-[11px] font-bold border px-2.5 py-0.5 rounded-full shrink-0 ${cfg.badge}`}>
          {cfg.label}
        </span>
      </div>

      <div className="flex-1 overflow-y-auto px-6 py-5 space-y-4">
        {/* Schedule */}
        <div className="bg-slate-50 rounded-2xl p-4 space-y-3">
          <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Schedule</p>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <p className="text-[11px] text-slate-400 flex items-center gap-1 mb-0.5"><MdAccessTime className="text-[11px]" /> Time</p>
              <p className="text-sm font-semibold text-slate-800">{appt.time}</p>
            </div>
            <div>
              <p className="text-[11px] text-slate-400 flex items-center gap-1 mb-0.5"><MdCalendarToday className="text-[11px]" /> Duration</p>
              <p className="text-sm font-semibold text-slate-800">{appt.duration}</p>
            </div>
          </div>
        </div>

        {/* Visit info */}
        <div className="bg-slate-50 rounded-2xl p-4 space-y-3">
          <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Visit Info</p>
          <div>
            <p className="text-[11px] text-slate-400 flex items-center gap-1 mb-0.5"><MdPerson className="text-[11px]" /> Reason</p>
            <p className="text-sm font-semibold text-slate-800">{appt.reason}</p>
          </div>
          {appt.notes && (
            <div>
              <p className="text-[11px] text-slate-400 flex items-center gap-1 mb-0.5"><MdNotes className="text-[11px]" /> Pre-visit Notes</p>
              <p className="text-sm text-slate-700 leading-relaxed">{appt.notes}</p>
            </div>
          )}
        </div>

        {/* Last visit */}
        {appt.lastVisit !== "—" && (
          <div className="bg-slate-50 rounded-2xl p-4 space-y-3">
            <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Last Visit</p>
            <div>
              <p className="text-[11px] text-slate-400 flex items-center gap-1 mb-0.5"><MdCalendarToday className="text-[11px]" /> Date</p>
              <p className="text-sm font-semibold text-slate-800">{appt.lastVisit}</p>
            </div>
            <div>
              <p className="text-[11px] text-slate-400 mb-0.5">Previous Diagnosis</p>
              <p className="text-sm text-slate-700 leading-relaxed">{appt.lastDiagnosis}</p>
            </div>
          </div>
        )}
      </div>

      {/* Actions */}
      <div className="px-6 pb-6 pt-4 border-t border-slate-100 shrink-0 space-y-2">
        {appt.status === "in-progress" && (
          <NavLink to="/doctor/consultation"
            className="w-full flex items-center justify-center gap-2 py-2.5 text-xs font-bold
              text-white bg-violet-600 hover:bg-violet-700 rounded-xl transition-colors">
            <MdMedicalServices className="text-[14px]" /> Start Consultation
          </NavLink>
        )}
        {appt.status === "pending" && (
          <button className="w-full flex items-center justify-center gap-2 py-2.5 text-xs font-bold
            text-white bg-[#0b1a2c] hover:bg-[#122236] rounded-xl transition-colors">
            <MdCheck className="text-[14px]" /> Mark as In Progress
          </button>
        )}
        {appt.status === "completed" && (
          <div className="flex items-center justify-center gap-2 py-2.5 text-xs font-semibold text-slate-400">
            <MdCheck className="text-[14px] text-emerald-500" /> Consultation completed
          </div>
        )}
      </div>
    </div>
  )
}

// ── Row ───────────────────────────────────────────────────────────────────────
const AppointmentRow = ({ appt, isSelected, onSelect }) => {
  const cfg  = STATUS_CONFIG[appt.status]
  const Icon = appt.type === "derma" ? MdFace : MdMedicalServices
  return (
    <button onClick={() => onSelect(appt)}
      className={`w-full flex items-center gap-4 px-5 py-4 border-l-[3px] text-left transition-all duration-150
        ${isSelected ? `${cfg.row} bg-slate-50` : "border-l-transparent hover:bg-slate-50/70"}`}>
      <div className={`w-9 h-9 rounded-xl flex items-center justify-center shrink-0
        ${appt.type === "derma" ? "bg-emerald-50" : "bg-slate-100"}`}>
        <Icon className={`text-[16px] ${appt.type === "derma" ? "text-emerald-600" : "text-slate-500"}`} />
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 mb-0.5">
          <p className="text-sm font-bold text-slate-800 truncate">{appt.patient}</p>
          <span className={`text-[10px] font-bold border px-2 py-0.5 rounded-full whitespace-nowrap ${cfg.badge}`}>
            {cfg.label}
          </span>
        </div>
        <p className="text-xs text-slate-500 truncate">{appt.reason}</p>
        <span className="text-[11px] text-slate-400 font-medium flex items-center gap-1 mt-1">
          <MdAccessTime className="text-[11px]" /> {appt.time}
        </span>
      </div>
      <MdChevronRight className={`text-[16px] transition-colors shrink-0 ${isSelected ? "text-slate-500" : "text-slate-300"}`} />
    </button>
  )
}

// ── Main ──────────────────────────────────────────────────────────────────────
const Doctor_DailyAppointments = () => {
  const [selected, setSelected] = useState(appointments[2])

  const done       = appointments.filter(a => a.status === "completed").length
  const inProgress = appointments.filter(a => a.status === "in-progress").length

  return (
    <div className="max-w-5xl space-y-5">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-800">Daily Appointments</h1>
          <p className="text-sm text-slate-500 mt-0.5">
            {new Date().toLocaleDateString("en-PH", { weekday: "long", month: "long", day: "numeric", year: "numeric" })}
          </p>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <div className="text-right">
            <p className="text-xs text-slate-500">{done}/{appointments.length} done</p>
            {inProgress > 0 && <p className="text-[11px] text-violet-600 font-semibold">{inProgress} in progress</p>}
          </div>
        </div>
      </div>

      <div className="bg-white border border-slate-200 rounded-2xl overflow-hidden flex" style={{ minHeight: "580px" }}>
        {/* List */}
        <div className="flex flex-col border-r border-slate-100 w-full lg:w-[380px] shrink-0">
          <div className="px-4 py-3 border-b border-slate-100 bg-slate-50">
            <p className="text-[11px] font-bold text-slate-400 uppercase tracking-widest">
              {appointments.length} patients today
            </p>
          </div>
          <div className="flex-1 overflow-y-auto divide-y divide-slate-100">
            {appointments.map(appt => (
              <AppointmentRow key={appt.id} appt={appt}
                isSelected={selected?.id === appt.id} onSelect={setSelected} />
            ))}
          </div>
        </div>

        {/* Detail */}
        <div className="hidden lg:flex flex-col flex-1 min-w-0">
          {selected ? (
            <DetailPanel appt={selected} onClose={() => setSelected(null)} />
          ) : (
            <div className="flex flex-col items-center justify-center flex-1 text-center px-8">
              <div className="w-14 h-14 rounded-2xl bg-slate-100 flex items-center justify-center mb-3">
                <MdCalendarToday className="text-[24px] text-slate-300" />
              </div>
              <p className="text-sm font-semibold text-slate-500">Select an appointment</p>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

export default Doctor_DailyAppointments