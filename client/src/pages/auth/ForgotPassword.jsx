// client/src/pages/auth/ForgotPassword.jsx
// Flow: Enter email → Receive 6-digit OTP → Enter OTP → Set new password → Done

import { useState, useEffect, useRef } from 'react'
import { NavLink } from 'react-router-dom'
import logo from '../../assets/logo-removebg.png'
import {
  MdEmail, MdLock, MdVisibility, MdVisibilityOff,
  MdCheck, MdArrowBack, MdRefresh
} from 'react-icons/md'

const ROLE_CFG = {
  patient: { accent: 'rgb(43,124,110)', light: 'rgb(240,250,247)', badge: 'Patient', border: 'focus-within:border-emerald-400' },
  doctor:  { accent: '#4c1d95',         light: '#f5f3ff',          badge: 'Doctor',  border: 'focus-within:border-violet-400'  },
  staff:   { accent: '#0b1a2c',         light: '#f0f9ff',          badge: 'Staff',   border: 'focus-within:border-sky-400'     },
}

// ── OTP Input — 6 individual digit boxes ──────────────────────────────────────
const OtpInput = ({ value, onChange }) => {
  const inputs = useRef([])
  const digits = value.split('')

  const handleKey = (i, e) => {
    if (e.key === 'Backspace') {
      if (digits[i]) {
        const next = digits.map((d, idx) => idx === i ? '' : d).join('')
        onChange(next)
      } else if (i > 0) {
        inputs.current[i - 1]?.focus()
      }
      return
    }
    if (!/^\d$/.test(e.key)) return
    const next = digits.map((d, idx) => idx === i ? e.key : d).join('').slice(0, 6)
    onChange(next)
    if (i < 5) inputs.current[i + 1]?.focus()
  }

  const handlePaste = (e) => {
    const pasted = e.clipboardData.getData('text').replace(/\D/g, '').slice(0, 6)
    if (pasted) { onChange(pasted); inputs.current[Math.min(pasted.length, 5)]?.focus() }
    e.preventDefault()
  }

  return (
    <div className="flex gap-2 justify-center">
      {Array.from({ length: 6 }).map((_, i) => (
        <input
          key={i}
          ref={el => inputs.current[i] = el}
          type="text"
          inputMode="numeric"
          maxLength={1}
          value={digits[i] || ''}
          onChange={() => {}}
          onKeyDown={e => handleKey(i, e)}
          onPaste={handlePaste}
          className={`w-11 h-12 text-center text-xl font-bold text-slate-800 border-2 rounded-xl
            outline-none transition-all
            ${digits[i] ? 'border-emerald-400 bg-emerald-50' : 'border-slate-200 bg-slate-50'}
            focus:border-emerald-400 focus:bg-white`}
        />
      ))}
    </div>
  )
}

