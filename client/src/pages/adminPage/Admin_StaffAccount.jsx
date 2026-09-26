import { useEffect, useMemo, useState } from 'react'
import Pagination from '../../components/ui/Pagination'
import useClientPagination from '../../hooks/useClientPagination'
import StaffPermissionPicker from '../../components/accounts/StaffPermissionPicker'
import { DEFAULT_STAFF_PERMISSIONS, STAFF_PERMISSION_MAP, normalizeStaffPermissions } from '../../config/staffPermissions'
import { getStaff, createStaff, toggleStaff, updateStaff } from '../../services/admin.service'
import {
  MdAdd, MdArrowBack, MdBlock, MdCalendarToday, MdCheck, MdChevronRight,
  MdClose, MdEdit, MdEmail, MdKey, MdMailOutline, MdPeople, MdPhone, MdSearch,
} from 'react-icons/md'

const toLocalPhone = (value = '') => {
  let digits = String(value || '').replace(/\D/g, '')
  if (digits.startsWith('63')) digits = digits.slice(2)
  if (digits.startsWith('0')) digits = digits.slice(1)
  return digits ? `0${digits.slice(0, 10)}` : ''
}

const createBlankForm = () => ({ full_name: '', email: '', phone: '', permissions: [...DEFAULT_STAFF_PERMISSIONS] })

const AccountFields = ({ form, setForm, disabled = false }) => (
  <div className="grid gap-4 md:grid-cols-3">
    {[
      { key: 'full_name', label: 'Full Name', type: 'text', placeholder: 'e.g. Ana Reyes' },
      { key: 'email', label: 'Email', type: 'email', placeholder: 'e.g. ana@carait.com' },
      { key: 'phone', label: 'Phone', type: 'tel', placeholder: 'e.g. 09171234567' },
    ].map((field) => (
      <div key={field.key}>
        <label className="mb-1.5 block text-[11px] font-bold uppercase tracking-widest text-slate-500">{field.label} <span className="text-red-400">*</span></label>
        <input
          type={field.type}
          value={form[field.key]}
          disabled={disabled}
          onChange={(event) => setForm((current) => ({ ...current, [field.key]: event.target.value }))}
          placeholder={field.placeholder}
          className="w-full rounded-xl border-2 border-slate-200 bg-slate-50 px-3 py-2.5 text-sm transition-colors focus:border-amber-400 focus:outline-none disabled:opacity-60"
        />
      </div>
    ))}
  </div>
)

