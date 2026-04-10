// client/src/pages/adminPage/Admin_DoctorAccount.jsx
// REDESIGNED: Split list+detail, amber theme, doctor add modal with specialty

import { useEffect, useState } from 'react'
import { getDoctors, createDoctor, toggleDoctor } from '../../services/admin.service'
import {
  MdSearch, MdClose, MdAdd, MdPerson, MdEmail, MdPhone,
  MdChevronRight, MdBlock, MdCheck, MdArrowBack,
  MdMedicalServices, MdFace, MdScience, MdMailOutline, MdCalendarToday,
} from 'react-icons/md'

const SPECIALTIES = ['Dermatologist','General Practitioner','Cosmetic Dermatology','Internal Medicine','Pediatrician','OB-GYN']

// ── Add Modal ──────────────────────────────────────────────────────────────────
const AddModal = ({ onClose, onAdd }) => {
  const [form,    setForm]    = useState({ full_name: '', specialty: 'Dermatologist', type: 'derma', email: '', phone: '', prc_license: '' })
  const [sub,     setSub]     = useState(false)
  const [error,   setError]   = useState('')
  const valid = form.full_name.trim() && form.email.trim() && form.prc_license.trim()
  const set   = k => e => setForm(f => ({ ...f, [k]: e.target.value }))

  const handleSubmit = async () => {
    setSub(true); setError('')
    try { await onAdd(form); onClose() }
    catch (err) { setError(err.message || 'Failed to create.') }
    finally { setSub(false) }
  }

  return (
    <>
      <div className="fixed inset-0 z-40 bg-black/50 backdrop-blur-sm" onClick={onClose} />
      <div className="fixed bottom-0 left-0 right-0 z-50 bg-white rounded-t-3xl shadow-2xl flex flex-col max-h-[90vh]
        sm:static sm:fixed sm:inset-auto sm:top-1/2 sm:left-1/2 sm:-translate-x-1/2 sm:-translate-y-1/2
        sm:w-full sm:max-w-sm sm:rounded-3xl sm:shadow-2xl">
        <div className="sm:hidden flex justify-center pt-3 pb-1"><div className="w-10 h-1 bg-slate-200 rounded-full" /></div>
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100 shrink-0">
          <div>
            <p className="text-sm font-bold text-slate-800">Add Doctor Account</p>
            <p className="text-xs text-slate-500 mt-0.5">PRC license required</p>
          </div>
          <button onClick={onClose} className="w-8 h-8 flex items-center justify-center rounded-xl hover:bg-slate-100 text-slate-400">
            <MdClose />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-6 py-5 space-y-4">
          <div className="flex items-start gap-2.5 bg-sky-50 border border-sky-200 rounded-xl px-4 py-3">
            <MdMailOutline className="text-sky-500 text-[16px] shrink-0 mt-0.5" />
            <p className="text-xs text-sky-700">A temporary password will be generated and emailed to the doctor.</p>
          </div>

          {[
            { k: 'full_name',   l: 'Full Name (with title)', t: 'text',  p: 'e.g. Dr. Juan Santos', req: true  },
            { k: 'email',       l: 'Email',                  t: 'email', p: 'e.g. juan@carait.com', req: true  },
            { k: 'phone',       l: 'Phone (optional)',        t: 'tel',   p: '09171234567',           req: false },
            { k: 'prc_license', l: 'PRC License No.',        t: 'text',  p: 'e.g. PRC-001234',       req: true  },
          ].map(({ k, l, t, p, req }) => (
            <div key={k}>
              <label className="text-[11px] font-bold text-slate-500 uppercase tracking-widest mb-1.5 block">
                {l} {req && <span className="text-red-400">*</span>}
              </label>
              <input type={t} value={form[k]} onChange={set(k)} placeholder={p}
                className="w-full text-sm bg-slate-50 border-2 border-slate-200 rounded-xl px-3 py-2.5
                  focus:outline-none focus:border-amber-400 transition-colors" />
            </div>
          ))}

          <div>
            <label className="text-[11px] font-bold text-slate-500 uppercase tracking-widest mb-1.5 block">Specialty</label>
            <select value={form.specialty} onChange={set('specialty')}
              className="w-full text-sm bg-slate-50 border-2 border-slate-200 rounded-xl px-3 py-2.5 focus:outline-none focus:border-amber-400">
              {SPECIALTIES.map(s => <option key={s}>{s}</option>)}
            </select>
          </div>

          <div>
            <label className="text-[11px] font-bold text-slate-500 uppercase tracking-widest mb-1.5 block">Clinic Type</label>
            <div className="grid grid-cols-2 gap-2">
              {[{ v: 'derma', l: 'Dermatology' }, { v: 'medical', l: 'General Medicine' }].map(({ v, l }) => (
                <button key={v} onClick={() => setForm(f => ({ ...f, type: v }))}
                  className={`py-2.5 rounded-xl text-xs font-bold border-2 transition-all
                    ${form.type === v ? 'border-amber-400 bg-amber-50 text-amber-700' : 'border-slate-200 text-slate-600 hover:border-slate-300'}`}>
                  {l}
                </button>
              ))}
            </div>
          </div>

          {error && <div className="text-xs text-red-600 bg-red-50 border border-red-200 rounded-xl px-4 py-3">{error}</div>}
        </div>

        <div className="px-6 pb-6 pt-3 flex gap-3 shrink-0 border-t border-slate-100">
          <button onClick={onClose} className="flex-1 py-3 text-sm font-semibold text-slate-600 border border-slate-200 rounded-2xl hover:bg-slate-50">Cancel</button>
          <button disabled={!valid || sub} onClick={handleSubmit}
            className="flex-1 py-3 text-sm font-bold text-white bg-amber-500 hover:bg-amber-600 disabled:opacity-40 rounded-2xl transition-colors">
            {sub ? 'Creating…' : 'Create & Send Email'}
          </button>
        </div>
      </div>
    </>
  )
}

