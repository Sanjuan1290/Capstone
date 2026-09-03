import { useCallback, useEffect, useMemo, useState } from 'react'
import { NavLink, Outlet, useNavigate } from 'react-router-dom'
import { useAuth } from '../../context/AuthContext'
import { useTheme } from '../../context/ThemeContext'
import NotificationBell from '../NotificationBell'
import ProfileAvatar from '../ProfileAvatar'
import { useSSE } from '../../hooks/useSSE'
import { playNotificationSound } from '../../utils/notificationSound'
import { getDashboard } from '../../services/admin.service'
import {
  MdDashboard, MdEventAvailable, MdPeople, MdMedicalServices, MdCalendarToday, MdInventory2,
  MdBarChart, MdChevronLeft, MdLogout, MdAdminPanelSettings, MdMenu, MdClose, MdSettings,
  MdDarkMode, MdLightMode, MdLanguage, MdEdit, MdPayments, MdHistory, MdBusiness, MdViewList,
} from 'react-icons/md'

const GROUPS = [
  { label: 'Overview', items: [{ name: 'Dashboard', path: '/admin', icon: MdDashboard, short: 'Home' }] },
  { label: 'Clinic Operations', items: [
    { name: 'Appointments', path: '/admin/appointments', icon: MdEventAvailable, short: 'Appts', badge: 'pending' },
    { name: 'Patient Booking', path: '/admin/patient-booking', icon: MdEdit, short: 'Booking' },
  ] },
  { label: 'Billing & Stock', items: [
    { name: 'Billing', path: '/admin/billing', icon: MdPayments, short: 'Billing' },
    { name: 'Service Catalog', path: '/admin/service-catalog', icon: MdViewList, short: 'Services' },
    { name: 'Inventory', path: '/admin/inventory', icon: MdInventory2, short: 'Stock' },
    { name: 'Stock Transfers', path: '/admin/supply-requests', icon: MdInventory2, short: 'Transfer' },
  ] },
  { label: 'People', items: [
    { name: 'Staff Accounts', path: '/admin/staff-accounts', icon: MdPeople, short: 'Staff' },
    { name: 'Doctor Accounts', path: '/admin/doctor-accounts', icon: MdMedicalServices, short: 'Doctors' },
    { name: 'Doctor Schedules', path: '/admin/doctor-schedules', icon: MdCalendarToday, short: 'Schedule' },
  ] },
  { label: 'Insights & System', items: [
    { name: 'Reports', path: '/admin/reports', icon: MdBarChart, short: 'Reports' },
    { name: 'Audit Logs', path: '/admin/audit-logs', icon: MdHistory, short: 'Audit' },
    { name: 'Clinic Settings', path: '/admin/clinic-settings', icon: MdBusiness, short: 'Clinic' },
    { name: 'Landing Page', path: '/admin/landingpage', icon: MdLanguage, short: 'Site' },
  ] },
]

