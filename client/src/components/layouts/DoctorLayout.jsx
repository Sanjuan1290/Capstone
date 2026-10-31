// client/src/components/layouts/DoctorLayout.jsx
// REDESIGNED: Mobile bottom nav, slide-in drawer, violet theme, responsive

import { useCallback, useEffect, useState } from "react"
import { NavLink, Outlet, useNavigate } from "react-router-dom"
import {
  MdDashboard, MdCalendarToday, MdMedicalServices,
  MdInventory2, MdChevronLeft, MdLogout, MdPerson,
  MdSchedule, MdMenu, MdClose,
  MdSettings, MdDarkMode, MdLightMode, MdHistory,
} from "react-icons/md"
import { useAuth } from '../../context/AuthContext'
import { useTheme } from '../../context/ThemeContext'
import NotificationBell from '../NotificationBell'
import ProfileAvatar from '../ProfileAvatar'
import { doctorClinicLabel } from '../../utils/doctor'
import { useSSE } from '../../hooks/useSSE'
import { playNotificationSound } from '../../utils/notificationSound'
import { getDashboard } from '../../services/doctor.service'

const sideNav = [
  { name: 'Dashboard',          path: '/doctor',                    icon: MdDashboard,     short: 'Home'     },
  { name: 'Appointments',       path: '/doctor/appointments',       icon: MdCalendarToday, short: 'Appts', badge: 'today' },
  { name: 'Past Consultations', path: '/doctor/consultation-history', icon: MdHistory, short: 'History' },
  { name: 'My Schedule',        path: '/doctor/schedule',           icon: MdSchedule,      short: 'Hours'    },
]

