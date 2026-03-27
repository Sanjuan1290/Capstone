// client/src/pages/patientPage/MyAppointments.jsx
import { useEffect, useState } from 'react'
import { getMyAppointments, cancelAppointment } from '../../services/patient.service'
import {
  MdCalendarToday, MdAccessTime, MdFace,
  MdMedicalServices, MdSearch, MdClose,
  MdEventBusy, MdAdd, MdCancel, MdRefresh,
  MdPerson, MdNotes, MdChevronRight,
  MdCheckCircle, MdSchedule, MdPhone, MdEmail,
  MdHome, MdCake, MdWc
} from "react-icons/md"
import { NavLink } from "react-router-dom"

// ── Helpers ───────────────────────────────────────────────────────────────────
/** Format a YYYY-MM-DD string to "March 27, 2026" safely (no UTC shift) */
function formatDate(raw) {
  if (!raw) return '—'
  // raw may be a full ISO string like "2026-03-27T00:00:00.000Z" or just "2026-03-27"
  const str = typeof raw === 'string' ? raw : String(raw)
  const [y, m, d] = str.slice(0, 10).split('-').map(Number)
  if (!y || !m || !d) return str
  return new Date(y, m - 1, d).toLocaleDateString('en-PH', {
    month: 'long', day: 'numeric', year: 'numeric',
  })
}

const STATUS_CONFIG = {
  confirmed:   { label: "Confirmed",   badge: "bg-emerald-50 text-emerald-700 border-emerald-200", bar: "bg-emerald-500", icon: MdCheckCircle },
  pending:     { label: "Pending",     badge: "bg-amber-50   text-amber-700   border-amber-200",   bar: "bg-amber-400",   icon: MdSchedule    },
  completed:   { label: "Completed",   badge: "bg-slate-100  text-slate-500   border-slate-200",   bar: "bg-slate-300",   icon: MdCheckCircle },
  cancelled:   { label: "Cancelled",   badge: "bg-red-50     text-red-500     border-red-200",     bar: "bg-red-300",     icon: MdCancel      },
  rescheduled: { label: "Rescheduled", badge: "bg-sky-50     text-sky-700     border-sky-200",     bar: "bg-sky-400",     icon: MdRefresh     },
}

