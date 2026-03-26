import { useEffect, useState } from 'react'
import { 
  getAppointments, 
  confirmAppointment, 
  cancelAppointment 
} from '../../services/admin.service'
import {
  MdSearch, MdClose, MdFace, MdMedicalServices,
  MdChevronRight, MdCalendarToday, MdAccessTime,
  MdArrowBack, MdCheck, MdCancel, MdRefresh
} from "react-icons/md"

const STATUS_CFG = {
  confirmed:     { label: "Confirmed",   badge: "bg-emerald-50 text-emerald-700 border-emerald-200", row: "border-l-emerald-400"   },
  pending:       { label: "Pending",     badge: "bg-amber-50   text-amber-700   border-amber-200",   row: "border-l-amber-400"     },
  "in-progress": { label: "In Progress", badge: "bg-violet-50  text-violet-700  border-violet-200",  row: "border-l-violet-400"    },
  completed:     { label: "Completed",   badge: "bg-slate-100  text-slate-500   border-slate-200",   row: "border-l-slate-300"     },
  cancelled:     { label: "Cancelled",   badge: "bg-red-50     text-red-500     border-red-200",     row: "border-l-red-300"       },
}

const TABS = [
  { key: "all", label: "All" }, { key: "pending", label: "Pending" }, { key: "confirmed", label: "Confirmed" },
  { key: "in-progress", label: "In Progress" }, { key: "completed", label: "Completed" }, { key: "cancelled", label: "Cancelled" },
]

