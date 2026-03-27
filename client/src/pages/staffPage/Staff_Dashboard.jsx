import { useEffect, useState } from 'react'
import { useAuth } from '../../context/AuthContext'
import { getDashboardStats, getAppointments } from '../../services/staff.service'
import {
  MdEventAvailable, MdQueuePlayNext, MdPeople,
  MdInventory, MdCheck, MdClose, MdAccessTime,
  MdPending, MdWarning, MdChevronRight, MdFace,
  MdMedicalServices, MdAdd
} from "react-icons/md"
import { NavLink } from "react-router-dom"

const STATUS_CONFIG = {
  confirmed:    { label: "Confirmed",   badge: "bg-emerald-50 text-emerald-700 border-emerald-200" },
  pending:      { label: "Pending",     badge: "bg-amber-50   text-amber-700   border-amber-200"   },
  cancelled:    { label: "Cancelled",   badge: "bg-red-50     text-red-500     border-red-200"     },
  "in-progress":{ label: "In Progress", badge: "bg-sky-50    text-sky-700     border-sky-200"     },
  waiting:      { label: "Waiting",     badge: "bg-slate-100  text-slate-500   border-slate-200"   },
}

const Staff_Dashboard = () => {
  const { user } = useAuth()
  const [stats,        setStats]        = useState(null)
  const [appointments, setAppointments] = useState([])
  const [loading,      setLoading]      = useState(true)

  const displayDate = new Date().toLocaleDateString("en-PH", {
    weekday: "long", year: "numeric", month: "long", day: "numeric"
  })

  const today = new Date().toISOString().split('T')[0]

  useEffect(() => {
    setLoading(true)
    Promise.all([getDashboardStats(), getAppointments(today)])
      .then(([s, a]) => {
        setStats(s)
        setAppointments(Array.isArray(a) ? a : [])
      })
      .catch((err) => console.error("Dashboard Load Error:", err))
      .finally(() => setLoading(false))
  }, [today])

  if (loading) {
    return (
      <div className="h-64 flex items-center justify-center">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-sky-500"></div>
      </div>
    )
  }

  const confirmedCount = appointments.filter(a => a.status === "confirmed").length
  const pendingCount   = appointments.filter(a => a.status === "pending").length

  return (
    <div className="space-y-5 max-w-6xl">

      {/* Greeting */}
      <div className="relative overflow-hidden rounded-2xl bg-[#0b1a2c] px-7 py-6 shadow-lg shadow-slate-200/50">
        <div className="absolute -top-8 -right-8 w-40 h-40 rounded-full bg-sky-500/10" />
        <div className="absolute -bottom-10 right-28 w-28 h-28 rounded-full bg-emerald-500/10" />
        <div className="relative flex items-center justify-between">
          <div>
            <p className="text-slate-400 text-sm font-medium mb-0.5">{displayDate}</p>
            <h1 className="text-white text-2xl font-black tracking-tight">
              Good morning, <span className="text-sky-400">{user?.full_name?.split(' ')[0] || 'Staff'}!</span> 👋
            </h1>
            <p className="text-slate-400 text-sm mt-1.5">
              <span className="text-white font-semibold">{appointments.length} appointments</span> scheduled today —{" "}
              <span className="text-emerald-400 font-semibold">{confirmedCount} confirmed</span>,{" "}
              <span className="text-amber-400 font-semibold">{pendingCount} pending</span>
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

      {/* Stat cards — FIX: use correct field names from updated getDashboard */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {[
          {
            label: "Today's Appointments",
            value: appointments.length,
            sub: `${confirmedCount} confirmed`,
            icon: MdEventAvailable,
            color: "text-sky-600", bg: "bg-sky-50", border: "border-sky-200"
          },
          {
            label: "Walk-in Queue",
            // FIX: was stats?.activeQueue (renamed from inQueue in controller)
            value: stats?.activeQueue ?? 0,
            sub: "current active",
            icon: MdQueuePlayNext,
            color: "text-emerald-600", bg: "bg-emerald-50", border: "border-emerald-200"
          },
          {
            label: "Pending Approval",
            // FIX: was stats?.pendingApprovals (renamed from pendingAppts in controller)
            value: stats?.pendingApprovals ?? 0,
            sub: "need confirmation",
            icon: MdPending,
            color: "text-amber-600", bg: "bg-amber-50", border: "border-amber-200"
          },
          {
            label: "Low Stock Alerts",
            // FIX: was stats?.lowStockCount (renamed from lowStock in controller)
            value: stats?.lowStockCount ?? 0,
            sub: "items need restocking",
            icon: MdWarning,
            color: "text-red-500", bg: "bg-red-50", border: "border-red-200"
          },
        ].map(({ label, value, sub, icon: Icon, color, bg, border }) => (
          <div key={label} className="bg-white rounded-2xl border border-slate-200 px-5 py-4 flex items-start gap-3 shadow-sm hover:shadow-md transition-shadow">
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

        {/* Today's Appointments Table */}
        <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden shadow-sm">
          <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100">
            <h2 className="text-sm font-bold text-slate-800">Today's Appointments</h2>
            <NavLink to="/staff/appointments" className="text-xs font-semibold text-sky-600 hover:text-sky-700 flex items-center gap-0.5 transition-colors">
              View all <MdChevronRight className="text-[14px]" />
            </NavLink>
          </div>
          <div className="divide-y divide-slate-100">
            {appointments.length > 0 ? appointments.map(appt => {
              const cfg  = STATUS_CONFIG[appt.status] || STATUS_CONFIG.pending
              // FIX: appt.type comes from clinic_type AS type alias in controller
              const Icon = appt.type === "derma" ? MdFace : MdMedicalServices
              return (
                <div key={appt.id} className="flex items-center gap-4 px-5 py-3.5 hover:bg-slate-50 transition-colors">
                  <div className={`w-8 h-8 rounded-xl flex items-center justify-center shrink-0 ${appt.type === "derma" ? "bg-emerald-50" : "bg-slate-100"}`}>
                    <Icon className={`text-[15px] ${appt.type === "derma" ? "text-emerald-600" : "text-slate-500"}`} />
                  </div>
                  <div className="flex-1 min-w-0">
                    {/* FIX: use patient_name (returned by getAppointments) */}
                    <p className="text-sm font-semibold text-slate-800 truncate">{appt.patient_name || appt.patient}</p>
                    <p className="text-xs text-slate-500 truncate">{appt.doctor_name || appt.doctor}</p>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <span className="text-xs text-slate-400 font-medium flex items-center gap-1">
                      {/* FIX: appt.time comes from appointment_time AS time alias */}
                      <MdAccessTime className="text-[12px]" /> {appt.time || appt.appointment_time}
                    </span>
                    <span className={`text-[10px] font-bold border px-2 py-0.5 rounded-full ${cfg.badge}`}>
                      {cfg.label}
                    </span>
                  </div>
                </div>
              )
            }) : (
              <p className="p-10 text-center text-sm text-slate-400">No appointments scheduled for today.</p>
            )}
          </div>
        </div>

        {/* Right column */}
        <div className="space-y-5">
          <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden shadow-sm p-5">
            <h2 className="text-sm font-bold text-slate-800 mb-4">Quick Actions</h2>
            <NavLink to="/staff/walkin" className="w-full flex items-center justify-center gap-1.5 py-3 text-sm font-bold text-white bg-sky-500 rounded-xl hover:bg-sky-600 transition-all mb-3">
              <MdAdd className="text-[18px]" /> New Walk-in
            </NavLink>
            <NavLink to="/staff/inventory" className="w-full flex items-center justify-center gap-1.5 py-3 text-sm font-bold text-slate-600 bg-slate-100 rounded-xl hover:bg-slate-200 transition-all">
              <MdInventory className="text-[18px]" /> Check Inventory
            </NavLink>
          </div>
        </div>
      </div>
    </div>
  )
}

export default Staff_Dashboard