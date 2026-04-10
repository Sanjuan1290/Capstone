// client/src/pages/auth/Staff/StaffLogin.jsx
// REDESIGNED: Dark gradient, sky accent, mobile-first

import { useState } from 'react'
import { NavLink, useNavigate } from 'react-router-dom'
import logo from '../../../assets/logo-removebg.png'
import {
  MdEmail, MdLock, MdVisibility, MdVisibilityOff,
  MdArrowForward, MdSupportAgent,
} from 'react-icons/md'
import { useAuth } from '../../../context/AuthContext'

const StaffLogin = () => {
  const [form,     setForm]     = useState({ email: '', password: '' })
  const [showPass, setShowPass] = useState(false)
  const [error,    setError]    = useState('')
  const [loading,  setLoading]  = useState(false)
  const navigate  = useNavigate()
  const { login } = useAuth()

  const handleChange = e => {
    const { name, value } = e.target
    setForm(p => ({ ...p, [name]: value }))
    setError('')
  }

  const handleSubmit = async e => {
    e.preventDefault()
    setError(''); setLoading(true)
    try {
      const res  = await fetch('/api/staff/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify(form),
      })
      const data = await res.json()
      if (!res.ok) { setError(data.message || 'Login failed'); return }
      login(data.user, 'staff')
      navigate('/staff')
    } catch {
      setError('Cannot connect to server.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-[#0b1a2c] via-[#0a2040] to-[#0b1a2c]
      flex items-center justify-center p-4">

      <div className="fixed top-0 right-0 w-96 h-96 bg-sky-500/8 rounded-full blur-3xl pointer-events-none" />
      <div className="fixed bottom-0 left-0 w-72 h-72 bg-sky-400/5 rounded-full blur-3xl pointer-events-none" />

      <div className="w-full max-w-sm relative">

        {/* Brand */}
        <div className="flex flex-col items-center mb-8">
          <div className="w-16 h-16 rounded-2xl bg-white/10 border border-white/10 flex items-center justify-center mb-4
            shadow-[0_8px_32px_rgba(14,165,233,0.15)]">
            <img src={logo} alt="Carait Clinic" className="w-12 h-12 object-contain" />
          </div>
          <h1 className="text-white text-2xl font-black tracking-tight">Carait Clinic</h1>
          <div className="flex items-center gap-1.5 mt-1.5">
            <MdSupportAgent className="text-sky-400 text-[13px]" />
            <p className="text-sky-400 text-xs font-semibold uppercase tracking-widest">Staff Portal</p>
          </div>
        </div>

        {/* Card */}
        <div className="bg-white rounded-3xl shadow-2xl overflow-hidden">

          {/* Card header */}
          <div className="bg-gradient-to-r from-sky-500 to-sky-600 px-6 py-5">
            <h2 className="text-white font-bold text-lg">Staff Sign In</h2>
            <p className="text-sky-100 text-sm mt-0.5">Access your clinic management tools</p>
          </div>

          {/* Form */}
          <form onSubmit={handleSubmit} className="px-6 py-6 space-y-4">

            {error && (
              <div className="bg-red-50 border border-red-200 text-red-600 text-sm rounded-xl px-4 py-3">
                {error}
              </div>
            )}

            {/* Email */}
            <div className="space-y-1.5">
              <label className="text-[11px] font-bold text-slate-500 uppercase tracking-widest">Email</label>
              <div className="relative">
                <MdEmail className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400 text-[18px]" />
                <input required type="email" name="email" value={form.email} onChange={handleChange}
                  placeholder="staff@carait.com" autoComplete="email"
                  className="w-full pl-10 pr-4 py-3 bg-slate-50 border-2 border-slate-200 rounded-xl text-sm
                    focus:outline-none focus:border-sky-400 focus:bg-white focus:ring-2 focus:ring-sky-400/10
                    transition-all placeholder-slate-300" />
              </div>
            </div>

            {/* Password */}
            <div className="space-y-1.5">
              <div className="flex justify-between items-center">
                <label className="text-[11px] font-bold text-slate-500 uppercase tracking-widest">Password</label>
                <NavLink to="/staff/forgot-password"
                  className="text-xs text-sky-600 hover:text-sky-700 font-semibold">
                  Forgot password?
                </NavLink>
              </div>
              <div className="relative">
                <MdLock className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400 text-[18px]" />
                <input required type={showPass ? 'text' : 'password'}
                  name="password" value={form.password} onChange={handleChange}
                  placeholder="••••••••" autoComplete="current-password"
                  className="w-full pl-10 pr-12 py-3 bg-slate-50 border-2 border-slate-200 rounded-xl text-sm
                    focus:outline-none focus:border-sky-400 focus:bg-white focus:ring-2 focus:ring-sky-400/10
                    transition-all placeholder-slate-300" />
                <button type="button" onClick={() => setShowPass(s => !s)}
                  className="absolute right-3.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600">
                  {showPass ? <MdVisibilityOff className="text-[18px]" /> : <MdVisibility className="text-[18px]" />}
                </button>
              </div>
            </div>

            {/* Submit */}
            <button type="submit" disabled={loading}
              className="w-full flex items-center justify-center gap-2 py-3.5 bg-sky-500 hover:bg-sky-600
                text-white font-bold text-sm rounded-xl transition-colors disabled:opacity-60
                shadow-lg shadow-sky-500/25">
              {loading
                ? <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                : <>Sign In <MdArrowForward className="text-[16px]" /></>}
            </button>

            <p className="text-center text-xs text-slate-500">
              Not a staff member?{' '}
              <NavLink to="/patient/login" className="text-sky-600 hover:text-sky-700 font-semibold">
                Patient Login
              </NavLink>
            </p>
          </form>
        </div>

        <p className="text-center mt-5">
          <NavLink to="/" className="text-slate-500 hover:text-white text-xs transition-colors">
            ← Back to home
          </NavLink>
        </p>
      </div>
    </div>
  )
}

export default StaffLogin