// ── Main Component ────────────────────────────────────────────────────────────
const ForgotPassword = ({ role }) => {
  const cfg = ROLE_CFG[role] || ROLE_CFG.patient

  // step: 'request' | 'otp' | 'reset' | 'done'
  const [step,        setStep]       = useState('request')
  const [email,       setEmail]      = useState('')
  const [otp,         setOtp]        = useState('')
  const [resetToken,  setResetToken] = useState('')
  const [password,    setPass]       = useState('')
  const [confirm,     setConfirm]    = useState('')
  const [showPass,    setShowPass]   = useState(false)
  const [error,       setError]      = useState('')
  const [loading,     setLoading]    = useState(false)
  const [countdown,   setCountdown]  = useState(0) // resend cooldown

  // Countdown timer for resend
  useEffect(() => {
    if (countdown <= 0) return
    const t = setTimeout(() => setCountdown(c => c - 1), 1000)
    return () => clearTimeout(t)
  }, [countdown])

  // ── Step 1: Request OTP ───────────────────────────────────────────────────
  const handleRequest = async (e) => {
    e?.preventDefault()
    setError(''); setLoading(true)
    try {
      const res  = await fetch('/api/auth/forgot-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, role }),
      })
      const data = await res.json()
      if (!res.ok) { setError(data.message || 'Request failed.'); return }
      setStep('otp')
      setCountdown(60)  // 60s before they can resend
      setOtp('')
    } catch {
      setError('Cannot connect to server.')
    } finally {
      setLoading(false)
    }
  }

  // ── Step 2: Verify OTP ────────────────────────────────────────────────────
  const handleVerify = async () => {
    if (otp.length !== 6) { setError('Please enter the complete 6-digit code.'); return }
    setError(''); setLoading(true)
    try {
      const res  = await fetch('/api/auth/verify-otp', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, role, otp }),
      })
      const data = await res.json()
      if (!res.ok) { setError(data.message || 'Verification failed.'); return }
      setResetToken(data.resetToken)
      setStep('reset')
    } catch {
      setError('Cannot connect to server.')
    } finally {
      setLoading(false)
    }
  }

  // ── Step 3: Set new password ──────────────────────────────────────────────
  const handleReset = async (e) => {
    e.preventDefault()
    if (password.length < 6) { setError('Password must be at least 6 characters.'); return }
    if (password !== confirm) { setError('Passwords do not match.'); return }
    setError(''); setLoading(true)
    try {
      const res  = await fetch('/api/auth/reset-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ resetToken, password }),
      })
      const data = await res.json()
      if (!res.ok) { setError(data.message || 'Reset failed.'); return }
      setStep('done')
    } catch {
      setError('Cannot connect to server.')
    } finally {
      setLoading(false)
    }
  }

  const loginPath = `/${role}/login`

  const inputBase = `flex items-center gap-2.5 bg-slate-50 border-2 border-slate-200 rounded-xl px-3 py-2.5 ${cfg.border} transition-colors`

  return (
    <div className="min-h-screen flex items-center justify-center p-6"
      style={{ background: `linear-gradient(135deg, ${cfg.light} 0%, #f8fafc 100%)` }}>
      <div className="w-full max-w-[420px] bg-white rounded-3xl shadow-xl overflow-hidden">

        {/* Header */}
        <div className="flex flex-col items-center py-7 px-8" style={{ background: cfg.accent }}>
          <img src={logo} alt="logo"
            className="border-2 border-white/30 rounded-full w-12 h-12 object-contain mb-3 bg-white/10 p-1" />
          <h2 className="text-white font-bold text-lg tracking-wide">
            {step === 'reset' || step === 'done' ? 'Set New Password' : 'Forgot Password'}
          </h2>
          <span className="text-white/60 text-xs font-semibold uppercase tracking-widest mt-1">
            {cfg.badge} Account
          </span>
        </div>

        <div className="px-8 py-7">

          {/* ── Step 1: Enter email ── */}
          {step === 'request' && (
            <form onSubmit={handleRequest} className="space-y-5">
              <p className="text-sm text-slate-600 leading-relaxed">
                Enter your registered email and we'll send you a 6-digit verification code.
              </p>

              {error && (
                <div className="bg-red-50 border border-red-200 text-red-700 text-sm rounded-xl px-4 py-3">{error}</div>
              )}

              <div>
                <label className="text-xs font-bold text-slate-600 uppercase tracking-wide mb-1.5 block">Email Address</label>
                <div className={inputBase}>
                  <MdEmail className="text-slate-400 text-[16px] shrink-0" />
                  <input type="email" required value={email} onChange={e => setEmail(e.target.value)}
                    placeholder="your@email.com"
                    className="flex-1 text-sm text-slate-700 placeholder-slate-300 bg-transparent outline-none" />
                </div>
              </div>

              <button type="submit" disabled={loading}
                className="w-full py-3 rounded-xl text-white font-bold text-sm disabled:opacity-50 transition-opacity"
                style={{ background: cfg.accent }}>
                {loading ? 'Sending Code…' : 'Send Verification Code'}
              </button>

              <p className="text-center text-sm text-slate-500">
                Remember it?{' '}
                <NavLink to={loginPath} className="font-semibold hover:underline" style={{ color: cfg.accent }}>
                  Back to login
                </NavLink>
              </p>
            </form>
          )}

          {/* ── Step 2: Enter OTP ── */}
          {step === 'otp' && (
            <div className="space-y-6">
              <div className="text-center">
                <div className="w-14 h-14 rounded-full bg-emerald-100 flex items-center justify-center mx-auto mb-3">
                  <MdEmail className="text-emerald-500 text-[28px]" />
                </div>
                <p className="text-sm font-bold text-slate-800">Check your email</p>
                <p className="text-xs text-slate-500 mt-1 leading-relaxed">
                  We sent a 6-digit code to <strong className="text-slate-700">{email}</strong>.
                  <br />It expires in 10 minutes.
                </p>
              </div>

              {error && (
                <div className="bg-red-50 border border-red-200 text-red-700 text-sm rounded-xl px-4 py-3 text-center">{error}</div>
              )}

              <div className="space-y-2">
                <label className="text-xs font-bold text-slate-600 uppercase tracking-wide block text-center">
                  Verification Code
                </label>
                <OtpInput value={otp} onChange={v => { setOtp(v); setError('') }} />
              </div>

              <button
                onClick={handleVerify}
                disabled={loading || otp.length !== 6}
                className="w-full py-3 rounded-xl text-white font-bold text-sm disabled:opacity-50 transition-opacity"
                style={{ background: cfg.accent }}>
                {loading ? 'Verifying…' : 'Verify Code'}
              </button>

              {/* Resend */}
              <div className="text-center space-y-2">
                {countdown > 0 ? (
                  <p className="text-xs text-slate-400">Resend code in <strong className="text-slate-600">{countdown}s</strong></p>
                ) : (
                  <button onClick={handleRequest} disabled={loading}
                    className="flex items-center gap-1.5 text-xs font-semibold mx-auto hover:underline disabled:opacity-50"
                    style={{ color: cfg.accent }}>
                    <MdRefresh className="text-[14px]" /> Resend Code
                  </button>
                )}
                <button onClick={() => { setStep('request'); setError(''); setOtp('') }}
                  className="flex items-center gap-1 text-xs text-slate-400 hover:text-slate-600 mx-auto transition-colors">
                  <MdArrowBack className="text-[13px]" /> Change email
                </button>
              </div>
            </div>
          )}

          {/* ── Step 3: Set new password ── */}
          {step === 'reset' && (
            <form onSubmit={handleReset} className="space-y-5">
              <div className="flex items-center gap-2.5 bg-emerald-50 border border-emerald-200 rounded-xl px-4 py-3">
                <MdCheck className="text-emerald-500 text-[16px] shrink-0" />
                <p className="text-xs text-emerald-700">Code verified! Choose a strong new password.</p>
              </div>

              {error && (
                <div className="bg-red-50 border border-red-200 text-red-700 text-sm rounded-xl px-4 py-3">{error}</div>
              )}

              <div>
                <label className="text-xs font-bold text-slate-600 uppercase tracking-wide mb-1.5 block">New Password</label>
                <div className={inputBase}>
                  <MdLock className="text-slate-400 text-[16px] shrink-0" />
                  <input type={showPass ? 'text' : 'password'} required minLength={6}
                    value={password} onChange={e => setPass(e.target.value)}
                    placeholder="Min 6 characters"
                    className="flex-1 text-sm text-slate-700 placeholder-slate-300 bg-transparent outline-none" />
                  <button type="button" onClick={() => setShowPass(s => !s)}
                    className="text-slate-400 hover:text-slate-600 transition-colors shrink-0">
                    {showPass ? <MdVisibilityOff className="text-[16px]" /> : <MdVisibility className="text-[16px]" />}
                  </button>
                </div>
              </div>

              <div>
                <label className="text-xs font-bold text-slate-600 uppercase tracking-wide mb-1.5 block">Confirm Password</label>
                <div className={inputBase}>
                  <MdLock className="text-slate-400 text-[16px] shrink-0" />
                  <input type={showPass ? 'text' : 'password'} required
                    value={confirm} onChange={e => setConfirm(e.target.value)}
                    placeholder="Repeat password"
                    className="flex-1 text-sm text-slate-700 placeholder-slate-300 bg-transparent outline-none" />
                </div>
                {confirm && password && confirm !== password && (
                  <p className="text-xs text-red-500 mt-1">Passwords do not match.</p>
                )}
              </div>

              <button type="submit" disabled={loading || (confirm.length > 0 && password !== confirm)}
                className="w-full py-3 rounded-xl text-white font-bold text-sm disabled:opacity-50 transition-opacity"
                style={{ background: cfg.accent }}>
                {loading ? 'Resetting…' : 'Reset Password'}
              </button>
            </form>
          )}

          {/* ── Step 4: Success ── */}
          {step === 'done' && (
            <div className="text-center space-y-5">
              <div className="w-16 h-16 rounded-full bg-emerald-100 flex items-center justify-center mx-auto">
                <MdCheck className="text-emerald-500 text-[32px]" />
              </div>
              <div>
                <h3 className="font-bold text-slate-800 text-lg">Password Reset!</h3>
                <p className="text-sm text-slate-500 mt-2 leading-relaxed">
                  Your password has been updated. You can now log in with your new password.
                </p>
              </div>
              <NavLink to={loginPath}
                className="block w-full py-3 rounded-xl text-white font-bold text-sm text-center hover:opacity-90 transition-opacity"
                style={{ background: cfg.accent }}>
                Go to Login
              </NavLink>
            </div>
          )}

        </div>
      </div>
    </div>
  )
}

export default ForgotPassword