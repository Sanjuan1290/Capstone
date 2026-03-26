import { useEffect, useState } from 'react'
import { NavLink } from "react-router-dom"
import { useAuth } from '../../context/AuthContext'
import { getDashboard, getDailyAppointments } from '../../services/doctor.service'
import {
  MdCalendarToday, MdAccessTime, MdPerson, MdFace,
  MdMedicalServices, MdChevronRight, MdCheck,
  MdPending, MdQueuePlayNext, MdInventory2
} from "react-icons/md"

// ── Config ────────────────────────────────────────────────────────────────────
const STATUS_CONFIG = {
  "completed":   { label: "Done",         badge: "bg-slate-100  text-slate-500   border-slate-200",   dot: "bg-slate-400"   },
  "in-progress": { label: "In Progress", badge: "bg-violet-50  text-violet-700  border-violet-200",  dot: "bg-violet-500"  },
  "pending":     { label: "Waiting",      badge: "bg-amber-50   text-amber-700   border-amber-200",   dot: "bg-amber-400"   },
  "confirmed":   { label: "Confirmed",    badge: "bg-emerald-50 text-emerald-700 border-emerald-200", dot: "bg-emerald-500" },
}

const Doctor_Dashboard = () => {
  const { user } = useAuth()
  const [todayAppts,  setTodayAppts]  = useState([])
  const [walkInQueue, setWalkInQueue] = useState([]) // Mock or from dash
  const [requests,    setRequests]    = useState([])    // From dash
  const [loading,     setLoading]     = useState(true)

  const dateDisplay = new Date().toLocaleDateString("en-PH", {
    weekday: "long", year: "numeric", month: "long", day: "numeric"
  })
  
  const todayISO = new Date().toISOString().split('T')[0]

  useEffect(() => {
    Promise.all([getDashboard(), getDailyAppointments(todayISO)])
      .then(([dash, appts]) => {
        setTodayAppts(appts)
        setRequests(dash.requests || [])
        // If your dash service returns a specific walk-in queue, set it here
        setWalkInQueue(dash.walkInQueue || []) 
      })
      .catch((err) => console.error("Dashboard error:", err))
      .finally(() => setLoading(false))
  }, [todayISO])

  // Dynamic Stats
  const done       = todayAppts.filter(a => a.status === "completed").length
  const inProgress = todayAppts.filter(a => a.status === "in-progress").length
  const waiting    = todayAppts.filter(a => a.status === "pending" || a.status === "confirmed").length

  if (loading) return <div className="p-10 text-center text-slate-500">Loading Dashboard...</div>

  return (
    <div className="space-y-5 max-w-5xl">

      {/* Greeting banner */}
      <div className="relative overflow-hidden rounded-2xl bg-[#0b1a2c] px-7 py-6">
        <div className="absolute -top-8 -right-8 w-40 h-40 rounded-full bg-violet-500/10" />
        <div className="absolute -bottom-10 right-28 w-28 h-28 rounded-full bg-sky-500/10" />
        <div className="relative flex items-center justify-between">
          <div>
            <p className="text-slate-400 text-sm font-medium mb-0.5">{dateDisplay}</p>
            <h1 className="text-white text-2xl font-black tracking-tight">
              Good morning, <span className="text-violet-400">Dr. {user?.full_name?.split(' ').pop() || 'Doctor'}!</span> 👋
            </h1>
            <p className="text-slate-400 text-sm mt-1.5">
              <span className="text-white font-semibold">{todayAppts.length} appointments</span> today —{" "}
              <span className="text-emerald-400 font-semibold">{done} done</span>,{" "}
              <span className="text-violet-400 font-semibold">{inProgress} in progress</span>,{" "}
              <span className="text-amber-400 font-semibold">{waiting} waiting</span>
            </p>
          </div>
          <NavLink to="/doctor/daily-appointments"
            className="hidden sm:flex items-center gap-2 bg-violet-500 hover:bg-violet-400 text-white
              text-sm font-semibold px-4 py-2.5 rounded-xl transition-colors shrink-0">
            <MdCalendarToday className="text-[15px]" /> View Schedule
          </NavLink>
        </div>
      </div>

      {/* Stat cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {[
          { label: "Total Today",  value: todayAppts.length, sub: "scheduled",     color: "text-slate-800",   bg: "bg-white",     border: "border-slate-200"   },
          { label: "Completed",    value: done,              sub: "consultations", color: "text-emerald-600", bg: "bg-emerald-50",  border: "border-emerald-200" },
          { label: "In Progress",  value: inProgress,        sub: "now",           color: "text-violet-600",  bg: "bg-violet-50",   border: "border-violet-200"  },
          { label: "Walk-in Queue",value: walkInQueue.length, sub: "assigned to me",color: "text-amber-600",   bg: "bg-amber-50",    border: "border-amber-200"   },
        ].map(({ label, value, sub, color, bg, border }) => (
          <div key={label} className={`${bg} border ${border} rounded-2xl px-5 py-4`}>
            <p className="text-xs text-slate-500 font-medium">{label}</p>
            <p className={`text-3xl font-black mt-1 ${color}`}>{value}</p>
            <p className="text-[11px] text-slate-400 mt-0.5">{sub}</p>
          </div>
        ))}
      </div>

      {/* Main 2-col */}
      <div className="grid grid-cols-1 lg:grid-cols-[1fr_300px] gap-5">

        {/* Today's appointments */}
        <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden">
          <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100">
            <h2 className="text-sm font-bold text-slate-800">Today's Appointments</h2>
            <NavLink to="/doctor/daily-appointments"
              className="text-xs font-semibold text-violet-600 hover:text-violet-700 flex items-center gap-0.5 transition-colors">
              See all <MdChevronRight className="text-[14px]" />
            </NavLink>
          </div>
          <div className="divide-y divide-slate-100">
            {todayAppts.length === 0 ? (
               <p className="p-10 text-center text-xs text-slate-400">No appointments for today.</p>
            ) : todayAppts.map(appt => {
              const cfg  = STATUS_CONFIG[appt.status] || STATUS_CONFIG.pending
              const Icon = appt.type === "derma" ? MdFace : MdMedicalServices
              return (
                <div key={appt.id} className={`flex items-center gap-4 px-5 py-3.5 transition-colors
                  ${appt.status === "in-progress" ? "bg-violet-50/60" : "hover:bg-slate-50"}`}>
                  <div className={`w-8 h-8 rounded-xl flex items-center justify-center shrink-0
                    ${appt.type === "derma" ? "bg-emerald-50" : "bg-slate-100"}`}>
                    <Icon className={`text-[15px] ${appt.type === "derma" ? "text-emerald-600" : "text-slate-500"}`} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold text-slate-800 truncate">{appt.patient_name || appt.patient}</p>
                    <p className="text-xs text-slate-500 truncate">{appt.reason}</p>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <span className="text-xs text-slate-400 font-medium flex items-center gap-1">
                      <MdAccessTime className="text-[12px]" /> {appt.time}
                    </span>
                    <span className={`text-[10px] font-bold border px-2 py-0.5 rounded-full ${cfg.badge}`}>
                      {cfg.label}
                    </span>
                  </div>
                  {appt.status === "in-progress" && (
                    <NavLink to={`/doctor/consultation/${appt.id}`}
                      className="text-[11px] font-bold text-violet-600 bg-violet-50 border border-violet-200
                        px-2.5 py-1 rounded-lg hover:bg-violet-100 transition-colors shrink-0">
                      Consult
                    </NavLink>
                  )}
                </div>
              )
            })}
          </div>
        </div>

        {/* Right column */}
        <div className="space-y-4">

          {/* Walk-in queue */}
          <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden">
            <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100">
              <h2 className="text-sm font-bold text-slate-800">My Walk-in Queue</h2>
              <span className="text-[10px] font-bold bg-amber-50 text-amber-600 border border-amber-200 px-2 py-0.5 rounded-full">
                {walkInQueue.length} waiting
              </span>
            </div>
            <div className="p-4 space-y-2">
              {walkInQueue.length === 0 ? (
                <p className="text-xs text-slate-400 text-center py-4">No walk-ins assigned.</p>
              ) : walkInQueue.map(q => (
                <div key={q.queueNo} className="flex items-center gap-3 p-3 rounded-xl bg-amber-50/50 border border-amber-100">
                  <div className="w-8 h-8 rounded-xl bg-amber-100 flex items-center justify-center font-black text-sm text-amber-700 shrink-0">
                    {q.queueNo}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold text-slate-800 truncate">{q.patient}</p>
                    <p className="text-[11px] text-slate-400 flex items-center gap-1 mt-0.5">
                      <MdAccessTime className="text-[11px]" /> Arrived {q.arrivedAt}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Supply requests */}
          <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden">
            <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100">
              <h2 className="text-sm font-bold text-slate-800">My Requests</h2>
              <NavLink to="/doctor/request"
                className="text-xs font-semibold text-violet-600 hover:text-violet-700 flex items-center gap-0.5 transition-colors">
                View all <MdChevronRight className="text-[14px]" />
              </NavLink>
            </div>
            <div className="p-4 space-y-2">
              {requests.length === 0 ? (
                <p className="text-xs text-slate-400 text-center py-4">No recent requests.</p>
              ) : requests.slice(0, 3).map(req => (
                <div key={req.id} className="flex items-center gap-3 p-3 rounded-xl border border-slate-100 hover:bg-slate-50 transition-colors">
                  <div className="w-8 h-8 rounded-xl bg-slate-100 flex items-center justify-center shrink-0">
                    <MdInventory2 className="text-slate-400 text-[15px]" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-xs font-semibold text-slate-800 truncate">{req.item_name || req.item}</p>
                    <p className="text-[10px] text-slate-400 mt-0.5">{req.quantity} {req.unit}s</p>
                  </div>
                  <span className={`text-[10px] font-bold border px-2 py-0.5 rounded-full shrink-0
                    ${req.status === "approved" ? "bg-emerald-50 text-emerald-700 border-emerald-200" : "bg-amber-50 text-amber-700 border-amber-200"}`}>
                    {req.status}
                  </span>
                </div>
              ))}
            </div>
          </div>

        </div>
      </div>
    </div>
  )
}

export default Doctor_Dashboard