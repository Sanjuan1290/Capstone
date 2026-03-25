import { useState } from "react"
import {
  MdCalendarToday, MdAccessTime, MdFace,
  MdMedicalServices, MdSearch, MdClose,
  MdEventBusy, MdAdd, MdCancel, MdRefresh,
  MdPerson, MdNotes, MdLocalHospital, MdChevronRight,
  MdLocationOn, MdCheckCircle, MdSchedule, MdWarning
} from "react-icons/md"
import { NavLink } from "react-router-dom"

// ── Mock Data ─────────────────────────────────────────────────────────────────
const appointments = [
  {
    id: "APT-001", type: "derma", clinic: "Dermatology",
    doctor: "Dr. Maria Santos", specialty: "Dermatologist",
    date: "March 25, 2026", rawDate: new Date(2026, 2, 25), time: "10:00 AM",
    reason: "Acne Treatment Follow-up", status: "confirmed", duration: "30 minutes",
    notes: "Please bring previous prescriptions and avoid applying any skincare products 2 hours before the appointment.",
    clinic_address: "Carait Medical Clinic, 2F Dela Rosa Bldg., Quezon City",
  },
  {
    id: "APT-002", type: "medical", clinic: "General Medicine",
    doctor: "Dr. Jose Reyes", specialty: "General Practitioner",
    date: "April 2, 2026", rawDate: new Date(2026, 3, 2), time: "2:30 PM",
    reason: "Annual Check-up", status: "pending", duration: "45 minutes",
    notes: "Fasting required 8 hours prior. Bring any maintenance medicine.",
    clinic_address: "Carait Medical Clinic, 2F Dela Rosa Bldg., Quezon City",
  },
  {
    id: "APT-003", type: "derma", clinic: "Dermatology",
    doctor: "Dr. Maria Santos", specialty: "Dermatologist",
    date: "February 14, 2026", rawDate: new Date(2026, 1, 14), time: "9:00 AM",
    reason: "Skin Assessment", status: "completed", duration: "20 minutes",
    notes: "Routine follow-up after initial skin treatment.",
    clinic_address: "Carait Medical Clinic, 2F Dela Rosa Bldg., Quezon City",
    diagnosis: "Mild acne vulgaris. Prescribed topical retinoid.",
  },
  {
    id: "APT-004", type: "medical", clinic: "General Medicine",
    doctor: "Dr. Ana Villanueva", specialty: "Internal Medicine",
    date: "January 28, 2026", rawDate: new Date(2026, 0, 28), time: "11:00 AM",
    reason: "Follow-up Visit", status: "completed", duration: "30 minutes",
    notes: "Follow-up for elevated blood pressure noted last visit.",
    clinic_address: "Carait Medical Clinic, 2F Dela Rosa Bldg., Quezon City",
    diagnosis: "Hypertension Stage 1. Advised lifestyle modifications.",
  },
  {
    id: "APT-005", type: "derma", clinic: "Dermatology",
    doctor: "Dr. Carlo Lim", specialty: "Cosmetic Dermatology",
    date: "January 10, 2026", rawDate: new Date(2026, 0, 10), time: "3:00 PM",
    reason: "Cosmetic Consultation", status: "cancelled", duration: "30 minutes",
    notes: "Patient requested cancellation due to scheduling conflict.",
    clinic_address: "Carait Dermatologic Clinic, GF Dela Rosa Bldg., Quezon City",
    cancelReason: "Patient-requested cancellation",
  },
]

const STATUS_CONFIG = {
  confirmed: {
    label: "Confirmed",
    badge: "bg-emerald-50 text-emerald-700 border-emerald-200",
    icon: MdCheckCircle,
    iconColor: "text-emerald-500",
    bar: "bg-emerald-500",
  },
  pending: {
    label: "Pending",
    badge: "bg-amber-50 text-amber-700 border-amber-200",
    icon: MdSchedule,
    iconColor: "text-amber-500",
    bar: "bg-amber-400",
  },
  completed: {
    label: "Completed",
    badge: "bg-slate-100 text-slate-500 border-slate-200",
    icon: MdCheckCircle,
    iconColor: "text-slate-400",
    bar: "bg-slate-300",
  },
  cancelled: {
    label: "Cancelled",
    badge: "bg-red-50 text-red-500 border-red-200",
    icon: MdCancel,
    iconColor: "text-red-400",
    bar: "bg-red-300",
  },
}

