// client/src/pages/auth/ForgotPassword.jsx
// 4-step password recovery. Patient recovery defaults to email, with SMS as an alternate method.

import { useEffect, useRef, useState } from 'react'
import { NavLink } from 'react-router-dom'
import {
  MdArrowBack,
  MdArrowForward,
  MdCheck,
  MdEmail,
  MdLock,
  MdLockReset,
  MdPhone,
  MdRefresh,
  MdVisibility,
  MdVisibilityOff,
} from 'react-icons/md'
import PasswordRequirements from '../../components/PasswordRequirements'
import { getPasswordValidationError, isPasswordValid } from '../../utils/passwordPolicy'

const ROLE_CFG = {
  patient: { accent: '#10b981', light: '#ecfdf5', border: 'focus:border-emerald-400', ring: 'focus:ring-emerald-400/10', badge: 'Patient', btnClass: 'bg-emerald-500 hover:bg-emerald-600 shadow-emerald-500/25' },
  doctor:  { accent: '#7c3aed', light: '#f5f3ff', border: 'focus:border-violet-400', ring: 'focus:ring-violet-400/10', badge: 'Doctor', btnClass: 'bg-violet-600 hover:bg-violet-700 shadow-violet-500/25' },
  staff:   { accent: '#0ea5e9', light: '#f0f9ff', border: 'focus:border-sky-400', ring: 'focus:ring-sky-400/10', badge: 'Staff', btnClass: 'bg-sky-500 hover:bg-sky-600 shadow-sky-500/25' },
}

const OtpInput = ({ value, onChange, accent, light }) => {
  const inputs = useRef([])
  const digits = value.split('')

  const writeDigit = (index, digit) => {
    const next = Array.from({ length: 6 }, (_, idx) => digits[idx] || '')
    next[index] = digit
    onChange(next.join('').slice(0, 6))
  }

  const handleInput = (index, event) => {
    const numeric = event.target.value.replace(/\D/g, '').slice(-1)
    writeDigit(index, numeric)
    if (numeric && index < 5) inputs.current[index + 1]?.focus()
  }

  const handleKey = (index, event) => {
    if (event.key === 'Backspace') {
      if (digits[index]) writeDigit(index, '')
      else if (index > 0) inputs.current[index - 1]?.focus()
      return
    }
    if (event.key === 'ArrowLeft' && index > 0) inputs.current[index - 1]?.focus()
    if (event.key === 'ArrowRight' && index < 5) inputs.current[index + 1]?.focus()
  }

  const handlePaste = (event) => {
    const pasted = event.clipboardData.getData('text').replace(/\D/g, '').slice(0, 6)
    if (pasted) {
      onChange(pasted)
      inputs.current[Math.min(pasted.length, 5)]?.focus()
    }
    event.preventDefault()
  }

  return (
    <div className="flex justify-center gap-2 sm:gap-3">
      {Array.from({ length: 6 }).map((_, index) => (
        <input
          key={index}
          ref={(element) => { inputs.current[index] = element }}
          type="text"
          inputMode="numeric"
          maxLength={1}
          value={digits[index] || ''}
          onChange={(event) => handleInput(index, event)}
          onKeyDown={(event) => handleKey(index, event)}
          onPaste={handlePaste}
          className={`h-14 w-11 rounded-2xl border-2 text-center text-2xl font-black text-slate-800 outline-none transition-all sm:w-12 ${digits[index] ? 'border-opacity-100 bg-opacity-10' : 'border-slate-200 bg-slate-50'} focus:ring-2`}
          style={{
            borderColor: digits[index] ? accent : undefined,
            backgroundColor: digits[index] ? light : undefined,
            color: digits[index] ? '#0f172a' : undefined,
          }}
        />
      ))}
    </div>
  )
}

