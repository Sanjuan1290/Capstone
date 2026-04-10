// client/src/pages/staffPage/Staff_PatientRecord.jsx
// FIXED: API returns { patient: { full_name, civil_status, ... }, history: [...] }
// Correctly maps all fields and computes age, totalVisits, lastVisit, upcoming

import { useEffect, useState } from 'react'
import { getPatients, getPatientRecord } from '../../services/staff.service'
import {
  MdSearch, MdClose, MdChevronRight, MdPerson,
  MdCalendarToday, MdPhone, MdHome, MdFace,
  MdMedicalServices, MdAccessTime, MdArrowBack,
  MdHistory, MdEventAvailable, MdEmail, MdWc, MdPeople,
} from 'react-icons/md'

const STATUS_CONFIG = {
  confirmed:    { label: 'Confirmed',   badge: 'bg-emerald-50 text-emerald-700 border-emerald-200' },
  pending:      { label: 'Pending',     badge: 'bg-amber-50   text-amber-700   border-amber-200'   },
  cancelled:    { label: 'Cancelled',   badge: 'bg-red-50     text-red-500     border-red-200'     },
  completed:    { label: 'Completed',   badge: 'bg-slate-100  text-slate-500   border-slate-200'   },
  'in-progress':{ label: 'In Progress', badge: 'bg-sky-50     text-sky-700     border-sky-200'     },
  rescheduled:  { label: 'Rescheduled', badge: 'bg-violet-50  text-violet-700  border-violet-200'  },
}

// ── Helpers ───────────────────────────────────────────────────────────────────
function calcAge(birthdateStr) {
  if (!birthdateStr) return null
  const birth = new Date(birthdateStr)
  const today = new Date()
  let age = today.getFullYear() - birth.getFullYear()
  const m = today.getMonth() - birth.getMonth()
  if (m < 0 || (m === 0 && today.getDate() < birth.getDate())) age--
  return age
}

// Transform raw API response { patient, history } into component-ready record
function buildRecord(raw) {
  if (!raw) return null
  // Handle both { patient, history } shape AND flat patient shape
  const p = raw.patient || raw
  const allAppts = Array.isArray(raw.history) ? raw.history : []
  const past     = allAppts.filter(a => ['completed', 'cancelled'].includes(a.status))
  const upcoming = allAppts.filter(a => ['pending', 'confirmed', 'rescheduled', 'in-progress'].includes(a.status))

  return {
    id:          p.id,
    name:        p.full_name || p.name || '—',
    email:       p.email     || '',
    phone:       p.phone     || '',
    sex:         p.sex       || '',
    birthdate:   p.birthdate || '',
    address:     p.address   || '',
    civilStatus: p.civil_status || p.civilStatus || '',
    age:         calcAge(p.birthdate),
    totalVisits: past.filter(a => a.status === 'completed').length,
    lastVisit:   past[0]?.date || null,
    history:     past,
    upcoming:    upcoming,
  }
}

// ── Initials Avatar ───────────────────────────────────────────────────────────
const Avatar = ({ name, size = 'md' }) => {
  const initials = (name || '').split(' ').filter(Boolean).map(n => n[0]).join('').slice(0, 2).toUpperCase()
  const cls = size === 'lg' ? 'w-14 h-14 text-lg rounded-2xl' : 'w-10 h-10 text-sm rounded-xl'
  return (
    <div className={`${cls} bg-gradient-to-br from-[#0b1a2c] to-[#122236] flex items-center justify-center text-sky-400 font-black shrink-0`}>
      {initials || <MdPerson className="text-[18px]" />}
    </div>
  )
}

