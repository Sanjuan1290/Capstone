import { useEffect, useMemo, useState } from 'react'
import {
  getAppointmentReasons,
  createAppointmentReason,
  updateAppointmentReason,
  deleteAppointmentReason,
} from '../../services/admin.service'
import {
  MdAdd,
  MdCheck,
  MdClose,
  MdDelete,
  MdEdit,
  MdEventAvailable,
  MdPeople,
  MdRefresh,
  MdSearch,
} from 'react-icons/md'

const CLINIC_TYPES = [
  { value: 'all', label: 'All Clinics' },
  { value: 'medical', label: 'General Medicine' },
  { value: 'derma', label: 'Dermatology' },
]

const BLANK_FORM = {
  label: '',
  clinic_type: 'all',
  is_active: 1,
}

const clinicLabel = (value) => (
  CLINIC_TYPES.find((item) => item.value === value)?.label || value
)

const Admin_PatientBooking = () => {
  const [reasons, setReasons] = useState([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [filter, setFilter] = useState('all')
  const [form, setForm] = useState(BLANK_FORM)
  const [editingId, setEditingId] = useState(null)
  const [saving, setSaving] = useState(false)
  const [deletingId, setDeletingId] = useState(null)

  const loadReasons = async () => {
    setLoading(true)
    try {
      const rows = await getAppointmentReasons()
      setReasons(Array.isArray(rows) ? rows : [])
    } catch (err) {
      alert(err.message || 'Failed to load appointment reasons.')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    loadReasons()
  }, [])

  const filteredReasons = useMemo(() => {
    const query = search.trim().toLowerCase()

    return reasons.filter((reason) => {
      const matchesFilter = filter === 'all' ? true : reason.clinic_type === filter
      const matchesSearch = !query
        || reason.label.toLowerCase().includes(query)
        || clinicLabel(reason.clinic_type).toLowerCase().includes(query)
      return matchesFilter && matchesSearch
    })
  }, [filter, reasons, search])

  const activeCount = reasons.filter((reason) => Number(reason.is_active) === 1).length
  const inactiveCount = reasons.filter((reason) => Number(reason.is_active) !== 1).length

  const resetForm = () => {
    setForm(BLANK_FORM)
    setEditingId(null)
  }

  const startEdit = (reason) => {
    setEditingId(reason.id)
    setForm({
      label: reason.label || '',
      clinic_type: reason.clinic_type || 'all',
      is_active: Number(reason.is_active) === 1 ? 1 : 0,
    })
  }

  const handleSubmit = async () => {
    const payload = {
      label: form.label.trim(),
      clinic_type: form.clinic_type,
      is_active: Number(form.is_active) === 1 ? 1 : 0,
    }

    if (!payload.label) {
      alert('Reason label is required.')
      return
    }

    setSaving(true)
    try {
      if (editingId) {
        const updated = await updateAppointmentReason(editingId, payload)
        setReasons((current) => current
          .map((reason) => (reason.id === updated.id ? updated : reason))
          .sort((a, b) => String(a.label || '').localeCompare(String(b.label || ''))))
      } else {
        const created = await createAppointmentReason(payload)
        setReasons((current) => [...current, created]
          .sort((a, b) => String(a.label || '').localeCompare(String(b.label || ''))))
      }
      resetForm()
    } catch (err) {
      alert(err.message || 'Failed to save appointment reason.')
    } finally {
      setSaving(false)
    }
  }

  const handleDelete = async (id) => {
    const confirmed = window.confirm('Remove this reason option? Patients will no longer see it in booking.')
    if (!confirmed) return

    setDeletingId(id)
    try {
      await deleteAppointmentReason(id)
      setReasons((current) => current.filter((reason) => reason.id !== id))
      if (editingId === id) resetForm()
    } catch (err) {
      alert(err.message || 'Failed to delete appointment reason.')
    } finally {
      setDeletingId(null)
    }
  }

  return (
    <div className="max-w-6xl space-y-5">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-xl lg:text-2xl font-bold text-slate-800 flex items-center gap-2">
            <MdPeople className="text-amber-500 text-[22px]" /> Patient Booking Settings
          </h1>
          <p className="text-xs lg:text-sm text-slate-500 mt-0.5">
            Manage the reason options patients see in Book Appointment.
          </p>
        </div>
        <button
          onClick={loadReasons}
          className="flex items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-semibold text-slate-600 hover:bg-slate-50 transition-colors"
        >
          <MdRefresh className="text-[16px]" /> Refresh
        </button>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        {[
          { label: 'Total Reasons', value: reasons.length, tone: 'text-sky-600 bg-sky-50 border-sky-200' },
          { label: 'Active', value: activeCount, tone: 'text-emerald-600 bg-emerald-50 border-emerald-200' },
          { label: 'Inactive', value: inactiveCount, tone: 'text-slate-600 bg-slate-100 border-slate-200' },
          { label: 'Shown To Patients', value: filteredReasons.length, tone: 'text-amber-600 bg-amber-50 border-amber-200' },
        ].map((card) => (
          <div key={card.label} className={`rounded-2xl border p-4 shadow-sm ${card.tone}`}>
            <p className="text-[11px] font-bold uppercase tracking-widest opacity-80">{card.label}</p>
            <p className="mt-2 text-2xl font-black">{card.value}</p>
          </div>
        ))}
      </div>

      <div className="grid gap-5 xl:grid-cols-[380px_minmax(0,1fr)]">
        <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm space-y-4">
          <div>
            <h2 className="text-sm font-bold text-slate-800 flex items-center gap-2">
              {editingId ? <MdEdit className="text-amber-500" /> : <MdAdd className="text-amber-500" />}
              {editingId ? 'Edit Reason' : 'Add Reason'}
            </h2>
            <p className="text-xs text-slate-500 mt-1">
              Use one list for all clinics or target only medical or dermatology booking.
            </p>
          </div>

          <div>
            <label className="text-[11px] font-bold text-slate-500 uppercase tracking-widest mb-1.5 block">
              Reason Label
            </label>
            <input
              type="text"
              value={form.label}
              onChange={(e) => setForm((current) => ({ ...current, label: e.target.value }))}
              placeholder="e.g. Follow-up Consultation"
              className="w-full text-sm bg-slate-50 border-2 border-slate-200 rounded-xl px-3 py-2.5 focus:outline-none focus:border-amber-400 transition-colors"
            />
          </div>

          <div>
            <label className="text-[11px] font-bold text-slate-500 uppercase tracking-widest mb-1.5 block">
              Clinic Type
            </label>
            <select
              value={form.clinic_type}
              onChange={(e) => setForm((current) => ({ ...current, clinic_type: e.target.value }))}
              className="w-full text-sm bg-slate-50 border-2 border-slate-200 rounded-xl px-3 py-2.5 focus:outline-none focus:border-amber-400 transition-colors"
            >
              {CLINIC_TYPES.map((option) => (
                <option key={option.value} value={option.value}>{option.label}</option>
              ))}
            </select>
          </div>

          <div>
            <label className="text-[11px] font-bold text-slate-500 uppercase tracking-widest mb-2 block">
              Visibility
            </label>
            <div className="flex gap-2">
              {[
                { value: 1, label: 'Active' },
                { value: 0, label: 'Inactive' },
              ].map((option) => (
                <button
                  key={option.label}
                  onClick={() => setForm((current) => ({ ...current, is_active: option.value }))}
                  className={`flex-1 rounded-xl border px-3 py-2.5 text-xs font-bold transition-colors ${
                    Number(form.is_active) === option.value
                      ? option.value === 1
                        ? 'border-emerald-200 bg-emerald-50 text-emerald-700'
                        : 'border-slate-300 bg-slate-100 text-slate-700'
                      : 'border-slate-200 bg-white text-slate-500 hover:bg-slate-50'
                  }`}
                >
                  {option.label}
                </button>
              ))}
            </div>
          </div>

          <div className="flex gap-3 pt-2">
            {editingId && (
              <button
                onClick={resetForm}
                className="flex-1 py-3 text-sm font-semibold text-slate-600 border border-slate-200 rounded-2xl hover:bg-slate-50"
              >
                Cancel Edit
              </button>
            )}
            <button
              onClick={handleSubmit}
              disabled={saving}
              className="flex-1 py-3 text-sm font-bold text-white bg-amber-500 hover:bg-amber-600 disabled:opacity-50 rounded-2xl transition-colors"
            >
              {saving ? 'Saving...' : editingId ? 'Save Changes' : 'Add Reason'}
            </button>
          </div>
        </div>

        <div className="rounded-2xl border border-slate-200 bg-white shadow-sm overflow-hidden">
          <div className="px-5 py-4 border-b border-slate-100 space-y-3">
            <div className="flex flex-wrap gap-2">
              {CLINIC_TYPES.map((option) => (
                <button
                  key={option.value}
                  onClick={() => setFilter(option.value)}
                  className={`rounded-xl px-3 py-2 text-xs font-bold transition-colors ${
                    filter === option.value
                      ? 'bg-amber-500 text-white'
                      : 'bg-slate-100 text-slate-500 hover:bg-slate-200'
                  }`}
                >
                  {option.label}
                </button>
              ))}
            </div>

            <div className="relative">
              <MdSearch className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 text-[18px]" />
              <input
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search reason label..."
                className="w-full rounded-2xl border border-slate-200 bg-slate-50 py-3 pl-10 pr-10 text-sm text-slate-700 focus:outline-none focus:border-amber-400 focus:ring-2 focus:ring-amber-400/10"
              />
              {search && (
                <button
                  onClick={() => setSearch('')}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
                >
                  <MdClose className="text-[16px]" />
                </button>
              )}
            </div>
          </div>

          {loading ? (
            <div className="flex items-center justify-center py-20">
              <div className="w-8 h-8 border-4 border-slate-200 border-t-amber-500 rounded-full animate-spin" />
            </div>
          ) : filteredReasons.length === 0 ? (
            <div className="flex flex-col items-center py-16 text-center px-6">
              <MdEventAvailable className="text-slate-200 text-[34px] mb-3" />
              <p className="text-sm font-semibold text-slate-500">No reason options found</p>
              <p className="text-xs text-slate-400 mt-1">
                Add a new booking reason or adjust the current filter.
              </p>
            </div>
          ) : (
            <div className="divide-y divide-slate-100">
              {filteredReasons.map((reason) => (
                <div key={reason.id} className="px-5 py-4 flex items-start gap-3">
                  <div className={`mt-0.5 w-2.5 h-2.5 rounded-full shrink-0 ${Number(reason.is_active) === 1 ? 'bg-emerald-500' : 'bg-slate-300'}`} />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <p className="text-sm font-bold text-slate-800">{reason.label}</p>
                      <span className={`text-[10px] font-bold border px-2 py-0.5 rounded-full ${
                        Number(reason.is_active) === 1
                          ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                          : 'bg-slate-100 text-slate-500 border-slate-200'
                      }`}>
                        {Number(reason.is_active) === 1 ? 'Active' : 'Inactive'}
                      </span>
                    </div>
                    <div className="mt-1 flex flex-wrap items-center gap-3 text-[11px] text-slate-400">
                      <span>{clinicLabel(reason.clinic_type)}</span>
                    </div>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <button
                      onClick={() => startEdit(reason)}
                      className="rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-xs font-bold text-amber-700 hover:bg-amber-100 transition-colors"
                    >
                      <span className="flex items-center gap-1"><MdEdit className="text-[13px]" /> Edit</span>
                    </button>
                    <button
                      onClick={() => handleDelete(reason.id)}
                      disabled={deletingId === reason.id}
                      className="rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-xs font-bold text-red-600 hover:bg-red-100 disabled:opacity-50 transition-colors"
                    >
                      <span className="flex items-center gap-1">
                        <MdDelete className="text-[13px]" />
                        {deletingId === reason.id ? 'Removing...' : 'Remove'}
                      </span>
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <div className="flex items-start gap-3">
          <div className="w-10 h-10 rounded-xl bg-amber-50 border border-amber-200 flex items-center justify-center shrink-0">
            <MdCheck className="text-amber-600 text-[18px]" />
          </div>
          <div>
            <p className="text-sm font-bold text-slate-800">How this affects patient booking</p>
            <p className="text-xs text-slate-500 mt-1 leading-relaxed">
              Active options from this page appear in the patient&apos;s <strong>Reason for Visit</strong> step.
              Use <strong>All Clinics</strong> for shared reasons like follow-up visits, and use
              clinic-specific options when a reason should only appear for General Medicine or Dermatology.
            </p>
          </div>
        </div>
      </div>
    </div>
  )
}

export default Admin_PatientBooking
