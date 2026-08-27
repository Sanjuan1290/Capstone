import { useCallback, useEffect, useMemo, useState } from 'react'
import { NavLink, Outlet, useNavigate } from 'react-router-dom'
import logo from '../../assets/logo-removebg.png'
import { useAuth } from '../../context/AuthContext'
import { useTheme } from '../../context/ThemeContext'
import NotificationBell from '../NotificationBell'
import ProfileAvatar from '../ProfileAvatar'
import { useSSE } from '../../hooks/useSSE'
import { playNotificationSound } from '../../utils/notificationSound'
import { getDashboard } from '../../services/staff.service'
import { MdDashboard, MdEventAvailable, MdQueuePlayNext, MdPeople, MdInventory2, MdChevronLeft, MdLogout, MdPerson, MdMenu, MdClose, MdSettings, MdDarkMode, MdLightMode, MdPayments } from 'react-icons/md'

const GROUPS = [
  { label: 'Overview', items: [{ name: 'Dashboard', path: '/staff', icon: MdDashboard, short: 'Home' }] },
  { label: 'Front Desk', items: [
    { name: 'Appointments', path: '/staff/appointments', icon: MdEventAvailable, short: 'Appts', badge: 'pending' },
    { name: 'Walk-in Queue', path: '/staff/walkin', icon: MdQueuePlayNext, short: 'Queue' },
    { name: 'Patient Records', path: '/staff/patient-records', icon: MdPeople, short: 'Patients' },
  ] },
  { label: 'Billing', items: [{ name: 'Billing', path: '/staff/billing', icon: MdPayments, short: 'Billing' }] },
  { label: 'Inventory', items: [
    { name: 'Inventory', path: '/staff/inventory', icon: MdInventory2, short: 'Stock' },
    { name: 'Stock Transfers', path: '/staff/supply-requests', icon: MdInventory2, short: 'Transfer' },
  ] },
]

