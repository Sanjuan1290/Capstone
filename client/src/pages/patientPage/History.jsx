import { useState } from "react"
import {
  MdCalendarToday, MdAccessTime, MdFace, MdSearch,
  MdMedicalServices, MdChevronRight, MdClose,
  MdPerson, MdNotes, MdLocalHospital, MdArrowBack,
  MdFilterList, MdHistory
} from "react-icons/md"

// ── Mock Data ─────────────────────────────────────────────────────────────────
const historyData = [
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
    duration: "20 minutes",
    notes: "Routine follow-up after initial skin treatment.",
    clinic_address: "Carait Medical Clinic, 2F Dela Rosa Bldg., Quezon City",
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
    duration: "30 minutes",
    notes: "Follow-up for elevated blood pressure noted last visit.",
    clinic_address: "Carait Medical Clinic, 2F Dela Rosa Bldg., Quezon City",
    diagnosis: "Hypertension Stage 1. Advised lifestyle modifications.",
    prescription: "Amlodipine 5mg — once daily",
  },
  {
    id: "APT-006",
    type: "derma",
    clinic: "Dermatology",
    doctor: "Dr. Maria Santos",
    specialty: "Dermatologist",
    date: "December 10, 2025",
    rawDate: new Date(2025, 11, 10),
    time: "10:30 AM",
    reason: "Initial Skin Consultation",
    duration: "30 minutes",
    notes: "First visit. Patient presented with acne and hyperpigmentation.",
    clinic_address: "Carait Medical Clinic, 2F Dela Rosa Bldg., Quezon City",
    diagnosis: "Acne vulgaris with post-inflammatory hyperpigmentation.",
    prescription: "Clindamycin gel 1% — apply twice daily; Sunscreen SPF 50",
  },
  {
    id: "APT-007",
    type: "medical",
    clinic: "General Medicine",
    doctor: "Dr. Jose Reyes",
    specialty: "General Practitioner",
    date: "November 5, 2025",
    rawDate: new Date(2025, 10, 5),
    time: "8:30 AM",
    reason: "Annual Physical Exam",
    duration: "45 minutes",
    notes: "Routine annual check-up. Bloodwork requested.",
    clinic_address: "Carait Medical Clinic, 2F Dela Rosa Bldg., Quezon City",
    diagnosis: "Generally healthy. Mild hypertension noted. Monitoring advised.",
    prescription: "Lifestyle modifications: low-sodium diet, regular exercise",
  },
  {
    id: "APT-008",
    type: "medical",
    clinic: "General Medicine",
    doctor: "Dr. Jose Reyes",
    specialty: "General Practitioner",
    date: "August 20, 2025",
    rawDate: new Date(2025, 7, 20),
    time: "2:00 PM",
    reason: "Fever and Cough",
    duration: "20 minutes",
    notes: "Patient reported 3-day fever with productive cough.",
    clinic_address: "Carait Medical Clinic, 2F Dela Rosa Bldg., Quezon City",
    diagnosis: "Upper respiratory tract infection (URTI).",
    prescription: "Amoxicillin 500mg — 3x daily for 7 days; Paracetamol 500mg PRN",
  },
  {
    id: "APT-009",
    type: "derma",
    clinic: "Dermatology",
    doctor: "Dr. Carlo Lim",
    specialty: "Cosmetic Dermatology",
    date: "June 3, 2025",
    rawDate: new Date(2025, 5, 3),
    time: "3:30 PM",
    reason: "Cosmetic Skin Consultation",
    duration: "30 minutes",
    notes: "Patient inquired about treatment options for skin brightening.",
    clinic_address: "Carait Dermatologic Clinic, GF Dela Rosa Bldg., Quezon City",
    diagnosis: "Melasma, mild grade.",
    prescription: "Hydroquinone 2% cream — apply nightly; avoid sun exposure",
  },
]

// ── Filters ───────────────────────────────────────────────────────────────────
const CLINIC_FILTERS = [
  { key: "all",     label: "All Clinics"    },
  { key: "medical", label: "General Medicine" },
  { key: "derma",   label: "Dermatology"    },
]

// ── Group by year ─────────────────────────────────────────────────────────────
function groupByYear(list) {
  return list.reduce((acc, appt) => {
    const year = appt.rawDate.getFullYear()
    if (!acc[year]) acc[year] = []
    acc[year].push(appt)
    return acc
  }, {})
}

