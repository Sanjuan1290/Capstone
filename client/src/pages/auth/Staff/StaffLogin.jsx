import { useState } from "react"
import { useNavigate } from "react-router-dom"
import logo from '../../../assets/logo-removebg.png'
import { MdEmail, MdLock, MdVisibility, MdVisibilityOff } from "react-icons/md"

const StaffLogin = () => {
  const navigate = useNavigate()
  const [form,     setForm]     = useState({ email: "", password: "" })
  const [showPass, setShowPass] = useState(false)
  const [loading,  setLoading]  = useState(false)
  const [error,    setError]    = useState("")

  const handleChange = e =>
    setForm(f => ({ ...f, [e.target.name]: e.target.value }))

  const handleSubmit = async e => {
    e.preventDefault()
    setError("")
    setLoading(true)
    try {
      const res = await fetch("/api/staff/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify(form),
      })
      const data = await res.json()
      if (!res.ok) { setError(data.message || "Login failed"); return }
      navigate("/staff")
    } catch {
      setError("Cannot connect to server. Please try again.")
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen bg-slate-50 flex items-center justify-center px-4">
      <div className="w-full max-w-sm">

        {/* Logo */}
        <div className="flex flex-col items-center mb-8">
          <div className="w-14 h-14 rounded-2xl bg-[#0b1a2c] flex items-center justify-center mb-4 shadow-sm">
            <img src={logo} alt="Carait Clinic" className="w-9 h-9 object-contain" />
          </div>
          <h1 className="text-xl font-bold text-slate-800 tracking-tight">Staff Portal</h1>
          <p className="text-sm text-slate-500 mt-0.5">Carait Medical &amp; Dermatologic Clinics</p>
        </div>

        {/* Card */}
        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm px-7 py-8">
          <h2 className="text-sm font-bold text-slate-700 mb-5">Sign in to your account</h2>

          {error && (
            <div className="bg-red-50 border border-red-200 text-red-600 text-xs font-medium rounded-xl px-4 py-3 mb-5">
              {error}
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-4">
            {/* Email */}
            <div>
              <label className="text-xs font-bold text-slate-600 uppercase tracking-wide mb-1.5 block">
                Email
              </label>
              <div className="flex items-center gap-2.5 bg-slate-50 border-2 border-slate-200 rounded-xl
                px-3 py-2.5 focus-within:border-sky-400 transition-colors">
                <MdEmail className="text-slate-400 text-[16px] shrink-0" />
                <input
                  type="email" name="email" value={form.email}
                  onChange={handleChange} placeholder="your@email.com"
                  required autoComplete="email"
                  className="flex-1 text-sm text-slate-700 placeholder-slate-300 bg-transparent outline-none"
                />
              </div>
            </div>

            {/* Password */}
            <div>
              <label className="text-xs font-bold text-slate-600 uppercase tracking-wide mb-1.5 block">
                Password
              </label>
              <div className="flex items-center gap-2.5 bg-slate-50 border-2 border-slate-200 rounded-xl
                px-3 py-2.5 focus-within:border-sky-400 transition-colors">
                <MdLock className="text-slate-400 text-[16px] shrink-0" />
                <input
                  type={showPass ? "text" : "password"} name="password"
                  value={form.password} onChange={handleChange}
                  placeholder="••••••••" required autoComplete="current-password"
                  className="flex-1 text-sm text-slate-700 placeholder-slate-300 bg-transparent outline-none"
                />
                <button type="button" onClick={() => setShowPass(s => !s)}
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

        <p className="text-center text-xs text-slate-400 mt-5">
          Not a staff member?{" "}
          <a href="/patient/login" className="text-sky-600 font-semibold hover:underline">Patient login</a>
        </p>
      </div>
    </div>
  )
}

export default StaffLogin