const DetailPanel = ({ appt, onClose, onConfirm, onCancel }) => {
  if (!appt) return null
  const cfg = STATUS_CFG[appt.status] || STATUS_CFG.pending
  const Icon = appt.type === "derma" ? MdFace : MdMedicalServices

  return (
    <div className="flex flex-col h-full animate-in fade-in slide-in-from-right-4 duration-300">
      <div className="flex items-center gap-3 px-6 py-5 border-b border-slate-100 shrink-0">
        <button onClick={onClose} className="w-8 h-8 flex items-center justify-center rounded-xl hover:bg-slate-100 text-slate-400 lg:hidden">
          <MdArrowBack className="text-[18px]" />
        </button>
        <div className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 ${appt.type === "derma" ? "bg-emerald-50" : "bg-slate-100"}`}>
          <Icon className={`text-[18px] ${appt.type === "derma" ? "text-emerald-600" : "text-slate-500"}`} />
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-bold text-slate-800 truncate">{appt.patient_name || appt.patient}</p>
          <p className="text-xs text-slate-500">{appt.clinic || 'General Clinic'} · <span className="font-mono">{appt.id}</span></p>
        </div>
        <span className={`text-[11px] font-bold border px-2.5 py-0.5 rounded-full shrink-0 ${cfg.badge}`}>{cfg.label}</span>
      </div>

      <div className="flex-1 overflow-y-auto px-6 py-5 space-y-4">
        <div className="bg-slate-50 rounded-2xl p-4 space-y-3">
          <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Patient</p>
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-[#0b1a2c] flex items-center justify-center text-amber-400 font-bold text-xs shrink-0">
              {(appt.patient_name || "P").split(" ").map(n => n[0]).join("").slice(0, 2)}
            </div>
            <div>
              <p className="text-sm font-bold text-slate-800">{appt.patient_name || appt.patient}</p>
              <p className="text-xs text-slate-500 font-mono">{appt.patientId || 'N/A'}</p>
            </div>
          </div>
        </div>

        <div className="bg-slate-50 rounded-2xl p-4 space-y-3">
          <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Schedule</p>
          <div className="grid grid-cols-2 gap-3">
            {[
              { icon: MdCalendarToday, l: "Date", v: appt.date },
              { icon: MdAccessTime, l: "Time", v: appt.time },
              { icon: MdAccessTime, l: "Duration", v: appt.duration || '30 min' }
            ].map(({ icon: I, l, v }) => (
              <div key={l}>
                <p className="text-[11px] text-slate-400 flex items-center gap-1 mb-0.5"><I className="text-[11px]" />{l}</p>
                <p className="text-sm font-semibold text-slate-800">{v}</p>
              </div>
            ))}
          </div>
        </div>

        <div className="bg-slate-50 rounded-2xl p-4 space-y-3">
          <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Doctor</p>
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-[#0b1a2c] flex items-center justify-center text-emerald-400 font-bold text-xs shrink-0">
              {(appt.doctor_name || "D").split(" ").filter(n => n !== "Dr.").map(n => n[0]).join("")}
            </div>
            <div>
              <p className="text-sm font-bold text-slate-800">{appt.doctor_name || appt.doctor}</p>
              <p className="text-xs text-slate-500">{appt.specialty || 'Physician'}</p>
            </div>
          </div>
        </div>

        <div className="bg-slate-50 rounded-2xl p-4 space-y-2">
          <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Visit Info</p>
          <div><p className="text-[11px] text-slate-400 mb-0.5">Reason</p><p className="text-sm font-semibold text-slate-800">{appt.reason}</p></div>
        </div>
      </div>

      {(appt.status === "pending" || appt.status === "confirmed") && (
        <div className="px-6 pb-6 pt-4 border-t border-slate-100 space-y-2 shrink-0">
          {appt.status === "pending" && (
            <button 
              onClick={() => onConfirm(appt.id)}
              className="w-full flex items-center justify-center gap-2 py-2.5 text-xs font-bold text-white bg-emerald-500 hover:bg-emerald-600 rounded-xl transition-colors shadow-sm active:scale-[0.98]"
            >
              <MdCheck className="text-[14px]" /> Confirm Appointment
            </button>
          )}
          <button className="w-full flex items-center justify-center gap-2 py-2.5 text-xs font-bold text-slate-600 border border-slate-200 hover:bg-slate-50 rounded-xl transition-colors">
            <MdRefresh className="text-[14px]" /> Reschedule
          </button>
          <button 
            onClick={() => onCancel(appt.id)}
            className="w-full flex items-center justify-center gap-2 py-2.5 text-xs font-bold text-red-500 bg-red-50 border border-red-200 hover:bg-red-100 rounded-xl transition-colors active:scale-[0.98]"
          >
            <MdCancel className="text-[14px]" /> Cancel Appointment
          </button>
        </div>
      )}
    </div>
  )
}

const Admin_Appointments = () => {
  const [data, setData] = useState([])
  const [loading, setLoading] = useState(true)
  const [tab, setTab] = useState("all")
  const [search, setSearch] = useState("")
  const [selected, setSelected] = useState(null)

  useEffect(() => {
    getAppointments()
      .then(rows => { 
        setData(rows)
        if (rows.length > 0) setSelected(rows[0])
      })
      .catch(err => console.error("Fetch error:", err))
      .finally(() => setLoading(false))
  }, [])

  const handleConfirm = async (id) => {
    try {
      await confirmAppointment(id)
      setData(prev => prev.map(a => a.id === id ? { ...a, status: 'confirmed' } : a))
      setSelected(s => s?.id === id ? { ...s, status: 'confirmed' } : s)
    } catch (err) { alert("Failed to confirm appointment.") }
  }

  const handleCancel = async (id) => {
    if (!window.confirm('Are you sure you want to cancel this appointment?')) return
    try {
      await cancelAppointment(id)
      setData(prev => prev.map(a => a.id === id ? { ...a, status: 'cancelled' } : a))
      setSelected(s => s?.id === id ? { ...s, status: 'cancelled' } : s)
    } catch (err) { alert("Failed to cancel appointment.") }
  }

  const counts = TABS.reduce((a, t) => ({
    ...a,
    [t.key]: t.key === "all" ? data.length : data.filter(x => x.status === t.key).length
  }), {})

  const filtered = data.filter(a => {
    const patientName = a.patient_name || a.patient || ""
    const doctorName = a.doctor_name || a.doctor || ""
    const matchTab = tab === "all" || a.status === tab
    const matchSearch = !search || 
      patientName.toLowerCase().includes(search.toLowerCase()) || 
      a.id.toString().toLowerCase().includes(search.toLowerCase()) || 
      doctorName.toLowerCase().includes(search.toLowerCase())
    return matchTab && matchSearch
  })

  return (
    <div className="max-w-5xl space-y-5">
      <div>
        <h1 className="text-2xl font-bold text-slate-800">Appointments</h1>
        <p className="text-sm text-slate-500 mt-0.5">Manage and track clinic schedules across all departments.</p>
      </div>

      <div className="bg-white border border-slate-200 rounded-2xl overflow-hidden flex shadow-sm" style={{ minHeight: "600px" }}>
        {/* Left List Section */}
        <div className={`flex flex-col border-r border-slate-100 w-full lg:w-[440px] shrink-0 ${selected ? 'hidden lg:flex' : 'flex'}`}>
          <div className="px-4 pt-4 pb-3 border-b border-slate-100 space-y-3 bg-white sticky top-0 z-10">
            <div className="flex items-center gap-2 bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 focus-within:border-amber-400 transition-colors">
              <MdSearch className="text-slate-400 text-[15px] shrink-0" />
              <input type="text" value={search} onChange={e => setSearch(e.target.value)} placeholder="Search patient, doctor, ID…"
                className="text-sm text-slate-700 placeholder-slate-300 bg-transparent outline-none w-full" />
              {search && <button onClick={() => setSearch("")} className="text-slate-300 hover:text-slate-500"><MdClose className="text-[13px]" /></button>}
            </div>
            <div className="flex gap-0.5 overflow-x-auto pb-0.5 no-scrollbar">
              {TABS.map(({ key, label }) => (
                <button key={key} onClick={() => setTab(key)}
                  className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[11px] font-bold whitespace-nowrap transition-all
                    ${tab === key ? "bg-[#0b1a2c] text-amber-400" : "text-slate-500 hover:bg-slate-100"}`}>
                  {label}
                  <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded-full
                    ${tab === key ? "bg-white/10 text-amber-300" : "bg-slate-100 text-slate-400"}`}>{counts[key]}</span>
                </button>
              ))}
            </div>
          </div>

          <div className="flex-1 overflow-y-auto divide-y divide-slate-100">
            {loading ? (
              <div className="flex justify-center py-20 text-slate-400 text-sm">Loading appointments...</div>
            ) : filtered.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-20 text-center px-6">
                <MdCalendarToday className="text-[40px] text-slate-200 mb-2" />
                <p className="text-sm font-medium text-slate-500">No appointments found</p>
              </div>
            ) : filtered.map(appt => {
              const cfg = STATUS_CFG[appt.status] || STATUS_CFG.pending
              const Icon = appt.type === "derma" ? MdFace : MdMedicalServices
              return (
                <button key={appt.id} onClick={() => setSelected(appt)}
                  className={`w-full flex items-center gap-4 px-5 py-4 border-l-[3px] text-left transition-all
                    ${selected?.id === appt.id ? `${cfg.row} bg-slate-50` : "border-l-transparent hover:bg-slate-50/70"}`}>
                  <div className={`w-9 h-9 rounded-xl flex items-center justify-center shrink-0 ${appt.type === "derma" ? "bg-emerald-50" : "bg-slate-100"}`}>
                    <Icon className={`text-[16px] ${appt.type === "derma" ? "text-emerald-600" : "text-slate-500"}`} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-0.5 flex-wrap">
                      <p className="text-sm font-bold text-slate-800 truncate">{appt.patient_name || appt.patient}</p>
                      <span className={`text-[10px] font-bold border px-2 py-0.5 rounded-full whitespace-nowrap ${cfg.badge}`}>{cfg.label}</span>
                    </div>
                    <p className="text-xs text-slate-500 truncate">{appt.doctor_name || appt.doctor} · {appt.reason}</p>
                    <div className="flex items-center gap-3 mt-1 text-[11px] text-slate-400">
                      <span className="flex items-center gap-1"><MdCalendarToday className="text-[11px]" />{appt.date}</span>
                      <span className="flex items-center gap-1"><MdAccessTime className="text-[11px]" />{appt.time}</span>
                    </div>
                  </div>
                  <MdChevronRight className={`text-[16px] shrink-0 ${selected?.id === appt.id ? "text-slate-500" : "text-slate-300"}`} />
                </button>
              )
            })}
          </div>
          <div className="px-5 py-3 border-t border-slate-100 bg-slate-50/50">
            <p className="text-[11px] text-slate-400 font-medium">Showing {filtered.length} of {data.length} appointments</p>
          </div>
        </div>

        {/* Right Detail Section */}
        <div className={`flex flex-col flex-1 min-w-0 bg-white ${!selected ? 'hidden lg:flex' : 'flex'}`}>
          {selected ? (
            <DetailPanel 
              appt={selected} 
              onClose={() => setSelected(null)} 
              onConfirm={handleConfirm}
              onCancel={handleCancel}
            />
          ) : (
            <div className="flex flex-col items-center justify-center flex-1 text-center px-8">
              <div className="w-14 h-14 rounded-3xl bg-slate-50 border border-slate-100 flex items-center justify-center mb-4">
                <MdCalendarToday className="text-[24px] text-slate-300" />
              </div>
              <p className="text-sm font-bold text-slate-700">Select an appointment</p>
              <p className="text-xs text-slate-400 mt-1">Choose a schedule from the list to view full details and manage the booking.</p>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

export default Admin_Appointments