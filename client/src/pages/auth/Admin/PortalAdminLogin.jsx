import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import {
  MdAdminPanelSettings, MdArrowBack, MdArrowForward, MdBusiness,
  MdEmail, MdErrorOutline, MdLock, MdLockOutline,
  MdOutlineAccountTree, MdOutlineAnalytics, MdOutlineEventAvailable,
  MdOutlinePeople, MdSecurity, MdVisibility,
  MdVisibilityOff, MdVerifiedUser,
} from 'react-icons/md'
import { useAuth } from '../../../context/AuthContext'

const PORTALS = {
  superadmin: {
    badge: 'SUPER ADMIN PORTAL',
    title: 'Super Admin Sign In',
    subtitle: 'Centralized branch management access',
    infoTitle: 'Manage the entire Carait Clinic network',
    info: 'Oversee clinic branches, accounts, reports, and audit activity in one secure portal.',
    emailHint: 'Enter your super admin email',
    forgotPath: '/superadmin/forgot-password',
    destination: '/superadmin',
    otherPath: '/admin/login',
    otherName: 'Branch Admin',
  },
  admin: {
    badge: 'BRANCH ADMIN PORTAL',
    title: 'Branch Admin Sign In',
    subtitle: 'Access your assigned clinic branch',
    infoTitle: 'Run your branch operations',
    info: 'Manage appointments, patient records, billing, inventory, and your clinic team.',
    emailHint: 'Enter your branch admin email',
    forgotPath: '/admin/forgot-password',
    destination: '/admin',
    otherPath: '/superadmin/login',
    otherName: 'Super Admin',
  },
}

const fieldClass = 'block w-full rounded-xl border border-slate-200 bg-[#f8fafc] py-3.5 pl-11 pr-4 text-sm text-slate-900 placeholder-slate-400 shadow-sm outline-none transition focus:border-amber-500 focus:bg-white focus:ring-4 focus:ring-amber-500/10 disabled:opacity-60'