const StaffLayout = () => {
  const { user, logout: clearAuth } = useAuth(); const { theme, toggleTheme } = useTheme(); const navigate = useNavigate()
  const [collapsed,setCollapsed]=useState(false),[mobileOpen,setMobileOpen]=useState(false),[loggingOut,setLoggingOut]=useState(false),[pending,setPending]=useState(0)
  const loadCounts=useCallback(()=>getDashboard().then((d)=>setPending(Number(d?.pendingCount||0))).catch(()=>{}),[])
  useEffect(()=>{loadCounts()},[loadCounts])
  const onEvent=useCallback((eventName)=>{if(eventName==='notification_created')playNotificationSound();if(['notification_created','appointment_updated','queue_updated','consultation_saved','supply_request_resolved','billing_finalized','billing_paid'].includes(eventName)){window.dispatchEvent(new CustomEvent('clinic:notifications-refresh'));window.dispatchEvent(new CustomEvent('clinic:refresh',{detail:{eventName}}));if(eventName==='appointment_updated')loadCounts()}},[loadCounts])
  useSSE('staff',user?.id,onEvent)
  const logout=async()=>{setLoggingOut(true);try{await fetch('/api/staff/logout',{method:'POST',credentials:'include'});clearAuth();navigate('/staff/login')}catch{setLoggingOut(false)}}
  const badgeFor=(i)=>i.badge==='pending'?pending:0
  const Item=({item})=>{const Icon=item.icon,b=badgeFor(item);return <NavLink to={item.path} end={item.path==='/staff'} onClick={()=>setMobileOpen(false)} className={({isActive})=>`relative flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition-colors ${isActive?'bg-sky-500/15 text-sky-400':'text-slate-400 hover:bg-white/5 hover:text-white'}`}>{({isActive})=><>{isActive&&<span className="absolute left-0 top-1/2 h-5 w-[3px] -translate-y-1/2 rounded-r-full bg-sky-400"/>}<Icon className="shrink-0 text-[19px]"/><span className={`min-w-0 flex-1 whitespace-nowrap ${collapsed?'hidden':''}`}>{item.name}</span>{b>0&&<span className={`min-w-6 rounded-full bg-sky-400 px-1.5 py-0.5 text-center text-[10px] font-black text-[#0b1a2c] ${collapsed?'absolute -right-1 -top-1':''}`}>{b>99?'99+':b}</span>}</>}</NavLink>}
  const mobileNav=useMemo(()=>[GROUPS[0].items[0],GROUPS[1].items[0],GROUPS[1].items[1],GROUPS[2].items[0],GROUPS[3].items[0]],[])
  return <div className="flex h-screen overflow-hidden bg-slate-50">{mobileOpen&&<div className="fixed inset-0 z-40 bg-black/60 lg:hidden" onClick={()=>setMobileOpen(false)}/>}<aside className={`fixed inset-y-0 left-0 z-50 flex shrink-0 flex-col bg-[#0b1a2c] transition-all lg:relative ${collapsed?'w-[72px]':'w-64'} ${mobileOpen?'translate-x-0':'-translate-x-full lg:translate-x-0'}`}><div className="flex h-16 items-center gap-3 border-b border-white/5 px-4"><img src={logo} alt="Carait Clinic" className="h-9 w-9 rounded-xl bg-white/10 object-contain p-1"/><div className={collapsed?'hidden':''}><p className="text-[15px] font-bold text-white">Carait Clinic</p><span className="font-mono text-[10px] font-semibold uppercase tracking-widest text-sky-400">Staff Portal</span></div><button onClick={()=>setMobileOpen(false)} className="ml-auto text-slate-400 lg:hidden"><MdClose/></button></div><div className={`mx-3 mt-4 rounded-xl border border-white/5 bg-white/5 p-3 ${collapsed?'hidden':''}`}><div className="flex items-center gap-3"><div className="flex h-9 w-9 items-center justify-center rounded-xl bg-sky-500/20"><MdPerson className="text-sky-400"/></div><div className="min-w-0"><p className="truncate text-sm font-bold text-white">{user?.full_name||'Staff'}</p><p className="text-[10px] uppercase tracking-wider text-sky-400">Staff</p></div></div></div><nav className="flex-1 overflow-y-auto px-3 py-3">{GROUPS.map(g=><div key={g.label} className="mb-3"><p className={`mb-1 px-3 text-[10px] font-bold uppercase tracking-[0.16em] text-slate-500 ${collapsed?'sr-only':''}`}>{g.label}</p>{g.items.map(i=><Item key={i.path} item={i}/>)}</div>)}</nav><div className="border-t border-white/5 px-3 py-4"><button onClick={logout} disabled={loggingOut} className="flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-sm text-slate-400 hover:bg-red-500/10 hover:text-red-400"><MdLogout/><span className={collapsed?'hidden':''}>{loggingOut?'Logging out…':'Logout'}</span></button></div><button onClick={()=>setCollapsed(v=>!v)} className="absolute -right-3 top-[72px] hidden h-6 w-6 items-center justify-center rounded-full bg-[#0b1a2c] text-slate-400 shadow lg:flex"><MdChevronLeft className={collapsed?'rotate-180':''}/></button></aside><div className="flex min-h-0 min-w-0 flex-1 flex-col"><header className="flex h-14 shrink-0 items-center justify-between border-b border-slate-100 bg-white px-4 lg:h-16 lg:px-6"><button onClick={()=>setMobileOpen(true)} className="flex h-9 w-9 items-center justify-center rounded-xl border border-slate-200 lg:hidden"><MdMenu/></button><div className="hidden lg:block"/><div className="flex items-center gap-3"><NotificationBell role="staff"/><button onClick={toggleTheme} className="flex h-10 w-10 items-center justify-center rounded-xl border border-slate-200 text-slate-500">{theme==='dark'?<MdLightMode/>:<MdDarkMode/>}</button><NavLink to="/staff/settings" className="flex h-10 w-10 items-center justify-center rounded-xl border border-slate-200 text-slate-500"><MdSettings/></NavLink><div className="hidden items-center gap-2.5 border-l pl-3 lg:flex"><ProfileAvatar user={user} size="sm"/><p className="text-xs font-semibold text-slate-700">{user?.full_name||'Staff'}</p></div></div></header><main className="min-w-0 flex-1 overflow-y-auto p-4 pb-20 lg:p-6"><div className="mx-auto w-full max-w-[1600px]"><Outlet/></div></main><nav className="fixed bottom-0 left-0 right-0 z-30 flex h-16 items-center justify-around border-t bg-white lg:hidden">{mobileNav.map(i=>{const Icon=i.icon,b=badgeFor(i);return <NavLink key={i.path} to={i.path} end={i.path==='/staff'} className={({isActive})=>`relative flex min-w-[50px] flex-col items-center gap-0.5 text-[9px] font-bold ${isActive?'text-sky-600':'text-slate-400'}`}><Icon className="text-xl"/>{b>0&&<span className="absolute right-0 top-0 rounded-full bg-sky-500 px-1 text-[9px] text-white">{b}</span>}<span>{i.short}</span></NavLink>})}</nav></div></div>
}
export default StaffLayout