const DoctorLayout = () => {
  const { user, logout: clearAuth, checkAuth } = useAuth()
  const [switchBusy,setSwitchBusy]=useState(false)
  const [switchError,setSwitchError]=useState('')
  const { theme, toggleTheme } = useTheme()
  const [collapsed,   setCollapsed]   = useState(false)
  const [mobileOpen,  setMobileOpen]  = useState(false)
  const [loggingOut,  setLoggingOut]  = useState(false)
  const [logoutError, setLogoutError] = useState('')
  const [todayRemaining, setTodayRemaining] = useState(0)
  const navigate = useNavigate()
  const loadAppointmentCount = useCallback(() => {
    if(!user?.branch_id)return
    getDashboard().then((data) => setTodayRemaining(Number(data?.remainingToday || 0))).catch(() => {})
  }, [user?.branch_id])
  useEffect(() => { loadAppointmentCount() }, [loadAppointmentCount])
  const handleSSEMessage = useCallback((eventName) => {
    if (eventName === 'notification_created') {
      playNotificationSound()
      window.dispatchEvent(new CustomEvent('clinic:notifications-refresh'))
      return
    }
    if (['appointment_updated', 'queue_updated', 'consultation_saved', 'supply_request_resolved'].includes(eventName)) {
      window.dispatchEvent(new CustomEvent('clinic:notifications-refresh'))
      // useSSE centralizes branch-aware data invalidation and refresh delivery.
      if (['appointment_updated','queue_updated','consultation_saved'].includes(eventName)) loadAppointmentCount()
    }
  }, [loadAppointmentCount])

  useSSE('doctor', user?.id, handleSSEMessage)

  const switchBranch = async branchId => {
    setSwitchBusy(true);setSwitchError('')
    try {
      const response=await fetch('/api/doctor/branches/select',{method:'POST',credentials:'include',headers:{'Content-Type':'application/json'},body:JSON.stringify({branch_id:branchId})})
      const data=await response.json()
      if(!response.ok)throw new Error(data.message||'Branch change failed.')
      await checkAuth()
      // Clear all cached consultation/appointment state from the previous branch.
      window.location.assign('/doctor')
    }catch(e){setSwitchError(e.message)}finally{setSwitchBusy(false)}
  }

  const handleLogout = async () => {
    if (!window.confirm('Are you sure you want to log out of Carait Clinic?')) return
    setLoggingOut(true)
    setLogoutError('')
    try {
      await clearAuth()
      navigate('/doctor/login')
    } catch {
      setLogoutError('Could not log out. Try again.')
      setLoggingOut(false)
    }
  }

  const NavItem = (item) => {
    const IconComponent = item.icon
    const badge = item.badge === 'today' ? todayRemaining : 0
    return (
    <NavLink
      to={item.path}
      end={item.path === '/doctor'}
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
          <IconComponent className="shrink-0 text-[18px]" />
          <span className={`min-w-0 flex-1 whitespace-nowrap overflow-hidden transition-[opacity,max-width] duration-300
            ${collapsed ? 'opacity-0 max-w-0' : 'opacity-100 max-w-xs'}`}>
            {item.name}
          </span>
          {badge > 0 && <span className={`min-w-6 rounded-full bg-violet-400 px-1.5 py-0.5 text-center text-[10px] font-black text-[#0b1a2c] ${collapsed ? 'absolute -right-1 -top-1' : ''}`}>{badge > 99 ? '99+' : badge}</span>}
          {collapsed && (
            <span className="absolute left-full ml-3 px-2.5 py-1.5 bg-slate-800 text-white
              text-xs rounded-lg whitespace-nowrap shadow-lg border border-white/10
              opacity-0 pointer-events-none group-hover:opacity-100 transition-opacity z-50">
              {item.name}
            </span>
          )}
        </>
      )}
    </NavLink>
    )
  }

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
          <img src="/logo.png" alt="Carait Clinic"
            className="w-9 h-9 rounded-xl object-contain bg-white/10 p-1 shrink-0" />
          <div className={`leading-tight overflow-hidden whitespace-nowrap
            transition-[opacity,max-width] duration-300
            ${collapsed ? 'opacity-0 max-w-0' : 'opacity-100 max-w-xs'}`}>
            <p className="text-white font-bold text-[15px] tracking-tight">Carait Clinic</p>
            <span className="block text-violet-400 text-[10px] font-semibold uppercase tracking-widest font-mono">Doctor Portal</span>
            <span className="block truncate text-slate-300 text-[11px] font-medium" title={user?.branch_name || ''}>{user?.branch_name || 'Select branch'}</span>
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
              <p className="text-[10px] text-violet-400 font-semibold truncate">{doctorClinicLabel(user)}</p>
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

        {user?.branches?.length > 1 && <div className="mx-3 my-3 rounded-xl border border-white/10 bg-white/5 p-2">
          <label htmlFor="doctor-branch-switch" className="mb-1 block text-[10px] font-semibold uppercase text-violet-200">Working branch</label>
          <select id="doctor-branch-switch" value={user.branch_id||''} onChange={e=>switchBranch(Number(e.target.value))} disabled={switchBusy} className="w-full rounded-lg bg-slate-800 p-2 text-xs text-white">
            <option value="" disabled>Select a branch</option>
            {user.branches.map(b=><option key={b.id} value={b.id}>{b.name}</option>)}
          </select>
          {switchError&&<p className="mt-2 text-xs text-red-300">{switchError}</p>}
        </div>}
        {/* Nav */}
        <nav className="portal-sidebar-scroll flex-1 px-3 space-y-0.5 overflow-y-auto">
          {sideNav.map(item => <NavItem key={item.path} {...item} />)}
        </nav>

        {/* Logout */}
        <div className="px-3 py-4 border-t border-white/5 space-y-1 shrink-0">
          {logoutError && !collapsed && (
            <p className="text-[10px] text-red-400 px-3 pb-1">{logoutError}</p>
          )}
          <button onClick={handleLogout} disabled={loggingOut}
            className="flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium w-full
              bg-red-500/15 text-red-400 hover:bg-red-500/25 hover:text-red-300 transition-colors
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

          <div className="hidden items-center gap-2 ml-2 md:flex lg:hidden">
            <img src="/logo.png" alt="Carait" className="w-7 h-7 rounded-lg object-contain bg-violet-50 p-0.5" />
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
                <p className="text-[10px] text-slate-400">{doctorClinicLabel(user)}</p>
              </div>
            </div>
            <button onClick={handleLogout} disabled={loggingOut}
              className="lg:hidden w-9 h-9 flex items-center justify-center rounded-xl bg-red-50 border border-red-100 text-red-400">
              <MdLogout className={`text-[18px] ${loggingOut ? 'animate-spin' : ''}`} />
            </button>
          </div>
        </header>

        {/* Content */}
        <main className="flex-1 min-w-0 overflow-y-auto p-4 portal-mobile-content lg:p-6">
          <div className="mx-auto w-full max-w-[1600px]">
            {user?.requires_branch_selection||!user?.branch_id ? <section className="mx-auto max-w-lg space-y-4 rounded-2xl border border-violet-200 bg-white p-6">
              <h2 className="text-xl font-bold text-slate-900">Select your clinic branch</h2>
              <p className="text-sm text-slate-600">Choose a branch to view only its appointments, patient history, and schedules.</p>
              {switchError&&<p role="alert" className="rounded-xl bg-red-50 p-3 text-sm text-red-700">{switchError}</p>}
              {user?.branches?.map(b=><button type="button" key={b.id} disabled={switchBusy} onClick={()=>switchBranch(b.id)} className="block w-full rounded-xl border border-violet-200 px-4 py-3 text-left font-semibold text-violet-800 hover:bg-violet-50">{b.name}</button>)}
            </section> : <Outlet />}
          </div>
        </main>

        {/* Mobile bottom nav */}
        <nav className="lg:hidden fixed bottom-0 left-0 right-0 z-30 portal-mobile-nav bg-white border-t border-slate-100
          flex items-center justify-around px-1 shadow-[0_-4px_20px_rgba(0,0,0,0.06)]">
          {sideNav.map((item) => {
            const IconComponent = item.icon
            const badge = item.badge === 'today' ? todayRemaining : 0
            return (
            <NavLink key={item.path} to={item.path} end={item.path === '/doctor'}
              className={({ isActive }) =>
                `flex flex-col items-center justify-center gap-0.5 px-2 py-1.5 rounded-xl
                 transition-all min-w-[52px]
                 ${isActive ? 'text-violet-600' : 'text-slate-400'}`}>
              {({ isActive }) => (
                <>
                  <div className={`relative w-8 h-8 rounded-xl flex items-center justify-center
                    ${isActive ? 'bg-violet-50' : ''}`}>
                    <IconComponent className={`text-[20px] ${isActive ? 'text-violet-600' : ''}`} />
                    {badge > 0 && <span className="absolute -right-2 -top-1 min-w-4 rounded-full bg-violet-600 px-1 text-center text-[9px] font-black text-white">{badge > 99 ? '99+' : badge}</span>}
                  </div>
                  <span className={`text-[9px] font-bold ${isActive ? 'text-violet-600' : 'text-slate-400'}`}>
                    {item.short}
                  </span>
                </>
              )}
            </NavLink>
          )})}
        </nav>
      </div>
    </div>
  )
}

export default DoctorLayout


