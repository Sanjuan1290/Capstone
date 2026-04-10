// client/src/pages/patientPage/PatientDashboard.jsx
// REDESIGNED: Mobile-first, modern card layout, gradient hero, improved UX

import { useEffect, useState } from "react"
import { useAuth } from "../../context/AuthContext"
import { getMyAppointments } from "../../services/patient.service"
import {
  MdCalendarToday, MdEventAvailable, MdHistory,
  MdAdd, MdPerson, MdArrowForward, MdAccessTime,
  MdFace, MdMedicalServices, MdCheckCircle,
} from "react-icons/md"
import { NavLink } from "react-router-dom"

function formatDate(raw) {
  if (!raw) return "—"
  const [y, m, d] = String(raw).slice(0, 10).split("-").map(Number)
  if (!y || !m || !d) return String(raw)
  return new Date(y, m - 1, d).toLocaleDateString("en-PH", {
    weekday: "short", month: "short", day: "numeric",
  })
}

const STATUS_STYLE = {
  pending:     { label: "Pending",     bg: "bg-amber-50",   text: "text-amber-700",   border: "border-amber-200"   },
  confirmed:   { label: "Confirmed",   bg: "bg-emerald-50", text: "text-emerald-700", border: "border-emerald-200" },
  completed:   { label: "Completed",   bg: "bg-slate-100",  text: "text-slate-500",   border: "border-slate-200"   },
  cancelled:   { label: "Cancelled",   bg: "bg-red-50",     text: "text-red-500",     border: "border-red-200"     },
  rescheduled: { label: "Rescheduled", bg: "bg-sky-50",     text: "text-sky-700",     border: "border-sky-200"     },
}

