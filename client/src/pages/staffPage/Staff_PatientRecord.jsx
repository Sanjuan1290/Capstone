import { useState } from "react"
import {
  MdSearch, MdClose, MdChevronRight, MdPerson,
  MdCalendarToday, MdPhone, MdHome, MdFace,
  MdMedicalServices, MdAccessTime, MdArrowBack,
  MdHistory, MdEventAvailable
} from "react-icons/md"

// ── Mock Data ─────────────────────────────────────────────────────────────────
const patients = [
  {
    id: "PAT-001", name: "Maria Cruz",       age: 28, sex: "Female",
    birthdate: "March 12, 1997", phone: "09171234567",
    address: "123 Masaya St., Quezon City", email: "maria.cruz@gmail.com",
    civilStatus: "Single", totalVisits: 5, lastVisit: "February 14, 2026",
    history: [
      { id: "APT-003", type: "derma", doctor: "Dr. Maria Santos", date: "Feb 14, 2026", time: "9:00 AM", reason: "Skin Assessment", diagnosis: "Mild acne vulgaris." },
      { id: "APT-006", type: "derma", doctor: "Dr. Maria Santos", date: "Dec 10, 2025", time: "10:30 AM", reason: "Initial Skin Consultation", diagnosis: "Acne vulgaris with hyperpigmentation." },
    ],
    upcoming: [
      { id: "APT-001", type: "derma", doctor: "Dr. Maria Santos", date: "March 23, 2026", time: "9:00 AM", reason: "Acne Treatment Follow-up", status: "confirmed" },
    ],
  },
  {
    id: "PAT-002", name: "Jose Dela Cruz",   age: 45, sex: "Male",
    birthdate: "July 4, 1980", phone: "09281234567",
    address: "456 Kalayaan Ave., Quezon City", email: "jose.dc@yahoo.com",
    civilStatus: "Married", totalVisits: 3, lastVisit: "January 28, 2026",
    history: [
      { id: "APT-004", type: "medical", doctor: "Dr. Ana Villanueva", date: "Jan 28, 2026", time: "11:00 AM", reason: "Follow-up Visit", diagnosis: "Hypertension Stage 1." },
    ],
    upcoming: [
      { id: "APT-002", type: "medical", doctor: "Dr. Jose Reyes", date: "March 23, 2026", time: "9:30 AM", reason: "Annual Check-up", status: "confirmed" },
    ],
  },
  {
    id: "PAT-003", name: "Ana Villanueva",   age: 33, sex: "Female",
    birthdate: "November 20, 1991", phone: "09351234567",
    address: "789 Mabini Rd., Quezon City", email: "ana.v@gmail.com",
    civilStatus: "Single", totalVisits: 1, lastVisit: "—",
    history: [],
    upcoming: [
      { id: "APT-003", type: "derma", doctor: "Dr. Carlo Lim", date: "March 23, 2026", time: "10:00 AM", reason: "Skin Brightening Consultation", status: "pending" },
    ],
  },
  {
    id: "PAT-004", name: "Carlo Santos",     age: 52, sex: "Male",
    birthdate: "August 8, 1973", phone: "09161234567",
    address: "321 Quezon Ave., Quezon City", email: "carlo.santos@gmail.com",
    civilStatus: "Married", totalVisits: 8, lastVisit: "November 5, 2025",
    history: [
      { id: "APT-007", type: "medical", doctor: "Dr. Jose Reyes", date: "Nov 5, 2025", time: "8:30 AM", reason: "Annual Physical Exam", diagnosis: "Generally healthy. Mild hypertension." },
    ],
    upcoming: [
      { id: "APT-004", type: "medical", doctor: "Dr. Jose Reyes", date: "March 23, 2026", time: "10:30 AM", reason: "Fever and Cough", status: "confirmed" },
    ],
  },
  {
    id: "PAT-005", name: "Rosa Reyes",       age: 24, sex: "Female",
    birthdate: "May 30, 2001", phone: "09491234567",
    address: "654 España Blvd., Quezon City", email: "rosa.reyes@gmail.com",
    civilStatus: "Single", totalVisits: 1, lastVisit: "—",
    history: [],
    upcoming: [
      { id: "APT-005", type: "derma", doctor: "Dr. Maria Santos", date: "March 24, 2026", time: "11:00 AM", reason: "Initial Skin Assessment", status: "pending" },
    ],
  },
]

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
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="flex items-center gap-3 px-6 py-5 border-b border-slate-100 shrink-0">
        <button onClick={onClose}
          className="w-8 h-8 flex items-center justify-center rounded-xl hover:bg-slate-100 text-slate-400 transition-colors lg:hidden">
          <MdArrowBack className="text-[18px]" />
        </button>
        <div className="w-10 h-10 rounded-xl bg-[#0b1a2c] flex items-center justify-center text-sky-400 font-bold text-sm shrink-0">
          {patient.name.split(" ").map(n => n[0]).join("").slice(0,2)}
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-bold text-slate-800 truncate">{patient.name}</p>
          <p className="text-xs text-slate-500 font-mono">{patient.id}</p>
        </div>
        <div className="text-right shrink-0">
          <p className="text-xs font-semibold text-slate-600">{patient.age} yrs · {patient.sex}</p>
          <p className="text-[11px] text-slate-400">{patient.totalVisits} total visits</p>
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
                { icon: MdPerson,        label: "Civil Status", value: patient.civilStatus  },
                { icon: MdPhone,         label: "Phone",        value: patient.phone        },
                { icon: MdHome,          label: "Address",      value: patient.address      },
              ].map(({ icon: Icon, label, value }) => (
                <div key={label} className="flex items-start gap-3">
                  <div className="w-7 h-7 rounded-lg bg-white border border-slate-200 flex items-center justify-center shrink-0 mt-0.5">
                    <Icon className="text-[13px] text-slate-400" />
                  </div>
                  <div>
                    <p className="text-[10px] text-slate-400 font-medium">{label}</p>
                    <p className="text-sm font-semibold text-slate-800">{value}</p>
                  </div>
                </div>
              ))}
            </div>
            <div className="bg-slate-50 rounded-2xl p-4 space-y-3">
              <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Visit Summary</p>
              <div className="grid grid-cols-2 gap-3">
                <div className="bg-white border border-slate-200 rounded-xl p-3 text-center">
                  <p className="text-2xl font-black text-slate-800">{patient.totalVisits}</p>
                  <p className="text-[11px] text-slate-400 font-medium">Total Visits</p>
                </div>
                <div className="bg-white border border-slate-200 rounded-xl p-3 text-center">
                  <p className="text-xs font-bold text-slate-800 mt-1">{patient.lastVisit}</p>
                  <p className="text-[11px] text-slate-400 font-medium">Last Visit</p>
                </div>
              </div>
            </div>
          </>
        )}

        {tab === "history" && (
          <>
            {patient.history.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-10 text-center">
                <div className="w-12 h-12 rounded-2xl bg-slate-100 flex items-center justify-center mb-3">
                  <MdHistory className="text-[22px] text-slate-300" />
                </div>
                <p className="text-sm font-semibold text-slate-500">No visit history yet</p>
              </div>
            ) : patient.history.map(h => {
              const Icon = h.type === "derma" ? MdFace : MdMedicalServices
              return (
                <div key={h.id} className="bg-slate-50 rounded-2xl p-4">
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
          </>
        )}

        {tab === "upcoming" && (
          <>
            {patient.upcoming.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-10 text-center">
                <div className="w-12 h-12 rounded-2xl bg-slate-100 flex items-center justify-center mb-3">
                  <MdEventAvailable className="text-[22px] text-slate-300" />
                </div>
                <p className="text-sm font-semibold text-slate-500">No upcoming appointments</p>
              </div>
            ) : patient.upcoming.map(u => {
              const cfg  = STATUS_CONFIG[u.status]
              const Icon = u.type === "derma" ? MdFace : MdMedicalServices
              return (
                <div key={u.id} className="bg-slate-50 rounded-2xl p-4">
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
          </>
        )}
      </div>
    </div>
  )
}

// ── Patient Row ───────────────────────────────────────────────────────────────
const PatientRow = ({ patient, isSelected, onSelect }) => (
  <button
    onClick={() => onSelect(patient)}
    className={`w-full flex items-center gap-4 px-5 py-4 border-l-[3px] text-left transition-all duration-150
      ${isSelected ? "border-l-sky-400 bg-slate-50" : "border-l-transparent hover:bg-slate-50/70"}`}
  >
    <div className="w-9 h-9 rounded-xl bg-[#0b1a2c] flex items-center justify-center text-sky-400 font-bold text-xs shrink-0">
      {patient.name.split(" ").map(n => n[0]).join("").slice(0,2)}
    </div>
    <div className="flex-1 min-w-0">
      <p className="text-sm font-bold text-slate-800 truncate">{patient.name}</p>
      <p className="text-xs text-slate-500">{patient.age} yrs · {patient.sex} · {patient.phone}</p>
      <p className="text-[11px] text-slate-400 mt-0.5">Last visit: {patient.lastVisit}</p>
    </div>
    <div className="flex flex-col items-end gap-1.5 shrink-0">
      <span className="text-[10px] font-mono font-semibold text-slate-400">{patient.id}</span>
      <span className="text-[10px] font-semibold text-slate-400">{patient.totalVisits} visits</span>
      <MdChevronRight className={`text-[16px] transition-colors ${isSelected ? "text-slate-500" : "text-slate-300"}`} />
    </div>
  </button>
)

// ── Main ──────────────────────────────────────────────────────────────────────
const Staff_PatientRecord = () => {
  const [search,   setSearch]   = useState("")
  const [selected, setSelected] = useState(patients[0])

  const filtered = patients.filter(p =>
    !search ||
    p.name.toLowerCase().includes(search.toLowerCase()) ||
    p.id.toLowerCase().includes(search.toLowerCase()) ||
    p.phone.includes(search)
  )

  return (
    <div className="max-w-5xl space-y-5">
      <div>
        <h1 className="text-2xl font-bold text-slate-800">Patient Records</h1>
        <p className="text-sm text-slate-500 mt-0.5">Search and view patient profiles, history, and appointments.</p>
      </div>

      <div className="bg-white border border-slate-200 rounded-2xl overflow-hidden flex" style={{ minHeight: "600px" }}>
        {/* List */}
        <div className="flex flex-col border-r border-slate-100 w-full lg:w-[380px] shrink-0">
          <div className="px-4 pt-4 pb-3 border-b border-slate-100">
            <div className="flex items-center gap-2 bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 focus-within:border-slate-300 transition-colors">
              <MdSearch className="text-slate-400 text-[15px] shrink-0" />
              <input type="text" value={search} onChange={e => setSearch(e.target.value)}
                placeholder="Search name, ID, phone…"
                className="text-sm text-slate-700 placeholder-slate-300 bg-transparent outline-none w-full" />
              {search && (
                <button onClick={() => setSearch("")} className="text-slate-300 hover:text-slate-500 transition-colors">
                  <MdClose className="text-[13px]" />
                </button>
              )}
            </div>
          </div>

          <div className="flex-1 overflow-y-auto divide-y divide-slate-100">
            {filtered.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-16 text-center px-6">
                <div className="w-12 h-12 rounded-2xl bg-slate-100 flex items-center justify-center mb-3">
                  <MdPerson className="text-[22px] text-slate-300" />
                </div>
                <p className="text-sm font-semibold text-slate-500">No patients found</p>
              </div>
            ) : filtered.map(p => (
              <PatientRow key={p.id} patient={p}
                isSelected={selected?.id === p.id} onSelect={setSelected} />
            ))}
          </div>

          <div className="px-5 py-3 border-t border-slate-100 shrink-0">
            <p className="text-[11px] text-slate-400 font-medium">
              {filtered.length} of {patients.length} patients
            </p>
          </div>
        </div>

        {/* Detail */}
        <div className="hidden lg:flex flex-col flex-1 min-w-0">
          {selected ? (
            <DetailPanel patient={selected} onClose={() => setSelected(null)} />
          ) : (
            <div className="flex flex-col items-center justify-center flex-1 text-center px-8">
              <div className="w-14 h-14 rounded-2xl bg-slate-100 flex items-center justify-center mb-3">
                <MdPerson className="text-[24px] text-slate-300" />
              </div>
              <p className="text-sm font-semibold text-slate-500">Select a patient</p>
              <p className="text-xs text-slate-400 mt-1">Click any row to view their full profile.</p>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

export default Staff_PatientRecord