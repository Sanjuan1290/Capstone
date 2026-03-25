import { NavLink } from "react-router-dom"
import {
  MdPeople, MdEventAvailable, MdInventory2, MdBarChart,
  MdChevronRight, MdTrendingUp, MdTrendingDown, MdFace,
  MdMedicalServices, MdWarning, MdAccessTime, MdCalendarToday,
  MdCheck, MdPending
} from "react-icons/md"

const stats = [
  { label: "Total Patients",      value: "248",  change: "+12 this month",  up: true,  color: "text-slate-800",   bg: "bg-white",       border: "border-slate-200"   },
  { label: "Appointments Today",  value: "18",   change: "6 pending",       up: null,  color: "text-sky-700",     bg: "bg-sky-50",      border: "border-sky-200"     },
  { label: "Staff Members",       value: "5",    change: "All active",      up: null,  color: "text-slate-800",   bg: "bg-white",       border: "border-slate-200"   },
  { label: "Doctors",             value: "4",    change: "3 on duty today", up: null,  color: "text-slate-800",   bg: "bg-white",       border: "border-slate-200"   },
  { label: "Monthly Revenue",     value: "₱84k", change: "+8% vs last month", up: true, color: "text-emerald-700", bg: "bg-emerald-50",  border: "border-emerald-200" },
  { label: "Low Stock Items",     value: "3",    change: "Needs restocking", up: false, color: "text-red-600",     bg: "bg-red-50",      border: "border-red-200"     },
]

const recentAppointments = [
  { id: "APT-001", patient: "Maria Cruz",      doctor: "Dr. Maria Santos", type: "derma",   time: "9:00 AM",  status: "completed" },
  { id: "APT-002", patient: "Jose Dela Cruz",  doctor: "Dr. Jose Reyes",   type: "medical", time: "9:30 AM",  status: "completed" },
  { id: "APT-003", patient: "Rosa Reyes",      doctor: "Dr. Maria Santos", type: "derma",   time: "10:00 AM", status: "in-progress" },
  { id: "APT-004", patient: "Carlo Santos",    doctor: "Dr. Jose Reyes",   type: "medical", time: "10:30 AM", status: "pending"   },
  { id: "APT-005", patient: "Ana Villanueva",  doctor: "Dr. Carlo Lim",    type: "derma",   time: "11:00 AM", status: "pending"   },
]

const doctorStatus = [
  { name: "Dr. Maria Santos",   specialty: "Dermatologist",        status: "on-duty",  patients: 5, done: 2 },
  { name: "Dr. Jose Reyes",     specialty: "General Practitioner", status: "on-duty",  patients: 6, done: 2 },
  { name: "Dr. Carlo Lim",      specialty: "Cosmetic Dermatology", status: "on-duty",  patients: 4, done: 0 },
  { name: "Dr. Ana Villanueva", specialty: "Internal Medicine",    status: "off-duty", patients: 0, done: 0 },
]

const pendingRequests = [
  { id: "REQ-003", doctor: "Dr. Maria Santos", item: "Disposable Gloves (M)", qty: 2, unit: "box"  },
  { id: "REQ-004", doctor: "Dr. Maria Santos", item: "Surgical Mask (50pcs)", qty: 1, unit: "box"  },
]

const STATUS_CFG = {
  "completed":   { label: "Done",        badge: "bg-slate-100 text-slate-500 border-slate-200"   },
  "in-progress": { label: "In Progress", badge: "bg-violet-50 text-violet-700 border-violet-200" },
  "pending":     { label: "Waiting",     badge: "bg-amber-50  text-amber-700  border-amber-200"  },
}

