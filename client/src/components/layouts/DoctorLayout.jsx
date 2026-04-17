// client/src/components/layouts/DoctorLayout.jsx
// REDESIGNED: Mobile bottom nav, slide-in drawer, violet theme, responsive

import { useState } from "react"
import { NavLink, Outlet, useNavigate } from "react-router-dom"
import logo from '../../assets/logo-removebg.png'
import {
  MdDashboard, MdCalendarToday, MdMedicalServices,
  MdInventory2, MdChevronLeft, MdLogout, MdPerson,
  MdSchedule, MdMenu, MdClose,
  MdSettings, MdDarkMode, MdLightMode,
} from "react-icons/md"
import { useAuth } from '../../context/AuthContext'
import { useTheme } from '../../context/ThemeContext'
import NotificationBell from '../NotificationBell'
import ProfileAvatar from '../ProfileAvatar'

const sideNav = [
  { name: 'Dashboard',          path: '/doctor',                    icon: MdDashboard,     short: 'Home'     },
  { name: 'Daily Appointments', path: '/doctor/daily-appointments', icon: MdCalendarToday, short: 'Schedule' },
  { name: 'My Schedule',        path: '/doctor/schedule',           icon: MdSchedule,      short: 'Hours'    },
  { name: 'Supply Requests',    path: '/doctor/request',            icon: MdInventory2,    short: 'Supplies' },
]

