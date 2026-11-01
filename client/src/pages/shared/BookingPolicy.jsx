import { useEffect, useState } from 'react'
import { Link, NavLink, useSearchParams } from 'react-router-dom'
import { MdArrowBack, MdArrowForward, MdCalendarMonth, MdCheckCircle, MdInfoOutline } from 'react-icons/md'
import { getActiveBranches, getPublicBookingPolicy } from '../../services/patient.service'

const formatUpdatedDate = (value) => {
  if (!value) return ''
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? '' : date.toLocaleDateString('en-PH', { year: 'numeric', month: 'long', day: 'numeric' })
}

const BookingPolicy = () => {
  const [searchParams, setSearchParams] = useSearchParams()
  const branchId = searchParams.get('branch_id') || ''
  const [branches, setBranches] = useState([])
  const [policy, setPolicy] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [reloadToken, setReloadToken] = useState(0)

  useEffect(() => {
    let active = true
    setLoading(true)
    setError('')
    setPolicy(null)
    Promise.allSettled([getActiveBranches(), getPublicBookingPolicy(branchId)])
      .then(([branchResult, policyResult]) => {
        if (!active) return
        if (branchResult.status === 'fulfilled') setBranches(Array.isArray(branchResult.value) ? branchResult.value : [])
        if (policyResult.status === 'fulfilled') setPolicy(policyResult.value)
        else setError(policyResult.reason?.message || 'The appointment policy could not be loaded.')
      })
      .finally(() => { if (active) setLoading(false) })
    return () => { active = false }
  }, [branchId, reloadToken])

  const bookingUrl = branchId ? `/patient/book?branch_id=${encodeURIComponent(branchId)}` : '/patient/book'
  const updatedDate = formatUpdatedDate(policy?.published_at)

  return (
    <main className="min-h-[65vh] bg-slate-50 px-4 py-8 sm:px-6 sm:py-12">
      <div className="mx-auto max-w-4xl">
        <NavLink to="/" className="inline-flex items-center gap-2 text-sm font-semibold text-slate-600 transition-colors hover:text-teal-700">
          <MdArrowBack /> Back to Home
        </NavLink>

        <header className="mt-6 rounded-3xl bg-[#0b1a2c] px-6 py-8 text-white shadow-sm sm:px-9 sm:py-10">
          <div className="flex flex-wrap items-center gap-2 text-xs font-bold uppercase tracking-[0.14em] text-emerald-300">
            <MdCalendarMonth className="text-base" /> Patient information
          </div>
          <h1 className="mt-3 text-3xl font-black tracking-tight sm:text-4xl">{policy?.title || 'Appointment Booking Policy'}</h1>
          <p className="mt-3 max-w-2xl text-sm leading-7 text-slate-300 sm:text-base">
            {policy?.introduction || 'Please read these guidelines before requesting an appointment.'}
          </p>
          <div className="mt-6 flex flex-wrap items-center gap-3">
            <Link to={bookingUrl} className="inline-flex min-h-11 items-center gap-2 rounded-xl bg-emerald-500 px-5 text-sm font-bold text-white transition-colors hover:bg-emerald-600">
              Book an Appointment <MdArrowForward />
            </Link>
            {updatedDate && <span className="text-xs text-slate-400">Last updated {updatedDate}</span>}
          </div>
        </header>

        <section className="mt-5 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6">
          <label htmlFor="policy-branch" className="block text-sm font-bold text-slate-800">View policy for a clinic branch (optional)</label>
          <p className="mt-1 text-xs leading-5 text-slate-500">You can read the general clinic policy without choosing a branch. Select a branch to check if it has additional published rules.</p>
          <select
            id="policy-branch"
            value={branchId}
            onChange={(event) => {
              const next = new URLSearchParams(searchParams)
              if (event.target.value) next.set('branch_id', event.target.value)
              else next.delete('branch_id')
              setSearchParams(next)
            }}
            className="mt-3 min-h-11 w-full max-w-xl rounded-xl border border-slate-200 bg-slate-50 px-3 text-sm text-slate-800 outline-none transition focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/10"
          >
            <option value="">General policy — all branches</option>
            {branches.map((branch) => <option key={branch.id} value={String(branch.id)}>{branch.name}</option>)}
          </select>
        </section>

        {loading ? (
          <div className="mt-5 rounded-2xl border border-slate-200 bg-white px-5 py-12 text-center text-sm text-slate-500" role="status">Loading appointment policy…</div>
        ) : error ? (
          <div className="mt-5 rounded-2xl border border-rose-200 bg-rose-50 p-5 text-sm text-rose-800" role="alert">
            <p className="font-bold">We could not load the policy.</p>
            <p className="mt-1">{error}</p>
            <button type="button" onClick={() => setReloadToken(value => value + 1)} className="mt-3 rounded-lg border border-rose-200 bg-white px-3 py-2 text-sm font-semibold">Try again</button>
          </div>
        ) : (
          <>
            {branchId && policy?.uses_default && (
              <div className="mt-5 flex items-start gap-3 rounded-2xl border border-sky-200 bg-sky-50 p-4 text-sm text-sky-900">
                <MdInfoOutline className="mt-0.5 shrink-0 text-lg" />
                <p>This branch currently follows the general clinic booking policy. No additional branch-specific policy has been published.</p>
              </div>
            )}
            {branchId && policy?.is_branch_specific && (
              <div className="mt-5 flex items-center gap-2 rounded-2xl border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-900">
                <MdCheckCircle className="shrink-0 text-lg" />
                <p>Showing the published appointment policy for <strong>{policy.branch_name}</strong>.</p>
              </div>
            )}
            <section className="mt-5 space-y-3" aria-label="Appointment policy sections">
              {(policy?.sections || []).map((section, index) => (
                <article key={`${section.heading}-${index}`} className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm transition-shadow duration-200 hover:shadow-md sm:p-6">
                  <div className="flex items-start gap-4">
                    <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-emerald-50 text-sm font-black text-emerald-800">{index + 1}</span>
                    <div className="min-w-0">
                      <h2 className="text-base font-bold text-slate-900">{section.heading}</h2>
                      <p className="mt-2 whitespace-pre-line text-sm leading-7 text-slate-600">{section.body}</p>
                    </div>
                  </div>
                </article>
              ))}
            </section>
            <div className="mt-6 rounded-2xl border border-slate-200 bg-white p-5 sm:p-6">
              <h2 className="text-lg font-bold text-slate-900">Ready to request an appointment?</h2>
              <p className="mt-1 text-sm leading-6 text-slate-600">Choose your branch, service, doctor, and available schedule in the booking page.</p>
              <Link to={bookingUrl} className="mt-4 inline-flex min-h-11 items-center gap-2 rounded-xl bg-emerald-700 px-5 text-sm font-bold text-white transition-colors hover:bg-emerald-800">
                Continue to Booking <MdArrowForward />
              </Link>
            </div>
          </>
        )}
      </div>
    </main>
  )
}

export default BookingPolicy
