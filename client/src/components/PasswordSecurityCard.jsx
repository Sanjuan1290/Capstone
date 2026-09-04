import { useState } from 'react'
import { MdLock, MdMail, MdSms } from 'react-icons/md'
import { useAuth } from '../context/AuthContext'
import PasswordRequirements from './PasswordRequirements'
import { getPasswordValidationError, isPasswordValid } from '../utils/passwordPolicy'

const PasswordSecurityCard = () => {
  const { role } = useAuth()
  const [step, setStep] = useState(0)
  const [code, setCode] = useState('')
  const [pw, setPw] = useState('')
  const [confirm, setConfirm] = useState('')
  const [msg, setMsg] = useState('')
  const [busy, setBusy] = useState(false)

  const request = async () => {
    setBusy(true)
    setMsg('')
    try {
      const response = await fetch(`/api/${role}/security/password/request-code`, {
        method: 'POST',
        credentials: 'include',
      })
      const data = await response.json()
      if (!response.ok) throw new Error(data.message)
      setMsg(data.message)
      setStep(1)
    } catch (error) {
      setMsg(error.message)
    } finally {
      setBusy(false)
    }
  }

  const change = async () => {
    const passwordError = getPasswordValidationError(pw)
    if (passwordError) return setMsg(passwordError)
    if (pw !== confirm) return setMsg('Passwords do not match.')

    setBusy(true)
    setMsg('')
    try {
      const response = await fetch(`/api/${role}/security/password/change`, {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ code, new_password: pw }),
      })
      const data = await response.json()
      if (!response.ok) throw new Error(data.message)
      setMsg('Password changed successfully.')
      setStep(0)
      setCode('')
      setPw('')
      setConfirm('')
    } catch (error) {
      setMsg(error.message)
    } finally {
      setBusy(false)
    }
  }

  const cancel = () => {
    setStep(0)
    setCode('')
    setPw('')
    setConfirm('')
    setMsg('')
  }

  const canChange = code.length === 6 && isPasswordValid(pw) && pw === confirm && !busy

  return (
    <div className="rounded-3xl border border-slate-200 bg-white p-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h2 className="flex items-center gap-2 font-bold text-slate-900"><MdLock /> Account Security</h2>
          <p className="mt-1 text-sm text-slate-500">Change your password using a one-time verification code.</p>
        </div>
        {role === 'patient' ? <MdSms className="text-xl text-slate-400" /> : <MdMail className="text-xl text-slate-400" />}
      </div>

      {msg && <p className="mt-4 rounded-xl bg-slate-50 px-4 py-3 text-sm text-slate-600">{msg}</p>}

      {step === 0 ? (
        <button onClick={request} disabled={busy} className="mt-5 rounded-2xl border border-slate-200 px-5 py-3 text-sm font-bold text-slate-700 hover:bg-slate-50">
          {busy ? 'Sending...' : 'Change Password'}
        </button>
      ) : (
        <div className="mt-5 grid gap-3">
          <input
            value={code}
            onChange={(event) => setCode(event.target.value.replace(/\D/g, '').slice(0, 6))}
            inputMode="numeric"
            maxLength={6}
            placeholder="6-digit verification code"
            className="rounded-2xl border border-slate-200 px-4 py-3 text-sm outline-none focus:border-sky-400"
          />
          <input
            type="password"
            value={pw}
            onChange={(event) => { setPw(event.target.value); setMsg('') }}
            minLength={8}
            maxLength={128}
            placeholder="New password"
            className="rounded-2xl border border-slate-200 px-4 py-3 text-sm outline-none focus:border-sky-400"
          />
          <PasswordRequirements password={pw} />
          <input
            type="password"
            value={confirm}
            onChange={(event) => { setConfirm(event.target.value); setMsg('') }}
            minLength={8}
            maxLength={128}
            placeholder="Confirm new password"
            className="rounded-2xl border border-slate-200 px-4 py-3 text-sm outline-none focus:border-sky-400"
          />
          {confirm && pw !== confirm && <p className="text-xs text-red-500">Passwords do not match.</p>}
          <div className="flex flex-col-reverse gap-2 sm:flex-row">
            <button onClick={cancel} className="rounded-xl border border-slate-200 px-4 py-2 text-sm">Cancel</button>
            <button onClick={change} disabled={!canChange} className="rounded-xl bg-[#0b1a2c] px-4 py-2 text-sm font-bold text-white disabled:opacity-40">
              {busy ? 'Saving...' : 'Verify & Change'}
            </button>
          </div>
        </div>
      )}
    </div>
  )
}

export default PasswordSecurityCard
