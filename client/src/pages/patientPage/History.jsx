// client/src/pages/patientPage/History.jsx
// REDESIGNED: Timeline-style visit history, prescription expand, mobile-first

import { useEffect, useState } from "react"
import { getMyHistory } from "../../services/patient.service"
import {
  MdCalendarToday, MdAccessTime, MdFace, MdMedicalServices,
  MdLocalPharmacy, MdExpandMore, MdExpandLess, MdHistory,
  MdNotes, MdSearch, MdClose,
} from "react-icons/md"

function formatDate(raw) {
  if (!raw) return "—"
  const [y, m, d] = String(raw).slice(0, 10).split("-").map(Number)
  if (!y || !m || !d) return String(raw)
  return new Date(y, m - 1, d).toLocaleDateString("en-PH", {
    month: "long", day: "numeric", year: "numeric",
  })
}

function groupByMonth(items) {
  return items.reduce((acc, item) => {
    const raw = item.appointment_date || item.date || ""
    const [y, m] = raw.slice(0, 7).split("-")
    if (!y || !m) { acc["Other"] = [...(acc["Other"] || []), item]; return acc }
    const key = new Date(Number(y), Number(m) - 1).toLocaleDateString("en-PH", { month: "long", year: "numeric" })
    acc[key] = [...(acc[key] || []), item]
    return acc
  }, {})
}

