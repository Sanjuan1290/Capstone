import { useState } from "react"
import {
  MdCalendarToday, MdAccessTime, MdFace, MdSearch,
  MdMedicalServices, MdClose, MdPerson, MdNotes,
  MdLocalHospital, MdHistory
} from "react-icons/md"

// ── Mock Data ─────────────────────────────────────────────────────────────────
const historyData = [
  {
    id: "APT-003", type: "derma", clinic: "Dermatology",
    doctor: "Dr. Maria Santos", specialty: "Dermatologist",
    date: "February 14, 2026", rawDate: new Date(2026, 1, 14), time: "9:00 AM",
    reason: "Skin Assessment", duration: "20 minutes",
    notes: "Routine follow-up after initial skin treatment.",
    clinic_address: "Carait Medical Clinic, 2F Dela Rosa Bldg., Quezon City",
    diagnosis: "Mild acne vulgaris. Prescribed topical retinoid.",
  },
  {
    id: "APT-004", type: "medical", clinic: "General Medicine",
    doctor: "Dr. Ana Villanueva", specialty: "Internal Medicine",
    date: "January 28, 2026", rawDate: new Date(2026, 0, 28), time: "11:00 AM",
    reason: "Follow-up Visit", duration: "30 minutes",
    notes: "Follow-up for elevated blood pressure noted last visit.",
    clinic_address: "Carait Medical Clinic, 2F Dela Rosa Bldg., Quezon City",
    diagnosis: "Hypertension Stage 1. Advised lifestyle modifications.",
  },
  {
    id: "APT-006", type: "derma", clinic: "Dermatology",
    doctor: "Dr. Maria Santos", specialty: "Dermatologist",
    date: "December 10, 2025", rawDate: new Date(2025, 11, 10), time: "10:30 AM",
    reason: "Initial Skin Consultation", duration: "30 minutes",
    notes: "First visit. Patient presented with acne and hyperpigmentation.",
    clinic_address: "Carait Medical Clinic, 2F Dela Rosa Bldg., Quezon City",
    diagnosis: "Acne vulgaris with post-inflammatory hyperpigmentation.",
  },
  {
    id: "APT-007", type: "medical", clinic: "General Medicine",
    doctor: "Dr. Jose Reyes", specialty: "General Practitioner",
    date: "November 5, 2025", rawDate: new Date(2025, 10, 5), time: "8:30 AM",
    reason: "Annual Physical Exam", duration: "45 minutes",
    notes: "Routine annual check-up. Bloodwork requested.",
    clinic_address: "Carait Medical Clinic, 2F Dela Rosa Bldg., Quezon City",
    diagnosis: "Generally healthy. Mild hypertension noted. Monitoring advised.",
  },
  {
    id: "APT-008", type: "medical", clinic: "General Medicine",
    doctor: "Dr. Jose Reyes", specialty: "General Practitioner",
    date: "August 20, 2025", rawDate: new Date(2025, 7, 20), time: "2:00 PM",
    reason: "Fever and Cough", duration: "20 minutes",
    notes: "Patient reported 3-day fever with productive cough.",
    clinic_address: "Carait Medical Clinic, 2F Dela Rosa Bldg., Quezon City",
    diagnosis: "Upper respiratory tract infection (URTI).",
  },
  {
    id: "APT-009", type: "derma", clinic: "Dermatology",
    doctor: "Dr. Carlo Lim", specialty: "Cosmetic Dermatology",
    date: "June 3, 2025", rawDate: new Date(2025, 5, 3), time: "3:30 PM",
    reason: "Cosmetic Skin Consultation", duration: "30 minutes",
    notes: "Patient inquired about treatment options for skin brightening.",
    clinic_address: "Carait Dermatologic Clinic, GF Dela Rosa Bldg., Quezon City",
    diagnosis: "Melasma, mild grade.",
  },
]

const CLINIC_FILTERS = [
  { key: "all",     label: "All Clinics"      },
  { key: "medical", label: "General Medicine" },
  { key: "derma",   label: "Dermatology"      },
]

function groupByYear(list) {
  return list.reduce((acc, appt) => {
    const year = appt.rawDate.getFullYear()
    if (!acc[year]) acc[year] = []
    acc[year].push(appt)
    return acc
  }, {})
}

