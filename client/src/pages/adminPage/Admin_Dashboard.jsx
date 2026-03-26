import { useEffect, useState } from 'react'
import { useAuth } from '../../context/AuthContext'
import { getDashboard, getAppointments, getSupplyRequests, resolveSupplyRequest } from '../../services/admin.service'
import { NavLink } from "react-router-dom"
import {
  MdPeople, MdEventAvailable, MdInventory2, MdBarChart,
  MdChevronRight, MdTrendingUp, MdTrendingDown, MdFace,
  MdMedicalServices, MdWarning, MdAccessTime, MdCalendarToday,
  MdCheck
} from "react-icons/md"

const STATUS_CFG = {
  "completed":   { label: "Done",         badge: "bg-slate-100 text-slate-500 border-slate-200"   },
  "in-progress": { label: "In Progress", badge: "bg-violet-50 text-violet-700 border-violet-200" },
  "pending":     { label: "Waiting",      badge: "bg-amber-50  text-amber-700  border-amber-200"  },
}

const Admin_Dashboard = () => {
  const { user } = useAuth()
  const [dashStats, setDashStats] = useState(null)
  const [todayAppts, setTodayAppts] = useState([])
  const [doctorStatus, setDoctorStatus] = useState([])
  const [pendingRequests, setPendingRequests] = useState([])
  const [loading, setLoading] = useState(true)

  const dateRaw = new Date()
  const todayISO = dateRaw.toISOString().split('T')[0]
  const todayDisplay = dateRaw.toLocaleDateString("en-PH", { weekday: "long", year: "numeric", month: "long", day: "numeric" })

  useEffect(() => {
    Promise.all([
      getDashboard(),
      getAppointments(`?date=${todayISO}`),
      getSupplyRequests(),
    ])
      .then(([dash, appts, reqs]) => {
        setDashStats(dash)
        setTodayAppts(appts)
        setDoctorStatus(dash.doctorStatus || [])
        setPendingRequests(reqs.filter(r => r.status === 'pending').slice(0, 3))
      })
      .catch((err) => console.error("Dashboard Load Error:", err))
      .finally(() => setLoading(false))
  }, [todayISO])

  const handleResolve = async (id, status) => {
    try {
      await resolveSupplyRequest(id, status)
      setPendingRequests(prev => prev.filter(r => r.id !== id))
    } catch (err) {
      console.error("Resolution Error:", err)
    }
  }

  // Dynamic stats mapping
  const stats = [
    { label: "Total Patients",     value: dashStats?.totalPatients || "0", change: "+12 this month",  up: true,  color: "text-slate-800",   bg: "bg-white",     border: "border-slate-200"   },
    { label: "Appointments Today", value: todayAppts.length,  change: `${todayAppts.filter(a => a.status === 'pending').length} pending`, up: null,  color: "text-sky-700",     bg: "bg-sky-50",      border: "border-sky-200"     },
    { label: "Staff Members",      value: dashStats?.totalStaff || "0",    change: "All active",       up: null,  color: "text-slate-800",   bg: "bg-white",      border: "border-slate-200"   },
    { label: "Doctors",            value: dashStats?.totalDoctors || "0",  change: `${doctorStatus.filter(d => d.status === 'on-duty').length} on duty`, up: null,  color: "text-slate-800",   bg: "bg-white",      border: "border-slate-200"   },
    { label: "Monthly Revenue",    value: `₱${dashStats?.revenue || '0'}k`, change: "+8% vs last month", up: true, color: "text-emerald-700", bg: "bg-emerald-50",  border: "border-emerald-200" },
    { label: "Low Stock Items",    value: dashStats?.lowStockCount || "0", change: "Needs restocking", up: false, color: "text-red-600",     bg: "bg-red-50",      border: "border-red-200"     },
  ]

  if (loading) return <div className="p-10 text-center text-slate-500 font-medium">Loading Dashboard...</div>

  return (
    <div className="space-y-5 max-w-6xl">

      {/* Banner */}
      <div className="relative overflow-hidden rounded-2xl bg-[#0b1a2c] px-7 py-6 shadow-md">
        <div className="absolute -top-8 -right-8 w-40 h-40 rounded-full bg-amber-500/10" />
        <div className="absolute -bottom-10 right-32 w-24 h-24 rounded-full bg-sky-500/10" />
        <div className="relative">
          <p className="text-slate-400 text-sm mb-0.5">{todayDisplay}</p>
          <h1 className="text-white text-2xl font-black tracking-tight">
            Welcome back, <span className="text-amber-400">{user?.full_name || 'Admin'}</span>
          </h1>
          <p className="text-slate-400 text-sm mt-1.5">
            <span className="text-white font-semibold">{todayAppts.length} appointments</span> today ·{" "}
            <span className="text-emerald-400 font-semibold">{doctorStatus.filter(d => d.status === 'on-duty').length} doctors on duty</span> ·{" "}
            <span className="text-red-400 font-semibold">{dashStats?.lowStockCount || 0} low-stock items</span>
          </p>
        </div>
      </div>

      {/* Stats grid */}
      <div className="grid grid-cols-2 lg:grid-cols-3 gap-4">
        {stats.map(({ label, value, change, up, color, bg, border }) => (
          <div key={label} className={`${bg} border ${border} rounded-2xl px-5 py-4 transition-transform hover:scale-[1.02]`}>
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
        <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden shadow-sm">
          <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100">
            <h2 className="text-sm font-bold text-slate-800">Today's Appointments</h2>
            <NavLink to="/admin/appointments" className="text-xs font-semibold text-amber-600 hover:text-amber-700 flex items-center gap-0.5 transition-colors">
              View all <MdChevronRight className="text-[14px]" />
            </NavLink>
          </div>
          <div className="divide-y divide-slate-100">
            {todayAppts.length > 0 ? todayAppts.map(appt => {
              const cfg  = STATUS_CFG[appt.status] || STATUS_CFG['pending']
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
            }) : (
              <p className="p-10 text-center text-xs text-slate-400">No appointments scheduled for today.</p>
            )}
          </div>
        </div>

        {/* Right column */}
        <div className="space-y-4">

          {/* Doctor status */}
          <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden shadow-sm">
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
          <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden shadow-sm">
            <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100">
              <h2 className="text-sm font-bold text-slate-800">Doctor Requests</h2>
              <span className="text-[10px] font-bold bg-amber-50 text-amber-600 border border-amber-200 px-2 py-0.5 rounded-full">
                {pendingRequests.length} pending
              </span>
            </div>
            <div className="p-4 space-y-2">
              {pendingRequests.length > 0 ? pendingRequests.map(req => (
                <div key={req.id} className="p-3 rounded-xl bg-amber-50/50 border border-amber-100">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="text-xs font-semibold text-slate-800 truncate">{req.item}</p>
                      <p className="text-[10px] text-slate-500 mt-0.5">{req.doctor} · {req.qty} {req.unit}s</p>
                    </div>
                    <div className="flex gap-1 shrink-0">
                      <button 
                        onClick={() => handleResolve(req.id, 'approved')}
                        className="w-7 h-7 rounded-lg bg-emerald-50 border border-emerald-200 flex items-center justify-center hover:bg-emerald-100 transition-colors"
                      >
                        <MdCheck className="text-emerald-600 text-[13px]" />
                      </button>
                      <button 
                        onClick={() => handleResolve(req.id, 'rejected')}
                        className="w-7 h-7 rounded-lg bg-red-50 border border-red-200 flex items-center justify-center hover:bg-red-100 transition-colors"
                      >
                        <MdWarning className="text-red-500 text-[13px]" />
                      </button>
                    </div>
                  </div>
                </div>
              )) : (
                <p className="text-[10px] text-center text-slate-400 py-2">No pending requests.</p>
              )}
            </div>
          </div>

        </div>
      </div>

      {/* Quick links */}
      <div className="bg-white rounded-2xl border border-slate-200 p-5 shadow-sm">
        <h2 className="text-sm font-bold text-slate-800 mb-4">Quick Navigation</h2>
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
          {[
            { label: "Reports",          path: "/admin/reports",           icon: MdBarChart,         color: "text-amber-600",   bg: "bg-amber-50"   },
            { label: "Staff Accounts",   path: "/admin/staff-accounts",    icon: MdPeople,           color: "text-sky-600",     bg: "bg-sky-50"     },
            { label: "Doctor Accounts",  path: "/admin/doctor-accounts",   icon: MdMedicalServices, color: "text-violet-600",  bg: "bg-violet-50"  },
            { label: "Schedules",        path: "/admin/doctor-schedules",  icon: MdCalendarToday,   color: "text-emerald-600", bg: "bg-emerald-50" },
            { label: "Appointments",     path: "/admin/appointments",      icon: MdEventAvailable,  color: "text-slate-600",   bg: "bg-slate-100"  },
            { label: "Inventory",        path: "/admin/inventory",         icon: MdInventory2,      color: "text-red-600",     bg: "bg-red-50"     },
          ].map(({ label, path, icon: Icon, color, bg }) => (
            <NavLink key={path} to={path}
              className={`flex flex-col items-center gap-2 p-4 rounded-xl ${bg} hover:opacity-80 transition-all hover:-translate-y-1 shadow-sm`}>
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