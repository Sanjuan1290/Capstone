import { useState } from 'react'
import { NavLink, useNavigate } from 'react-router-dom'
import logo from '../../../assets/logo-removebg.png'
import { MdEmail, MdLock, MdVisibility, MdVisibilityOff } from 'react-icons/md'
import { useAuth } from '../../../context/AuthContext'

const DoctorLogin = () => {
  const [form,    setForm]    = useState({ email: '', password: '' })
  const [showPass, setShowP]  = useState(false)
  const [error,   setError]   = useState('')
  const [loading, setLoading] = useState(false)
  const navigate = useNavigate()
  const { login } = useAuth()

  const handleChange = (e) => {
    const { name, value } = e.target
    setForm(p => ({ ...p, [name]: value }))
    setError('')
  }

  const handleSubmit = async (e) => {
    e.preventDefault()
    setError(''); setLoading(true)
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
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-violet-50 to-slate-100 p-6">
      <div className="w-full max-w-md bg-white rounded-3xl shadow-xl overflow-hidden">

        {/* Header */}
        <div className="flex flex-col items-center py-8 px-8 bg-[#0b1a2c]">
          <img src={logo} alt="Carait Clinic"
            className="border border-white/20 rounded-full w-14 h-14 object-contain bg-white/10 p-1 mb-3" />
          <h2 className="text-white font-bold text-xl tracking-wide">Doctor Portal</h2>
          <span className="text-violet-400 text-xs font-semibold uppercase tracking-widest mt-1">Sign in to your account</span>
        </div>

        {/* Form */}
        <div className="px-8 py-8">
          <form onSubmit={handleSubmit} className="space-y-5">

            {error && (
              <div className="bg-red-50 border border-red-200 text-red-700 text-sm rounded-xl px-4 py-3">
                {error}
              </div>
            )}

            {/* Email */}
            <div>
              <label className="text-xs font-bold text-slate-600 uppercase tracking-wide mb-1.5 block">Email</label>
              <div className="flex items-center gap-2.5 bg-slate-50 border-2 border-slate-200 rounded-xl px-3 py-2.5 focus-within:border-violet-400 transition-colors">
                <MdEmail className="text-slate-400 text-[16px] shrink-0" />
                <input type="email" name="email" value={form.email} onChange={handleChange}
                  placeholder="doctor@carait.com" required autoComplete="email"
                  className="flex-1 text-sm text-slate-700 placeholder-slate-300 bg-transparent outline-none" />
              </div>
            </div>

            {/* Password */}
            <div>
              <div className="flex justify-between items-center mb-1.5">
                <label className="text-xs font-bold text-slate-600 uppercase tracking-wide">Password</label>
                {/* ✅ NEW: Forgot password link */}
                <NavLink to="/doctor/forgot-password"
                  className="text-xs text-violet-600 font-semibold hover:underline">
                  Forgot password?
                </NavLink>
              </div>
              <div className="flex items-center gap-2.5 bg-slate-50 border-2 border-slate-200 rounded-xl px-3 py-2.5 focus-within:border-violet-400 transition-colors">
                <MdLock className="text-slate-400 text-[16px] shrink-0" />
                <input type={showPass ? "text" : "password"} name="password"
                  value={form.password} onChange={handleChange}
                  placeholder="••••••••" required autoComplete="current-password"
                  className="flex-1 text-sm text-slate-700 placeholder-slate-300 bg-transparent outline-none" />
                <button type="button" onClick={() => setShowP(s => !s)}
                  className="text-slate-400 hover:text-slate-600 transition-colors shrink-0">
                  {showPass ? <MdVisibilityOff className="text-[16px]" /> : <MdVisibility className="text-[16px]" />}
                </button>
              </div>
            </div>

            <button type="submit" disabled={loading}
              className="w-full mt-2 bg-[#0b1a2c] hover:bg-[#122236] disabled:opacity-50
                disabled:cursor-not-allowed text-white text-sm font-bold py-3 rounded-xl transition-colors">
              {loading ? "Signing in…" : "Sign In"}
            </button>
          </form>
        </div>

        <p className="text-center text-xs text-slate-400 pb-6">
          Not a doctor?{" "}
          <a href="/patient/login" className="text-violet-600 font-semibold hover:underline">Patient login</a>
        </p>
      </div>
    </div>
  )
}

export default DoctorLogin