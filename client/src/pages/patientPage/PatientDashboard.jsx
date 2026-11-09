import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react'
import { NavLink } from 'react-router-dom'
import {
  MdAdd, MdArrowForward, MdCalendarToday, MdEventAvailable, MdHistory,
  MdMedicalServices, MdPersonSearch, MdAccessTime, MdLocationOn, MdRefresh,
} from 'react-icons/md'
import { useAuth } from '../../context/AuthContext'
import { usePatientBranch } from '../../context/PatientBranchContext'
import useClinicRefresh from '../../hooks/useClinicRefresh'
import { getMyAppointments, getCurrentPromotions } from '../../services/patient.service'
import { formatAppointmentRange } from '../../utils/appointmentTime'
import { getPatientDashboardSummary } from '../../utils/patientDashboardData.mjs'
import PatientServices from '../../components/services/PatientServices'
import PatientAnnouncementPromos from '../../components/promotions/PatientAnnouncementPromos'
import { FeaturedOffers } from '../../components/promotions/PromotionCards'

const motion = 'transition-[transform,box-shadow,border-color,background-color] duration-200 ease-out motion-reduce:transition-none motion-reduce:transform-none'
const focus = 'focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-600'
const statusMeta = {
  pending: { label: 'Awaiting confirmation', classes: 'bg-amber-50 text-amber-800 border-amber-200' },
  confirmed: { label: 'Confirmed', classes: 'bg-emerald-50 text-emerald-800 border-emerald-200' },
  rescheduled: { label: 'Rescheduled', classes: 'bg-sky-50 text-sky-800 border-sky-200' },
}

function formatDate(raw) {
  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(raw || ''))
  if (!match) return 'Date not available'
  return new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3])).toLocaleDateString('en-PH', {
    weekday: 'short', month: 'short', day: 'numeric', year: 'numeric',
  })
}

const QuickLink = ({ to, icon: Icon, label, sublabel }) => <NavLink to={to} className={`group flex min-h-20 items-center gap-3 rounded-2xl border border-slate-200 bg-white p-3.5 text-slate-800 shadow-sm hover:-translate-y-0.5 hover:border-emerald-300 hover:shadow-md dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100 ${motion} ${focus}`}>
  <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-emerald-50 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300"><Icon className="text-[22px]" aria-hidden="true" /></span>
  <span className="min-w-0 flex-1"><span className="block text-sm font-bold">{label}</span><span className="mt-0.5 block text-xs text-slate-500 dark:text-slate-300">{sublabel}</span></span>
  <MdArrowForward className="shrink-0 text-slate-400 group-hover:text-emerald-700" aria-hidden="true" />
</NavLink>

