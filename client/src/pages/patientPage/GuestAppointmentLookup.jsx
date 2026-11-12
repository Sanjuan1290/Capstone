import { useCallback, useEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { MdCalendarToday, MdCheckCircle, MdLock, MdSearch } from 'react-icons/md'
import { guestPost, guestRequest } from '../../services/guestBooking.service'
import { normalizeGuestPhone } from '../../utils/guestBookingFlow.mjs'

const inputClass = 'mt-2 min-h-11 w-full rounded-xl border border-slate-300 bg-white px-3 py-3 text-slate-800 outline-none focus:border-emerald-600 focus:ring-2 focus:ring-emerald-100 disabled:bg-slate-50'
const labels = { pending: 'Pending', confirmed: 'Confirmed', rescheduled: 'Rescheduled', 'in-progress': 'In progress' }
const displayDate = date => new Date(date + 'T00:00:00+08:00').toLocaleDateString('en-PH', { timeZone: 'Asia/Manila', dateStyle: 'medium' })

export default function GuestAppointmentLookup() {
  const [phone, setPhone] = useState('')
  const [code, setCode] = useState('')
  const [verification, setVerification] = useState(null)
  const [checking, setChecking] = useState(true)
  const [busy, setBusy] = useState('')
  const [codeSent, setCodeSent] = useState(false)
  const [resend, setResend] = useState({ phone: '', at: 0 })
  const [clock, setClock] = useState(() => Date.now())
  const [items, setItems] = useState(null)
  const [nextCursor, setNextCursor] = useState(null)
  const [error, setError] = useState('')
  const generation = useRef(0)
  const cancelRequests = useCallback(() => { generation.current++ }, [])
  const normalizedPhone = normalizeGuestPhone(phone)
  const verified = verification?.verified && verification.phone === normalizedPhone && Date.parse(verification.expires_at) > clock
  const resendSeconds = resend.phone === normalizedPhone ? Math.max(0, Math.ceil((resend.at - clock) / 1000)) : 0

  const findAppointments = useCallback(async (number, beforeId = null) => {
    const current = ++generation.current
    setBusy('searching'); setError('')
    try {
      const result = await guestPost('appointments/lookup', { phone: number, before_id: beforeId })
      if (generation.current !== current) return
      setItems(previous => beforeId ? [...(previous || []), ...result.items] : result.items)
      setNextCursor(result.next_cursor)
    } catch (failure) {
      if (generation.current !== current) return
      setError(failure.message)
      if (failure.code === 'GUEST_PHONE_VERIFICATION_REQUIRED') { setVerification(null); setItems(null); setCodeSent(false) }
    } finally { if (generation.current === current) setBusy('') }
  }, [])

  useEffect(() => {
    let active = true
    guestRequest('phone/status').then(async result => {
      if (!active || !result.verified) return
      setVerification(result); setPhone('0' + result.phone.slice(2))
      if (Date.parse(result.expires_at) > Date.now()) await findAppointments(result.phone)
    }).catch(() => {}).finally(() => { if (active) setChecking(false) })
    return () => { active = false; cancelRequests() }
  }, [findAppointments, cancelRequests])
  useEffect(() => {
    const timer = window.setInterval(() => setClock(Date.now()), 1000)
    return () => window.clearInterval(timer)
  }, [])

  const requestCode = async () => {
    if (!normalizedPhone || busy || resendSeconds) return
    setBusy('sending'); setError('')
    try {
      const result = await guestPost('phone/request-code', { phone: normalizedPhone })
      setCodeSent(true); setCode('')
      setResend({ phone: normalizedPhone, at: Date.now() + Number(result.resend_after_seconds || 60) * 1000 })
    } catch (failure) {
      setError(failure.message)
      if (failure.retryAfter > 0) setResend({ phone: normalizedPhone, at: Date.now() + failure.retryAfter * 1000 })
    } finally { setBusy('') }
  }
  const verifyAndFind = async () => {
    if (busy || !/^\d{6}$/.test(code)) return
    setBusy('verifying'); setError('')
    try {
      const result = await guestPost('phone/verify-code', { phone: normalizedPhone, code })
      setVerification(result); setCode(''); setCodeSent(false)
      await findAppointments(normalizedPhone)
    } catch (failure) { setError(failure.message) }
    finally { setBusy('') }
  }
  const submit = event => {
    event.preventDefault()
    if (checking || busy) return
    if (verified) void findAppointments(normalizedPhone)
    else if (codeSent) void verifyAndFind()
    else void requestCode()
  }
  const changePhone = value => {
    cancelRequests()
    setPhone(value); setCode(''); setCodeSent(false); setItems(null); setNextCursor(null); setError('')
  }

  return <main className="min-h-screen bg-slate-50 px-4 py-8 sm:px-6 sm:py-12">
    <div className="mx-auto max-w-3xl space-y-5">
      <header>
        <Link to="/guest/book" className="inline-flex min-h-11 items-center text-sm font-semibold text-emerald-700">← Back to guest booking</Link>
        <h1 className="mt-2 flex items-center gap-2 text-2xl font-bold text-slate-900"><MdSearch className="shrink-0 text-emerald-700" />Find Your Guest Appointment</h1>
        <p className="mt-2 text-sm leading-relaxed text-slate-600">Enter the mobile number you used to book. Verify it by SMS to see your unfinished guest appointments.</p>
      </header>
      <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm sm:p-7" aria-label="Find appointments by mobile number">
        <form onSubmit={submit} className="space-y-4">
          <label className="block"><span className="text-sm font-semibold text-slate-700">Mobile number</span><input required type="tel" inputMode="tel" autoComplete="tel" maxLength={16} placeholder="09XXXXXXXXX" value={phone} disabled={checking || Boolean(busy)} onChange={event => changePhone(event.target.value)} className={inputClass} /></label>
          {checking ? <p role="status" className="text-sm text-slate-600">Checking mobile verification…</p> : verified ? <p role="status" className="rounded-xl border border-emerald-200 bg-emerald-50 p-3 text-sm font-semibold text-emerald-800"><MdCheckCircle className="mr-2 inline" />Mobile number verified.</p> : <>
            <p className="flex items-start gap-2 text-sm leading-relaxed text-slate-600"><MdLock className="mt-1 shrink-0 text-emerald-700" />For your privacy, appointment details appear only after mobile verification.</p>
            {codeSent && <><p role="status" className="text-sm text-emerald-800">We sent a 6-digit SMS code. It expires in 10 minutes.</p><label className="block"><span className="text-sm font-semibold text-slate-700">SMS verification code</span><input inputMode="numeric" autoComplete="one-time-code" maxLength={6} value={code} disabled={Boolean(busy)} onChange={event => setCode(event.target.value.replace(/\D/g, ''))} placeholder="6-digit code" className={inputClass} /></label></>}
            {verification?.phone === normalizedPhone && Date.parse(verification.expires_at) <= clock && <p role="status" className="text-sm text-amber-800">Your mobile verification expired. Verify your number again to view appointments.</p>}
          </>}
          {error && <p role="alert" className="rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-700">{error}</p>}
          <div className="flex flex-wrap items-center gap-3">
            <button type="submit" disabled={checking || Boolean(busy) || !normalizedPhone || (!verified && (codeSent ? !/^\d{6}$/.test(code) : resendSeconds > 0))} className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl bg-emerald-700 px-5 py-3 text-sm font-bold text-white hover:bg-emerald-800 disabled:cursor-not-allowed disabled:opacity-40"><MdSearch />{busy === 'sending' ? 'Sending code…' : busy === 'verifying' ? 'Verifying…' : busy === 'searching' ? 'Finding appointments…' : verified ? 'Find appointments' : codeSent ? 'Verify and find appointments' : resendSeconds ? `Try again in ${resendSeconds}s` : 'Send verification code'}</button>
            {!verified && codeSent && <button type="button" disabled={Boolean(busy) || resendSeconds > 0} onClick={() => void requestCode()} className="inline-flex min-h-11 items-center rounded-xl border border-slate-300 px-4 py-2 text-sm font-semibold text-slate-700 disabled:opacity-40">{resendSeconds ? `Resend code in ${resendSeconds}s` : 'Resend code'}</button>}
          </div>
          <p className="text-xs leading-relaxed text-slate-500">Checking status does not use your daily booking limit.</p>
        </form>
      </section>
      {verified && items !== null && <section className="space-y-3" aria-labelledby="guest-results-heading" aria-busy={busy === 'searching'}>
        <h2 id="guest-results-heading" className="text-lg font-bold text-slate-900">Your unfinished guest appointments</h2>
        {!items.length ? <div role="status" className="rounded-2xl border border-slate-200 bg-white p-6 text-sm leading-relaxed text-slate-600">No unfinished guest appointments were found for this mobile number. Completed, cancelled, rejected and no-show appointments are not listed here.</div> : items.map(item => <article key={item.id} className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6">
          <div className="flex flex-wrap items-center justify-between gap-2"><h3 className="font-bold text-slate-900">Booking {item.reference}</h3><span className={`rounded-full px-3 py-1 text-xs font-bold ${item.status === 'pending' ? 'bg-amber-100 text-amber-900' : 'bg-emerald-100 text-emerald-900'}`}>{labels[item.status] || item.status}</span></div>
          <p className="mt-3 font-semibold text-slate-800">{item.service_name || 'Clinic appointment'}</p>
          <p className="mt-1 text-sm text-slate-600">{item.branch_name}</p><p className="mt-1 text-sm text-slate-600">{item.doctor_name}</p>
          <p className="mt-3 flex flex-wrap items-center gap-2 text-sm font-semibold text-slate-700"><MdCalendarToday className="text-emerald-700" />{displayDate(item.appointment_date)} · {item.appointment_time}</p>
          <Link to={'/guest/appointments/' + item.id} className="mt-4 inline-flex min-h-11 items-center rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-2 text-sm font-bold text-emerald-800 hover:bg-emerald-100">View status for {item.reference}</Link>
        </article>)}
        {nextCursor && <button type="button" disabled={Boolean(busy)} onClick={() => void findAppointments(normalizedPhone, nextCursor)} className="inline-flex min-h-11 items-center rounded-xl border border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-slate-700 disabled:opacity-40">Load more appointments</button>}
      </section>}
      <p className="text-sm leading-relaxed text-slate-600">Booked through your patient account? <Link to="/patient/login" className="inline-flex min-h-11 items-center font-semibold text-emerald-700 underline">Sign in to the patient portal.</Link></p>
    </div>
  </main>
}
