// client/src/pages/auth/ForgotPassword.jsx
// REDESIGNED: Modern 4-step flow, role-aware accent colours, mobile-first, animated step transitions

import { useState, useEffect, useRef } from 'react'
import { NavLink } from 'react-router-dom'
import logo from '../../assets/logo-removebg.png'
import {
  MdEmail, MdLock, MdVisibility, MdVisibilityOff,
  MdCheck, MdArrowBack, MdRefresh, MdArrowForward,
  MdLockReset,
} from 'react-icons/md'

const ROLE_CFG = {
  patient: { accent: '#10b981', light: '#ecfdf5', border: 'focus:border-emerald-400', ring: 'focus:ring-emerald-400/10', badge: 'Patient',  btnClass: 'bg-emerald-500 hover:bg-emerald-600 shadow-emerald-500/25' },
  doctor:  { accent: '#7c3aed', light: '#f5f3ff', border: 'focus:border-violet-400',  ring: 'focus:ring-violet-400/10',  badge: 'Doctor',   btnClass: 'bg-violet-600  hover:bg-violet-700  shadow-violet-500/25'  },
  staff:   { accent: '#0ea5e9', light: '#f0f9ff', border: 'focus:border-sky-400',     ring: 'focus:ring-sky-400/10',     badge: 'Staff',    btnClass: 'bg-sky-500    hover:bg-sky-600    shadow-sky-500/25'      },
}

// ── OTP digit boxes ───────────────────────────────────────────────────────────
const OtpInput = ({ value, onChange, accentBorder }) => {
  const inputs = useRef([])
  const digits  = value.split('')

  const handleKey = (i, e) => {
    if (e.key === 'Backspace') {
      if (digits[i]) { onChange(digits.map((d, idx) => idx === i ? '' : d).join('')) }
      else if (i > 0) inputs.current[i - 1]?.focus()
      return
    }
    if (!/^\d$/.test(e.key)) return
    const next = digits.map((d, idx) => idx === i ? e.key : d).join('').slice(0, 6)
    onChange(next)
    if (i < 5) inputs.current[i + 1]?.focus()
  }

  const handlePaste = e => {
    const p = e.clipboardData.getData('text').replace(/\D/g, '').slice(0, 6)
    if (p) { onChange(p); inputs.current[Math.min(p.length, 5)]?.focus() }
    e.preventDefault()
  }

  return (
    <div className="flex gap-2 sm:gap-3 justify-center">
      {Array.from({ length: 6 }).map((_, i) => (
        <input key={i} ref={el => inputs.current[i] = el}
          type="text" inputMode="numeric" maxLength={1}
          value={digits[i] || ''} onChange={() => {}}
          onKeyDown={e => handleKey(i, e)} onPaste={handlePaste}
          className={`w-11 h-14 sm:w-12 sm:h-14 text-center text-2xl font-black border-2 rounded-2xl
            outline-none transition-all
            ${digits[i] ? `border-opacity-100 bg-opacity-10` : 'border-slate-200 bg-slate-50'}
            focus:ring-2`}
          style={{
            borderColor:    digits[i] ? '#10b981' : undefined,
            backgroundColor:digits[i] ? '#ecfdf5' : undefined,
            color:          digits[i] ? '#065f46' : undefined,
          }}
        />
      ))}
    </div>
  )
}

// ── Step indicators ───────────────────────────────────────────────────────────
const Steps = ({ current, cfg }) => {
  const steps = ['Email', 'Verify', 'New Password', 'Done']
  return (
    <div className="flex items-center justify-center gap-1 mb-6">
      {steps.map((s, i) => (
        <div key={s} className="flex items-center">
          <div className={`flex items-center justify-center w-7 h-7 rounded-full text-xs font-bold transition-all
            ${i < current ? 'text-white' : i === current ? 'text-white' : 'bg-slate-100 text-slate-400'}`}
            style={{ background: i <= current ? cfg.accent : undefined }}>
            {i < current ? <MdCheck className="text-[13px]" /> : i + 1}
          </div>
          {i < steps.length - 1 && (
            <div className="w-8 h-0.5 mx-1 rounded-full transition-all"
              style={{ background: i < current ? cfg.accent : '#e2e8f0' }} />
          )}
        </div>
      ))}
    </div>
  )
}

