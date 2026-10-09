import { useEffect, useMemo, useState } from 'react'
import Pagination from '../../components/ui/Pagination'
import useClientPagination from '../../hooks/useClientPagination'
import {
  getAppointmentReasons,
  createAppointmentReason,
  updateAppointmentReason,
  deleteAppointmentReason,
  getBookingPolicy,
  updateBookingPolicy,
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

const durationLabel = (minutes) => {
  const total = Math.max(0, Number(minutes) || 0)
  const hours = Math.floor(total / 60)
  const mins = total % 60
  if (!hours) return `${mins} minute${mins === 1 ? '' : 's'}`
  if (!mins) return `${hours} hour${hours === 1 ? '' : 's'}`
  return `${hours} hour${hours === 1 ? '' : 's'} ${mins} minutes`
}

const BOOKING_POLICY_MINUTE_OPTIONS = Array.from({ length: 48 }, (_, index) => (index + 1) * 30)

const Admin_PatientBooking = () => {
  const [reasons, setReasons] = useState([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [filter, setFilter] = useState('all')
  const [form, setForm] = useState(BLANK_FORM)
  const [editingId, setEditingId] = useState(null)
  const [saving, setSaving] = useState(false)
  const [deletingId, setDeletingId] = useState(null)
  const [bookingPolicy, setBookingPolicy] = useState({ online_min_lead_minutes: 720, pending_confirmation_cutoff_minutes: 60, booking_start_interval_minutes: 30 })
  const [savedBookingPolicy, setSavedBookingPolicy] = useState({ online_min_lead_minutes: 720, pending_confirmation_cutoff_minutes: 60, booking_start_interval_minutes: 30 })
  const [editingPolicy, setEditingPolicy] = useState(false)
  const [savingPolicy, setSavingPolicy] = useState(false)

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

  const loadPolicy = async () => {
    try {
      const data = await getBookingPolicy()
      const loadedPolicy = {
        online_min_lead_minutes: Number(data?.online_min_lead_minutes ?? 720),
        pending_confirmation_cutoff_minutes: Number(data?.pending_confirmation_cutoff_minutes ?? 60),
        booking_start_interval_minutes: 30,
      }
      setBookingPolicy(loadedPolicy)
      setSavedBookingPolicy(loadedPolicy)
      setEditingPolicy(false)
    } catch (err) {
      console.error('Failed to load booking policy:', err)
    }
  }

  useEffect(() => {
    loadReasons()
    loadPolicy()
  }, [])

  const policyError = useMemo(() => {
    const notice = Number(bookingPolicy.online_min_lead_minutes)
    const cutoff = Number(bookingPolicy.pending_confirmation_cutoff_minutes)
    if (!Number.isInteger(notice) || notice < 720 || notice > 1440 || notice % 30 !== 0) {
      return 'Minimum online booking notice must be 12 to 24 hours in 30-minute increments.'
    }
    if (!Number.isInteger(cutoff) || cutoff < 30 || cutoff > 1440 || cutoff % 30 !== 0) {
      return 'Pending confirmation cutoff must be 30 minutes to 24 hours in 30-minute increments.'
    }
    if (cutoff >= notice) return 'Pending confirmation cutoff must be less than the minimum online booking notice so Staff has time to review the request.'
    return ''
  }, [bookingPolicy.online_min_lead_minutes, bookingPolicy.pending_confirmation_cutoff_minutes])

  const startPolicyEdit = () => {
    setBookingPolicy({ ...savedBookingPolicy })
    setEditingPolicy(true)
  }

  const cancelPolicyEdit = () => {
    setBookingPolicy({ ...savedBookingPolicy })
    setEditingPolicy(false)
  }

  const savePolicy = async () => {
    if (!editingPolicy) return
    if (policyError) { alert(policyError); return }
    setSavingPolicy(true)
    try {
      const saved = await updateBookingPolicy(bookingPolicy)
      const nextPolicy = {
        online_min_lead_minutes: Number(saved?.online_min_lead_minutes ?? bookingPolicy.online_min_lead_minutes),
        pending_confirmation_cutoff_minutes: Number(saved?.pending_confirmation_cutoff_minutes ?? bookingPolicy.pending_confirmation_cutoff_minutes),
        booking_start_interval_minutes: 30,
      }
      setBookingPolicy(nextPolicy)
      setSavedBookingPolicy(nextPolicy)
      setEditingPolicy(false)
      alert('Booking policy updated.')
    } catch (err) {
      alert(err.message || 'Failed to update booking policy.')
    } finally {
      setSavingPolicy(false)
    }
  }

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
    if (payload.label.toLowerCase() === 'other') {
      alert('Other is built into booking and always requires an explanation. You do not need to add it here.')
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

  const reasonPagination = useClientPagination(filteredReasons, { resetDeps: [search, filter] })

  return (
    <div className="mx-auto max-w-6xl space-y-5">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-xl lg:text-2xl font-bold text-slate-800 flex items-center gap-2">
            <MdPeople className="text-amber-500 text-[22px]" /> Patient Visit Details
          </h1>
          <p className="text-xs lg:text-sm text-slate-500 mt-0.5">
            Manage the reason options patients see in Book Appointment.
          </p>
        </div>
        <button
          onClick={() => { loadReasons(); loadPolicy() }}
          className="flex items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-semibold text-slate-600 hover:bg-slate-50 transition-colors"
        >
          <MdRefresh className="text-[16px]" /> Refresh
        </button>
      </div>


      <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <h2 className="text-sm font-black text-slate-800">Online Booking Policy</h2>
            <p className="mt-1 text-xs text-slate-500">Controls how much advance notice patients need and how long Staff has to confirm a pending online request. Adjustable values can only be changed in 30-minute increments.</p>
          </div>
          {!editingPolicy ? (
            <button onClick={startPolicyEdit} className="button-secondary"><MdEdit /> Edit Booking Policy</button>
          ) : (
            <div className="flex flex-wrap gap-2">
              <button onClick={cancelPolicyEdit} disabled={savingPolicy} className="button-secondary">Cancel</button>
              <button onClick={savePolicy} disabled={savingPolicy || Boolean(policyError)} className="button-primary">{savingPolicy ? 'Saving…' : 'Save Booking Policy'}</button>
            </div>
          )}
        </div>
        <div className="mt-4 grid gap-4 md:grid-cols-3">
          <label>
            <span className="form-label">Minimum Online Booking Notice</span>
            <select disabled={!editingPolicy} className={`form-control mt-1.5 ${!editingPolicy ? 'bg-slate-50 text-slate-600' : ''}`} value={bookingPolicy.online_min_lead_minutes} onChange={(e)=>setBookingPolicy((current)=>({...current,online_min_lead_minutes:Number(e.target.value)}))}>
              {BOOKING_POLICY_MINUTE_OPTIONS.filter((minutes)=>minutes>=720).map((minutes)=><option key={minutes} value={minutes}>{durationLabel(minutes)}</option>)}
            </select>
            <span className="form-helper">{durationLabel(bookingPolicy.online_min_lead_minutes)} before the appointment. Adjust only in 30-minute increments. Minimum: 12 hours.</span>
          </label>
          <label>
            <span className="form-label">Pending Confirmation Cutoff</span>
            <select disabled={!editingPolicy} className={`form-control mt-1.5 ${!editingPolicy ? 'bg-slate-50 text-slate-600' : ''}`} value={bookingPolicy.pending_confirmation_cutoff_minutes} onChange={(e)=>setBookingPolicy((current)=>({...current,pending_confirmation_cutoff_minutes:Number(e.target.value)}))}>
              {BOOKING_POLICY_MINUTE_OPTIONS.map((minutes)=><option key={minutes} value={minutes}>{durationLabel(minutes)}</option>)}
            </select>
            <span className="form-helper">Auto-reject if still pending {durationLabel(bookingPolicy.pending_confirmation_cutoff_minutes)} before the appointment. Adjust only in 30-minute increments. Default: 1 hour.</span>
          </label>
          <div>
            <span className="form-label">Booking Start Interval</span>
            <div className="form-control mt-1.5 bg-slate-50 font-bold text-slate-700">30 minutes</div>
            <span className="form-helper">Fixed at 30 minutes. Available start times move in 30-minute increments; service duration determines how many blocks are reserved.</span>
          </div>
        </div>
        {editingPolicy && policyError ? <div className="mt-4 rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-xs font-semibold text-rose-700">{policyError}</div> : <div className="mt-4 rounded-xl border border-sky-200 bg-sky-50 px-4 py-3 text-xs text-sky-800">Patients must book at least <strong>{durationLabel(bookingPolicy.online_min_lead_minutes)}</strong> ahead. If Staff has not confirmed the request by <strong>{durationLabel(bookingPolicy.pending_confirmation_cutoff_minutes)}</strong> before its start time, the system automatically marks it Rejected and releases the slot.</div>}
      </section>

      <div className="rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800">
        <p className="font-bold">Built-in fallback: Other</p>
        <p className="mt-1 text-xs leading-relaxed">Other is always available in Patient and Staff booking even when this list is empty. Anyone who selects it must explain the reason for the visit, so you do not need to create an Other option here.</p>
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
              {reasonPagination.pageItems.map((reason) => (
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
          {!loading && filteredReasons.length > 0 && (
            <div className="border-t border-slate-100 p-4">
              <Pagination {...reasonPagination} total={filteredReasons.length} />
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