const StaffModal = ({ account = null, onClose, onSubmit }) => {
  const editing = Boolean(account)
  const [form, setForm] = useState(() => editing ? {
    full_name: account.full_name || '',
    email: account.email || '',
    phone: toLocalPhone(account.phone || ''),
    permissions: normalizeStaffPermissions(account.permissions),
  } : createBlankForm())
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState('')
  const valid = form.full_name.trim() && form.email.trim() && form.phone.trim() && form.permissions.length > 0

  const submit = async () => {
    if (!valid) return
    setSubmitting(true)
    setError('')
    try {
      await onSubmit({ ...form, permissions: normalizeStaffPermissions(form.permissions) })
      onClose()
    } catch (err) {
      setError(err.message || `Failed to ${editing ? 'update' : 'create'} account.`)
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <>
      <div className="fixed inset-0 z-40 bg-black/50 backdrop-blur-sm" onClick={onClose} />
      <div className="fixed inset-x-3 bottom-3 top-3 z-50 mx-auto flex max-w-6xl flex-col overflow-hidden rounded-3xl bg-white shadow-2xl sm:inset-x-6 lg:inset-x-10">
        <div className="flex shrink-0 items-center justify-between border-b border-slate-100 px-5 py-4 md:px-7">
          <div>
            <p className="text-base font-black text-slate-900">{editing ? 'Update Staff Account' : 'Add Staff Account'}</p>
            <p className="mt-0.5 text-xs text-slate-500">{editing ? 'Update contact details and exactly which features this staff member can access.' : 'Create the account and choose which clinic features this person can access.'}</p>
          </div>
          <button onClick={onClose} className="flex h-9 w-9 items-center justify-center rounded-xl text-slate-400 hover:bg-slate-100"><MdClose /></button>
        </div>

        <div className="flex-1 overflow-y-auto px-5 py-5 md:px-7">
          <div className="mx-auto max-w-5xl space-y-6">
            <section className="rounded-2xl border border-slate-200 bg-white p-5">
              <div className="mb-4">
                <h2 className="text-sm font-black text-slate-800">Account Details</h2>
                <p className="mt-1 text-xs text-slate-500">Basic information used for Staff sign-in and account notifications.</p>
              </div>
              {!editing && (
                <div className="mb-4 flex items-start gap-2.5 rounded-xl border border-sky-200 bg-sky-50 px-4 py-3">
                  <MdMailOutline className="mt-0.5 shrink-0 text-sky-500" />
                  <p className="text-xs leading-relaxed text-sky-700">A secure temporary password will be generated and emailed automatically. The staff member must change it after first sign-in.</p>
                </div>
              )}
              <AccountFields form={form} setForm={setForm} disabled={submitting} />
            </section>

            <section className="rounded-2xl border border-slate-200 bg-slate-50/40 p-4 md:p-5">
              <StaffPermissionPicker
                value={form.permissions}
                disabled={submitting}
                onChange={(permissions) => setForm((current) => ({ ...current, permissions }))}
              />
            </section>

            {editing && (
              <div className="flex items-start gap-2 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-xs leading-relaxed text-amber-800">
                <MdKey className="mt-0.5 shrink-0" />
                If permissions change, the staff member's active sessions are revoked so the new access rules take effect immediately.
              </div>
            )}
            {error && <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-xs text-red-600">{error}</div>}
          </div>
        </div>

        <div className="flex shrink-0 justify-end gap-3 border-t border-slate-100 px-5 py-4 md:px-7">
          <button onClick={onClose} disabled={submitting} className="rounded-2xl border border-slate-200 px-5 py-3 text-sm font-semibold text-slate-600 hover:bg-slate-50 disabled:opacity-40">Cancel</button>
          <button disabled={!valid || submitting} onClick={submit} className="rounded-2xl bg-amber-500 px-6 py-3 text-sm font-bold text-white hover:bg-amber-600 disabled:opacity-40">
            {submitting ? (editing ? 'Saving…' : 'Creating…') : (editing ? 'Save Access Changes' : 'Create & Send Email')}
          </button>
        </div>
      </div>
    </>
  )
}

const PermissionSummary = ({ permissions = [] }) => {
  const normalized = normalizeStaffPermissions(permissions)
  if (!normalized.length) return <p className="text-sm text-slate-400">No feature permissions assigned.</p>
  return (
    <div className="flex flex-wrap gap-2">
      {normalized.map((key) => (
        <span key={key} title={STAFF_PERMISSION_MAP[key]?.description || key} className="rounded-full border border-amber-200 bg-amber-50 px-2.5 py-1 text-[11px] font-bold text-amber-800">
          {STAFF_PERMISSION_MAP[key]?.label || key}
        </span>
      ))}
    </div>
  )
}

const DetailPanel = ({ staff, onClose, onToggle, onEdit }) => {
  if (!staff) return null
  const name = staff.full_name || 'Staff Member'
  const initials = name.split(' ').map((part) => part[0]).join('').slice(0, 2).toUpperCase()
  const active = staff.status === 'active'
  const joined = staff.created_at ? new Date(staff.created_at).toLocaleDateString('en-PH', { month: 'short', day: 'numeric', year: 'numeric' }) : 'N/A'
  const permissionCount = normalizeStaffPermissions(staff.permissions).length

  return (
    <div className="flex h-full flex-col">
      <div className="flex shrink-0 items-center gap-3 border-b border-slate-100 px-6 py-5">
        <button onClick={onClose} className="flex h-8 w-8 items-center justify-center rounded-xl text-slate-400 hover:bg-slate-100 lg:hidden"><MdArrowBack /></button>
        <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-gradient-to-br from-[#0b1a2c] to-[#122236] text-sm font-black text-amber-400">{initials}</div>
        <div className="min-w-0 flex-1"><p className="truncate text-sm font-bold text-slate-800">{name}</p><p className="font-mono text-xs text-slate-400">#{staff.id}</p></div>
        <span className={`shrink-0 rounded-full border px-2.5 py-0.5 text-[11px] font-bold ${active ? 'border-emerald-200 bg-emerald-50 text-emerald-700' : 'border-slate-200 bg-slate-100 text-slate-500'}`}>{active ? 'Active' : 'Inactive'}</span>
      </div>

      <div className="flex-1 space-y-5 overflow-y-auto px-6 py-5">
        <div className="space-y-3 rounded-2xl bg-slate-50 p-4">
          <p className="text-[10px] font-bold uppercase tracking-widest text-slate-400">Account Info</p>
          {[
            { icon: MdEmail, label: 'Email', value: staff.email },
            { icon: MdPhone, label: 'Phone', value: staff.phone ? toLocalPhone(staff.phone) : 'Not added' },
            { icon: MdCalendarToday, label: 'Joined', value: joined },
          ].map((meta) => (
            <div key={meta.label} className="flex items-center gap-3">
              <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg border border-slate-200 bg-white"><meta.icon className="text-[13px] text-slate-400" /></div>
              <div><p className="text-[10px] font-medium text-slate-400">{meta.label}</p><p className="text-sm font-semibold text-slate-800">{meta.value}</p></div>
            </div>
          ))}
        </div>

        <div className="rounded-2xl border border-slate-200 p-4">
          <div className="mb-3 flex items-center justify-between gap-2">
            <div><p className="text-[10px] font-bold uppercase tracking-widest text-slate-400">Access Permissions</p><p className="mt-1 text-xs text-slate-500">Hover over a label for the feature description.</p></div>
            <span className="rounded-full bg-slate-100 px-2.5 py-1 text-[10px] font-black text-slate-600">{permissionCount}/13 enabled</span>
          </div>
          <PermissionSummary permissions={staff.permissions} />
        </div>
      </div>

      <div className="shrink-0 space-y-2 border-t border-slate-100 px-6 py-5">
        <button onClick={onEdit} className="flex w-full items-center justify-center gap-2 rounded-xl border border-amber-200 bg-amber-50 py-2.5 text-sm font-bold text-amber-700 hover:bg-amber-100"><MdEdit /> Manage Account & Permissions</button>
        <button onClick={onToggle} className={`flex w-full items-center justify-center gap-2 rounded-xl border py-2.5 text-sm font-bold ${active ? 'border-red-200 bg-red-50 text-red-600 hover:bg-red-100' : 'border-emerald-200 bg-emerald-50 text-emerald-700 hover:bg-emerald-100'}`}>
          {active ? <><MdBlock /> Disable Account</> : <><MdCheck /> Enable Account</>}
        </button>
      </div>
    </div>
  )
}

const Admin_StaffAccount = ({ embedded = false }) => {
  const [staff, setStaff] = useState([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [selected, setSelected] = useState(null)
  const [showAdd, setShowAdd] = useState(false)
  const [editing, setEditing] = useState(null)
  const [error, setError] = useState('')

  const load = async () => {
    setLoading(true); setError('')
    try {
      const rows = await getStaff()
      setStaff(Array.isArray(rows) ? rows : [])
      setSelected((current) => current ? (rows.find((row) => row.id === current.id) || null) : current)
    } catch (err) { setError(err.message || 'Could not load staff accounts.') }
    finally { setLoading(false) }
  }

  useEffect(() => { load() }, [])

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase()
    if (!q) return staff
    return staff.filter((item) => [item.full_name, item.email, item.phone, item.status].some((value) => String(value || '').toLowerCase().includes(q)))
  }, [staff, search])
  const pagination = useClientPagination(filtered, { initialPageSize: 10, resetDeps: [search] })

  const add = async (payload) => {
    const created = await createStaff(payload)
    setStaff((current) => [...current, created].sort((a, b) => String(a.full_name).localeCompare(String(b.full_name))))
    setSelected(created)
  }

  const save = async (payload) => {
    const updated = await updateStaff(editing.id, payload)
    setStaff((current) => current.map((row) => row.id === updated.id ? updated : row))
    setSelected(updated)
    setEditing(null)
  }

  const toggle = async (account) => {
    const next = account.status === 'active' ? 'disable' : 'enable'
    if (!window.confirm(`${next === 'disable' ? 'Disable' : 'Enable'} ${account.full_name}'s account? Active sessions will be revoked.`)) return
    const result = await toggleStaff(account.id)
    const updated = { ...account, status: result.status }
    setStaff((current) => current.map((row) => row.id === account.id ? updated : row))
    setSelected(updated)
  }

  return (
    <div className={embedded ? 'space-y-4' : 'mx-auto w-full max-w-7xl space-y-5'}>
      {!embedded && <div><h1 className="flex items-center gap-2 text-2xl font-black text-slate-900"><MdPeople className="text-amber-500" /> Staff Accounts</h1><p className="mt-1 text-sm text-slate-500">Create Staff accounts and control exactly which clinic features they can access.</p></div>}

      <div className="flex min-h-[620px] overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-sm">
        <div className={`w-full shrink-0 border-r border-slate-100 lg:w-[390px] ${selected ? 'hidden lg:flex' : 'flex'} flex-col`}>
          <div className="space-y-3 border-b border-slate-100 p-4">
            <div className="flex items-center gap-2">
              <div className="relative min-w-0 flex-1"><MdSearch className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" /><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search Staff..." className="w-full rounded-xl border border-slate-200 bg-slate-50 py-2.5 pl-9 pr-3 text-sm outline-none focus:border-amber-400" /></div>
              <button onClick={() => setShowAdd(true)} className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-amber-500 text-white hover:bg-amber-600" title="Add Staff"><MdAdd /></button>
            </div>
            <p className="text-xs text-slate-400">{filtered.length} staff account{filtered.length === 1 ? '' : 's'}</p>
          </div>

          <div className="flex-1 overflow-y-auto">
            {loading ? <div className="p-6 text-sm text-slate-400">Loading Staff accounts…</div>
              : error ? <div className="p-6 text-sm text-red-600">{error}</div>
                : !pagination.items.length ? <div className="p-8 text-center text-sm text-slate-400">No Staff accounts found.</div>
                  : pagination.items.map((item) => {
                    const active = item.status === 'active'
                    const permissionCount = normalizeStaffPermissions(item.permissions).length
                    return (
                      <button key={item.id} onClick={() => setSelected(item)} className={`flex w-full items-center gap-3 border-b border-slate-50 px-4 py-3 text-left transition hover:bg-slate-50 ${selected?.id === item.id ? 'bg-amber-50/60' : ''}`}>
                        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-[#0b1a2c] text-xs font-black text-amber-400">{String(item.full_name || '?').split(' ').map((part) => part[0]).join('').slice(0, 2).toUpperCase()}</div>
                        <div className="min-w-0 flex-1"><p className="truncate text-sm font-bold text-slate-800">{item.full_name}</p><p className="truncate text-xs text-slate-400">{item.email}</p><p className="mt-1 text-[10px] font-semibold text-slate-400">{permissionCount}/13 permissions</p></div>
                        <div className="flex items-center gap-2"><span className={`h-2 w-2 rounded-full ${active ? 'bg-emerald-400' : 'bg-slate-300'}`} /><MdChevronRight className="text-slate-300" /></div>
                      </button>
                    )
                  })}
          </div>
          <div className="border-t border-slate-100 bg-slate-50/50 p-3"><Pagination compact {...pagination} total={filtered.length} pageSizeOptions={[5, 10, 20]} /></div>
        </div>

        <div className={`min-w-0 flex-1 flex-col ${!selected ? 'hidden lg:flex' : 'flex'}`}>
          {selected ? <DetailPanel staff={staff.find((row) => row.id === selected.id) || selected} onClose={() => setSelected(null)} onEdit={() => setEditing(staff.find((row) => row.id === selected.id) || selected)} onToggle={() => toggle(staff.find((row) => row.id === selected.id) || selected)} />
            : <div className="flex flex-1 flex-col items-center justify-center px-8 text-center"><div className="mb-4 flex h-16 w-16 items-center justify-center rounded-2xl border border-slate-100 bg-slate-50"><MdPeople className="text-[28px] text-slate-300" /></div><p className="text-sm font-bold text-slate-600">Select a Staff account</p><p className="mt-1 max-w-sm text-xs text-slate-400">Choose an account to view contact information and feature permissions.</p></div>}
        </div>
      </div>

      {showAdd && <StaffModal onClose={() => setShowAdd(false)} onSubmit={add} />}
      {editing && <StaffModal account={editing} onClose={() => setEditing(null)} onSubmit={save} />}
    </div>
  )
}

export default Admin_StaffAccount