// ── Detail Panel ──────────────────────────────────────────────────────────────
const DetailPanel = ({ doctor, onClose, onToggle }) => {
  if (!doctor) return null
  const isDerma  = (doctor.type === 'derma') || (doctor.specialty || '').toLowerCase().includes('derm')
  const Icon     = isDerma ? MdFace : MdMedicalServices
  const isActive = doctor.is_active === 1
  const joined   = doctor.created_at ? new Date(doctor.created_at).toLocaleDateString('en-PH', { month: 'short', day: 'numeric', year: 'numeric' }) : 'N/A'

  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center gap-3 px-6 py-5 border-b border-slate-100 shrink-0">
        <button onClick={onClose} className="w-8 h-8 flex items-center justify-center rounded-xl hover:bg-slate-100 text-slate-400 lg:hidden">
          <MdArrowBack className="text-[18px]" />
        </button>
        <div className={`w-12 h-12 rounded-2xl flex items-center justify-center shrink-0 ${isDerma ? 'bg-emerald-50' : 'bg-slate-100'}`}>
          <Icon className={`text-[22px] ${isDerma ? 'text-emerald-600' : 'text-slate-500'}`} />
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-bold text-slate-800 truncate">{doctor.full_name}</p>
          <p className="text-xs text-slate-500">{doctor.specialty} · <span className="font-mono">#{doctor.id}</span></p>
        </div>
        <span className={`text-[11px] font-bold border px-2.5 py-0.5 rounded-full shrink-0
          ${isActive ? 'bg-emerald-50 text-emerald-700 border-emerald-200' : 'bg-slate-100 text-slate-500 border-slate-200'}`}>
          {isActive ? 'Active' : 'Inactive'}
        </span>
      </div>

      <div className="flex-1 overflow-y-auto px-6 py-5 space-y-4">
        <div className="bg-slate-50 rounded-2xl p-4 space-y-3">
          <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Account Info</p>
          {[
            { icon: MdEmail,        label: 'Email',       value: doctor.email                 },
            { icon: MdPhone,        label: 'Phone',        value: doctor.phone || 'N/A'        },
            { icon: MdScience,      label: 'PRC License',  value: doctor.prc_license || 'N/A' },
            { icon: MdCalendarToday,label: 'Joined',       value: joined                       },
          ].map(({ icon: I, label, value }) => (
            <div key={label} className="flex items-center gap-3">
              <div className="w-7 h-7 rounded-lg bg-white border border-slate-200 flex items-center justify-center shrink-0">
                <I className="text-[13px] text-slate-400" />
              </div>
              <div>
                <p className="text-[10px] text-slate-400 font-medium">{label}</p>
                <p className="text-sm font-semibold text-slate-800">{value}</p>
              </div>
            </div>
          ))}
        </div>
      </div>

      <div className="px-6 pb-6 pt-4 border-t border-slate-100 shrink-0">
        <button onClick={() => onToggle(doctor.id)}
          className={`w-full flex items-center justify-center gap-2 py-3 text-xs font-bold rounded-xl transition-colors
            ${isActive
              ? 'text-red-500 bg-red-50 border border-red-200 hover:bg-red-100'
              : 'text-emerald-600 bg-emerald-50 border border-emerald-200 hover:bg-emerald-100'}`}>
          {isActive ? <><MdBlock className="text-[14px]" /> Deactivate</> : <><MdCheck className="text-[14px]" /> Activate</>}
        </button>
      </div>
    </div>
  )
}