const Steps = ({ current, cfg }) => {
  const steps = ['Recover', 'Verify', 'New Password', 'Done']
  return (
    <div className="mb-6 flex items-center justify-center gap-1">
      {steps.map((label, index) => (
        <div key={label} className="flex items-center">
          <div
            className={`flex h-7 w-7 items-center justify-center rounded-full text-xs font-bold transition-all ${index <= current ? 'text-white' : 'bg-slate-100 text-slate-400'}`}
            style={{ background: index <= current ? cfg.accent : undefined }}
          >
            {index < current ? <MdCheck className="text-[13px]" /> : index + 1}
          </div>
          {index < steps.length - 1 && (
            <div
              className="mx-1 h-0.5 w-8 rounded-full transition-all"
              style={{ background: index < current ? cfg.accent : '#e2e8f0' }}
            />
          )}
        </div>
      ))}
    </div>
  )
}

const ForgotPassword = ({ role }) => {
  const cfg = ROLE_CFG[role] || ROLE_CFG.patient
  const isPatient = role === 'patient'

  const [step, setStep] = useState('request')
  const [deliveryMethod, setDeliveryMethod] = useState('email')
  const [email, setEmail] = useState('')
  const [phone, setPhone] = useState('')
  const [maskedDestination, setMaskedDestination] = useState('')
  const [otp, setOtp] = useState('')
  const [devOtp, setDevOtp] = useState('')
  const [resetToken, setToken] = useState('')
  const [password, setPass] = useState('')
  const [confirm, setConfirm] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [showConfirm, setShowConfirm] = useState(false)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const [countdown, setCountdown] = useState(0)

  useEffect(() => {
    if (countdown <= 0) return undefined
    const timer = setTimeout(() => setCountdown((current) => current - 1), 1000)
    return () => clearTimeout(timer)
  }, [countdown])

  const effectiveMethod = isPatient ? deliveryMethod : 'email'
  const stepNum = { request: 0, otp: 1, reset: 2, done: 3 }[step]
  const loginPath = `/${role}/login`
  const recoveryLabel = effectiveMethod === 'sms' ? 'mobile number' : 'email address'
  const recoveryValue = effectiveMethod === 'sms' ? phone : email
  const alternateLabel = effectiveMethod === 'sms' ? 'Use email instead' : 'Use mobile number instead'

  const inpClass = `w-full rounded-xl border-2 border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-700 placeholder-slate-300 outline-none transition-all ${cfg.border} ${cfg.ring} focus:bg-white focus:ring-2`

  const resetToRequest = ({ alternate = false } = {}) => {
    if (alternate && isPatient) setDeliveryMethod((current) => current === 'email' ? 'sms' : 'email')
    setStep('request')
    setError('')
    setOtp('')
    setDevOtp('')
    setMaskedDestination('')
    setCountdown(0)
  }

  const handleRequest = async (event) => {
    event?.preventDefault()
    setError('')
    setLoading(true)

    try {
      const res = await fetch('/api/auth/forgot-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email,
          phone,
          role,
          delivery_method: effectiveMethod,
        }),
      })
      const data = await res.json()
      if (!res.ok) {
        setError(data.message || 'Password recovery could not be started.')
        return
      }

      setDevOtp(data.dev_otp || '')
      setMaskedDestination(data.masked_destination || recoveryValue)
      setStep('otp')
      setCountdown(60)
      setOtp('')
    } catch {
      setError('Cannot connect to server.')
    } finally {
      setLoading(false)
    }
  }

  const handleVerify = async () => {
    if (otp.length !== 6) {
      setError('Enter the complete 6-digit code.')
      return
    }

    setError('')
    setLoading(true)
    try {
      const res = await fetch('/api/auth/verify-otp', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email,
          phone,
          role,
          otp,
          delivery_method: effectiveMethod,
        }),
      })
      const data = await res.json()
      if (!res.ok) {
        setError(data.message || 'Invalid code.')
        return
      }
      setToken(data.resetToken)
      setStep('reset')
    } catch {
      setError('Cannot connect to server.')
    } finally {
      setLoading(false)
    }
  }

  const handleReset = async (event) => {
    event.preventDefault()
    const passwordError = getPasswordValidationError(password)
    if (passwordError) {
      setError(passwordError)
      return
    }
    if (password !== confirm) {
      setError('Passwords do not match.')
      return
    }

    setError('')
    setLoading(true)
    try {
      const res = await fetch('/api/auth/reset-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ resetToken, password }),
      })
      const data = await res.json()
      if (!res.ok) {
        setError(data.message || 'Reset failed.')
        return
      }
      setStep('done')
    } catch {
      setError('Cannot connect to server.')
    } finally {
      setLoading(false)
    }
  }

  const preventPaste = (event) => event.preventDefault()

  return (
    <div className="min-h-screen bg-gradient-to-br from-[#0b1a2c] via-[#0f2540] to-[#0b1a2c] flex items-center justify-center p-4">
      <div
        className="pointer-events-none fixed right-0 top-0 h-80 w-80 rounded-full opacity-50 blur-3xl"
        style={{ background: `${cfg.accent}15` }}
      />

      <div className="w-full max-w-sm">
        <div className="mb-6 flex flex-col items-center">
          <div className="mb-3 flex h-14 w-14 items-center justify-center rounded-2xl border border-white/10 bg-white/10">
            <img src="/logo.png" alt="Carait" className="h-10 w-10 object-contain" />
          </div>
          <h1 className="text-xl font-black text-white">Carait Clinic</h1>
          <span className="mt-1.5 rounded-full px-3 py-0.5 text-xs font-bold text-white/70" style={{ background: `${cfg.accent}30` }}>
            {cfg.badge} Portal
          </span>
        </div>

        <div className="overflow-hidden rounded-3xl bg-white shadow-2xl">
          <div className="h-1.5 bg-slate-100">
            <div
              className="h-1.5 rounded-full transition-all duration-500"
              style={{ width: `${(stepNum / 3) * 100}%`, background: cfg.accent }}
            />
          </div>

          <div className="space-y-5 px-6 py-6">
            <div className="text-center">
              <div className="mx-auto mb-3 flex h-14 w-14 items-center justify-center rounded-2xl" style={{ background: `${cfg.accent}15` }}>
                <MdLockReset className="text-[26px]" style={{ color: cfg.accent }} />
              </div>
              <h2 className="text-lg font-black text-slate-800">Reset Password</h2>
              <Steps current={stepNum} cfg={cfg} />
            </div>

            {error && (
              <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-center text-sm text-red-600">
                {error}
              </div>
            )}

            {step === 'request' && (
              <form onSubmit={handleRequest} className="space-y-4">
                <p className="text-center text-sm text-slate-500">
                  Enter your {cfg.badge.toLowerCase()} {recoveryLabel} and we'll send a verification code.
                </p>

                <div>
                  <label className="mb-1.5 block text-[11px] font-bold uppercase tracking-widest text-slate-500">
                    {effectiveMethod === 'sms' ? 'Mobile Number' : 'Email Address'}
                  </label>
                  <div className="relative">
                    {effectiveMethod === 'sms' ? (
                      <MdPhone className="absolute left-3.5 top-1/2 -translate-y-1/2 text-[17px] text-slate-400" />
                    ) : (
                      <MdEmail className="absolute left-3.5 top-1/2 -translate-y-1/2 text-[17px] text-slate-400" />
                    )}
                    <input
                      type={effectiveMethod === 'sms' ? 'tel' : 'email'}
                      required
                      value={recoveryValue}
                      onChange={(event) => {
                        if (effectiveMethod === 'sms') setPhone(event.target.value)
                        else setEmail(event.target.value)
                        setError('')
                      }}
                      placeholder={effectiveMethod === 'sms' ? '09XXXXXXXXX' : 'your@email.com'}
                      className={`${inpClass} pl-10`}
                    />
                  </div>
                </div>

                <button
                  type="submit"
                  disabled={loading}
                  className={`flex w-full items-center justify-center gap-2 rounded-xl py-3.5 text-sm font-bold text-white shadow-lg transition-colors disabled:opacity-60 ${cfg.btnClass}`}
                >
                  {loading ? (
                    <div className="h-5 w-5 animate-spin rounded-full border-2 border-white/30 border-t-white" />
                  ) : (
                    <>Send Code <MdArrowForward className="text-[16px]" /></>
                  )}
                </button>

                {isPatient && (
                  <button
                    type="button"
                    onClick={() => {
                      setDeliveryMethod((current) => current === 'email' ? 'sms' : 'email')
                      setError('')
                    }}
                    className="flex w-full items-center justify-center gap-1 text-xs font-semibold hover:underline"
                    style={{ color: cfg.accent }}
                  >
                    {effectiveMethod === 'sms' ? <MdEmail /> : <MdPhone />}
                    Try another way · {alternateLabel}
                  </button>
                )}

                <p className="text-center text-sm text-slate-500">
                  Remember it?{' '}
                  <NavLink to={loginPath} className="font-bold hover:underline" style={{ color: cfg.accent }}>
                    Back to login
                  </NavLink>
                </p>
              </form>
            )}

            {step === 'otp' && (
              <div className="space-y-5">
                <div className="text-center">
                  <p className="text-sm text-slate-600">
                    Code sent by {effectiveMethod === 'sms' ? 'SMS' : 'email'} to{' '}
                    <strong className="text-slate-800">{maskedDestination || recoveryValue}</strong>
                  </p>
                  <p className="mt-1 text-xs text-slate-400">Expires in 10 minutes</p>
                </div>

                {devOtp && (
                  <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-center text-sm text-amber-700">
                    Dev OTP: <strong>{devOtp}</strong>
                  </div>
                )}

                <OtpInput
                  value={otp}
                  onChange={(value) => { setOtp(value); setError('') }}
                  accent={cfg.accent}
                  light={cfg.light}
                />

                <button
                  onClick={handleVerify}
                  disabled={loading || otp.length !== 6}
                  className={`flex w-full items-center justify-center gap-2 rounded-xl py-3.5 text-sm font-bold text-white shadow-lg transition-colors disabled:opacity-60 ${cfg.btnClass}`}
                >
                  {loading ? (
                    <div className="h-5 w-5 animate-spin rounded-full border-2 border-white/30 border-t-white" />
                  ) : (
                    <><MdCheck className="text-[16px]" /> Verify Code</>
                  )}
                </button>

                <div className="flex flex-wrap items-center justify-center gap-x-4 gap-y-2">
                  {countdown > 0 ? (
                    <p className="text-xs text-slate-400">Resend in <strong>{countdown}s</strong></p>
                  ) : (
                    <button
                      onClick={handleRequest}
                      disabled={loading}
                      className="flex items-center gap-1 text-xs font-semibold hover:underline disabled:opacity-50"
                      style={{ color: cfg.accent }}
                    >
                      <MdRefresh className="text-[13px]" /> Resend Code
                    </button>
                  )}

                  <span className="text-slate-200">|</span>

                  <button
                    onClick={() => resetToRequest()}
                    className="flex items-center gap-1 text-xs text-slate-400 transition-colors hover:text-slate-600"
                  >
                    <MdArrowBack className="text-[13px]" /> Change {recoveryLabel}
                  </button>

                  {isPatient && (
                    <>
                      <span className="text-slate-200">|</span>
                      <button
                        onClick={() => resetToRequest({ alternate: true })}
                        className="flex items-center gap-1 text-xs font-semibold hover:underline"
                        style={{ color: cfg.accent }}
                      >
                        Try another way
                      </button>
                    </>
                  )}
                </div>
              </div>
            )}

            {step === 'reset' && (
              <form onSubmit={handleReset} className="space-y-4">
                <div className="flex items-center gap-2 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3">
                  <MdCheck className="shrink-0 text-[16px] text-emerald-500" />
                  <p className="text-xs text-emerald-700">Code verified! Choose your new password.</p>
                </div>

                <div>
                  <label className="mb-1.5 block text-[11px] font-bold uppercase tracking-widest text-slate-500">New Password</label>
                  <div className="relative">
                    <MdLock className="absolute left-3.5 top-1/2 -translate-y-1/2 text-[17px] text-slate-400" />
                    <input
                      type={showPassword ? 'text' : 'password'}
                      required
                      minLength={8}
                      maxLength={128}
                      value={password}
                      onChange={(event) => { setPass(event.target.value); setError('') }}
                      placeholder="8+ characters"
                      autoComplete="new-password"
                      className={`${inpClass} pl-10 pr-11`}
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword((current) => !current)}
                      className="absolute right-3.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
                      aria-label={showPassword ? 'Hide password' : 'Show password'}
                    >
                      {showPassword ? <MdVisibilityOff className="text-[17px]" /> : <MdVisibility className="text-[17px]" />}
                    </button>
                  </div>
                </div>

                <PasswordRequirements password={password} />

                <div>
                  <label className="mb-1.5 block text-[11px] font-bold uppercase tracking-widest text-slate-500">Confirm Password</label>
                  <div className="relative">
                    <MdLock className="absolute left-3.5 top-1/2 -translate-y-1/2 text-[17px] text-slate-400" />
                    <input
                      type={showConfirm ? 'text' : 'password'}
                      required
                      minLength={8}
                      maxLength={128}
                      value={confirm}
                      onChange={(event) => { setConfirm(event.target.value); setError('') }}
                      onPaste={preventPaste}
                      onDrop={preventPaste}
                      placeholder="Repeat password"
                      autoComplete="off"
                      className={`${inpClass} pl-10 pr-11`}
                    />
                    <button
                      type="button"
                      onClick={() => setShowConfirm((current) => !current)}
                      className="absolute right-3.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
                      aria-label={showConfirm ? 'Hide password' : 'Show password'}
                    >
                      {showConfirm ? <MdVisibilityOff className="text-[17px]" /> : <MdVisibility className="text-[17px]" />}
                    </button>
                  </div>
                  <p className="mt-1 text-[11px] text-slate-400">Paste is disabled for confirmation.</p>
                  {confirm && password !== confirm && (
                    <p className="mt-1 text-xs text-red-500">Passwords do not match.</p>
                  )}
                </div>

                <button
                  type="submit"
                  disabled={loading || !isPasswordValid(password) || !confirm || password !== confirm}
                  className={`flex w-full items-center justify-center gap-2 rounded-xl py-3.5 text-sm font-bold text-white shadow-lg transition-colors disabled:opacity-60 ${cfg.btnClass}`}
                >
                  {loading ? (
                    <div className="h-5 w-5 animate-spin rounded-full border-2 border-white/30 border-t-white" />
                  ) : (
                    <><MdLockReset className="text-[16px]" /> Reset Password</>
                  )}
                </button>
              </form>
            )}

            {step === 'done' && (
              <div className="space-y-4 py-2 text-center">
                <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full" style={{ background: cfg.light }}>
                  <MdCheck className="text-[28px]" style={{ color: cfg.accent }} />
                </div>
                <div>
                  <h3 className="text-lg font-black text-slate-800">Password Updated</h3>
                  <p className="mt-1 text-sm leading-relaxed text-slate-500">Your password has been reset successfully. You can now sign in.</p>
                </div>
                <NavLink
                  to={loginPath}
                  className={`flex w-full items-center justify-center gap-2 rounded-xl py-3.5 text-sm font-bold text-white shadow-lg transition-colors ${cfg.btnClass}`}
                >
                  Back to Login <MdArrowForward className="text-[16px]" />
                </NavLink>
              </div>
            )}
          </div>
        </div>

        <div className="mt-5 text-center">
          <NavLink to="/" className="text-xs text-slate-500 transition-colors hover:text-white">
            ← Back to home
          </NavLink>
        </div>
      </div>
    </div>
  )
}

export default ForgotPassword

