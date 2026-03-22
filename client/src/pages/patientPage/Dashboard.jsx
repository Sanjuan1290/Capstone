import { useState } from "react"
import {
  MdCalendarToday, MdEventAvailable, MdAccessTime,
  MdHistory, MdAdd, MdCancel, MdPerson,
  MdTimer, MdArrowForward
} from "react-icons/md"
import { NavLink } from "react-router-dom"

// ── Mock Data ─────────────────────────────────────────────────────────────────
const nextAppointment = {
  id: "APT-001",
  status: "confirmed",
  scheduleStatus: "scheduled",
  doctor: "Dr. Maria Santos",
  date: "Wed, Jan 15, 2025",
  time: "9:40 AM",
  reason: "Acne treatment follow-up",
}

const waitingTracker = {
  currentConsultation: null,
  appointment: "9:40 AM — Dr. Maria Santos",
  position: "You're next!",
  estimatedStart: "9:40 AM",
  queueProgress: 100,
  isNext: true,
}

const recentVisits = [
  {
    id: 1,
    time: "10:00 AM",
    date: "Jan 10",
    doctor: "Dr. Maria Santos",
    notes: "Initial skin assessment",
    status: "done",
  },
]

const quickActions = [
  { label: "Book Appointment",    icon: MdCalendarToday  },
  { label: "My Appointments",     icon: MdEventAvailable },
  { label: "Appointment History", icon: MdHistory        },
]

