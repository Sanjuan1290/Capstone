// client/src/pages/adminPage/Admin_Dashboard.jsx
// REDESIGNED: Hero banner, stat grid, today's appointments, doctor status, quick links

import { useEffect, useState, useCallback } from 'react'
import { NavLink } from 'react-router-dom'
import { useAuth } from '../../context/AuthContext'
import { getDashboard, getAppointments } from '../../services/admin.service'
import usePolling from '../../hooks/usePolling'
import { getLocalDateOnly } from '../../utils/date'
import {
  MdEventAvailable, MdPeople, MdMedicalServices, MdInventory2,
  MdBarChart, MdCalendarToday, MdChevronRight, MdRefresh,
  MdAccessTime, MdFace, MdTrendingUp, MdTrendingDown,
  MdWarning, MdAdminPanelSettings,
} from 'react-icons/md'

const POLL_MS = 30_000

const STATUS_CFG = {
  confirmed:    { label: 'Confirmed',   badge: 'bg-emerald-50 text-emerald-700 border-emerald-200' },
  pending:      { label: 'Pending',     badge: 'bg-amber-50   text-amber-700   border-amber-200'   },
  cancelled:    { label: 'Cancelled',   badge: 'bg-red-50     text-red-500     border-red-200'     },
  'in-progress':{ label: 'In Progress', badge: 'bg-violet-50  text-violet-700  border-violet-200'  },
  completed:    { label: 'Completed',   badge: 'bg-slate-100  text-slate-500   border-slate-200'   },
}

const LiveDot = ({ lastUpdated }) => (
  <div className="flex items-center gap-1.5">
    <span className="relative flex h-2 w-2">
      <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" />
      <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500" />
    </span>
    <span className="text-[11px] text-slate-400 font-medium">
      Live · {lastUpdated ? new Date(lastUpdated).toLocaleTimeString('en-PH', { hour: '2-digit', minute: '2-digit', second: '2-digit' }) : '—'}
    </span>
  </div>
)

