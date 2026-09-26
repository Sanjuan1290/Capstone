import { useCallback, useEffect, useMemo, useState } from 'react'
import { NavLink, Outlet, useNavigate } from 'react-router-dom'
import { useAuth } from '../../context/AuthContext'
import { useTheme } from '../../context/ThemeContext'
import { hasStaffPermission, STAFF_PERMISSION_MAP } from '../../config/staffPermissions'
import NotificationBell from '../NotificationBell'
import ProfileAvatar from '../ProfileAvatar'
import { useSSE } from '../../hooks/useSSE'
import { playNotificationSound } from '../../utils/notificationSound'
import { getDashboard } from '../../services/staff.service'
import {
  MdDashboard, MdEventAvailable, MdQueuePlayNext, MdPeople, MdInventory2, MdChevronLeft,
  MdLogout, MdPerson, MdMenu, MdClose, MdSettings, MdDarkMode, MdLightMode, MdPayments,
  MdCalendarToday, MdBarChart, MdHistory, MdLanguage, MdTune,
} from 'react-icons/md'

const NAV_GROUPS = [
  { label: 'Overview', items: [
    { permission: 'dashboard', name: 'Dashboard', path: '/staff', icon: MdDashboard, short: 'Home' },
  ] },
  { label: 'Clinic Operations', items: [
    { permission: 'appointments', name: 'Appointments', path: '/staff/appointments', icon: MdEventAvailable, short: 'Appts', badge: 'pending' },
    { permission: 'appointments', name: 'Walk-in Queue', path: '/staff/walkin', icon: MdQueuePlayNext, short: 'Queue', description: 'Walk-in patient check-in and queue management. Included with Appointments access.' },
    { permission: 'patient_records', name: 'Patient Records', path: '/staff/patient-records', icon: MdPeople, short: 'Patients' },
    { permission: 'doctor_schedules', name: 'Doctor Schedules', path: '/staff/doctor-schedules', icon: MdCalendarToday, short: 'Doctors' },
  ] },
  { label: 'Billing & Stock', items: [
    { permission: 'checkout', name: 'Checkout', path: '/staff/checkout', icon: MdPayments, short: 'Checkout' },
    { permission: 'billing', name: 'Billing', path: '/staff/billing', icon: MdPayments, short: 'Billing' },
    { permission: 'inventory', name: 'Inventory', path: '/staff/inventory', icon: MdInventory2, short: 'Stock' },
    { permission: 'stock_transfers', name: 'Stock Transfers', path: '/staff/supply-requests', icon: MdInventory2, short: 'Transfer' },
  ] },
  { label: 'People & Setup', items: [
    { permission: 'accounts', name: 'Accounts', path: '/staff/accounts', icon: MdPeople, short: 'Accounts' },
    { permission: 'system_setup', name: 'System Setup', path: '/staff/system-setup', icon: MdTune, short: 'Setup' },
  ] },
  { label: 'Insights & System', items: [
    { permission: 'reports', name: 'Reports', path: '/staff/reports', icon: MdBarChart, short: 'Reports' },
    { permission: 'audit_logs', name: 'Audit Logs', path: '/staff/audit-logs', icon: MdHistory, short: 'Audit' },
    { permission: 'landing_page', name: 'Landing Page', path: '/staff/landingpage', icon: MdLanguage, short: 'Site' },
  ] },
]

