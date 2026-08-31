import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { MdEmail, MdLock, MdVisibility, MdVisibilityOff, MdArrowForward, MdAdminPanelSettings, MdVerifiedUser } from 'react-icons/md'
import { useAuth } from '../../../context/AuthContext'

const AdminLogin = () => {
  const [form, setForm] = useState({ email: '', password: '' })
  const [code, setCode] = useState('')
  const [mfaRequired, setMfaRequired] = useState(false)
  const [showPass, setShowPass] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const navigate = useNavigate()
  const { login } = useAuth()

  const handleSubmit = async (event) => {
    event.preventDefault(); setError(''); setLoading(true)
    try {
      const endpoint = mfaRequired ? '/api/admin/login/mfa' : '/api/admin/login'
      const body = mfaRequired ? { code } : form
      const res = await fetch(endpoint, { method:'POST', headers:{'Content-Type':'application/json'}, credentials:'include', body:JSON.stringify(body) })
      const data = await res.json()
      if (!res.ok) { setError(data.message || 'Sign in failed.'); return }
      if (data.mfa_required) { setMfaRequired(true); setCode(''); return }
      login(data.user, 'admin'); navigate('/admin')
    } catch { setError('Cannot connect to server.') } finally { setLoading(false) }
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-[#0b1a2c] via-[#1a1000] to-[#0b1a2c] flex items-center justify-center p-4">
      <div className="w-full max-w-sm">
        <div className="mb-8 flex flex-col items-center">
          <div className="mb-4 flex h-16 w-16 items-center justify-center rounded-2xl border border-white/10 bg-white/10"><img src="/logo.png" alt="Carait Clinic" className="h-12 w-12 object-contain" /></div>
          <h1 className="text-2xl font-black text-white">Carait Clinic</h1>
          <div className="mt-1.5 flex items-center gap-1.5"><MdAdminPanelSettings className="text-amber-400"/><p className="text-xs font-semibold uppercase tracking-widest text-amber-400">Admin Portal</p></div>
        </div>
        <div className="overflow-hidden rounded-3xl bg-white shadow-2xl">
          <div className="bg-gradient-to-r from-amber-500 to-amber-600 px-6 py-5">
            <h2 className="text-lg font-bold text-white">{mfaRequired ? 'Verify Administrator Sign In' : 'Administrator Sign In'}</h2>
            <p className="mt-0.5 text-sm text-amber-100">{mfaRequired ? 'Enter the security code sent to your administrator email.' : 'Full clinic management access'}</p>
          </div>
          <form onSubmit={handleSubmit} className="space-y-4 px-6 py-6">
            {error && <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-600">{error}</div>}
            {!mfaRequired ? <>
              <label className="block space-y-1.5"><span className="text-[11px] font-bold uppercase tracking-widest text-slate-500">Email</span><div className="relative"><MdEmail className="absolute left-3.5 top-1/2 -translate-y-1/2 text-[18px] text-slate-400"/><input required type="email" value={form.email} onChange={e=>setForm(f=>({...f,email:e.target.value}))} autoComplete="email" className="w-full rounded-xl border-2 border-slate-200 bg-slate-50 py-3 pl-10 pr-4 text-sm outline-none focus:border-amber-400"/></div></label>
              <label className="block space-y-1.5"><span className="text-[11px] font-bold uppercase tracking-widest text-slate-500">Password</span><div className="relative"><MdLock className="absolute left-3.5 top-1/2 -translate-y-1/2 text-[18px] text-slate-400"/><input required type={showPass?'text':'password'} value={form.password} onChange={e=>setForm(f=>({...f,password:e.target.value}))} autoComplete="current-password" className="w-full rounded-xl border-2 border-slate-200 bg-slate-50 py-3 pl-10 pr-12 text-sm outline-none focus:border-amber-400"/><button type="button" onClick={()=>setShowPass(v=>!v)} className="absolute right-3.5 top-1/2 -translate-y-1/2 text-slate-400">{showPass?<MdVisibilityOff/>:<MdVisibility/>}</button></div></label>
            </> : <label className="block space-y-1.5"><span className="text-[11px] font-bold uppercase tracking-widest text-slate-500">6-digit security code</span><div className="relative"><MdVerifiedUser className="absolute left-3.5 top-1/2 -translate-y-1/2 text-[18px] text-amber-500"/><input required inputMode="numeric" maxLength={6} value={code} onChange={e=>setCode(e.target.value.replace(/\D/g,'').slice(0,6))} autoFocus className="w-full rounded-xl border-2 border-slate-200 bg-slate-50 py-3 pl-10 pr-4 text-center text-lg font-black tracking-[0.35em] outline-none focus:border-amber-400"/></div></label>}
            <button disabled={loading || (mfaRequired && code.length!==6)} className="flex w-full items-center justify-center gap-2 rounded-xl bg-amber-500 py-3.5 text-sm font-bold text-white shadow-lg shadow-amber-500/25 hover:bg-amber-600 disabled:opacity-60">{loading?'Please wait…':mfaRequired?'Verify & Sign In':'Sign In'} <MdArrowForward/></button>
            {mfaRequired && <button type="button" onClick={()=>{setMfaRequired(false);setCode('');setError('')}} className="w-full text-sm font-semibold text-slate-500">Back to password</button>}
          </form>
        </div>
      </div>
    </div>
  )
}
export default AdminLogin