const TABS = [
  { key: "all",       label: "All"       },
  { key: "confirmed", label: "Confirmed" },
  { key: "pending",   label: "Pending"   },
  { key: "completed", label: "Completed" },
  { key: "cancelled", label: "Cancelled" },
]

// ── Detail Modal ──────────────────────────────────────────────────────────────
const DetailModal = ({ appt, onClose }) => {
  if (!appt) return null
  const cfg  = STATUS_CONFIG[appt.status]
  const Icon = appt.type === "derma" ? MdFace : MdMedicalServices
  const isActive = appt.status === "confirmed" || appt.status === "pending"

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm px-4"
      onClick={onClose}
    >
      <div
        className="bg-white rounded-2xl shadow-2xl w-full max-w-md max-h-[90vh] flex flex-col overflow-hidden"
        onClick={e => e.stopPropagation()}
      >
        <div className="flex items-center gap-3 px-6 py-5 border-b border-slate-100 shrink-0">
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
          <button onClick={onClose}
            className="w-8 h-8 flex items-center justify-center rounded-xl hover:bg-slate-100 text-slate-400 transition-colors shrink-0">
            <MdClose className="text-[18px]" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-6 py-5 space-y-4">
          <span className="text-[11px] font-mono font-semibold text-slate-400 bg-slate-100 px-2 py-0.5 rounded-md inline-block">
            {appt.id}
          </span>

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

          {appt.status === "completed" && appt.diagnosis && (
            <div className="bg-slate-50 rounded-2xl p-4 space-y-3">
              <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Outcome</p>
              <div>
                <p className="text-[11px] text-slate-400 mb-0.5">Diagnosis</p>
                <p className="text-sm font-semibold text-slate-800">{appt.diagnosis}</p>
              </div>
            </div>
          )}

          {appt.status === "cancelled" && appt.cancelReason && (
            <div className="bg-red-50 border border-red-100 rounded-2xl p-4">
              <p className="text-[10px] font-bold text-red-400 uppercase tracking-widest mb-1">Cancellation Reason</p>
              <p className="text-sm text-red-700">{appt.cancelReason}</p>
            </div>
          )}
        </div>

        {isActive && (
          <div className="px-6 pb-6 pt-4 border-t border-slate-100 shrink-0 space-y-2">
            <NavLink
              to="/patient/reschedule-appointment"
              className="w-full flex items-center justify-center gap-2 py-2.5 text-xs font-bold
                text-white bg-[#0b1a2c] hover:bg-[#122236] rounded-xl transition-colors"
            >
              <MdRefresh className="text-[14px]" /> Reschedule Appointment
            </NavLink>
            <button className="w-full flex items-center justify-center gap-2 py-2.5 text-xs font-bold
              text-red-500 border border-red-200 bg-red-50 hover:bg-red-100 rounded-xl transition-colors">
              <MdCancel className="text-[14px]" /> Cancel Appointment
            </button>
          </div>
        )}
      </div>
    </div>
  )
}

