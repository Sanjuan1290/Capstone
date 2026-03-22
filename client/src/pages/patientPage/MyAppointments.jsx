import { useState } from "react"
import {
  MdCalendarToday, MdAccessTime, MdFace,
  MdMedicalServices, MdSearch, MdChevronRight,
  MdClose, MdEventBusy, MdAdd,
  MdCancel, MdRefresh, MdPerson, MdNotes,
  MdLocalHospital, MdArrowBack
} from "react-icons/md"
import { NavLink } from "react-router-dom"

// ── Mock Data ─────────────────────────────────────────────────────────────────
const appointments = [
  {
    id: "APT-001",
    type: "derma",
    clinic: "Dermatology",
    doctor: "Dr. Maria Santos",
    specialty: "Dermatologist",
    date: "March 25, 2026",
    rawDate: new Date(2026, 2, 25),
    time: "10:00 AM",
    reason: "Acne Treatment Follow-up",
    status: "confirmed",
    notes: "Please bring previous prescriptions and avoid applying any skincare products 2 hours before the appointment.",
    clinic_address: "Carait Medical Clinic, 2F Dela Rosa Bldg., Quezon City",
    duration: "30 minutes",
  },
  {
    id: "APT-002",
    type: "medical",
    clinic: "General Medicine",
    doctor: "Dr. Jose Reyes",
    specialty: "General Practitioner",
    date: "April 2, 2026",
    rawDate: new Date(2026, 3, 2),
    time: "2:30 PM",
    reason: "Annual Check-up",
    status: "pending",
    notes: "Fasting required 8 hours prior. Bring any maintenance medicine.",
    clinic_address: "Carait Medical Clinic, 2F Dela Rosa Bldg., Quezon City",
    duration: "45 minutes",
  },
  {
    id: "APT-003",
    type: "derma",
    clinic: "Dermatology",
    doctor: "Dr. Maria Santos",
    specialty: "Dermatologist",
    date: "February 14, 2026",
    rawDate: new Date(2026, 1, 14),
    time: "9:00 AM",
    reason: "Skin Assessment",
    status: "completed",
    notes: "Routine follow-up after initial skin treatment.",
    clinic_address: "Carait Medical Clinic, 2F Dela Rosa Bldg., Quezon City",
    duration: "20 minutes",
    diagnosis: "Mild acne vulgaris. Prescribed topical retinoid.",
    prescription: "Tretinoin 0.025% cream — apply nightly",
  },
  {
    id: "APT-004",
    type: "medical",
    clinic: "General Medicine",
    doctor: "Dr. Ana Villanueva",
    specialty: "Internal Medicine",
    date: "January 28, 2026",
    rawDate: new Date(2026, 0, 28),
    time: "11:00 AM",
    reason: "Follow-up Visit",
    status: "completed",
    notes: "Follow-up for elevated blood pressure noted last visit.",
    clinic_address: "Carait Medical Clinic, 2F Dela Rosa Bldg., Quezon City",
    duration: "30 minutes",
    diagnosis: "Hypertension Stage 1. Advised lifestyle modifications.",
    prescription: "Amlodipine 5mg — once daily",
  },
  {
    id: "APT-005",
    type: "derma",
    clinic: "Dermatology",
    doctor: "Dr. Carlo Lim",
    specialty: "Cosmetic Dermatology",
    date: "January 10, 2026",
    rawDate: new Date(2026, 0, 10),
    time: "3:00 PM",
    reason: "Cosmetic Consultation",
    status: "cancelled",
    notes: "Patient requested cancellation due to scheduling conflict.",
    clinic_address: "Carait Dermatologic Clinic, GF Dela Rosa Bldg., Quezon City",
    duration: "30 minutes",
    cancelReason: "Patient-requested cancellation",
  },
]

// ── Config ────────────────────────────────────────────────────────────────────
const STATUS_CONFIG = {
  confirmed: {
    label: "Confirmed",
    badge: "bg-emerald-50 text-emerald-700 border-emerald-200",
    row:   "border-l-emerald-400",
  },
  pending: {
    label: "Pending",
    badge: "bg-amber-50 text-amber-700 border-amber-200",
    row:   "border-l-amber-400",
  },
  completed: {
    label: "Completed",
    badge: "bg-slate-100 text-slate-500 border-slate-200",
    row:   "border-l-slate-300",
  },
  cancelled: {
    label: "Cancelled",
    badge: "bg-red-50 text-red-500 border-red-200",
    row:   "border-l-red-300",
  },
}

