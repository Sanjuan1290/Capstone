import { useEffect, useState } from 'react'
import { getAppointments, confirmAppointment, cancelAppointment } from '../../services/staff.service'
import {
  MdSearch, MdClose, MdCheck, MdCancel, MdRefresh,
  MdChevronRight, MdCalendarToday, MdAccessTime,
  MdFace, MdMedicalServices, MdPerson, MdNotes,
  MdLocalHospital, MdAdd, MdArrowBack, MdEventAvailable
} from "react-icons/md"

const STATUS_CONFIG = {
  confirmed: { label: "Confirmed", badge: "bg-emerald-50 text-emerald-700 border-emerald-200", row: "border-l-emerald-400" },
  pending:   { label: "Pending",   badge: "bg-amber-50   text-amber-700   border-amber-200",   row: "border-l-amber-400"   },
  cancelled: { label: "Cancelled", badge: "bg-red-50     text-red-500     border-red-200",     row: "border-l-red-300"     },
  completed: { label: "Completed", badge: "bg-slate-100  text-slate-500   border-slate-200",   row: "border-l-slate-300"   },
}

const TABS = [
  { key: "all",       label: "All"       },
  { key: "pending",   label: "Pending"   },
  { key: "confirmed", label: "Confirmed" },
  { key: "cancelled", label: "Cancelled" },
]

