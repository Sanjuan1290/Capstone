// client/src/pages/staffPage/Staff_Appointments.jsx
// FIX 2: Patient profile details in detail panel were blank.
//         Root causes:
//         a) getPatients returned 'full_name' but AddModal used 'p.name' — fixed in staff.controller (returns name alias now)
//         b) Detail panel filter removed ALL null/undefined values so the section appeared empty.
//            Now every field always renders, showing '—' for missing data.

import { useEffect, useState } from 'react'
import {
  getAppointments, confirmAppointment, cancelAppointment,
  rescheduleAppointment, createAppointment, getPatients, getDoctors
} from '../../services/staff.service'
import {
  MdSearch, MdClose, MdAdd, MdCheck, MdCancel, MdRefresh,
  MdFace, MdMedicalServices, MdCalendarToday, MdAccessTime,
  MdChevronRight, MdEventAvailable, MdPerson, MdNotes,
  MdPhone, MdEmail, MdHome, MdCake, MdWc
} from 'react-icons/md'

function formatDate(raw) {
  if (!raw) return '—'
  const [y, m, d] = String(raw).slice(0, 10).split('-').map(Number)
  if (!y || !m || !d) return String(raw)
  return new Date(y, m - 1, d).toLocaleDateString('en-PH', { month: 'long', day: 'numeric', year: 'numeric' })
}

const STATUS_CONFIG = {
  confirmed:   { label: 'Confirmed',   badge: 'bg-emerald-50 text-emerald-700 border-emerald-200', row: 'border-l-emerald-400' },
  pending:     { label: 'Pending',     badge: 'bg-amber-50   text-amber-700   border-amber-200',   row: 'border-l-amber-400'   },
  completed:   { label: 'Completed',   badge: 'bg-slate-100  text-slate-500   border-slate-200',   row: 'border-l-slate-300'   },
  cancelled:   { label: 'Cancelled',   badge: 'bg-red-50     text-red-500     border-red-200',     row: 'border-l-red-400'     },
  rescheduled: { label: 'Rescheduled', badge: 'bg-sky-50     text-sky-700     border-sky-200',     row: 'border-l-sky-400'     },
}
const TABS = [
  { key: 'all', label: 'All' }, { key: 'pending', label: 'Pending' },
  { key: 'confirmed', label: 'Confirmed' }, { key: 'completed', label: 'Completed' },
  { key: 'cancelled', label: 'Cancelled' },
]

// ── Reschedule Modal ──────────────────────────────────────────────────────────
const RescheduleModal = ({ appt, onClose, onSave }) => {
  const [date,   setDate]   = useState(appt.appointment_date?.slice(0,10) || '')
  const [time,   setTime]   = useState(appt.appointment_time || appt.time || '')
  const [reason, setReason] = useState(appt.reason || '')
  const [saving, setSaving] = useState(false)

  const handleSave = async () => {
    if (!date || !time) return
    setSaving(true)
    try {
      await rescheduleAppointment(appt.id, { appointment_date: date, appointment_time: time, reason })
      onSave(appt.id, date, time, reason)
      onClose()
    } catch { alert('Failed to reschedule.') }
    finally   { setSaving(false) }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm px-4" onClick={onClose}>
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between px-6 py-5 border-b border-slate-100">
          <div>
            <p className="text-sm font-bold text-slate-800">Reschedule Appointment</p>
            <p className="text-xs text-slate-500 mt-0.5">For {appt.patient_name || appt.patient}</p>
          </div>
          <button onClick={onClose} className="w-8 h-8 flex items-center justify-center rounded-xl hover:bg-slate-100 text-slate-400"><MdClose /></button>
        </div>
        <div className="px-6 py-5 space-y-4">
          <div>
            <label className="text-xs font-bold text-slate-500 uppercase tracking-widest mb-1.5 block">New Date</label>
            <input type="date" value={date} onChange={e => setDate(e.target.value)}
              min={new Date().toISOString().split('T')[0]}
              className="w-full text-sm bg-slate-50 border-2 border-slate-200 rounded-xl px-3 py-2.5 focus:outline-none focus:border-sky-400" />
          </div>
          <div>
            <label className="text-xs font-bold text-slate-500 uppercase tracking-widest mb-1.5 block">New Time</label>
            <input type="text" value={time} onChange={e => setTime(e.target.value)} placeholder="e.g. 9:00 AM"
              className="w-full text-sm bg-slate-50 border-2 border-slate-200 rounded-xl px-3 py-2.5 focus:outline-none focus:border-sky-400" />
          </div>
          <div>
            <label className="text-xs font-bold text-slate-500 uppercase tracking-widest mb-1.5 block">Reason (optional)</label>
            <input type="text" value={reason} onChange={e => setReason(e.target.value)}
              className="w-full text-sm bg-slate-50 border-2 border-slate-200 rounded-xl px-3 py-2.5 focus:outline-none focus:border-sky-400" />
          </div>
        </div>
        <div className="px-6 pb-6 flex gap-3">
          <button onClick={onClose} className="flex-1 py-2.5 text-sm font-semibold text-slate-600 border border-slate-200 rounded-xl hover:bg-slate-50">Cancel</button>
          <button onClick={handleSave} disabled={!date || !time || saving}
            className="flex-1 py-2.5 text-sm font-bold text-white bg-[#0b1a2c] hover:bg-[#122236] disabled:opacity-40 rounded-xl">
            {saving ? 'Saving…' : 'Save Changes'}
          </button>
        </div>
      </div>
    </div>
  )
}

