// client/src/pages/staffPage/Staff_Dashboard.jsx
// REDESIGNED: Hero banner, icon stat cards, appointment list, mobile-first

import { useEffect, useState } from 'react'
import { useAuth } from '../../context/AuthContext'
import { getDashboardStats, getAppointments } from '../../services/staff.service'
import {
  MdEventAvailable, MdQueuePlayNext, MdPeople, MdInventory2,
  MdWarning, MdChevronRight, MdFace, MdMedicalServices,
  MdAccessTime, MdAdd, MdRefresh, MdCalendarToday,
} from "react-icons/md"
import { NavLink } from "react-router-dom"

const STATUS_CONFIG = {
  confirmed:    { label: "Confirmed",   badge: "bg-emerald-50 text-emerald-700 border-emerald-200" },
  pending:      { label: "Pending",     badge: "bg-amber-50   text-amber-700   border-amber-200"   },
  cancelled:    { label: "Cancelled",   badge: "bg-red-50     text-red-500     border-red-200"     },
  "in-progress":{ label: "In Progress", badge: "bg-sky-50     text-sky-700     border-sky-200"     },
  completed:    { label: "Completed",   badge: "bg-slate-100  text-slate-500   border-slate-200"   },
}

const Staff_Dashboard = () => {
  const { user } = useAuth()
  const [stats,        setStats]        = useState(null)
  const [appointments, setAppointments] = useState([])
  const [loading,      setLoading]      = useState(true)

  const today       = new Date().toISOString().split('T')[0]
  const displayDate = new Date().toLocaleDateString("en-PH", { weekday: "long", month: "long", day: "numeric", year: "numeric" })
  const firstName   = user?.full_name?.split(' ')[0] || 'Staff'

  const load = () => {
    setLoading(true)
    Promise.all([getDashboardStats(), getAppointments(today)])
      .then(([s, a]) => {
        setStats(s)
        setAppointments(Array.isArray(a) ? a : [])
      })
      .catch(err => console.error("Dashboard Load Error:", err))
      .finally(() => setLoading(false))
  }

  useEffect(() => { load() }, [today])

  const confirmedCount = appointments.filter(a => a.status === "confirmed").length
  const pendingCount   = appointments.filter(a => a.status === "pending").length

  const quickLinks = [
    { label: "Appointments",    path: "/staff/appointments",    icon: MdEventAvailable, color: "text-sky-600",     bg: "bg-sky-50"     },
    { label: "Walk-in Queue",   path: "/staff/walkin",          icon: MdQueuePlayNext,  color: "text-emerald-600", bg: "bg-emerald-50" },
    { label: "Patient Records", path: "/staff/patient-records", icon: MdPeople,         color: "text-violet-600",  bg: "bg-violet-50"  },
    { label: "Inventory",       path: "/staff/inventory",       icon: MdInventory2,     color: "text-amber-600",   bg: "bg-amber-50"   },
  ]

  if (loading) return (
    <div className="flex items-center justify-center h-64">
      <div className="flex flex-col items-center gap-3">
        <div className="w-10 h-10 border-4 border-slate-200 border-t-sky-500 rounded-full animate-spin" />
        <p className="text-slate-400 text-sm font-medium">Loading dashboard…</p>
      </div>
    </div>
  )

  return (
    <div className="space-y-5 max-w-6xl">

      {/* ── Hero banner ──────────────────────────────────────────────────── */}
      <div className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-[#0b1a2c] via-[#0a2040] to-[#0b1a2c] px-6 py-6">
        <div className="absolute -top-10 -right-10 w-48 h-48 rounded-full bg-sky-500/10 pointer-events-none" />
        <div className="absolute -bottom-12 right-32 w-32 h-32 rounded-full bg-emerald-500/8 pointer-events-none" />

        <div className="relative flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="text-slate-400 text-xs font-medium mb-1">{displayDate}</p>
            <h1 className="text-white text-xl lg:text-2xl font-black tracking-tight leading-tight">
              Welcome, <span className="text-sky-400">{firstName}! 👋</span>
            </h1>
            <p className="text-slate-400 text-sm mt-1.5 leading-relaxed">
              <span className="text-white font-semibold">{appointments.length} appointments</span> today —{' '}
              <span className="text-emerald-400 font-semibold">{confirmedCount} confirmed</span>,{' '}
              <span className="text-amber-400 font-semibold">{pendingCount} pending</span>
            </p>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <button onClick={load}
              className="w-9 h-9 flex items-center justify-center rounded-xl bg-white/10 hover:bg-white/20 text-white transition-colors">
              <MdRefresh className="text-[18px]" />
            </button>
            <NavLink to="/staff/appointments"
              className="hidden sm:flex items-center gap-2 bg-sky-500 hover:bg-sky-400 text-white text-xs font-bold px-4 py-2.5 rounded-xl transition-colors">
              <MdEventAvailable className="text-[15px]" /> Appointments
            </NavLink>
          </div>
        </div>
      </div>

      {/* ── Stat cards ────────────────────────────────────────────────────── */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 lg:gap-4">
        {[
          { label: "Today's Appts",   value: appointments.length,      sub: `${confirmedCount} confirmed`, icon: MdEventAvailable, color: "text-sky-600",     bg: "bg-sky-50",     border: "border-sky-200"     },
          { label: "Walk-in Queue",   value: stats?.queueCount ?? 0,   sub: "currently active",            icon: MdQueuePlayNext,  color: "text-emerald-600", bg: "bg-emerald-50", border: "border-emerald-200" },
          { label: "Pending Approval",value: stats?.pendingCount ?? 0, sub: "need confirmation",           icon: MdCalendarToday,  color: "text-amber-600",   bg: "bg-amber-50",   border: "border-amber-200"   },
          { label: "Low Stock Items", value: stats?.lowStock ?? 0,     sub: "need restocking",             icon: MdWarning,        color: "text-red-500",     bg: "bg-red-50",     border: "border-red-200"     },
        ].map(({ label, value, sub, icon: Icon, color, bg, border }) => (
          <div key={label} className={`bg-white border ${border} rounded-2xl px-4 py-4 flex items-start gap-3 shadow-sm hover:shadow-md transition-shadow`}>
            <div className={`w-10 h-10 rounded-xl ${bg} border ${border} flex items-center justify-center shrink-0`}>
              <Icon className={`text-[18px] ${color}`} />
            </div>
            <div className="min-w-0">
              <p className="text-[11px] text-slate-500 font-medium truncate">{label}</p>
              <p className={`text-2xl font-black leading-tight ${color}`}>{value}</p>
              <p className="text-[10px] text-slate-400 mt-0.5">{sub}</p>
            </div>
          </div>
        ))}
      </div>

      {/* ── Quick action links (mobile 2-col, desktop 4-col) ──────────────── */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {quickLinks.map(({ label, path, icon: Icon, color, bg }) => (
          <NavLink key={path} to={path}
            className={`flex flex-col items-center gap-2 p-4 ${bg} rounded-2xl border-2 border-transparent
              hover:border-slate-200 hover:-translate-y-0.5 hover:shadow-md transition-all active:scale-95`}>
            <div className="w-11 h-11 rounded-xl bg-white/70 flex items-center justify-center">
              <Icon className={`text-[22px] ${color}`} />
            </div>
            <span className={`text-xs font-bold text-center leading-tight ${color}`}>{label}</span>
          </NavLink>
        ))}
      </div>

      {/* ── Today's Appointments ──────────────────────────────────────────── */}
      <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden shadow-sm">
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100">
          <h2 className="text-sm font-bold text-slate-800 flex items-center gap-2">
            <MdCalendarToday className="text-sky-500 text-[16px]" />
            Today's Appointments
          </h2>
          <NavLink to="/staff/appointments"
            className="text-xs font-semibold text-sky-600 hover:text-sky-700 flex items-center gap-0.5 transition-colors">
            View all <MdChevronRight className="text-[14px]" />
          </NavLink>
        </div>

        {appointments.length === 0 ? (
          <div className="flex flex-col items-center py-12 text-center px-6">
            <MdEventAvailable className="text-slate-200 text-[36px] mb-2" />
            <p className="text-sm font-semibold text-slate-500">No appointments today</p>
            <NavLink to="/staff/appointments"
              className="mt-4 flex items-center gap-1.5 bg-sky-500 text-white text-xs font-bold px-4 py-2.5 rounded-xl">
              <MdAdd className="text-[14px]" /> Add Appointment
            </NavLink>
          </div>
        ) : (
          <div className="divide-y divide-slate-100">
            {appointments.slice(0, 8).map(appt => {
              const cfg  = STATUS_CONFIG[appt.status] || STATUS_CONFIG.pending
              const Icon = appt.type === 'derma' || appt.clinic_type === 'derma' ? MdFace : MdMedicalServices
              const type = appt.type || appt.clinic_type
              return (
                <div key={appt.id}
                  className={`flex items-center gap-3 px-4 py-3.5 transition-colors hover:bg-slate-50
                    ${appt.status === 'in-progress' ? 'bg-sky-50/40' : ''}`}>
                  <div className={`w-9 h-9 rounded-xl flex items-center justify-center shrink-0
                    ${type === 'derma' ? 'bg-emerald-50' : 'bg-slate-100'}`}>
                    <Icon className={`text-[16px] ${type === 'derma' ? 'text-emerald-600' : 'text-slate-500'}`} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold text-slate-800 truncate">
                      {appt.patient_name || appt.patient}
                    </p>
                    <p className="text-xs text-slate-400 truncate">
                      {appt.doctor} · {appt.reason || '—'}
                    </p>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <span className="text-xs text-slate-400 font-medium hidden sm:flex items-center gap-1">
                      <MdAccessTime className="text-[12px]" /> {appt.appointment_time || appt.time}
                    </span>
                    <span className={`text-[10px] font-bold border px-2 py-0.5 rounded-full ${cfg.badge}`}>
                      {cfg.label}
                    </span>
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}

export default Staff_Dashboard