const Admin_Dashboard = () => {
  const today = new Date().toLocaleDateString("en-PH", { weekday:"long", year:"numeric", month:"long", day:"numeric" })

  return (
    <div className="space-y-5 max-w-6xl">

      {/* Banner */}
      <div className="relative overflow-hidden rounded-2xl bg-[#0b1a2c] px-7 py-6">
        <div className="absolute -top-8 -right-8 w-40 h-40 rounded-full bg-amber-500/10" />
        <div className="absolute -bottom-10 right-32 w-24 h-24 rounded-full bg-sky-500/10" />
        <div className="relative">
          <p className="text-slate-400 text-sm mb-0.5">{today}</p>
          <h1 className="text-white text-2xl font-black tracking-tight">
            Admin Overview <span className="text-amber-400">— Carait Clinics</span>
          </h1>
          <p className="text-slate-400 text-sm mt-1.5">
            <span className="text-white font-semibold">18 appointments</span> today ·{" "}
            <span className="text-emerald-400 font-semibold">3 doctors on duty</span> ·{" "}
            <span className="text-red-400 font-semibold">3 low-stock items</span>
          </p>
        </div>
      </div>

      {/* Stats grid */}
      <div className="grid grid-cols-2 lg:grid-cols-3 gap-4">
        {stats.map(({ label, value, change, up, color, bg, border }) => (
          <div key={label} className={`${bg} border ${border} rounded-2xl px-5 py-4`}>
            <p className="text-xs text-slate-500 font-medium">{label}</p>
            <p className={`text-3xl font-black mt-1 ${color}`}>{value}</p>
            <div className="flex items-center gap-1 mt-0.5">
              {up === true  && <MdTrendingUp   className="text-emerald-500 text-[12px]" />}
              {up === false && <MdTrendingDown  className="text-red-500    text-[12px]" />}
              <p className={`text-[11px] font-medium ${up === true ? "text-emerald-600" : up === false ? "text-red-500" : "text-slate-400"}`}>
                {change}
              </p>
            </div>
          </div>
        ))}
      </div>

      {/* Main 2-col */}
      <div className="grid grid-cols-1 lg:grid-cols-[1fr_320px] gap-5">

        {/* Today's Appointments */}
        <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden">
          <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100">
            <h2 className="text-sm font-bold text-slate-800">Today's Appointments</h2>
            <NavLink to="/admin/appointments" className="text-xs font-semibold text-amber-600 hover:text-amber-700 flex items-center gap-0.5 transition-colors">
              View all <MdChevronRight className="text-[14px]" />
            </NavLink>
          </div>
          <div className="divide-y divide-slate-100">
            {recentAppointments.map(appt => {
              const cfg  = STATUS_CFG[appt.status]
              const Icon = appt.type === "derma" ? MdFace : MdMedicalServices
              return (
                <div key={appt.id} className={`flex items-center gap-4 px-5 py-3.5 hover:bg-slate-50 transition-colors
                  ${appt.status === "in-progress" ? "bg-violet-50/40" : ""}`}>
                  <div className={`w-8 h-8 rounded-xl flex items-center justify-center shrink-0
                    ${appt.type === "derma" ? "bg-emerald-50" : "bg-slate-100"}`}>
                    <Icon className={`text-[15px] ${appt.type === "derma" ? "text-emerald-600" : "text-slate-500"}`} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold text-slate-800 truncate">{appt.patient}</p>
                    <p className="text-xs text-slate-400 truncate">{appt.doctor}</p>
                  </div>
                  <span className="text-xs text-slate-400 font-medium flex items-center gap-1 shrink-0">
                    <MdAccessTime className="text-[12px]" />{appt.time}
                  </span>
                  <span className={`text-[10px] font-bold border px-2 py-0.5 rounded-full shrink-0 ${cfg.badge}`}>
                    {cfg.label}
                  </span>
                </div>
              )
            })}
          </div>
        </div>

        {/* Right column */}
        <div className="space-y-4">

          {/* Doctor status */}
          <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden">
            <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100">
              <h2 className="text-sm font-bold text-slate-800">Doctors Today</h2>
              <NavLink to="/admin/doctor-schedules" className="text-xs font-semibold text-amber-600 hover:text-amber-700 flex items-center gap-0.5 transition-colors">
                Schedules <MdChevronRight className="text-[14px]" />
              </NavLink>
            </div>
            <div className="p-4 space-y-2">
              {doctorStatus.map(doc => (
                <div key={doc.name} className="flex items-center gap-3 p-3 rounded-xl border border-slate-100 hover:bg-slate-50 transition-colors">
                  <div className={`w-2 h-2 rounded-full shrink-0 ${doc.status === "on-duty" ? "bg-emerald-500" : "bg-slate-300"}`} />
                  <div className="flex-1 min-w-0">
                    <p className="text-xs font-bold text-slate-800 truncate">{doc.name}</p>
                    <p className="text-[10px] text-slate-400">{doc.specialty}</p>
                  </div>
                  {doc.status === "on-duty" ? (
                    <span className="text-[10px] font-semibold text-slate-500 shrink-0">
                      {doc.done}/{doc.patients} done
                    </span>
                  ) : (
                    <span className="text-[10px] font-semibold text-slate-300 shrink-0">Off duty</span>
                  )}
                </div>
              ))}
            </div>
          </div>

          {/* Pending doctor requests */}
          <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden">
            <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100">
              <h2 className="text-sm font-bold text-slate-800">Doctor Requests</h2>
              <span className="text-[10px] font-bold bg-amber-50 text-amber-600 border border-amber-200 px-2 py-0.5 rounded-full">
                {pendingRequests.length} pending
              </span>
            </div>
            <div className="p-4 space-y-2">
              {pendingRequests.map(req => (
                <div key={req.id} className="p-3 rounded-xl bg-amber-50/50 border border-amber-100">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="text-xs font-semibold text-slate-800 truncate">{req.item}</p>
                      <p className="text-[10px] text-slate-500 mt-0.5">{req.doctor} · {req.qty} {req.unit}s</p>
                    </div>
                    <div className="flex gap-1 shrink-0">
                      <button className="w-7 h-7 rounded-lg bg-emerald-50 border border-emerald-200 flex items-center justify-center hover:bg-emerald-100 transition-colors">
                        <MdCheck className="text-emerald-600 text-[13px]" />
                      </button>
                      <button className="w-7 h-7 rounded-lg bg-red-50 border border-red-200 flex items-center justify-center hover:bg-red-100 transition-colors">
                        <MdWarning className="text-red-500 text-[13px]" />
                      </button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>

        </div>
      </div>

      {/* Quick links */}
      <div className="bg-white rounded-2xl border border-slate-200 p-5">
        <h2 className="text-sm font-bold text-slate-800 mb-4">Quick Navigation</h2>
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
          {[
            { label: "Reports",          path: "/admin/reports",           icon: MdBarChart,        color: "text-amber-600",   bg: "bg-amber-50"   },
            { label: "Staff Accounts",   path: "/admin/staff-accounts",    icon: MdPeople,          color: "text-sky-600",     bg: "bg-sky-50"     },
            { label: "Doctor Accounts",  path: "/admin/doctor-accounts",   icon: MdMedicalServices, color: "text-violet-600",  bg: "bg-violet-50"  },
            { label: "Schedules",        path: "/admin/doctor-schedules",  icon: MdCalendarToday,   color: "text-emerald-600", bg: "bg-emerald-50" },
            { label: "Appointments",     path: "/admin/appointments",      icon: MdEventAvailable,  color: "text-slate-600",   bg: "bg-slate-100"  },
            { label: "Inventory",        path: "/admin/inventory",         icon: MdInventory2,      color: "text-red-600",     bg: "bg-red-50"     },
          ].map(({ label, path, icon: Icon, color, bg }) => (
            <NavLink key={path} to={path}
              className={`flex flex-col items-center gap-2 p-4 rounded-xl ${bg} hover:opacity-80 transition-opacity`}>
              <Icon className={`text-[22px] ${color}`} />
              <span className={`text-[11px] font-semibold ${color} text-center leading-tight`}>{label}</span>
            </NavLink>
          ))}
        </div>
      </div>
    </div>
  )
}
export default Admin_Dashboard