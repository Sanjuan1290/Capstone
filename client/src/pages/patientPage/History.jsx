// client/src/pages/patientPage/History.jsx
// FIX 1: Detail modal now shows consultation notes (was missing).
// FIX 2: Status badge shows actual status (Completed vs Cancelled).
// FIX 3: Cancelled appointments also show in history (already returned by backend).
// FIX 4: a.id.toLowerCase() crash — id is a number; use String(a.id).
// FIX 5: Null-safety on a.reason in search filter.

import { useEffect, useState } from 'react'
import { getMyHistory } from '../../services/patient.service'
import {
  MdCalendarToday, MdAccessTime, MdFace, MdSearch,
  MdMedicalServices, MdClose, MdPerson, MdNotes,
  MdLocalHospital, MdHistory, MdCancel
} from "react-icons/md"

const CLINIC_FILTERS = [
  { key: "all",     label: "All Clinics"      },
  { key: "medical", label: "General Medicine" },
  { key: "derma",   label: "Dermatology"      },
]

const STATUS_CFG = {
  completed: { label: "Completed", badge: "bg-slate-100  text-slate-500   border-slate-200" },
  cancelled: { label: "Cancelled", badge: "bg-red-50     text-red-500     border-red-200"   },
}

// Group by year (handles both Date objects and string dates)
function groupByYear(list) {
  return list.reduce((acc, appt) => {
    const dateObj = appt.rawDate ? new Date(appt.rawDate) : new Date(appt.date)
    const year = dateObj.getFullYear()
    if (!acc[year]) acc[year] = []
    acc[year].push(appt)
    return acc
  }, {})
}

