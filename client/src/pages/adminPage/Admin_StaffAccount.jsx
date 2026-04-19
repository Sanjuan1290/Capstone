// client/src/pages/adminPage/Admin_StaffAccount.jsx
// REDESIGNED: Split list+detail, amber theme, mobile bottom-sheet add modal

import { useEffect, useState } from 'react'
import { getStaff, createStaff, toggleStaff, updateStaff } from '../../services/admin.service'
import {
  MdSearch, MdClose, MdAdd, MdPerson, MdEmail, MdPhone,
  MdChevronRight, MdBlock, MdCheck, MdArrowBack, MdMailOutline,
  MdPeople, MdCalendarToday, MdEdit,
} from 'react-icons/md'

// ── Add Modal ──────────────────────────────────────────────────────────────────
const AddModal = ({ onClose, onAdd }) => {
  const [form,     setForm]     = useState({ full_name: '', email: '', phone: '' })
  const [submitting,setSub]     = useState(false)
  const [error,    setError]    = useState('')
  const valid = form.full_name.trim() && form.email.trim()

  const handleSubmit = async () => {
    setSub(true); setError('')
    try { await onAdd(form); onClose() }
    catch (err) { setError(err.message || 'Failed to create account.') }
    finally { setSub(false) }
  }

  return (
    <>
      <div className="fixed inset-0 z-40 bg-black/50 backdrop-blur-sm" onClick={onClose} />
      <div className="fixed bottom-0 left-0 right-0 z-50 bg-white rounded-t-3xl shadow-2xl flex flex-col max-h-[85vh]
        sm:static sm:fixed sm:inset-auto sm:top-1/2 sm:left-1/2 sm:-translate-x-1/2 sm:-translate-y-1/2
        sm:w-full sm:max-w-sm sm:rounded-3xl sm:shadow-2xl">
        <div className="sm:hidden flex justify-center pt-3 pb-1"><div className="w-10 h-1 bg-slate-200 rounded-full" /></div>
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100 shrink-0">
          <div>
            <p className="text-sm font-bold text-slate-800">Add Staff Account</p>
            <p className="text-xs text-slate-500 mt-0.5">Password will be emailed automatically</p>
          </div>
          <button onClick={onClose} className="w-8 h-8 flex items-center justify-center rounded-xl hover:bg-slate-100 text-slate-400">
            <MdClose />
          </button>
        </div>
        <div className="flex-1 overflow-y-auto px-6 py-5 space-y-4">
          <div className="flex items-start gap-2.5 bg-sky-50 border border-sky-200 rounded-xl px-4 py-3">
            <MdMailOutline className="text-sky-500 text-[16px] shrink-0 mt-0.5" />
            <p className="text-xs text-sky-700">A secure temporary password will be generated and sent to the staff member's email.</p>
          </div>
          {[
            { k: 'full_name', l: 'Full Name', t: 'text',  p: 'e.g. Ana Reyes', req: true  },
            { k: 'email',     l: 'Email',     t: 'email', p: 'e.g. ana@carait.com', req: true },
            { k: 'phone',     l: 'Phone',     t: 'tel',   p: 'e.g. 09171234567', req: false },
          ].map(({ k, l, t, p, req }) => (
            <div key={k}>
              <label className="text-[11px] font-bold text-slate-500 uppercase tracking-widest mb-1.5 block">
                {l} {req && <span className="text-red-400">*</span>}
              </label>
              <input type={t} value={form[k]} onChange={e => setForm(f => ({ ...f, [k]: e.target.value }))} placeholder={p}
                className="w-full text-sm bg-slate-50 border-2 border-slate-200 rounded-xl px-3 py-2.5
                  focus:outline-none focus:border-amber-400 transition-colors" />
            </div>
          ))}
          {error && <div className="text-xs text-red-600 bg-red-50 border border-red-200 rounded-xl px-4 py-3">{error}</div>}
        </div>
        <div className="px-6 pb-6 pt-3 flex gap-3 shrink-0 border-t border-slate-100">
          <button onClick={onClose} className="flex-1 py-3 text-sm font-semibold text-slate-600 border border-slate-200 rounded-2xl hover:bg-slate-50">Cancel</button>
          <button disabled={!valid || submitting} onClick={handleSubmit}
            className="flex-1 py-3 text-sm font-bold text-white bg-amber-500 hover:bg-amber-600 disabled:opacity-40 rounded-2xl transition-colors">
            {submitting ? 'Creating…' : 'Create & Send Email'}
          </button>
        </div>
      </div>
    </>
  )
}