// ── Appointment Card ──────────────────────────────────────────────────────────
const AppointmentCard = ({ appt, onSelect }) => {
  const cfg  = STATUS_CONFIG[appt.status]
  const Icon = appt.type === "derma" ? MdFace : MdMedicalServices
  const StatusIcon = cfg.icon
  const isActive = appt.status === "confirmed" || appt.status === "pending"

  return (
    <div
      onClick={() => onSelect(appt)}
      className={`relative bg-white border rounded-2xl overflow-hidden cursor-pointer transition-all duration-200
        hover:shadow-md hover:-translate-y-0.5 group
        ${isActive ? "border-slate-200 shadow-sm" : "border-slate-100"}`}
    >
      {/* Status color bar */}
      <div className={`absolute top-0 left-0 right-0 h-0.5 ${cfg.bar}`} />

      <div className="p-5">
        {/* Top row: doctor + status badge */}
        <div className="flex items-start justify-between gap-3 mb-4">
          <div className="flex items-center gap-3 min-w-0">
            <div className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0
              ${appt.type === "derma" ? "bg-emerald-50" : "bg-slate-100"}`}>
              <Icon className={`text-[18px] ${appt.type === "derma" ? "text-emerald-600" : "text-slate-500"}`} />
            </div>
            <div className="min-w-0">
              <p className="text-sm font-bold text-slate-800 truncate">{appt.doctor}</p>
              <p className="text-xs text-slate-500">{appt.specialty}</p>
            </div>
          </div>
          <span className={`text-[11px] font-bold border px-2.5 py-1 rounded-full shrink-0 flex items-center gap-1 ${cfg.badge}`}>
            <StatusIcon className="text-[12px]" />
            {cfg.label}
          </span>
        </div>

        {/* Reason */}
        <div className="mb-4">
          <p className="text-xs font-semibold text-slate-800 truncate">{appt.reason}</p>
          <p className="text-[11px] font-mono text-slate-400 mt-0.5">{appt.id}</p>
        </div>

        {/* Info pills row */}
        <div className="flex flex-wrap gap-2 mb-4">
          <span className="flex items-center gap-1 text-[11px] text-slate-500 bg-slate-50 border border-slate-100 px-2.5 py-1 rounded-lg">
            <MdCalendarToday className="text-[11px] text-slate-400" />
            {appt.date}
          </span>
          <span className="flex items-center gap-1 text-[11px] text-slate-500 bg-slate-50 border border-slate-100 px-2.5 py-1 rounded-lg">
            <MdAccessTime className="text-[11px] text-slate-400" />
            {appt.time} · {appt.duration}
          </span>
        </div>

        {/* Clinic location */}
        <div className="flex items-start gap-1.5 mb-4">
          <MdLocationOn className="text-[13px] text-slate-300 shrink-0 mt-0.5" />
          <p className="text-[11px] text-slate-400 leading-relaxed line-clamp-1">{appt.clinic_address}</p>
        </div>

        {/* Footer actions (active only) */}
        {isActive ? (
          <div className="flex gap-2 pt-3 border-t border-slate-100">
            <NavLink
              to="/patient/reschedule-appointment"
              onClick={e => e.stopPropagation()}
              className="flex-1 flex items-center justify-center gap-1.5 py-2 text-[11px] font-bold
                text-slate-600 border border-slate-200 hover:border-slate-300 hover:bg-slate-50
                rounded-xl transition-all"
            >
              <MdRefresh className="text-[13px]" /> Reschedule
            </NavLink>
            <button
              onClick={e => { e.stopPropagation() }}
              className="flex-1 flex items-center justify-center gap-1.5 py-2 text-[11px] font-bold
                text-red-500 border border-red-100 bg-red-50 hover:bg-red-100
                rounded-xl transition-all"
            >
              <MdCancel className="text-[13px]" /> Cancel
            </button>
          </div>
        ) : (
          <div className="flex items-center justify-between pt-3 border-t border-slate-100">
            <p className="text-[11px] text-slate-400">{appt.clinic}</p>
            <span className="flex items-center gap-1 text-[11px] font-semibold text-slate-400
              group-hover:text-emerald-600 transition-colors">
              View details <MdChevronRight className="text-[14px]" />
            </span>
          </div>
        )}
      </div>
    </div>
  )
}

// ── Next Appointment Banner ───────────────────────────────────────────────────
const NextAppointmentBanner = ({ appt }) => {
  if (!appt) return null
  const Icon = appt.type === "derma" ? MdFace : MdMedicalServices

  return (
    <div className="bg-[#0b1a2c] rounded-2xl p-5 text-white">
      <p className="text-[10px] font-bold text-emerald-400 uppercase tracking-widest mb-3">Next Appointment</p>
      <div className="flex items-center gap-4 flex-wrap">
        <div className="flex items-center gap-3 flex-1 min-w-0">
          <div className="w-11 h-11 rounded-xl bg-white/10 flex items-center justify-center shrink-0">
            <Icon className="text-[20px] text-emerald-400" />
          </div>
          <div className="min-w-0">
            <p className="text-sm font-bold truncate">{appt.doctor}</p>
            <p className="text-xs text-white/60">{appt.reason}</p>
          </div>
        </div>
        <div className="flex gap-4 shrink-0">
          <div>
            <p className="text-[10px] text-white/50 uppercase tracking-wide mb-0.5">Date</p>
            <p className="text-xs font-semibold">{appt.date}</p>
          </div>
          <div>
            <p className="text-[10px] text-white/50 uppercase tracking-wide mb-0.5">Time</p>
            <p className="text-xs font-semibold">{appt.time}</p>
          </div>
          <div>
            <p className="text-[10px] text-white/50 uppercase tracking-wide mb-0.5">Duration</p>
            <p className="text-xs font-semibold">{appt.duration}</p>
          </div>
        </div>
      </div>
      {appt.notes && (
        <div className="mt-3 pt-3 border-t border-white/10">
          <p className="text-[11px] text-white/50 flex items-center gap-1">
            <MdNotes className="text-[12px]" /> Reminder: {appt.notes}
          </p>
        </div>
      )}
    </div>
  )
}

// ── Main Component ────────────────────────────────────────────────────────────
const MyAppointments = () => {
  const [activeTab, setActiveTab] = useState("all")
  const [search,    setSearch]    = useState("")
  const [modal,     setModal]     = useState(null)

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

  // Pick the soonest confirmed or pending appointment for the banner
  const nextAppt = appointments
    .filter(a => a.status === "confirmed" || a.status === "pending")
    .sort((a, b) => a.rawDate - b.rawDate)[0]

  return (
    <div className="max-w-5xl space-y-5">

      {/* Page header */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-800">My Appointments</h1>
          <p className="text-sm text-slate-500 mt-0.5">Track and manage all your clinic visits.</p>
        </div>
        <NavLink to="/patient/book"
          className="flex items-center gap-1.5 bg-[#0b1a2c] hover:bg-[#122236] text-white
            text-xs font-semibold px-4 py-2.5 rounded-xl transition-colors shrink-0">
          <MdAdd className="text-[15px]" /> Book New
        </NavLink>
      </div>

      {/* Next appointment banner */}
      {(activeTab === "all" || activeTab === "confirmed" || activeTab === "pending") && !search && (
        <NextAppointmentBanner appt={nextAppt} />
      )}

      {/* Search + Tabs */}
      <div className="flex items-center gap-3 flex-wrap">
        <div className="flex items-center gap-2 bg-white border border-slate-200 rounded-xl px-3 py-2
          flex-1 min-w-52 max-w-72 focus-within:border-slate-300 transition-colors">
          <MdSearch className="text-slate-400 text-[15px] shrink-0" />
          <input
            type="text" value={search} onChange={e => setSearch(e.target.value)}
            placeholder="Search doctor, reason, ID…"
            className="text-sm text-slate-700 placeholder-slate-300 bg-transparent outline-none w-full"
          />
          {search && (
            <button onClick={() => setSearch("")} className="text-slate-300 hover:text-slate-500 transition-colors">
              <MdClose className="text-[13px]" />
            </button>
          )}
        </div>

        <div className="flex gap-0.5 bg-white border border-slate-200 rounded-xl p-1 overflow-x-auto">
          {TABS.map(({ key, label }) => (
            <button key={key} onClick={() => setActiveTab(key)}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[11px] font-bold whitespace-nowrap transition-all
                ${activeTab === key
                  ? "bg-[#0b1a2c] text-emerald-400"
                  : "text-slate-500 hover:bg-slate-100 hover:text-slate-700"
                }`}>
              {label}
              <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded-full
                ${activeTab === key ? "bg-white/10 text-emerald-300" : "bg-slate-100 text-slate-400"}`}>
                {counts[key]}
              </span>
            </button>
          ))}
        </div>
      </div>

      {/* Cards Grid */}
      {filtered.length === 0 ? (
        <div className="bg-white border border-slate-200 rounded-2xl flex flex-col items-center justify-center py-16 text-center px-6">
          <div className="w-12 h-12 rounded-2xl bg-slate-100 flex items-center justify-center mb-3">
            <MdEventBusy className="text-[22px] text-slate-300" />
          </div>
          <p className="text-sm font-semibold text-slate-500">No appointments found</p>
          <p className="text-xs text-slate-400 mt-0.5">Try a different filter or search term.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {filtered.map(appt => (
            <AppointmentCard key={appt.id} appt={appt} onSelect={setModal} />
          ))}
        </div>
      )}

      {/* Footer count */}
      <p className="text-[11px] text-slate-400 font-medium">
        Showing {filtered.length} of {appointments.length} appointments
      </p>

      {/* Detail Modal */}
      {modal && <DetailModal appt={modal} onClose={() => setModal(null)} />}
    </div>
  )
}

export default MyAppointments