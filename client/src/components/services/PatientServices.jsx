import { useCallback, useEffect, useRef, useState } from 'react'
import { NavLink } from 'react-router-dom'
import { MdArrowForward, MdMedicalServices, MdFace, MdRefresh } from 'react-icons/md'
import { getBookingServices } from '../../services/patient.service'
import { formatPublicServicePrice, listServicesForCategory } from '../../utils/patientServicePresentation.mjs'
import { paginatePatientServices } from '../../utils/patientServicePagination.mjs'
import Pagination from '../ui/Pagination'

const clinicLabel = value => value === 'derma' ? 'Dermatology' : value === 'medical' ? 'General Medicine' : 'Clinic Service'
const motion = 'transition-[transform,box-shadow,border-color,background-color] duration-200 ease-out motion-reduce:transition-none motion-reduce:transform-none'
export const serviceBookingPath = (service, branchId) => {
  const params = new URLSearchParams({ branch_id: String(branchId) })
  if (['medical', 'derma'].includes(service?.clinic_type)) {
    params.set('clinic', service.clinic_type)
    params.set('service_id', String(service.id))
  }
  // Shared services require a clinic selection in the booking flow first.
  return `/patient/book?${params.toString()}`
}

export default function PatientServices({ branchId }) {
  const [services, setServices] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [category, setCategory] = useState('all')
  const [page, setPage] = useState(1)
  const currentBranch = useRef(branchId)
  const sectionRef = useRef(null)
  currentBranch.current = branchId

  const load = useCallback(async () => {
    if (!branchId) { setServices([]); setLoading(false); setError(''); return }
    setLoading(true); setError('')
    try {
      const rows = await getBookingServices('',branchId)
      if (currentBranch.current === branchId) setServices(Array.isArray(rows) ? rows : [])
    } catch (err) {
      if (currentBranch.current === branchId) { setError(err.message || 'Unable to load services.'); setServices([]) }
    } finally { if (currentBranch.current === branchId) setLoading(false) }
  }, [branchId])
  useEffect(() => { setServices([]); setCategory('all'); setPage(1); void load() }, [load])
  useEffect(() => {
    const onUpdate = event => { if (['service.updated', 'stream.reconnected'].includes(event.detail?.eventName)) void load() }
    window.addEventListener('clinic:refresh', onUpdate)
    return () => window.removeEventListener('clinic:refresh', onUpdate)
  }, [load])

  const visible = listServicesForCategory(services, category)
  // All Services lists every bookable service for this branch, across every page.
  // Filter tabs use the same paging behavior so no matching service is hidden.
  const { pageItems, pageCount, safePage, pageSize } = paginatePatientServices(visible, page)
  const goToPage = nextPage => {
    setPage(nextPage)
    // Page controls sit below the cards; bring the new page back into view.
    sectionRef.current?.scrollIntoView({ block: 'start', behavior: 'auto' })
  }

  return <section ref={sectionRef} className="scroll-mt-24 space-y-4" aria-label="Available clinic services">
    <div><h2 className="text-xl font-black text-slate-900 dark:text-white">Available Services</h2><p className="mt-1 text-sm text-slate-600 dark:text-slate-300">Browse all available services at your selected clinic. Use the filters or page controls below.</p></div>
    <div className="flex flex-wrap gap-2" role="group" aria-label="Filter services by category">{[['all', 'All Services'], ['medical', 'General Medicine'], ['derma', 'Dermatology']].map(([id, label]) => <button key={id} type="button" aria-pressed={category === id} onClick={() => { setCategory(id); setPage(1) }} className={`min-h-11 rounded-full border px-4 text-sm font-semibold transition-colors duration-200 motion-reduce:transition-none focus-visible:outline focus-visible:outline-2 focus-visible:outline-emerald-700 ${category === id ? 'border-emerald-700 bg-emerald-700 text-white' : 'border-slate-200 bg-white text-slate-700 hover:border-emerald-400 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100'}`}>{label}</button>)}</div>
    {loading ? <div role="status" aria-label="Loading clinic services" className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">{[1, 2, 3].map(n => <div key={n} className="h-44 animate-pulse rounded-2xl bg-slate-200 motion-reduce:animate-none dark:bg-slate-800"/>)}</div> : error ? <div role="alert" className="rounded-2xl border border-rose-200 bg-rose-50 p-5"><p className="text-sm text-rose-800">We couldn't load available services. {error}</p><button className="mt-3 inline-flex min-h-11 items-center gap-1 text-sm font-bold text-rose-800 underline" type="button" onClick={load}><MdRefresh aria-hidden="true"/> Try Again</button></div> : !visible.length ? <div className="rounded-2xl border border-slate-200 bg-white p-5 text-sm text-slate-600 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300">No online-bookable services are listed in this category at this clinic. Select another category or contact the clinic.</div> : <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">{pageItems.map(service => {
      const Icon = service.clinic_type === 'derma' ? MdFace : MdMedicalServices
      return <article key={service.id} className={`flex h-full flex-col rounded-2xl border border-slate-200 bg-white p-4 shadow-sm hover:-translate-y-0.5 hover:border-emerald-200 hover:shadow-md dark:border-slate-700 dark:bg-slate-900 ${motion}`}>
        <div className="flex items-start gap-3"><span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-emerald-50 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300"><Icon className="text-xl" aria-hidden="true"/></span><div className="min-w-0 flex-1"><p className="text-xs font-bold uppercase tracking-wide text-emerald-700 dark:text-emerald-300">{clinicLabel(service.clinic_type)}</p><h3 className="mt-1 break-words text-base font-bold leading-snug text-slate-900 dark:text-white">{service.service_name}</h3><p className="mt-1 text-sm leading-5 text-slate-600 dark:text-slate-300">{service.description || service.category || 'Ask the clinic for service details.'}</p></div></div>
        <div className="mt-auto border-t border-slate-100 pt-4 dark:border-slate-700"><p className="mb-3 text-xs text-slate-600 dark:text-slate-300">Service price: <strong>{formatPublicServicePrice(service)}</strong></p><NavLink to={serviceBookingPath(service,branchId)} className="inline-flex min-h-11 w-full items-center justify-center gap-1 rounded-xl bg-emerald-700 px-4 text-sm font-bold text-white transition-colors hover:bg-emerald-800 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-700">{service.clinic_type === 'all' ? 'Choose Clinic & Book' : 'Book This Service'} <MdArrowForward aria-hidden="true"/></NavLink></div>
      </article>
    })}</div>}
    {!loading && !error && visible.length > 0 && <nav aria-label="Available services pagination" className="overflow-hidden rounded-2xl border border-slate-200 bg-white dark:border-slate-700 dark:bg-slate-900"><Pagination page={safePage} totalPages={pageCount} total={visible.length} pageSize={pageSize} onPageChange={goToPage}/></nav>}
  </section>
}