// ── Detail Panel ──────────────────────────────────────────────────────────────
const DetailPanel = ({ appt, onClose, onConfirm, onCancel }) => {
  if (!appt) return null
  const cfg  = STATUS_CONFIG[appt.status] || STATUS_CONFIG.pending
  const Icon = appt.type === "derma" ? MdFace : MdMedicalServices
  const isActive = appt.status === "confirmed" || appt.status === "pending"

  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center gap-3 px-6 py-5 border-b border-slate-100 shrink-0">
        <button onClick={onClose}
          className="w-8 h-8 flex items-center justify-center rounded-xl hover:bg-slate-100 text-slate-400 transition-colors shrink-0 lg:hidden">
          <MdArrowBack className="text-[18px]" />
        </button>
        <div className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0
          ${appt.type === "derma" ? "bg-emerald-50" : "bg-slate-100"}`}>
          <Icon className={`text-[18px] ${appt.type === "derma" ? "text-emerald-600" : "text-slate-500"}`} />
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-bold text-slate-800 truncate">{appt.patient}</p>
          <p className="text-xs text-slate-500">{appt.clinic} · {appt.id}</p>
        </div>
        <span className={`text-[11px] font-bold border px-2.5 py-0.5 rounded-full shrink-0 ${cfg.badge}`}>
          {cfg.label}
        </span>
      </div>

      <div className="flex-1 overflow-y-auto px-6 py-5 space-y-5">
        {/* Patient info */}
        <div className="bg-slate-50 rounded-2xl p-4 space-y-3">
          <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Patient</p>
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-[#0b1a2c] flex items-center justify-center text-sky-400 font-bold text-xs shrink-0">
              {appt.patient?.split(" ").map(n => n[0]).join("").slice(0,2) || 'PT'}
            </div>
            <div>
              <p className="text-sm font-bold text-slate-800">{appt.patient}</p>
              <p className="text-xs text-slate-500 font-mono">{appt.patientId || 'N/A'}</p>
            </div>
          </div>
        </div>

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

        {/* Doctor */}
        <div className="bg-slate-50 rounded-2xl p-4 space-y-3">
          <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Doctor</p>
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-[#0b1a2c] flex items-center justify-center text-emerald-400 font-bold text-xs shrink-0">
               {appt.doctor?.split(" ").slice(-1)[0][0] || 'DR'}
            </div>
            <div>
              <p className="text-sm font-bold text-slate-800">{appt.doctor}</p>
              <p className="text-xs text-slate-500">{appt.specialty || 'Medical Specialist'}</p>
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
              <p className="text-[11px] text-slate-400 flex items-center gap-1 mb-0.5"><MdNotes className="text-[11px]" /> Notes</p>
              <p className="text-sm text-slate-700 leading-relaxed">{appt.notes}</p>
            </div>
          )}
        </div>
      </div>

      {/* Actions */}
      {isActive && (
        <div className="px-6 pb-6 pt-4 border-t border-slate-100 shrink-0 space-y-2">
          {appt.status === "pending" && (
            <button onClick={() => onConfirm(appt.id)}
              className="w-full flex items-center justify-center gap-2 py-2.5 text-xs font-bold
                text-white bg-emerald-500 hover:bg-emerald-600 rounded-xl transition-colors">
              <MdCheck className="text-[14px]" /> Confirm Appointment
            </button>
          )}
          <button
            className="w-full flex items-center justify-center gap-2 py-2.5 text-xs font-bold
              text-slate-600 border border-slate-200 hover:bg-slate-50 rounded-xl transition-colors">
            <MdRefresh className="text-[14px]" /> Reschedule
          </button>
          <button onClick={() => onCancel(appt.id)}
            className="w-full flex items-center justify-center gap-2 py-2.5 text-xs font-bold
              text-red-500 border border-red-200 bg-red-50 hover:bg-red-100 rounded-xl transition-colors">
            <MdCancel className="text-[14px]" /> Cancel Appointment
          </button>
        </div>
      )}
    </div>
  )
}

// ── Row ───────────────────────────────────────────────────────────────────────
const AppointmentRow = ({ appt, isSelected, onSelect }) => {
  const cfg  = STATUS_CONFIG[appt.status] || STATUS_CONFIG.pending
  const Icon = appt.type === "derma" ? MdFace : MdMedicalServices
  return (
    <button
      onClick={() => onSelect(appt)}
      className={`w-full flex items-center gap-4 px-5 py-4 border-l-[3px] text-left transition-all duration-150
        ${isSelected ? `${cfg.row} bg-slate-50` : "border-l-transparent hover:bg-slate-50/70"}`}
    >
      <div className={`w-9 h-9 rounded-xl flex items-center justify-center shrink-0
        ${appt.type === "derma" ? "bg-emerald-50" : "bg-slate-100"}`}>
        <Icon className={`text-[16px] ${appt.type === "derma" ? "text-emerald-600" : "text-slate-500"}`} />
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 mb-0.5 flex-wrap">
          <p className="text-sm font-bold text-slate-800 truncate">{appt.patient}</p>
          <span className={`text-[10px] font-bold border px-2 py-0.5 rounded-full whitespace-nowrap ${cfg.badge}`}>
            {cfg.label}
          </span>
        </div>
        <p className="text-xs text-slate-500 truncate">{appt.doctor} · {appt.reason}</p>
        <div className="flex items-center gap-3 mt-1.5 text-[11px] text-slate-400 font-medium">
          <span className="flex items-center gap-1"><MdCalendarToday className="text-[11px]" /> {appt.date}</span>
          <span className="flex items-center gap-1"><MdAccessTime className="text-[11px]" /> {appt.time}</span>
        </div>
      </div>
      <div className="flex flex-col items-end gap-2 shrink-0">
        <span className="text-[10px] font-mono font-semibold text-slate-400">{appt.id}</span>
        <MdChevronRight className={`text-[16px] transition-colors ${isSelected ? "text-slate-500" : "text-slate-300"}`} />
      </div>
    </button>
  )
}

// ── Main ──────────────────────────────────────────────────────────────────────
const Staff_Appointments = () => {
  const [data,       setData]       = useState([])
  const [loading,    setLoading]    = useState(true)
  const [activeTab,  setActiveTab]  = useState("all")
  const [search,     setSearch]     = useState("")
  const [selected,   setSelected]   = useState(null)

  useEffect(() => {
    getAppointments()
      .then(rows => {
        setData(rows)
        if (rows.length > 0) setSelected(rows[0])
      })
      .catch((err) => console.error("Fetch error:", err))
      .finally(() => setLoading(false))
  }, [])

  const handleConfirm = async (id) => {
    try {
      await confirmAppointment(id)
      const update = (prev) => prev.map(a => a.id === id ? { ...a, status: 'confirmed' } : a)
      setData(update)
      setSelected(s => s?.id === id ? { ...s, status: 'confirmed' } : s)
    } catch (err) {
      alert("Failed to confirm appointment.")
    }
  }

  const handleCancel = async (id) => {
    if (!confirm('Cancel this appointment?')) return
    try {
      await cancelAppointment(id)
      const update = (prev) => prev.map(a => a.id === id ? { ...a, status: 'cancelled' } : a)
      setData(update)
      setSelected(s => s?.id === id ? { ...s, status: 'cancelled' } : s)
    } catch (err) {
      alert("Failed to cancel appointment.")
    }
  }

  const counts = TABS.reduce((acc, t) => {
    acc[t.key] = t.key === "all" ? data.length : data.filter(a => a.status === t.key).length
    return acc
  }, {})

  const filtered = data.filter(a => {
    const matchTab    = activeTab === "all" || a.status === activeTab
    const matchSearch = !search ||
      a.patient.toLowerCase().includes(search.toLowerCase()) ||
      a.doctor.toLowerCase().includes(search.toLowerCase()) ||
      a.id.toLowerCase().includes(search.toLowerCase())
    return matchTab && matchSearch
  })

  if (loading) {
    return (
      <div className="h-96 flex items-center justify-center">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-[#0b1a2c]"></div>
      </div>
    )
  }

  return (
    <div className="max-w-5xl space-y-5">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-800">Appointments</h1>
          <p className="text-sm text-slate-500 mt-0.5">Confirm, reschedule, or cancel patient appointments.</p>
        </div>
        <button className="flex items-center gap-1.5 bg-[#0b1a2c] hover:bg-[#122236] text-white
          text-xs font-semibold px-4 py-2.5 rounded-xl transition-colors shrink-0">
          <MdAdd className="text-[15px]" /> New Appointment
        </button>
      </div>

      <div className="bg-white border border-slate-200 rounded-2xl overflow-hidden flex shadow-sm" style={{ minHeight: "600px" }}>
        {/* List */}
        <div className="flex flex-col border-r border-slate-100 w-full lg:w-[440px] shrink-0">
          <div className="px-4 pt-4 pb-3 border-b border-slate-100 space-y-3">
            <div className="flex items-center gap-2 bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 focus-within:border-slate-300 transition-colors">
              <MdSearch className="text-slate-400 text-[15px] shrink-0" />
              <input type="text" value={search} onChange={e => setSearch(e.target.value)}
                placeholder="Search patient, doctor, ID…"
                className="text-sm text-slate-700 placeholder-slate-300 bg-transparent outline-none w-full" />
              {search && (
                <button onClick={() => setSearch("")} className="text-slate-300 hover:text-slate-500 transition-colors">
                  <MdClose className="text-[13px]" />
                </button>
              )}
            </div>
            <div className="flex gap-0.5 overflow-x-auto pb-0.5 scrollbar-hide">
              {TABS.map(({ key, label }) => (
                <button key={key} onClick={() => setActiveTab(key)}
                  className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[11px] font-bold whitespace-nowrap transition-all duration-150
                    ${activeTab === key ? "bg-[#0b1a2c] text-sky-400" : "text-slate-500 hover:bg-slate-100 hover:text-slate-700"}`}>
                  {label}
                  <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded-full
                    ${activeTab === key ? "bg-white/10 text-sky-300" : "bg-slate-100 text-slate-400"}`}>
                    {counts[key]}
                  </span>
                </button>
              ))}
            </div>
          </div>
          <div className="flex-1 overflow-y-auto divide-y divide-slate-100">
            {filtered.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-16 text-center px-6">
                <div className="w-12 h-12 rounded-2xl bg-slate-100 flex items-center justify-center mb-3">
                  <MdEventAvailable className="text-[22px] text-slate-300" />
                </div>
                <p className="text-sm font-semibold text-slate-500">No appointments found</p>
              </div>
            ) : filtered.map(appt => (
              <AppointmentRow key={appt.id} appt={appt}
                isSelected={selected?.id === appt.id} onSelect={setSelected} />
            ))}
          </div>
        </div>

        {/* Detail */}
        <div className="hidden lg:flex flex-col flex-1 min-w-0">
          {selected ? (
            <DetailPanel appt={selected} onClose={() => setSelected(null)}
              onConfirm={handleConfirm} onCancel={handleCancel} />
          ) : (
            <div className="flex flex-col items-center justify-center flex-1 text-center px-8">
              <div className="w-14 h-14 rounded-2xl bg-slate-100 flex items-center justify-center mb-3">
                <MdEventAvailable className="text-[24px] text-slate-300" />
              </div>
              <p className="text-sm font-semibold text-slate-500">Select an appointment</p>
              <p className="text-xs text-slate-400 mt-1">Click any row to see details and actions.</p>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

export default Staff_Appointments