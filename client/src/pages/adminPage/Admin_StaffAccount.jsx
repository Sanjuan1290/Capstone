// client/src/pages/adminPage/Admin_StaffAccount.jsx
// FIX #2 — Removed password field from the Add Staff form.
// Admin only needs name, email, phone. Password is auto-generated and emailed.

import { useEffect, useState } from 'react'
import { getStaff, createStaff, toggleStaff } from '../../services/admin.service'
import {
  MdSearch, MdClose, MdAdd, MdPerson, MdEmail,
  MdPhone, MdChevronRight, MdEdit, MdBlock,
  MdCheck, MdArrowBack, MdMailOutline
} from 'react-icons/md'

// ─── Add Modal ────────────────────────────────────────────────────────────────

const AddModal = ({ onClose, onAdd }) => {
  const [form,         setForm]         = useState({ full_name: '', email: '', phone: '' })
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [error,        setError]        = useState('')

  const set   = k => e => setForm(f => ({ ...f, [k]: e.target.value }))
  const valid = form.full_name.trim() && form.email.trim()

  const handleSubmit = async () => {
    setIsSubmitting(true)
    setError('')
    try {
      await onAdd(form)
      onClose()
    } catch (err) {
      setError(err.message || 'Failed to create account.')
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm px-4"
      onClick={onClose}>
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm" onClick={e => e.stopPropagation()}>

        <div className="flex items-center justify-between px-6 py-5 border-b border-slate-100">
          <div>
            <p className="text-sm font-bold text-slate-800">Add Staff Account</p>
            <p className="text-xs text-slate-500 mt-0.5">A temporary password will be emailed to the staff member</p>
          </div>
          <button onClick={onClose}
            className="w-8 h-8 flex items-center justify-center rounded-xl hover:bg-slate-100 text-slate-400">
            <MdClose className="text-[18px]" />
          </button>
        </div>

        <div className="px-6 py-5 space-y-3">
          {/* Email notice banner */}
          <div className="flex items-start gap-2.5 bg-sky-50 border border-sky-200 rounded-xl px-4 py-3">
            <MdMailOutline className="text-sky-500 text-[16px] shrink-0 mt-0.5" />
            <p className="text-xs text-sky-700">
              A secure temporary password will be automatically generated and sent to the staff member's email. They must change it upon first login.
            </p>
          </div>

          {[
            { k: 'full_name', l: 'Full Name',    t: 'text',  p: 'e.g. Ana Reyes' },
            { k: 'email',     l: 'Email',         t: 'email', p: 'e.g. ana@carait.com' },
            { k: 'phone',     l: 'Phone (optional)', t: 'tel', p: 'e.g. 09171234567' },
          ].map(({ k, l, t, p }) => (
            <div key={k}>
              <label className="text-xs font-bold text-slate-500 uppercase tracking-widest mb-1.5 block">
                {l} {k !== 'phone' && <span className="text-red-400">*</span>}
              </label>
              <input type={t} value={form[k]} onChange={set(k)} placeholder={p}
                className="w-full text-sm text-slate-700 placeholder-slate-300 bg-slate-50 border-2 border-slate-200
                  rounded-xl px-3 py-2.5 focus:outline-none focus:border-amber-400 transition-colors" />
            </div>
          ))}

          {error && (
            <div className="text-xs text-red-600 bg-red-50 border border-red-200 rounded-xl px-4 py-3">{error}</div>
          )}
        </div>

        <div className="px-6 pb-6 flex gap-3">
          <button onClick={onClose}
            className="flex-1 py-2.5 text-sm font-semibold text-slate-600 border border-slate-200 rounded-xl hover:bg-slate-50">
            Cancel
          </button>
          <button disabled={!valid || isSubmitting} onClick={handleSubmit}
            className="flex-1 py-2.5 text-sm font-bold text-white bg-[#0b1a2c] hover:bg-[#122236] disabled:opacity-40 rounded-xl">
            {isSubmitting ? 'Creating...' : 'Create & Send Email'}
          </button>
        </div>
      </div>
    </div>
  )
}

// ─── Detail Panel ─────────────────────────────────────────────────────────────

const DetailPanel = ({ staff, onClose, onToggle }) => {
  if (!staff) return null
  const name = staff.full_name || 'Staff Member'

  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center gap-3 px-6 py-5 border-b border-slate-100 shrink-0">
        <button onClick={onClose}
          className="w-8 h-8 flex items-center justify-center rounded-xl hover:bg-slate-100 text-slate-400 lg:hidden">
          <MdArrowBack className="text-[18px]" />
        </button>
        <div className="w-10 h-10 rounded-xl bg-[#0b1a2c] flex items-center justify-center text-amber-400 font-bold text-sm shrink-0">
          {name.split(' ').map(n => n[0]).join('').slice(0, 2)}
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-bold text-slate-800 truncate">{name}</p>
          <p className="text-xs text-slate-500 font-mono">{staff.id}</p>
        </div>
        <span className={`text-[11px] font-bold border px-2.5 py-0.5 rounded-full shrink-0
          ${staff.status === 'active' ? 'bg-emerald-50 text-emerald-700 border-emerald-200' : 'bg-slate-100 text-slate-500 border-slate-200'}`}>
          {staff.status === 'active' ? 'Active' : 'Inactive'}
        </span>
      </div>

      <div className="flex-1 overflow-y-auto px-6 py-5 space-y-4">
        <div className="bg-slate-50 rounded-2xl p-4 space-y-3">
          <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Account Info</p>
          {[
            { icon: MdEmail,  label: 'Email',  value: staff.email },
            { icon: MdPhone,  label: 'Phone',  value: staff.phone || 'No phone added' },
            { icon: MdPerson, label: 'Joined', value: staff.created_at ? new Date(staff.created_at).toLocaleDateString('en-PH', { month: 'short', day: 'numeric', year: 'numeric' }) : 'N/A' },
          ].map(({ icon: Icon, label, value }) => (
            <div key={label} className="flex items-center gap-3">
              <div className="w-7 h-7 rounded-lg bg-white border border-slate-200 flex items-center justify-center shrink-0">
                <Icon className="text-[13px] text-slate-400" />
              </div>
              <div>
                <p className="text-[10px] text-slate-400 font-medium">{label}</p>
                <p className="text-sm font-semibold text-slate-800">{value}</p>
              </div>
            </div>
          ))}
        </div>
      </div>

      <div className="px-6 pb-6 pt-4 border-t border-slate-100 space-y-2 shrink-0">
        <button className="w-full flex items-center justify-center gap-2 py-2.5 text-xs font-bold text-slate-600 border border-slate-200 hover:bg-slate-50 rounded-xl transition-colors">
          <MdEdit className="text-[14px]" /> Edit Account
        </button>
        <button onClick={() => onToggle(staff.id)}
          className={`w-full flex items-center justify-center gap-2 py-2.5 text-xs font-bold rounded-xl transition-colors shadow-sm
            ${staff.status === 'active'
              ? 'text-red-500 bg-red-50 border border-red-200 hover:bg-red-100'
              : 'text-emerald-600 bg-emerald-50 border border-emerald-200 hover:bg-emerald-100'}`}>
          {staff.status === 'active'
            ? <><MdBlock className="text-[14px]" /> Deactivate Account</>
            : <><MdCheck className="text-[14px]" /> Activate Account</>}
        </button>
      </div>
    </div>
  )
}