const TABS = [
  { key: "all",       label: "All"       },
  { key: "confirmed", label: "Confirmed" },
  { key: "pending",   label: "Pending"   },
  { key: "completed", label: "Completed" },
  { key: "cancelled", label: "Cancelled" },
]

// ── Detail Panel ──────────────────────────────────────────────────────────────
const DetailPanel = ({ appt, onClose }) => {
  if (!appt) return null
  const cfg     = STATUS_CONFIG[appt.status]
  const Icon    = appt.type === "derma" ? MdFace : MdMedicalServices
  const isActive = appt.status === "confirmed" || appt.status === "pending"

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="flex items-center gap-3 px-6 py-5 border-b border-slate-100 shrink-0">
        <button
          onClick={onClose}
          className="w-8 h-8 flex items-center justify-center rounded-xl hover:bg-slate-100 text-slate-400 transition-colors shrink-0 lg:hidden"
        >
          <MdArrowBack className="text-[18px]" />
        </button>
        <div className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0
          ${appt.type === "derma" ? "bg-emerald-50" : "bg-slate-100"}`}>
          <Icon className={`text-[18px] ${appt.type === "derma" ? "text-emerald-600" : "text-slate-500"}`} />
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-bold text-slate-800 truncate">{appt.doctor}</p>
          <p className="text-xs text-slate-500">{appt.clinic}</p>
        </div>
        <span className={`text-[11px] font-bold border px-2.5 py-0.5 rounded-full shrink-0 ${cfg.badge}`}>
          {cfg.label}
        </span>
      </div>

      {/* Scrollable body */}
      <div className="flex-1 overflow-y-auto px-6 py-5 space-y-5">

        {/* APT ID */}
        <div className="flex items-center">
          <span className="text-[11px] font-mono font-semibold text-slate-400 bg-slate-100 px-2 py-0.5 rounded-md">
            {appt.id}
          </span>
        </div>

        {/* Schedule block */}
        <div className="bg-slate-50 rounded-2xl p-4 space-y-3">
          <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Schedule</p>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <p className="text-[11px] text-slate-400 flex items-center gap-1 mb-0.5">
                <MdCalendarToday className="text-[11px]" /> Date
              </p>
              <p className="text-sm font-semibold text-slate-800">{appt.date}</p>
            </div>
            <div>
              <p className="text-[11px] text-slate-400 flex items-center gap-1 mb-0.5">
                <MdAccessTime className="text-[11px]" /> Time
              </p>
              <p className="text-sm font-semibold text-slate-800">{appt.time}</p>
            </div>
            <div>
              <p className="text-[11px] text-slate-400 flex items-center gap-1 mb-0.5">
                <MdAccessTime className="text-[11px]" /> Duration
              </p>
              <p className="text-sm font-semibold text-slate-800">{appt.duration}</p>
            </div>
          </div>
        </div>

        {/* Doctor block */}
        <div className="bg-slate-50 rounded-2xl p-4 space-y-3">
          <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Doctor</p>
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-[#0b1a2c] flex items-center justify-center shrink-0 text-emerald-400 font-bold text-xs">
              {appt.doctor.split(" ").slice(1).map(n => n[0]).join("")}
            </div>
            <div>
              <p className="text-sm font-bold text-slate-800">{appt.doctor}</p>
              <p className="text-xs text-slate-500">{appt.specialty}</p>
            </div>
          </div>
        </div>

        {/* Visit block */}
        <div className="bg-slate-50 rounded-2xl p-4 space-y-3">
          <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Visit Info</p>
          <div>
            <p className="text-[11px] text-slate-400 flex items-center gap-1 mb-0.5">
              <MdPerson className="text-[11px]" /> Reason
            </p>
            <p className="text-sm font-semibold text-slate-800">{appt.reason}</p>
          </div>
          <div>
            <p className="text-[11px] text-slate-400 flex items-center gap-1 mb-0.5">
              <MdLocalHospital className="text-[11px]" /> Clinic Address
            </p>
            <p className="text-sm font-semibold text-slate-800">{appt.clinic_address}</p>
          </div>
          {appt.notes && (
            <div>
              <p className="text-[11px] text-slate-400 flex items-center gap-1 mb-0.5">
                <MdNotes className="text-[11px]" /> Notes
              </p>
              <p className="text-sm text-slate-700 leading-relaxed">{appt.notes}</p>
            </div>
          )}
        </div>

        {/* Outcome block — completed only */}
        {appt.status === "completed" && (appt.diagnosis || appt.prescription) && (
          <div className="bg-slate-50 rounded-2xl p-4 space-y-3">
            <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Outcome</p>
            {appt.diagnosis && (
              <div>
                <p className="text-[11px] text-slate-400 mb-0.5">Diagnosis</p>
                <p className="text-sm font-semibold text-slate-800">{appt.diagnosis}</p>
              </div>
            )}
            {appt.prescription && (
              <div>
                <p className="text-[11px] text-slate-400 mb-0.5">Prescription</p>
                <p className="text-sm font-semibold text-slate-800">{appt.prescription}</p>
              </div>
            )}
          </div>
        )}

        {/* Cancel reason — cancelled only */}
        {appt.status === "cancelled" && appt.cancelReason && (
          <div className="bg-red-50 border border-red-100 rounded-2xl p-4">
            <p className="text-[10px] font-bold text-red-400 uppercase tracking-widest mb-1">Cancellation Reason</p>
            <p className="text-sm text-red-700">{appt.cancelReason}</p>
          </div>
        )}
      </div>

      {/* Actions footer */}
      {isActive && (
        <div className="px-6 pb-6 pt-4 border-t border-slate-100 shrink-0 space-y-2">
          <NavLink
            to="/patient/reschedule-appointment"
            className="w-full flex items-center justify-center gap-2 py-2.5 text-xs font-bold text-white bg-[#0b1a2c] hover:bg-[#122236] rounded-xl transition-colors"
          >
            <MdRefresh className="text-[14px]" /> Reschedule Appointment
          </NavLink>
          <button className="w-full flex items-center justify-center gap-2 py-2.5 text-xs font-bold text-red-500 border border-red-200 bg-red-50 hover:bg-red-100 rounded-xl transition-colors">
            <MdCancel className="text-[14px]" /> Cancel Appointment
          </button>
        </div>
      )}
    </div>
  )
}

// ── List Row ──────────────────────────────────────────────────────────────────
const AppointmentRow = ({ appt, isSelected, onSelect }) => {
  const cfg  = STATUS_CONFIG[appt.status]
  const Icon = appt.type === "derma" ? MdFace : MdMedicalServices

  return (
    <button
      onClick={() => onSelect(appt)}
      className={`w-full flex items-center gap-4 px-5 py-4 border-l-[3px] text-left transition-all duration-150
        ${isSelected
          ? `${cfg.row} bg-slate-50`
          : `border-l-transparent hover:bg-slate-50/70`
        }`}
    >
      {/* Icon */}
      <div className={`w-9 h-9 rounded-xl flex items-center justify-center shrink-0
        ${appt.type === "derma" ? "bg-emerald-50" : "bg-slate-100"}`}>
        <Icon className={`text-[16px] ${appt.type === "derma" ? "text-emerald-600" : "text-slate-500"}`} />
      </div>

      {/* Main info */}
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 mb-0.5 flex-wrap">
          <p className="text-sm font-bold text-slate-800 truncate">{appt.doctor}</p>
          <span className={`text-[10px] font-bold border px-2 py-0.5 rounded-full whitespace-nowrap ${cfg.badge}`}>
            {cfg.label}
          </span>
        </div>
        <p className="text-xs text-slate-500 truncate">{appt.reason}</p>
        <div className="flex items-center gap-3 mt-1.5 text-[11px] text-slate-400 font-medium">
          <span className="flex items-center gap-1">
            <MdCalendarToday className="text-[11px]" /> {appt.date}
          </span>
          <span className="flex items-center gap-1">
            <MdAccessTime className="text-[11px]" /> {appt.time}
          </span>
        </div>
      </div>

      {/* APT ID + chevron */}
      <div className="flex flex-col items-end gap-2 shrink-0">
        <span className="text-[10px] font-mono font-semibold text-slate-400">{appt.id}</span>
        <MdChevronRight className={`text-[16px] transition-colors ${isSelected ? "text-slate-500" : "text-slate-300"}`} />
      </div>
    </button>
  )
}

// ── Main Component ────────────────────────────────────────────────────────────
const MyAppointments = () => {
  const [activeTab, setActiveTab] = useState("all")
  const [search,    setSearch]    = useState("")
  const [selected,  setSelected]  = useState(appointments[0])

  const counts = TABS.reduce((acc, t) => {
    acc[t.key] = t.key === "all"
      ? appointments.length
      : appointments.filter(a => a.status === t.key).length
    return acc
  }, {})

  const filtered = appointments.filter(a => {
    const matchTab    = activeTab === "all" || a.status === activeTab
    const matchSearch = !search ||
      a.doctor.toLowerCase().includes(search.toLowerCase()) ||
      a.reason.toLowerCase().includes(search.toLowerCase()) ||
      a.id.toLowerCase().includes(search.toLowerCase())
    return matchTab && matchSearch
  })

  return (
    <div className="max-w-5xl space-y-5">

      {/* ── Page header ────────────────────────────────────────────────── */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-800">My Appointments</h1>
          <p className="text-sm text-slate-500 mt-0.5">Track and manage all your clinic visits.</p>
        </div>
        <button className="flex items-center gap-1.5 bg-[#0b1a2c] hover:bg-[#122236] text-white text-xs font-semibold px-4 py-2.5 rounded-xl transition-colors shrink-0">
          <MdAdd className="text-[15px]" /> Book New
        </button>
      </div>

      {/* ── Main panel ─────────────────────────────────────────────────── */}
      <div className="bg-white border border-slate-200 rounded-2xl overflow-hidden flex" style={{ minHeight: "600px" }}>

        {/* LEFT — list */}
        <div className="flex flex-col border-r border-slate-100 w-full lg:w-[420px] shrink-0">

          {/* Search + tabs */}
          <div className="px-4 pt-4 pb-3 border-b border-slate-100 space-y-3">
            <div className="flex items-center gap-2 bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 focus-within:border-slate-300 transition-colors">
              <MdSearch className="text-slate-400 text-[15px] shrink-0" />
              <input
                type="text"
                value={search}
                onChange={e => setSearch(e.target.value)}
                placeholder="Search doctor, reason, ID…"
                className="text-sm text-slate-700 placeholder-slate-300 bg-transparent outline-none w-full"
              />
              {search && (
                <button onClick={() => setSearch("")} className="text-slate-300 hover:text-slate-500 transition-colors">
                  <MdClose className="text-[13px]" />
                </button>
              )}
            </div>

            <div className="flex gap-0.5 overflow-x-auto pb-0.5">
              {TABS.map(({ key, label }) => (
                <button
                  key={key}
                  onClick={() => setActiveTab(key)}
                  className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[11px] font-bold whitespace-nowrap transition-all duration-150
                    ${activeTab === key
                      ? "bg-[#0b1a2c] text-emerald-400"
                      : "text-slate-500 hover:bg-slate-100 hover:text-slate-700"
                    }`}
                >
                  {label}
                  <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded-full
                    ${activeTab === key ? "bg-white/10 text-emerald-300" : "bg-slate-100 text-slate-400"}`}>
                    {counts[key]}
                  </span>
                </button>
              ))}
            </div>
          </div>

          {/* List */}
          <div className="flex-1 overflow-y-auto divide-y divide-slate-100">
            {filtered.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-16 text-center px-6">
                <div className="w-12 h-12 rounded-2xl bg-slate-100 flex items-center justify-center mb-3">
                  <MdEventBusy className="text-[22px] text-slate-300" />
                </div>
                <p className="text-sm font-semibold text-slate-500">No appointments found</p>
                <p className="text-xs text-slate-400 mt-0.5">Try a different filter or search term.</p>
              </div>
            ) : (
              filtered.map(appt => (
                <AppointmentRow
                  key={appt.id}
                  appt={appt}
                  isSelected={selected?.id === appt.id}
                  onSelect={setSelected}
                />
              ))
            )}
          </div>

          {/* Footer count */}
          <div className="px-5 py-3 border-t border-slate-100 shrink-0">
            <p className="text-[11px] text-slate-400 font-medium">
              Showing {filtered.length} of {appointments.length} appointments
            </p>
          </div>
        </div>

        {/* RIGHT — detail */}
        <div className="hidden lg:flex flex-col flex-1 min-w-0">
          {selected ? (
            <DetailPanel appt={selected} onClose={() => setSelected(null)} />
          ) : (
            <div className="flex flex-col items-center justify-center flex-1 text-center px-8">
              <div className="w-14 h-14 rounded-2xl bg-slate-100 flex items-center justify-center mb-3">
                <MdCalendarToday className="text-[24px] text-slate-300" />
              </div>
              <p className="text-sm font-semibold text-slate-500">Select an appointment</p>
              <p className="text-xs text-slate-400 mt-1">Click any row to see full details.</p>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

export default MyAppointments