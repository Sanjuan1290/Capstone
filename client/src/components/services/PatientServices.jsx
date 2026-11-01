import { useCallback, useEffect, useState, useRef } from 'react'
import { NavLink } from 'react-router-dom'
import { MdArrowForward, MdMedicalServices, MdRefresh } from 'react-icons/md'
import { getBookingServices } from '../../services/patient.service'

const clinicLabel = value => value==='derma'?'Dermatology':value==='medical'?'General Medicine':'Clinic Service'
export const serviceBookingPath = (service,branchId) => {
  const params = new URLSearchParams({branch_id:String(branchId)})
  if(['medical','derma'].includes(service?.clinic_type)){
    params.set('clinic',service.clinic_type)
    params.set('service_id',String(service.id))
  }
  // Services shared between medical and dermatology require the patient to choose clinic type first.
  return `/patient/book?${params.toString()}`
}
export default function PatientServices({branchId}) {
  const [services,setServices]=useState([]),[loading,setLoading]=useState(true),[error,setError]=useState(''),[category,setCategory]=useState('all'),[page,setPage]=useState(1)
  const currentBranch=useRef(branchId)
  currentBranch.current=branchId
  const load=useCallback(async()=>{
    if(!branchId){setServices([]);setLoading(false);setError('');return}
    setLoading(true);setError('')
    try{const rows=await getBookingServices('',branchId);if(currentBranch.current===branchId)setServices(Array.isArray(rows)?rows:[])}
    catch(err){if(currentBranch.current===branchId){setError(err.message||'Unable to load services.');setServices([])}}
    finally{if(currentBranch.current===branchId)setLoading(false)}
  },[branchId])
  useEffect(()=>{void load();setCategory('all');setPage(1)},[load])
  useEffect(()=>{const onUpdate=e=>{if(['service.updated','stream.reconnected'].includes(e.detail?.eventName))void load()};window.addEventListener('clinic:refresh',onUpdate);return()=>window.removeEventListener('clinic:refresh',onUpdate)},[load])
  const visible=services.filter(service=>category==='all'||service.clinic_type===category||service.clinic_type==='all')
  const pageSize=6, pageCount=Math.max(1,Math.ceil(visible.length/pageSize))
  const pageItems=visible.slice((page-1)*pageSize,page*pageSize)
  return <section className="space-y-4" aria-label="Available clinic services">
    <div className="flex flex-wrap items-end justify-between gap-3"><div><h2 className="text-xl font-black text-slate-900 dark:text-white">Available Services</h2><p className="mt-1 text-sm text-slate-500 dark:text-slate-300">Choose a service offered at your selected clinic branch.</p></div><NavLink to="/patient/book" className="inline-flex min-h-11 items-center gap-1 text-sm font-bold text-emerald-700 dark:text-emerald-300">Book Appointment <MdArrowForward/></NavLink></div>
    <div className="flex flex-wrap gap-2" aria-label="Service categories">{[['all','All Services'],['medical','General Medicine'],['derma','Dermatology']].map(([id,label])=><button key={id} type="button" aria-pressed={category===id} onClick={()=>{setCategory(id);setPage(1)}} className={`min-h-10 rounded-full border px-4 text-sm font-semibold transition-colors duration-200 focus-visible:outline focus-visible:outline-2 focus-visible:outline-emerald-700 ${category===id?'border-emerald-700 bg-emerald-700 text-white':'border-slate-200 bg-white text-slate-700 hover:border-emerald-400 dark:bg-slate-900 dark:text-slate-100'}`}>{label}</button>)}</div>
    {loading?<div role="status" className="grid gap-3 sm:grid-cols-2">{[1,2,3,4].map(n=><div key={n} className="h-36 animate-pulse rounded-2xl bg-slate-200 motion-reduce:animate-none"/>)}</div>:error?<div role="alert" className="rounded-2xl border border-rose-200 bg-rose-50 p-5"><p className="text-sm text-rose-800">We couldn't load available services. {error}</p><button className="button-secondary mt-3" type="button" onClick={load}><MdRefresh/> Try Again</button></div>:visible.length===0?<div className="rounded-2xl border border-slate-200 bg-white p-6 text-sm text-slate-600">No online booking services are currently listed in this category for the selected branch. You can choose another category or contact the clinic.</div>:<div className="grid gap-3 sm:grid-cols-2">{pageItems.map(service=><article key={service.id} className="carait-editor-card flex flex-col rounded-2xl border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-700 dark:bg-slate-900"><div className="flex items-start gap-3"><span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-emerald-50 text-emerald-700"><MdMedicalServices className="text-xl"/></span><div className="min-w-0"><p className="text-xs font-bold uppercase tracking-wide text-emerald-700 dark:text-emerald-300">{clinicLabel(service.clinic_type)}</p><h3 className="mt-1 text-base font-bold text-slate-900 dark:text-slate-100">{service.service_name}</h3><p className="mt-1 text-sm text-slate-500 dark:text-slate-300">{service.category||'Clinic service'}</p></div></div><div className="mt-auto flex flex-wrap items-end justify-between gap-3 pt-5"><div><p className="text-xs text-slate-500">Standard starting price</p><p className="text-base font-black text-slate-900 dark:text-white">{Number(service.default_price)>0?`₱${Number(service.default_price).toLocaleString('en-PH',{minimumFractionDigits:2,maximumFractionDigits:2})}`:'Ask clinic'}</p></div><NavLink to={serviceBookingPath(service,branchId)} className="inline-flex min-h-11 items-center gap-1 rounded-xl bg-emerald-700 px-4 text-sm font-bold text-white transition-colors hover:bg-emerald-800 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-700">Book This Service <MdArrowForward/></NavLink></div><p className="mt-2 text-xs text-slate-500">Final charges may change depending on the consultation and services provided.</p></article>)}</div>}
    {!loading&&!error&&visible.length>pageSize&&<div className="flex flex-wrap items-center justify-between gap-3"><p className="text-xs text-slate-500">Showing {(page-1)*pageSize+1}–{Math.min(page*pageSize,visible.length)} of {visible.length} services</p><div className="flex gap-2"><button type="button" className="button-secondary" disabled={page===1} onClick={()=>setPage(n=>n-1)}>Previous</button><span className="self-center text-sm">Page {page} of {pageCount}</span><button type="button" className="button-secondary" disabled={page===pageCount} onClick={()=>setPage(n=>n+1)}>Next</button></div></div>}
  </section>
}
