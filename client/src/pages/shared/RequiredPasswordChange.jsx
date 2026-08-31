import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { MdLock, MdVisibility, MdVisibilityOff, MdCheckCircle } from 'react-icons/md'
import { useAuth } from '../../context/AuthContext'

const RequiredPasswordChange = () => {
  const { role, ready, checkAuth } = useAuth()
  const navigate = useNavigate()
  const [form, setForm] = useState({ password: '', confirm: '' })
  const [show, setShow] = useState(false)
  const [error, setError] = useState('')
  const [saving, setSaving] = useState(false)
  const valid = form.password.length >= 8 && /[A-Z]/.test(form.password) && /[a-z]/.test(form.password) && /\d/.test(form.password) && form.password === form.confirm
  if (!ready) return <div className="min-h-screen flex items-center justify-center text-sm text-slate-500">Checking account...</div>
  if (!role) return <div className="min-h-screen flex items-center justify-center text-sm text-slate-500">Please sign in again.</div>
  const submit = async (e) => {
    e.preventDefault(); setError('')
    if (!valid) return setError('Use at least 8 characters with uppercase, lowercase, a number, and matching confirmation.')
    setSaving(true)
    try {
      const res = await fetch(`/api/${role}/security/password/required`, { method: 'POST', credentials: 'include', headers: {'Content-Type':'application/json'}, body: JSON.stringify({ new_password: form.password }) })
      const data = await res.json(); if (!res.ok) throw new Error(data.message || 'Password update failed.')
      await checkAuth(); navigate(`/${role}`, { replace: true })
    } catch (err) { setError(err.message) } finally { setSaving(false) }
  }
  return <div className="min-h-screen bg-slate-50 flex items-center justify-center p-4">
    <form onSubmit={submit} className="w-full max-w-md rounded-3xl border border-slate-200 bg-white p-7 shadow-xl">
      <div className="mx-auto mb-5 flex h-14 w-14 items-center justify-center rounded-2xl bg-sky-50 text-sky-600"><MdLock className="text-2xl" /></div>
      <h1 className="text-center text-2xl font-black text-slate-900">Create Your Password</h1>
      <p className="mt-2 text-center text-sm leading-6 text-slate-500">You signed in with a temporary password. Create your own password before continuing to the portal.</p>
      {error && <div className="mt-5 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-600">{error}</div>}
      <div className="mt-6 space-y-4">
        {['password','confirm'].map((key) => <label key={key} className="block space-y-1.5"><span className="text-xs font-bold uppercase tracking-widest text-slate-400">{key==='password'?'New Password':'Confirm New Password'}</span><div className="relative"><input type={show?'text':'password'} value={form[key]} onChange={e=>setForm(p=>({...p,[key]:e.target.value}))} className="w-full rounded-2xl border border-slate-200 px-4 py-3 pr-12 outline-none focus:border-sky-400" /><button type="button" onClick={()=>setShow(v=>!v)} className="absolute right-4 top-1/2 -translate-y-1/2 text-slate-400">{show?<MdVisibilityOff/>:<MdVisibility/>}</button></div></label>)}
      </div>
      <div className="mt-4 rounded-2xl bg-slate-50 p-4 text-xs text-slate-500"><p className="font-bold text-slate-700">Password requirements</p><p className="mt-2 flex items-center gap-2"><MdCheckCircle className={form.password.length>=8?'text-emerald-500':'text-slate-300'}/>At least 8 characters</p><p className="mt-1">Uppercase + lowercase + number</p></div>
      <button disabled={!valid||saving} className="mt-6 w-full rounded-2xl bg-[#0b1a2c] py-3.5 text-sm font-bold text-white disabled:opacity-40">{saving?'Saving...':'Set New Password'}</button>
    </form>
  </div>
}
export default RequiredPasswordChange