// ─── Main ─────────────────────────────────────────────────────────────────────

const Admin_StaffAccount = () => {
  const [staff,    setStaff]    = useState([])
  const [loading,  setLoading]  = useState(true)
  const [search,   setSearch]   = useState('')
  const [selected, setSelected] = useState(null)
  const [showAdd,  setShowAdd]  = useState(false)
  const [filter,   setFilter]   = useState('all')

  useEffect(() => {
    getStaff()
      .then(data => { setStaff(data); if (data.length > 0) setSelected(data[0]) })
      .catch(err => console.error('Fetch Staff Error:', err))
      .finally(() => setLoading(false))
  }, [])

  const handleToggle = async id => {
    try {
      const res = await toggleStaff(id)
      setStaff(prev => prev.map(s => s.id === id ? { ...s, status: res.status } : s))
      setSelected(prev => prev?.id === id ? { ...prev, status: res.status } : prev)
    } catch {
      alert('Failed to toggle staff status.')
    }
  }

  const handleAdd = async formData => {
    const newStaff = await createStaff(formData)
    setStaff(prev => [...prev, newStaff])
    if (!selected) setSelected(newStaff)
  }

  const filtered = staff.filter(s => {
    const matchFilter = filter === 'all' || s.status === filter
    const matchSearch = !search
      || (s.full_name || '').toLowerCase().includes(search.toLowerCase())
      || s.email.toLowerCase().includes(search.toLowerCase())
    return matchFilter && matchSearch
  })

  return (
    <div className="max-w-5xl space-y-5">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-800">Staff Accounts</h1>
          <p className="text-sm text-slate-500 mt-0.5">Manage access and account status for clinic staff.</p>
        </div>
        <button onClick={() => setShowAdd(true)}
          className="flex items-center gap-1.5 bg-[#0b1a2c] hover:bg-[#122236] text-white text-xs font-semibold
            px-4 py-2.5 rounded-xl transition-all shadow-md active:scale-95 shrink-0">
          <MdAdd className="text-[15px]" /> Add Staff
        </button>
      </div>

      <div className="bg-white border border-slate-200 rounded-2xl overflow-hidden flex shadow-sm" style={{ minHeight: '520px' }}>
        {/* List */}
        <div className={`flex flex-col border-r border-slate-100 w-full lg:w-[360px] shrink-0 ${selected ? 'hidden lg:flex' : 'flex'}`}>
          <div className="px-4 pt-4 pb-3 border-b border-slate-100 space-y-3">
            <div className="flex items-center gap-2 bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 focus-within:border-amber-400 transition-colors">
              <MdSearch className="text-slate-400 text-[15px] shrink-0" />
              <input type="text" value={search} onChange={e => setSearch(e.target.value)}
                placeholder="Search name or email…"
                className="text-sm text-slate-700 placeholder-slate-300 bg-transparent outline-none w-full" />
              {search && (
                <button onClick={() => setSearch('')} className="text-slate-300 hover:text-slate-500">
                  <MdClose className="text-[13px]" />
                </button>
              )}
            </div>
            <div className="flex gap-1">
              {[{ k: 'all', l: 'All' }, { k: 'active', l: 'Active' }, { k: 'inactive', l: 'Inactive' }].map(({ k, l }) => (
                <button key={k} onClick={() => setFilter(k)}
                  className={`px-3 py-1.5 rounded-lg text-[11px] font-bold whitespace-nowrap transition-all
                    ${filter === k ? 'bg-[#0b1a2c] text-amber-400' : 'text-slate-500 hover:bg-slate-100'}`}>
                  {l}
                </button>
              ))}
            </div>
          </div>

          <div className="flex-1 overflow-y-auto divide-y divide-slate-100">
            {loading ? (
              <div className="py-20 text-center text-slate-400 text-sm">Loading staff...</div>
            ) : filtered.length === 0 ? (
              <div className="py-20 text-center text-slate-400 text-sm px-6">No staff accounts found.</div>
            ) : filtered.map(s => (
              <button key={s.id} onClick={() => setSelected(s)}
                className={`w-full flex items-center gap-4 px-5 py-4 border-l-[3px] text-left transition-all
                  ${selected?.id === s.id ? 'border-l-amber-400 bg-slate-50' : 'border-l-transparent hover:bg-slate-50/70'}`}>
                <div className="w-9 h-9 rounded-xl bg-[#0b1a2c] flex items-center justify-center text-amber-400 font-bold text-xs shrink-0">
                  {(s.full_name || 'S').split(' ').map(n => n[0]).join('').slice(0, 2)}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-bold text-slate-800 truncate">{s.full_name}</p>
                  <p className="text-xs text-slate-500 truncate">{s.email}</p>
                </div>
                <div className="flex flex-col items-end gap-1 shrink-0">
                  <span className={`text-[10px] font-bold border px-2 py-0.5 rounded-full
                    ${s.status === 'active' ? 'bg-emerald-50 text-emerald-700 border-emerald-200' : 'bg-slate-100 text-slate-400 border-slate-200'}`}>
                    {s.status === 'active' ? 'Active' : 'Inactive'}
                  </span>
                  <MdChevronRight className={`text-[14px] ${selected?.id === s.id ? 'text-slate-500' : 'text-slate-300'}`} />
                </div>
              </button>
            ))}
          </div>
          <div className="px-5 py-3 border-t border-slate-100 bg-slate-50/50 text-[11px] text-slate-400">
            {filtered.length} of {staff.length} staff members
          </div>
        </div>

        {/* Detail */}
        <div className={`flex flex-col flex-1 min-w-0 bg-white ${!selected ? 'hidden lg:flex' : 'flex'}`}>
          {selected ? (
            <DetailPanel
              staff={staff.find(s => s.id === selected.id)}
              onClose={() => setSelected(null)}
              onToggle={handleToggle}
            />
          ) : (
            <div className="flex flex-col items-center justify-center flex-1 text-center px-8">
              <div className="w-14 h-14 rounded-3xl bg-slate-50 border border-slate-100 flex items-center justify-center mb-4">
                <MdPerson className="text-[24px] text-slate-300" />
              </div>
              <p className="text-sm font-bold text-slate-700">Select a staff member</p>
              <p className="text-xs text-slate-400 mt-1">View complete details or manage account status.</p>
            </div>
          )}
        </div>
      </div>

      {showAdd && <AddModal onClose={() => setShowAdd(false)} onAdd={handleAdd} />}
    </div>
  )
}

export default Admin_StaffAccount