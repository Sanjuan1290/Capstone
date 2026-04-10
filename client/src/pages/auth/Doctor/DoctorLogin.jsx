// client/src/pages/auth/Doctor/DoctorLogin.jsx
// REDESIGNED: Dark gradient, violet accent, mobile-first

import { useState } from 'react'
import { NavLink, useNavigate } from 'react-router-dom'
import logo from '../../../assets/logo-removebg.png'
import { MdEmail, MdLock, MdVisibility, MdVisibilityOff, MdArrowForward, MdMedicalServices } from 'react-icons/md'
import { useAuth } from '../../../context/AuthContext'

const DoctorLogin = () => {
  const [form,         setForm]         = useState({ email: '', password: '' })
  const [showPassword, setShowPassword] = useState(false)
  const [error,        setError]        = useState('')
  const [loading,      setLoading]      = useState(false)
  const navigate  = useNavigate()
  const { login } = useAuth()

  const handleChange = e => {
    const { name, value } = e.target
    setForm(p => ({ ...p, [name]: value }))
    setError('')
  }

  const handleLogin = async e => {
    e.preventDefault()
    setError('')
    setLoading(true)
    try {
      const res  = await fetch('/api/doctor/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify(form),
      })
      const data = await res.json()
      if (!res.ok) { setError(data.message || 'Login failed'); return }
      login(data.user, 'doctor')
      navigate('/doctor')
    } catch {
      setError('Cannot connect to server.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-[#0b1a2c] via-[#120a2e] to-[#0b1a2c]
      flex items-center justify-center p-4">

      {/* Decorative glows */}
      <div className="fixed top-0 right-0 w-96 h-96 bg-violet-600/8 rounded-full blur-3xl pointer-events-none" />
      <div className="fixed bottom-0 left-0 w-72 h-72 bg-violet-500/5 rounded-full blur-3xl pointer-events-none" />

      <div className="w-full max-w-sm relative">

        {/* Brand */}
        <div className="flex flex-col items-center mb-8">
          <div className="w-16 h-16 rounded-2xl bg-white/10 border border-white/10 flex items-center justify-center mb-4
            shadow-[0_8px_32px_rgba(124,58,237,0.2)]">
            <img src={logo} alt="Carait Clinic" className="w-12 h-12 object-contain" />
          </div>
          <h1 className="text-white text-2xl font-black tracking-tight">Carait Clinic</h1>
          <div className="flex items-center gap-1.5 mt-1.5">
            <MdMedicalServices className="text-violet-400 text-[13px]" />
            <p className="text-violet-400 text-xs font-semibold uppercase tracking-widest">Doctor Portal</p>
          </div>
        </div>

        {/* Card */}
        <div className="bg-white rounded-3xl shadow-2xl overflow-hidden">

          {/* Card header */}
          <div className="bg-gradient-to-r from-violet-600 to-violet-700 px-6 py-5">
            <h2 className="text-white font-bold text-lg">Doctor Sign In</h2>
            <p className="text-violet-200 text-sm mt-0.5">Access your clinical dashboard</p>
          </div>

          {/* Form */}
          <form onSubmit={handleLogin} className="px-6 py-6 space-y-4">

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
                  placeholder="doctor@carait.com"
                  className="w-full pl-10 pr-4 py-3 bg-slate-50 border-2 border-slate-200 rounded-xl text-sm
                    focus:outline-none focus:border-violet-400 focus:bg-white focus:ring-2 focus:ring-violet-400/10
                    transition-all placeholder-slate-300" />
              </div>
            </div>

            {/* Password */}
            <div className="space-y-1.5">
              <label className="text-[11px] font-bold text-slate-500 uppercase tracking-widest">Password</label>
              <div className="relative">
                <MdLock className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400 text-[18px]" />
                <input required type={showPassword ? 'text' : 'password'}
                  name="password" value={form.password} onChange={handleChange}
                  placeholder="••••••••"
                  className="w-full pl-10 pr-12 py-3 bg-slate-50 border-2 border-slate-200 rounded-xl text-sm
                    focus:outline-none focus:border-violet-400 focus:bg-white focus:ring-2 focus:ring-violet-400/10
                    transition-all placeholder-slate-300" />
                <button type="button" onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-3.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600">
                  {showPassword ? <MdVisibilityOff className="text-[18px]" /> : <MdVisibility className="text-[18px]" />}
                </button>
              </div>
              <div className="flex justify-end">
                <NavLink to="/doctor/forgot-password"
                  className="text-xs text-violet-600 hover:text-violet-700 font-semibold">
                  Forgot password?
                </NavLink>
              </div>
            </div>

            {/* Submit */}
            <button type="submit" disabled={loading}
              className="w-full flex items-center justify-center gap-2 py-3.5 bg-violet-600 hover:bg-violet-700
                text-white font-bold text-sm rounded-xl transition-colors disabled:opacity-60
                shadow-lg shadow-violet-600/25">
              {loading
                ? <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                : <>Sign In <MdArrowForward className="text-[16px]" /></>}
            </button>
          </form>
        </div>

        <p className="text-center mt-5">
          <NavLink to="/" className="text-slate-400 hover:text-white text-xs transition-colors">
            ← Back to home
          </NavLink>
        </p>
      </div>
    </div>
  )
}

export default DoctorLogin