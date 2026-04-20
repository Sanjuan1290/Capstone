// client/src/pages/patientPage/MyAppointments.jsx
// FIX: Completed and cancelled appointments no longer show here — they live in History.
//      Only pending / confirmed / rescheduled appointments are shown.

import { useEffect, useState } from 'react'
import { getMyAppointments, cancelAppointment } from '../../services/patient.service'
import {
  MdCalendarToday, MdAccessTime, MdFace,
  MdMedicalServices, MdSearch, MdClose,
  MdEventBusy, MdAdd, MdCancel, MdRefresh,
  MdPerson, MdNotes, MdChevronRight,
  MdCheckCircle, MdSchedule, MdPhone, MdEmail,
  MdHome, MdCake, MdWc, MdHistory
} from "react-icons/md"
import { NavLink } from "react-router-dom"
import { parseDateOnly } from '../../utils/date'

// ── Helpers ───────────────────────────────────────────────────────────────────
function formatDate(raw) {
  if (!raw) return '—'
  const str = typeof raw === 'string' ? raw : String(raw)
  const [y, m, d] = str.slice(0, 10).split('-').map(Number)
  if (!y || !m || !d) return str
  return new Date(y, m - 1, d).toLocaleDateString('en-PH', {
    month: 'long', day: 'numeric', year: 'numeric',
  })
}

// Only show active/upcoming statuses in My Appointments
const ACTIVE_STATUSES = ['pending', 'confirmed', 'rescheduled']

const STATUS_CONFIG = {
  confirmed:   { label: "Confirmed",   badge: "bg-emerald-50 text-emerald-700 border-emerald-200", bar: "bg-emerald-500", icon: MdCheckCircle },
  pending:     { label: "Pending",     badge: "bg-amber-50   text-amber-700   border-amber-200",   bar: "bg-amber-400",   icon: MdSchedule    },
  rescheduled: { label: "Rescheduled", badge: "bg-sky-50     text-sky-700     border-sky-200",     bar: "bg-sky-400",     icon: MdRefresh     },
}

const TABS = [
  { key: "all",         label: "All"         },
  { key: "confirmed",   label: "Confirmed"   },
  { key: "pending",     label: "Pending"     },
  { key: "rescheduled", label: "Rescheduled" },
]

