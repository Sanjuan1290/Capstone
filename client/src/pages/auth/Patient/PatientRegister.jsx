import { useRef, useState } from 'react'
import { NavLink, useNavigate } from 'react-router-dom'
import {
  MdArrowBack,
  MdArrowForward,
  MdCheckCircle,
  MdEmail,
  MdHome,
  MdLock,
  MdPerson,
  MdPhone,
  MdVisibility,
  MdVisibilityOff,
} from 'react-icons/md'
import { useAuth } from '../../../context/AuthContext'
import PasswordRequirements from '../../../components/PasswordRequirements'
import PhilippinePhoneInput from '../../../components/ui/PhilippinePhoneInput'
import { getPasswordValidationError, isPasswordValid } from '../../../utils/passwordPolicy'

const INPUT_CLASS = `w-full rounded-xl border-2 border-slate-200 bg-slate-50 px-3.5 py-3 text-sm
  text-slate-800 placeholder-slate-300 transition-all focus:border-emerald-400 focus:bg-white
  focus:outline-none focus:ring-2 focus:ring-emerald-400/10`
const LABEL_CLASS = 'mb-1.5 block text-[11px] font-bold uppercase tracking-widest text-slate-500'
const GENDER_OPTIONS = ['Male', 'Female', 'Other']

const maxBirthdate = () => new Date().toISOString().slice(0, 10)
const minBirthdate = () => {
  const d = new Date()
  d.setFullYear(d.getFullYear() - 100)
  return d.toISOString().slice(0, 10)
}

const validateBirthdate = (value) => {
  if (!value) return 'Birthdate is required.'
  if (value > maxBirthdate()) return 'Birthdate cannot be in the future.'
  if (value < minBirthdate()) return 'Patient age cannot exceed 100 years.'
  return ''
}

