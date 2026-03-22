import { useState } from "react"
import { NavLink, Outlet } from "react-router-dom"
import logo from '../../assets/logo-removebg.png'
import { MdDashboard, MdCalendarToday, MdEventAvailable, MdHistory, MdPayment, MdChevronLeft, MdNotifications, MdSearch, MdLogout, MdPerson } from "react-icons/md"

// ── Placeholder for non-dashboard pages ──────────────────────────────────────
const OtherPage = () => (
  <div className="flex items-center justify-center h-full min-h-64 text-slate-400 text-sm">
    Page coming soon…
  </div>
)

// ── Nav items ─────────────────────────────────────────────────────────────────
const sideNav = [
  { name: "Dashboard",        path: "/patient",    icon: MdDashboard       },
  { name: "Book Appointment", path: "/patient/book",         icon: MdCalendarToday   },
  { name: "My Appointments",  path: "/patient/appointments", icon: MdEventAvailable  },
  { name: "History",          path: "/patient/history",      icon: MdHistory         },
  { name: "Pay Downpayment",  path: "/patient/pay",          icon: MdPayment         },
]

// ── Layout ────────────────────────────────────────────────────────────────────
const PatientLayout = () => {
  const [collapsed, setCollapsed] = useState(false)

  return (
    <div className="flex h-screen bg-slate-50 overflow-hidden">

      {/* ── Sidebar ─────────────────────────────────────────────────────────── */}
      <aside
        className={`
          relative flex flex-col bg-[#0b1a2c] shrink-0
          transition-[width] duration-300 ease-in-out
          ${collapsed ? "w-[72px]" : "w-60"}
        `}
      >
        {/* Brand */}
        <div className="flex items-center gap-3 px-4 h-16 border-b border-white/5 overflow-hidden">
          <img
            src={logo}
            alt="Carait Clinic logo"
            className="w-9 h-9 rounded-xl object-contain bg-white/10 p-1 shrink-0"
          />
          <div
            className={`
              leading-tight overflow-hidden whitespace-nowrap
              transition-[opacity,max-width] duration-300
              ${collapsed ? "opacity-0 max-w-0" : "opacity-100 max-w-xs"}
            `}
          >
            <p className="text-white font-bold text-[15px] tracking-tight">Carait Clinic</p>
            <span className="text-emerald-400 text-[10px] font-semibold uppercase tracking-widest font-mono">
              Patient
            </span>
          </div>
        </div>

        {/* Section label */}
        <div className="px-3 pt-5 pb-2">
          <p
            className={`
              text-[10px] font-bold text-slate-500 uppercase tracking-widest px-3
              transition-[opacity] duration-200
              ${collapsed ? "opacity-0" : "opacity-100"}
            `}
          >
            My Account
          </p>
        </div>

        {/* Nav links */}
        <nav className="flex-1 px-3 space-y-0.5 overflow-y-auto">
          {sideNav.map(({ name, path, icon: Icon }) => (
            <NavLink
              key={path}
              to={path}
              className={({ isActive }) =>
                `relative flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium
                 transition-colors duration-150 group
                 ${isActive
                   ? "bg-emerald-500/15 text-emerald-400"
                   : "text-slate-400 hover:bg-white/5 hover:text-white"
                 }`
              }
            >
              {({ isActive }) => (
                <>
                  {/* Active pill */}
                  {isActive && (
                    <span className="absolute left-0 top-1/2 -translate-y-1/2 w-[3px] h-5 bg-emerald-400 rounded-r-full" />
                  )}

                  <Icon className="shrink-0 text-[18px]" />

                  {/* Label */}
                  <span
                    className={`
                      whitespace-nowrap overflow-hidden
                      transition-[opacity,max-width] duration-300
                      ${collapsed ? "opacity-0 max-w-0" : "opacity-100 max-w-xs"}
                    `}
                  >
                    {name}
                  </span>

                  {/* Tooltip when collapsed */}
                  {collapsed && (
                    <span className="
                      absolute left-full ml-3 px-2.5 py-1.5
                      bg-slate-800 text-white text-xs rounded-lg
                      whitespace-nowrap shadow-lg border border-white/10
                      opacity-0 pointer-events-none group-hover:opacity-100
                      transition-opacity duration-150 z-50
                    ">
                      {name}
                    </span>
                  )}
                </>
              )}
            </NavLink>
          ))}
        </nav>

        {/* Logout */}
        <div className="px-3 py-4 border-t border-white/5">
          <button className="
            flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium w-full
            text-slate-400 hover:bg-red-500/10 hover:text-red-400 transition-colors duration-150
          ">
            <MdLogout className="shrink-0 text-[18px]" />
            <span
              className={`
                whitespace-nowrap overflow-hidden
                transition-[opacity,max-width] duration-300
                ${collapsed ? "opacity-0 max-w-0" : "opacity-100 max-w-xs"}
              `}
            >
              Logout
            </span>
          </button>
        </div>

        {/* Collapse toggle */}
        <button
          onClick={() => setCollapsed(!collapsed)}
          aria-label="Toggle sidebar"
          className="
            absolute -right-3 top-[72px] z-10
            w-6 h-6 rounded-full bg-[#0b1a2c] border border-white/10
            flex items-center justify-center text-slate-400
            hover:text-white shadow-md transition-all duration-150 hover:scale-110
          "
        >
          <MdChevronLeft
            className={`text-[13px] transition-transform duration-300 ${collapsed ? "rotate-180" : ""}`}
          />
        </button>
      </aside>

      {/* ── Main column ─────────────────────────────────────────────────────── */}
      <div className="flex flex-col flex-1 min-w-0">

        {/* ── Header ──────────────────────────────────────────────────────── */}
        <header className="h-16 bg-white border-b border-slate-100 flex items-center justify-between px-6 shrink-0">

          {/* Search bar */}
          <div className="flex items-center gap-2 bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 w-64 text-sm text-slate-400 hover:border-slate-300 transition-colors cursor-text select-none">
            <MdSearch className="text-[15px]" />
            <span>Search…</span>
          </div>

          {/* Right actions */}
          <div className="flex items-center gap-3">

            {/* Notification bell */}
            <button className="relative w-9 h-9 flex items-center justify-center rounded-xl bg-slate-50 border border-slate-200 text-slate-500 hover:bg-slate-100 transition-colors">
              <MdNotifications className="text-[16px]" />
              <span className="absolute top-2 right-2 w-1.5 h-1.5 bg-emerald-400 rounded-full" />
            </button>

            {/* User pill */}
            <div className="flex items-center gap-2.5 pl-3 border-l border-slate-100">
              <div className="w-8 h-8 rounded-xl bg-emerald-500/15 flex items-center justify-center">
                <MdPerson className="text-[15px] text-emerald-600" />
              </div>
              <div className="leading-tight">
                <p className="text-xs font-semibold text-slate-700">Juan Dela Cruz</p>
                <p className="text-[10px] text-slate-400">Patient</p>
              </div>
            </div>

          </div>
        </header>

        {/* ── Page content ────────────────────────────────────────────────── */}
        <main className="flex-1 overflow-y-auto p-6">
          <Outlet />
        </main>

      </div>
    </div>
  )
}

export default PatientLayout