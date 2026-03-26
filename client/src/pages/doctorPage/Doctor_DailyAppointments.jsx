import { useEffect, useState } from 'react'
import { useNavigate, NavLink } from 'react-router-dom'
import { getDailyAppointments, startConsultation } from '../../services/doctor.service'
import {
  MdCalendarToday, MdAccessTime, MdFace, MdMedicalServices,
  MdChevronRight, MdPerson, MdNotes, MdLocalHospital,
  MdArrowBack, MdCheck, MdHistory
} from "react-icons/md"

const STATUS_CONFIG = {
  "completed":    { label: "Done",         badge: "bg-slate-100  text-slate-500  border-slate-200",  row: "border-l-slate-300"   },
  "in-progress":  { label: "In Progress", badge: "bg-violet-50  text-violet-700 border-violet-200", row: "border-l-violet-400"  },
  "pending":      { label: "Waiting",      badge: "bg-amber-50   text-amber-700  border-amber-200",  row: "border-l-amber-300"   },
  "confirmed":    { label: "Confirmed",    badge: "bg-emerald-50 text-emerald-700 border-emerald-200", row: "border-l-emerald-400" },
}

// ── Detail Panel ──────────────────────────────────────────────────────────────
const DetailPanel = ({ appt, onClose, onStart }) => {
  if (!appt) return null
  const cfg  = STATUS_CONFIG[appt.status] || STATUS_CONFIG.pending
  const Icon = appt.type === "derma" ? MdFace : MdMedicalServices

  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center gap-3 px-6 py-5 border-b border-slate-100 shrink-0">
        <button onClick={onClose}
          className="w-8 h-8 flex items-center justify-center rounded-xl hover:bg-slate-100 text-slate-400 transition-colors lg:hidden">
          <MdArrowBack className="text-[18px]" />
        </button>
        <div className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0
          ${appt.type === "derma" ? "bg-emerald-50" : "bg-slate-100"}`}>
          <Icon className={`text-[18px] ${appt.type === "derma" ? "text-emerald-600" : "text-slate-500"}`} />
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-bold text-slate-800 truncate">{appt.patient_name || appt.patient}</p>
          <p className="text-xs text-slate-500 font-mono">{appt.patient_id || 'N/A'} · {appt.id}</p>
        </div>
        <span className={`text-[11px] font-bold border px-2.5 py-0.5 rounded-full shrink-0 ${cfg.badge}`}>
          {cfg.label}
        </span>
      </div>

      <div className="flex-1 overflow-y-auto px-6 py-5 space-y-4">
        <div className="bg-slate-50 rounded-2xl p-4 space-y-3">
          <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Schedule</p>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <p className="text-[11px] text-slate-400 flex items-center gap-1 mb-0.5"><MdAccessTime className="text-[11px]" /> Time</p>
              <p className="text-sm font-semibold text-slate-800">{appt.time}</p>
            </div>
            <div>
              <p className="text-[11px] text-slate-400 flex items-center gap-1 mb-0.5"><MdCalendarToday className="text-[11px]" /> Duration</p>
              <p className="text-sm font-semibold text-slate-800">{appt.duration || '30 min'}</p>
            </div>
          </div>
        </div>

        <div className="bg-slate-50 rounded-2xl p-4 space-y-3">
          <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Visit Info</p>
          <div>
            <p className="text-[11px] text-slate-400 flex items-center gap-1 mb-0.5"><MdPerson className="text-[11px]" /> Reason</p>
            <p className="text-sm font-semibold text-slate-800">{appt.reason}</p>
          </div>
          {appt.notes && (
            <div>
              <p className="text-[11px] text-slate-400 flex items-center gap-1 mb-0.5"><MdNotes className="text-[11px]" /> Pre-visit Notes</p>
              <p className="text-sm text-slate-700 leading-relaxed">{appt.notes}</p>
            </div>
          )}
        </div>
      </div>

      <div className="px-6 pb-6 pt-4 border-t border-slate-100 shrink-0 space-y-2">
        {appt.status === "in-progress" ? (
          <button onClick={() => onStart(appt)}
            className="w-full flex items-center justify-center gap-2 py-2.5 text-xs font-bold
              text-white bg-violet-600 hover:bg-violet-700 rounded-xl transition-colors">
            <MdMedicalServices className="text-[14px]" /> Resume Consultation
          </button>
        ) : appt.status === "completed" ? (
          <div className="flex items-center justify-center gap-2 py-2.5 text-xs font-semibold text-slate-400">
            <MdCheck className="text-[14px] text-emerald-500" /> Consultation completed
          </div>
        ) : (
          <button onClick={() => onStart(appt)}
            className="w-full flex items-center justify-center gap-2 py-2.5 text-xs font-bold
              text-white bg-[#0b1a2c] hover:bg-[#122236] rounded-xl transition-colors">
            <MdCheck className="text-[14px]" /> Start Consultation
          </button>
        )}
      </div>
    </div>
  )
}

// ── Row ───────────────────────────────────────────────────────────────────────
const AppointmentRow = ({ appt, isSelected, onSelect }) => {
  const cfg  = STATUS_CONFIG[appt.status] || STATUS_CONFIG.pending
  const Icon = appt.type === "derma" ? MdFace : MdMedicalServices
  return (
    <button onClick={() => onSelect(appt)}
      className={`w-full flex items-center gap-4 px-5 py-4 border-l-[3px] text-left transition-all duration-150
        ${isSelected ? `${cfg.row} bg-slate-50` : "border-l-transparent hover:bg-slate-50/70"}`}>
      <div className={`w-9 h-9 rounded-xl flex items-center justify-center shrink-0
        ${appt.type === "derma" ? "bg-emerald-50" : "bg-slate-100"}`}>
        <Icon className={`text-[16px] ${appt.type === "derma" ? "text-emerald-600" : "text-slate-500"}`} />
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 mb-0.5">
          <p className="text-sm font-bold text-slate-800 truncate">{appt.patient_name || appt.patient}</p>
          <span className={`text-[10px] font-bold border px-2 py-0.5 rounded-full whitespace-nowrap ${cfg.badge}`}>
            {cfg.label}
          </span>
        </div>
        <p className="text-xs text-slate-500 truncate">{appt.reason}</p>
        <span className="text-[11px] text-slate-400 font-medium flex items-center gap-1 mt-1">
          <MdAccessTime className="text-[11px]" /> {appt.time}
        </span>
      </div>
      <MdChevronRight className={`text-[16px] transition-colors shrink-0 ${isSelected ? "text-slate-500" : "text-slate-300"}`} />
    </button>
  )
}

// ── Main ──────────────────────────────────────────────────────────────────────
const Doctor_DailyAppointments = () => {
  const navigate = useNavigate()
  const [appointments, setAppointments] = useState([])
  const [selected, setSelected] = useState(null)
  const [loading, setLoading] = useState(true)
  const today = new Date().toISOString().split('T')[0]

  useEffect(() => {
    getDailyAppointments(today)
      .then(data => {
        setAppointments(data)
        if (data.length > 0) setSelected(data[0])
      })
      .catch((err) => console.error("Fetch error:", err))
      .finally(() => setLoading(false))
  }, [today])

  const handleStart = async (appt) => {
    try {
      // Only call start service if it's not already in progress
      if (appt.status !== 'in-progress') {
        await startConsultation(appt.id)
        setAppointments(prev =>
          prev.map(a => a.id === appt.id ? { ...a, status: 'in-progress' } : a)
        )
      }
      navigate('/doctor/consultation', { state: { appointment: appt } })
    } catch (err) {
      console.error("Failed to start consultation", err)
    }
  }

  const done = appointments.filter(a => a.status === "completed").length
  const inProgressCount = appointments.filter(a => a.status === "in-progress").length

  if (loading) return <div className="p-10 text-center text-slate-500">Loading schedule...</div>

  return (
    <div className="max-w-5xl space-y-5">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-800">Daily Appointments</h1>
          <p className="text-sm text-slate-500 mt-0.5">
            {new Date().toLocaleDateString("en-PH", { weekday: "long", month: "long", day: "numeric", year: "numeric" })}
          </p>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <div className="text-right">
            <p className="text-xs text-slate-500">{done}/{appointments.length} done</p>
            {inProgressCount > 0 && <p className="text-[11px] text-violet-600 font-semibold">{inProgressCount} in progress</p>}
          </div>
        </div>
      </div>

      <div className="bg-white border border-slate-200 rounded-2xl overflow-hidden flex" style={{ minHeight: "580px" }}>
        <div className="flex flex-col border-r border-slate-100 w-full lg:w-[380px] shrink-0">
          <div className="px-4 py-3 border-b border-slate-100 bg-slate-50">
            <p className="text-[11px] font-bold text-slate-400 uppercase tracking-widest">
              {appointments.length} patients today
            </p>
          </div>
          <div className="flex-1 overflow-y-auto divide-y divide-slate-100">
            {appointments.length === 0 ? (
                <p className="p-10 text-center text-xs text-slate-400">No appointments scheduled.</p>
            ) : (
                appointments.map(appt => (
                    <AppointmentRow key={appt.id} appt={appt}
                      isSelected={selected?.id === appt.id} onSelect={setSelected} />
                ))
            )}
          </div>
        </div>

        <div className="hidden lg:flex flex-col flex-1 min-w-0">
          {selected ? (
            <DetailPanel 
              appt={selected} 
              onClose={() => setSelected(null)} 
              onStart={handleStart} 
            />
          ) : (
            <div className="flex flex-col items-center justify-center flex-1 text-center px-8">
              <div className="w-14 h-14 rounded-2xl bg-slate-100 flex items-center justify-center mb-3">
                <MdCalendarToday className="text-[24px] text-slate-300" />
              </div>
              <p className="text-sm font-semibold text-slate-500">Select an appointment</p>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

export default Doctor_DailyAppointments