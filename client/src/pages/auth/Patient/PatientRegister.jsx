import { useRef, useState } from 'react'
import { NavLink, useNavigate } from 'react-router-dom'
import {
  MdArrowBack,
  MdArrowForward,
  MdCheckCircle,
  MdLock,
  MdPerson,
  MdPhone,
  MdVisibility,
  MdVisibilityOff,
} from 'react-icons/md'
import logo from '../../../assets/logo-removebg.png'
import { useAuth } from '../../../context/AuthContext'

const INPUT_CLASS = `w-full rounded-xl border-2 border-slate-200 bg-slate-50 px-3.5 py-3 text-sm
  text-slate-800 placeholder-slate-300 transition-all focus:border-emerald-400 focus:bg-white
  focus:outline-none focus:ring-2 focus:ring-emerald-400/10`

const LABEL_CLASS = 'mb-1.5 block text-[11px] font-bold uppercase tracking-widest text-slate-500'

const PasswordInput = ({ name, value, onChange, placeholder }) => {
  const [show, setShow] = useState(false)

  return (
    <div className="relative">
      <MdLock className="absolute left-3.5 top-1/2 -translate-y-1/2 text-[17px] text-slate-400" />
      <input
        type={show ? 'text' : 'password'}
        name={name}
        value={value}
        onChange={onChange}
        required
        placeholder={placeholder}
        className={`${INPUT_CLASS} pl-10 pr-11`}
      />
      <button
        type="button"
        onClick={() => setShow((current) => !current)}
        className="absolute right-3.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
      >
        {show ? <MdVisibilityOff className="text-[17px]" /> : <MdVisibility className="text-[17px]" />}
      </button>
    </div>
  )
}

const OtpBoxes = ({ value, onChange }) => {
  const refs = useRef([])
  const digits = value.split('')

  const writeDigit = (index, digit) => {
    const next = Array.from({ length: 6 }, (_, i) => digits[i] || '')
    next[index] = digit
    onChange(next.join('').slice(0, 6))
  }

  const handleInput = (index, event) => {
    const numeric = event.target.value.replace(/\D/g, '').slice(-1)
    writeDigit(index, numeric)
    if (numeric && index < 5) refs.current[index + 1]?.focus()
  }

  const handleKey = (index, event) => {
    if (event.key === 'Backspace') {
      if (digits[index]) writeDigit(index, '')
      else if (index > 0) refs.current[index - 1]?.focus()
      return
    }
    if (event.key === 'ArrowLeft' && index > 0) refs.current[index - 1]?.focus()
    if (event.key === 'ArrowRight' && index < 5) refs.current[index + 1]?.focus()
  }

  const handlePaste = (event) => {
    const pasted = event.clipboardData.getData('text').replace(/\D/g, '').slice(0, 6)
    if (pasted) {
      onChange(pasted)
      refs.current[Math.min(pasted.length, 5)]?.focus()
    }
    event.preventDefault()
  }

  return (
    <div className="flex justify-center gap-1 px-1 sm:gap-3">
      {Array.from({ length: 6 }).map((_, index) => (
        <input
          key={index}
          ref={(element) => { refs.current[index] = element }}
          type="text"
          inputMode="numeric"
          maxLength={1}
          value={digits[index] || ''}
          onChange={(event) => handleInput(index, event)}
          onKeyDown={(event) => handleKey(index, event)}
          onPaste={handlePaste}
          className={`h-14 w-11 select-none rounded-2xl border-2 text-center text-2xl font-black outline-none transition-all sm:h-16 sm:w-14 ${
            digits[index]
              ? 'border-emerald-400 bg-emerald-50 text-emerald-700'
              : 'border-slate-200 bg-slate-50 text-slate-800'
          } focus:border-emerald-400 focus:bg-white focus:ring-2 focus:ring-emerald-400/20`}
        />
      ))}
    </div>
  )
}

