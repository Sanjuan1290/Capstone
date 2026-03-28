// client/src/pages/staffPage/Staff_PatientRecord.jsx
import { useEffect, useState } from 'react'
import { getPatients, getPatientRecord } from '../../services/staff.service'
import {
  MdSearch, MdClose, MdChevronRight, MdPerson,
  MdCalendarToday, MdPhone, MdHome, MdFace,
  MdMedicalServices, MdAccessTime, MdArrowBack,
  MdHistory, MdEventAvailable
} from "react-icons/md"

const STATUS_CONFIG = {
  confirmed: { label: "Confirmed", badge: "bg-emerald-50 text-emerald-700 border-emerald-200" },
  pending:   { label: "Pending",   badge: "bg-amber-50   text-amber-700   border-amber-200"   },
  cancelled: { label: "Cancelled", badge: "bg-red-50     text-red-500     border-red-200"     },
  completed: { label: "Completed", badge: "bg-slate-100  text-slate-500   border-slate-200"   },
}

// ── Detail Panel ──────────────────────────────────────────────────────────────
const DetailPanel = ({ patient, onClose }) => {
  if (!patient) return null
  const [tab, setTab] = useState("info")

  return (
    <div className="flex flex-col h-full animate-in fade-in slide-in-from-right-4 duration-300">
      {/* Header */}
      <div className="flex items-center gap-3 px-6 py-5 border-b border-slate-100 shrink-0">
        <button onClick={onClose}
          className="w-8 h-8 flex items-center justify-center rounded-xl hover:bg-slate-100 text-slate-400 transition-colors lg:hidden">
          <MdArrowBack className="text-[18px]" />
        </button>
        <div className="w-10 h-10 rounded-xl bg-[#0b1a2c] flex items-center justify-center text-sky-400 font-bold text-sm shrink-0 uppercase">
          {patient.name?.split(" ").map(n => n[0]).join("").slice(0, 2)}
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-bold text-slate-800 truncate">{patient.name}</p>
          <p className="text-xs text-slate-500 font-mono">{patient.id}</p>
        </div>
        <div className="text-right shrink-0">
          <p className="text-xs font-semibold text-slate-600">{patient.age} yrs · {patient.sex}</p>
          <p className="text-[11px] text-slate-400">{patient.totalVisits || 0} total visits</p>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-0.5 px-6 pt-4 pb-0">
        {[{ key: "info", label: "Profile" }, { key: "history", label: "Visit History" }, { key: "upcoming", label: "Upcoming" }].map(t => (
          <button key={t.key} onClick={() => setTab(t.key)}
            className={`px-3 py-1.5 rounded-lg text-[11px] font-bold transition-all
              ${tab === t.key ? "bg-[#0b1a2c] text-sky-400" : "text-slate-500 hover:bg-slate-100 hover:text-slate-700"}`}>
            {t.label}
          </button>
        ))}
      </div>

      {/* Body */}
      <div className="flex-1 overflow-y-auto px-6 py-4 space-y-4">
        {tab === "info" && (
          <>
            <div className="bg-slate-50 rounded-2xl p-4 space-y-3">
              <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Personal Info</p>
              {[
                { icon: MdCalendarToday, label: "Birthdate",    value: patient.birthdate    },
                { icon: MdPerson,         label: "Civil Status", value: patient.civilStatus  },
                { icon: MdPhone,          label: "Phone",        value: patient.phone        },
                { icon: MdHome,           label: "Address",      value: patient.address      },
              ].map(({ icon: Icon, label, value }) => (
                <div key={label} className="flex items-start gap-3">
                   <div className="w-7 h-7 rounded-lg bg-white border border-slate-200 flex items-center justify-center shrink-0 mt-0.5">
                    <Icon className="text-[13px] text-slate-400" />
                  </div>
                  <div>
                    <p className="text-[10px] text-slate-400 font-medium">{label}</p>
                    <p className="text-sm font-semibold text-slate-800">{value || "—"}</p>
                  </div>
                </div>
              ))}
            </div>
            <div className="bg-slate-50 rounded-2xl p-4 space-y-3">
              <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Visit Summary</p>
              <div className="grid grid-cols-2 gap-3">
                <div className="bg-white border border-slate-200 rounded-xl p-3 text-center">
                  <p className="text-2xl font-black text-slate-800">{patient.totalVisits || 0}</p>
                  <p className="text-[11px] text-slate-400 font-medium">Total Visits</p>
                </div>
                <div className="bg-white border border-slate-200 rounded-xl p-3 text-center">
                  <p className="text-xs font-bold text-slate-800 mt-1">{patient.lastVisit || "—"}</p>
                  <p className="text-[11px] text-slate-400 font-medium">Last Visit</p>
                </div>
              </div>
            </div>
          </>
        )}

        {tab === "history" && (
          <div className="space-y-3">
            {!patient.history || patient.history.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-10 text-center">
                <div className="w-12 h-12 rounded-2xl bg-slate-100 flex items-center justify-center mb-3">
                  <MdHistory className="text-[22px] text-slate-300" />
                </div>
                <p className="text-sm font-semibold text-slate-500">No visit history yet</p>
              </div>
            ) : patient.history.map(h => {
              const Icon = h.type === "derma" ? MdFace : MdMedicalServices
              return (
                <div key={h.id} className="bg-slate-50 rounded-2xl p-4 border border-transparent hover:border-slate-200 transition-colors">
                  <div className="flex items-center gap-3 mb-3">
                    <div className={`w-8 h-8 rounded-xl flex items-center justify-center shrink-0
                      ${h.type === "derma" ? "bg-emerald-50" : "bg-slate-100"}`}>
                      <Icon className={`text-[15px] ${h.type === "derma" ? "text-emerald-600" : "text-slate-500"}`} />
                    </div>
                    <div className="flex-1">
                      <p className="text-sm font-bold text-slate-800">{h.reason}</p>
                      <p className="text-xs text-slate-500">{h.doctor}</p>
                    </div>
                    <span className="text-[10px] font-mono text-slate-400">{h.id}</span>
                  </div>
                  <div className="flex items-center gap-3 text-[11px] text-slate-400 font-medium mb-2">
                    <span className="flex items-center gap-1"><MdCalendarToday className="text-[11px]" /> {h.date}</span>
                    <span className="flex items-center gap-1"><MdAccessTime className="text-[11px]" /> {h.time}</span>
                  </div>
                  {h.diagnosis && (
                    <div className="border-t border-slate-200 pt-2 mt-2">
                      <p className="text-[10px] text-slate-400 font-medium mb-0.5">Diagnosis</p>
                      <p className="text-xs font-semibold text-slate-700">{h.diagnosis}</p>
                     </div>
                  )}
                </div>
              )
            })}
          </div>
        )}

        {tab === "upcoming" && (
          <div className="space-y-3">
            {!patient.upcoming || patient.upcoming.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-10 text-center">
                <div className="w-12 h-12 rounded-2xl bg-slate-100 flex items-center justify-center mb-3">
                  <MdEventAvailable className="text-[22px] text-slate-300" />
                </div>
                <p className="text-sm font-semibold text-slate-500">No upcoming appointments</p>
              </div>
            ) : patient.upcoming.map(u => {
              const cfg  = STATUS_CONFIG[u.status] || STATUS_CONFIG.pending
              const Icon = u.type === "derma" ? MdFace : MdMedicalServices
              return (
                <div key={u.id} className="bg-slate-50 rounded-2xl p-4 border border-transparent hover:border-slate-200 transition-colors">
                  <div className="flex items-center gap-3 mb-2">
                    <div className={`w-8 h-8 rounded-xl flex items-center justify-center shrink-0
                      ${u.type === "derma" ? "bg-emerald-50" : "bg-slate-100"}`}>
                      <Icon className={`text-[15px] ${u.type === "derma" ? "text-emerald-600" : "text-slate-500"}`} />
                    </div>
                    <div className="flex-1">
                      <p className="text-sm font-bold text-slate-800">{u.reason}</p>
                      <p className="text-xs text-slate-500">{u.doctor}</p>
                    </div>
                    <span className={`text-[10px] font-bold border px-2 py-0.5 rounded-full ${cfg.badge}`}>
                      {cfg.label}
                    </span>
                  </div>
                  <div className="flex items-center gap-3 text-[11px] text-slate-400 font-medium">
                    <span className="flex items-center gap-1"><MdCalendarToday className="text-[11px]" /> {u.date}</span>
                    <span className="flex items-center gap-1"><MdAccessTime className="text-[11px]" /> {u.time}</span>
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}

// ── Patient Row ───────────────────────────────────────────────────────────────
const PatientRow = ({ patient, isSelected, onSelect }) => (
  <button
    onClick={() => onSelect(patient.id)}
    className={`w-full flex items-center gap-4 px-5 py-4 border-l-[3px] text-left transition-all duration-150
      ${isSelected ? "border-l-sky-400 bg-slate-50" : "border-l-transparent hover:bg-slate-50/70"}`}
  >
    <div className="w-9 h-9 rounded-xl bg-[#0b1a2c] flex items-center justify-center text-sky-400 font-bold text-xs shrink-0 uppercase">
      {patient.name?.split(" ").map(n => n[0]).join("").slice(0, 2)}
    </div>
    <div className="flex-1 min-w-0">
      <p className="text-sm font-bold text-slate-800 truncate">{patient.name}</p>
      <p className="text-xs text-slate-500">{patient.age} yrs · {patient.sex} · {patient.phone}</p>
      <p className="text-[11px] text-slate-400 mt-0.5">Last visit: {patient.lastVisit || 'None'}</p>
    </div>
    <div className="flex flex-col items-end gap-1.5 shrink-0">
      <span className="text-[10px] font-mono font-semibold text-slate-400">{patient.id}</span>
      <span className="text-[10px] font-semibold text-slate-400">{patient.totalVisits || 0} visits</span>
      <MdChevronRight className={`text-[16px] transition-colors ${isSelected ? "text-slate-500" : "text-slate-300"}`} />
    </div>
  </button>
)

// ── Main ──────────────────────────────────────────────────────────────────────
const Staff_PatientRecord = () => {
  const [patients, setPatients] = useState([])
  const [selectedPatient, setSelectedPatient] = useState(null)
  const [search, setSearch] = useState('')
  const [loading, setLoading] = useState(false)

  // Fetch patient list on mount + search (debounced)
  useEffect(() => {
    const t = setTimeout(() => {
      setLoading(true)
      getPatients(search)
        .then(data => setPatients(Array.isArray(data) ? data : [])) // FIXED
        .catch(err => console.error("Search error:", err))
        .finally(() => setLoading(false))
    }, 300)
    return () => clearTimeout(t)
  }, [search])

  const handleSelectPatient = async (id) => {
    try {
      const record = await getPatientRecord(id)
      setSelectedPatient(record)
    } catch (err) {
      console.error("Error fetching record:", err)
    }
  }

  return (
    <div className="max-w-5xl space-y-5">
      <div>
        <h1 className="text-2xl font-bold text-slate-800">Patient Appointment History</h1>
        <p className="text-sm text-slate-500 mt-0.5">Search and view patient profiles, history, and appointments.</p>
      </div>

      <div className="bg-white border border-slate-200 rounded-2xl overflow-hidden flex shadow-sm" style={{ minHeight: "600px" }}>
        {/* List Sidebar */}
        <div className="flex flex-col border-r border-slate-100 w-full lg:w-[380px] shrink-0">
          <div className="px-4 pt-4 pb-3 border-b border-slate-100">
            <div className="flex items-center gap-2 bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 focus-within:border-sky-400 focus-within:bg-white transition-all">
              <MdSearch className="text-slate-400 text-[15px] shrink-0" />
              <input 
                type="text" 
                value={search} 
                onChange={e => setSearch(e.target.value)}
                placeholder="Search name, ID, phone…"
                className="text-sm text-slate-700 placeholder-slate-300 bg-transparent outline-none w-full" 
              />
              {search && (
                <button onClick={() => setSearch("")} className="text-slate-300 hover:text-slate-500 transition-colors">
                  <MdClose className="text-[13px]" />
                </button>
              )}
            </div>
          </div>

          <div className="flex-1 overflow-y-auto divide-y divide-slate-100 relative">
            {loading && (
              <div className="absolute inset-x-0 top-0 h-1 bg-sky-100 overflow-hidden">
                <div className="w-full h-full bg-sky-400 animate-progress origin-left"></div>
              </div>
            )}
            
            {patients.length === 0 && !loading ? (
              <div className="flex flex-col items-center justify-center py-16 text-center px-6">
                <div className="w-12 h-12 rounded-2xl bg-slate-100 flex items-center justify-center mb-3">
                  <MdPerson className="text-[22px] text-slate-300" />
                </div>
                <p className="text-sm font-semibold text-slate-500">No patients found</p>
              </div>
            ) : (
              patients.map(p => (
                <PatientRow 
                  key={p.id} 
                  patient={p}
                  isSelected={selectedPatient?.id === p.id} 
                  onSelect={handleSelectPatient} 
                />
              ))
            )}
          </div>

          <div className="px-5 py-3 border-t border-slate-100 shrink-0 bg-slate-50/50">
            <p className="text-[11px] text-slate-400 font-medium">
              Showing {patients.length} results
            </p>
          </div>
        </div>

        {/* Detail Panel */}
        <div className="hidden lg:flex flex-col flex-1 min-w-0 bg-white">
          {selectedPatient ? (
            <DetailPanel patient={selectedPatient} onClose={() => setSelectedPatient(null)} />
          ) : (
            <div className="flex flex-col items-center justify-center flex-1 text-center px-8">
              <div className="w-14 h-14 rounded-2xl bg-slate-100 flex items-center justify-center mb-3">
                <MdPerson className="text-[24px] text-slate-300" />
              </div>
              <p className="text-sm font-semibold text-slate-500">Select a patient</p>
              <p className="text-xs text-slate-400 mt-1">Click any patient on the left to view their clinical record.</p>
            </div>
           )}
        </div>
      </div>
    </div>
  )
}

export default Staff_PatientRecord