// ── Detail Modal ──────────────────────────────────────────────────────────────
const DetailModal = ({ appt, onClose, onCancel }) => {
  if (!appt) return null
  const cfg      = STATUS_CONFIG[appt.status] || STATUS_CONFIG.pending
  const Icon     = appt.type === 'derma' ? MdFace : MdMedicalServices
  const isActive = appt.status === 'confirmed' || appt.status === 'pending'

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm px-4"
      onClick={onClose}>
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md max-h-[92vh] flex flex-col overflow-hidden"
        onClick={e => e.stopPropagation()}>

        {/* Header */}
        <div className="flex items-center gap-3 px-6 py-5 border-b border-slate-100 shrink-0">
          <div className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0
            ${appt.type === 'derma' ? 'bg-emerald-50' : 'bg-slate-100'}`}>
            <Icon className={`text-[18px] ${appt.type === 'derma' ? 'text-emerald-600' : 'text-slate-500'}`} />
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-bold text-slate-800 truncate">{appt.doctor || appt.doctor_name}</p>
            <p className="text-xs text-slate-500">{appt.clinic || appt.specialty}</p>
          </div>
          <span className={`text-[11px] font-bold border px-2.5 py-0.5 rounded-full shrink-0 ${cfg.badge}`}>
            {cfg.label}
          </span>
          <button onClick={onClose}
            className="w-8 h-8 flex items-center justify-center rounded-xl hover:bg-slate-100 text-slate-400 shrink-0">
            <MdClose className="text-[18px]" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-6 py-5 space-y-4">
          <span className="text-[11px] font-mono font-semibold text-slate-400 bg-slate-100 px-2 py-0.5 rounded-md inline-block">
            #{appt.id}
          </span>

          {/* Schedule */}
          <div className="bg-slate-50 rounded-2xl p-4 space-y-3">
            <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Schedule</p>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <p className="text-[11px] text-slate-400 flex items-center gap-1 mb-0.5">
                  <MdCalendarToday className="text-[11px]" /> Date
                </p>
                <p className="text-sm font-semibold text-slate-800">
                  {formatDate(appt.appointment_date || appt.date)}
                </p>
              </div>
              <div>
                <p className="text-[11px] text-slate-400 flex items-center gap-1 mb-0.5">
                  <MdAccessTime className="text-[11px]" /> Time
                </p>
                <p className="text-sm font-semibold text-slate-800">
                  {appt.appointment_time || appt.time || '—'}
                </p>
              </div>
            </div>
          </div>

          {/* Visit Info */}
          <div className="bg-slate-50 rounded-2xl p-4 space-y-3">
            <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Visit Info</p>
            <div>
              <p className="text-[11px] text-slate-400 flex items-center gap-1 mb-0.5">
                <MdPerson className="text-[11px]" /> Reason for Visit
              </p>
              <p className="text-sm font-semibold text-slate-800">{appt.reason || '—'}</p>
            </div>
            <div>
              <p className="text-[11px] text-slate-400 mb-0.5">Clinic Type</p>
              <p className="text-sm font-semibold text-slate-800 capitalize">
                {appt.clinic_type === 'derma' ? 'Dermatology' : appt.clinic_type === 'medical' ? 'General Medicine' : (appt.clinic_type || '—')}
              </p>
            </div>
            {appt.notes && (
              <div>
                <p className="text-[11px] text-slate-400 flex items-center gap-1 mb-0.5">
                  <MdNotes className="text-[11px]" /> Notes
                </p>
                <p className="text-sm text-slate-700 leading-relaxed">{appt.notes}</p>
              </div>
            )}
          </div>

          {/* Patient Info */}
          <div className="bg-slate-50 rounded-2xl p-4 space-y-3">
            <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Your Info on File</p>
            {[
              { icon: MdPerson, label: 'Full Name',  value: appt.patient_full_name || appt.full_name },
              { icon: MdEmail,  label: 'Email',      value: appt.patient_email     || appt.email     },
              { icon: MdPhone,  label: 'Phone',      value: appt.patient_phone     || appt.phone     },
              { icon: MdCake,   label: 'Birthdate',  value: appt.patient_birthdate ? formatDate(appt.patient_birthdate) : appt.birthdate },
              { icon: MdWc,     label: 'Sex',        value: appt.patient_sex       || appt.sex       },
              { icon: MdHome,   label: 'Address',    value: appt.patient_address   || appt.address   },
            ].filter(r => r.value).map(({ icon: Ic, label, value }) => (
              <div key={label} className="flex items-start gap-2.5">
                <div className="w-6 h-6 rounded-lg bg-white border border-slate-200 flex items-center justify-center shrink-0 mt-0.5">
                  <Ic className="text-[11px] text-slate-400" />
                </div>
                <div>
                  <p className="text-[10px] text-slate-400">{label}</p>
                  <p className="text-sm font-medium text-slate-700">{value}</p>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Footer actions */}
        {isActive && (
          <div className="px-6 pb-5 pt-3 border-t border-slate-100 flex gap-3 shrink-0">
            <NavLink
              to="/patient/reschedule-appointment"
              state={{ appointment: appt }}
              onClick={onClose}
              className="flex-1 flex items-center justify-center gap-1.5 py-2.5 text-xs font-semibold text-sky-700 border border-sky-200 bg-sky-50 hover:bg-sky-100 rounded-xl transition-colors">
              <MdRefresh className="text-[14px]" /> Reschedule
            </NavLink>
            <button onClick={() => onCancel(appt.id)}
              className="flex-1 flex items-center justify-center gap-1.5 py-2.5 text-xs font-semibold text-red-600 border border-red-200 bg-red-50 hover:bg-red-100 rounded-xl transition-colors">
              <MdCancel className="text-[14px]" /> Cancel
            </button>
          </div>
        )}
      </div>
    </div>
  )
}

// ── Appointment Card ──────────────────────────────────────────────────────────
const AppointmentCard = ({ appt, onSelect, onCancel }) => {
  const cfg      = STATUS_CONFIG[appt.status] || STATUS_CONFIG.pending
  const Icon     = appt.type === 'derma' ? MdFace : MdMedicalServices
  const isActive = appt.status === 'confirmed' || appt.status === 'pending'

  return (
    <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden shadow-sm hover:shadow-md transition-shadow">
      <div className={`h-1 w-full ${cfg.bar}`} />
      <div className="p-4 space-y-3">
        <div className="flex items-start gap-3">
          <div className={`w-9 h-9 rounded-xl flex items-center justify-center shrink-0
            ${appt.type === 'derma' ? 'bg-emerald-50' : 'bg-slate-100'}`}>
            <Icon className={`text-[16px] ${appt.type === 'derma' ? 'text-emerald-600' : 'text-slate-500'}`} />
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-bold text-slate-800 truncate">{appt.doctor || appt.doctor_name}</p>
            <p className="text-xs text-slate-500 truncate">{appt.reason || '—'}</p>
          </div>
          <span className={`text-[10px] font-bold border px-2 py-0.5 rounded-full shrink-0 ${cfg.badge}`}>
            {cfg.label}
          </span>
        </div>

        <div className="grid grid-cols-2 gap-2 text-[11px] text-slate-500">
          <span className="flex items-center gap-1">
            <MdCalendarToday className="text-[11px]" />
            {formatDate(appt.appointment_date || appt.date)}
          </span>
          <span className="flex items-center gap-1">
            <MdAccessTime className="text-[11px]" />
            {appt.appointment_time || appt.time || '—'}
          </span>
        </div>

        <div className="flex gap-2 pt-1 border-t border-slate-100">
          <button onClick={() => onSelect(appt)}
            className="flex-1 flex items-center justify-center gap-1 py-1.5 text-[11px] font-semibold text-slate-600 border border-slate-200 rounded-lg hover:bg-slate-50 transition-colors">
            Details <MdChevronRight className="text-[13px]" />
          </button>
          {isActive && (
            <button onClick={() => onCancel(appt.id)}
              className="flex items-center justify-center w-8 h-8 text-slate-400 border border-slate-200 rounded-lg hover:border-red-200 hover:text-red-500 hover:bg-red-50 transition-all">
              <MdCancel className="text-[14px]" />
            </button>
          )}
        </div>
      </div>
    </div>
  )
}

// ── Next Appointment Banner ───────────────────────────────────────────────────
const NextAppointmentBanner = ({ appt }) => {
  if (!appt) return null
  const cfg = STATUS_CONFIG[appt.status] || STATUS_CONFIG.pending
  return (
    <div className={`rounded-2xl border px-5 py-4 ${cfg.badge}`}>
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div>
          <p className="text-[10px] font-bold uppercase tracking-widest opacity-60 mb-0.5">Next Appointment</p>
          <p className="text-sm font-bold">{appt.doctor || appt.doctor_name}</p>
          <p className="text-xs opacity-70 mt-0.5">{appt.reason || '—'}</p>
        </div>
        <div className="text-right shrink-0">
          <div>
            <p className="text-[10px] text-white/50 uppercase tracking-wide mb-0.5">Date</p>
            <p className="text-xs font-semibold">{formatDate(appt.appointment_date || appt.date)}</p>
          </div>
          <div className="mt-1">
            <p className="text-[10px] text-white/50 uppercase tracking-wide mb-0.5">Time</p>
            <p className="text-xs font-semibold">{appt.appointment_time || appt.time || '—'}</p>
          </div>
        </div>
      </div>
    </div>
  )
}

// ── Main Component ────────────────────────────────────────────────────────────
const MyAppointments = () => {
  const [appointments, setAppointments] = useState([])
  const [loadingData,  setLoadingData]  = useState(true)
  const [activeTab,    setActiveTab]    = useState('all')
  const [search,       setSearch]       = useState('')
  const [modal,        setModal]        = useState(null)

  useEffect(() => {
    getMyAppointments()
      .then(data => {
        // FIX: Only show active appointments here. Completed/cancelled go to History.
        const active = Array.isArray(data)
          ? data.filter(a => ACTIVE_STATUSES.includes(a.status))
          : []
        setAppointments(active)
      })
      .catch(() => {})
      .finally(() => setLoadingData(false))
  }, [])

  const handleCancel = async (appointmentId) => {
    if (!confirm('Cancel this appointment?')) return
    try {
      await cancelAppointment(appointmentId)
      setAppointments(prev => prev.filter(a => a.id !== appointmentId))
      if (modal?.id === appointmentId) setModal(null)
    } catch (err) {
      alert(err.message)
    }
  }

  const counts = TABS.reduce((acc, t) => {
    acc[t.key] = t.key === 'all'
      ? appointments.length
      : appointments.filter(a => a.status === t.key).length
    return acc
  }, {})

  const filtered = appointments.filter(a => {
    const matchTab    = activeTab === 'all' || a.status === activeTab
    const doctorName  = a.doctor || a.doctor_name || ''
    const matchSearch = !search ||
      doctorName.toLowerCase().includes(search.toLowerCase()) ||
      (a.reason || '').toLowerCase().includes(search.toLowerCase()) ||
      String(a.id).includes(search)
    return matchTab && matchSearch
  })

  const nextAppt = appointments
    .filter(a => a.status === 'confirmed' || a.status === 'pending' || a.status === 'rescheduled')
    .sort((a, b) => {
      const da = parseDateOnly(a.appointment_date || a.date || '')
      const db = parseDateOnly(b.appointment_date || b.date || '')
      if (!da && !db) return 0
      if (!da) return 1
      if (!db) return -1
      return da - db
    })[0]

  if (loadingData) return (
    <div className="flex items-center justify-center p-20">
      <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-[#0b1a2c]" />
    </div>
  )

  return (
    <div className="max-w-5xl space-y-5">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-800">My Appointments</h1>
          <p className="text-sm text-slate-500 mt-0.5">Track and manage your upcoming clinic visits.</p>
        </div>
        <NavLink to="/patient/book"
          className="flex items-center gap-1.5 bg-[#0b1a2c] hover:bg-[#122236] text-white
            text-xs font-semibold px-4 py-2.5 rounded-xl transition-colors shrink-0">
          <MdAdd className="text-[15px]" /> Book New
        </NavLink>
      </div>

      {/* Next appointment banner */}
      {(activeTab === 'all' || activeTab === 'confirmed' || activeTab === 'pending') && !search && (
        <NextAppointmentBanner appt={nextAppt} />
      )}

      {/* History hint */}
      <div className="flex items-center gap-2 bg-slate-50 border border-slate-200 rounded-xl px-4 py-2.5">
        <MdHistory className="text-slate-400 text-[15px] shrink-0" />
        <p className="text-xs text-slate-500">
          Looking for past visits?{' '}
          <NavLink to="/patient/history" className="text-emerald-600 font-semibold hover:underline">
            View your Appointment History
          </NavLink>
        </p>
      </div>

      {/* Search + Tabs */}
      <div className="flex items-center gap-3 flex-wrap">
        <div className="flex items-center gap-2 bg-white border border-slate-200 rounded-xl px-3 py-2
          flex-1 min-w-52 max-w-72 focus-within:border-slate-300 transition-colors">
          <MdSearch className="text-slate-400 text-[15px] shrink-0" />
          <input type="text" value={search} onChange={e => setSearch(e.target.value)}
            placeholder="Search doctor, reason, ID…"
            className="text-sm text-slate-700 placeholder-slate-300 bg-transparent outline-none w-full" />
          {search && (
            <button onClick={() => setSearch('')} className="text-slate-300 hover:text-slate-500">
              <MdClose className="text-[13px]" />
            </button>
          )}
        </div>

        <div className="flex gap-0.5 bg-white border border-slate-200 rounded-xl p-1 overflow-x-auto">
          {TABS.map(({ key, label }) => (
            <button key={key} onClick={() => setActiveTab(key)}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[11px] font-bold whitespace-nowrap transition-all
                ${activeTab === key ? 'bg-[#0b1a2c] text-emerald-400' : 'text-slate-500 hover:bg-slate-100 hover:text-slate-700'}`}>
              {label}
              <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded-full
                ${activeTab === key ? 'bg-white/10 text-emerald-300' : 'bg-slate-100 text-slate-400'}`}>
                {counts[key]}
              </span>
            </button>
          ))}
        </div>
      </div>

      {filtered.length === 0 ? (
        <div className="bg-white border border-slate-200 rounded-2xl flex flex-col items-center justify-center py-16 text-center px-6">
          <MdEventBusy className="text-[22px] text-slate-300 mb-3" />
          <p className="text-sm font-semibold text-slate-500">No appointments found</p>
          <p className="text-xs text-slate-400 mt-1">
            {appointments.length === 0
              ? 'You have no upcoming appointments.'
              : 'Try a different filter or search term.'}
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {filtered.map(appt => (
            <AppointmentCard key={appt.id} appt={appt} onSelect={setModal} onCancel={handleCancel} />
          ))}
        </div>
      )}

      <p className="text-[11px] text-slate-400 font-medium">
        Showing {filtered.length} of {appointments.length} active appointments
      </p>

      {modal && (
        <DetailModal appt={modal} onClose={() => setModal(null)} onCancel={handleCancel} />
      )}
    </div>
  )
}

export default MyAppointments