const EditModal = ({ account, onClose, onSave }) => {
  const [form, setForm] = useState({
    full_name: account?.full_name || '',
    email: account?.email || '',
    phone: account?.phone || '',
  })
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState('')

  const handleSubmit = async () => {
    setSubmitting(true)
    setError('')
    try {
      await onSave(form)
      onClose()
    } catch (err) {
      setError(err.message || 'Failed to update account.')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <>
      <div className="fixed inset-0 z-40 bg-black/50 backdrop-blur-sm" onClick={onClose} />
      <div className="fixed inset-x-4 top-1/2 z-50 mx-auto w-auto max-w-md -translate-y-1/2 rounded-3xl bg-white shadow-2xl">
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100">
          <div>
            <p className="text-sm font-bold text-slate-800">Update Staff Account</p>
            <p className="text-xs text-slate-500 mt-0.5">Use this when the staff member formally requests a contact change.</p>
          </div>
          <button onClick={onClose} className="w-8 h-8 flex items-center justify-center rounded-xl hover:bg-slate-100 text-slate-400">
            <MdClose />
          </button>
        </div>
        <div className="px-6 py-5 space-y-4">
          {[
            { k: 'full_name', l: 'Full Name', t: 'text' },
            { k: 'email', l: 'Email', t: 'email' },
            { k: 'phone', l: 'Phone', t: 'tel' },
          ].map(({ k, l, t }) => (
            <div key={k}>
              <label className="text-[11px] font-bold text-slate-500 uppercase tracking-widest mb-1.5 block">{l}</label>
              <input
                type={t}
                value={form[k]}
                onChange={e => setForm(prev => ({ ...prev, [k]: e.target.value }))}
                className="w-full text-sm bg-slate-50 border-2 border-slate-200 rounded-xl px-3 py-2.5 focus:outline-none focus:border-amber-400 transition-colors"
              />
            </div>
          ))}
          {error && <div className="text-xs text-red-600 bg-red-50 border border-red-200 rounded-xl px-4 py-3">{error}</div>}
        </div>
        <div className="px-6 pb-6 flex gap-3">
          <button onClick={onClose} className="flex-1 py-3 text-sm font-semibold text-slate-600 border border-slate-200 rounded-2xl hover:bg-slate-50">Cancel</button>
          <button onClick={handleSubmit} disabled={submitting} className="flex-1 py-3 text-sm font-bold text-white bg-amber-500 hover:bg-amber-600 disabled:opacity-40 rounded-2xl transition-colors">
            {submitting ? 'Saving…' : 'Save Changes'}
          </button>
        </div>
      </div>
    </>
  )
}

// ── Detail Panel ──────────────────────────────────────────────────────────────
const DetailPanel = ({ staff, onClose, onToggle, onEdit }) => {
  if (!staff) return null
  const name     = staff.full_name || 'Staff Member'
  const initials = name.split(' ').map(n => n[0]).join('').slice(0, 2).toUpperCase()
  const isActive = staff.status === 'active'
  const joined   = staff.created_at ? new Date(staff.created_at).toLocaleDateString('en-PH', { month: 'short', day: 'numeric', year: 'numeric' }) : 'N/A'

  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center gap-3 px-6 py-5 border-b border-slate-100 shrink-0">
        <button onClick={onClose} className="w-8 h-8 flex items-center justify-center rounded-xl hover:bg-slate-100 text-slate-400 lg:hidden">
          <MdArrowBack className="text-[18px]" />
        </button>
        <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-[#0b1a2c] to-[#122236] flex items-center justify-center text-amber-400 font-black text-sm shrink-0">
          {initials}
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-bold text-slate-800 truncate">{name}</p>
          <p className="text-xs text-slate-400 font-mono">#{staff.id}</p>
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
            { icon: MdEmail,        label: 'Email',  value: staff.email                    },
            { icon: MdPhone,        label: 'Phone',  value: staff.phone || 'Not added'     },
            { icon: MdCalendarToday,label: 'Joined', value: joined                         },
          ].map((meta) => (
            <div key={meta.label} className="flex items-center gap-3">
              <div className="w-7 h-7 rounded-lg bg-white border border-slate-200 flex items-center justify-center shrink-0">
                <meta.icon className="text-[13px] text-slate-400" />
              </div>
              <div>
                <p className="text-[10px] text-slate-400 font-medium">{meta.label}</p>
                <p className="text-sm font-semibold text-slate-800">{meta.value}</p>
              </div>
            </div>
          ))}
        </div>
      </div>

      <div className="px-6 pb-6 pt-4 border-t border-slate-100 shrink-0">
        <button onClick={() => onEdit(staff)}
          className="mb-2 w-full flex items-center justify-center gap-2 py-3 text-xs font-bold rounded-xl border border-amber-200 bg-amber-50 text-amber-700 hover:bg-amber-100 transition-colors">
          <MdEdit className="text-[14px]" /> Update Contact Details
        </button>
        <button onClick={() => onToggle(staff.id)}
          className={`w-full flex items-center justify-center gap-2 py-3 text-xs font-bold rounded-xl transition-colors
            ${isActive
              ? 'text-red-500 bg-red-50 border border-red-200 hover:bg-red-100'
              : 'text-emerald-600 bg-emerald-50 border border-emerald-200 hover:bg-emerald-100'}`}>
          {isActive ? <><MdBlock className="text-[14px]" /> Deactivate Account</> : <><MdCheck className="text-[14px]" /> Activate Account</>}
        </button>
      </div>
    </div>
  )
}