function PortalSignInForm({ portal }) {
  const config = PORTALS[portal]
  const [form, setForm] = useState({ email: '', password: '' })
  const [code, setCode] = useState('')
  const [mfaRequired, setMfaRequired] = useState(false)
  const [showPassword, setShowPassword] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const { login } = useAuth()
  const navigate = useNavigate()

  const handleSubmit = async (event) => {
    event.preventDefault()
    if (loading) return
    setError('')
    setLoading(true)
    try {
      const response = await fetch(mfaRequired ? '/api/admin/login/mfa' : '/api/admin/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify(mfaRequired ? { code, portal } : { ...form, portal }),
      })
      const contentType = response.headers.get('content-type') || ''
      if (!contentType.includes('application/json')) throw new Error('The login service is unavailable. Please try again shortly.')
      const data = await response.json()
      if (!response.ok) {
        setError(data.message || 'Sign in failed. Please check your details and try again.')
        return
      }
      if (data.mfa_required) {
        setMfaRequired(true)
        setCode('')
        return
      }
      if (!data.user) throw new Error('The login service returned an unexpected response. Please try again.')
      const actualPortal = data.user.account_role === 'superadmin' ? 'superadmin' : 'admin'
      if (actualPortal !== portal) {
        setError(`This account belongs to the ${PORTALS[actualPortal].badge.toLowerCase()}. Please use the correct sign-in page.`)
        return
      }
      login(data.user, actualPortal)
      navigate(config.destination, { replace: true })
    } catch (err) {
      setError(err.message || 'Cannot connect to the server. Please try again.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="w-full overflow-hidden rounded-[26px] bg-white shadow-[0_26px_80px_rgba(0,0,0,0.35)] ring-1 ring-white/10">
      <div className="relative overflow-hidden bg-gradient-to-br from-[#d97706] via-[#ea8a05] to-[#f59e0b] px-7 py-6 text-white sm:px-9">
        <div className="pointer-events-none absolute -right-12 -top-16 h-40 w-40 rounded-full border border-white/25" />
        <div className="pointer-events-none absolute -right-4 -top-10 h-28 w-28 rounded-full border border-white/20" />
        <div className="relative flex items-center justify-between gap-4">
          <div>
            <h2 className="text-xl font-extrabold tracking-tight sm:text-2xl">{mfaRequired ? 'Verify Your Sign In' : config.title}</h2>
            <p className="mt-1 text-sm text-amber-50">{mfaRequired ? 'Enter the 6-digit code sent to your email.' : config.subtitle}</p>
          </div>
          <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl border border-white/20 bg-white/15 text-3xl">
            {portal === 'superadmin' ? <MdAdminPanelSettings aria-hidden="true" /> : <MdBusiness aria-hidden="true" />}
          </div>
        </div>
      </div>
      <form onSubmit={handleSubmit} className="space-y-5 px-7 py-7 sm:px-9 sm:py-8" aria-label={`${portal === 'superadmin' ? 'Super Admin' : 'Branch Admin'} sign in`}>
        {!mfaRequired && (
          <div className="flex items-start gap-3 rounded-2xl border border-[#f6e9d2] bg-[#fff9f0] px-4 py-3.5">
            <div className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-amber-100 text-lg text-amber-700">
              {portal === 'superadmin' ? <MdOutlineAccountTree aria-hidden="true" /> : <MdOutlineEventAvailable aria-hidden="true" />}
            </div>
            <div>
              <p className="text-sm font-bold text-slate-900">{config.infoTitle}</p>
              <p className="mt-0.5 text-xs leading-5 text-slate-600">{config.info}</p>
            </div>
          </div>
        )}
        {error && (
          <div role="alert" className="flex items-start gap-2.5 rounded-xl border border-red-200 bg-red-50 p-3.5 text-sm leading-5 text-red-700">
            <MdErrorOutline aria-hidden="true" className="mt-0.5 shrink-0 text-lg" /><span>{error}</span>
          </div>
        )}
        {!mfaRequired ? (
          <>
            <label className="block space-y-2">
              <span className="text-[11px] font-extrabold uppercase tracking-[0.14em] text-slate-500">Email Address</span>
              <div className="relative">
                <MdEmail aria-hidden="true" className="absolute left-3.5 top-1/2 -translate-y-1/2 text-xl text-slate-400" />
                <input required type="email" name="email" value={form.email} onChange={event => setForm(previous => ({ ...previous, email: event.target.value }))} autoComplete="username" placeholder={config.emailHint} className={fieldClass} disabled={loading}/>
              </div>
            </label>
            <label className="block space-y-2">
              <span className="text-[11px] font-extrabold uppercase tracking-[0.14em] text-slate-500">Password</span>
              <div className="relative">
                <MdLock aria-hidden="true" className="absolute left-3.5 top-1/2 -translate-y-1/2 text-xl text-slate-400" />
                <input required type={showPassword ? 'text' : 'password'} name="password" value={form.password} onChange={event => setForm(previous => ({ ...previous, password: event.target.value }))} autoComplete="current-password" placeholder="Enter your password" className={`${fieldClass} pr-12`} disabled={loading}/>
                <button type="button" onClick={() => setShowPassword(previous => !previous)} className="absolute right-3.5 top-1/2 -translate-y-1/2 rounded p-1 text-lg text-slate-500 hover:text-slate-900 focus-visible:outline focus-visible:outline-2 focus-visible:outline-amber-500" aria-label={showPassword ? 'Hide password' : 'Show password'}>
                  {showPassword ? <MdVisibilityOff aria-hidden="true" /> : <MdVisibility aria-hidden="true" />}
                </button>
              </div>
            </label>
            <div className="flex justify-end">
              <Link to={config.forgotPath} className="text-xs font-bold text-[#d97706] hover:underline">Forgot password?</Link>
            </div>
          </>
        ) : (
          <>
            <div className="flex items-center gap-2 text-sm text-slate-600"><MdVerifiedUser className="text-lg text-amber-600" /> A security code was sent to your administrator email.</div>
            <label className="block space-y-2">
              <span className="text-[11px] font-extrabold uppercase tracking-[0.14em] text-slate-500">6-digit security code</span>
              <input required autoFocus type="text" inputMode="numeric" pattern="[0-9]{6}" maxLength={6} autoComplete="one-time-code" value={code} onChange={event => setCode(event.target.value.replace(/\D/g, '').slice(0, 6))} className="w-full rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-center text-xl font-bold tracking-[0.45em] text-slate-900 outline-none focus:border-amber-500 focus:ring-4 focus:ring-amber-500/10" placeholder="000000" />
            </label>
          </>
        )}
        <button type="submit" disabled={loading || (mfaRequired && code.length !== 6)} className="flex w-full items-center justify-center gap-2 rounded-xl bg-[#f59e0b] px-4 py-3.5 text-sm font-extrabold text-white shadow-lg shadow-amber-500/20 transition hover:bg-[#df8d05] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-amber-600 disabled:cursor-wait disabled:opacity-60">
          {loading ? 'Please wait…' : mfaRequired ? 'Verify & Sign In' : 'Sign In'} <MdArrowForward aria-hidden="true" className="text-lg" />
        </button>
        {mfaRequired && <button type="button" onClick={() => { setMfaRequired(false); setCode(''); setError('') }} className="flex w-full items-center justify-center gap-2 text-sm font-semibold text-slate-600 hover:text-slate-900"><MdArrowBack aria-hidden="true" /> Back to password</button>}
      </form>
    </div>
  )
}

const Brand = ({ portal }) => (
  <div className="flex flex-col items-center text-center">
    <div className="flex h-16 w-16 items-center justify-center rounded-2xl border border-white/15 bg-white/10 p-2 shadow-[0_6px_25px_rgba(0,0,0,0.23)] backdrop-blur-sm">
      <img src="/logo.png" alt="Carait Clinic logo" className="h-12 w-12 object-contain" />
    </div>
    <h1 className="mt-3 text-[27px] font-extrabold tracking-tight text-white">Carait Clinic</h1>
    <span className="mt-2 inline-flex items-center gap-2 rounded-full border border-amber-500/35 bg-amber-500/10 px-3.5 py-1.5 text-[11px] font-extrabold tracking-[0.15em] text-amber-400">
      {portal === 'superadmin' ? <MdSecurity aria-hidden="true" className="text-base" /> : <MdBusiness aria-hidden="true" className="text-base" />}
      {PORTALS[portal].badge}
    </span>
  </div>
)

const NetworkDecor = () => (
  <svg viewBox="0 0 650 360" className="pointer-events-none absolute inset-0 h-full w-full opacity-50" aria-hidden="true" preserveAspectRatio="xMidYMid slice">
    <g fill="none" stroke="#eea12a" strokeWidth="1">
      <path d="M43 265 Q188 87 336 196 Q447 260 610 58" opacity=".5" />
      <path d="M84 91 Q240 285 396 111 Q507 31 632 282" opacity=".24" />
      <path d="M15 335 Q185 202 350 265 Q490 327 637 166" opacity=".3" />
    </g>
    {[[43,265],[336,196],[610,58],[84,91],[396,111],[632,282],[350,265]].map(([x,y],index) => (
      <g key={index}><circle cx={x} cy={y} r="10" fill="none" stroke="#f59e0b" opacity=".5" /><circle cx={x} cy={y} r="3" fill="#fbbf24" /></g>
    ))}
  </svg>
)

const PortalAdminLogin = ({ portal = 'admin' }) => {
  const isSuper = portal === 'superadmin'
  if (isSuper) return (
    <main className="relative flex min-h-screen items-center justify-center overflow-hidden bg-[#0b1725] px-4 py-10 sm:px-6">
      <div className="pointer-events-none absolute inset-0" style={{ background: 'radial-gradient(ellipse at 12% 20%, rgba(14,63,104,.5), transparent 46%), radial-gradient(ellipse at 89% 78%, rgba(146,72,5,.37), transparent 48%)' }} />
      <div className="pointer-events-none absolute inset-x-0 bottom-0 h-[440px] opacity-40"><NetworkDecor /></div>
      <div className="relative z-10 mx-auto grid w-full max-w-[1060px] grid-cols-1 items-center gap-12 lg:grid-cols-[minmax(0,1fr)_450px] lg:gap-20">
        <div className="hidden lg:block">
          <div className="inline-flex items-center gap-2 rounded-full border border-amber-400/25 bg-amber-500/10 px-4 py-2 text-xs font-extrabold uppercase tracking-widest text-amber-300"><MdSecurity className="text-lg" /> Organization-wide access</div>
          <h1 className="mt-7 max-w-lg text-4xl font-extrabold leading-tight tracking-tight text-white xl:text-5xl">One secure place to manage <span className="text-amber-400">every clinic branch.</span></h1>
          <p className="mt-5 max-w-md text-base leading-7 text-slate-300">Central oversight for Carait Clinic. Manage locations, administrator access, reports, and system activity from one dashboard.</p>
          <div className="mt-9 grid max-w-md grid-cols-2 gap-3">
            {[[MdBusiness,'All clinic branches'],[MdOutlinePeople,'Administrator access'],[MdOutlineAnalytics,'Reports & analytics'],[MdSecurity,'Audit & security']].map(([Icon,label]) => (
              <div key={label} className="flex items-center gap-3 rounded-xl border border-white/10 bg-white/5 p-3 text-sm font-semibold text-slate-200"><Icon aria-hidden="true" className="shrink-0 text-xl text-amber-400" />{label}</div>
            ))}
          </div>
        </div>
        <div className="mx-auto w-full max-w-[450px]">
          <div className="mb-7"><Brand portal="superadmin" /></div>
          <PortalSignInForm portal="superadmin" />
          <p className="mt-5 text-center text-xs text-slate-400">Authorized organization administrators only.</p>
        </div>
      </div>
    </main>
  )
  return (
    <main className="relative flex min-h-screen items-center justify-center overflow-hidden bg-[#0b1725] px-4 py-10 sm:px-6">
      <div className="pointer-events-none absolute inset-0" style={{ background: 'radial-gradient(ellipse at 15% 5%, rgba(20,57,84,.52), transparent 50%), radial-gradient(ellipse at 85% 94%, rgba(151,80,4,.39), transparent 50%)' }} />
      <div className="relative z-10 mx-auto w-full max-w-[440px]">
        <div className="mb-8"><Brand portal="admin" /></div>
        <PortalSignInForm portal="admin" />
        <div className="mt-6 flex flex-col items-center gap-3 text-center">
          <p className="flex items-center gap-1.5 text-xs text-slate-400"><MdLockOutline aria-hidden="true" /> Secure access to your assigned branch</p>
          <Link to="/superadmin/login" className="text-xs font-semibold text-slate-400 underline-offset-4 transition hover:text-amber-300 hover:underline">Super Admin? Sign in here</Link>
        </div>
      </div>
    </main>
  )
}

export default PortalAdminLogin