// ── Detail Modal ──────────────────────────────────────────────────────────────
const DetailModal = ({ appt, onClose }) => {
  if (!appt) return null
  const Icon = appt.type === "derma" ? MdFace : MdMedicalServices

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm px-4"
      onClick={onClose}
    >
      <div
        className="bg-white rounded-2xl shadow-2xl w-full max-w-md max-h-[90vh] flex flex-col overflow-hidden"
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center gap-3 px-6 py-5 border-b border-slate-100 shrink-0">
          <div className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0
            ${appt.type === "derma" ? "bg-emerald-50" : "bg-slate-100"}`}>
            <Icon className={`text-[18px] ${appt.type === "derma" ? "text-emerald-600" : "text-slate-500"}`} />
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-bold text-slate-800 truncate">{appt.doctor}</p>
            <p className="text-xs text-slate-500">{appt.clinic}</p>
          </div>
          <span className="text-[11px] font-bold border border-slate-200 bg-slate-100 text-slate-500 px-2.5 py-0.5 rounded-full shrink-0">
            Completed
          </span>
          <button onClick={onClose}
            className="w-8 h-8 flex items-center justify-center rounded-xl hover:bg-slate-100 text-slate-400 transition-colors shrink-0">
            <MdClose className="text-[18px]" />
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto px-6 py-5 space-y-4">
          <span className="text-[11px] font-mono font-semibold text-slate-400 bg-slate-100 px-2 py-0.5 rounded-md inline-block">
            {appt.id}
          </span>

          {/* Schedule */}
          <div className="bg-slate-50 rounded-2xl p-4 space-y-3">
            <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Schedule</p>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <p className="text-[11px] text-slate-400 flex items-center gap-1 mb-0.5"><MdCalendarToday className="text-[11px]" /> Date</p>
                <p className="text-sm font-semibold text-slate-800">{appt.date}</p>
              </div>
              <div>
                <p className="text-[11px] text-slate-400 flex items-center gap-1 mb-0.5"><MdAccessTime className="text-[11px]" /> Time</p>
                <p className="text-sm font-semibold text-slate-800">{appt.time}</p>
              </div>
              <div>
                <p className="text-[11px] text-slate-400 flex items-center gap-1 mb-0.5"><MdAccessTime className="text-[11px]" /> Duration</p>
                <p className="text-sm font-semibold text-slate-800">{appt.duration}</p>
              </div>
            </div>
          </div>

          {/* Doctor */}
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

          {/* Visit Info */}
          <div className="bg-slate-50 rounded-2xl p-4 space-y-3">
            <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Visit Info</p>
            <div>
              <p className="text-[11px] text-slate-400 flex items-center gap-1 mb-0.5"><MdPerson className="text-[11px]" /> Reason</p>
              <p className="text-sm font-semibold text-slate-800">{appt.reason}</p>
            </div>
            <div>
              <p className="text-[11px] text-slate-400 flex items-center gap-1 mb-0.5"><MdLocalHospital className="text-[11px]" /> Clinic Address</p>
              <p className="text-sm font-semibold text-slate-800">{appt.clinic_address}</p>
            </div>
            {appt.notes && (
              <div>
                <p className="text-[11px] text-slate-400 flex items-center gap-1 mb-0.5"><MdNotes className="text-[11px]" /> Notes</p>
                <p className="text-sm text-slate-700 leading-relaxed">{appt.notes}</p>
              </div>
            )}
          </div>

          {/* Outcome */}
          {appt.diagnosis && (
            <div className="bg-slate-50 rounded-2xl p-4 space-y-3">
              <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Outcome</p>
              <div>
                <p className="text-[11px] text-slate-400 mb-0.5">Diagnosis</p>
                <p className="text-sm font-semibold text-slate-800">{appt.diagnosis}</p>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

// ── Main ──────────────────────────────────────────────────────────────────────
const History = () => {
  const [search,  setSearch]  = useState("")
  const [clinic,  setClinic]  = useState("all")
  const [modal,   setModal]   = useState(null)

  const filtered = historyData.filter(a => {
    const matchClinic = clinic === "all" || a.type === clinic
    const matchSearch = !search ||
      a.doctor.toLowerCase().includes(search.toLowerCase()) ||
      a.reason.toLowerCase().includes(search.toLowerCase()) ||
      a.id.toLowerCase().includes(search.toLowerCase()) ||
      a.diagnosis?.toLowerCase().includes(search.toLowerCase())
    return matchClinic && matchSearch
  })

  const grouped = groupByYear(filtered)
  const years   = Object.keys(grouped).sort((a, b) => b - a)

  return (
    <div className="max-w-5xl space-y-5">

      {/* Page header */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-800">Visit History</h1>
          <p className="text-sm text-slate-500 mt-0.5">A complete record of your past clinic visits.</p>
        </div>
        <div className="shrink-0 bg-slate-100 border border-slate-200 rounded-xl px-4 py-2 text-center">
          <p className="text-2xl font-black text-slate-700">{historyData.length}</p>
          <p className="text-[10px] font-semibold text-slate-400 uppercase tracking-wide">Total Visits</p>
        </div>
      </div>

      {/* Search + filter toolbar */}
      <div className="flex items-center gap-3 flex-wrap">
        <div className="flex items-center gap-2 bg-white border border-slate-200 rounded-xl px-3 py-2
          flex-1 min-w-52 max-w-72 focus-within:border-slate-300 transition-colors">
          <MdSearch className="text-slate-400 text-[15px] shrink-0" />
          <input type="text" value={search} onChange={e => setSearch(e.target.value)}
            placeholder="Search doctor, reason, diagnosis…"
            className="text-sm text-slate-700 placeholder-slate-300 bg-transparent outline-none w-full" />
          {search && (
            <button onClick={() => setSearch("")} className="text-slate-300 hover:text-slate-500 transition-colors">
              <MdClose className="text-[13px]" />
            </button>
          )}
        </div>

        <div className="flex gap-1 bg-white border border-slate-200 rounded-xl p-1">
          {CLINIC_FILTERS.map(({ key, label }) => (
            <button key={key} onClick={() => setClinic(key)}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[11px] font-bold whitespace-nowrap transition-all
                ${clinic === key
                  ? "bg-[#0b1a2c] text-emerald-400"
                  : "text-slate-500 hover:bg-slate-100 hover:text-slate-700"
                }`}>
              {key === "derma"   && <MdFace           className="text-[12px]" />}
              {key === "medical" && <MdMedicalServices className="text-[12px]" />}
              {label}
            </button>
          ))}
        </div>
      </div>

      {/* Table */}
      <div className="bg-white border border-slate-200 rounded-2xl overflow-hidden">

        {/* Table head */}
        <div className="grid grid-cols-[2fr_1fr_1fr_1fr_100px] gap-4 px-5 py-3 bg-slate-50 border-b border-slate-100">
          {["Visit", "Date & Time", "Clinic", "Diagnosis", ""].map((h, i) => (
            <p key={i} className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">{h}</p>
          ))}
        </div>

        {/* Grouped rows */}
        {filtered.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 text-center px-6">
            <div className="w-12 h-12 rounded-2xl bg-slate-100 flex items-center justify-center mb-3">
              <MdHistory className="text-[22px] text-slate-300" />
            </div>
            <p className="text-sm font-semibold text-slate-500">No records found</p>
            <p className="text-xs text-slate-400 mt-0.5">Try adjusting your search or filter.</p>
          </div>
        ) : (
          years.map(year => (
            <div key={year}>
              {/* Year divider */}
              <div className="px-5 py-2 bg-slate-50 border-y border-slate-100 sticky top-0 z-10">
                <p className="text-[11px] font-bold text-slate-400 uppercase tracking-widest">{year}</p>
              </div>

              {/* Rows */}
              <div className="divide-y divide-slate-100">
                {grouped[year].map(appt => {
                  const Icon = appt.type === "derma" ? MdFace : MdMedicalServices
                  return (
                    <div key={appt.id}
                      className="grid grid-cols-[2fr_1fr_1fr_1fr_100px] gap-4 px-5 py-4 items-center hover:bg-slate-50/70 transition-colors">

                      {/* Visit */}
                      <div className="flex items-center gap-3 min-w-0">
                        <div className={`w-9 h-9 rounded-xl flex items-center justify-center shrink-0
                          ${appt.type === "derma" ? "bg-emerald-50" : "bg-slate-100"}`}>
                          <Icon className={`text-[16px] ${appt.type === "derma" ? "text-emerald-600" : "text-slate-500"}`} />
                        </div>
                        <div className="min-w-0">
                          <p className="text-sm font-bold text-slate-800 truncate">{appt.doctor}</p>
                          <p className="text-xs text-slate-500 truncate">{appt.reason}</p>
                          <p className="text-[10px] font-mono text-slate-400 mt-0.5">{appt.id}</p>
                        </div>
                      </div>

                      {/* Date & Time */}
                      <div>
                        <p className="text-xs font-semibold text-slate-700 flex items-center gap-1">
                          <MdCalendarToday className="text-[11px] text-slate-400" /> {appt.date}
                        </p>
                        <p className="text-xs text-slate-400 flex items-center gap-1 mt-1">
                          <MdAccessTime className="text-[11px]" /> {appt.time}
                        </p>
                      </div>

                      {/* Clinic */}
                      <div>
                        <p className="text-xs font-semibold text-slate-700">{appt.clinic}</p>
                        <p className="text-[11px] text-slate-400 mt-0.5">{appt.duration}</p>
                      </div>

                      {/* Diagnosis */}
                      <p className="text-xs text-slate-600 leading-relaxed line-clamp-2">
                        {appt.diagnosis || <span className="text-slate-300 italic">—</span>}
                      </p>

                      {/* Show More button */}
                      <button
                        onClick={() => setModal(appt)}
                        className="flex items-center justify-center gap-1 text-[11px] font-bold text-slate-600
                          border border-slate-200 hover:border-emerald-300 hover:text-emerald-700 hover:bg-emerald-50
                          px-3 py-1.5 rounded-lg transition-all duration-150 w-full"
                      >
                        Show More
                      </button>
                    </div>
                  )
                })}
              </div>
            </div>
          ))
        )}

        {/* Footer */}
        <div className="px-5 py-3 border-t border-slate-100">
          <p className="text-[11px] text-slate-400 font-medium">
            Showing {filtered.length} of {historyData.length} records
          </p>
        </div>
      </div>

      {/* Detail Modal */}
      {modal && <DetailModal appt={modal} onClose={() => setModal(null)} />}
    </div>
  )
}

export default History