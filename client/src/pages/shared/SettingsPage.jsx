import { useEffect, useState } from 'react'
import { MdCloudUpload, MdDarkMode, MdLightMode, MdSave, MdPhoneAndroid, MdVerifiedUser } from 'react-icons/md'
import PhilippinePhoneInput from '../../components/ui/PhilippinePhoneInput'
import PasswordSecurityCard from '../../components/PasswordSecurityCard'
import Modal from '../../components/ui/Modal'
import {
  confirmPatientPhoneChange,
  getSettings,
  requestPatientPhoneChangeCode,
  updateSettings,
  uploadToCloudinary,
} from '../../services/portal.service'
import { useAuth } from '../../context/AuthContext'
import { useTheme } from '../../context/ThemeContext'
import ProfileAvatar from '../../components/ProfileAvatar'

const GENDER_OPTIONS = ['Male', 'Female', 'Other']
const CIVIL_STATUS_OPTIONS = ['Single', 'Married', 'Widowed', 'Separated', 'Divorced']

const SettingsPage = () => {
  const { role, setUser } = useAuth()
  const { theme, setTheme } = useTheme()
  const [form, setForm] = useState(null)
  const [saving, setSaving] = useState(false)
  const [uploading, setUploading] = useState(false)
  const [error, setError] = useState('')
  const [phoneModalOpen, setPhoneModalOpen] = useState(false)
  const [phoneStep, setPhoneStep] = useState('number')
  const [newPhone, setNewPhone] = useState('')
  const [phoneCode, setPhoneCode] = useState('')
  const [phoneBusy, setPhoneBusy] = useState(false)
  const [phoneMessage, setPhoneMessage] = useState('')

  const loadSettings = async () => {
    if (!role) return
    setError('')
    try {
      const data = await getSettings(role)
      setForm(data)
      if (data?.theme_preference) setTheme(data.theme_preference)
    } catch (err) {
      setError(err.message || 'Failed to load settings.')
      setForm(null)
    }
  }

  useEffect(() => {
    let ignore = false
    if (!role) return undefined
    setError('')
    setForm(null)
    getSettings(role).then((data) => {
      if (ignore) return
      setForm(data)
      if (data?.theme_preference) setTheme(data.theme_preference)
    }).catch((err) => {
      if (ignore) return
      setError(err.message || 'Failed to load settings.')
    })
    return () => { ignore = true }
  }, [role, setTheme])

  if (!form) {
    return (
      <div className="p-10">
        <div className="rounded-3xl border border-slate-200 bg-white p-6 text-sm text-slate-500">
          {error || 'Loading settings...'}
        </div>
      </div>
    )
  }

  const onChange = (key) => (e) => setForm((prev) => ({ ...prev, [key]: e.target.value }))

  const handleUpload = async (e) => {
    const file = e.target.files?.[0]
    if (!file) return
    setUploading(true)
    try {
      const url = await uploadToCloudinary(file)
      setForm((prev) => ({ ...prev, profile_image_url: url }))
      setError('')
    } catch (err) {
      setError(err.message)
    } finally {
      setUploading(false)
    }
  }

  const handleSave = async () => {
    setSaving(true)
    try {
      // Patient mobile-number changes are deliberately excluded here. They require
      // verification of the new number through the dedicated security flow below.
      const payload = { ...form, theme_preference: theme }
      if (role === 'patient') delete payload.phone
      const saved = await updateSettings(role, payload)
      setForm(saved)
      setTheme(saved.theme_preference || theme)
      setUser((prev) => (prev ? { ...prev, ...saved, role } : prev))
      setError('')
      alert('Settings saved.')
    } catch (err) {
      setError(err.message)
    } finally {
      setSaving(false)
    }
  }

  const openPhoneChange = () => {
    setNewPhone('')
    setPhoneCode('')
    setPhoneMessage('')
    setPhoneStep('number')
    setPhoneModalOpen(true)
  }

  const sendPhoneCode = async () => {
    if (!newPhone) return setPhoneMessage('Enter the new mobile number.')
    setPhoneBusy(true)
    setPhoneMessage('')
    try {
      const result = await requestPatientPhoneChangeCode(newPhone)
      setPhoneMessage(result.message || 'Verification code sent to the new mobile number.')
      setPhoneStep('verify')
    } catch (err) {
      setPhoneMessage(err.message || 'Could not send the verification code.')
    } finally {
      setPhoneBusy(false)
    }
  }

  const confirmPhoneCode = async () => {
    if (String(phoneCode).trim().length !== 6) return setPhoneMessage('Enter the 6-digit verification code.')
    setPhoneBusy(true)
    setPhoneMessage('')
    try {
      const result = await confirmPatientPhoneChange(String(phoneCode).trim())
      setPhoneModalOpen(false)
      await loadSettings()
      setUser((prev) => (prev ? { ...prev, phone: result.phone } : prev))
      alert('Mobile number changed successfully.')
    } catch (err) {
      setPhoneMessage(err.message || 'The verification code could not be confirmed.')
    } finally {
      setPhoneBusy(false)
    }
  }

  return (
    <div className="mx-auto w-full max-w-5xl space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-slate-800">Settings</h1>
        <p className="mt-1 text-sm text-slate-500">Manage your profile, account security, profile image, and interface theme.</p>
      </div>

      {error && (
        <div className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-600">
          {error}
        </div>
      )}

      <div className="grid gap-6 lg:grid-cols-[280px_1fr]">
        <div className="space-y-4 rounded-3xl border border-slate-200 bg-white p-6">
          <div className="flex flex-col items-center gap-3 text-center">
            <ProfileAvatar user={form} size="lg" />
            <div>
              <p className="text-lg font-bold text-slate-800">{form.full_name}</p>
              <p className="text-sm text-slate-500">{form.email || form.phone || 'No contact info added yet'}</p>
            </div>
          </div>

          <label className="flex cursor-pointer items-center justify-center gap-2 rounded-2xl border border-dashed border-slate-300 px-4 py-3 text-sm font-semibold text-slate-600 hover:bg-slate-50">
            <MdCloudUpload className="text-[18px]" />
            {uploading ? 'Uploading...' : 'Upload Profile Photo'}
            <input type="file" accept="image/*" className="hidden" onChange={handleUpload} />
          </label>

          <div className="space-y-2 rounded-2xl bg-slate-50 p-4">
            <p className="text-xs font-bold uppercase tracking-widest text-slate-400">Appearance</p>
            <div className="grid grid-cols-2 gap-2">
              <button type="button" onClick={() => setTheme('light')} className={`rounded-2xl border px-3 py-3 text-sm font-semibold ${theme === 'light' ? 'border-amber-300 bg-amber-50 text-amber-700' : 'border-slate-200 text-slate-600'}`}>
                <MdLightMode className="mx-auto mb-1 text-[18px]" /> Light
              </button>
              <button type="button" onClick={() => setTheme('dark')} className={`rounded-2xl border px-3 py-3 text-sm font-semibold ${theme === 'dark' ? 'border-slate-700 bg-slate-900 text-white' : 'border-slate-200 text-slate-600'}`}>
                <MdDarkMode className="mx-auto mb-1 text-[18px]" /> Dark
              </button>
            </div>
          </div>
        </div>

        <div className="space-y-4 rounded-3xl border border-slate-200 bg-white p-6">
          <div>
            <h2 className="text-base font-bold text-slate-900">Personal Information</h2>
            <p className="mt-1 text-xs text-slate-500">Keep your account information accurate and up to date.</p>
          </div>
          <div className="grid gap-4 md:grid-cols-2">
            <label className="space-y-1.5">
              <span className="text-xs font-bold uppercase tracking-widest text-slate-400">Full name</span>
              <input value={form.full_name || ''} onChange={onChange('full_name')} className="w-full rounded-2xl border border-slate-200 px-4 py-3 text-sm outline-none focus:border-sky-400" />
            </label>

            {'phone' in form && role !== 'patient' && (
              <label className="space-y-1.5">
                <span className="text-xs font-bold uppercase tracking-widest text-slate-400">Phone</span>
                <PhilippinePhoneInput value={form.phone || ''} onChange={onChange('phone')} />
              </label>
            )}

            {role === 'patient' && (
              <div className="space-y-1.5">
                <span className="text-xs font-bold uppercase tracking-widest text-slate-400">Mobile Number</span>
                <PhilippinePhoneInput value={form.phone || ''} disabled />
                <button type="button" onClick={openPhoneChange} className="inline-flex items-center gap-1.5 text-xs font-bold text-sky-700 hover:text-sky-800">
                  <MdPhoneAndroid /> Change mobile number securely
                </button>
              </div>
            )}

            {role === 'doctor' && (
              <label className="space-y-1.5 md:col-span-2">
                <span className="text-xs font-bold uppercase tracking-widest text-slate-400">Specialty</span>
                <input value={form.specialty || ''} onChange={onChange('specialty')} className="w-full rounded-2xl border border-slate-200 px-4 py-3 text-sm outline-none focus:border-sky-400" />
              </label>
            )}

            {role === 'patient' && (
              <>
                <label className="space-y-1.5">
                  <span className="text-xs font-bold uppercase tracking-widest text-slate-400">Birthdate</span>
                  <input type="date" value={form.birthdate || ''} onChange={onChange('birthdate')} className="w-full rounded-2xl border border-slate-200 px-4 py-3 text-sm outline-none focus:border-sky-400" />
                </label>
                <label className="space-y-1.5">
                  <span className="text-xs font-bold uppercase tracking-widest text-slate-400">Email</span>
                  <input type="email" value={form.email || ''} onChange={onChange('email')} placeholder="Optional email address" className="w-full rounded-2xl border border-slate-200 px-4 py-3 text-sm outline-none focus:border-sky-400" />
                </label>
                <label className="space-y-1.5 md:col-span-2">
                  <span className="text-xs font-bold uppercase tracking-widest text-slate-400">Address</span>
                  <input value={form.address || ''} onChange={onChange('address')} className="w-full rounded-2xl border border-slate-200 px-4 py-3 text-sm outline-none focus:border-sky-400" />
                </label>
                <label className="space-y-1.5">
                  <span className="text-xs font-bold uppercase tracking-widest text-slate-400">Civil status</span>
                  <select value={form.civil_status || ''} onChange={onChange('civil_status')} className="w-full rounded-2xl border border-slate-200 px-4 py-3 text-sm outline-none focus:border-sky-400">
                    <option value="">Select civil status</option>
                    {CIVIL_STATUS_OPTIONS.map((option) => <option key={option} value={option}>{option}</option>)}
                  </select>
                </label>
                <label className="space-y-1.5">
                  <span className="text-xs font-bold uppercase tracking-widest text-slate-400">Gender</span>
                  <select value={form.gender || ''} onChange={onChange('gender')} className="w-full rounded-2xl border border-slate-200 px-4 py-3 text-sm outline-none focus:border-sky-400">
                    <option value="">Select gender</option>
                    {GENDER_OPTIONS.map((option) => <option key={option} value={option}>{option}</option>)}
                  </select>
                </label>
              </>
            )}
          </div>

          <button type="button" onClick={handleSave} disabled={saving} className="inline-flex items-center gap-2 rounded-2xl bg-[#0b1a2c] px-5 py-3 text-sm font-semibold text-white hover:bg-[#122236] disabled:opacity-50">
            <MdSave className="text-[18px]" />
            {saving ? 'Saving...' : 'Save Settings'}
          </button>
        </div>
      </div>

      <PasswordSecurityCard />

      <Modal
        open={phoneModalOpen}
        onClose={() => !phoneBusy && setPhoneModalOpen(false)}
        title="Change Mobile Number"
        description="Your mobile number is used for patient login and security codes, so the new number must be verified first."
        size="md"
      >
        <div className="space-y-4">
          {phoneStep === 'number' ? (
            <>
              <div>
                <label className="form-label">New Mobile Number</label>
                <PhilippinePhoneInput value={newPhone} onChange={(e) => setNewPhone(e.target.value)} />
                <p className="mt-2 text-xs text-slate-500">We will send a 6-digit verification code to this number.</p>
              </div>
              <button type="button" onClick={sendPhoneCode} disabled={phoneBusy} className="button-primary w-full justify-center">
                <MdVerifiedUser /> {phoneBusy ? 'Sending...' : 'Send Verification Code'}
              </button>
            </>
          ) : (
            <>
              <div>
                <label className="form-label">Verification Code</label>
                <input
                  value={phoneCode}
                  onChange={(e) => setPhoneCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
                  inputMode="numeric"
                  autoComplete="one-time-code"
                  maxLength={6}
                  placeholder="000000"
                  className="form-control text-center text-lg font-black tracking-[0.35em]"
                />
                <p className="mt-2 text-xs text-slate-500">Enter the code sent to your new mobile number.</p>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <button type="button" onClick={() => { setPhoneStep('number'); setPhoneCode(''); setPhoneMessage('') }} disabled={phoneBusy} className="button-secondary justify-center">Back</button>
                <button type="button" onClick={confirmPhoneCode} disabled={phoneBusy} className="button-primary justify-center">{phoneBusy ? 'Verifying...' : 'Verify & Change'}</button>
              </div>
            </>
          )}

          {phoneMessage && (
            <p className={`rounded-xl px-3 py-2 text-xs font-semibold ${phoneMessage.toLowerCase().includes('sent') ? 'bg-emerald-50 text-emerald-700' : 'bg-amber-50 text-amber-700'}`}>
              {phoneMessage}
            </p>
          )}
        </div>
      </Modal>
    </div>
  )
}

export default SettingsPage
