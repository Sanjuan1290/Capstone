// client/src/pages/auth/Patient/PatientLogin.jsx
// REDESIGNED: Modern split-card, gradient, mobile-first

import { useState } from "react"
import { NavLink, useNavigate } from "react-router-dom"
import logo from "../../../assets/logo-removebg.png"
import { MdEmail, MdLock, MdVisibility, MdVisibilityOff, MdArrowForward } from "react-icons/md"
import { useAuth } from "../../../context/AuthContext"

const PatientLogin = () => {
  const [form,         setForm]         = useState({ email: "", password: "" })
  const [showPassword, setShowPassword] = useState(false)
  const [error,        setError]        = useState("")
  const [loading,      setLoading]      = useState(false)
  const navigate  = useNavigate()
  const { login } = useAuth()

  const handleChange = e => {
    const { name, value } = e.target
    setForm(p => ({ ...p, [name]: value }))
    setError("")
  }

  const handleLogin = async e => {
    e.preventDefault()
    setError("")
    setLoading(true)
    try {
      const res  = await fetch("/api/patient/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify(form),
      })
      const data = await res.json()
      if (!res.ok) { setError(data.message || "Login failed"); return }
      login(data.user, "patient")
      navigate("/patient")
    } catch {
      setError("Cannot connect to server.")
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-[#0b1a2c] via-[#0f2540] to-[#0b1a2c]
      flex items-center justify-center p-4">

      {/* Decorative blobs */}
      <div className="absolute top-0 right-0 w-96 h-96 bg-emerald-500/5 rounded-full blur-3xl pointer-events-none" />
      <div className="absolute bottom-0 left-0 w-72 h-72 bg-sky-500/5 rounded-full blur-3xl pointer-events-none" />

      <div className="w-full max-w-sm relative">

        {/* Logo + brand */}
        <div className="flex flex-col items-center mb-8">
          <div className="w-16 h-16 rounded-2xl bg-white/10 border border-white/10 flex items-center justify-center mb-4
            shadow-[0_8px_32px_rgba(0,0,0,0.3)]">
            <img src={logo} alt="Carait Clinic" className="w-12 h-12 object-contain" />
          </div>
          <h1 className="text-white text-2xl font-black tracking-tight">Carait Clinic</h1>
          <p className="text-slate-400 text-sm mt-1">Patient Portal</p>
        </div>

        {/* Card */}
        <div className="bg-white rounded-3xl shadow-2xl overflow-hidden">

          {/* Card header */}
          <div className="bg-gradient-to-r from-emerald-500 to-emerald-600 px-6 py-5">
            <h2 className="text-white font-bold text-lg">Welcome back</h2>
            <p className="text-emerald-100 text-sm mt-0.5">Sign in to your patient account</p>
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
              <label className="text-xs font-bold text-slate-500 uppercase tracking-widest">Email</label>
              <div className="relative">
                <MdEmail className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400 text-[18px]" />
                <input
                  required
                  type="email"
                  name="email"
                  value={form.email}
                  onChange={handleChange}
                  placeholder="you@example.com"
                  className="w-full pl-10 pr-4 py-3 bg-slate-50 border-2 border-slate-200 rounded-xl text-sm
                    focus:outline-none focus:border-emerald-400 focus:bg-white focus:ring-2 focus:ring-emerald-400/10
                    transition-all placeholder-slate-300"
                />
              </div>
            </div>

            {/* Password */}
            <div className="space-y-1.5">
              <label className="text-xs font-bold text-slate-500 uppercase tracking-widest">Password</label>
              <div className="relative">
                <MdLock className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400 text-[18px]" />
                <input
                  required
                  type={showPassword ? "text" : "password"}
                  name="password"
                  value={form.password}
                  onChange={handleChange}
                  placeholder="••••••••"
                  className="w-full pl-10 pr-12 py-3 bg-slate-50 border-2 border-slate-200 rounded-xl text-sm
                    focus:outline-none focus:border-emerald-400 focus:bg-white focus:ring-2 focus:ring-emerald-400/10
                    transition-all placeholder-slate-300"
                />
                <button type="button" onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-3.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600">
                  {showPassword ? <MdVisibilityOff className="text-[18px]" /> : <MdVisibility className="text-[18px]" />}
                </button>
              </div>
              <div className="flex justify-end">
                <NavLink to="/forgot-password"
                  className="text-xs text-emerald-600 hover:text-emerald-700 font-semibold">
                  Forgot password?
                </NavLink>
              </div>
            </div>

            {/* Submit */}
            <button type="submit" disabled={loading}
              className="w-full flex items-center justify-center gap-2 py-3.5 bg-emerald-500 hover:bg-emerald-600
                text-white font-bold text-sm rounded-xl transition-colors disabled:opacity-60
                disabled:cursor-not-allowed shadow-lg shadow-emerald-500/20">
              {loading ? (
                <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
              ) : (
                <>Sign In <MdArrowForward className="text-[16px]" /></>
              )}
            </button>

            {/* Register link */}
            <p className="text-center text-sm text-slate-500">
              No account?{" "}
              <NavLink to="/patient/register"
                className="text-emerald-600 hover:text-emerald-700 font-bold">
                Register here
              </NavLink>
            </p>
          </form>
        </div>

        {/* Back to home */}
        <p className="text-center mt-5">
          <NavLink to="/" className="text-slate-400 hover:text-white text-xs transition-colors">
            ← Back to home
          </NavLink>
        </p>
      </div>
    </div>
  )
}

export default PatientLogin