// ── Detail Modal ──────────────────────────────────────────────────────────────
const DetailModal = ({ appt, onClose }) => {
  if (!appt) return null
  const Icon    = appt.type === "derma" ? MdFace : MdMedicalServices
  const stsCfg  = STATUS_CFG[appt.status] || STATUS_CFG.completed

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
          {/* FIX 2: Show actual status, not hardcoded "Completed" */}
          <span className={`text-[11px] font-bold border px-2.5 py-0.5 rounded-full shrink-0 ${stsCfg.badge}`}>
            {stsCfg.label}
          </span>
          <button onClick={onClose}
            className="w-8 h-8 flex items-center justify-center rounded-xl hover:bg-slate-100 text-slate-400 transition-colors shrink-0">
            <MdClose className="text-[18px]" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-6 py-5 space-y-4">
          <span className="text-[11px] font-mono font-semibold text-slate-400 bg-slate-100 px-2 py-0.5 rounded-md inline-block">
            #{appt.id}
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
            </div>
          </div>

          {/* Reason */}
          {appt.reason && (
            <div className="bg-slate-50 rounded-2xl p-4 space-y-2">
              <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Reason for Visit</p>
              <p className="text-sm font-semibold text-slate-800">{appt.reason}</p>
            </div>
          )}

          {/* Outcome — only shown for completed appointments */}
          {appt.status === 'completed' && (
            <div className="bg-slate-50 rounded-2xl p-4 space-y-3">
              <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Outcome</p>

              {/* Diagnosis */}
              <div>
                <p className="text-[11px] text-slate-400 flex items-center gap-1 mb-0.5">
                  <MdLocalHospital className="text-[11px]" /> Diagnosis
                </p>
                <p className="text-sm font-semibold text-slate-800">
                  {appt.diagnosis || "No diagnosis recorded."}
                </p>
              </div>

              {/* FIX 1: Show consultation notes */}
              <div>
                <p className="text-[11px] text-slate-400 flex items-center gap-1 mb-0.5">
                  <MdNotes className="text-[11px]" /> Doctor's Notes
                </p>
                <p className="text-sm text-slate-700 leading-relaxed">
                  {appt.consultation_notes || appt.notes || "No notes recorded."}
                </p>
              </div>
            </div>
          )}

          {/* Cancelled notice */}
          {appt.status === 'cancelled' && (
            <div className="bg-red-50 border border-red-100 rounded-2xl p-4 flex items-start gap-3">
              <MdCancel className="text-red-400 text-[18px] shrink-0 mt-0.5" />
              <div>
                <p className="text-sm font-semibold text-red-700">This appointment was cancelled.</p>
                {appt.notes && (
                  <p className="text-xs text-red-500 mt-1">{appt.notes}</p>
                )}
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
  const [history, setHistory] = useState([])
  const [loading, setLoading] = useState(true)
  const [search,  setSearch]  = useState("")
  const [clinic,  setClinic]  = useState("all")
  const [modal,   setModal]   = useState(null)

  useEffect(() => {
    getMyHistory()
      .then(data => setHistory(Array.isArray(data) ? data : []))
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [])

  const filtered = history.filter(a => {
    const matchClinic = clinic === "all" || a.type === clinic
    // FIX 4 & 5: String() on id (number), null-safe reason
    const matchSearch = !search ||
      (a.doctor  || '').toLowerCase().includes(search.toLowerCase()) ||
      (a.reason  || '').toLowerCase().includes(search.toLowerCase()) ||
      String(a.id).includes(search) ||
      (a.diagnosis || '').toLowerCase().includes(search.toLowerCase())
    return matchClinic && matchSearch
  })

  const grouped = groupByYear(filtered)
  const years   = Object.keys(grouped).sort((a, b) => b - a)

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center py-20 text-slate-400">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-slate-300 mb-4"></div>
        <p className="text-sm font-medium">Loading visit history...</p>
      </div>
    )
  }

  return (
    <div className="max-w-5xl space-y-5">
      {/* Page header */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-800">Visit History</h1>
          <p className="text-sm text-slate-500 mt-0.5">A complete record of your past clinic visits.</p>
        </div>
        <div className="shrink-0 bg-slate-100 border border-slate-200 rounded-xl px-4 py-2 text-center">
          <p className="text-2xl font-black text-slate-700">{history.length}</p>
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
              {key === "derma"   && <MdFace            className="text-[12px]" />}
              {key === "medical" && <MdMedicalServices  className="text-[12px]" />}
              {label}
            </button>
          ))}
        </div>
      </div>

      {/* Table */}
      <div className="bg-white border border-slate-200 rounded-2xl overflow-hidden">
        <div className="grid grid-cols-[2fr_1fr_1fr_1fr_100px] gap-4 px-5 py-3 bg-slate-50 border-b border-slate-100">
          {["Visit", "Date & Time", "Clinic", "Diagnosis", ""].map((h, i) => (
            <p key={i} className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">{h}</p>
          ))}
        </div>

        {filtered.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 text-center px-6">
            <MdHistory className="text-[22px] text-slate-300 mb-3" />
            <p className="text-sm font-semibold text-slate-500">No records found</p>
          </div>
        ) : (
          years.map(year => (
            <div key={year}>
              <div className="px-5 py-2 bg-slate-50 border-y border-slate-100 sticky top-0 z-10">
                <p className="text-[11px] font-bold text-slate-400 uppercase tracking-widest">{year}</p>
              </div>

              <div className="divide-y divide-slate-100">
                {grouped[year].map(appt => {
                  const Icon    = appt.type === "derma" ? MdFace : MdMedicalServices
                  const stsCfg  = STATUS_CFG[appt.status] || STATUS_CFG.completed
                  return (
                    <div key={appt.id}
                      className="grid grid-cols-[2fr_1fr_1fr_1fr_100px] gap-4 px-5 py-4 items-center hover:bg-slate-50/70 transition-colors">
                      <div className="flex items-center gap-3 min-w-0">
                        <div className={`w-9 h-9 rounded-xl flex items-center justify-center shrink-0
                          ${appt.type === "derma" ? "bg-emerald-50" : "bg-slate-100"}`}>
                          <Icon className={`text-[16px] ${appt.type === "derma" ? "text-emerald-600" : "text-slate-500"}`} />
                        </div>
                        <div className="min-w-0">
                          <p className="text-sm font-bold text-slate-800 truncate">{appt.doctor}</p>
                          <div className="flex items-center gap-1.5 mt-0.5">
                            <p className="text-xs text-slate-500 truncate">{appt.reason || "—"}</p>
                            {/* Status badge on the row */}
                            <span className={`text-[9px] font-bold border px-1.5 py-0.5 rounded-full shrink-0 ${stsCfg.badge}`}>
                              {stsCfg.label}
                            </span>
                          </div>
                        </div>
                      </div>
                      <div>
                        <p className="text-xs font-semibold text-slate-700 flex items-center gap-1">
                          <MdCalendarToday className="text-[11px] text-slate-400" /> {appt.date}
                        </p>
                        <p className="text-xs text-slate-400 flex items-center gap-1 mt-1">
                          <MdAccessTime className="text-[11px]" /> {appt.time}
                        </p>
                      </div>
                      <div>
                        <p className="text-xs font-semibold text-slate-700">{appt.clinic}</p>
                      </div>
                      <p className="text-xs text-slate-600 leading-relaxed line-clamp-2">
                        {appt.status === 'cancelled'
                          ? <span className="text-red-400 italic">Cancelled</span>
                          : appt.diagnosis || <span className="text-slate-300 italic">—</span>
                        }
                      </p>
                      <button
                        onClick={() => setModal(appt)}
                        className="flex items-center justify-center text-[11px] font-bold text-slate-600 border border-slate-200 hover:bg-slate-50 px-3 py-1.5 rounded-lg transition-all w-full"
                      >
                        Details
                      </button>
                    </div>
                  )
                })}
              </div>
            </div>
          ))
        )}

        <div className="px-5 py-3 border-t border-slate-100">
          <p className="text-[11px] text-slate-400 font-medium">
            Showing {filtered.length} of {history.length} records
          </p>
        </div>
      </div>

      {modal && <DetailModal appt={modal} onClose={() => setModal(null)} />}
    </div>
  )
}

export default History