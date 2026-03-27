import { useState } from "react"
import { NavLink, Outlet, useNavigate } from "react-router-dom"
import logo from '../../assets/logo-removebg.png'
import { useAuth } from '../../context/AuthContext'
import {
  MdDashboard, MdEventAvailable, MdQueuePlayNext,
  MdPeople, MdInventory2, MdChevronLeft, MdNotifications,
  MdSearch, MdLogout, MdPerson, MdLocalShipping
} from "react-icons/md"

const sideNav = [
  { name: "Dashboard",        path: "/staff",                   icon: MdDashboard     },
  { name: "Appointments",     path: "/staff/appointments",      icon: MdEventAvailable },
  { name: "Walk-in Queue",    path: "/staff/walkin",            icon: MdQueuePlayNext  },
  { name: "Patient Records",  path: "/staff/patient-records",   icon: MdPeople         },
  { name: "Inventory",        path: "/staff/inventory",         icon: MdInventory2     },
  // ✅ NEW: Supply Requests page
  { name: "Supply Requests",  path: "/staff/supply-requests",   icon: MdLocalShipping  },
]

const StaffLayout = () => {
  const { user, logout: clearAuth } = useAuth()
  const [collapsed,   setCollapsed]   = useState(false)
  const [loggingOut,  setLoggingOut]  = useState(false)
  const [logoutError, setLogoutError] = useState("")
  const navigate = useNavigate()

  const handleLogout = async () => {
    setLoggingOut(true)
    setLogoutError("")
    try {
      const res = await fetch("/api/staff/logout", { method: "POST", credentials: "include" })
      if (!res.ok) throw new Error("Logout failed")
      navigate("/staff/login")
      clearAuth()
    } catch {
      setLogoutError("Could not log out. Try again.")
      setLoggingOut(false)
    }
  }

  return (
    <div className="flex h-screen bg-slate-50 overflow-hidden">

      {/* ── Sidebar ───────────────────────────────────────────────────────── */}
      <aside className={`relative flex flex-col bg-[#0b1a2c] shrink-0
        transition-[width] duration-300 ease-in-out
        ${collapsed ? "w-[72px]" : "w-60"}`}>

        {/* Brand */}
        <div className="flex items-center gap-3 px-4 h-16 border-b border-white/5 overflow-hidden">
          <img src={logo} alt="Carait Clinic"
            className="w-9 h-9 rounded-xl object-contain bg-white/10 p-1 shrink-0" />
          <div className={`leading-tight overflow-hidden whitespace-nowrap
            transition-[opacity,max-width] duration-300
            ${collapsed ? "opacity-0 max-w-0" : "opacity-100 max-w-xs"}`}>
            <p className="text-white font-bold text-[15px] tracking-tight">Carait Clinic</p>
            <span className="text-sky-400 text-[10px] font-semibold uppercase tracking-widest font-mono">Staff</span>
          </div>
        </div>

        {/* Section label */}
        <div className="px-3 pt-5 pb-2">
          <p className={`text-[10px] font-bold text-slate-500 uppercase tracking-widest px-3
            transition-[opacity] duration-200 ${collapsed ? "opacity-0" : "opacity-100"}`}>
            Management
          </p>
        </div>

        {/* Nav links */}
        <nav className="flex-1 px-3 space-y-0.5 overflow-y-auto">
          {sideNav.map(({ name, path, icon: Icon }) => (
            <NavLink key={path} to={path} end={path === "/staff"}
              className={({ isActive }) =>
                `relative flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium
                 transition-colors duration-150 group
                 ${isActive
                   ? "bg-sky-500/15 text-sky-400"
                   : "text-slate-400 hover:bg-white/5 hover:text-white"
                 }`}>
              {({ isActive }) => (
                <>
                  {isActive && (
                    <span className="absolute left-0 top-1/2 -translate-y-1/2 w-[3px] h-5 bg-sky-400 rounded-r-full" />
                  )}
                  <Icon className="shrink-0 text-[18px]" />
                  <span className={`whitespace-nowrap overflow-hidden transition-[opacity,max-width] duration-300
                    ${collapsed ? "opacity-0 max-w-0" : "opacity-100 max-w-xs"}`}>
                    {name}
                  </span>
                  {collapsed && (
                    <span className="absolute left-full ml-3 px-2.5 py-1.5 bg-slate-800 text-white
                      text-xs rounded-lg whitespace-nowrap shadow-lg border border-white/10
                      opacity-0 pointer-events-none group-hover:opacity-100 transition-opacity duration-150 z-50">
                      {name}
                    </span>
                  )}
                </>
              )}
            </NavLink>
          ))}
        </nav>

        {/* Logout */}
        <div className="px-3 py-4 border-t border-white/5 space-y-1">
          {logoutError && !collapsed && (
            <p className="text-[10px] text-red-400 px-3 pb-1">{logoutError}</p>
          )}
          <button onClick={handleLogout} disabled={loggingOut}
            className="flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium w-full
              text-slate-400 hover:bg-red-500/10 hover:text-red-400 transition-colors duration-150
              disabled:opacity-50 disabled:cursor-not-allowed">
            <MdLogout className={`shrink-0 text-[18px] ${loggingOut ? "animate-spin" : ""}`} />
            <span className={`whitespace-nowrap overflow-hidden transition-[opacity,max-width] duration-300
              ${collapsed ? "opacity-0 max-w-0" : "opacity-100 max-w-xs"}`}>
              {loggingOut ? "Logging out…" : "Logout"}
            </span>
          </button>
        </div>

        {/* Collapse toggle */}
        <button onClick={() => setCollapsed(!collapsed)} aria-label="Toggle sidebar"
          className="absolute -right-3 top-[72px] z-10 w-6 h-6 rounded-full bg-[#0b1a2c]
            border border-white/10 flex items-center justify-center text-slate-400
            hover:text-white shadow-md transition-all duration-150 hover:scale-110">
          <MdChevronLeft className={`text-[13px] transition-transform duration-300 ${collapsed ? "rotate-180" : ""}`} />
        </button>
      </aside>

      {/* ── Main column ───────────────────────────────────────────────────── */}
      <div className="flex flex-col flex-1 min-w-0">

        {/* Header */}
        <header className="h-16 bg-white border-b border-slate-100 flex items-center justify-between px-6 shrink-0">
          <div className="flex items-center gap-2 bg-slate-50 border border-slate-200 rounded-xl px-3 py-2
            w-64 text-sm text-slate-400 hover:border-slate-300 transition-colors cursor-text select-none">
            <MdSearch className="text-[15px]" />
            <span>Search…</span>
          </div>

          <div className="flex items-center gap-3">
            <button className="relative w-9 h-9 flex items-center justify-center rounded-xl bg-slate-50
              border border-slate-200 text-slate-500 hover:bg-slate-100 transition-colors">
              <MdNotifications className="text-[16px]" />
              <span className="absolute top-2 right-2 w-1.5 h-1.5 bg-sky-400 rounded-full" />
            </button>

            <div className="flex items-center gap-2.5 pl-3 border-l border-slate-100">
              <div className="w-8 h-8 rounded-xl bg-sky-500/15 flex items-center justify-center">
                <MdPerson className="text-[15px] text-sky-600" />
              </div>
              <div className="leading-tight">
                <p className="text-xs font-semibold text-slate-700">{user?.full_name || 'Staff Member'}</p>
                <p className="text-[10px] text-slate-400">Staff</p>
              </div>
            </div>
          </div>
        </header>

        <main className="flex-1 overflow-y-auto p-6">
          <Outlet />
        </main>
      </div>
    </div>
  )
}

export default StaffLayout