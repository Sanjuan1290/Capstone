import { useState } from 'react'
import { MdLock, MdMail, MdVisibility, MdVisibilityOff } from 'react-icons/md'
import { useAuth } from '../context/AuthContext'
import PasswordRequirements from './PasswordRequirements'
import { getPasswordValidationError, isPasswordValid } from '../utils/passwordPolicy'

const PasswordField = ({ label, value, onChange, autoComplete, preventPaste = false }) => {
  const [show, setShow] = useState(false)
  const stop = (e) => { if (preventPaste) e.preventDefault() }
  return <label className="space-y-1.5"><span className="form-label">{label}</span><div className="relative"><input type={show?'text':'password'} value={value} onChange={onChange} onPaste={stop} onDrop={stop} autoComplete={autoComplete} minLength={8} maxLength={128} className="form-control pr-11"/><button type="button" onClick={()=>setShow(v=>!v)} className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400" aria-label={show?'Hide password':'Show password'}>{show?<MdVisibilityOff/>:<MdVisibility/>}</button></div>{preventPaste&&<span className="text-[11px] text-slate-400">Paste is disabled for confirmation.</span>}</label>
}

const PasswordSecurityCard = ({ initialOpen = false }) => {
  const { role } = useAuth()
  const [step, setStep] = useState(initialOpen ? 'passwords' : 'idle')
  const [currentPassword, setCurrentPassword] = useState('')
  const [newPassword, setNewPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [code, setCode] = useState('')
  const [msg, setMsg] = useState('')
  const [busy, setBusy] = useState(false)

  const start = () => { setStep('passwords'); setMsg(''); setCode('') }
  const cancel = () => { setStep('idle'); setCurrentPassword(''); setNewPassword(''); setConfirm(''); setCode(''); setMsg('') }

  const request = async () => {
    const passwordError = getPasswordValidationError(newPassword)
    if (!currentPassword) return setMsg('Current password is required.')
    if (passwordError) return setMsg(passwordError)
    if (newPassword !== confirm) return setMsg('Passwords do not match.')
    setBusy(true); setMsg('')
    try {
      const response = await fetch(`/api/${role}/security/password/request-code`, {
        method: 'POST', credentials: 'include', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ current_password: currentPassword, new_password: newPassword }),
      })
      const data = await response.json()
      if (!response.ok) throw new Error(data.message || 'Could not send verification code.')
      setMsg(data.message || 'Verification code sent by email.')
      setStep('verify')
    } catch (error) { setMsg(error.message) }
    finally { setBusy(false) }
  }

  const change = async () => {
    if (code.length !== 6) return setMsg('Enter the 6-digit verification code.')
    setBusy(true); setMsg('')
    try {
      const response = await fetch(`/api/${role}/security/password/change`, {
        method: 'POST', credentials: 'include', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ code }),
      })
      const data = await response.json()
      if (!response.ok) throw new Error(data.message || 'Password change failed.')
      setMsg('Password changed successfully.')
      setStep('idle'); setCurrentPassword(''); setNewPassword(''); setConfirm(''); setCode('')
    } catch (error) { setMsg(error.message) }
    finally { setBusy(false) }
  }

  return <div id="change-password" className="rounded-3xl border border-slate-200 bg-white p-6">
    <div className="flex items-start justify-between gap-4"><div><h2 className="flex items-center gap-2 font-bold text-slate-900"><MdLock/> Account Security</h2><p className="mt-1 text-sm text-slate-500">Verify your current password first. A verification code is sent by email only after the new password is validated.</p></div><MdMail className="text-xl text-slate-400"/></div>
    {msg && <p className="mt-4 rounded-xl bg-slate-50 px-4 py-3 text-sm text-slate-600">{msg}</p>}
    {step==='idle' && <button onClick={start} className="button-secondary mt-5">Change Password</button>}
    {step==='passwords' && <div className="mt-5 grid gap-4"><PasswordField label="Current Password *" value={currentPassword} onChange={(e)=>{setCurrentPassword(e.target.value);setMsg('')}} autoComplete="current-password"/><PasswordField label="New Password *" value={newPassword} onChange={(e)=>{setNewPassword(e.target.value);setMsg('')}} autoComplete="new-password"/><PasswordRequirements password={newPassword}/><PasswordField label="Confirm New Password *" value={confirm} onChange={(e)=>{setConfirm(e.target.value);setMsg('')}} autoComplete="off" preventPaste/>{confirm&&newPassword!==confirm&&<p className="text-xs text-red-500">Passwords do not match.</p>}<div className="flex gap-2"><button onClick={cancel} className="button-secondary">Cancel</button><button onClick={request} disabled={busy||!currentPassword||!isPasswordValid(newPassword)||newPassword!==confirm} className="button-primary">{busy?'Checking...':'Continue & Send Code'}</button></div></div>}
    {step==='verify' && <div className="mt-5 grid gap-4"><div><label className="form-label">Email Verification Code *</label><input value={code} onChange={(e)=>setCode(e.target.value.replace(/\D/g,'').slice(0,6))} inputMode="numeric" maxLength={6} autoComplete="one-time-code" className="form-control text-center text-lg font-black tracking-[.35em]" placeholder="000000"/></div><div className="flex gap-2"><button onClick={()=>setStep('passwords')} disabled={busy} className="button-secondary">Back</button><button onClick={change} disabled={busy||code.length!==6} className="button-primary">{busy?'Changing...':'Verify & Change Password'}</button></div></div>}
  </div>
}

export default PasswordSecurityCard