// ── Main ──────────────────────────────────────────────────────────────────────
const Admin_StaffAccount = () => {
  const [staff,    setStaff]    = useState([])
  const [loading,  setLoading]  = useState(true)
  const [search,   setSearch]   = useState('')
  const [selected, setSelected] = useState(null)
  const [showAdd,  setShowAdd]  = useState(false)
  const [filter,   setFilter]   = useState('all')
  const [editing,  setEditing]  = useState(null)

  useEffect(() => {
    getStaff()
      .then(data => { const arr = Array.isArray(data) ? data : []; setStaff(arr); if (arr.length > 0) setSelected(arr[0]) })
      .catch(err => console.error('Fetch Staff Error:', err))
      .finally(() => setLoading(false))
  }, [])

  const handleToggle = async id => {
    try {
      const res = await toggleStaff(id)
      setStaff(prev => prev.map(s => s.id === id ? { ...s, status: res.status } : s))
      setSelected(prev => prev?.id === id ? { ...prev, status: res.status } : prev)
    } catch { alert('Failed to toggle status.') }
  }

  const handleAdd = async formData => {
    const newStaff = await createStaff(formData)
    setStaff(prev => [...prev, newStaff])
    if (!selected) setSelected(newStaff)
  }

  const handleEdit = async (formData) => {
    const updated = await updateStaff(editing.id, formData)
    setStaff(prev => prev.map(s => s.id === updated.id ? { ...s, ...updated } : s))
    setSelected(prev => prev?.id === updated.id ? { ...prev, ...updated } : prev)
  }

  const filtered = staff.filter(s => {
    const matchFilter = filter === 'all' || s.status === filter
    const matchSearch = !search || (s.full_name || '').toLowerCase().includes(search.toLowerCase()) || s.email.toLowerCase().includes(search.toLowerCase())
    return matchFilter && matchSearch
  })

  return (
    <div className="max-w-5xl space-y-5">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-xl lg:text-2xl font-bold text-slate-800 flex items-center gap-2">
            <MdPeople className="text-amber-500 text-[22px]" /> Staff Accounts
          </h1>
          <p className="text-xs lg:text-sm text-slate-500 mt-0.5">Manage access and account status for clinic staff.</p>
        </div>
        <button onClick={() => setShowAdd(true)}
          className="flex items-center gap-1.5 bg-amber-500 hover:bg-amber-600 text-white text-xs font-bold
            px-4 py-2.5 rounded-xl transition-colors shadow-lg shadow-amber-500/20 shrink-0">
          <MdAdd className="text-[15px]" /> Add Staff
        </button>
      </div>

      <div className="bg-white border border-slate-200 rounded-2xl overflow-hidden flex shadow-sm" style={{ minHeight: '520px' }}>
        {/* List */}
        <div className={`flex flex-col border-r border-slate-100 w-full lg:w-[360px] shrink-0 ${selected ? 'hidden lg:flex' : 'flex'}`}>
          <div className="px-4 pt-4 pb-3 border-b border-slate-100 space-y-3">
            <div className="relative">
              <MdSearch className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 text-[16px]" />
              <input type="text" value={search} onChange={e => setSearch(e.target.value)}
                placeholder="Search name or email…"
                className="w-full pl-9 pr-8 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm
                  focus:outline-none focus:border-amber-400 transition-colors" />
              {search && (
                <button onClick={() => setSearch('')} className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-300 hover:text-slate-500">
                  <MdClose className="text-[13px]" />
                </button>
              )}
            </div>
            <div className="flex gap-1">
              {[{ k: 'all', l: 'All' }, { k: 'active', l: 'Active' }, { k: 'inactive', l: 'Inactive' }].map(({ k, l }) => (
                <button key={k} onClick={() => setFilter(k)}
                  className={`px-3 py-1.5 rounded-lg text-[11px] font-bold transition-all
                    ${filter === k ? 'bg-amber-500 text-white' : 'text-slate-500 hover:bg-slate-100'}`}>
                  {l}
                </button>
              ))}
            </div>
          </div>

          <div className="flex-1 overflow-y-auto divide-y divide-slate-100">
            {loading ? (
              <div className="py-16 flex items-center justify-center">
                <div className="w-6 h-6 border-2 border-slate-200 border-t-amber-500 rounded-full animate-spin" />
              </div>
            ) : filtered.length === 0 ? (
              <div className="py-16 text-center text-sm text-slate-400 px-6">No staff accounts found.</div>
            ) : filtered.map(s => {
              const initials = (s.full_name || 'S').split(' ').map(n => n[0]).join('').slice(0, 2).toUpperCase()
              return (
                <button key={s.id} onClick={() => setSelected(s)}
                  className={`w-full flex items-center gap-3 px-4 py-4 border-l-[3px] text-left transition-all
                    ${selected?.id === s.id ? 'border-l-amber-400 bg-amber-50/40' : 'border-l-transparent hover:bg-slate-50/70'}`}>
                  <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-[#0b1a2c] to-[#122236] flex items-center justify-center text-amber-400 font-bold text-xs shrink-0">
                    {initials}
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
              )
            })}
          </div>
          <div className="px-5 py-3 border-t border-slate-100 bg-slate-50/50 text-[11px] text-slate-400">
            {filtered.length} of {staff.length} staff members
          </div>
        </div>

        {/* Detail */}
        <div className={`flex flex-col flex-1 min-w-0 ${!selected ? 'hidden lg:flex' : 'flex'}`}>
          {selected ? (
            <DetailPanel
              staff={staff.find(s => s.id === selected.id) || selected}
              onClose={() => setSelected(null)}
              onToggle={handleToggle}
              onEdit={setEditing}
            />
          ) : (
            <div className="flex flex-col items-center justify-center flex-1 text-center px-8">
              <div className="w-16 h-16 rounded-2xl bg-slate-50 border border-slate-100 flex items-center justify-center mb-4">
                <MdPerson className="text-[28px] text-slate-300" />
              </div>
              <p className="text-sm font-bold text-slate-600">Select a staff member</p>
              <p className="text-xs text-slate-400 mt-1">View details or manage account status.</p>
            </div>
          )}
        </div>
      </div>

      {showAdd && <AddModal onClose={() => setShowAdd(false)} onAdd={handleAdd} />}
      {editing && <EditModal account={editing} onClose={() => setEditing(null)} onSave={handleEdit} />}
    </div>
  )
}

export default Admin_StaffAccount