const PasswordInput = ({ name, value, onChange, placeholder, preventPaste = false }) => {
  const [show, setShow] = useState(false)
  const stopPaste = (event) => {
    if (!preventPaste) return
    event.preventDefault()
  }
  return (
    <div className="relative">
      <MdLock className="absolute left-3.5 top-1/2 -translate-y-1/2 text-[17px] text-slate-400" />
      <input
        type={show ? 'text' : 'password'}
        name={name}
        value={value}
        onChange={onChange}
        onPaste={stopPaste}
        onDrop={stopPaste}
        required
        minLength={8}
        maxLength={128}
        autoComplete={name === 'password' ? 'new-password' : 'off'}
        placeholder={placeholder}
        className={`${INPUT_CLASS} pl-10 pr-11`}
      />
      <button type="button" onClick={() => setShow((current) => !current)}
        className="absolute right-3.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
        aria-label={show ? 'Hide password' : 'Show password'}>
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
  return <div className="flex justify-center gap-1 px-1 sm:gap-3">{Array.from({ length: 6 }).map((_, index) => (
    <input key={index} ref={(element) => { refs.current[index] = element }} type="text" inputMode="numeric" maxLength={1}
      value={digits[index] || ''} onChange={(event) => handleInput(index, event)} onKeyDown={(event) => handleKey(index, event)} onPaste={handlePaste}
      className={`h-14 w-11 select-none rounded-2xl border-2 text-center text-2xl font-black outline-none transition-all sm:h-16 sm:w-14 ${digits[index] ? 'border-emerald-400 bg-emerald-50 text-emerald-700' : 'border-slate-200 bg-slate-50 text-slate-800'} focus:border-emerald-400 focus:bg-white focus:ring-2 focus:ring-emerald-400/20`} />
  ))}</div>
}

const RegistrationForm = ({ onSuccess }) => {
  const [form, setForm] = useState({
    full_name: '', email: '', phone: '', birthdate: '', gender: '', address: '',
    password: '', confirmPassword: '',
  })
  const [consentGiven, setConsentGiven] = useState(false)
  const [verificationMethod, setVerificationMethod] = useState('email')
  const [error, setError] = useState('')
  const [birthdateError, setBirthdateError] = useState('')
  const [loading, setLoading] = useState(false)

  const updateField = (event) => {
    const { name, type, checked, value } = event.target
    setForm((prev) => ({ ...prev, [name]: type === 'checkbox' ? checked : value }))
    if (name === 'birthdate') setBirthdateError(validateBirthdate(value))
    setError('')
  }

  const handleSubmit = async (event) => {
    event.preventDefault()
    const birthdayError = validateBirthdate(form.birthdate)
    if (birthdayError) { setBirthdateError(birthdayError); return }
    const passwordError = getPasswordValidationError(form.password)
    if (passwordError) return setError(passwordError)
    if (form.password !== form.confirmPassword) return setError('Passwords do not match.')
    if (!form.email.trim()) return setError('Email address is required.')
    if (!form.gender) return setError('Gender is required.')
    if (!form.address.trim()) return setError('Address is required.')

    setLoading(true)
    try {
      const res = await fetch('/api/patient/register', {
        method: 'POST', credentials: 'include', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...form, consent_given: consentGiven, verification_method: verificationMethod }),
      })
      const data = await res.json()
      if (!res.ok) return setError(data.message || 'Registration failed.')
      onSuccess({ phone: data.phone || form.phone, email: data.email || form.email, method: data.verification_method || verificationMethod })
    } catch { setError('Cannot connect to server.') }
    finally { setLoading(false) }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-gradient-to-br from-[#0b1a2c] via-[#0f2540] to-[#0b1a2c] p-4 py-10">
      <div className="relative w-full max-w-2xl">
        <div className="mb-6 flex flex-col items-center"><img src="/logo.png" alt="Carait" className="mb-3 h-14 w-14 rounded-2xl bg-white/10 object-contain p-2"/><h1 className="text-xl font-black text-white">Carait Clinic</h1><p className="mt-0.5 text-sm text-slate-400">Create your patient account</p></div>
        <div className="overflow-hidden rounded-3xl bg-white shadow-2xl">
          <div className="bg-gradient-to-r from-emerald-500 to-emerald-600 px-6 py-5"><span className="rounded-full bg-white/20 px-2 py-0.5 text-xs font-bold text-white/70">Step 1 of 2</span><h2 className="mt-1 text-lg font-bold text-white">Patient Information</h2><p className="mt-0.5 text-sm text-emerald-100">Complete your profile now so you can book immediately after verification.</p></div>
          <form onSubmit={handleSubmit} className="space-y-5 px-5 py-6 sm:px-8">
            {error && <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-600">{error}</div>}
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="sm:col-span-2"><label className={LABEL_CLASS}>Full Name *</label><div className="relative"><MdPerson className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400"/><input name="full_name" value={form.full_name} onChange={updateField} required placeholder="e.g. Juan dela Cruz" className={`${INPUT_CLASS} pl-10`}/></div></div>
              <div><label className={LABEL_CLASS}>Email Address *</label><div className="relative"><MdEmail className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400"/><input type="email" name="email" value={form.email} onChange={updateField} required placeholder="juan@email.com" className={`${INPUT_CLASS} pl-10`}/></div></div>
              <div><label className={LABEL_CLASS}>Mobile Number *</label><div className="relative"><MdPhone className="pointer-events-none absolute left-3.5 top-1/2 z-10 -translate-y-1/2 text-slate-400"/><PhilippinePhoneInput value={form.phone} onChange={(e) => updateField({ target: { name: 'phone', type: 'text', value: e.target.value } })} className="pl-7"/></div><p className="mt-1 text-[11px] text-slate-400">Enter a Philippine number in 09xx format.</p></div>
              <div><label className={LABEL_CLASS}>Birthdate *</label><input type="date" name="birthdate" value={form.birthdate} min={minBirthdate()} max={maxBirthdate()} onChange={updateField} required className={INPUT_CLASS}/>{birthdateError && <p className="mt-1 text-xs font-semibold text-red-500">{birthdateError}</p>}</div>
              <div><label className={LABEL_CLASS}>Gender *</label><select name="gender" value={form.gender} onChange={updateField} required className={INPUT_CLASS}><option value="">Select gender</option>{GENDER_OPTIONS.map((option)=><option key={option}>{option}</option>)}</select></div>
              <div className="sm:col-span-2"><label className={LABEL_CLASS}>Address *</label><div className="relative"><MdHome className="absolute left-3.5 top-3.5 text-slate-400"/><textarea name="address" value={form.address} onChange={updateField} required rows={2} placeholder="House / Street / Barangay / City / Province" className={`${INPUT_CLASS} pl-10`}/></div></div>
            </div>

            <div className="border-t border-slate-100 pt-4"><p className="mb-3 text-[10px] font-bold uppercase tracking-widest text-slate-400">Security</p><div className="grid gap-4 sm:grid-cols-2"><div><label className={LABEL_CLASS}>Password *</label><PasswordInput name="password" value={form.password} onChange={updateField} placeholder="8+ characters"/></div><div><label className={LABEL_CLASS}>Confirm Password *</label><PasswordInput name="confirmPassword" value={form.confirmPassword} onChange={updateField} placeholder="Retype password" preventPaste/>{form.confirmPassword && form.password !== form.confirmPassword && <p className="mt-1 text-xs text-red-500">Passwords do not match.</p>}<p className="mt-1 text-[11px] text-slate-400">Paste is disabled for confirmation.</p></div></div></div>
            <PasswordRequirements password={form.password}/>
            <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
              <p className={LABEL_CLASS}>Verification Method *</p>
              <div className="grid gap-2 sm:grid-cols-2">
                <label className={`flex cursor-pointer items-center gap-3 rounded-xl border-2 px-4 py-3 transition-all ${verificationMethod === 'email' ? 'border-emerald-400 bg-emerald-50 text-emerald-800' : 'border-slate-200 bg-white text-slate-600'}`}>
                  <input type="radio" name="verification_method" value="email" checked={verificationMethod === 'email'} onChange={() => setVerificationMethod('email')} className="h-4 w-4" />
                  <MdEmail className="text-lg" />
                  <span><span className="block text-sm font-bold">Email Verification</span><span className="block text-[11px] font-normal opacity-70">Send the 6-digit code to your email.</span></span>
                </label>
                <label className={`flex cursor-pointer items-center gap-3 rounded-xl border-2 px-4 py-3 transition-all ${verificationMethod === 'sms' ? 'border-emerald-400 bg-emerald-50 text-emerald-800' : 'border-slate-200 bg-white text-slate-600'}`}>
                  <input type="radio" name="verification_method" value="sms" checked={verificationMethod === 'sms'} onChange={() => setVerificationMethod('sms')} className="h-4 w-4" />
                  <MdPhone className="text-lg" />
                  <span><span className="block text-sm font-bold">SMS Verification</span><span className="block text-[11px] font-normal opacity-70">Send the 6-digit code to your mobile number.</span></span>
                </label>
              </div>
            </div>
            <label className="flex items-start gap-3 rounded-2xl border border-slate-200 bg-slate-50 px-4 py-4 text-sm text-slate-600"><input type="checkbox" checked={consentGiven} onChange={(e)=>setConsentGiven(e.target.checked)} className="mt-1 h-4 w-4"/><span>I have read and agree to the <NavLink to="/privacy-policy" className="font-bold text-emerald-600">Privacy Policy</NavLink> and consent to processing of my personal data.</span></label>
            <button type="submit" disabled={loading || !consentGiven || !isPasswordValid(form.password) || form.password !== form.confirmPassword || Boolean(birthdateError)} className="flex w-full items-center justify-center gap-2 rounded-xl bg-emerald-500 py-3.5 text-sm font-bold text-white hover:bg-emerald-600 disabled:opacity-50">{loading ? 'Sending...' : <>Send {verificationMethod === 'email' ? 'Email' : 'SMS'} Verification Code <MdArrowForward/></>}</button>
            <p className="text-center text-sm text-slate-400">Already have an account? <NavLink to="/patient/login" className="font-bold text-emerald-600">Sign in</NavLink></p>
          </form>
        </div>
      </div>
    </div>
  )
}

const maskEmail = (email = '') => {
  const [name = '', domain = ''] = String(email).split('@')
  if (!domain) return email
  return `${name.slice(0, 2)}${'•'.repeat(Math.max(3, name.length - 2))}@${domain}`
}
const maskPhone = (phone = '') => {
  const digits = String(phone).replace(/\D/g, '')
  if (digits.length < 4) return phone
  return `${digits.slice(0, 2)}${'•'.repeat(Math.max(5, digits.length - 6))}${digits.slice(-4)}`
}

const VerificationForm = ({ pendingPhone, pendingEmail, initialMethod = 'email', onBack }) => {
  const [code, setCode] = useState('')
  const [method, setMethod] = useState(initialMethod)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const [switching, setSwitching] = useState(false)
  const { login } = useAuth()
  const navigate = useNavigate()

  const destination = method === 'email' ? maskEmail(pendingEmail) : maskPhone(pendingPhone)

  const sendBy = async (nextMethod) => {
    setSwitching(true); setError(''); setCode('')
    try {
      const res = await fetch('/api/patient/register/resend', {
        method: 'POST', credentials: 'include', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ phone: pendingPhone, method: nextMethod }),
      })
      const data = await res.json()
      if (!res.ok) return setError(data.message || 'Could not send another code.')
      setMethod(nextMethod)
    } catch { setError('Cannot connect to server.') }
    finally { setSwitching(false) }
  }

  const handleVerify = async (event) => {
    event.preventDefault()
    if (code.length < 6) return setError('Please enter the complete 6-digit code.')
    setError(''); setLoading(true)
    try {
      const res = await fetch('/api/patient/register/verify', {
        method: 'POST', credentials: 'include', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ phone: pendingPhone, code }),
      })
      const data = await res.json()
      if (!res.ok) return setError(data.message || 'Verification failed.')
      login(data.user, 'patient'); navigate('/patient')
    } catch { setError('Cannot connect to server.') }
    finally { setLoading(false) }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-gradient-to-br from-[#0b1a2c] via-[#0f2540] to-[#0b1a2c] p-4">
      <div className="w-full max-w-md">
        <div className="mb-6 flex flex-col items-center"><div className="mb-3 flex h-14 w-14 items-center justify-center rounded-2xl border border-white/10 bg-white/10"><img src="/logo.png" alt="Carait" className="h-10 w-10 object-contain" /></div><h1 className="text-xl font-black text-white">Carait Clinic</h1></div>
        <div className="overflow-hidden rounded-3xl bg-white shadow-2xl">
          <div className="bg-gradient-to-r from-emerald-500 to-emerald-600 px-6 py-5 text-center">
            <span className="rounded-full bg-white/20 px-2 py-0.5 text-xs font-bold text-white/70">Step 2 of 2</span>
            <h2 className="mt-1 text-lg font-bold text-white">Verify Your {method === 'email' ? 'Email' : 'Mobile Number'}</h2>
            <p className="mt-1 text-sm text-emerald-100">Code sent by {method === 'email' ? 'email' : 'SMS'} to</p>
            <p className="text-sm font-bold text-white">{destination}</p>
          </div>
          <form onSubmit={handleVerify} className="space-y-5 px-6 py-6">
            {error && <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-center text-sm text-red-600">{error}</div>}
            <div><label className="mb-3 block text-center text-xs font-bold uppercase tracking-wider text-slate-500">6-Digit Verification Code</label><OtpBoxes value={code} onChange={(next) => { setCode(next); setError('') }} /></div>
            <button type="submit" disabled={loading || switching || code.length < 6} className="flex w-full items-center justify-center gap-2 rounded-xl bg-emerald-500 py-3.5 text-sm font-bold text-white hover:bg-emerald-600 disabled:opacity-60">{loading ? 'Verifying…' : <><MdCheckCircle /> Verify and Create Account</>}</button>
            <div className="space-y-2 text-center text-sm">
              <button type="button" disabled={switching} onClick={() => sendBy(method === 'sms' ? 'email' : 'sms')} className="font-bold text-emerald-600 hover:text-emerald-700 disabled:opacity-50">{switching ? 'Sending…' : `Try another way — use ${method === 'sms' ? 'email' : 'SMS'}`}</button>
              <div><button type="button" onClick={onBack} className="inline-flex items-center gap-1 text-xs text-slate-400 hover:text-slate-600"><MdArrowBack /> Change registration details</button></div>
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
        pendingEmail={pendingRegistration.email}
        initialMethod={pendingRegistration.method}
        onBack={() => setPendingRegistration(null)}
      />
    )
  }

  return <RegistrationForm onSuccess={setPendingRegistration} />
}

export default PatientRegister
