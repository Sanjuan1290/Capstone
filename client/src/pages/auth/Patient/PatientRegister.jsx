// client/src/pages/auth/Patient/PatientRegister.jsx
// REDESIGNED: Mobile-first 2-step flow, modern card, icon inputs, smooth OTP input

import { useState, useRef } from 'react'
import logo from '../../../assets/logo-removebg.png'
import { NavLink, useNavigate } from 'react-router-dom'
import { useAuth } from '../../../context/AuthContext'
import {
  MdPerson, MdCalendarToday, MdWc, MdPhone, MdHome,
  MdEmail, MdLock, MdVisibility, MdVisibilityOff,
  MdArrowForward, MdArrowBack, MdCheckCircle,
} from 'react-icons/md'

// ── Shared input styles ────────────────────────────────────────────────────────
const inp = `w-full bg-slate-50 border-2 border-slate-200 rounded-xl px-3.5 py-3 text-sm
  text-slate-800 placeholder-slate-300 focus:outline-none focus:border-emerald-400
  focus:bg-white focus:ring-2 focus:ring-emerald-400/10 transition-all`

const lbl = `block text-[11px] font-bold text-slate-500 uppercase tracking-widest mb-1.5`

// ── Password input with eye toggle ────────────────────────────────────────────
const PasswordInput = ({ name, value, onChange, placeholder }) => {
  const [show, setShow] = useState(false)
  return (
    <div className="relative">
      <MdLock className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400 text-[17px]" />
      <input type={show ? 'text' : 'password'} name={name} value={value}
        onChange={onChange} required placeholder={placeholder}
        className={`${inp} pl-10 pr-11`} />
      <button type="button" onClick={() => setShow(s => !s)}
        className="absolute right-3.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600">
        {show ? <MdVisibilityOff className="text-[17px]" /> : <MdVisibility className="text-[17px]" />}
      </button>
    </div>
  )
}

// ── OTP Input — 6 big digit boxes ─────────────────────────────────────────────
const OtpBoxes = ({ value, onChange }) => {
  const refs = useRef([])
  const digits = value.split('')

  const handleKey = (i, e) => {
    if (e.key === 'Backspace') {
      if (digits[i]) { onChange(digits.map((d, idx) => idx === i ? '' : d).join('')) }
      else if (i > 0) refs.current[i - 1]?.focus()
      return
    }
    if (!/^\d$/.test(e.key)) return
    const next = digits.map((d, idx) => idx === i ? e.key : d).join('').slice(0, 6)
    onChange(next)
    if (i < 5) refs.current[i + 1]?.focus()
  }

  const handlePaste = e => {
    const p = e.clipboardData.getData('text').replace(/\D/g, '').slice(0, 6)
    if (p) { onChange(p); refs.current[Math.min(p.length, 5)]?.focus() }
    e.preventDefault()
  }

  return (
    <div className="flex gap-2 sm:gap-3 justify-center">
      {Array.from({ length: 6 }).map((_, i) => (
        <input key={i} ref={el => refs.current[i] = el}
          type="text" inputMode="numeric" maxLength={1}
          value={digits[i] || ''} onChange={() => {}}
          onKeyDown={e => handleKey(i, e)} onPaste={handlePaste}
          className={`w-11 h-14 sm:w-14 sm:h-16 text-center text-2xl font-black border-2 rounded-2xl
            outline-none transition-all cursor-text select-none
            ${digits[i]
              ? 'border-emerald-400 bg-emerald-50 text-emerald-700'
              : 'border-slate-200 bg-slate-50 text-slate-800'}
            focus:border-emerald-400 focus:bg-white focus:ring-2 focus:ring-emerald-400/20`}
        />
      ))}
    </div>
  )
}