const TABS = [
  { key: "all",       label: "All"       },
  { key: "confirmed", label: "Confirmed" },
  { key: "pending",   label: "Pending"   },
  { key: "completed", label: "Completed" },
  { key: "cancelled", label: "Cancelled" },
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
          {/* Appointment ID */}
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
                  {/* ✅ FIX: formatDate handles both raw date strings and Date objects */}
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

          {/* Patient Info — shown for all since this is the patient's own appointment */}
          <div className="bg-slate-50 rounded-2xl p-4 space-y-3">
            <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Your Info on File</p>
            {[
              { icon: MdPerson,       label: 'Full Name',    value: appt.patient_full_name || appt.full_name },
              { icon: MdEmail,        label: 'Email',        value: appt.patient_email     || appt.email     },
              { icon: MdPhone,        label: 'Phone',        value: appt.patient_phone     || appt.phone     },
              { icon: MdCake,         label: 'Birthdate',    value: appt.patient_birthdate ? formatDate(appt.patient_birthdate) : appt.birthdate },
              { icon: MdWc,           label: 'Sex',          value: appt.patient_sex       || appt.sex       },
              { icon: MdHome,         label: 'Address',      value: appt.patient_address   || appt.address   },
            ].filter(r => r.value).map(({ icon: Ic, label, value }) => (
              <div key={label} className="flex items-start gap-2.5">
                <div className="w-6 h-6 rounded-lg bg-white border border-slate-200 flex items-center justify-center shrink-0 mt-0.5">
                  <Ic className="text-[11px] text-slate-400" />
                </div>
                <div>
                  <p className="text-[10px] text-slate-400 font-medium">{label}</p>
                  <p className="text-xs font-semibold text-slate-800">{value}</p>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Actions */}
        {isActive && (
          <div className="px-6 pb-6 pt-4 border-t border-slate-100 shrink-0 space-y-2">
            <NavLink to="/patient/reschedule-appointment"
              className="w-full flex items-center justify-center gap-2 py-2.5 text-xs font-bold
                text-white bg-[#0b1a2c] hover:bg-[#122236] rounded-xl transition-colors">
              <MdRefresh className="text-[14px]" /> Reschedule Appointment
            </NavLink>
            <button onClick={() => onCancel(appt.id)}
              className="w-full flex items-center justify-center gap-2 py-2.5 text-xs font-bold
                text-red-500 border border-red-200 bg-red-50 hover:bg-red-100 rounded-xl transition-colors">
              <MdCancel className="text-[14px]" /> Cancel Appointment
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
  const StatusIcon = cfg.icon
  const isActive = appt.status === 'confirmed' || appt.status === 'pending'

  return (
    <div onClick={() => onSelect(appt)}
      className={`relative bg-white border rounded-2xl overflow-hidden cursor-pointer transition-all duration-200
        hover:shadow-md hover:-translate-y-0.5
        ${isActive ? 'border-slate-200 shadow-sm' : 'border-slate-100'}`}>
      <div className={`absolute top-0 left-0 right-0 h-0.5 ${cfg.bar}`} />
      <div className="p-5">
        <div className="flex items-start justify-between gap-3 mb-4">
          <div className="flex items-center gap-3 min-w-0">
            <div className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0
              ${appt.type === 'derma' ? 'bg-emerald-50' : 'bg-slate-100'}`}>
              <Icon className={`text-[18px] ${appt.type === 'derma' ? 'text-emerald-600' : 'text-slate-500'}`} />
            </div>
            <div className="min-w-0">
              <p className="text-sm font-bold text-slate-800 truncate">{appt.doctor || appt.doctor_name}</p>
              <p className="text-xs text-slate-500 truncate">{appt.specialty}</p>
            </div>
          </div>
          <span className={`text-[11px] font-bold border px-2.5 py-1 rounded-full shrink-0 flex items-center gap-1 ${cfg.badge}`}>
            <StatusIcon className="text-[12px]" />
            {cfg.label}
          </span>
        </div>

        <div className="mb-4">
          <p className="text-xs font-semibold text-slate-800 truncate">{appt.reason}</p>
          <p className="text-[11px] font-mono text-slate-400 mt-0.5">#{appt.id}</p>
        </div>

        <div className="flex flex-wrap gap-2 mb-4">
          <span className="flex items-center gap-1 text-[11px] text-slate-500 bg-slate-50 border border-slate-100 px-2.5 py-1 rounded-lg">
            <MdCalendarToday className="text-[11px] text-slate-400" />
            {/* ✅ FIX: format raw date properly */}
            {formatDate(appt.appointment_date || appt.date)}
          </span>
          <span className="flex items-center gap-1 text-[11px] text-slate-500 bg-slate-50 border border-slate-100 px-2.5 py-1 rounded-lg">
            <MdAccessTime className="text-[11px] text-slate-400" />
            {appt.appointment_time || appt.time || '—'}
          </span>
        </div>

        {isActive && (
          <div className="flex gap-2 pt-3 border-t border-slate-100">
            <NavLink to="/patient/reschedule-appointment" onClick={e => e.stopPropagation()}
              className="flex-1 flex items-center justify-center gap-1.5 py-2 text-[11px] font-bold
                text-slate-600 border border-slate-200 hover:border-slate-300 hover:bg-slate-50 rounded-xl transition-all">
              <MdRefresh className="text-[13px]" /> Reschedule
            </NavLink>
            <button onClick={e => { e.stopPropagation(); onCancel(appt.id) }}
              className="flex-1 flex items-center justify-center gap-1.5 py-2 text-[11px] font-bold
                text-red-500 border border-red-100 bg-red-50 hover:bg-red-100 rounded-xl transition-all">
              <MdCancel className="text-[13px]" /> Cancel
            </button>
          </div>
        )}
      </div>
    </div>
  )
}

// ── Next Appointment Banner ───────────────────────────────────────────────────
const NextAppointmentBanner = ({ appt }) => {
  if (!appt) return null
  const Icon = appt.type === 'derma' ? MdFace : MdMedicalServices
  return (
    <div className="bg-[#0b1a2c] rounded-2xl p-5 text-white">
      <p className="text-[10px] font-bold text-emerald-400 uppercase tracking-widest mb-3">Next Appointment</p>
      <div className="flex items-center gap-4 flex-wrap">
        <div className="flex items-center gap-3 flex-1 min-w-0">
          <div className="w-11 h-11 rounded-xl bg-white/10 flex items-center justify-center shrink-0">
            <Icon className="text-[20px] text-emerald-400" />
          </div>
          <div className="min-w-0">
            <p className="text-sm font-bold truncate">{appt.doctor || appt.doctor_name}</p>
            <p className="text-xs text-white/60">{appt.reason}</p>
          </div>
        </div>
        <div className="flex gap-4 shrink-0">
          <div>
            <p className="text-[10px] text-white/50 uppercase tracking-wide mb-0.5">Date</p>
            <p className="text-xs font-semibold">{formatDate(appt.appointment_date || appt.date)}</p>
          </div>
          <div>
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
      .then(data => setAppointments(Array.isArray(data) ? data : []))
      .catch(() => {})
      .finally(() => setLoadingData(false))
  }, [])

  const handleCancel = async (appointmentId) => {
    if (!confirm('Cancel this appointment?')) return
    try {
      await cancelAppointment(appointmentId)
      setAppointments(prev => prev.map(a => a.id === appointmentId ? { ...a, status: 'cancelled' } : a))
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
    .filter(a => a.status === 'confirmed' || a.status === 'pending')
    .sort((a, b) => {
      const da = new Date((a.appointment_date || a.date || '').slice(0, 10))
      const db = new Date((b.appointment_date || b.date || '').slice(0, 10))
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
          <p className="text-sm text-slate-500 mt-0.5">Track and manage all your clinic visits.</p>
        </div>
        <NavLink to="/patient/book"
          className="flex items-center gap-1.5 bg-[#0b1a2c] hover:bg-[#122236] text-white
            text-xs font-semibold px-4 py-2.5 rounded-xl transition-colors shrink-0">
          <MdAdd className="text-[15px]" /> Book New
        </NavLink>
      </div>

      {(activeTab === 'all' || activeTab === 'confirmed' || activeTab === 'pending') && !search && (
        <NextAppointmentBanner appt={nextAppt} />
      )}

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
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {filtered.map(appt => (
            <AppointmentCard key={appt.id} appt={appt} onSelect={setModal} onCancel={handleCancel} />
          ))}
        </div>
      )}

      <p className="text-[11px] text-slate-400 font-medium">
        Showing {filtered.length} of {appointments.length} appointments
      </p>

      {modal && (
        <DetailModal appt={modal} onClose={() => setModal(null)} onCancel={handleCancel} />
      )}
    </div>
  )
}

export default MyAppointments