// ── Visit Card ────────────────────────────────────────────────────────────────
const VisitCard = ({ visit }) => {
  const [expanded, setExpanded] = useState(false)
  const Icon = visit.type === "derma" ? MdFace : MdMedicalServices

  let prescriptions = []
  try {
    if (visit.prescription) {
      prescriptions = typeof visit.prescription === "string"
        ? JSON.parse(visit.prescription)
        : visit.prescription
      if (!Array.isArray(prescriptions)) prescriptions = []
    }
  } catch { prescriptions = [] }

  const isCancelled = visit.status === "cancelled"
  const hasDetails  = visit.diagnosis || visit.consultation_notes || prescriptions.length > 0

  return (
    <div className={`bg-white rounded-2xl border overflow-hidden transition-all
      ${isCancelled ? "border-red-100 opacity-70" : "border-slate-200 shadow-sm"}`}>

      {/* Main row */}
      <div className="flex items-start gap-3 p-4">
        {/* Icon */}
        <div className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 mt-0.5
          ${visit.type === "derma" ? "bg-emerald-50" : "bg-slate-100"}`}>
          <Icon className={`text-[18px] ${visit.type === "derma" ? "text-emerald-600" : "text-slate-500"}`} />
        </div>

        {/* Info */}
        <div className="flex-1 min-w-0">
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0">
              <p className="text-sm font-bold text-slate-800 truncate">
                {visit.doctor || visit.doctor_name}
              </p>
              <p className="text-xs text-slate-400 mt-0.5 truncate">
                {visit.specialty || (visit.type === "derma" ? "Dermatology" : "General Medicine")}
              </p>
            </div>
            <span className={`text-[10px] font-bold border px-2 py-0.5 rounded-full shrink-0
              ${isCancelled
                ? "bg-red-50 text-red-500 border-red-200"
                : "bg-slate-100 text-slate-500 border-slate-200"}`}>
              {isCancelled ? "Cancelled" : "Completed"}
            </span>
          </div>

          {/* Date/time row */}
          <div className="flex items-center gap-3 mt-2 text-[11px] text-slate-400 font-medium flex-wrap">
            <span className="flex items-center gap-1">
              <MdCalendarToday className="text-[11px]" />
              {formatDate(visit.appointment_date || visit.date)}
            </span>
            <span className="flex items-center gap-1">
              <MdAccessTime className="text-[11px]" />
              {visit.appointment_time || visit.time || "—"}
            </span>
          </div>

          {/* Reason */}
          {visit.reason && (
            <p className="text-xs text-slate-500 mt-1.5 bg-slate-50 rounded-lg px-2.5 py-1.5 inline-block">
              {visit.reason}
            </p>
          )}
        </div>
      </div>

      {/* Diagnosis summary (collapsed preview) */}
      {!isCancelled && visit.diagnosis && !expanded && (
        <div className="px-4 pb-3">
          <p className="text-xs font-semibold text-slate-700 truncate">
            Dx: <span className="font-normal text-slate-600">{visit.diagnosis}</span>
          </p>
        </div>
      )}

      {/* Expanded details */}
      {expanded && !isCancelled && hasDetails && (
        <div className="px-4 pb-4 space-y-3 border-t border-slate-100 pt-3">
          {/* Diagnosis */}
          {visit.diagnosis && (
            <div>
              <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-1">Diagnosis</p>
              <p className="text-sm text-slate-800 bg-slate-50 rounded-xl px-3 py-2 leading-relaxed">
                {visit.diagnosis}
              </p>
            </div>
          )}

          {/* Notes */}
          {visit.consultation_notes && (
            <div>
              <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-1 flex items-center gap-1">
                <MdNotes className="text-[11px]" /> Clinical Notes
              </p>
              <p className="text-sm text-slate-600 bg-slate-50 rounded-xl px-3 py-2 leading-relaxed">
                {visit.consultation_notes}
              </p>
            </div>
          )}

          {/* Prescriptions */}
          {prescriptions.length > 0 && (
            <div>
              <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-2 flex items-center gap-1">
                <MdLocalPharmacy className="text-[11px]" /> Prescriptions
              </p>
              <div className="space-y-2">
                {prescriptions.map((rx, i) => (
                  <div key={i} className="bg-violet-50 border border-violet-100 rounded-xl px-3 py-2.5">
                    <p className="text-sm font-bold text-violet-800">{rx.medicine}</p>
                    <div className="flex flex-wrap gap-x-3 gap-y-0.5 mt-0.5 text-xs text-violet-600">
                      {rx.dosage    && <span>Dosage: {rx.dosage}</span>}
                      {rx.frequency && <span>Sig: {rx.frequency}</span>}
                      {rx.duration  && <span>For: {rx.duration}</span>}
                    </div>
                    {rx.notes && <p className="text-[11px] text-violet-500 mt-0.5 italic">{rx.notes}</p>}
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Expand toggle */}
      {!isCancelled && hasDetails && (
        <button onClick={() => setExpanded(!expanded)}
          className="w-full flex items-center justify-center gap-1 py-2.5 text-[11px] font-bold text-slate-400
            hover:text-slate-600 hover:bg-slate-50 border-t border-slate-100 transition-colors">
          {expanded
            ? <><MdExpandLess className="text-[14px]" /> Show less</>
            : <><MdExpandMore className="text-[14px]" /> View details</>}
        </button>
      )}
    </div>
  )
}

// ── Main ──────────────────────────────────────────────────────────────────────
const History = () => {
  const [history, setHistory] = useState([])
  const [loading, setLoading] = useState(true)
  const [search,  setSearch]  = useState("")

  useEffect(() => {
    getMyHistory()
      .then(data => setHistory(Array.isArray(data) ? data : []))
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [])

  const filtered = history.filter(h => {
    const q = search.toLowerCase()
    return (
      (h.doctor || h.doctor_name || "").toLowerCase().includes(q) ||
      (h.reason || "").toLowerCase().includes(q) ||
      (h.diagnosis || "").toLowerCase().includes(q)
    )
  })

  const grouped  = groupByMonth(filtered)
  const months   = Object.keys(grouped)
  const completed = history.filter(h => h.status !== "cancelled").length
  const cancelled = history.filter(h => h.status === "cancelled").length

  return (
    <div className="max-w-3xl mx-auto space-y-5">

      {/* Header */}
      <div>
        <h1 className="text-xl lg:text-2xl font-bold text-slate-800 flex items-center gap-2">
          <MdHistory className="text-slate-400 text-[22px]" /> Appointment History
        </h1>
        <p className="text-xs lg:text-sm text-slate-400 mt-0.5">
          {history.length} total visits
        </p>
      </div>

      {/* Stats */}
      {!loading && history.length > 0 && (
        <div className="grid grid-cols-2 gap-3">
          <div className="bg-white border border-slate-200 rounded-2xl p-4 text-center shadow-sm">
            <p className="text-3xl font-black text-emerald-600">{completed}</p>
            <p className="text-xs text-slate-400 font-medium mt-0.5">Completed</p>
          </div>
          <div className="bg-white border border-slate-200 rounded-2xl p-4 text-center shadow-sm">
            <p className="text-3xl font-black text-red-400">{cancelled}</p>
            <p className="text-xs text-slate-400 font-medium mt-0.5">Cancelled</p>
          </div>
        </div>
      )}

      {/* Search */}
      {history.length > 0 && (
        <div className="relative">
          <MdSearch className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400 text-[18px]" />
          <input
            type="text"
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Search by doctor, reason, or diagnosis…"
            className="w-full pl-10 pr-10 py-3 bg-white border border-slate-200 rounded-2xl text-sm
              focus:outline-none focus:border-emerald-400 focus:ring-2 focus:ring-emerald-400/10 transition-all"
          />
          {search && (
            <button onClick={() => setSearch("")}
              className="absolute right-3.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600">
              <MdClose className="text-[16px]" />
            </button>
          )}
        </div>
      )}

      {/* Content */}
      {loading ? (
        <div className="flex items-center justify-center py-20">
          <div className="w-8 h-8 border-2 border-slate-200 border-t-emerald-500 rounded-full animate-spin" />
        </div>
      ) : history.length === 0 ? (
        <div className="flex flex-col items-center py-20 text-center bg-white rounded-2xl border border-slate-200">
          <div className="w-16 h-16 rounded-2xl bg-slate-50 flex items-center justify-center mb-4">
            <MdHistory className="text-[28px] text-slate-300" />
          </div>
          <p className="text-sm font-bold text-slate-600 mb-1">No history yet</p>
          <p className="text-xs text-slate-400">Your completed appointments will appear here.</p>
        </div>
      ) : filtered.length === 0 ? (
        <div className="flex flex-col items-center py-16 text-center bg-white rounded-2xl border border-slate-200">
          <MdSearch className="text-[28px] text-slate-300 mb-2" />
          <p className="text-sm font-bold text-slate-600">No results for "{search}"</p>
        </div>
      ) : (
        /* Timeline grouped by month */
        <div className="space-y-6">
          {months.map(month => (
            <div key={month}>
              {/* Month divider */}
              <div className="flex items-center gap-3 mb-3">
                <div className="h-px flex-1 bg-slate-200" />
                <span className="text-[11px] font-bold text-slate-400 uppercase tracking-widest whitespace-nowrap">
                  {month}
                </span>
                <div className="h-px flex-1 bg-slate-200" />
              </div>

              {/* Visit cards */}
              <div className="space-y-3">
                {grouped[month].map((visit, i) => (
                  <VisitCard key={visit.id || i} visit={visit} />
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

export default History