import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { MdLock, MdVisibility, MdVisibilityOff } from 'react-icons/md'
import { useAuth } from '../../context/AuthContext'
import PasswordRequirements from '../../components/PasswordRequirements'
import { getPasswordValidationError, isPasswordValid } from '../../utils/passwordPolicy'

const PasswordField = ({
  label,
  value,
  onChange,
  show,
  onToggle,
  confirm = false,
}) => {
  const preventPaste = (event) => event.preventDefault()

  return (
    <label className="block space-y-1.5">
      <span className="text-xs font-bold uppercase tracking-widest text-slate-400">{label}</span>
      <div className="relative">
        <input
          type={show ? 'text' : 'password'}
          value={value}
          onChange={onChange}
          onPaste={confirm ? preventPaste : undefined}
          onDrop={confirm ? preventPaste : undefined}
          minLength={8}
          maxLength={128}
          autoComplete={confirm ? 'off' : 'new-password'}
          className="form-control pr-11"
        />
        <button
          type="button"
          onClick={onToggle}
          className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400"
          aria-label={show ? 'Hide password' : 'Show password'}
        >
          {show ? <MdVisibilityOff /> : <MdVisibility />}
        </button>
      </div>
      {confirm && (
        <span className="text-[11px] text-slate-400">Paste is disabled for confirmation.</span>
      )}
    </label>
  )
}

const RequiredPasswordChange = () => {
  const { role, ready, checkAuth } = useAuth()
  const navigate = useNavigate()
  const [form, setForm] = useState({ password: '', confirm: '' })
  const [showPassword, setShowPassword] = useState(false)
  const [showConfirm, setShowConfirm] = useState(false)
  const [error, setError] = useState('')
  const [saving, setSaving] = useState(false)
  const valid = isPasswordValid(form.password) && form.password === form.confirm

  if (!ready) return <div className="min-h-screen flex items-center justify-center text-sm text-slate-500">Checking account...</div>
  if (!role) return <div className="min-h-screen flex items-center justify-center text-sm text-slate-500">Please sign in again.</div>

  const submit = async (e) => {
    e.preventDefault()
    setError('')
    const passwordError = getPasswordValidationError(form.password)
    if (passwordError) return setError(passwordError)
    if (form.password !== form.confirm) return setError('Passwords do not match.')

    setSaving(true)
    try {
      const res = await fetch(`/api/${role}/security/password/required`, {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ new_password: form.password }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.message || 'Password update failed.')
      await checkAuth()
      navigate(`/${role}`, { replace: true })
    } catch (err) {
      setError(err.message)
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="min-h-screen bg-slate-50 flex items-center justify-center p-4">
      <form onSubmit={submit} className="w-full max-w-md rounded-3xl border border-slate-200 bg-white p-7 shadow-xl">
        <div className="mx-auto mb-5 flex h-14 w-14 items-center justify-center rounded-2xl bg-sky-50 text-sky-600">
          <MdLock className="text-2xl" />
        </div>
        <h1 className="text-center text-2xl font-black text-slate-900">Create Your Password</h1>
        <p className="mt-2 text-center text-sm leading-6 text-slate-500">
          You signed in with a temporary password. Create your own password before continuing.
        </p>

        {error && (
          <div className="mt-5 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-600">
            {error}
          </div>
        )}

        <div className="mt-6 space-y-4">
          <PasswordField
            label="New Password"
            value={form.password}
            onChange={(e) => setForm((current) => ({ ...current, password: e.target.value }))}
            show={showPassword}
            onToggle={() => setShowPassword((value) => !value)}
          />
          <PasswordField
            label="Confirm New Password"
            value={form.confirm}
            onChange={(e) => setForm((current) => ({ ...current, confirm: e.target.value }))}
            show={showConfirm}
            onToggle={() => setShowConfirm((value) => !value)}
            confirm
          />
          <PasswordRequirements password={form.password} />
        </div>

        <button
          type="submit"
          disabled={!valid || saving}
          className="button-primary mt-6 w-full justify-center"
        >
          {saving ? 'Saving...' : 'Create Password'}
        </button>
      </form>
    </div>
  )
}

export default RequiredPasswordChange
