import { useState } from 'react'
import {
  MdCalendarToday,
  MdEmail,
  MdFactCheck,
  MdHome,
  MdPerson,
  MdPhone,
  MdSave,
  MdWc,
} from 'react-icons/md'
import { updatePatientProfile } from '../services/patient.service'

const INPUT_CLASS = 'w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-700 outline-none focus:border-emerald-400'

const FIELD_LABELS = {
  birthdate: 'Birthdate',
  gender: 'Gender',
  address: 'Address',
}

const ProfileCompletionPrompt = ({ initialProfile, missingFields = [], onCompleted }) => {
  const [form, setForm] = useState({
    full_name: initialProfile?.full_name || '',
    phone: initialProfile?.phone || '',
    birthdate: initialProfile?.birthdate || '',
    gender: initialProfile?.gender || '',
    civil_status: initialProfile?.civil_status || '',
    address: initialProfile?.address || '',
    email: initialProfile?.email || '',
    receive_promotions: Boolean(initialProfile?.receive_promotions),
  })
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  const updateField = (key) => (event) => {
    const value = event.target.type === 'checkbox' ? event.target.checked : event.target.value
    setForm((prev) => ({ ...prev, [key]: value }))
    setError('')
  }

  const handleSubmit = async (event) => {
    event.preventDefault()
    setSaving(true)
    setError('')
    try {
      const result = await updatePatientProfile(form)
      onCompleted?.(result)
    } catch (err) {
      setError(err.message || 'Failed to complete your profile.')
    } finally {
      setSaving(false)
    }
  }

  const highlightedFields = missingFields.length > 0 ? missingFields : ['birthdate', 'gender', 'address']

  return (
    <div className="space-y-5">
      <div className="rounded-[28px] border border-amber-200 bg-[linear-gradient(135deg,rgba(251,191,36,0.12),rgba(255,255,255,1))] p-6 shadow-sm">
        <div className="flex items-start gap-4">
          <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-amber-100 text-amber-700">
            <MdFactCheck className="text-[24px]" />
          </div>
          <div>
            <p className="text-sm font-black uppercase tracking-[0.22em] text-amber-700">Profile Required</p>
            <h2 className="mt-2 text-2xl font-black text-slate-900">Complete your patient profile before booking.</h2>
            <p className="mt-2 text-sm leading-relaxed text-slate-600">
              Registration is now faster, so we only collected your name, phone number, and password. Add the remaining patient details once before your first appointment.
            </p>
            <div className="mt-4 flex flex-wrap gap-2">
              {highlightedFields.map((field) => (
                <span key={field} className="rounded-full border border-amber-200 bg-white px-3 py-1 text-xs font-bold text-amber-700">
                  {FIELD_LABELS[field] || field}
                </span>
              ))}
            </div>
          </div>
        </div>
      </div>

      <form onSubmit={handleSubmit} className="rounded-[28px] border border-slate-200 bg-white p-6 shadow-sm">
        <div className="grid gap-4 md:grid-cols-2">
          <label className="space-y-1.5">
            <span className="text-xs font-bold uppercase tracking-widest text-slate-400">Full Name</span>
            <div className="relative">
              <MdPerson className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" />
              <input value={form.full_name} disabled className={`${INPUT_CLASS} pl-11 text-slate-500`} />
            </div>
          </label>

          <label className="space-y-1.5">
            <span className="text-xs font-bold uppercase tracking-widest text-slate-400">Phone Number</span>
            <div className="relative">
              <MdPhone className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" />
              <input value={form.phone} disabled className={`${INPUT_CLASS} pl-11 text-slate-500`} />
            </div>
          </label>

          <label className="space-y-1.5">
            <span className="text-xs font-bold uppercase tracking-widest text-slate-400">Birthdate</span>
            <div className="relative">
              <MdCalendarToday className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" />
              <input type="date" value={form.birthdate} onChange={updateField('birthdate')} className={`${INPUT_CLASS} pl-11`} required />
            </div>
          </label>

          <label className="space-y-1.5">
            <span className="text-xs font-bold uppercase tracking-widest text-slate-400">Gender</span>
            <div className="relative">
              <MdWc className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" />
              <select value={form.gender} onChange={updateField('gender')} className={`${INPUT_CLASS} pl-11`} required>
                <option value="">Select gender</option>
                <option value="Male">Male</option>
                <option value="Female">Female</option>
                <option value="Other">Other</option>
              </select>
            </div>
          </label>

          <label className="space-y-1.5 md:col-span-2">
            <span className="text-xs font-bold uppercase tracking-widest text-slate-400">Address</span>
            <div className="relative">
              <MdHome className="absolute left-4 top-4 text-slate-400" />
              <textarea
                value={form.address}
                onChange={updateField('address')}
                rows={3}
                required
                placeholder="Street, barangay, city, province"
                className={`${INPUT_CLASS} resize-none pl-11`}
              />
            </div>
          </label>

          <label className="space-y-1.5">
            <span className="text-xs font-bold uppercase tracking-widest text-slate-400">Civil Status</span>
            <select value={form.civil_status} onChange={updateField('civil_status')} className={INPUT_CLASS}>
              <option value="">Prefer not to say</option>
              <option value="Single">Single</option>
              <option value="Married">Married</option>
              <option value="Widowed">Widowed</option>
              <option value="Divorced">Divorced</option>
            </select>
          </label>

          <label className="space-y-1.5">
            <span className="text-xs font-bold uppercase tracking-widest text-slate-400">Email Address</span>
            <div className="relative">
              <MdEmail className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" />
              <input
                type="email"
                value={form.email}
                onChange={updateField('email')}
                placeholder="Optional, for email reminders"
                className={`${INPUT_CLASS} pl-11`}
              />
            </div>
          </label>
        </div>

        <label className="mt-5 flex items-start gap-3 rounded-2xl border border-slate-200 bg-slate-50 px-4 py-4 text-sm text-slate-600">
          <input
            type="checkbox"
            checked={form.receive_promotions}
            onChange={updateField('receive_promotions')}
            className="mt-1 h-4 w-4 rounded border-slate-300 text-emerald-600"
          />
          <span>I want to receive clinic promotions and service updates by email.</span>
        </label>

        {error && (
          <div className="mt-4 rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-600">
            {error}
          </div>
        )}

        <div className="mt-5 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <p className="text-xs text-slate-400">You only need to do this once. Booking unlocks right after saving.</p>
          <button
            type="submit"
            disabled={saving}
            className="inline-flex items-center justify-center gap-2 rounded-2xl bg-emerald-500 px-5 py-3 text-sm font-bold text-white transition-colors hover:bg-emerald-600 disabled:opacity-60"
          >
            <MdSave className="text-[18px]" />
            {saving ? 'Saving Profile...' : 'Save and Continue'}
          </button>
        </div>
      </form>
    </div>
  )
}

export default ProfileCompletionPrompt
