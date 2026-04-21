import { useEffect, useState } from 'react'
import { MdCloudUpload, MdDarkMode, MdLightMode, MdSave } from 'react-icons/md'
import { getSettings, updateSettings, uploadToCloudinary } from '../../services/portal.service'
import { useAuth } from '../../context/AuthContext'
import { useTheme } from '../../context/ThemeContext'
import ProfileAvatar from '../../components/ProfileAvatar'

const SettingsPage = () => {
  const { role, setUser } = useAuth()
  const { theme, setTheme } = useTheme()
  const [form, setForm] = useState(null)
  const [saving, setSaving] = useState(false)
  const [uploading, setUploading] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    if (!role) return
    let ignore = false
    setError('')
    setForm(null)
    getSettings(role).then(data => {
      if (ignore) return
      setForm(data)
      if (data?.theme_preference) setTheme(data.theme_preference)
    }).catch((err) => {
      if (ignore) return
      setError(err.message || 'Failed to load settings.')
    })
    return () => {
      ignore = true
    }
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

  const onChange = (key) => (e) => setForm(prev => ({ ...prev, [key]: e.target.value }))

  const handleUpload = async (e) => {
    const file = e.target.files?.[0]
    if (!file) return
    setUploading(true)
    try {
      const url = await uploadToCloudinary(file)
      setForm(prev => ({ ...prev, profile_image_url: url }))
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
      const payload = { ...form, theme_preference: theme }
      const saved = await updateSettings(role, payload)
      setForm(saved)
      setTheme(saved.theme_preference || theme)
      setUser(prev => prev ? { ...prev, ...saved, role } : prev)
      setError('')
      alert('Settings saved.')
    } catch (err) {
      setError(err.message)
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="max-w-4xl space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-slate-800">Settings</h1>
        <p className="text-sm text-slate-500 mt-1">Update your profile, profile image, and interface theme.</p>
      </div>

      {error && (
        <div className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-600">
          {error}
        </div>
      )}

      <div className="grid lg:grid-cols-[280px_1fr] gap-6">
        <div className="bg-white border border-slate-200 rounded-3xl p-6 space-y-4">
          <div className="flex flex-col items-center text-center gap-3">
            <ProfileAvatar user={form} size="lg" />
            <div>
              <p className="text-lg font-bold text-slate-800">{form.full_name}</p>
              <p className="text-sm text-slate-500">{form.email}</p>
            </div>
          </div>

          <label className="flex items-center justify-center gap-2 px-4 py-3 rounded-2xl border border-dashed border-slate-300 text-sm font-semibold text-slate-600 hover:bg-slate-50 cursor-pointer">
            <MdCloudUpload className="text-[18px]" />
            {uploading ? 'Uploading...' : 'Upload Profile Photo'}
            <input type="file" accept="image/*" className="hidden" onChange={handleUpload} />
          </label>

          <div className="rounded-2xl bg-slate-50 p-4 space-y-2">
            <p className="text-xs font-bold uppercase tracking-widest text-slate-400">Theme</p>
            <div className="grid grid-cols-2 gap-2">
              <button onClick={() => setTheme('light')} className={`px-3 py-3 rounded-2xl border text-sm font-semibold ${theme === 'light' ? 'border-amber-300 bg-amber-50 text-amber-700' : 'border-slate-200 text-slate-600'}`}>
                <MdLightMode className="mx-auto text-[18px] mb-1" /> Light
              </button>
              <button onClick={() => setTheme('dark')} className={`px-3 py-3 rounded-2xl border text-sm font-semibold ${theme === 'dark' ? 'border-slate-700 bg-slate-900 text-white' : 'border-slate-200 text-slate-600'}`}>
                <MdDarkMode className="mx-auto text-[18px] mb-1" /> Dark
              </button>
            </div>
          </div>
        </div>

        <div className="bg-white border border-slate-200 rounded-3xl p-6 space-y-4">
          <div className="grid md:grid-cols-2 gap-4">
            <label className="space-y-1.5">
              <span className="text-xs font-bold uppercase tracking-widest text-slate-400">Full name</span>
              <input value={form.full_name || ''} onChange={onChange('full_name')} className="w-full rounded-2xl border border-slate-200 px-4 py-3 text-sm outline-none focus:border-sky-400" />
            </label>
            {'phone' in form && (
              <label className="space-y-1.5">
                <span className="text-xs font-bold uppercase tracking-widest text-slate-400">Phone</span>
                <input value={form.phone || ''} onChange={onChange('phone')} className="w-full rounded-2xl border border-slate-200 px-4 py-3 text-sm outline-none focus:border-sky-400" />
              </label>
            )}
            {role === 'doctor' && (
              <label className="space-y-1.5 md:col-span-2">
                <span className="text-xs font-bold uppercase tracking-widest text-slate-400">Specialty</span>
                <input value={form.specialty || ''} onChange={onChange('specialty')} className="w-full rounded-2xl border border-slate-200 px-4 py-3 text-sm outline-none focus:border-sky-400" />
              </label>
            )}
            {role === 'patient' && (
              <>
                <label className="space-y-1.5 md:col-span-2">
                  <span className="text-xs font-bold uppercase tracking-widest text-slate-400">Address</span>
                  <input value={form.address || ''} onChange={onChange('address')} className="w-full rounded-2xl border border-slate-200 px-4 py-3 text-sm outline-none focus:border-sky-400" />
                </label>
                <label className="space-y-1.5">
                  <span className="text-xs font-bold uppercase tracking-widest text-slate-400">Civil status</span>
                  <input value={form.civil_status || ''} onChange={onChange('civil_status')} className="w-full rounded-2xl border border-slate-200 px-4 py-3 text-sm outline-none focus:border-sky-400" />
                </label>
                <label className="space-y-1.5">
                  <span className="text-xs font-bold uppercase tracking-widest text-slate-400">Sex</span>
                  <input value={form.sex || ''} onChange={onChange('sex')} className="w-full rounded-2xl border border-slate-200 px-4 py-3 text-sm outline-none focus:border-sky-400" />
                </label>
              </>
            )}
          </div>

          <button onClick={handleSave} disabled={saving} className="inline-flex items-center gap-2 px-5 py-3 rounded-2xl bg-[#0b1a2c] text-white text-sm font-semibold hover:bg-[#122236] disabled:opacity-50">
            <MdSave className="text-[18px]" />
            {saving ? 'Saving...' : 'Save Settings'}
          </button>
        </div>
      </div>
    </div>
  )
}

export default SettingsPage