// ── Main ──────────────────────────────────────────────────────────────────────
const ForgotPassword = ({ role }) => {
  const cfg = ROLE_CFG[role] || ROLE_CFG.patient

  const [step,       setStep]      = useState('request') // request | otp | reset | done
  const [email,      setEmail]     = useState('')
  const [otp,        setOtp]       = useState('')
  const [resetToken, setToken]     = useState('')
  const [password,   setPass]      = useState('')
  const [confirm,    setConfirm]   = useState('')
  const [showPass,   setShowPass]  = useState(false)
  const [error,      setError]     = useState('')
  const [loading,    setLoading]   = useState(false)
  const [countdown,  setCountdown] = useState(0)

  useEffect(() => {
    if (countdown <= 0) return
    const t = setTimeout(() => setCountdown(c => c - 1), 1000)
    return () => clearTimeout(t)
  }, [countdown])

  const stepNum = { request: 0, otp: 1, reset: 2, done: 3 }[step]
  const loginPath = `/${role}/login`

  const inpClass = `w-full bg-slate-50 border-2 border-slate-200 rounded-xl px-4 py-3 text-sm
    text-slate-700 placeholder-slate-300 outline-none transition-all ${cfg.border} ${cfg.ring}
    focus:ring-2 focus:bg-white`

  // Step 1
  const handleRequest = async e => {
    e?.preventDefault()
    setError(''); setLoading(true)
    try {
      const res  = await fetch('/api/auth/forgot-password', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, role }),
      })
      const data = await res.json()
      if (!res.ok) { setError(data.message || 'Request failed.'); return }
      setStep('otp'); setCountdown(60); setOtp('')
    } catch { setError('Cannot connect to server.') }
    finally  { setLoading(false) }
  }

  // Step 2
  const handleVerify = async () => {
    if (otp.length !== 6) { setError('Enter the complete 6-digit code.'); return }
    setError(''); setLoading(true)
    try {
      const res  = await fetch('/api/auth/verify-otp', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, role, otp }),
      })
      const data = await res.json()
      if (!res.ok) { setError(data.message || 'Invalid code.'); return }
      setToken(data.resetToken); setStep('reset')
    } catch { setError('Cannot connect to server.') }
    finally  { setLoading(false) }
  }

  // Step 3
  const handleReset = async e => {
    e.preventDefault()
    if (password.length < 6) { setError('Password must be at least 6 characters.'); return }
    if (password !== confirm) { setError('Passwords do not match.'); return }
    setError(''); setLoading(true)
    try {
      const res  = await fetch('/api/auth/reset-password', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ resetToken, password }),
      })
      const data = await res.json()
      if (!res.ok) { setError(data.message || 'Reset failed.'); return }
      setStep('done')
    } catch { setError('Cannot connect to server.') }
    finally  { setLoading(false) }
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-[#0b1a2c] via-[#0f2540] to-[#0b1a2c]
      flex items-center justify-center p-4">

      <div className="fixed top-0 right-0 w-80 h-80 rounded-full blur-3xl pointer-events-none opacity-50"
        style={{ background: `${cfg.accent}15` }} />

      <div className="w-full max-w-sm">

        {/* Brand */}
        <div className="flex flex-col items-center mb-6">
          <div className="w-14 h-14 rounded-2xl bg-white/10 border border-white/10 flex items-center justify-center mb-3">
            <img src={logo} alt="Carait" className="w-10 h-10 object-contain" />
          </div>
          <h1 className="text-white text-xl font-black">Carait Clinic</h1>
          <span className="text-xs font-bold px-3 py-0.5 rounded-full mt-1.5 text-white/70"
            style={{ background: `${cfg.accent}30` }}>
            {cfg.badge} Portal
          </span>
        </div>

        {/* Card */}
        <div className="bg-white rounded-3xl shadow-2xl overflow-hidden">

          {/* Progress bar */}
          <div className="h-1.5 bg-slate-100">
            <div className="h-1.5 rounded-full transition-all duration-500"
              style={{ width: `${(stepNum / 3) * 100}%`, background: cfg.accent }} />
          </div>

          <div className="px-6 py-6 space-y-5">

            {/* Header */}
            <div className="text-center">
              <div className="w-14 h-14 rounded-2xl flex items-center justify-center mx-auto mb-3"
                style={{ background: `${cfg.accent}15` }}>
                <MdLockReset className="text-[26px]" style={{ color: cfg.accent }} />
              </div>
              <h2 className="text-lg font-black text-slate-800">Reset Password</h2>
              <Steps current={stepNum} cfg={cfg} />
            </div>

            {/* Error */}
            {error && (
              <div className="bg-red-50 border border-red-200 text-red-600 text-sm rounded-xl px-4 py-3 text-center">
                {error}
              </div>
            )}

            {/* ── Step 1: Enter email ── */}
            {step === 'request' && (
              <form onSubmit={handleRequest} className="space-y-4">
                <p className="text-sm text-slate-500 text-center">
                  Enter your {cfg.badge.toLowerCase()} email and we'll send a verification code.
                </p>
                <div>
                  <label className="block text-[11px] font-bold text-slate-500 uppercase tracking-widest mb-1.5">Email Address</label>
                  <div className="relative">
                    <MdEmail className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400 text-[17px]" />
                    <input type="email" required value={email} onChange={e => { setEmail(e.target.value); setError('') }}
                      placeholder="your@email.com"
                      className={`${inpClass} pl-10`} />
                  </div>
                </div>
                <button type="submit" disabled={loading}
                  className={`w-full flex items-center justify-center gap-2 py-3.5 text-white font-bold text-sm
                    rounded-xl transition-colors shadow-lg disabled:opacity-60 ${cfg.btnClass}`}>
                  {loading
                    ? <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                    : <>Send Code <MdArrowForward className="text-[16px]" /></>}
                </button>
                <p className="text-center text-sm text-slate-500">
                  Remember it?{' '}
                  <NavLink to={loginPath} className="font-bold hover:underline" style={{ color: cfg.accent }}>
                    Back to login
                  </NavLink>
                </p>
              </form>
            )}

            {/* ── Step 2: OTP ── */}
            {step === 'otp' && (
              <div className="space-y-5">
                <div className="text-center">
                  <p className="text-sm text-slate-600">
                    Code sent to <strong className="text-slate-800">{email}</strong>
                  </p>
                  <p className="text-xs text-slate-400 mt-1">Expires in 10 minutes</p>
                </div>
                <OtpInput value={otp} onChange={v => { setOtp(v); setError('') }} accentBorder={cfg.border} />
                <button onClick={handleVerify} disabled={loading || otp.length !== 6}
                  className={`w-full flex items-center justify-center gap-2 py-3.5 text-white font-bold text-sm
                    rounded-xl transition-colors shadow-lg disabled:opacity-60 ${cfg.btnClass}`}>
                  {loading
                    ? <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                    : <><MdCheck className="text-[16px]" /> Verify Code</>}
                </button>
                <div className="flex items-center justify-center gap-4">
                  {countdown > 0 ? (
                    <p className="text-xs text-slate-400">Resend in <strong>{countdown}s</strong></p>
                  ) : (
                    <button onClick={handleRequest} disabled={loading}
                      className="flex items-center gap-1 text-xs font-semibold hover:underline disabled:opacity-50"
                      style={{ color: cfg.accent }}>
                      <MdRefresh className="text-[13px]" /> Resend Code
                    </button>
                  )}
                  <span className="text-slate-200">|</span>
                  <button onClick={() => { setStep('request'); setError(''); setOtp('') }}
                    className="flex items-center gap-1 text-xs text-slate-400 hover:text-slate-600 transition-colors">
                    <MdArrowBack className="text-[13px]" /> Change email
                  </button>
                </div>
              </div>
            )}

            {/* ── Step 3: New password ── */}
            {step === 'reset' && (
              <form onSubmit={handleReset} className="space-y-4">
                <div className="bg-emerald-50 border border-emerald-200 rounded-xl px-4 py-3 flex items-center gap-2">
                  <MdCheck className="text-emerald-500 text-[16px] shrink-0" />
                  <p className="text-xs text-emerald-700">Code verified! Choose your new password.</p>
                </div>
                <div>
                  <label className="block text-[11px] font-bold text-slate-500 uppercase tracking-widest mb-1.5">New Password</label>
                  <div className="relative">
                    <MdLock className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400 text-[17px]" />
                    <input type={showPass ? 'text' : 'password'} required minLength={6}
                      value={password} onChange={e => { setPass(e.target.value); setError('') }}
                      placeholder="Min 6 characters"
                      className={`${inpClass} pl-10 pr-11`} />
                    <button type="button" onClick={() => setShowPass(s => !s)}
                      className="absolute right-3.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600">
                      {showPass ? <MdVisibilityOff className="text-[17px]" /> : <MdVisibility className="text-[17px]" />}
                    </button>
                  </div>
                </div>
                <div>
                  <label className="block text-[11px] font-bold text-slate-500 uppercase tracking-widest mb-1.5">Confirm Password</label>
                  <div className="relative">
                    <MdLock className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400 text-[17px]" />
                    <input type={showPass ? 'text' : 'password'} required
                      value={confirm} onChange={e => { setConfirm(e.target.value); setError('') }}
                      placeholder="Repeat password"
                      className={`${inpClass} pl-10`} />
                  </div>
                  {confirm && password !== confirm && (
                    <p className="text-xs text-red-500 mt-1">Passwords do not match.</p>
                  )}
                </div>
                <button type="submit" disabled={loading || (confirm.length > 0 && password !== confirm)}
                  className={`w-full flex items-center justify-center gap-2 py-3.5 text-white font-bold text-sm
                    rounded-xl transition-colors shadow-lg disabled:opacity-60 ${cfg.btnClass}`}>
                  {loading
                    ? <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                    : <><MdLockReset className="text-[16px]" /> Reset Password</>}
                </button>
              </form>
            )}

            {/* ── Step 4: Done ── */}
            {step === 'done' && (
              <div className="text-center space-y-4 py-2">
                <div className="w-16 h-16 rounded-full flex items-center justify-center mx-auto"
                  style={{ background: `${cfg.accent}15` }}>
                  <MdCheck className="text-[32px]" style={{ color: cfg.accent }} />
                </div>
                <div>
                  <h3 className="font-bold text-slate-800 text-lg">Password Reset!</h3>
                  <p className="text-sm text-slate-500 mt-1">
                    Your password has been updated. You can now sign in.
                  </p>
                </div>
                <NavLink to={loginPath}
                  className={`block w-full py-3.5 rounded-xl text-white font-bold text-sm text-center
                    transition-colors shadow-lg ${cfg.btnClass}`}>
                  Go to Login
                </NavLink>
              </div>
            )}

          </div>
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

export default ForgotPassword