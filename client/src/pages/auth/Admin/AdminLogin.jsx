// client/src/pages/auth/Admin/AdminLogin.jsx
// REDESIGNED: Dark gradient, amber accent, mobile-first

import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import logo from '../../../assets/logo-removebg.png'
import { MdEmail, MdLock, MdVisibility, MdVisibilityOff, MdArrowForward, MdAdminPanelSettings } from 'react-icons/md'
import { useAuth } from '../../../context/AuthContext'

const AdminLogin = () => {
  const [form,     setForm]     = useState({ email: '', password: '' })
  const [showPass, setShowPass] = useState(false)
  const [loading,  setLoading]  = useState(false)
  const [error,    setError]    = useState('')
  const navigate  = useNavigate()
  const { login } = useAuth()

  const handleSubmit = async e => {
    e.preventDefault()
    setError(''); setLoading(true)
    try {
      const res  = await fetch('/api/admin/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify(form),
      })
      const data = await res.json()
      if (!res.ok) { setError(data.message || 'Login failed'); return }
      login(data.user, 'admin')
      navigate('/admin')
    } catch {
      setError('Cannot connect to server.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-[#0b1a2c] via-[#1a1000] to-[#0b1a2c]
      flex items-center justify-center p-4">

      <div className="fixed top-0 right-0 w-96 h-96 bg-amber-500/8 rounded-full blur-3xl pointer-events-none" />
      <div className="fixed bottom-0 left-0 w-72 h-72 bg-amber-400/5 rounded-full blur-3xl pointer-events-none" />

      <div className="w-full max-w-sm relative">

        {/* Brand */}
        <div className="flex flex-col items-center mb-8">
          <div className="w-16 h-16 rounded-2xl bg-white/10 border border-white/10 flex items-center justify-center mb-4
            shadow-[0_8px_32px_rgba(251,191,36,0.15)]">
            <img src={logo} alt="Carait Clinic" className="w-12 h-12 object-contain" />
          </div>
          <h1 className="text-white text-2xl font-black tracking-tight">Carait Clinic</h1>
          <div className="flex items-center gap-1.5 mt-1.5">
            <MdAdminPanelSettings className="text-amber-400 text-[14px]" />
            <p className="text-amber-400 text-xs font-semibold uppercase tracking-widest">Admin Portal</p>
          </div>
        </div>

        {/* Card */}
        <div className="bg-white rounded-3xl shadow-2xl overflow-hidden">
          <div className="bg-gradient-to-r from-amber-500 to-amber-600 px-6 py-5">
            <h2 className="text-white font-bold text-lg">Administrator Sign In</h2>
            <p className="text-amber-100 text-sm mt-0.5">Full clinic management access</p>
          </div>

          <form onSubmit={handleSubmit} className="px-6 py-6 space-y-4">
            {error && (
              <div className="bg-red-50 border border-red-200 text-red-600 text-sm rounded-xl px-4 py-3">{error}</div>
            )}

            <div className="space-y-1.5">
              <label className="text-[11px] font-bold text-slate-500 uppercase tracking-widest">Email</label>
              <div className="relative">
                <MdEmail className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400 text-[18px]" />
                <input required type="email" value={form.email}
                  onChange={e => { setForm(f => ({ ...f, email: e.target.value })); setError('') }}
                  placeholder="admin@carait.com" autoComplete="email"
                  className="w-full pl-10 pr-4 py-3 bg-slate-50 border-2 border-slate-200 rounded-xl text-sm
                    focus:outline-none focus:border-amber-400 focus:bg-white focus:ring-2 focus:ring-amber-400/10
                    transition-all placeholder-slate-300" />
              </div>
            </div>

            <div className="space-y-1.5">
              <label className="text-[11px] font-bold text-slate-500 uppercase tracking-widest">Password</label>
              <div className="relative">
                <MdLock className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400 text-[18px]" />
                <input required type={showPass ? 'text' : 'password'} value={form.password}
                  onChange={e => { setForm(f => ({ ...f, password: e.target.value })); setError('') }}
                  placeholder="••••••••" autoComplete="current-password"
                  className="w-full pl-10 pr-12 py-3 bg-slate-50 border-2 border-slate-200 rounded-xl text-sm
                    focus:outline-none focus:border-amber-400 focus:bg-white focus:ring-2 focus:ring-amber-400/10
                    transition-all placeholder-slate-300" />
                <button type="button" onClick={() => setShowPass(s => !s)}
                  className="absolute right-3.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600">
                  {showPass ? <MdVisibilityOff className="text-[18px]" /> : <MdVisibility className="text-[18px]" />}
                </button>
              </div>
            </div>

            <button type="submit" disabled={loading}
              className="w-full flex items-center justify-center gap-2 py-3.5 bg-amber-500 hover:bg-amber-600
                text-white font-bold text-sm rounded-xl transition-colors disabled:opacity-60
                shadow-lg shadow-amber-500/25">
              {loading
                ? <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                : <>Sign In <MdArrowForward className="text-[16px]" /></>}
            </button>
          </form>
        </div>
      </div>
    </div>
  )
}

export default AdminLogin