export default function PatientDashboard() {
  const { user } = useAuth()
  const { branchId, selectedBranch } = usePatientBranch()
  const requestedBranch = useRef(String(branchId))
  useLayoutEffect(() => {
    requestedBranch.current = String(branchId)
    return () => { requestedBranch.current = null }
  }, [branchId])
  const [summary, setSummary] = useState({ upcoming: null, upcomingCount: 0, completedCount: 0, recentVisits: [] })
  const [appointmentsLoading, setAppointmentsLoading] = useState(true)
  const [appointmentsError, setAppointmentsError] = useState('')
  const [promotions, setPromotions] = useState([])
  const [offersError, setOffersError] = useState('')
  const [offersLoading, setOffersLoading] = useState(true)

  const loadAppointments = useCallback(async () => {
    const requested = String(branchId)
    if (!branchId) { setSummary({ upcoming: null, upcomingCount: 0, completedCount: 0, recentVisits: [] }); setAppointmentsLoading(false); return }
    setAppointmentsLoading(true)
    setAppointmentsError('')
    try {
      const data = await getMyAppointments()
      if (requestedBranch.current === requested) setSummary(getPatientDashboardSummary(data, branchId))
    } catch {
      if (requestedBranch.current === requested) setAppointmentsError('We could not load your appointments.')
    } finally {
      if (requestedBranch.current === requested) setAppointmentsLoading(false)
    }
  }, [branchId])
  useEffect(() => { void loadAppointments() }, [loadAppointments])
  useClinicRefresh(loadAppointments, ['appointment.updated', 'queue.updated'], { fallbackMs: 60000 })

  const loadOffers = useCallback(async () => {
    const requested = String(branchId)
    if (!branchId) { setPromotions([]); setOffersLoading(false); return }
    setOffersLoading(true)
    setOffersError('')
    try {
      const data = await getCurrentPromotions(branchId)
      if (requestedBranch.current === requested) setPromotions((Array.isArray(data) ? data : []).filter(offer => offer.show_on_dashboard))
    } catch {
      if (requestedBranch.current === requested) { setPromotions([]); setOffersError('We could not load the latest offers.') }
    } finally {
      if (requestedBranch.current === requested) setOffersLoading(false)
    }
  }, [branchId])
  useEffect(() => { setPromotions([]); void loadOffers() }, [loadOffers])
  useClinicRefresh(loadOffers, ['promotion.updated', 'service.updated'], { fallbackMs: 60000 })

  const firstName = String(user?.full_name || 'Patient').trim().split(/\s+/)[0]
  const upcoming = summary.upcoming
  const status = statusMeta[upcoming?.status] || statusMeta.pending
  const branchName = selectedBranch?.name || 'your selected clinic'

  return <main className="mx-auto w-full max-w-[1200px] space-y-6 pb-6 text-slate-900 dark:text-slate-100">
    <header className="flex flex-wrap items-end justify-between gap-3">
      <div><h1 className="text-2xl font-black tracking-tight sm:text-3xl">Your Dashboard</h1><p className="mt-1 text-sm text-slate-600 dark:text-slate-300">Your visits, services, and clinic updates in one place.</p></div>
      <p className="inline-flex items-center gap-1.5 rounded-full border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-700 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200"><MdLocationOn aria-hidden="true" className="text-emerald-600"/> {branchName}</p>
    </header>

    <div className="grid gap-4 lg:grid-cols-2">
      <section className="relative flex min-h-[225px] flex-col justify-between overflow-hidden rounded-3xl bg-[#0c2036] p-5 text-white shadow-sm sm:p-6" aria-label="Welcome and booking">
        <div className="pointer-events-none absolute -right-12 -top-14 h-52 w-52 rounded-full bg-emerald-500/10" />
        <div className="relative"><p className="text-xs font-bold uppercase tracking-wide text-emerald-300">Welcome back</p><h2 className="mt-2 text-2xl font-black sm:text-[28px]">Hello, {firstName}!</h2><p className="mt-2 max-w-md text-sm leading-6 text-slate-200">Need to visit the clinic? Choose a service and request an appointment.</p></div>
        <div className="relative mt-5 flex flex-wrap items-center justify-between gap-3"><NavLink to="/patient/book" className={`inline-flex min-h-11 items-center justify-center gap-2 rounded-xl bg-emerald-500 px-5 py-2.5 text-sm font-bold text-white hover:bg-emerald-600 ${motion} ${focus}`}><MdAdd aria-hidden="true"/> Book Appointment <MdArrowForward aria-hidden="true"/></NavLink><span className="text-xs text-slate-300">{summary.completedCount} completed {summary.completedCount === 1 ? 'visit' : 'visits'} at this branch</span></div>
      </section>

      <section className="flex min-h-[225px] flex-col rounded-3xl border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-700 dark:bg-slate-900 sm:p-6" aria-label="Your next appointment">
        <div className="flex flex-wrap items-start justify-between gap-3"><div className="flex items-center gap-2"><span className="flex h-10 w-10 items-center justify-center rounded-xl bg-sky-50 text-sky-700 dark:bg-sky-900/30 dark:text-sky-300"><MdCalendarToday className="text-xl" aria-hidden="true"/></span><h2 className="text-base font-bold sm:text-lg">Next Appointment</h2></div><NavLink to="/patient/appointments" className={`inline-flex min-h-10 items-center gap-1 text-sm font-semibold text-emerald-700 hover:underline dark:text-emerald-300 ${focus}`}>View All <MdArrowForward aria-hidden="true"/></NavLink></div>
        {appointmentsLoading ? <div role="status" className="mt-5 h-24 animate-pulse rounded-xl bg-slate-100 motion-reduce:animate-none dark:bg-slate-800" aria-label="Loading appointments"/> : appointmentsError ? <div role="alert" className="mt-5 text-sm text-rose-700"><p>{appointmentsError}</p><button type="button" onClick={loadAppointments} className="mt-2 inline-flex min-h-10 items-center gap-1 font-semibold underline"><MdRefresh aria-hidden="true"/> Try Again</button></div> : upcoming ? <div className="mt-4 flex flex-1 flex-col gap-2"><div className="flex flex-wrap items-center gap-2"><span className={`inline-flex rounded-full border px-2.5 py-1 text-xs font-bold ${status.classes}`}>{status.label}</span><span className="text-xs text-slate-500 dark:text-slate-300">{summary.upcomingCount} upcoming {summary.upcomingCount === 1 ? 'appointment' : 'appointments'}</span></div><p className="text-base font-bold">{upcoming.requested_service_name_snapshot || upcoming.clinic || (upcoming.clinic_type === 'derma' ? 'Dermatology' : 'General Medicine')}</p><p className="text-sm text-slate-600 dark:text-slate-300">{upcoming.doctor_name || upcoming.doctor || 'Doctor to be confirmed'}</p><div className="mt-auto flex flex-wrap items-center gap-x-4 gap-y-1 pt-2 text-sm text-slate-700 dark:text-slate-200"><span className="inline-flex items-center gap-1.5"><MdCalendarToday aria-hidden="true"/>{formatDate(upcoming.appointment_date || upcoming.date)}</span><span className="inline-flex items-center gap-1.5"><MdAccessTime aria-hidden="true"/>{formatAppointmentRange(upcoming)}</span></div><p className="text-xs text-slate-500 dark:text-slate-300">{upcoming.branch_name || branchName}</p></div> : <div className="mt-5 flex flex-1 flex-col justify-center"><p className="text-base font-semibold">No upcoming appointments</p><p className="mt-1 text-sm leading-6 text-slate-600 dark:text-slate-300">You don't have a scheduled visit at {branchName}. Use Book Appointment when you're ready.</p></div>}
      </section>
    </div>

    <nav aria-label="Quick actions" className="grid gap-3 md:grid-cols-3">
      <QuickLink to="/patient/appointments" icon={MdEventAvailable} label="My Appointments" sublabel="See scheduled visits"/>
      <QuickLink to="/patient/history" icon={MdHistory} label="Visit History" sublabel="Review past visits"/>
      <QuickLink to="/patient/doctors" icon={MdPersonSearch} label="Find a Doctor" sublabel="See available doctors"/>
    </nav>

    <section className="space-y-3" aria-label="Current special offers">
      {offersLoading ? <div role="status" className="h-36 animate-pulse rounded-2xl bg-slate-200 motion-reduce:animate-none" aria-label="Loading offers" /> : offersError ? <div role="alert" className="rounded-2xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-800"><p>{offersError}</p><button type="button" onClick={loadOffers} className="mt-2 inline-flex min-h-10 items-center gap-1 font-bold underline"><MdRefresh aria-hidden="true"/> Try Again</button></div> : promotions.length ? <FeaturedOffers promotions={promotions} /> : <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-slate-200 bg-white p-4 dark:border-slate-700 dark:bg-slate-900"><div><h2 className="text-lg font-bold">Special Offers</h2><p className="mt-1 text-sm text-slate-600 dark:text-slate-300">No featured offers at this clinic right now.</p></div><NavLink to="/patient/offers" className={`inline-flex min-h-11 items-center gap-1 text-sm font-bold text-emerald-700 dark:text-emerald-300 ${focus}`}>View All Offers <MdArrowForward aria-hidden="true"/></NavLink></div>}
    </section>

    <PatientServices branchId={branchId} />
    <PatientAnnouncementPromos branchId={branchId} />

    <section className="rounded-2xl border border-slate-200 bg-white shadow-sm dark:border-slate-700 dark:bg-slate-900" aria-label="Recent completed visits">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 px-5 py-4 dark:border-slate-700"><div><h2 className="text-lg font-bold">Recent Visits</h2><p className="mt-1 text-sm text-slate-500 dark:text-slate-300">Completed visits at this branch</p></div><NavLink to="/patient/history" className={`inline-flex min-h-11 items-center gap-1 text-sm font-bold text-emerald-700 dark:text-emerald-300 ${focus}`}>View History <MdArrowForward aria-hidden="true"/></NavLink></div>
      {appointmentsLoading ? <div role="status" className="m-5 h-16 animate-pulse rounded-xl bg-slate-100 motion-reduce:animate-none dark:bg-slate-800" aria-label="Loading recent visits"/> : appointmentsError ? <p className="px-5 py-4 text-sm text-slate-600 dark:text-slate-300">Recent visits are unavailable right now.</p> : !summary.recentVisits.length ? <p className="px-5 py-5 text-sm text-slate-600 dark:text-slate-300">No completed visits at this branch yet.</p> : <div className="divide-y divide-slate-100 dark:divide-slate-700">{summary.recentVisits.map(visit => <div key={visit.id} className="flex flex-wrap items-center justify-between gap-3 px-5 py-3.5"><div><p className="text-sm font-bold">{visit.requested_service_name_snapshot || (visit.clinic_type === 'derma' ? 'Dermatology Visit' : 'Medical Visit')}</p><p className="mt-1 text-sm text-slate-600 dark:text-slate-300">{formatDate(visit.appointment_date || visit.date)} · {visit.doctor_name || visit.doctor || 'Doctor not recorded'}</p></div><span className="rounded-full bg-emerald-50 px-2.5 py-1 text-xs font-semibold text-emerald-800">Completed</span></div>)}</div>}
    </section>
  </main>
}