// ── Add Appointment Modal ─────────────────────────────────────────────────────
const AddAppointmentModal = ({ onClose, onAdd }) => {
  const [patients,  setPatients]  = useState([])
  const [patSearch, setPatSearch] = useState('')
  const [doctors,   setDoctors]   = useState([])
  const [form, setForm] = useState({
    patient_id: '', doctor_id: '', clinic_type: 'medical',
    reason: '', appointment_date: '', appointment_time: '', notes: ''
  })
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    getDoctors().then(setDoctors).catch(() => {})
  }, [])

  useEffect(() => {
    const t = setTimeout(() => {
      if (patSearch.length >= 2) getPatients(patSearch).then(setPatients).catch(() => {})
      else setPatients([])
    }, 300)
    return () => clearTimeout(t)
  }, [patSearch])

  const filteredDoctors = doctors.filter(d =>
    form.clinic_type === 'derma'
      ? (d.specialty || '').toLowerCase().includes('derm')
      : !(d.specialty || '').toLowerCase().includes('derm')
  )
  const valid = form.patient_id && form.doctor_id && form.appointment_date && form.appointment_time

  const handleSave = async () => {
    if (!valid) return
    setSaving(true)
    try {
      const appt = await createAppointment(form)
      if (appt && appt.id) { onAdd(appt); onClose() }
      else alert(appt.message || 'Failed to create appointment.')
    } catch { alert('Failed to create appointment.') }
    finally   { setSaving(false) }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm px-4" onClick={onClose}>
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md max-h-[92vh] flex flex-col" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between px-6 py-5 border-b border-slate-100 shrink-0">
          <div>
            <p className="text-sm font-bold text-slate-800">New Appointment</p>
            <p className="text-xs text-slate-500 mt-0.5">Book an appointment for a patient</p>
          </div>
          <button onClick={onClose} className="w-8 h-8 flex items-center justify-center rounded-xl hover:bg-slate-100 text-slate-400"><MdClose /></button>
        </div>
        <div className="flex-1 overflow-y-auto px-6 py-5 space-y-4">
          {/* Patient search */}
          <div>
            <label className="text-xs font-bold text-slate-500 uppercase tracking-widest mb-1.5 block">Patient</label>
            <input type="text" value={patSearch} onChange={e => setPatSearch(e.target.value)}
              placeholder="Type at least 2 characters to search…"
              className="w-full text-sm bg-slate-50 border-2 border-slate-200 rounded-xl px-3 py-2.5 focus:outline-none focus:border-sky-400" />
            {patients.length > 0 && (
              <div className="mt-1 bg-white border border-slate-200 rounded-xl max-h-36 overflow-y-auto shadow-lg z-10 relative">
                {patients.map(p => (
                  <button key={p.id}
                    // FIX: use p.name (now returned by backend) or fallback to p.full_name
                    onClick={() => { setForm(f => ({ ...f, patient_id: p.id })); setPatSearch(p.name || p.full_name || ''); setPatients([]) }}
                    className="w-full text-left px-4 py-2.5 text-sm hover:bg-slate-50 transition-colors border-b border-slate-100 last:border-0">
                    <span className="font-semibold text-slate-800">{p.name || p.full_name}</span>
                    <span className="text-slate-400 ml-2 text-xs">{p.email}</span>
                  </button>
                ))}
              </div>
            )}
            {form.patient_id && <p className="text-xs text-emerald-600 font-semibold mt-1">✓ Patient selected</p>}
          </div>

          {/* Clinic Type */}
          <div>
            <label className="text-xs font-bold text-slate-500 uppercase tracking-widest mb-1.5 block">Clinic Type</label>
            <div className="grid grid-cols-2 gap-2">
              {[{ v: 'medical', l: 'General Medicine' }, { v: 'derma', l: 'Dermatology' }].map(({ v, l }) => (
                <button key={v} onClick={() => setForm(f => ({ ...f, clinic_type: v, doctor_id: '' }))}
                  className={`py-2.5 rounded-xl text-xs font-bold border-2 transition-all
                    ${form.clinic_type === v ? 'border-sky-400 bg-sky-50 text-sky-700' : 'border-slate-200 text-slate-600 hover:border-slate-300'}`}>
                  {l}
                </button>
              ))}
            </div>
          </div>

          {/* Doctor */}
          <div>
            <label className="text-xs font-bold text-slate-500 uppercase tracking-widest mb-1.5 block">Doctor</label>
            <select value={form.doctor_id} onChange={e => setForm(f => ({ ...f, doctor_id: e.target.value }))}
              className="w-full text-sm bg-slate-50 border-2 border-slate-200 rounded-xl px-3 py-2.5 focus:outline-none focus:border-sky-400">
              <option value="">Select doctor…</option>
              {filteredDoctors.map(d => <option key={d.id} value={d.id}>{d.full_name || d.name}</option>)}
            </select>
          </div>

          {/* Date */}
          <div>
            <label className="text-xs font-bold text-slate-500 uppercase tracking-widest mb-1.5 block">Date</label>
            <input type="date" value={form.appointment_date}
              onChange={e => setForm(f => ({ ...f, appointment_date: e.target.value }))}
              min={new Date().toISOString().split('T')[0]}
              className="w-full text-sm bg-slate-50 border-2 border-slate-200 rounded-xl px-3 py-2.5 focus:outline-none focus:border-sky-400" />
          </div>

          {/* Time */}
          <div>
            <label className="text-xs font-bold text-slate-500 uppercase tracking-widest mb-1.5 block">Time</label>
            <input type="text" value={form.appointment_time}
              onChange={e => setForm(f => ({ ...f, appointment_time: e.target.value }))}
              placeholder="e.g. 9:00 AM"
              className="w-full text-sm bg-slate-50 border-2 border-slate-200 rounded-xl px-3 py-2.5 focus:outline-none focus:border-sky-400" />
          </div>

          {/* Reason */}
          <div>
            <label className="text-xs font-bold text-slate-500 uppercase tracking-widest mb-1.5 block">Reason (optional)</label>
            <input type="text" value={form.reason}
              onChange={e => setForm(f => ({ ...f, reason: e.target.value }))}
              placeholder="e.g. General Consultation"
              className="w-full text-sm bg-slate-50 border-2 border-slate-200 rounded-xl px-3 py-2.5 focus:outline-none focus:border-sky-400" />
          </div>
        </div>
        <div className="px-6 pb-6 flex gap-3 shrink-0">
          <button onClick={onClose} className="flex-1 py-2.5 text-sm font-semibold text-slate-600 border border-slate-200 rounded-xl hover:bg-slate-50">Cancel</button>
          <button onClick={handleSave} disabled={!valid || saving}
            className="flex-1 py-2.5 text-sm font-bold text-white bg-[#0b1a2c] hover:bg-[#122236] disabled:opacity-40 rounded-xl">
            {saving ? 'Creating…' : 'Create Appointment'}
          </button>
        </div>
      </div>
    </div>
  )
}