const DoctorLayout = () => {
  const { user, logout: clearAuth } = useAuth()
  const { theme, toggleTheme } = useTheme()
  const [collapsed,   setCollapsed]   = useState(false)
  const [mobileOpen,  setMobileOpen]  = useState(false)
  const [loggingOut,  setLoggingOut]  = useState(false)
  const [logoutError, setLogoutError] = useState('')
  const navigate = useNavigate()

  const handleLogout = async () => {
    setLoggingOut(true)
    setLogoutError('')
    try {
      await fetch('/api/doctor/logout', { method: 'POST', credentials: 'include' })
      navigate('/doctor/login')
      clearAuth()
    } catch {
      setLogoutError('Could not log out. Try again.')
      setLoggingOut(false)
    }
  }

  const NavItem = ({ name, path, icon: Icon, short }) => (
    <NavLink
      to={path}
      end={path === '/doctor'}
      onClick={() => setMobileOpen(false)}
      className={({ isActive }) =>
        `relative flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium
         transition-colors duration-150 group
         ${isActive
           ? 'bg-violet-500/15 text-violet-400'
           : 'text-slate-400 hover:bg-white/5 hover:text-white'}`}
    >
      {({ isActive }) => (
        <>
          {isActive && (
            <span className="absolute left-0 top-1/2 -translate-y-1/2 w-[3px] h-5 bg-violet-400 rounded-r-full" />
          )}
          <Icon className="shrink-0 text-[18px]" />
          <span className={`whitespace-nowrap overflow-hidden transition-[opacity,max-width] duration-300
            ${collapsed ? 'opacity-0 max-w-0' : 'opacity-100 max-w-xs'}`}>
            {name}
          </span>
          {collapsed && (
            <span className="absolute left-full ml-3 px-2.5 py-1.5 bg-slate-800 text-white
              text-xs rounded-lg whitespace-nowrap shadow-lg border border-white/10
              opacity-0 pointer-events-none group-hover:opacity-100 transition-opacity z-50">
              {name}
            </span>
          )}
        </>
      )}
    </NavLink>
  )

  return (
    <div className="flex h-screen bg-slate-50 overflow-hidden">

      {/* Mobile overlay */}
      {mobileOpen && (
        <div className="fixed inset-0 z-40 bg-black/60 backdrop-blur-sm lg:hidden"
          onClick={() => setMobileOpen(false)} />
      )}

      {/* Sidebar */}
      <aside className={`
        fixed lg:relative inset-y-0 left-0 z-50
        flex flex-col bg-[#0b1a2c] shrink-0
        transition-all duration-300 ease-in-out
        ${collapsed ? 'w-[72px]' : 'w-64'}
        ${mobileOpen ? 'translate-x-0' : '-translate-x-full lg:translate-x-0'}
      `}>

        {/* Brand */}
        <div className="flex items-center gap-3 px-4 h-16 border-b border-white/5 overflow-hidden shrink-0">
          <img src={logo} alt="Carait Clinic"
            className="w-9 h-9 rounded-xl object-contain bg-white/10 p-1 shrink-0" />
          <div className={`leading-tight overflow-hidden whitespace-nowrap
            transition-[opacity,max-width] duration-300
            ${collapsed ? 'opacity-0 max-w-0' : 'opacity-100 max-w-xs'}`}>
            <p className="text-white font-bold text-[15px] tracking-tight">Carait Clinic</p>
            <span className="text-violet-400 text-[10px] font-semibold uppercase tracking-widest font-mono">
              Doctor Portal
            </span>
          </div>
          <button onClick={() => setMobileOpen(false)}
            className="ml-auto lg:hidden text-slate-400 hover:text-white">
            <MdClose className="text-[20px]" />
          </button>
        </div>

        {/* User pill */}
        <div className={`mx-3 mt-4 mb-2 p-3 rounded-xl bg-white/5 border border-white/5
          transition-all duration-300 ${collapsed ? 'opacity-0 pointer-events-none h-0 p-0 m-0 border-0' : ''}`}>
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-violet-500/20 flex items-center justify-center shrink-0">
              <MdPerson className="text-violet-400 text-[18px]" />
            </div>
            <div className="min-w-0">
              <p className="text-sm font-bold text-white truncate">{user?.full_name || 'Doctor'}</p>
              <p className="text-[10px] text-violet-400 font-semibold truncate">{user?.specialty || 'Physician'}</p>
            </div>
          </div>
        </div>

        {/* Section label */}
        <div className="px-3 pt-3 pb-1">
          <p className={`text-[10px] font-bold text-slate-500 uppercase tracking-widest px-3
            transition-opacity duration-200 ${collapsed ? 'opacity-0' : 'opacity-100'}`}>
            Clinical
          </p>
        </div>

        {/* Nav */}
        <nav className="flex-1 px-3 space-y-0.5 overflow-y-auto">
          {sideNav.map(item => <NavItem key={item.path} {...item} />)}
        </nav>

        {/* Logout */}
        <div className="px-3 py-4 border-t border-white/5 space-y-1 shrink-0">
          {logoutError && !collapsed && (
            <p className="text-[10px] text-red-400 px-3 pb-1">{logoutError}</p>
          )}
          <button onClick={handleLogout} disabled={loggingOut}
            className="flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium w-full
              text-slate-400 hover:bg-red-500/10 hover:text-red-400 transition-colors
              disabled:opacity-50 disabled:cursor-not-allowed">
            <MdLogout className={`shrink-0 text-[18px] ${loggingOut ? 'animate-spin' : ''}`} />
            <span className={`whitespace-nowrap overflow-hidden transition-[opacity,max-width] duration-300
              ${collapsed ? 'opacity-0 max-w-0' : 'opacity-100 max-w-xs'}`}>
              {loggingOut ? 'Logging out…' : 'Logout'}
            </span>
          </button>
        </div>

        {/* Collapse toggle — desktop */}
        <button onClick={() => setCollapsed(!collapsed)} aria-label="Toggle sidebar"
          className="hidden lg:flex absolute -right-3 top-[72px] z-10 w-6 h-6 rounded-full bg-[#0b1a2c]
            border border-white/10 items-center justify-center text-slate-400
            hover:text-white shadow-md transition-all hover:scale-110">
          <MdChevronLeft className={`text-[13px] transition-transform duration-300 ${collapsed ? 'rotate-180' : ''}`} />
        </button>
      </aside>

      {/* Main */}
      <div className="flex flex-col flex-1 min-w-0 min-h-0">

        {/* Header */}
        <header className="h-14 lg:h-16 bg-white border-b border-slate-100 flex items-center justify-between px-4 lg:px-6 shrink-0 z-30">
          <button onClick={() => setMobileOpen(true)}
            className="lg:hidden w-9 h-9 flex items-center justify-center rounded-xl bg-slate-50 border border-slate-200 text-slate-500">
            <MdMenu className="text-[20px]" />
          </button>

          <div className="lg:hidden flex items-center gap-2 ml-2">
            <img src={logo} alt="Carait" className="w-7 h-7 rounded-lg object-contain bg-violet-50 p-0.5" />
            <p className="text-sm font-bold text-slate-800">Doctor Portal</p>
          </div>

          <div className="hidden lg:block" />

          <div className="flex items-center gap-3">
            <NotificationBell role="doctor" />
            <button onClick={toggleTheme} className="w-10 h-10 rounded-xl border border-slate-200 text-slate-500 hover:bg-slate-50">
              {theme === 'dark' ? <MdLightMode className="text-[18px] mx-auto" /> : <MdDarkMode className="text-[18px] mx-auto" />}
            </button>
            <NavLink to="/doctor/settings" className="w-10 h-10 rounded-xl border border-slate-200 text-slate-500 hover:bg-slate-50 flex items-center justify-center">
              <MdSettings className="text-[18px]" />
            </NavLink>
            <div className="hidden lg:flex items-center gap-2.5 pl-3 border-l border-slate-100">
              <ProfileAvatar user={user} size="sm" />
              <div className="leading-tight">
                <p className="text-xs font-semibold text-slate-700">{user?.full_name || 'Doctor'}</p>
                <p className="text-[10px] text-slate-400">{user?.specialty || 'Physician'}</p>
              </div>
            </div>
            <button onClick={handleLogout} disabled={loggingOut}
              className="lg:hidden w-9 h-9 flex items-center justify-center rounded-xl bg-red-50 border border-red-100 text-red-400">
              <MdLogout className={`text-[18px] ${loggingOut ? 'animate-spin' : ''}`} />
            </button>
          </div>
        </header>

        {/* Content */}
        <main className="flex-1 overflow-y-auto p-4 lg:p-6 pb-20 lg:pb-6">
          <Outlet />
        </main>

        {/* Mobile bottom nav */}
        <nav className="lg:hidden fixed bottom-0 left-0 right-0 z-30 bg-white border-t border-slate-100
          flex items-center justify-around px-1 h-16 shadow-[0_-4px_20px_rgba(0,0,0,0.06)]">
          {sideNav.map(({ name, path, icon: Icon, short }) => (
            <NavLink key={path} to={path} end={path === '/doctor'}
              className={({ isActive }) =>
                `flex flex-col items-center justify-center gap-0.5 px-2 py-1.5 rounded-xl
                 transition-all min-w-[52px]
                 ${isActive ? 'text-violet-600' : 'text-slate-400'}`}>
              {({ isActive }) => (
                <>
                  <div className={`w-8 h-8 rounded-xl flex items-center justify-center
                    ${isActive ? 'bg-violet-50' : ''}`}>
                    <Icon className={`text-[20px] ${isActive ? 'text-violet-600' : ''}`} />
                  </div>
                  <span className={`text-[9px] font-bold ${isActive ? 'text-violet-600' : 'text-slate-400'}`}>
                    {short}
                  </span>
                </>
              )}
            </NavLink>
          ))}
        </nav>
      </div>
    </div>
  )
}

export default DoctorLayout