const PatientDashboard = () => {
  const { user } = useAuth()
  const [upcoming,    setUpcoming]    = useState(null)
  const [recentVisits,setRecentVisits]= useState([])
  const [totalVisits, setTotalVisits] = useState(0)
  const [loading,     setLoading]     = useState(true)

  useEffect(() => {
    getMyAppointments()
      .then(data => {
        const all = Array.isArray(data) ? data : []
        const active = all
          .filter(a => a.status === "confirmed" || a.status === "pending")
          .sort((a, b) => new Date(a.appointment_date) - new Date(b.appointment_date))
        const completed = all.filter(a => a.status === "completed")
        setUpcoming(active[0] || null)
        setRecentVisits(completed.slice(0, 3))
        setTotalVisits(completed.length)
      })
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [])

  const firstName = user?.full_name?.split(" ")[0] || "Patient"
  const todayStr  = new Date().toLocaleDateString("en-PH", { weekday: "long", month: "long", day: "numeric" })

  const quickActions = [
    { label: "Book Appointment",    icon: MdCalendarToday,  to: "/patient/book",           color: "bg-emerald-50 text-emerald-700 border-emerald-200"  },
    { label: "My Appointments",     icon: MdEventAvailable, to: "/patient/appointments",   color: "bg-sky-50 text-sky-700 border-sky-200"              },
    { label: "Appointment History", icon: MdHistory,        to: "/patient/history",        color: "bg-violet-50 text-violet-700 border-violet-200"     },
  ]

  return (
    <div className="max-w-3xl mx-auto space-y-5">

      {/* ── Hero greeting ──────────────────────────────────────────────────── */}
      <div className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-[#0b1a2c] via-[#0f2540] to-[#0b1a2c] p-6">
        {/* decorative circles */}
        <div className="absolute -top-6 -right-6 w-36 h-36 rounded-full bg-emerald-500/10 pointer-events-none" />
        <div className="absolute -bottom-8 left-20 w-24 h-24 rounded-full bg-sky-500/10 pointer-events-none" />

        <div className="relative flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="text-slate-400 text-xs font-medium mb-1">{todayStr}</p>
            <h1 className="text-white text-xl lg:text-2xl font-black tracking-tight leading-tight">
              Hello, <span className="text-emerald-400">{firstName}! 👋</span>
            </h1>
            <p className="text-slate-400 text-sm mt-1.5 leading-relaxed">
              {upcoming
                ? <>Your next appointment is on <span className="text-white font-semibold">{formatDate(upcoming.appointment_date || upcoming.date)}</span>.</>
                : "No upcoming appointments. Book one today!"}
            </p>
          </div>
          <div className="w-12 h-12 rounded-2xl bg-emerald-500/15 border border-emerald-500/20 flex items-center justify-center shrink-0">
            <MdPerson className="text-emerald-400 text-[24px]" />
          </div>
        </div>

        {/* Stat row */}
        <div className="relative flex items-center gap-4 mt-5 pt-4 border-t border-white/5">
          <div className="text-center">
            <p className="text-2xl font-black text-white">{upcoming ? 1 : 0}</p>
            <p className="text-[10px] text-slate-400 font-medium uppercase tracking-wider">Upcoming</p>
          </div>
          <div className="w-px h-8 bg-white/10" />
          <div className="text-center">
            <p className="text-2xl font-black text-white">{totalVisits}</p>
            <p className="text-[10px] text-slate-400 font-medium uppercase tracking-wider">Completed</p>
          </div>
          <div className="ml-auto">
            <NavLink to="/patient/book"
              className="flex items-center gap-1.5 bg-emerald-500 hover:bg-emerald-400 text-white text-xs font-bold px-4 py-2.5 rounded-xl transition-colors">
              <MdAdd className="text-[15px]" /> Book Now
            </NavLink>
          </div>
        </div>
      </div>

      {/* ── Quick Actions (mobile-optimised 3-col) ─────────────────────────── */}
      <div className="grid grid-cols-3 gap-3">
        {quickActions.map(({ label, icon: Icon, to, color }) => (
          <NavLink key={label} to={to}
            className={`flex flex-col items-center gap-2 p-3 lg:p-4 rounded-2xl border-2 transition-all
              hover:-translate-y-0.5 hover:shadow-md active:scale-95 ${color}`}>
            <div className="w-10 h-10 rounded-xl bg-white/60 flex items-center justify-center">
              <Icon className="text-[20px]" />
            </div>
            <span className="text-[10px] lg:text-xs font-bold text-center leading-tight">
              {label === "Book Appointment" ? "Book" : label === "My Appointments" ? "Appointments" : "History"}
            </span>
          </NavLink>
        ))}
      </div>

      {/* ── Next Appointment Card ──────────────────────────────────────────── */}
      <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden shadow-sm">
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100">
          <h2 className="text-sm font-bold text-slate-800 flex items-center gap-2">
            <MdEventAvailable className="text-emerald-500 text-[16px]" />
            Next Appointment
          </h2>
          <NavLink to="/patient/appointments"
            className="text-xs font-semibold text-emerald-600 hover:text-emerald-700 flex items-center gap-0.5">
            View all <MdArrowForward className="text-[13px]" />
          </NavLink>
        </div>

        {loading ? (
          <div className="p-8 text-center">
            <div className="w-6 h-6 border-2 border-slate-200 border-t-emerald-500 rounded-full animate-spin mx-auto" />
          </div>
        ) : upcoming ? (
          <div className="p-5">
            {/* Type badge + status */}
            <div className="flex items-center gap-2 mb-3 flex-wrap">
              <div className={`flex items-center gap-1.5 text-xs font-bold px-2.5 py-1 rounded-full border
                ${upcoming.type === "derma"
                  ? "bg-emerald-50 text-emerald-700 border-emerald-200"
                  : "bg-sky-50 text-sky-700 border-sky-200"}`}>
                {upcoming.type === "derma"
                  ? <MdFace className="text-[12px]" />
                  : <MdMedicalServices className="text-[12px]" />}
                {upcoming.type === "derma" ? "Dermatology" : "General Medicine"}
              </div>
              {(() => {
                const s = STATUS_STYLE[upcoming.status] || STATUS_STYLE.pending
                return (
                  <span className={`text-[11px] font-bold border px-2 py-0.5 rounded-full ${s.bg} ${s.text} ${s.border}`}>
                    {s.label}
                  </span>
                )
              })()}
            </div>

            {/* Doctor */}
            <p className="text-lg font-bold text-slate-800 mb-3">
              {upcoming.doctor || upcoming.doctor_name}
            </p>

            {/* Details grid */}
            <div className="grid grid-cols-2 gap-3 mb-4">
              <div className="bg-slate-50 rounded-xl p-3">
                <p className="text-[10px] text-slate-400 flex items-center gap-1 mb-1">
                  <MdCalendarToday className="text-[11px]" /> Date
                </p>
                <p className="text-sm font-bold text-slate-800">
                  {formatDate(upcoming.appointment_date || upcoming.date)}
                </p>
              </div>
              <div className="bg-slate-50 rounded-xl p-3">
                <p className="text-[10px] text-slate-400 flex items-center gap-1 mb-1">
                  <MdAccessTime className="text-[11px]" /> Time
                </p>
                <p className="text-sm font-bold text-slate-800">
                  {upcoming.appointment_time || upcoming.time}
                </p>
              </div>
              {upcoming.reason && (
                <div className="col-span-2 bg-slate-50 rounded-xl p-3">
                  <p className="text-[10px] text-slate-400 mb-1">Reason</p>
                  <p className="text-sm font-semibold text-slate-700">{upcoming.reason}</p>
                </div>
              )}
            </div>

            <NavLink to="/patient/appointments"
              className="flex items-center justify-center gap-1.5 w-full py-2.5 text-xs font-bold
                text-slate-600 border border-slate-200 hover:bg-slate-50 rounded-xl transition-colors">
              Manage Appointment <MdArrowForward className="text-[13px]" />
            </NavLink>
          </div>
        ) : (
          <div className="flex flex-col items-center py-10 text-center px-6">
            <div className="w-14 h-14 rounded-2xl bg-emerald-50 flex items-center justify-center mb-3">
              <MdCalendarToday className="text-[24px] text-emerald-400" />
            </div>
            <p className="text-sm font-semibold text-slate-600 mb-1">No upcoming appointments</p>
            <p className="text-xs text-slate-400 mb-4">Schedule your next visit with our doctors.</p>
            <NavLink to="/patient/book"
              className="flex items-center gap-1.5 bg-emerald-500 hover:bg-emerald-600 text-white text-xs font-bold px-5 py-2.5 rounded-xl transition-colors">
              <MdAdd className="text-[14px]" /> Book Now
            </NavLink>
          </div>
        )}
      </div>

      {/* ── Recent Visits ─────────────────────────────────────────────────── */}
      <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden shadow-sm">
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100">
          <h2 className="text-sm font-bold text-slate-800 flex items-center gap-2">
            <MdHistory className="text-slate-400 text-[16px]" />
            Recent Visits
          </h2>
          <NavLink to="/patient/history"
            className="text-xs font-semibold text-emerald-600 hover:text-emerald-700 flex items-center gap-0.5">
            View All <MdArrowForward className="text-[13px]" />
          </NavLink>
        </div>

        {loading ? (
          <div className="p-6 text-center">
            <div className="w-6 h-6 border-2 border-slate-200 border-t-emerald-500 rounded-full animate-spin mx-auto" />
          </div>
        ) : recentVisits.length === 0 ? (
          <div className="flex flex-col items-center py-8 text-center px-6">
            <MdCheckCircle className="text-slate-200 text-[32px] mb-2" />
            <p className="text-xs text-slate-400">No completed visits yet.</p>
          </div>
        ) : (
          <div className="divide-y divide-slate-100">
            {recentVisits.map(visit => {
              const Icon = visit.type === "derma" ? MdFace : MdMedicalServices
              return (
                <div key={visit.id} className="flex items-center gap-3 px-5 py-3.5 hover:bg-slate-50 transition-colors">
                  <div className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0
                    ${visit.type === "derma" ? "bg-emerald-50" : "bg-slate-100"}`}>
                    <Icon className={`text-[17px] ${visit.type === "derma" ? "text-emerald-600" : "text-slate-500"}`} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold text-slate-800 truncate">
                      {visit.doctor || visit.doctor_name}
                    </p>
                    <p className="text-xs text-slate-400 truncate mt-0.5">
                      {formatDate(visit.appointment_date || visit.date)} · {visit.reason || "—"}
                    </p>
                  </div>
                  <span className="text-[10px] font-bold border px-2 py-0.5 rounded-full shrink-0
                    bg-slate-100 text-slate-500 border-slate-200">
                    Done
                  </span>
                </div>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}

export default PatientDashboard