const AdminLayout = () => {
  const { user, logout: clearAuth } = useAuth()
  const { theme, toggleTheme } = useTheme()
  const [collapsed, setCollapsed] = useState(false)
  const [mobileOpen, setMobileOpen] = useState(false)
  const [loggingOut, setLoggingOut] = useState(false)
  const [logoutError, setLogoutError] = useState('')
  const [pending, setPending] = useState(0)
  const navigate = useNavigate()

  const loadCounts = useCallback(() => getDashboard().then((data) => setPending(Number(data?.pendingApprovals || 0))).catch(() => {}), [])
  useEffect(() => { loadCounts() }, [loadCounts])

  const handleSSEMessage = useCallback((eventName) => {
    if (eventName === 'notification_created') playNotificationSound()
    if (['notification_created','appointment_updated','queue_updated','consultation_saved','supply_request_resolved','billing_finalized','billing_paid'].includes(eventName)) {
      window.dispatchEvent(new CustomEvent('clinic:notifications-refresh'))
      window.dispatchEvent(new CustomEvent('clinic:refresh', { detail: { eventName } }))
      if (eventName === 'appointment_updated') loadCounts()
    }
  }, [loadCounts])
  useSSE('admin', user?.id, handleSSEMessage)

  const handleLogout = async () => {
    setLoggingOut(true); setLogoutError('')
    try { await fetch('/api/admin/logout', { method: 'POST', credentials: 'include' }); clearAuth(); navigate('/admin/login') }
    catch { setLogoutError('Could not log out. Try again.'); setLoggingOut(false) }
  }

  const badgeFor = (item) => item.badge === 'pending' ? pending : 0
  const NavItem = ({ item }) => {
    const Icon = item.icon; const badge = badgeFor(item)
    return <NavLink to={item.path} end={item.path === '/admin'} onClick={() => setMobileOpen(false)} className={({ isActive }) => `relative flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition-colors group ${isActive ? 'bg-amber-500/15 text-amber-400' : 'text-slate-400 hover:bg-white/5 hover:text-white'}`}>
      {({ isActive }) => <>{isActive && <span className="absolute left-0 top-1/2 h-5 w-[3px] -translate-y-1/2 rounded-r-full bg-amber-400" />}<Icon className="shrink-0 text-[19px]" /><span className={`min-w-0 flex-1 whitespace-nowrap transition-all ${collapsed ? 'max-w-0 overflow-hidden opacity-0' : 'max-w-xs opacity-100'}`}>{item.name}</span>{badge > 0 && <span className={`min-w-6 rounded-full bg-amber-400 px-1.5 py-0.5 text-center text-[10px] font-black text-[#0b1a2c] ${collapsed ? 'absolute -right-1 -top-1' : ''}`}>{badge > 99 ? '99+' : badge}</span>}</>}
    </NavLink>
  }

  const mobileNav = useMemo(() => [GROUPS[0].items[0], GROUPS[1].items[0], GROUPS[2].items[0], GROUPS[2].items[2], GROUPS[4].items[0]], [])

  return <div className="flex h-screen overflow-hidden bg-slate-50">
    {mobileOpen && <div className="fixed inset-0 z-40 bg-black/60 backdrop-blur-sm lg:hidden" onClick={() => setMobileOpen(false)} />}
    <aside className={`fixed inset-y-0 left-0 z-50 flex shrink-0 flex-col bg-[#0b1a2c] transition-all duration-300 lg:relative ${collapsed ? 'w-[72px]' : 'w-64'} ${mobileOpen ? 'translate-x-0' : '-translate-x-full lg:translate-x-0'}`}>
      <div className="flex h-16 shrink-0 items-center gap-3 overflow-hidden border-b border-white/5 px-4"><img src="/logo.png" alt="Carait Clinic" className="h-9 w-9 shrink-0 rounded-xl bg-white/10 object-contain p-1" /><div className={`overflow-hidden whitespace-nowrap leading-tight transition-all ${collapsed ? 'max-w-0 opacity-0' : 'max-w-xs opacity-100'}`}><p className="text-[15px] font-bold text-white">Carait Clinic</p><span className="font-mono text-[10px] font-semibold uppercase tracking-widest text-amber-400">Admin Portal</span></div><button onClick={() => setMobileOpen(false)} className="ml-auto text-slate-400 lg:hidden"><MdClose className="text-xl" /></button></div>
      <div className={`mx-3 mt-4 rounded-xl border border-white/5 bg-white/5 p-3 ${collapsed ? 'hidden' : ''}`}><div className="flex items-center gap-3"><div className="flex h-9 w-9 items-center justify-center rounded-xl bg-amber-500/20"><MdAdminPanelSettings className="text-lg text-amber-400" /></div><div className="min-w-0"><p className="truncate text-sm font-bold text-white">{user?.full_name || 'Admin'}</p><p className="text-[10px] font-semibold uppercase tracking-wider text-amber-400">Administrator</p></div></div></div>
      <nav className="flex-1 overflow-y-auto px-3 pb-4 pt-2">{GROUPS.map((group) => <div key={group.label} className="mb-3"><p className={`mb-1 px-3 text-[10px] font-bold uppercase tracking-[0.16em] text-slate-500 ${collapsed ? 'sr-only' : ''}`}>{group.label}</p><div className="space-y-0.5">{group.items.map((item) => <NavItem key={item.path} item={item} />)}</div></div>)}</nav>
      <div className="shrink-0 border-t border-white/5 px-3 py-4">{logoutError && !collapsed && <p className="px-3 pb-2 text-[10px] text-red-400">{logoutError}</p>}<button onClick={handleLogout} disabled={loggingOut} className="flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium text-slate-400 hover:bg-red-500/10 hover:text-red-400"><MdLogout className="text-lg" /><span className={collapsed ? 'hidden' : ''}>{loggingOut ? 'Logging out…' : 'Logout'}</span></button></div>
      <button onClick={() => setCollapsed((v) => !v)} aria-label="Toggle sidebar" className="absolute -right-3 top-[72px] hidden h-6 w-6 items-center justify-center rounded-full border border-white/10 bg-[#0b1a2c] text-slate-400 shadow-md lg:flex"><MdChevronLeft className={`text-sm transition-transform ${collapsed ? 'rotate-180' : ''}`} /></button>
    </aside>
    <div className="flex min-h-0 min-w-0 flex-1 flex-col"><header className="z-30 flex h-14 shrink-0 items-center justify-between border-b border-slate-100 bg-white px-4 lg:h-16 lg:px-6"><button onClick={() => setMobileOpen(true)} className="flex h-9 w-9 items-center justify-center rounded-xl border border-slate-200 bg-slate-50 text-slate-500 lg:hidden"><MdMenu className="text-xl" /></button><div className="hidden lg:block" /><div className="flex items-center gap-3"><NotificationBell role="admin" /><button onClick={toggleTheme} className="flex h-10 w-10 items-center justify-center rounded-xl border border-slate-200 text-slate-500">{theme === 'dark' ? <MdLightMode /> : <MdDarkMode />}</button><NavLink to="/admin/settings" className="flex h-10 w-10 items-center justify-center rounded-xl border border-slate-200 text-slate-500"><MdSettings /></NavLink><div className="hidden items-center gap-2.5 border-l border-slate-100 pl-3 lg:flex"><ProfileAvatar user={user} size="sm" /><div><p className="text-xs font-semibold text-slate-700">{user?.full_name || 'Admin'}</p><p className="text-[10px] text-slate-400">Administrator</p></div></div></div></header>
      <main className="min-w-0 flex-1 overflow-y-auto p-4 portal-mobile-content lg:p-6"><div className="mx-auto w-full max-w-[1600px]"><Outlet /></div></main>
      <nav className="fixed bottom-0 left-0 right-0 z-30 flex portal-mobile-nav items-center justify-around border-t border-slate-100 bg-white px-1 shadow-[0_-4px_20px_rgba(0,0,0,0.06)] lg:hidden">{mobileNav.map((item) => { const Icon=item.icon; const badge=badgeFor(item); return <NavLink key={item.path} to={item.path} end={item.path==='/admin'} className={({isActive})=>`relative flex min-w-[50px] flex-col items-center gap-0.5 rounded-xl px-1 py-1.5 ${isActive?'text-amber-600':'text-slate-400'}`}><Icon className="text-xl" />{badge>0&&<span className="absolute right-0 top-0 min-w-4 rounded-full bg-amber-500 px-1 text-[9px] font-bold text-white">{badge>99?'99+':badge}</span>}<span className="text-[9px] font-bold">{item.short}</span></NavLink>})}</nav>
    </div>
  </div>
}

export default AdminLayout