const StaffLayout = () => {
  const { user, logout: clearAuth } = useAuth()
  const { theme, toggleTheme } = useTheme()
  const navigate = useNavigate()
  const [collapsed, setCollapsed] = useState(false)
  const [mobileOpen, setMobileOpen] = useState(false)
  const [loggingOut, setLoggingOut] = useState(false)
  const [pending, setPending] = useState(0)

  const groups = useMemo(() => NAV_GROUPS
    .map((group) => ({ ...group, items: group.items.filter((item) => hasStaffPermission(user, item.permission)) }))
    .filter((group) => group.items.length > 0), [user])

  const loadCounts = useCallback(() => {
    if (!hasStaffPermission(user, 'dashboard')) { setPending(0); return Promise.resolve() }
    return getDashboard().then((data) => setPending(Number(data?.pendingCount || 0))).catch(() => setPending(0))
  }, [user])

  useEffect(() => { loadCounts() }, [loadCounts])

  const onEvent = useCallback((eventName) => {
    if (eventName === 'notification_created') playNotificationSound()
    if (['notification_created','appointment_updated','queue_updated','consultation_saved','supply_request_resolved','billing_finalized','billing_paid'].includes(eventName)) {
      window.dispatchEvent(new CustomEvent('clinic:notifications-refresh'))
      window.dispatchEvent(new CustomEvent('clinic:refresh', { detail: { eventName } }))
      if (eventName === 'appointment_updated') loadCounts()
    }
  }, [loadCounts])
  useSSE('staff', user?.id, onEvent)

  const logout = async () => {
    if (!window.confirm('Are you sure you want to log out of Carait Clinic?')) return
    setLoggingOut(true)
    try { await fetch('/api/staff/logout', { method: 'POST', credentials: 'include' }); clearAuth(); navigate('/staff/login') }
    catch { setLoggingOut(false) }
  }

  const badgeFor = (item) => item.badge === 'pending' ? pending : 0
  const descriptionFor = (item) => item.description || STAFF_PERMISSION_MAP[item.permission]?.description || item.name

  const Item = ({ item }) => {
    const Icon = item.icon
    const badge = badgeFor(item)
    return (
      <NavLink
        to={item.path}
        end={item.path === '/staff'}
        title={descriptionFor(item)}
        onClick={() => setMobileOpen(false)}
        className={({ isActive }) => `relative flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition-colors ${isActive ? 'bg-sky-500/15 text-sky-400' : 'text-slate-400 hover:bg-white/5 hover:text-white'}`}
      >
        {({ isActive }) => <>
          {isActive && <span className="absolute left-0 top-1/2 h-5 w-[3px] -translate-y-1/2 rounded-r-full bg-sky-400" />}
          <Icon className="shrink-0 text-[19px]" />
          <span className={`min-w-0 flex-1 whitespace-nowrap ${collapsed ? 'hidden' : ''}`}>{item.name}</span>
          {badge > 0 && <span className={`min-w-6 rounded-full bg-sky-400 px-1.5 py-0.5 text-center text-[10px] font-black text-[#0b1a2c] ${collapsed ? 'absolute -right-1 -top-1' : ''}`}>{badge > 99 ? '99+' : badge}</span>}
        </>}
      </NavLink>
    )
  }

  const mobileNav = useMemo(() => groups.flatMap((group) => group.items).slice(0, 5), [groups])

  return (
    <div className="flex h-screen overflow-hidden bg-slate-50">
      {mobileOpen && <div className="fixed inset-0 z-40 bg-black/60 lg:hidden" onClick={() => setMobileOpen(false)} />}
      <aside className={`fixed inset-y-0 left-0 z-50 flex shrink-0 flex-col bg-[#0b1a2c] transition-all lg:relative ${collapsed ? 'w-[72px]' : 'w-64'} ${mobileOpen ? 'translate-x-0' : '-translate-x-full lg:translate-x-0'}`}>
        <div className="flex h-16 items-center gap-3 border-b border-white/5 px-4">
          <img src="/logo.png" alt="Carait Clinic" className="h-9 w-9 rounded-xl bg-white/10 object-contain p-1" />
          <div className={collapsed ? 'hidden' : ''}><p className="text-[15px] font-bold text-white">Carait Clinic</p><span className="font-mono text-[10px] font-semibold uppercase tracking-widest text-sky-400">Staff Portal</span></div>
          <button onClick={() => setMobileOpen(false)} className="ml-auto text-slate-400 lg:hidden"><MdClose /></button>
        </div>
        <div className={`mx-3 mt-4 rounded-xl border border-white/5 bg-white/5 p-3 ${collapsed ? 'hidden' : ''}`}>
          <div className="flex items-center gap-3"><div className="flex h-9 w-9 items-center justify-center rounded-xl bg-sky-500/20"><MdPerson className="text-sky-400" /></div><div className="min-w-0"><p className="truncate text-sm font-bold text-white">{user?.full_name || 'Staff'}</p><p className="text-[10px] uppercase tracking-wider text-sky-400">{Array.isArray(user?.permissions) ? user.permissions.length : 0} permissions</p></div></div>
        </div>
        <nav className="flex-1 overflow-y-auto px-3 py-3">
          {groups.map((group) => <div key={group.label} className="mb-3"><p className={`mb-1 px-3 text-[10px] font-bold uppercase tracking-[0.16em] text-slate-500 ${collapsed ? 'sr-only' : ''}`}>{group.label}</p>{group.items.map((item) => <Item key={item.path} item={item} />)}</div>)}
        </nav>
        <div className="border-t border-white/5 px-3 py-4"><button onClick={logout} disabled={loggingOut} className="flex w-full items-center gap-3 rounded-xl bg-red-500/15 px-3 py-2.5 text-sm text-red-400 hover:bg-red-500/25 hover:text-red-300"><MdLogout /><span className={collapsed ? 'hidden' : ''}>{loggingOut ? 'Logging out…' : 'Logout'}</span></button></div>
        <button onClick={() => setCollapsed((value) => !value)} className="absolute -right-3 top-[72px] hidden h-6 w-6 items-center justify-center rounded-full bg-[#0b1a2c] text-slate-400 shadow lg:flex"><MdChevronLeft className={collapsed ? 'rotate-180' : ''} /></button>
      </aside>

      <div className="flex min-h-0 min-w-0 flex-1 flex-col">
        <header className="flex h-14 shrink-0 items-center justify-between border-b border-slate-100 bg-white px-4 lg:h-16 lg:px-6">
          <button onClick={() => setMobileOpen(true)} className="flex h-9 w-9 items-center justify-center rounded-xl border border-slate-200 lg:hidden"><MdMenu /></button>
          <div className="hidden lg:block" />
          <div className="flex items-center gap-3"><NotificationBell role="staff" /><button onClick={toggleTheme} className="flex h-10 w-10 items-center justify-center rounded-xl border border-slate-200 text-slate-500">{theme === 'dark' ? <MdLightMode /> : <MdDarkMode />}</button><NavLink to="/staff/settings" title="Account Settings" className="flex h-10 w-10 items-center justify-center rounded-xl border border-slate-200 text-slate-500"><MdSettings /></NavLink><div className="hidden items-center gap-2.5 border-l pl-3 lg:flex"><ProfileAvatar user={user} size="sm" /><div className="min-w-0"><p className="truncate text-xs font-semibold text-slate-700">{user?.full_name || 'Staff'}</p><p className="mt-0.5 text-[10px] font-semibold uppercase tracking-wider text-sky-500">Staff</p></div></div></div>
        </header>
        <main className="portal-mobile-content min-w-0 flex-1 overflow-y-auto p-4 lg:p-6"><div className="mx-auto w-full max-w-[1600px]"><Outlet /></div></main>
        {mobileNav.length > 0 && <nav className="portal-mobile-nav fixed bottom-0 left-0 right-0 z-30 flex items-center justify-around border-t bg-white lg:hidden">{mobileNav.map((item) => { const Icon = item.icon; const badge = badgeFor(item); return <NavLink key={item.path} to={item.path} end={item.path === '/staff'} title={descriptionFor(item)} className={({ isActive }) => `relative flex min-w-[50px] flex-col items-center gap-0.5 text-[9px] font-bold ${isActive ? 'text-sky-600' : 'text-slate-400'}`}><Icon className="text-xl" />{badge > 0 && <span className="absolute right-0 top-0 rounded-full bg-sky-500 px-1 text-[9px] text-white">{badge}</span>}<span>{item.short}</span></NavLink> })}</nav>}
      </div>
    </div>
  )
}
export default StaffLayout