const Admin_Dashboard = () => {
  const { user }   = useAuth()
  const [dashStats,    setDashStats]    = useState(null)
  const [todayAppts,   setTodayAppts]   = useState([])
  const [doctorStatus, setDoctorStatus] = useState([])
  const [loading,      setLoading]      = useState(true)
  const [lastUpdated,  setLastUpdated]  = useState(null)

  const todayISO    = getLocalDateOnly()
  const displayDate = new Date().toLocaleDateString('en-PH', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' })
  const firstName   = user?.full_name?.split(' ').pop() || 'Admin'

  const load = useCallback(() => {
    Promise.all([getDashboard(), getAppointments(`?date=${todayISO}`)])
      .then(([dash, appts]) => {
        setDashStats(dash)
        setTodayAppts(Array.isArray(appts) ? appts : [])
        setDoctorStatus(Array.isArray(dash.doctorStatus) ? dash.doctorStatus : [])
        setLastUpdated(new Date())
        setLoading(false)
      })
      .catch(err => console.error('Admin Dashboard:', err))
  }, [todayISO])

  usePolling(load, POLL_MS)

  const onDutyCount = doctorStatus.filter(d => d.status === 'on-duty').length

  const stats = [
    { label: 'Today\'s Appts',   value: todayAppts.length,           sub: 'scheduled',         color: 'text-sky-600',     bg: 'bg-sky-50',     border: 'border-sky-200',     up: null  },
    { label: 'Total Patients',   value: dashStats?.totalPatients ?? 0, sub: 'registered',       color: 'text-violet-600',  bg: 'bg-violet-50',  border: 'border-violet-200',  up: null  },
    { label: 'Pending Approvals',value: dashStats?.pendingApprovals ?? dashStats?.pendingCount ?? 0, sub: 'need review', color: 'text-amber-600',   bg: 'bg-amber-50',   border: 'border-amber-200',   up: false },
    { label: 'Low Stock Alerts', value: dashStats?.lowStockCount ?? dashStats?.lowStock ?? 0,  sub: 'items',         color: 'text-red-500',     bg: 'bg-red-50',     border: 'border-red-200',     up: false },
  ]

  const quickLinks = [
    { label: 'Reports',         path: '/admin/reports',          icon: MdBarChart,       color: 'text-amber-600',   bg: 'bg-amber-50'   },
    { label: 'Staff Accounts',  path: '/admin/staff-accounts',   icon: MdPeople,         color: 'text-sky-600',     bg: 'bg-sky-50'     },
    { label: 'Doctor Accounts', path: '/admin/doctor-accounts',  icon: MdMedicalServices,color: 'text-violet-600',  bg: 'bg-violet-50'  },
    { label: 'Schedules',       path: '/admin/doctor-schedules', icon: MdCalendarToday,  color: 'text-emerald-600', bg: 'bg-emerald-50' },
    { label: 'Appointments',    path: '/admin/appointments',     icon: MdEventAvailable, color: 'text-slate-600',   bg: 'bg-slate-100'  },
    { label: 'Inventory',       path: '/admin/inventory',        icon: MdInventory2,     color: 'text-red-600',     bg: 'bg-red-50'     },
  ]

  if (loading) return (
    <div className="flex items-center justify-center h-64">
      <div className="flex flex-col items-center gap-3">
        <div className="w-10 h-10 border-4 border-slate-200 border-t-amber-500 rounded-full animate-spin" />
        <p className="text-slate-400 text-sm font-medium">Loading dashboard…</p>
      </div>
    </div>
  )

  return (
    <div className="space-y-5 max-w-6xl">

      {/* ── Hero ──────────────────────────────────────────────────────────── */}
      <div className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-[#0b1a2c] via-[#1a1000] to-[#0b1a2c] px-6 py-6">
        <div className="absolute -top-10 -right-10 w-48 h-48 rounded-full bg-amber-500/10 pointer-events-none" />
        <div className="absolute -bottom-12 right-32 w-32 h-32 rounded-full bg-sky-500/8 pointer-events-none" />

        <div className="relative flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="text-slate-400 text-xs font-medium mb-1">{displayDate}</p>
            <h1 className="text-white text-xl lg:text-2xl font-black tracking-tight leading-tight">
              Welcome, <span className="text-amber-400">{firstName}! 👋</span>
            </h1>
            <p className="text-slate-400 text-sm mt-1.5 leading-relaxed">
              <span className="text-white font-semibold">{todayAppts.length} appointments</span> today ·{' '}
              <span className="text-emerald-400 font-semibold">{onDutyCount} doctors on duty</span> ·{' '}
              <span className="text-red-400 font-semibold">{dashStats?.lowStockCount ?? dashStats?.lowStock ?? 0} low-stock items</span>
            </p>
            <div className="mt-2"><LiveDot lastUpdated={lastUpdated} /></div>
          </div>
          <button onClick={load}
            className="w-9 h-9 flex items-center justify-center rounded-xl bg-white/10 hover:bg-white/20 text-white transition-colors shrink-0 mt-1">
            <MdRefresh className="text-[18px]" />
          </button>
        </div>
      </div>

      {/* ── Stat cards ────────────────────────────────────────────────────── */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 lg:gap-4">
        {stats.map(({ label, value, sub, color, bg, border, up }) => (
          <div key={label} className={`${bg} border ${border} rounded-2xl px-4 py-4 lg:px-5 transition-transform hover:scale-[1.02]`}>
            <p className="text-xs text-slate-500 font-medium">{label}</p>
            <p className={`text-3xl font-black mt-1 ${color}`}>{value}</p>
            <div className="flex items-center gap-1 mt-0.5">
              {up === true  && <MdTrendingUp   className="text-emerald-500 text-[12px]" />}
              {up === false && <MdTrendingDown  className="text-red-500 text-[12px]" />}
              <p className="text-[11px] text-slate-400">{sub}</p>
            </div>
          </div>
        ))}
      </div>

      {/* ── Main 2-col ────────────────────────────────────────────────────── */}
      <div className="grid grid-cols-1 lg:grid-cols-[1fr_320px] gap-5">

        {/* Today's appointments */}
        <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden shadow-sm">
          <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100">
            <h2 className="text-sm font-bold text-slate-800">Today's Appointments</h2>
            <NavLink to="/admin/appointments" className="text-xs font-semibold text-amber-600 hover:text-amber-700 flex items-center gap-0.5">
              View all <MdChevronRight className="text-[14px]" />
            </NavLink>
          </div>
          {todayAppts.length === 0 ? (
            <div className="flex flex-col items-center py-12 text-center px-6">
              <MdCalendarToday className="text-slate-200 text-[32px] mb-2" />
              <p className="text-xs text-slate-400">No appointments scheduled today.</p>
            </div>
          ) : (
            <div className="divide-y divide-slate-100">
              {todayAppts.slice(0, 7).map(appt => {
                const cfg  = STATUS_CFG[appt.status] || STATUS_CFG.pending
                const Icon = (appt.type || appt.clinic_type) === 'derma' ? MdFace : MdMedicalServices
                const type = appt.type || appt.clinic_type
                return (
                  <div key={appt.id} className={`flex items-center gap-3 px-4 py-3.5 transition-colors hover:bg-slate-50
                    ${appt.status === 'in-progress' ? 'bg-violet-50/30' : ''}`}>
                    <div className={`w-9 h-9 rounded-xl flex items-center justify-center shrink-0
                      ${type === 'derma' ? 'bg-emerald-50' : 'bg-slate-100'}`}>
                      <Icon className={`text-[16px] ${type === 'derma' ? 'text-emerald-600' : 'text-slate-500'}`} />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-semibold text-slate-800 truncate">{appt.patient_name || appt.patient}</p>
                      <p className="text-xs text-slate-400 truncate">{appt.doctor}</p>
                    </div>
                    <span className="text-xs text-slate-400 font-medium hidden sm:flex items-center gap-1 shrink-0">
                      <MdAccessTime className="text-[12px]" /> {appt.appointment_time || appt.time}
                    </span>
                    <span className={`text-[10px] font-bold border px-2 py-0.5 rounded-full shrink-0 ${cfg.badge}`}>
                      {cfg.label}
                    </span>
                  </div>
                )
              })}
            </div>
          )}
        </div>

        {/* Right column */}
        <div className="space-y-4">

          {/* Doctors today */}
          <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden shadow-sm">
            <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100">
              <h2 className="text-sm font-bold text-slate-800">Doctors Today</h2>
              <NavLink to="/admin/doctor-schedules" className="text-xs font-semibold text-amber-600 hover:text-amber-700 flex items-center gap-0.5">
                Schedules <MdChevronRight className="text-[14px]" />
              </NavLink>
            </div>
            <div className="p-4 space-y-2 max-h-48 overflow-y-auto">
              {doctorStatus.length === 0 ? (
                <p className="text-xs text-slate-400 text-center py-4">No doctors registered.</p>
              ) : doctorStatus.map(doc => (
                <div key={doc.id} className="flex items-center gap-3 p-3 rounded-xl border border-slate-100 hover:bg-slate-50">
                  <div className={`w-2 h-2 rounded-full shrink-0 ${doc.status === 'on-duty' ? 'bg-emerald-500' : 'bg-slate-300'}`} />
                  <div className="flex-1 min-w-0">
                    <p className="text-xs font-bold text-slate-800 truncate">{doc.name}</p>
                    <p className="text-[10px] text-slate-400">{doc.specialty}</p>
                  </div>
                  {doc.status === 'on-duty'
                    ? <span className="text-[10px] font-semibold text-slate-500 shrink-0">{doc.done}/{doc.patients} done</span>
                    : <span className="text-[10px] font-semibold text-slate-300 shrink-0">Off duty</span>}
                </div>
              ))}
            </div>
          </div>

          {/* Low stock alert */}
          {(dashStats?.lowStockCount ?? dashStats?.lowStock ?? 0) > 0 && (
            <div className="bg-amber-50 border border-amber-200 rounded-2xl px-5 py-4 flex items-center gap-3">
              <MdWarning className="text-amber-500 text-[20px] shrink-0" />
              <div className="flex-1 min-w-0">
                <p className="text-sm font-bold text-amber-800">
                  {dashStats?.lowStockCount ?? dashStats?.lowStock} items low on stock
                </p>
                <p className="text-xs text-amber-600 mt-0.5">Consider restocking soon.</p>
              </div>
              <NavLink to="/admin/inventory"
                className="text-xs font-bold text-amber-700 bg-amber-100 border border-amber-200 px-3 py-1.5 rounded-xl hover:bg-amber-200 transition-colors shrink-0">
                View
              </NavLink>
            </div>
          )}
        </div>
      </div>

      {/* ── Quick links ───────────────────────────────────────────────────── */}
      <div className="bg-white rounded-2xl border border-slate-200 p-5 shadow-sm">
        <h2 className="text-sm font-bold text-slate-800 mb-4">Quick Navigation</h2>
        <div className="grid grid-cols-3 sm:grid-cols-6 gap-3">
          {quickLinks.map(({ label, path, icon: Icon, color, bg }) => (
            <NavLink key={path} to={path}
              className={`flex flex-col items-center gap-2 p-4 rounded-2xl ${bg}
                hover:opacity-80 hover:-translate-y-0.5 hover:shadow-md transition-all active:scale-95`}>
              <Icon className={`text-[22px] ${color}`} />
              <span className={`text-[11px] font-bold ${color} text-center leading-tight`}>{label}</span>
            </NavLink>
          ))}
        </div>
      </div>
    </div>
  )
}

export default Admin_Dashboard
