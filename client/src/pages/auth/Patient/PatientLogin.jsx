import { useState } from 'react'
import { NavLink, useNavigate } from 'react-router-dom'
import { MdArrowForward, MdLock, MdPhone, MdVisibility, MdVisibilityOff } from 'react-icons/md'
import logo from '../../../assets/logo-removebg.png'
import { useAuth } from '../../../context/AuthContext'

const PatientLogin = () => {
  const [form, setForm] = useState({ phone: '', password: '' })
  const [showPassword, setShowPassword] = useState(false)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const navigate = useNavigate()
  const { login } = useAuth()

  const handleChange = (event) => {
    const { name, value } = event.target
    setForm((prev) => ({ ...prev, [name]: value }))
    setError('')
  }

  const handleLogin = async (event) => {
    event.preventDefault()
    setError('')
    setLoading(true)
    try {
      const res = await fetch('/api/patient/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify(form),
      })
      const data = await res.json()
      if (!res.ok) {
        setError(data.message || 'Login failed')
        return
      }
      login(data.user, 'patient')
      navigate('/patient')
    } catch {
      setError('Cannot connect to server.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-gradient-to-br from-[#0b1a2c] via-[#0f2540] to-[#0b1a2c] p-4">
      <div className="absolute right-0 top-0 h-96 w-96 rounded-full bg-emerald-500/5 blur-3xl pointer-events-none" />
      <div className="absolute bottom-0 left-0 h-72 w-72 rounded-full bg-sky-500/5 blur-3xl pointer-events-none" />

      <div className="relative w-full max-w-sm">
        <div className="mb-8 flex flex-col items-center">
          <div className="mb-4 flex h-16 w-16 items-center justify-center rounded-2xl border border-white/10 bg-white/10 shadow-[0_8px_32px_rgba(0,0,0,0.3)]">
            <img src={logo} alt="Carait Clinic" className="h-12 w-12 object-contain" />
          </div>
          <h1 className="text-2xl font-black tracking-tight text-white">Carait Clinic</h1>
          <p className="mt-1 text-sm text-slate-400">Patient Portal</p>
        </div>

        <div className="overflow-hidden rounded-3xl bg-white shadow-2xl">
          <div className="bg-gradient-to-r from-emerald-500 to-emerald-600 px-6 py-5">
            <h2 className="text-lg font-bold text-white">Welcome back</h2>
            <p className="mt-0.5 text-sm text-emerald-100">Sign in using your mobile number</p>
          </div>

          <form onSubmit={handleLogin} className="space-y-4 px-6 py-6">
            {error && (
              <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-600">
                {error}
              </div>
            )}

            <div className="space-y-1.5">
              <label className="text-xs font-bold uppercase tracking-widest text-slate-500">Phone Number</label>
              <div className="relative">
                <MdPhone className="absolute left-3.5 top-1/2 -translate-y-1/2 text-[18px] text-slate-400" />
                <input
                  required
                  type="tel"
                  name="phone"
                  value={form.phone}
                  onChange={handleChange}
                  placeholder="09XXXXXXXXX or +639XXXXXXXXX"
                  className="w-full rounded-xl border-2 border-slate-200 bg-slate-50 py-3 pl-10 pr-4 text-sm transition-all placeholder-slate-300 focus:border-emerald-400 focus:bg-white focus:outline-none focus:ring-2 focus:ring-emerald-400/10"
                />
              </div>
            </div>

            <div className="space-y-1.5">
              <label className="text-xs font-bold uppercase tracking-widest text-slate-500">Password</label>
              <div className="relative">
                <MdLock className="absolute left-3.5 top-1/2 -translate-y-1/2 text-[18px] text-slate-400" />
                <input
                  required
                  type={showPassword ? 'text' : 'password'}
                  name="password"
                  value={form.password}
                  onChange={handleChange}
                  placeholder="********"
                  className="w-full rounded-xl border-2 border-slate-200 bg-slate-50 py-3 pl-10 pr-12 text-sm transition-all placeholder-slate-300 focus:border-emerald-400 focus:bg-white focus:outline-none focus:ring-2 focus:ring-emerald-400/10"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword((current) => !current)}
                  className="absolute right-3.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
                >
                  {showPassword ? <MdVisibilityOff className="text-[18px]" /> : <MdVisibility className="text-[18px]" />}
                </button>
              </div>
              <div className="flex justify-end">
                <NavLink to="/patient/forgot-password" className="text-xs font-semibold text-emerald-600 hover:text-emerald-700">
                  Forgot password?
                </NavLink>
              </div>
            </div>

            <button
              type="submit"
              disabled={loading}
              className="flex w-full items-center justify-center gap-2 rounded-xl bg-emerald-500 py-3.5 text-sm font-bold text-white shadow-lg shadow-emerald-500/20 transition-colors hover:bg-emerald-600 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {loading ? (
                <div className="h-5 w-5 animate-spin rounded-full border-2 border-white/30 border-t-white" />
              ) : (
                <>
                  Sign In
                  <MdArrowForward className="text-[16px]" />
                </>
              )}
            </button>

            <p className="text-center text-sm text-slate-500">
              No account?{' '}
              <NavLink to="/patient/register" className="font-bold text-emerald-600 hover:text-emerald-700">
                Register here
              </NavLink>
            </p>
          </form>
        </div>

        <p className="mt-5 text-center">
          <NavLink to="/" className="text-xs text-slate-400 transition-colors hover:text-white">
            {'<-'} Back to home
          </NavLink>
        </p>
      </div>
    </div>
  )
}

export default PatientLogin
