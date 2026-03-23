import { useState } from "react"
import {
  MdEventAvailable, MdQueuePlayNext, MdPeople,
  MdInventory, MdCheck, MdClose, MdAccessTime,
  MdPending, MdWarning, MdChevronRight, MdFace,
  MdMedicalServices, MdAdd
} from "react-icons/md"
import { NavLink } from "react-router-dom"

// ── Mock Data ─────────────────────────────────────────────────────────────────
const todayAppointments = [
  { id: "APT-001", patient: "Maria Cruz",      type: "derma",   doctor: "Dr. Maria Santos", time: "9:00 AM",  status: "confirmed" },
  { id: "APT-002", patient: "Jose Dela Cruz",  type: "medical", doctor: "Dr. Jose Reyes",   time: "9:30 AM",  status: "confirmed" },
  { id: "APT-003", patient: "Ana Villanueva",  type: "derma",   doctor: "Dr. Carlo Lim",    time: "10:00 AM", status: "pending"   },
  { id: "APT-004", patient: "Carlo Santos",    type: "medical", doctor: "Dr. Jose Reyes",   time: "10:30 AM", status: "confirmed" },
  { id: "APT-005", patient: "Rosa Reyes",      type: "derma",   doctor: "Dr. Maria Santos", time: "11:00 AM", status: "pending"   },
]

const walkInQueue = [
  { queueNo: 1, patient: "Juan Ramos",    type: "medical", status: "in-progress" },
  { queueNo: 2, patient: "Linda Torres",  type: "derma",   status: "waiting"     },
  { queueNo: 3, patient: "Marco Salazar", type: "medical", status: "waiting"     },
]

const lowStockItems = [
  { name: "Tretinoin 0.025% Cream", stock: 3,  unit: "tubes",   threshold: 5  },
  { name: "Amoxicillin 500mg",      stock: 8,  unit: "boxes",   threshold: 10 },
  { name: "Hydroquinone 2% Cream",  stock: 2,  unit: "tubes",   threshold: 5  },
]

const STATUS_CONFIG = {
  confirmed:   { label: "Confirmed",   badge: "bg-emerald-50 text-emerald-700 border-emerald-200" },
  pending:     { label: "Pending",     badge: "bg-amber-50   text-amber-700   border-amber-200"   },
  cancelled:   { label: "Cancelled",   badge: "bg-red-50     text-red-500     border-red-200"     },
  "in-progress":{ label: "In Progress", badge: "bg-sky-50    text-sky-700     border-sky-200"     },
  waiting:     { label: "Waiting",     badge: "bg-slate-100  text-slate-500   border-slate-200"   },
}