// ── Detail Panel ──────────────────────────────────────────────────────────────
const DetailPanel = ({ appt, onClose }) => {
  if (!appt) return null
  const Icon = appt.type === "derma" ? MdFace : MdMedicalServices

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
        <span className="text-[11px] font-bold border border-slate-200 bg-slate-100 text-slate-500 px-2.5 py-0.5 rounded-full shrink-0">
          Completed
        </span>
      </div>

      {/* Body */}
      <div className="flex-1 overflow-y-auto px-6 py-5 space-y-5">

        {/* APT ID */}
        <span className="text-[11px] font-mono font-semibold text-slate-400 bg-slate-100 px-2 py-0.5 rounded-md inline-block">
          {appt.id}
        </span>

        {/* Schedule */}
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

        {/* Outcome */}
        {(appt.diagnosis || appt.prescription) && (
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
      </div>
    </div>
  )
}

// ── History Row ───────────────────────────────────────────────────────────────
const HistoryRow = ({ appt, isSelected, onSelect }) => {
  const Icon = appt.type === "derma" ? MdFace : MdMedicalServices

  return (
    <button
      onClick={() => onSelect(appt)}
      className={`w-full flex items-center gap-4 px-5 py-4 border-l-[3px] text-left transition-all duration-150
        ${isSelected
          ? "border-l-slate-400 bg-slate-50"
          : "border-l-transparent hover:bg-slate-50/70"
        }`}
    >
      {/* Icon */}
      <div className={`w-9 h-9 rounded-xl flex items-center justify-center shrink-0
        ${appt.type === "derma" ? "bg-emerald-50" : "bg-slate-100"}`}>
        <Icon className={`text-[16px] ${appt.type === "derma" ? "text-emerald-600" : "text-slate-500"}`} />
      </div>

      {/* Info */}
      <div className="flex-1 min-w-0">
        <p className="text-sm font-bold text-slate-800 truncate">{appt.doctor}</p>
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

      {/* Right meta */}
      <div className="flex flex-col items-end gap-2 shrink-0">
        <span className="text-[10px] font-mono font-semibold text-slate-400">{appt.id}</span>
        <MdChevronRight className={`text-[16px] transition-colors ${isSelected ? "text-slate-500" : "text-slate-300"}`} />
      </div>
    </button>
  )
}

// ── Main ──────────────────────────────────────────────────────────────────────
const History = () => {
  const [search,    setSearch]   = useState("")
  const [clinic,    setClinic]   = useState("all")
  const [selected,  setSelected] = useState(historyData[0])

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
        {/* Total badge */}
        <div className="shrink-0 bg-slate-100 border border-slate-200 rounded-xl px-4 py-2 text-center">
          <p className="text-2xl font-black text-slate-700">{historyData.length}</p>
          <p className="text-[10px] font-semibold text-slate-400 uppercase tracking-wide">Total Visits</p>
        </div>
      </div>

      {/* Main panel */}
      <div className="bg-white border border-slate-200 rounded-2xl overflow-hidden flex" style={{ minHeight: "600px" }}>

        {/* LEFT — list */}
        <div className="flex flex-col border-r border-slate-100 w-full lg:w-[420px] shrink-0">

          {/* Search + filter */}
          <div className="px-4 pt-4 pb-3 border-b border-slate-100 space-y-3">
            {/* Search */}
            <div className="flex items-center gap-2 bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 focus-within:border-slate-300 transition-colors">
              <MdSearch className="text-slate-400 text-[15px] shrink-0" />
              <input
                type="text"
                value={search}
                onChange={e => setSearch(e.target.value)}
                placeholder="Search doctor, reason, diagnosis…"
                className="text-sm text-slate-700 placeholder-slate-300 bg-transparent outline-none w-full"
              />
              {search && (
                <button onClick={() => setSearch("")} className="text-slate-300 hover:text-slate-500 transition-colors">
                  <MdClose className="text-[13px]" />
                </button>
              )}
            </div>

            {/* Clinic filter pills */}
            <div className="flex gap-1">
              {CLINIC_FILTERS.map(({ key, label }) => (
                <button
                  key={key}
                  onClick={() => setClinic(key)}
                  className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[11px] font-bold whitespace-nowrap transition-all duration-150
                    ${clinic === key
                      ? "bg-[#0b1a2c] text-emerald-400"
                      : "text-slate-500 hover:bg-slate-100 hover:text-slate-700"
                    }`}
                >
                  {key !== "all" && (
                    key === "derma"
                      ? <MdFace className="text-[12px]" />
                      : <MdMedicalServices className="text-[12px]" />
                  )}
                  {label}
                </button>
              ))}
            </div>
          </div>

          {/* Grouped list */}
          <div className="flex-1 overflow-y-auto">
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
                  <div className="divide-y divide-slate-100">
                    {grouped[year].map(appt => (
                      <HistoryRow
                        key={appt.id}
                        appt={appt}
                        isSelected={selected?.id === appt.id}
                        onSelect={setSelected}
                      />
                    ))}
                  </div>
                </div>
              ))
            )}
          </div>

          {/* Footer */}
          <div className="px-5 py-3 border-t border-slate-100 shrink-0">
            <p className="text-[11px] text-slate-400 font-medium">
              Showing {filtered.length} of {historyData.length} records
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
                <MdHistory className="text-[24px] text-slate-300" />
              </div>
              <p className="text-sm font-semibold text-slate-500">Select a record</p>
              <p className="text-xs text-slate-400 mt-1">Click any visit to see full details.</p>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

export default History