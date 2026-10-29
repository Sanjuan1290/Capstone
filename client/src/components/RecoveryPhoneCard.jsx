import { useState } from 'react'

// A clinic number becomes a password recovery channel only after its owner
// verifies it. Existing phone fields must never be treated as verified.
export default function RecoveryPhoneCard({ role, phone, verified, onVerified }) {
  const [step, setStep] = useState('idle')
  const [password, setPassword] = useState('')
  const [code, setCode] = useState('')
  const [message, setMessage] = useState('')
  const [busy, setBusy] = useState(false)
  const apiRole = role === 'superadmin' ? 'admin' : role
  const headers = { 'Content-Type': 'application/json', ...(role === 'superadmin' ? { 'X-Admin-Portal': 'superadmin' } : {}) }
  const call = async (part, data) => {
    const response = await fetch(`/api/${apiRole}/security/recovery-phone/${part}`, { method: 'POST', credentials: 'include', headers, body: JSON.stringify(data) })
    const result = await response.json()
    if (!response.ok) throw new Error(result.message || 'Could not verify your mobile number.')
    return result
  }
  if (!['admin','superadmin','doctor','staff'].includes(role)) return null
  const request = async () => {
    setBusy(true); setMessage('')
    try { const result = await call('request', { current_password: password }); setMessage(result.message); setStep('code'); setPassword('') }
    catch (err) { setMessage(err.message) }
    finally { setBusy(false) }
  }
  const verify = async () => {
    setBusy(true); setMessage('')
    try { const result = await call('verify', { code }); setMessage(result.message); setStep('idle'); setCode(''); onVerified?.() }
    catch (err) { setMessage(err.message) }
    finally { setBusy(false) }
  }
  return <section className="rounded-3xl border border-slate-200 bg-white p-6">
    <h2 className="font-bold text-slate-900">Mobile Password Recovery</h2>
    <p className="mt-1 text-sm text-slate-600">Registered number: {phone || 'No mobile number saved'}.</p>
    <p className="mt-1 text-xs text-slate-500">{verified ? 'Your mobile number is verified and can be used to reset your password.' : 'Verify your number to receive a reset code by SMS if you forget your password.'}</p>
    {message && <p role="status" className="mt-3 rounded-xl bg-slate-50 p-3 text-sm">{message}</p>}
    {!verified && phone && step === 'idle' && <button type="button" className="button-secondary mt-3" onClick={() => setStep('password')}>Verify Mobile Number</button>}
    {!verified && step === 'password' && <div className="mt-3 space-y-3"><label className="block"><span className="form-label">Current Password</span><input type="password" className="form-control mt-1" value={password} onChange={e => setPassword(e.target.value)} autoComplete="current-password" /></label><div className="flex gap-2"><button type="button" className="button-secondary" onClick={() => setStep('idle')}>Cancel</button><button type="button" className="button-primary" disabled={busy || !password} onClick={request}>{busy ? 'Sending…' : 'Send Code'}</button></div></div>}
    {!verified && step === 'code' && <div className="mt-3 space-y-3"><label className="block"><span className="form-label">6-Digit SMS Code</span><input className="form-control mt-1" inputMode="numeric" value={code} maxLength={6} onChange={e => setCode(e.target.value.replace(/\D/g,'').slice(0,6))} /></label><div className="flex gap-2"><button type="button" className="button-secondary" onClick={() => setStep('idle')}>Cancel</button><button type="button" className="button-primary" disabled={busy || code.length !== 6} onClick={verify}>{busy ? 'Checking…' : 'Verify Number'}</button></div></div>}
  </section>
}