// ── Dashboard ─────────────────────────────────────────────────────────────────
const Dashboard = () => {
  const [appointment] = useState(nextAppointment)

  return (
    <div className="space-y-5 max-w-5xl">

      {/* ── Greeting ───────────────────────────────────────────────────────── */}
      <div>
        <h1 className="text-2xl font-bold text-slate-800">
          Welcome back, Maria 👋
        </h1>
        <p className="text-sm text-slate-500 mt-0.5">
          Here's an overview of your appointments and health activity.
        </p>
      </div>

      {/* ── Stat Cards ─────────────────────────────────────────────────────── */}
      <div className="grid grid-cols-2 gap-4">
        {[
          { label: "Upcoming",     value: "1", sub: "appointments" },
          { label: "Total Visits", value: "1", sub: "completed"    },
        ].map(({ label, value, sub }) => (
          <div
            key={label}
            className="bg-white rounded-2xl border border-slate-200 px-6 py-5"
          >
            <p className="text-sm text-slate-500">{label}</p>
            <p className="text-4xl font-bold text-slate-800 mt-1">{value}</p>
            <p className="text-xs text-slate-400 mt-0.5">{sub}</p>
          </div>
        ))}
      </div>

      {/* ── Main 2-column grid ─────────────────────────────────────────────── */}
      <div className="grid grid-cols-1 lg:grid-cols-[1fr_320px] gap-4 items-start">

        {/* LEFT column */}
        <div className="space-y-4">

          {/* Next Appointment */}
          <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden">
            <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100">
              <h2 className="text-sm font-semibold text-slate-800">Next Appointment</h2>
              <NavLink to={'/patient/book'} className="flex items-center gap-1.5 bg-[#0b1a2c] hover:bg-[#122236] text-white text-xs font-semibold px-3.5 py-2 rounded-xl transition-colors duration-150">
                <MdAdd className="text-[14px]" />
                Book New
              </NavLink>
            </div>
            <div className="p-5">
              {/* Top row */}
              <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-2">
                  <span className="text-[11px] font-mono font-semibold text-slate-500 bg-slate-100 px-2 py-0.5 rounded-md">
                    {appointment.id}
                  </span>
                  <span className="text-[11px] font-semibold text-sky-600 bg-sky-50 border border-sky-200 px-2.5 py-0.5 rounded-full">
                    {appointment.scheduleStatus}
                  </span>
                </div>
                <span className="text-[11px] font-semibold text-emerald-600 bg-emerald-50 border border-emerald-200 px-2.5 py-0.5 rounded-full">
                  {appointment.status}
                </span>
              </div>

              {/* Doctor */}
              <p className="text-lg font-bold text-slate-800 mb-4">{appointment.doctor}</p>

              {/* Detail grid — 2 items only now */}
              <div className="grid grid-cols-2 gap-y-4 gap-x-6 mb-5">
                <div>
                  <p className="text-[11px] text-slate-400 flex items-center gap-1 mb-0.5">
                    <MdCalendarToday className="text-[11px]" /> Date
                  </p>
                  <p className="text-sm font-semibold text-slate-700">{appointment.date}</p>
                </div>
                <div>
                  <p className="text-[11px] text-slate-400 flex items-center gap-1 mb-0.5">
                    <MdAccessTime className="text-[11px]" /> Time
                  </p>
                  <p className="text-sm font-semibold text-slate-700">{appointment.time}</p>
                </div>
                <div className="col-span-2">
                  <p className="text-[11px] text-slate-400 flex items-center gap-1 mb-0.5">
                    <MdPerson className="text-[11px]" /> Reason
                  </p>
                  <p className="text-sm font-semibold text-slate-700">{appointment.reason}</p>
                </div>
              </div>

              <button className="flex items-center gap-1.5 text-xs font-semibold text-slate-600 border border-slate-200 hover:border-red-300 hover:text-red-500 hover:bg-red-50 px-4 py-2 rounded-xl transition-all duration-150">
                <MdCancel className="text-[14px]" />
                Cancel Appointment
              </button>
            </div>
          </div>

          {/* Recent Visits */}
          <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden">
            <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100">
              <h2 className="text-sm font-semibold text-slate-800">Recent Visits</h2>
              <button className="text-xs font-semibold text-emerald-600 hover:text-emerald-700 flex items-center gap-0.5 transition-colors">
                View All <MdArrowForward className="text-[13px]" />
              </button>
            </div>
            <div className="p-4 space-y-2">
              {recentVisits.map(visit => (
                <div
                  key={visit.id}
                  className="flex items-center gap-4 p-3 rounded-xl hover:bg-slate-50 transition-colors cursor-pointer"
                >
                  <div className="w-14 h-14 rounded-xl bg-[#0b1a2c] flex flex-col items-center justify-center shrink-0 text-center">
                    <span className="text-[11px] font-bold text-white leading-tight">{visit.time.replace(" ", "\n")}</span>
                    <span className="text-[9px] text-slate-400 mt-0.5">{visit.date}</span>
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold text-slate-800">{visit.doctor}</p>
                    <p className="text-xs text-slate-500 mt-0.5">{visit.notes}</p>
                  </div>
                  <span className="text-[11px] font-semibold text-emerald-600 bg-emerald-50 border border-emerald-200 px-2.5 py-0.5 rounded-full shrink-0">
                    {visit.status}
                  </span>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* RIGHT column */}
        <div className="space-y-4">

          {/* Waiting Time Tracker */}
          <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden">
            <div className="px-5 py-4 border-b border-slate-100">
              <h2 className="text-sm font-semibold text-slate-800 flex items-center gap-2">
                <MdTimer className="text-emerald-500 text-[16px]" />
                Waiting Time Tracker
              </h2>
            </div>
            <div className="p-5 space-y-3">
              {[
                { label: "Current consultation", value: waitingTracker.currentConsultation ?? "No active consultation", muted: true  },
                { label: "Your appointment",     value: waitingTracker.appointment,    muted: false },
                { label: "Your position",        value: waitingTracker.position,       green: true  },
                { label: "Estimated start",      value: waitingTracker.estimatedStart, bold: true   },
              ].map(({ label, value, muted, green, bold }) => (
                <div key={label} className="flex items-center justify-between gap-3">
                  <span className="text-xs text-slate-500 shrink-0">{label}</span>
                  <span className={`text-xs text-right font-medium
                    ${muted ? "text-slate-400" : ""}
                    ${green ? "text-emerald-600 font-bold" : ""}
                    ${bold  ? "text-slate-800 font-semibold text-sm" : ""}
                    ${!muted && !green && !bold ? "text-slate-700" : ""}
                  `}>
                    {value}
                  </span>
                </div>
              ))}

              {/* Progress */}
              <div className="pt-1">
                <div className="flex items-center justify-between text-[10px] text-slate-400 mb-1.5">
                  <span>Queue progress</span>
                  <span>{waitingTracker.queueProgress}% through</span>
                </div>
                <div className="h-2 bg-slate-100 rounded-full overflow-hidden">
                  <div
                    className="h-full bg-emerald-500 rounded-full"
                    style={{ width: `${waitingTracker.queueProgress}%` }}
                  />
                </div>
              </div>

              {waitingTracker.isNext && (
                <div className="bg-[#0b1a2c] rounded-xl px-4 py-3 text-center">
                  <p className="text-white text-xs font-semibold">
                    🎉 You're next! Please proceed to the clinic.
                  </p>
                </div>
              )}
            </div>
          </div>

          {/* Quick Actions */}
          <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden">
            <div className="px-5 py-4 border-b border-slate-100">
              <h2 className="text-sm font-semibold text-slate-800">Quick Actions</h2>
            </div>
            <div className="p-3 space-y-1.5">
              {quickActions.map(({ label, icon: Icon }) => (
                <button
                  key={label}
                  className="w-full flex items-center gap-3 px-4 py-3 rounded-xl border border-slate-100 hover:border-slate-200 hover:bg-slate-50 transition-all duration-150 text-left group"
                >
                  <Icon className="text-[15px] text-slate-500 group-hover:text-emerald-600 transition-colors shrink-0" />
                  <span className="text-sm text-slate-700 group-hover:text-slate-900 transition-colors">
                    {label}
                  </span>
                </button>
              ))}
            </div>
          </div>

        </div>
      </div>
    </div>
  )
}

export default Dashboard