// ── Main ──────────────────────────────────────────────────────────────────────
const Staff_Dashboard = () => {
  const today = new Date().toLocaleDateString("en-PH", {
    weekday: "long", year: "numeric", month: "long", day: "numeric"
  })

  const confirmed = todayAppointments.filter(a => a.status === "confirmed").length
  const pending   = todayAppointments.filter(a => a.status === "pending").length

  return (
    <div className="space-y-5 max-w-6xl">

      {/* Greeting */}
      <div className="relative overflow-hidden rounded-2xl bg-[#0b1a2c] px-7 py-6">
        <div className="absolute -top-8 -right-8 w-40 h-40 rounded-full bg-sky-500/10" />
        <div className="absolute -bottom-10 right-28 w-28 h-28 rounded-full bg-emerald-500/10" />
        <div className="relative flex items-center justify-between">
          <div>
            <p className="text-slate-400 text-sm font-medium mb-0.5">{today}</p>
            <h1 className="text-white text-2xl font-black tracking-tight">
              Good morning, <span className="text-sky-400">Staff!</span> 👋
            </h1>
            <p className="text-slate-400 text-sm mt-1.5">
              <span className="text-white font-semibold">{todayAppointments.length} appointments</span> scheduled today —{" "}
              <span className="text-emerald-400 font-semibold">{confirmed} confirmed</span>,{" "}
              <span className="text-amber-400 font-semibold">{pending} pending</span>
            </p>
          </div>
          <NavLink
            to="/staff/appointments"
            className="hidden sm:flex items-center gap-2 bg-sky-500 hover:bg-sky-400 text-white
              text-sm font-semibold px-4 py-2.5 rounded-xl transition-colors shrink-0"
          >
            <MdEventAvailable className="text-[15px]" /> Manage Appointments
          </NavLink>
        </div>
      </div>

      {/* Stat cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {[
          { label: "Today's Appointments", value: todayAppointments.length, sub: `${confirmed} confirmed`,   icon: MdEventAvailable, color: "text-sky-600",     bg: "bg-sky-50",     border: "border-sky-200"     },
          { label: "Walk-in Queue",         value: walkInQueue.length,       sub: "1 in progress",           icon: MdQueuePlayNext,  color: "text-emerald-600", bg: "bg-emerald-50", border: "border-emerald-200" },
          { label: "Pending Approval",      value: pending,                  sub: "need confirmation",       icon: MdPending,        color: "text-amber-600",   bg: "bg-amber-50",   border: "border-amber-200"   },
          { label: "Low Stock Alerts",      value: lowStockItems.length,     sub: "items need restocking",   icon: MdWarning,        color: "text-red-500",     bg: "bg-red-50",     border: "border-red-200"     },
        ].map(({ label, value, sub, icon: Icon, color, bg, border }) => (
          <div key={label} className={`bg-white rounded-2xl border border-slate-200 px-5 py-4 flex items-start gap-3`}>
            <div className={`w-10 h-10 rounded-xl ${bg} border ${border} flex items-center justify-center shrink-0`}>
              <Icon className={`text-[18px] ${color}`} />
            </div>
            <div>
              <p className="text-xs text-slate-500 font-medium">{label}</p>
              <p className="text-2xl font-black text-slate-800 leading-tight">{value}</p>
              <p className="text-[11px] text-slate-400 mt-0.5">{sub}</p>
            </div>
          </div>
        ))}
      </div>

      {/* Main 2-col grid */}
      <div className="grid grid-cols-1 lg:grid-cols-[1fr_340px] gap-5">

        {/* Today's Appointments */}
        <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden">
          <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100">
            <h2 className="text-sm font-bold text-slate-800">Today's Appointments</h2>
            <NavLink to="/staff/appointments"
              className="text-xs font-semibold text-sky-600 hover:text-sky-700 flex items-center gap-0.5 transition-colors">
              View all <MdChevronRight className="text-[14px]" />
            </NavLink>
          </div>
          <div className="divide-y divide-slate-100">
            {todayAppointments.map(appt => {
              const cfg  = STATUS_CONFIG[appt.status]
              const Icon = appt.type === "derma" ? MdFace : MdMedicalServices
              return (
                <div key={appt.id} className="flex items-center gap-4 px-5 py-3.5 hover:bg-slate-50 transition-colors">
                  <div className={`w-8 h-8 rounded-xl flex items-center justify-center shrink-0
                    ${appt.type === "derma" ? "bg-emerald-50" : "bg-slate-100"}`}>
                    <Icon className={`text-[15px] ${appt.type === "derma" ? "text-emerald-600" : "text-slate-500"}`} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold text-slate-800 truncate">{appt.patient}</p>
                    <p className="text-xs text-slate-500 truncate">{appt.doctor}</p>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <span className="text-xs text-slate-400 font-medium flex items-center gap-1">
                      <MdAccessTime className="text-[12px]" /> {appt.time}
                    </span>
                    <span className={`text-[10px] font-bold border px-2 py-0.5 rounded-full ${cfg.badge}`}>
                      {cfg.label}
                    </span>
                  </div>
                  {appt.status === "pending" && (
                    <div className="flex gap-1 shrink-0">
                      <button className="w-7 h-7 rounded-lg bg-emerald-50 border border-emerald-200 flex items-center justify-center hover:bg-emerald-100 transition-colors">
                        <MdCheck className="text-emerald-600 text-[14px]" />
                      </button>
                      <button className="w-7 h-7 rounded-lg bg-red-50 border border-red-200 flex items-center justify-center hover:bg-red-100 transition-colors">
                        <MdClose className="text-red-500 text-[14px]" />
                      </button>
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        </div>

        {/* Right column */}
        <div className="space-y-5">

          {/* Walk-in Queue */}
          <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden">
            <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100">
              <h2 className="text-sm font-bold text-slate-800">Walk-in Queue</h2>
              <div className="flex items-center gap-2">
                <NavLink to="/staff/walkin"
                  className="text-xs font-semibold text-sky-600 hover:text-sky-700 flex items-center gap-0.5 transition-colors">
                  Manage <MdChevronRight className="text-[14px]" />
                </NavLink>
              </div>
            </div>
            <div className="p-4 space-y-2">
              {walkInQueue.map(q => {
                const cfg  = STATUS_CONFIG[q.status]
                const Icon = q.type === "derma" ? MdFace : MdMedicalServices
                return (
                  <div key={q.queueNo} className={`flex items-center gap-3 p-3 rounded-xl border transition-colors
                    ${q.status === "in-progress" ? "border-sky-200 bg-sky-50/50" : "border-slate-100 hover:bg-slate-50"}`}>
                    <div className={`w-8 h-8 rounded-xl flex items-center justify-center font-black text-sm shrink-0
                      ${q.status === "in-progress" ? "bg-sky-500 text-white" : "bg-slate-100 text-slate-500"}`}>
                      {q.queueNo}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-semibold text-slate-800 truncate">{q.patient}</p>
                      <div className="flex items-center gap-1 mt-0.5">
                        <Icon className={`text-[11px] ${q.type === "derma" ? "text-emerald-500" : "text-slate-400"}`} />
                        <p className="text-xs text-slate-400">{q.type === "derma" ? "Dermatology" : "General Medicine"}</p>
                      </div>
                    </div>
                    <span className={`text-[10px] font-bold border px-2 py-0.5 rounded-full shrink-0 ${cfg.badge}`}>
                      {cfg.label}
                    </span>
                  </div>
                )
              })}
              <NavLink to="/staff/walkin"
                className="w-full flex items-center justify-center gap-1.5 py-2.5 text-xs font-bold
                  text-slate-500 border border-dashed border-slate-200 rounded-xl hover:border-slate-300
                  hover:bg-slate-50 transition-all">
                <MdAdd className="text-[14px]" /> Add Walk-in
              </NavLink>
            </div>
          </div>

          {/* Low Stock */}
          <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden">
            <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100">
              <h2 className="text-sm font-bold text-slate-800">Low Stock Alerts</h2>
              <span className="text-[10px] font-bold bg-red-50 text-red-500 border border-red-200 px-2 py-0.5 rounded-full">
                {lowStockItems.length} items
              </span>
            </div>
            <div className="p-4 space-y-2">
              {lowStockItems.map(item => (
                <div key={item.name} className="flex items-center gap-3 p-3 rounded-xl bg-red-50/50 border border-red-100">
                  <div className="w-8 h-8 rounded-xl bg-red-100 flex items-center justify-center shrink-0">
                    <MdInventory className="text-red-500 text-[15px]" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-xs font-semibold text-slate-800 truncate">{item.name}</p>
                    <p className="text-[11px] text-red-500 font-medium mt-0.5">
                      {item.stock} {item.unit} left (min: {item.threshold})
                    </p>
                  </div>
                </div>
              ))}
            </div>
          </div>

        </div>
      </div>
    </div>
  )
}

export default Staff_Dashboard