// ── Main ──────────────────────────────────────────────────────────────────────
const Admin_DoctorAccount = () => {
  const [doctors,  setDoctors]  = useState([])
  const [loading,  setLoading]  = useState(true)
  const [search,   setSearch]   = useState('')
  const [selected, setSelected] = useState(null)
  const [showAdd,  setShowAdd]  = useState(false)

  useEffect(() => {
    getDoctors()
      .then(data => { const arr = Array.isArray(data) ? data : []; setDoctors(arr); if (arr.length > 0) setSelected(arr[0]) })
      .catch(err => console.error('Error loading doctors:', err))
      .finally(() => setLoading(false))
  }, [])

  const handleToggle = async id => {
    try {
      const res = await toggleDoctor(id)
      setDoctors(prev => prev.map(d => d.id === id ? { ...d, is_active: res.is_active } : d))
      setSelected(prev => prev?.id === id ? { ...prev, is_active: res.is_active } : prev)
    } catch { alert('Failed to update status.') }
  }

  const handleAdd = async formData => {
    const newDoc = await createDoctor(formData)
    setDoctors(prev => [...prev, newDoc])
    if (!selected) setSelected(newDoc)
  }

  const filtered = doctors.filter(d =>
    !search ||
    (d.full_name || '').toLowerCase().includes(search.toLowerCase()) ||
    (d.specialty || '').toLowerCase().includes(search.toLowerCase())
  )

  return (
    <div className="max-w-5xl space-y-5">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-xl lg:text-2xl font-bold text-slate-800 flex items-center gap-2">
            <MdMedicalServices className="text-amber-500 text-[22px]" /> Doctor Accounts
          </h1>
          <p className="text-xs lg:text-sm text-slate-500 mt-0.5">Manage doctor profiles and clinic access.</p>
        </div>
        <button onClick={() => setShowAdd(true)}
          className="flex items-center gap-1.5 bg-amber-500 hover:bg-amber-600 text-white text-xs font-bold
            px-4 py-2.5 rounded-xl transition-colors shadow-lg shadow-amber-500/20 shrink-0">
          <MdAdd className="text-[15px]" /> Add Doctor
        </button>
      </div>

      <div className="bg-white border border-slate-200 rounded-2xl overflow-hidden flex shadow-sm" style={{ minHeight: '500px' }}>
        {/* List */}
        <div className={`flex flex-col border-r border-slate-100 w-full lg:w-[360px] shrink-0 ${selected ? 'hidden lg:flex' : 'flex'}`}>
          <div className="px-4 pt-4 pb-3 border-b border-slate-100">
            <div className="relative">
              <MdSearch className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 text-[16px]" />
              <input type="text" value={search} onChange={e => setSearch(e.target.value)}
                placeholder="Search name or specialty…"
                className="w-full pl-9 pr-8 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm
                  focus:outline-none focus:border-amber-400 transition-colors" />
              {search && (
                <button onClick={() => setSearch('')} className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-300 hover:text-slate-500">
                  <MdClose className="text-[13px]" />
                </button>
              )}
            </div>
          </div>

          <div className="flex-1 overflow-y-auto divide-y divide-slate-100">
            {loading ? (
              <div className="py-16 flex items-center justify-center">
                <div className="w-6 h-6 border-2 border-slate-200 border-t-amber-500 rounded-full animate-spin" />
              </div>
            ) : filtered.length === 0 ? (
              <div className="py-16 text-center text-sm text-slate-400 px-6">No doctors found.</div>
            ) : filtered.map(doc => {
              const isDerma  = (doc.type === 'derma') || (doc.specialty || '').toLowerCase().includes('derm')
              const DIcon    = isDerma ? MdFace : MdMedicalServices
              const isActive = doc.is_active === 1
              return (
                <button key={doc.id} onClick={() => setSelected(doc)}
                  className={`w-full flex items-center gap-4 px-4 py-4 border-l-[3px] text-left transition-all
                    ${selected?.id === doc.id ? 'border-l-amber-400 bg-amber-50/40' : 'border-l-transparent hover:bg-slate-50/70'}`}>
                  <div className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0
                    ${isDerma ? 'bg-emerald-50' : 'bg-slate-100'}`}>
                    <DIcon className={`text-[18px] ${isDerma ? 'text-emerald-600' : 'text-slate-500'}`} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-bold text-slate-800 truncate">{doc.full_name}</p>
                    <p className="text-xs text-slate-500 truncate">{doc.specialty}</p>
                  </div>
                  <div className="flex flex-col items-end gap-1 shrink-0">
                    <span className={`text-[10px] font-bold border px-2 py-0.5 rounded-full
                      ${isActive ? 'bg-emerald-50 text-emerald-700 border-emerald-200' : 'bg-slate-100 text-slate-400 border-slate-200'}`}>
                      {isActive ? 'Active' : 'Inactive'}
                    </span>
                    <MdChevronRight className={`text-[14px] ${selected?.id === doc.id ? 'text-slate-500' : 'text-slate-300'}`} />
                  </div>
                </button>
              )
            })}
          </div>
          <div className="px-5 py-3 border-t border-slate-100 bg-slate-50/50 text-[11px] text-slate-400">
            {filtered.length} of {doctors.length} doctors
          </div>
        </div>

        {/* Detail */}
        <div className={`flex flex-col flex-1 min-w-0 ${!selected ? 'hidden lg:flex' : 'flex'}`}>
          {selected ? (
            <DetailPanel
              doctor={doctors.find(d => d.id === selected.id) || selected}
              onClose={() => setSelected(null)}
              onToggle={handleToggle}
            />
          ) : (
            <div className="flex flex-col items-center justify-center flex-1 text-center px-8">
              <div className="w-16 h-16 rounded-2xl bg-slate-50 border border-slate-100 flex items-center justify-center mb-4">
                <MdMedicalServices className="text-[28px] text-slate-300" />
              </div>
              <p className="text-sm font-bold text-slate-600">Select a doctor account</p>
              <p className="text-xs text-slate-400 mt-1">Choose a profile to view credentials or manage status.</p>
            </div>
          )}
        </div>
      </div>

      {showAdd && <AddModal onClose={() => setShowAdd(false)} onAdd={handleAdd} />}
    </div>
  )
}

export default Admin_DoctorAccount