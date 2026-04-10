// client/src/pages/doctorPage/Doctor_Dashboard.jsx
// REDESIGNED: Mobile-first, hero banner, live polling, improved appointment + queue display

import { useState, useCallback } from 'react'
import { NavLink, useNavigate } from 'react-router-dom'
import { useAuth } from '../../context/AuthContext'
import { getDashboard, getDailyAppointments } from '../../services/doctor.service'
import usePolling from '../../hooks/usePolling'
import {
  MdCalendarToday, MdAccessTime, MdFace, MdMedicalServices,
  MdChevronRight, MdQueuePlayNext, MdInventory2, MdRefresh,
  MdCheck, MdPerson, MdArrowForward, MdSchedule,
} from 'react-icons/md'

const POLL_MS = 30_000

const STATUS_CONFIG = {
  completed:    { label: 'Done',        badge: 'bg-slate-100  text-slate-500   border-slate-200'   },
  'in-progress':{ label: 'In Progress', badge: 'bg-violet-50  text-violet-700  border-violet-200'  },
  pending:      { label: 'Waiting',     badge: 'bg-amber-50   text-amber-700   border-amber-200'   },
  confirmed:    { label: 'Confirmed',   badge: 'bg-emerald-50 text-emerald-700 border-emerald-200' },
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

const Doctor_Dashboard = () => {
  const { user }   = useAuth()
  const navigate   = useNavigate()
  const [todayAppts,  setTodayAppts]  = useState([])
  const [walkInQueue, setWalkInQueue] = useState([])
  const [requests,    setRequests]    = useState([])
  const [loading,     setLoading]     = useState(true)
  const [lastUpdated, setLastUpdated] = useState(null)

  const todayISO    = new Date().toISOString().split('T')[0]
  const dateDisplay = new Date().toLocaleDateString('en-PH', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' })

  const load = useCallback(() => {
    Promise.all([getDashboard(), getDailyAppointments(todayISO)])
      .then(([dash, appts]) => {
        setTodayAppts(Array.isArray(appts) ? appts : [])
        setRequests(Array.isArray(dash.requests) ? dash.requests : [])
        setWalkInQueue(Array.isArray(dash.walkInQueue) ? dash.walkInQueue : [])
        setLastUpdated(new Date())
        setLoading(false)
      })
      .catch(err => console.error('Doctor Dashboard error:', err))
  }, [todayISO])

  usePolling(load, POLL_MS)

  const done       = todayAppts.filter(a => a.status === 'completed').length
  const inProgress = todayAppts.filter(a => a.status === 'in-progress').length
  const waiting    = todayAppts.filter(a => a.status === 'pending' || a.status === 'confirmed').length
  const doctorName = user?.full_name?.replace(/^Dr\.?\s*/i, '').split(' ').pop() || 'Doctor'

  const stats = [
    { label: 'Total Today',   value: todayAppts.length, sub: 'scheduled',      color: 'text-slate-800',   bg: 'bg-white',       border: 'border-slate-200'   },
    { label: 'Completed',     value: done,               sub: 'consultations',  color: 'text-emerald-600', bg: 'bg-emerald-50',  border: 'border-emerald-200' },
    { label: 'In Progress',   value: inProgress,         sub: 'now',            color: 'text-violet-600',  bg: 'bg-violet-50',   border: 'border-violet-200'  },
    { label: 'Walk-in Queue', value: walkInQueue.length, sub: 'assigned to me', color: 'text-amber-600',   bg: 'bg-amber-50',    border: 'border-amber-200'   },
  ]

  if (loading) return (
    <div className="flex items-center justify-center h-64">
      <div className="flex flex-col items-center gap-3">
        <div className="w-10 h-10 border-4 border-slate-200 border-t-violet-500 rounded-full animate-spin" />
        <p className="text-slate-400 text-sm font-medium">Loading dashboard…</p>
      </div>
    </div>
  )

  return (
    <div className="space-y-5 max-w-5xl">

      {/* ── Hero banner ──────────────────────────────────────────────────── */}
      <div className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-[#0b1a2c] via-[#120a2e] to-[#0b1a2c] px-6 py-6">
        <div className="absolute -top-10 -right-10 w-48 h-48 rounded-full bg-violet-500/10 pointer-events-none" />
        <div className="absolute -bottom-12 right-32 w-32 h-32 rounded-full bg-sky-500/8 pointer-events-none" />

        <div className="relative flex items-start justify-between gap-4">
          <div className="min-w-0">
            <p className="text-slate-400 text-xs font-medium mb-1">{dateDisplay}</p>
            <h1 className="text-white text-xl lg:text-2xl font-black tracking-tight leading-tight">
              Good day, <span className="text-violet-400">Dr. {doctorName}!</span> 👋
            </h1>
            <p className="text-slate-400 text-sm mt-1.5 leading-relaxed">
              <span className="text-white font-semibold">{todayAppts.length} appointments</span> today —{' '}
              <span className="text-emerald-400 font-semibold">{done} done</span>,{' '}
              <span className="text-violet-400 font-semibold">{inProgress} in progress</span>,{' '}
              <span className="text-amber-400 font-semibold">{waiting} waiting</span>
            </p>
            <div className="mt-2"><LiveDot lastUpdated={lastUpdated} /></div>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            <button onClick={load} title="Refresh"
              className="w-9 h-9 flex items-center justify-center rounded-xl bg-white/10 hover:bg-white/20 text-white transition-colors">
              <MdRefresh className="text-[18px]" />
            </button>
            <NavLink to="/doctor/daily-appointments"
              className="hidden sm:flex items-center gap-2 bg-violet-500 hover:bg-violet-400 text-white text-xs font-bold px-4 py-2.5 rounded-xl transition-colors">
              <MdCalendarToday className="text-[15px]" /> View Schedule
            </NavLink>
          </div>
        </div>
      </div>

      {/* ── Quick action tiles (mobile) ───────────────────────────────────── */}
      <div className="grid grid-cols-2 sm:hidden gap-3">
        <NavLink to="/doctor/daily-appointments"
          className="flex items-center gap-3 p-4 bg-white rounded-2xl border border-slate-200 shadow-sm hover:border-violet-200 transition-all">
          <div className="w-10 h-10 rounded-xl bg-violet-50 flex items-center justify-center shrink-0">
            <MdCalendarToday className="text-violet-600 text-[20px]" />
          </div>
          <div className="min-w-0">
            <p className="text-sm font-bold text-slate-800">Appointments</p>
            <p className="text-xs text-slate-400">{waiting} waiting</p>
          </div>
        </NavLink>
        <NavLink to="/doctor/request"
          className="flex items-center gap-3 p-4 bg-white rounded-2xl border border-slate-200 shadow-sm hover:border-amber-200 transition-all">
          <div className="w-10 h-10 rounded-xl bg-amber-50 flex items-center justify-center shrink-0">
            <MdInventory2 className="text-amber-600 text-[20px]" />
          </div>
          <div className="min-w-0">
            <p className="text-sm font-bold text-slate-800">Supplies</p>
            <p className="text-xs text-slate-400">{requests.length} requests</p>
          </div>
        </NavLink>
      </div>

      {/* ── Stat cards ────────────────────────────────────────────────────── */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 lg:gap-4">
        {stats.map(({ label, value, sub, color, bg, border }) => (
          <div key={label} className={`${bg} border ${border} rounded-2xl px-4 py-4 lg:px-5 transition-transform hover:scale-[1.02]`}>
            <p className="text-xs text-slate-500 font-medium">{label}</p>
            <p className={`text-3xl font-black mt-1 ${color}`}>{value}</p>
            <p className="text-[11px] text-slate-400 mt-0.5">{sub}</p>
          </div>
        ))}
      </div>

      {/* ── Main 2-col grid ───────────────────────────────────────────────── */}
      <div className="grid grid-cols-1 lg:grid-cols-[1fr_300px] gap-5">

        {/* Today's appointments */}
        <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden shadow-sm">
          <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100">
            <h2 className="text-sm font-bold text-slate-800">Today's Appointments</h2>
            <NavLink to="/doctor/daily-appointments"
              className="text-xs font-semibold text-violet-600 hover:text-violet-700 flex items-center gap-0.5">
              See all <MdChevronRight className="text-[14px]" />
            </NavLink>
          </div>

          {todayAppts.length === 0 ? (
            <div className="flex flex-col items-center py-12 text-center px-6">
              <MdCalendarToday className="text-slate-200 text-[32px] mb-2" />
              <p className="text-xs text-slate-400">No appointments scheduled today.</p>
            </div>
          ) : (
            <div className="divide-y divide-slate-100">
              {todayAppts.slice(0, 6).map(appt => {
                const cfg  = STATUS_CONFIG[appt.status] || STATUS_CONFIG.pending
                const Icon = appt.type === 'derma' ? MdFace : MdMedicalServices
                return (
                  <div key={appt.id}
                    className={`flex items-center gap-3 px-4 py-3.5 transition-colors
                      ${appt.status === 'in-progress' ? 'bg-violet-50/60' : 'hover:bg-slate-50'}`}>
                    <div className={`w-9 h-9 rounded-xl flex items-center justify-center shrink-0
                      ${appt.type === 'derma' ? 'bg-emerald-50' : 'bg-slate-100'}`}>
                      <Icon className={`text-[16px] ${appt.type === 'derma' ? 'text-emerald-600' : 'text-slate-500'}`} />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-semibold text-slate-800 truncate">{appt.patient_name || appt.patient}</p>
                      <p className="text-xs text-slate-400 truncate">{appt.reason || '—'}</p>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      <span className="text-xs text-slate-400 font-medium hidden sm:flex items-center gap-1">
                        <MdAccessTime className="text-[12px]" /> {appt.time || appt.appointment_time}
                      </span>
                      <span className={`text-[10px] font-bold border px-2 py-0.5 rounded-full ${cfg.badge}`}>
                        {cfg.label}
                      </span>
                    </div>
                    {appt.status === 'in-progress' && (
                      <button
                        onClick={() => navigate('/doctor/consultation', { state: { appointment: appt } })}
                        className="text-[11px] font-bold text-violet-600 bg-violet-50 border border-violet-200
                          px-2.5 py-1 rounded-lg hover:bg-violet-100 transition-colors shrink-0">
                        Consult
                      </button>
                    )}
                  </div>
                )
              })}
            </div>
          )}
        </div>

        {/* Right column */}
        <div className="space-y-4">

          {/* Walk-in queue */}
          <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden shadow-sm">
            <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100">
              <h2 className="text-sm font-bold text-slate-800 flex items-center gap-1.5">
                <MdQueuePlayNext className="text-amber-500 text-[16px]" /> Walk-in Queue
              </h2>
              <span className={`text-[10px] font-bold border px-2 py-0.5 rounded-full
                ${walkInQueue.length > 0 ? 'bg-amber-50 text-amber-600 border-amber-200' : 'bg-slate-100 text-slate-400 border-slate-200'}`}>
                {walkInQueue.length} waiting
              </span>
            </div>
            <div className="p-4 space-y-2 max-h-52 overflow-y-auto">
              {walkInQueue.length === 0 ? (
                <div className="flex flex-col items-center py-5">
                  <MdQueuePlayNext className="text-slate-200 text-[28px] mb-2" />
                  <p className="text-xs text-slate-400">No walk-ins assigned.</p>
                </div>
              ) : walkInQueue.map(q => (
                <div key={q.queueNo || q.queue_number}
                  className="flex items-center gap-3 p-3 rounded-xl bg-amber-50/60 border border-amber-100">
                  <div className="w-9 h-9 rounded-xl bg-amber-100 flex items-center justify-center font-black text-sm text-amber-700 shrink-0">
                    {q.queueNo || q.queue_number}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold text-slate-800 truncate">{q.patient || q.patient_name}</p>
                    <p className="text-[11px] text-slate-400 mt-0.5">Arrived {q.arrivedAt}</p>
                  </div>
                </div>
              ))}
            </div>
            <div className="px-4 pb-4">
              <NavLink to="/doctor/daily-appointments"
                className="w-full flex items-center justify-center gap-1.5 py-2.5 text-xs font-bold
                  text-amber-700 bg-amber-50 border border-amber-200 hover:bg-amber-100 rounded-xl transition-colors">
                Manage Queue <MdArrowForward className="text-[13px]" />
              </NavLink>
            </div>
          </div>

          {/* Recent supply requests */}
          <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden shadow-sm">
            <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100">
              <h2 className="text-sm font-bold text-slate-800">My Requests</h2>
              <NavLink to="/doctor/request"
                className="text-xs font-semibold text-violet-600 hover:text-violet-700 flex items-center gap-0.5">
                View all <MdChevronRight className="text-[14px]" />
              </NavLink>
            </div>
            <div className="p-4 space-y-2">
              {requests.length === 0 ? (
                <div className="flex flex-col items-center py-4">
                  <MdInventory2 className="text-slate-200 text-[24px] mb-1.5" />
                  <p className="text-xs text-slate-400">No recent requests.</p>
                </div>
              ) : requests.slice(0, 3).map(req => (
                <div key={req.id} className="flex items-center gap-3 p-3 rounded-xl border border-slate-100 hover:bg-slate-50">
                  <div className="w-8 h-8 rounded-xl bg-slate-100 flex items-center justify-center shrink-0">
                    <MdInventory2 className="text-slate-400 text-[15px]" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-xs font-semibold text-slate-800 truncate">{req.item_name || req.item}</p>
                    <p className="text-[10px] text-slate-400 mt-0.5">{req.qty_requested || req.quantity} {req.unit}s</p>
                  </div>
                  <span className={`text-[10px] font-bold border px-2 py-0.5 rounded-full shrink-0
                    ${req.status === 'approved'
                      ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                      : req.status === 'rejected'
                        ? 'bg-red-50 text-red-500 border-red-200'
                        : 'bg-amber-50 text-amber-700 border-amber-200'}`}>
                    {req.status}
                  </span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

export default Doctor_Dashboard