// ── Detail Panel ──────────────────────────────────────────────────────────────
const DetailPanel = ({ record, onClose }) => {
  const [tab, setTab] = useState('info')
  if (!record) return null

  return (
    <>
      <div className="fixed inset-0 z-40 bg-black/40 backdrop-blur-sm lg:hidden" onClick={onClose} />
      <div className="fixed bottom-0 left-0 right-0 z-50 bg-white rounded-t-3xl shadow-2xl
        flex flex-col max-h-[92vh] overflow-hidden
        lg:static lg:rounded-none lg:shadow-none lg:h-full lg:max-h-full lg:flex">

        <div className="lg:hidden flex justify-center pt-3 pb-1">
          <div className="w-10 h-1 bg-slate-200 rounded-full" />
        </div>

        {/* Header */}
        <div className="flex items-center gap-3 px-5 py-4 border-b border-slate-100 shrink-0">
          <button onClick={onClose} className="w-8 h-8 flex items-center justify-center rounded-xl hover:bg-slate-100 text-slate-400 lg:hidden">
            <MdArrowBack className="text-[18px]" />
          </button>
          <Avatar name={record.name} size="lg" />
          <div className="flex-1 min-w-0">
            <p className="text-sm font-bold text-slate-800 truncate">{record.name}</p>
            <p className="text-xs text-slate-400 font-mono">#{record.id}</p>
          </div>
          <div className="text-right shrink-0">
            {record.age !== null && (
              <p className="text-xs font-semibold text-slate-600">{record.age} yrs · {record.sex}</p>
            )}
            <p className="text-[11px] text-slate-400">{record.totalVisits} completed visits</p>
          </div>
          <button onClick={onClose} className="hidden lg:flex w-8 h-8 items-center justify-center rounded-xl hover:bg-slate-100 text-slate-400">
            <MdClose className="text-[18px]" />
          </button>
        </div>

        {/* Tabs */}
        <div className="flex gap-1 px-5 pt-3 pb-0 shrink-0">
          {[
            { key: 'info',     label: 'Profile',  Icon: MdPerson        },
            { key: 'history',  label: 'History',  Icon: MdHistory       },
            { key: 'upcoming', label: 'Upcoming', Icon: MdEventAvailable },
          ].map(({ key, label, Icon }) => (
            <button key={key} onClick={() => setTab(key)}
              className={`flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-bold transition-all
                ${tab === key ? 'bg-[#0b1a2c] text-sky-400 shadow-sm' : 'text-slate-500 hover:bg-slate-100'}`}>
              <Icon className="text-[13px]" /> {label}
              {key === 'upcoming' && record.upcoming.length > 0 && (
                <span className={`text-[9px] font-black px-1.5 py-0.5 rounded-full ml-0.5
                  ${tab === 'upcoming' ? 'bg-white/20 text-sky-300' : 'bg-amber-100 text-amber-600'}`}>
                  {record.upcoming.length}
                </span>
              )}
            </button>
          ))}
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto px-5 py-4 space-y-4">

          {tab === 'info' && (
            <>
              <div className="bg-slate-50 rounded-2xl p-4 space-y-3">
                <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Personal Information</p>
                {[
                  { Icon: MdCalendarToday, label: 'Birthdate',   value: record.birthdate   },
                  { Icon: MdWc,            label: 'Sex',          value: record.sex         },
                  { Icon: MdPerson,        label: 'Civil Status', value: record.civilStatus },
                  { Icon: MdPhone,         label: 'Phone',        value: record.phone       },
                  { Icon: MdEmail,         label: 'Email',        value: record.email       },
                  { Icon: MdHome,          label: 'Address',      value: record.address     },
                ].map(({ Icon, label, value }) => (
                  <div key={label} className="flex items-start gap-3">
                    <div className="w-7 h-7 rounded-lg bg-white border border-slate-200 flex items-center justify-center shrink-0 mt-0.5">
                      <Icon className="text-[12px] text-slate-400" />
                    </div>
                    <div>
                      <p className="text-[10px] text-slate-400 font-medium">{label}</p>
                      <p className={`text-sm font-semibold ${value ? 'text-slate-800' : 'text-slate-300'}`}>
                        {value || '—'}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="bg-sky-50 border border-sky-200 rounded-2xl p-4 text-center">
                  <p className="text-3xl font-black text-sky-600">{record.totalVisits}</p>
                  <p className="text-[11px] text-sky-500 font-medium mt-0.5">Total Visits</p>
                </div>
                <div className="bg-white border border-slate-200 rounded-2xl p-4 text-center">
                  <p className="text-sm font-black text-slate-800 leading-tight">{record.lastVisit || '—'}</p>
                  <p className="text-[11px] text-slate-400 font-medium mt-1">Last Visit</p>
                </div>
              </div>
            </>
          )}

          {tab === 'history' && (
            <div className="space-y-3">
              {record.history.length === 0 ? (
                <div className="flex flex-col items-center py-12 text-center">
                  <MdHistory className="text-slate-200 text-[32px] mb-2" />
                  <p className="text-sm font-semibold text-slate-500">No completed visits yet</p>
                </div>
              ) : record.history.map(h => {
                const HIcon = h.type === 'derma' ? MdFace : MdMedicalServices
                return (
                  <div key={h.id} className="bg-slate-50 rounded-2xl p-4 border border-slate-100">
                    <div className="flex items-center gap-3 mb-2">
                      <div className={`w-8 h-8 rounded-xl flex items-center justify-center shrink-0
                        ${h.type === 'derma' ? 'bg-emerald-50' : 'bg-slate-100'}`}>
                        <HIcon className={`text-[15px] ${h.type === 'derma' ? 'text-emerald-600' : 'text-slate-500'}`} />
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-bold text-slate-800 truncate">{h.reason || '—'}</p>
                        <p className="text-xs text-slate-500 truncate">{h.doctor_name || h.doctor}</p>
                      </div>
                    </div>
                    <div className="flex items-center gap-3 text-[11px] text-slate-400 font-medium flex-wrap">
                      <span className="flex items-center gap-1"><MdCalendarToday className="text-[11px]" /> {h.date}</span>
                      <span className="flex items-center gap-1"><MdAccessTime className="text-[11px]" /> {h.time || h.appointment_time}</span>
                    </div>
                    {h.diagnosis && (
                      <div className="border-t border-slate-200 pt-2 mt-2">
                        <p className="text-[10px] text-slate-400 font-medium mb-0.5">Diagnosis</p>
                        <p className="text-xs font-semibold text-slate-700 leading-relaxed">{h.diagnosis}</p>
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
          )}

          {tab === 'upcoming' && (
            <div className="space-y-3">
              {record.upcoming.length === 0 ? (
                <div className="flex flex-col items-center py-12 text-center">
                  <MdEventAvailable className="text-slate-200 text-[32px] mb-2" />
                  <p className="text-sm font-semibold text-slate-500">No upcoming appointments</p>
                </div>
              ) : record.upcoming.map(u => {
                const cfg  = STATUS_CONFIG[u.status] || STATUS_CONFIG.pending
                const UIcon = u.type === 'derma' ? MdFace : MdMedicalServices
                return (
                  <div key={u.id} className="bg-slate-50 rounded-2xl p-4 border border-slate-100">
                    <div className="flex items-center gap-3 mb-2">
                      <div className={`w-8 h-8 rounded-xl flex items-center justify-center shrink-0
                        ${u.type === 'derma' ? 'bg-emerald-50' : 'bg-slate-100'}`}>
                        <UIcon className={`text-[15px] ${u.type === 'derma' ? 'text-emerald-600' : 'text-slate-500'}`} />
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-bold text-slate-800 truncate">{u.reason || '—'}</p>
                        <p className="text-xs text-slate-500 truncate">{u.doctor_name || u.doctor}</p>
                      </div>
                      <span className={`text-[10px] font-bold border px-2 py-0.5 rounded-full shrink-0 ${cfg.badge}`}>
                        {cfg.label}
                      </span>
                    </div>
                    <div className="flex items-center gap-3 text-[11px] text-slate-400 font-medium">
                      <span className="flex items-center gap-1"><MdCalendarToday className="text-[11px]" /> {u.date}</span>
                      <span className="flex items-center gap-1"><MdAccessTime className="text-[11px]" /> {u.time || u.appointment_time}</span>
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </div>
      </div>
    </>
  )
}

// ── Patient Row ───────────────────────────────────────────────────────────────
const PatientRow = ({ patient, isSelected, onSelect }) => {
  const age = calcAge(patient.birthdate)
  const displayName = patient.name || patient.full_name || '—'
  return (
    <button onClick={() => onSelect(patient.id)}
      className={`w-full flex items-center gap-3 px-4 py-3.5 border-l-[3px] text-left transition-all
        ${isSelected ? 'border-l-sky-400 bg-sky-50/50' : 'border-l-transparent hover:bg-slate-50/70'}`}>
      <Avatar name={displayName} />
      <div className="flex-1 min-w-0">
        <p className="text-sm font-bold text-slate-800 truncate">{displayName}</p>
        <p className="text-xs text-slate-500 mt-0.5 truncate">
          {[age !== null ? `${age} yrs` : null, patient.sex, patient.phone].filter(Boolean).join(' · ')}
        </p>
        <p className="text-[11px] text-slate-400 mt-0.5 truncate">{patient.email}</p>
      </div>
      <MdChevronRight className={`text-[16px] shrink-0 ${isSelected ? 'text-slate-500' : 'text-slate-300'}`} />
    </button>
  )
}

// ── Main ──────────────────────────────────────────────────────────────────────
const Staff_PatientRecord = () => {
  const [patients,       setPatients]       = useState([])
  const [selectedRecord, setSelectedRecord] = useState(null)
  const [search,         setSearch]         = useState('')
  const [listLoading,    setListLoading]    = useState(false)
  const [detailLoading,  setDetailLoading]  = useState(false)

  useEffect(() => {
    const t = setTimeout(() => {
      setListLoading(true)
      getPatients(search)
        .then(data => setPatients(Array.isArray(data) ? data : []))
        .catch(err => console.error('Search error:', err))
        .finally(() => setListLoading(false))
    }, 300)
    return () => clearTimeout(t)
  }, [search])

  const handleSelectPatient = async (id) => {
    setDetailLoading(true)
    try {
      const raw = await getPatientRecord(id)  // returns { patient: {...}, history: [...] }
      setSelectedRecord(buildRecord(raw))
    } catch (err) {
      console.error('Error fetching record:', err)
    } finally {
      setDetailLoading(false)
    }
  }

  return (
    <div className="max-w-5xl space-y-5">
      <div>
        <h1 className="text-xl lg:text-2xl font-bold text-slate-800 flex items-center gap-2">
          <MdPeople className="text-sky-500 text-[22px]" /> Patient Records
        </h1>
        <p className="text-xs lg:text-sm text-slate-500 mt-0.5">Search and view patient profiles, history, and appointments.</p>
      </div>

      {/* Search */}
      <div className="relative">
        <MdSearch className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400 text-[18px]" />
        {listLoading && (
          <div className="absolute right-4 top-1/2 -translate-y-1/2">
            <div className="w-4 h-4 border-2 border-slate-200 border-t-sky-500 rounded-full animate-spin" />
          </div>
        )}
        <input type="text" value={search} onChange={e => setSearch(e.target.value)}
          placeholder="Search by name or email…"
          className="w-full pl-12 pr-12 py-3.5 bg-white border border-slate-200 rounded-2xl text-sm
            focus:outline-none focus:border-sky-400 focus:ring-2 focus:ring-sky-400/10 transition-all" />
        {search && !listLoading && (
          <button onClick={() => setSearch('')} className="absolute right-4 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600">
            <MdClose className="text-[16px]" />
          </button>
        )}
      </div>

      {/* Split layout */}
      <div className="bg-white border border-slate-200 rounded-2xl overflow-hidden shadow-sm flex" style={{ minHeight: '560px' }}>
        {/* List */}
        <div className={`flex flex-col border-r border-slate-100 shrink-0
          ${selectedRecord ? 'w-full lg:w-[380px] hidden lg:flex' : 'w-full lg:w-[380px] flex'}`}>
          <div className="px-4 py-3 border-b border-slate-100 bg-slate-50/50">
            <p className="text-[11px] font-bold text-slate-400 uppercase tracking-widest">
              {patients.length} result{patients.length !== 1 ? 's' : ''}
            </p>
          </div>
          <div className="flex-1 overflow-y-auto divide-y divide-slate-100">
            {patients.length === 0 && !listLoading ? (
              <div className="flex flex-col items-center py-16 text-center px-6">
                <MdPerson className="text-slate-200 text-[36px] mb-3" />
                <p className="text-sm font-semibold text-slate-500">No patients found</p>
                <p className="text-xs text-slate-400 mt-1">{search ? `No results for "${search}"` : 'Type a name to search.'}</p>
              </div>
            ) : (
              patients.map(p => (
                <PatientRow key={p.id} patient={p} isSelected={selectedRecord?.id === p.id} onSelect={handleSelectPatient} />
              ))
            )}
          </div>
        </div>

        {/* Desktop detail */}
        <div className="hidden lg:flex flex-col flex-1 min-w-0">
          {detailLoading ? (
            <div className="flex items-center justify-center flex-1">
              <div className="w-8 h-8 border-4 border-slate-200 border-t-sky-500 rounded-full animate-spin" />
            </div>
          ) : selectedRecord ? (
            <DetailPanel record={selectedRecord} onClose={() => setSelectedRecord(null)} />
          ) : (
            <div className="flex flex-col items-center justify-center flex-1 text-center px-8">
              <div className="w-16 h-16 rounded-2xl bg-slate-50 border border-slate-100 flex items-center justify-center mb-4">
                <MdPerson className="text-[28px] text-slate-300" />
              </div>
              <p className="text-sm font-bold text-slate-500">Select a patient</p>
              <p className="text-xs text-slate-400 mt-1 max-w-[220px] leading-relaxed">
                Click any patient on the left to view their profile and visit history.
              </p>
            </div>
          )}
        </div>
      </div>

      {/* Mobile detail drawer */}
      {selectedRecord && !detailLoading && (
        <div className="lg:hidden">
          <DetailPanel record={selectedRecord} onClose={() => setSelectedRecord(null)} />
        </div>
      )}
    </div>
  )
}

export default Staff_PatientRecord