// ── Step 1: Registration Form ──────────────────────────────────────────────────
const RegistrationForm = ({ onSuccess }) => {
  const [form, setForm] = useState({
    full_name: '', birthdate: '', sex: '', civil_status: '',
    phone: '', address: '', email: '', password: '', confirmPassword: '',
  })
  const [consentGiven, setConsentGiven] = useState(false)
  const [error,   setError]   = useState('')
  const [loading, setLoading] = useState(false)

  const set = e => { setForm(p => ({ ...p, [e.target.name]: e.target.value })); setError('') }

  const handleSubmit = async e => {
    e.preventDefault()
    if (form.password !== form.confirmPassword) { setError('Passwords do not match.'); return }
    if (form.password.length < 6) { setError('Password must be at least 6 characters.'); return }
    setLoading(true)
    try {
      const res  = await fetch('/api/patient/register', {
        method: 'POST', credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...form, civil_status: form.civil_status || null, consent_given: true }),
      })
      const data = await res.json()
      if (!res.ok) { setError(data.message || 'Registration failed.'); return }
      onSuccess(form.email)
    } catch { setError('Cannot connect to server.') }
    finally  { setLoading(false) }
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-[#0b1a2c] via-[#0f2540] to-[#0b1a2c]
      flex items-center justify-center p-4 py-10">

      {/* bg blobs */}
      <div className="fixed top-0 right-0 w-96 h-96 bg-emerald-500/5 rounded-full blur-3xl pointer-events-none" />
      <div className="fixed bottom-0 left-0 w-72 h-72 bg-sky-500/5 rounded-full blur-3xl pointer-events-none" />

      <div className="w-full max-w-xl relative">

        {/* Brand */}
        <div className="flex flex-col items-center mb-6">
          <div className="w-14 h-14 rounded-2xl bg-white/10 border border-white/10 flex items-center justify-center mb-3
            shadow-[0_8px_32px_rgba(0,0,0,0.3)]">
            <img src={logo} alt="Carait" className="w-10 h-10 object-contain" />
          </div>
          <h1 className="text-white text-xl font-black tracking-tight">Carait Clinic</h1>
          <p className="text-slate-400 text-sm mt-0.5">Create your patient account</p>
        </div>

        {/* Card */}
        <div className="bg-white rounded-3xl shadow-2xl overflow-hidden">

          {/* Progress bar */}
          <div className="h-1 bg-slate-100">
            <div className="h-1 bg-emerald-500 w-1/2 transition-all" />
          </div>

          {/* Card header */}
          <div className="bg-gradient-to-r from-emerald-500 to-emerald-600 px-6 py-5">
            <div className="flex items-center gap-2 text-white/60 text-xs mb-1">
              <span className="bg-white/20 rounded-full px-2 py-0.5 font-bold">Step 1 of 2</span>
            </div>
            <h2 className="text-white font-bold text-lg">Personal Information</h2>
            <p className="text-emerald-100 text-sm mt-0.5">Fill in your details to get started</p>
          </div>

          <form onSubmit={handleSubmit} className="px-5 sm:px-8 py-6 space-y-4">

            {error && (
              <div className="bg-red-50 border border-red-200 text-red-600 text-sm rounded-xl px-4 py-3">
                {error}
              </div>
            )}

            {/* Full name */}
            <div>
              <label className={lbl}>Full Name</label>
              <div className="relative">
                <MdPerson className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400 text-[17px]" />
                <input type="text" name="full_name" value={form.full_name} onChange={set}
                  required placeholder="e.g. Juan dela Cruz"
                  className={`${inp} pl-10`} />
              </div>
            </div>

            {/* Birthdate + Sex */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className={lbl}>Birthdate</label>
                <div className="relative">
                  <MdCalendarToday className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400 text-[16px]" />
                  <input type="date" name="birthdate" value={form.birthdate} onChange={set}
                    required className={`${inp} pl-10`} />
                </div>
              </div>
              <div>
                <label className={lbl}>Sex</label>
                <div className="relative">
                  <MdWc className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400 text-[17px]" />
                  <select name="sex" value={form.sex} onChange={set} required
                    className={`${inp} pl-10 appearance-none`}>
                    <option value="">Select sex</option>
                    <option>Male</option>
                    <option>Female</option>
                    <option>Other</option>
                  </select>
                </div>
              </div>
            </div>

            {/* Civil status + Phone */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className={lbl}>Civil Status <span className="normal-case font-normal text-slate-300">(optional)</span></label>
                <select name="civil_status" value={form.civil_status} onChange={set}
                  className={`${inp} appearance-none`}>
                  <option value="">Select status</option>
                  <option>Single</option>
                  <option>Married</option>
                  <option>Widowed</option>
                  <option>Divorced</option>
                </select>
              </div>
              <div>
                <label className={lbl}>Phone</label>
                <div className="relative">
                  <MdPhone className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400 text-[17px]" />
                  <input type="tel" name="phone" value={form.phone} onChange={set}
                    required placeholder="+63 9XX XXX XXXX"
                    className={`${inp} pl-10`} />
                </div>
              </div>
            </div>

            {/* Address */}
            <div>
              <label className={lbl}>Address</label>
              <div className="relative">
                <MdHome className="absolute left-3.5 top-3.5 text-slate-400 text-[17px]" />
                <input type="text" name="address" value={form.address} onChange={set}
                  required placeholder="Street, Barangay, City, Province"
                  className={`${inp} pl-10`} />
              </div>
            </div>

            {/* Email */}
            <div>
              <label className={lbl}>Email Address</label>
              <div className="relative">
                <MdEmail className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400 text-[17px]" />
                <input type="email" name="email" value={form.email} onChange={set}
                  required placeholder="you@example.com"
                  className={`${inp} pl-10`} />
              </div>
            </div>

            {/* Divider */}
            <div className="border-t border-slate-100 pt-1">
              <p className="text-[10px] text-slate-400 uppercase font-bold tracking-widest">Security</p>
            </div>

            {/* Passwords */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className={lbl}>Password</label>
                <PasswordInput name="password" value={form.password} onChange={set} placeholder="Min 6 characters" />
              </div>
              <div>
                <label className={lbl}>Confirm Password</label>
                <PasswordInput name="confirmPassword" value={form.confirmPassword} onChange={set} placeholder="Repeat password" />
                {form.confirmPassword && form.password !== form.confirmPassword && (
                  <p className="text-xs text-red-500 mt-1">Passwords do not match.</p>
                )}
              </div>
            </div>

            <label className="flex items-start gap-3 rounded-2xl border border-slate-200 bg-slate-50 px-4 py-4 text-sm text-slate-600">
              <input
                type="checkbox"
                checked={consentGiven}
                onChange={(e) => setConsentGiven(e.target.checked)}
                className="mt-1 h-4 w-4 rounded border-slate-300 text-emerald-600"
              />
              <span>
                I have read and agree to the{' '}
                <NavLink to="/privacy-policy" className="font-bold text-emerald-600 hover:text-emerald-700">
                  Privacy Policy
                </NavLink>
                . I consent to the collection and processing of my personal data in accordance with Republic Act 10173 (Data Privacy Act of 2012).
              </span>
            </label>

            <button type="submit" disabled={loading || !consentGiven}
              className="w-full flex items-center justify-center gap-2 py-3.5 bg-emerald-500 hover:bg-emerald-600
                text-white font-bold text-sm rounded-xl transition-colors shadow-lg shadow-emerald-500/20
                disabled:opacity-60 mt-2">
              {loading
                ? <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                : <> Send Verification Code <MdArrowForward className="text-[16px]" /></>}
            </button>

            <p className="text-center text-sm text-slate-400">
              Already have an account?{' '}
              <NavLink to="/patient/login" className="text-emerald-600 hover:text-emerald-700 font-bold">
                Sign in
              </NavLink>
            </p>
          </form>
        </div>

        <p className="text-center mt-4">
          <NavLink to="/" className="text-slate-500 hover:text-white text-xs transition-colors">
            ← Back to home
          </NavLink>
        </p>
      </div>
    </div>
  )
}

// ── Step 2: Email Verification ─────────────────────────────────────────────────
const VerificationForm = ({ email, onBack }) => {
  const [code,    setCode]    = useState('')
  const [error,   setError]   = useState('')
  const [loading, setLoading] = useState(false)
  const { login } = useAuth()
  const navigate  = useNavigate()

  const handleVerify = async e => {
    e.preventDefault()
    if (code.length < 6) { setError('Please enter the complete 6-digit code.'); return }
    setError('')
    setLoading(true)
    try {
      const res  = await fetch('/api/patient/register/verify', {
        method: 'POST', credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, code }),
      })
      const data = await res.json()
      if (!res.ok) { setError(data.message || 'Verification failed.'); return }
      login(data.user, 'patient')
      navigate('/patient')
    } catch { setError('Cannot connect to server.') }
    finally  { setLoading(false) }
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-[#0b1a2c] via-[#0f2540] to-[#0b1a2c]
      flex items-center justify-center p-4">

      <div className="w-full max-w-sm">

        {/* Brand */}
        <div className="flex flex-col items-center mb-6">
          <div className="w-14 h-14 rounded-2xl bg-white/10 border border-white/10 flex items-center justify-center mb-3">
            <img src={logo} alt="Carait" className="w-10 h-10 object-contain" />
          </div>
          <h1 className="text-white text-xl font-black">Carait Clinic</h1>
        </div>

        {/* Card */}
        <div className="bg-white rounded-3xl shadow-2xl overflow-hidden">

          {/* Progress */}
          <div className="h-1 bg-slate-100">
            <div className="h-1 bg-emerald-500 w-full transition-all" />
          </div>

          {/* Header */}
          <div className="bg-gradient-to-r from-emerald-500 to-emerald-600 px-6 py-5 text-center">
            <span className="bg-white/20 rounded-full px-2 py-0.5 font-bold text-white/60 text-xs">Step 2 of 2</span>
            <h2 className="text-white font-bold text-lg mt-1">Verify Your Email</h2>
            <p className="text-emerald-100 text-sm mt-0.5">Code sent to</p>
            <p className="text-white font-bold text-sm">{email}</p>
          </div>

          <form onSubmit={handleVerify} className="px-6 py-6 space-y-5">

            <div className="bg-amber-50 border border-amber-200 rounded-2xl px-4 py-3 text-center">
              <p className="text-xs text-amber-700">Check your inbox and spam. Code expires in 10 minutes.</p>
            </div>

            {error && (
              <div className="bg-red-50 border border-red-200 text-red-600 text-sm rounded-xl px-4 py-3 text-center">
                {error}
              </div>
            )}

            <div>
              <label className="block text-[11px] font-bold text-slate-500 uppercase tracking-widest mb-3 text-center">
                6-Digit Verification Code
              </label>
              <OtpBoxes value={code} onChange={v => { setCode(v); setError('') }} />
            </div>

            <button type="submit" disabled={loading || code.length < 6}
              className="w-full flex items-center justify-center gap-2 py-3.5 bg-emerald-500 hover:bg-emerald-600
                text-white font-bold text-sm rounded-xl transition-colors disabled:opacity-60">
              {loading
                ? <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                : <><MdCheckCircle className="text-[16px]" /> Verify & Create Account</>}
            </button>

            <div className="flex items-center justify-center gap-4 text-xs">
              <button type="button" onClick={onBack}
                className="flex items-center gap-1 text-slate-400 hover:text-slate-600 transition-colors">
                <MdArrowBack className="text-[13px]" /> Change email
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  )
}

// ── Main ──────────────────────────────────────────────────────────────────────
const PatientRegister = () => {
  const [pendingEmail, setPendingEmail] = useState(null)
  if (pendingEmail)
    return <VerificationForm email={pendingEmail} onBack={() => setPendingEmail(null)} />
  return <RegistrationForm onSuccess={setPendingEmail} />
}

export default PatientRegister