const RegistrationForm = ({ onSuccess }) => {
  const [form, setForm] = useState({
    full_name: '',
    phone: '',
    password: '',
    confirmPassword: '',
    receive_promotions: false,
  })
  const [consentGiven, setConsentGiven] = useState(false)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  const updateField = (event) => {
    const { name, type, checked, value } = event.target
    setForm((prev) => ({ ...prev, [name]: type === 'checkbox' ? checked : value }))
    setError('')
  }

  const handleSubmit = async (event) => {
    event.preventDefault()
    if (form.password !== form.confirmPassword) {
      setError('Passwords do not match.')
      return
    }
    if (form.password.length < 6) {
      setError('Password must be at least 6 characters.')
      return
    }

    setLoading(true)
    try {
      const res = await fetch('/api/patient/register', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...form, consent_given: consentGiven }),
      })
      const data = await res.json()
      if (!res.ok) {
        setError(data.message || 'Registration failed.')
        return
      }
      onSuccess({ phone: data.phone || form.phone, devOtp: data.dev_otp || null })
    } catch {
      setError('Cannot connect to server.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-gradient-to-br from-[#0b1a2c] via-[#0f2540] to-[#0b1a2c] p-4 py-10">
      <div className="fixed right-0 top-0 h-96 w-96 rounded-full bg-emerald-500/5 blur-3xl pointer-events-none" />
      <div className="fixed bottom-0 left-0 h-72 w-72 rounded-full bg-sky-500/5 blur-3xl pointer-events-none" />

      <div className="relative w-full max-w-xl">
        <div className="mb-6 flex flex-col items-center">
          <div className="mb-3 flex h-14 w-14 items-center justify-center rounded-2xl border border-white/10 bg-white/10 shadow-[0_8px_32px_rgba(0,0,0,0.3)]">
            <img src={logo} alt="Carait" className="h-10 w-10 object-contain" />
          </div>
          <h1 className="text-xl font-black tracking-tight text-white">Carait Clinic</h1>
          <p className="mt-0.5 text-sm text-slate-400">Create your patient account</p>
        </div>

        <div className="overflow-hidden rounded-3xl bg-white shadow-2xl">
          <div className="h-1 bg-slate-100">
            <div className="h-1 w-1/2 bg-emerald-500 transition-all" />
          </div>

          <div className="bg-gradient-to-r from-emerald-500 to-emerald-600 px-6 py-5">
            <div className="mb-1 flex items-center gap-2 text-xs text-white/60">
              <span className="rounded-full bg-white/20 px-2 py-0.5 font-bold">Step 1 of 2</span>
            </div>
            <h2 className="text-lg font-bold text-white">Fast Registration</h2>
            <p className="mt-0.5 text-sm text-emerald-100">We only need your name, mobile number, and password.</p>
          </div>

          <form onSubmit={handleSubmit} className="space-y-4 px-5 py-6 sm:px-8">
            {error && (
              <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-600">
                {error}
              </div>
            )}

            <div>
              <label className={LABEL_CLASS}>Full Name</label>
              <div className="relative">
                <MdPerson className="absolute left-3.5 top-1/2 -translate-y-1/2 text-[17px] text-slate-400" />
                <input
                  type="text"
                  name="full_name"
                  value={form.full_name}
                  onChange={updateField}
                  required
                  placeholder="e.g. Juan dela Cruz"
                  className={`${INPUT_CLASS} pl-10`}
                />
              </div>
            </div>

            <div>
              <label className={LABEL_CLASS}>Phone Number</label>
              <div className="relative">
                <MdPhone className="absolute left-3.5 top-1/2 -translate-y-1/2 text-[17px] text-slate-400" />
                <input
                  type="tel"
                  name="phone"
                  value={form.phone}
                  onChange={updateField}
                  required
                  placeholder="09XXXXXXXXX or +639XXXXXXXXX"
                  className={`${INPUT_CLASS} pl-10`}
                />
              </div>
            </div>

            <div className="border-t border-slate-100 pt-1">
              <p className="text-[10px] font-bold uppercase tracking-widest text-slate-400">Security</p>
            </div>

            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div>
                <label className={LABEL_CLASS}>Password</label>
                <PasswordInput name="password" value={form.password} onChange={updateField} placeholder="Min 6 characters" />
              </div>
              <div>
                <label className={LABEL_CLASS}>Confirm Password</label>
                <PasswordInput name="confirmPassword" value={form.confirmPassword} onChange={updateField} placeholder="Repeat password" />
                {form.confirmPassword && form.password !== form.confirmPassword && (
                  <p className="mt-1 text-xs text-red-500">Passwords do not match.</p>
                )}
              </div>
            </div>

            <label className="flex items-start gap-3 rounded-2xl border border-slate-200 bg-slate-50 px-4 py-4 text-sm text-slate-600">
              <input
                type="checkbox"
                name="receive_promotions"
                checked={form.receive_promotions}
                onChange={updateField}
                className="mt-1 h-4 w-4 rounded border-slate-300 text-emerald-600"
              />
              <span>I want to receive promotions and clinic updates by email.</span>
            </label>

            <label className="flex items-start gap-3 rounded-2xl border border-slate-200 bg-slate-50 px-4 py-4 text-sm text-slate-600">
              <input
                type="checkbox"
                checked={consentGiven}
                onChange={(event) => setConsentGiven(event.target.checked)}
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

            <button
              type="submit"
              disabled={loading || !consentGiven}
              className="mt-2 flex w-full items-center justify-center gap-2 rounded-xl bg-emerald-500 py-3.5 text-sm font-bold text-white shadow-lg shadow-emerald-500/20 transition-colors hover:bg-emerald-600 disabled:opacity-60"
            >
              {loading ? (
                <div className="h-5 w-5 animate-spin rounded-full border-2 border-white/30 border-t-white" />
              ) : (
                <>
                  Send SMS Verification Code
                  <MdArrowForward className="text-[16px]" />
                </>
              )}
            </button>

            <p className="text-center text-sm text-slate-400">
              Already have an account?{' '}
              <NavLink to="/patient/login" className="font-bold text-emerald-600 hover:text-emerald-700">
                Sign in
              </NavLink>
            </p>
          </form>
        </div>

        <p className="mt-4 text-center">
          <NavLink to="/" className="text-xs text-slate-500 transition-colors hover:text-white">
            {'<-'} Back to home
          </NavLink>
        </p>
      </div>
    </div>
  )
}