// ── Detail Panel ──────────────────────────────────────────────────────────────
const DetailPanel = ({ appt, onClose, onConfirm, onCancel, onReschedule }) => {
  if (!appt) return null
  const cfg      = STATUS_CONFIG[appt.status] || STATUS_CONFIG.pending
  const Icon     = appt.type === 'derma' ? MdFace : MdMedicalServices
  const isActive = appt.status === 'confirmed' || appt.status === 'pending'

  // FIX 2: Always show all patient fields; use '—' as explicit fallback for nulls.
  // Do NOT filter them out — an empty section looked "broken" when all were null.
  const patientFields = [
    { icon: MdPerson, label: 'Full Name',  value: appt.patient_name || appt.patient || '—' },
    { icon: MdEmail,  label: 'Email',      value: appt.patient_email    || '—' },
    { icon: MdPhone,  label: 'Phone',      value: appt.patient_phone    || '—' },
    { icon: MdCake,   label: 'Birthdate',  value: appt.patient_birthdate ? formatDate(appt.patient_birthdate) : '—' },
    { icon: MdWc,     label: 'Sex',        value: appt.patient_sex      || '—' },
    { icon: MdHome,   label: 'Address',    value: appt.patient_address  || '—' },
  ]

  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center gap-3 px-6 py-5 border-b border-slate-100 shrink-0">
        <div className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 ${appt.type === 'derma' ? 'bg-emerald-50' : 'bg-slate-100'}`}>
          <Icon className={`text-[18px] ${appt.type === 'derma' ? 'text-emerald-600' : 'text-slate-500'}`} />
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-bold text-slate-800 truncate">{appt.patient_name || appt.patient}</p>
          <p className="text-xs text-slate-500 font-mono">#{appt.id}</p>
        </div>
        <span className={`text-[11px] font-bold border px-2.5 py-0.5 rounded-full shrink-0 ${cfg.badge}`}>{cfg.label}</span>
        <button onClick={onClose} className="w-8 h-8 flex items-center justify-center rounded-xl hover:bg-slate-100 text-slate-400"><MdClose /></button>
      </div>

      <div className="flex-1 overflow-y-auto px-6 py-4 space-y-4">

        {/* Patient Info — FIX 2: Always renders; no filter */}
        <div className="bg-slate-50 rounded-2xl p-4 space-y-3">
          <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Patient Information</p>
          {patientFields.map(({ icon: I, label, value }) => (
            <div key={label} className="flex items-start gap-3">
              <div className="w-7 h-7 rounded-lg bg-white border border-slate-200 flex items-center justify-center shrink-0 mt-0.5">
                <I className="text-[13px] text-slate-400" />
              </div>
              <div>
                <p className="text-[10px] text-slate-400 font-medium">{label}</p>
                <p className={`text-sm font-semibold ${value === '—' ? 'text-slate-300' : 'text-slate-800'}`}>{value}</p>
              </div>
            </div>
          ))}
        </div>

        {/* Appointment Details */}
        <div className="bg-slate-50 rounded-2xl p-4 space-y-3">
          <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Appointment Details</p>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <p className="text-[11px] text-slate-400 flex items-center gap-1 mb-0.5"><MdCalendarToday className="text-[11px]" /> Date</p>
              <p className="text-sm font-semibold text-slate-800">{formatDate(appt.appointment_date || appt.date)}</p>
            </div>
            <div>
              <p className="text-[11px] text-slate-400 flex items-center gap-1 mb-0.5"><MdAccessTime className="text-[11px]" /> Time</p>
              <p className="text-sm font-semibold text-slate-800">{appt.appointment_time || appt.time || '—'}</p>
            </div>
          </div>
          <div>
            <p className="text-[11px] text-slate-400 mb-0.5">Doctor</p>
            <p className="text-sm font-semibold text-slate-800">{appt.doctor || '—'}</p>
            {appt.specialty && <p className="text-xs text-slate-400">{appt.specialty}</p>}
          </div>
          <div>
            <p className="text-[11px] text-slate-400 mb-0.5">Clinic</p>
            <p className="text-sm font-semibold text-slate-800 capitalize">
              {appt.type === 'derma' ? 'Dermatology' : 'General Medicine'}
            </p>
          </div>
          {appt.reason && (
            <div>
              <p className="text-[11px] text-slate-400 flex items-center gap-1 mb-0.5"><MdNotes className="text-[11px]" /> Reason</p>
              <p className="text-sm font-semibold text-slate-800">{appt.reason}</p>
            </div>
          )}
        </div>
      </div>

      {isActive && (
        <div className="px-6 pb-6 pt-4 border-t border-slate-100 shrink-0 space-y-2">
          {appt.status === 'pending' && (
            <button onClick={() => onConfirm(appt.id)}
              className="w-full flex items-center justify-center gap-2 py-2.5 text-xs font-bold text-white bg-emerald-500 hover:bg-emerald-600 rounded-xl transition-colors">
              <MdCheck className="text-[14px]" /> Confirm Appointment
            </button>
          )}
          <button onClick={() => onReschedule(appt)}
            className="w-full flex items-center justify-center gap-2 py-2.5 text-xs font-bold text-slate-600 border border-slate-200 hover:bg-slate-50 rounded-xl transition-colors">
            <MdRefresh className="text-[14px]" /> Reschedule
          </button>
          <button onClick={() => onCancel(appt.id)}
            className="w-full flex items-center justify-center gap-2 py-2.5 text-xs font-bold text-red-500 border border-red-200 bg-red-50 hover:bg-red-100 rounded-xl transition-colors">
            <MdCancel className="text-[14px]" /> Cancel Appointment
          </button>
        </div>
      )}
    </div>
  )
}

// ── Row ───────────────────────────────────────────────────────────────────────
const AppointmentRow = ({ appt, isSelected, onSelect }) => {
  const cfg  = STATUS_CONFIG[appt.status] || STATUS_CONFIG.pending
  const Icon = appt.type === 'derma' ? MdFace : MdMedicalServices
  return (
    <button onClick={() => onSelect(appt)}
      className={`w-full flex items-center gap-4 px-5 py-4 border-l-[3px] text-left transition-all duration-150
        ${isSelected ? `${cfg.row} bg-slate-50` : 'border-l-transparent hover:bg-slate-50/70'}`}>
      <div className={`w-9 h-9 rounded-xl flex items-center justify-center shrink-0 ${appt.type === 'derma' ? 'bg-emerald-50' : 'bg-slate-100'}`}>
        <Icon className={`text-[16px] ${appt.type === 'derma' ? 'text-emerald-600' : 'text-slate-500'}`} />
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 mb-0.5 flex-wrap">
          <p className="text-sm font-bold text-slate-800 truncate">{appt.patient_name || appt.patient}</p>
          <span className={`text-[10px] font-bold border px-2 py-0.5 rounded-full whitespace-nowrap ${cfg.badge}`}>{cfg.label}</span>
        </div>
        <p className="text-xs text-slate-500 truncate">{appt.doctor} · {appt.reason || 'No reason'}</p>
        <div className="flex items-center gap-3 mt-1.5 text-[11px] text-slate-400 font-medium">
          <span className="flex items-center gap-1"><MdCalendarToday className="text-[11px]" /> {formatDate(appt.appointment_date || appt.date)}</span>
          <span className="flex items-center gap-1"><MdAccessTime className="text-[11px]" /> {appt.appointment_time || appt.time}</span>
        </div>
      </div>
      <MdChevronRight className={`text-[16px] shrink-0 ${isSelected ? 'text-slate-500' : 'text-slate-300'}`} />
    </button>
  )
}

// ── Main ──────────────────────────────────────────────────────────────────────
const Staff_Appointments = () => {
  const [data,        setData]        = useState([])
  const [loading,     setLoading]     = useState(true)
  const [activeTab,   setActiveTab]   = useState('all')
  const [search,      setSearch]      = useState('')
  const [selected,    setSelected]    = useState(null)
  const [reschedAppt, setReschedAppt] = useState(null)
  const [showAdd,     setShowAdd]     = useState(false)

  useEffect(() => {
    getAppointments()
      .then(rows => {
        const arr = Array.isArray(rows) ? rows : []
        setData(arr)
        if (arr.length > 0) setSelected(arr[0])
      })
      .catch(err => console.error('Fetch error:', err))
      .finally(() => setLoading(false))
  }, [])

  const handleConfirm = async (id) => {
    try {
      await confirmAppointment(id)
      setData(prev => prev.map(a => a.id === id ? { ...a, status: 'confirmed' } : a))
      setSelected(s => s?.id === id ? { ...s, status: 'confirmed' } : s)
    } catch { alert('Failed to confirm.') }
  }

  const handleCancel = async (id) => {
    if (!confirm('Cancel this appointment?')) return
    try {
      await cancelAppointment(id)
      setData(prev => prev.map(a => a.id === id ? { ...a, status: 'cancelled' } : a))
      setSelected(s => s?.id === id ? { ...s, status: 'cancelled' } : s)
    } catch { alert('Failed to cancel.') }
  }

  const handleRescheduleSave = (id, date, time, reason) => {
    setData(prev => prev.map(a => a.id === id
      ? { ...a, appointment_date: date, appointment_time: time, date, time, reason: reason || a.reason, status: 'rescheduled' }
      : a
    ))
    setSelected(s => s?.id === id
      ? { ...s, appointment_date: date, appointment_time: time, date, time, reason: reason || s.reason, status: 'rescheduled' }
      : s
    )
  }

  const handleAdd = (appt) => { setData(prev => [appt, ...prev]); setSelected(appt) }

  const counts = TABS.reduce((acc, t) => {
    acc[t.key] = t.key === 'all' ? data.length : data.filter(a => a.status === t.key).length
    return acc
  }, {})

  const filtered = data.filter(a => {
    const matchTab    = activeTab === 'all' || a.status === activeTab
    const name        = (a.patient_name || a.patient || '').toLowerCase()
    const doc         = (a.doctor || '').toLowerCase()
    const matchSearch = !search || name.includes(search.toLowerCase()) ||
      doc.includes(search.toLowerCase()) || String(a.id).includes(search)
    return matchTab && matchSearch
  })

  if (loading) return (
    <div className="h-96 flex items-center justify-center">
      <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-[#0b1a2c]" />
    </div>
  )

  return (
    <div className="max-w-5xl space-y-5">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-800">Appointments</h1>
          <p className="text-sm text-slate-500 mt-0.5">Confirm, reschedule, or cancel patient appointments.</p>
        </div>
        <button onClick={() => setShowAdd(true)}
          className="flex items-center gap-1.5 bg-[#0b1a2c] hover:bg-[#122236] text-white text-xs font-semibold px-4 py-2.5 rounded-xl transition-colors shrink-0">
          <MdAdd className="text-[15px]" /> New Appointment
        </button>
      </div>

      <div className="bg-white border border-slate-200 rounded-2xl overflow-hidden flex shadow-sm" style={{ minHeight: '600px' }}>
        <div className="flex flex-col border-r border-slate-100 w-full lg:w-[440px] shrink-0">
          <div className="px-4 pt-4 pb-3 border-b border-slate-100 space-y-3">
            <div className="flex items-center gap-2 bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 focus-within:border-slate-300 transition-colors">
              <MdSearch className="text-slate-400 text-[15px] shrink-0" />
              <input type="text" value={search} onChange={e => setSearch(e.target.value)}
                placeholder="Search patient, doctor, ID…"
                className="text-sm text-slate-700 placeholder-slate-300 bg-transparent outline-none w-full" />
              {search && <button onClick={() => setSearch('')} className="text-slate-300 hover:text-slate-500"><MdClose className="text-[13px]" /></button>}
            </div>
            <div className="flex gap-0.5 overflow-x-auto pb-0.5">
              {TABS.map(({ key, label }) => (
                <button key={key} onClick={() => setActiveTab(key)}
                  className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[11px] font-bold whitespace-nowrap transition-all duration-150
                    ${activeTab === key ? 'bg-[#0b1a2c] text-sky-400' : 'text-slate-500 hover:bg-slate-100 hover:text-slate-700'}`}>
                  {label}
                  <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded-full
                    ${activeTab === key ? 'bg-white/10 text-sky-300' : 'bg-slate-100 text-slate-400'}`}>
                    {counts[key]}
                  </span>
                </button>
              ))}
            </div>
          </div>
          <div className="flex-1 overflow-y-auto divide-y divide-slate-100">
            {filtered.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-16 text-center px-6">
                <MdEventAvailable className="text-[22px] text-slate-300 mb-3" />
                <p className="text-sm font-semibold text-slate-500">No appointments found</p>
              </div>
            ) : filtered.map(appt => (
              <AppointmentRow key={appt.id} appt={appt} isSelected={selected?.id === appt.id} onSelect={setSelected} />
            ))}
          </div>
          <div className="px-5 py-3 border-t border-slate-100 bg-slate-50/50">
            <p className="text-[11px] text-slate-400 font-medium">Showing {filtered.length} of {data.length}</p>
          </div>
        </div>

        <div className="hidden lg:flex flex-col flex-1 min-w-0">
          {selected ? (
            <DetailPanel appt={selected} onClose={() => setSelected(null)}
              onConfirm={handleConfirm} onCancel={handleCancel} onReschedule={setReschedAppt} />
          ) : (
            <div className="flex flex-col items-center justify-center flex-1 text-center px-8">
              <MdEventAvailable className="text-[24px] text-slate-300 mb-3" />
              <p className="text-sm font-semibold text-slate-500">Select an appointment to view details</p>
            </div>
          )}
        </div>
      </div>

      {reschedAppt && <RescheduleModal appt={reschedAppt} onClose={() => setReschedAppt(null)} onSave={handleRescheduleSave} />}
      {showAdd && <AddAppointmentModal onClose={() => setShowAdd(false)} onAdd={handleAdd} />}
    </div>
  )
}

export default Staff_Appointments