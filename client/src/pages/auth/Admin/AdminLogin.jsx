import { useState } from "react"
import { useNavigate } from "react-router-dom"
import logo from '../../../assets/logo-removebg.png'
import { MdEmail, MdLock, MdVisibility, MdVisibilityOff, MdAdminPanelSettings } from "react-icons/md"

const AdminLogin = () => {
  const navigate = useNavigate()
  const [form,     setForm]     = useState({ email: "", password: "" })
  const [showPass, setShowPass] = useState(false)
  const [loading,  setLoading]  = useState(false)
  const [error,    setError]    = useState("")

  const handleSubmit = async e => {
    e.preventDefault(); setError(""); setLoading(true)
    try {
      const res  = await fetch("/api/admin/login", {
        method: "POST", headers: { "Content-Type": "application/json" },
        credentials: "include", body: JSON.stringify(form),
      })
      const data = await res.json()
      if (!res.ok) { setError(data.message || "Login failed"); return }
      navigate("/admin")
    } catch { setError("Cannot connect to server.") }
    finally   { setLoading(false) }
  }

  return (
    <div className="min-h-screen bg-slate-50 flex items-center justify-center px-4">
      <div className="w-full max-w-sm">
        <div className="flex flex-col items-center mb-8">
          <div className="w-14 h-14 rounded-2xl bg-[#0b1a2c] flex items-center justify-center mb-4 shadow-sm">
            <MdAdminPanelSettings className="text-amber-400 text-[28px]" />
          </div>
          <h1 className="text-xl font-bold text-slate-800 tracking-tight">Admin Portal</h1>
          <p className="text-sm text-slate-500 mt-0.5">Carait Medical &amp; Dermatologic Clinics</p>
        </div>

        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm px-7 py-8">
          <h2 className="text-sm font-bold text-slate-700 mb-5">Sign in to your account</h2>
          {error && (
            <div className="bg-red-50 border border-red-200 text-red-600 text-xs font-medium rounded-xl px-4 py-3 mb-5">{error}</div>
          )}
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="text-xs font-bold text-slate-600 uppercase tracking-wide mb-1.5 block">Email</label>
              <div className="flex items-center gap-2.5 bg-slate-50 border-2 border-slate-200 rounded-xl px-3 py-2.5 focus-within:border-amber-400 transition-colors">
                <MdEmail className="text-slate-400 text-[16px] shrink-0" />
                <input type="email" value={form.email} onChange={e => setForm(f=>({...f,email:e.target.value}))}
                  placeholder="admin@carait.com" required autoComplete="email"
                  className="flex-1 text-sm text-slate-700 placeholder-slate-300 bg-transparent outline-none" />
              </div>
            </div>
            <div>
              <label className="text-xs font-bold text-slate-600 uppercase tracking-wide mb-1.5 block">Password</label>
              <div className="flex items-center gap-2.5 bg-slate-50 border-2 border-slate-200 rounded-xl px-3 py-2.5 focus-within:border-amber-400 transition-colors">
                <MdLock className="text-slate-400 text-[16px] shrink-0" />
                <input type={showPass ? "text" : "password"} value={form.password}
                  onChange={e => setForm(f=>({...f,password:e.target.value}))}
                  placeholder="••••••••" required autoComplete="current-password"
                  className="flex-1 text-sm text-slate-700 placeholder-slate-300 bg-transparent outline-none" />
                <button type="button" onClick={() => setShowPass(s=>!s)} className="text-slate-400 hover:text-slate-600 transition-colors shrink-0">
                  {showPass ? <MdVisibilityOff className="text-[16px]" /> : <MdVisibility className="text-[16px]" />}
                </button>
              </div>
            </div>
            <button type="submit" disabled={loading}
              className="w-full mt-2 bg-[#0b1a2c] hover:bg-[#122236] disabled:opacity-50 disabled:cursor-not-allowed
                text-white text-sm font-bold py-3 rounded-xl transition-colors">
              {loading ? "Signing in…" : "Sign In"}
            </button>
          </form>
        </div>
      </div>
    </div>
  )
}
export default AdminLogin