const VerificationForm = ({ pendingPhone, devOtp, onBack }) => {
  const [code, setCode] = useState(devOtp || '')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const { login } = useAuth()
  const navigate = useNavigate()

  const handleVerify = async (event) => {
    event.preventDefault()
    if (code.length < 6) {
      setError('Please enter the complete 6-digit code.')
      return
    }

    setError('')
    setLoading(true)
    try {
      const res = await fetch('/api/patient/register/verify', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ phone: pendingPhone, code }),
      })
      const data = await res.json()
      if (!res.ok) {
        setError(data.message || 'Verification failed.')
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
      <div className="w-full max-w-fit">
        <div className="mb-6 flex flex-col items-center">
          <div className="mb-3 flex h-14 w-14 items-center justify-center rounded-2xl border border-white/10 bg-white/10">
            <img src={logo} alt="Carait" className="h-10 w-10 object-contain" />
          </div>
          <h1 className="text-xl font-black text-white">Carait Clinic</h1>
        </div>

        <div className="overflow-hidden rounded-3xl bg-white shadow-2xl">
          <div className="h-1 bg-slate-100">
            <div className="h-1 w-full bg-emerald-500 transition-all" />
          </div>

          <div className="bg-gradient-to-r from-emerald-500 to-emerald-600 px-6 py-5 text-center">
            <span className="rounded-full bg-white/20 px-2 py-0.5 text-xs font-bold text-white/60">Step 2 of 2</span>
            <h2 className="mt-1 text-lg font-bold text-white">Verify Your Phone</h2>
            <p className="mt-0.5 text-sm text-emerald-100">Code sent to</p>
            <p className="text-sm font-bold text-white">{pendingPhone}</p>
          </div>

          <form onSubmit={handleVerify} className="space-y-5 px-6 py-6">
            <div className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-center">
              <p className="text-xs text-amber-700">
                Check your SMS inbox. The code expires in 10 minutes.
                {devOtp ? ` Dev OTP: ${devOtp}` : ''}
              </p>
            </div>

            {error && (
              <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-center text-sm text-red-600">
                {error}
              </div>
            )}

            <div>
              <label className="mb-3 block text-center text-[11px] font-bold uppercase tracking-widest text-slate-500">
                6-Digit Verification Code
              </label>
              <OtpBoxes value={code} onChange={(next) => { setCode(next); setError('') }} />
            </div>

            <button
              type="submit"
              disabled={loading || code.length < 6}
              className="flex w-full items-center justify-center gap-2 rounded-xl bg-emerald-500 py-3.5 text-sm font-bold text-white transition-colors hover:bg-emerald-600 disabled:opacity-60"
            >
              {loading ? (
                <div className="h-5 w-5 animate-spin rounded-full border-2 border-white/30 border-t-white" />
              ) : (
                <>
                  <MdCheckCircle className="text-[16px]" />
                  Verify and Create Account
                </>
              )}
            </button>

            <div className="flex items-center justify-center gap-4 text-xs">
              <button
                type="button"
                onClick={onBack}
                className="flex items-center gap-1 text-slate-400 transition-colors hover:text-slate-600"
              >
                <MdArrowBack className="text-[13px]" />
                Change phone number
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  )
}

const PatientRegister = () => {
  const [pendingRegistration, setPendingRegistration] = useState(null)

  if (pendingRegistration) {
    return (
      <VerificationForm
        pendingPhone={pendingRegistration.phone}
        devOtp={pendingRegistration.devOtp}
        onBack={() => setPendingRegistration(null)}
      />
    )
  }

  return <RegistrationForm onSuccess={setPendingRegistration} />
}

export default PatientRegister
