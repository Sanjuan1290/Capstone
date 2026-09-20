import { useEffect, useMemo, useState } from 'react'
import { MdCalendarToday, MdRefresh, MdSearch } from 'react-icons/md'
import { getDoctors, getDoctorSchedules } from '../../services/staff.service'
import { LoadingState, ErrorState, EmptyState } from '../../components/ui/PageState'

const DAYS=['Monday','Tuesday','Wednesday','Thursday','Friday','Saturday','Sunday']
const fmt=(value)=>{if(!value)return '—';const [h,m]=String(value).split(':').map(Number);const d=new Date();d.setHours(h||0,m||0,0,0);return d.toLocaleTimeString('en-PH',{hour:'numeric',minute:'2-digit'})}

const Staff_DoctorSchedules=()=>{
  const [doctors,setDoctors]=useState([]),[selected,setSelected]=useState(null),[rows,setRows]=useState([]),[search,setSearch]=useState(''),[loading,setLoading]=useState(true),[error,setError]=useState('')
  useEffect(()=>{getDoctors().then((d)=>{const list=Array.isArray(d)?d:[];setDoctors(list);if(list[0])setSelected(list[0])}).catch((e)=>setError(e.message||'Could not load doctors.')).finally(()=>setLoading(false))},[])
  useEffect(()=>{if(!selected?.id)return;setLoading(true);getDoctorSchedules(selected.id).then((d)=>setRows(Array.isArray(d)?d:[])).catch((e)=>setError(e.message||'Could not load doctor schedule.')).finally(()=>setLoading(false))},[selected])
  const filtered=useMemo(()=>doctors.filter((d)=>`${d.full_name} ${d.specialty||''}`.toLowerCase().includes(search.toLowerCase())),[doctors,search])
  const scheduleFor=(day)=>rows.find((r)=>r.day_of_week===day)
  return <div className="mx-auto w-full max-w-6xl space-y-5">
    <div className="flex flex-wrap items-start justify-between gap-3"><div><h1 className="flex items-center gap-2 text-2xl font-black text-slate-900"><MdCalendarToday className="text-sky-500"/> Doctor Schedules</h1><p className="mt-1 text-sm text-slate-500">Read-only doctor availability for appointment coordination and walk-ins.</p></div><button className="button-secondary" onClick={()=>selected&&getDoctorSchedules(selected.id).then((d)=>setRows(Array.isArray(d)?d:[]))}><MdRefresh/> Refresh</button></div>
    <div className="grid gap-5 lg:grid-cols-[320px_1fr]">
      <aside className="rounded-3xl border border-slate-200 bg-white p-4 shadow-sm"><div className="relative"><MdSearch className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400"/><input className="form-control pl-10" placeholder="Search doctor or specialty..." value={search} onChange={(e)=>setSearch(e.target.value)}/></div><div className="mt-3 max-h-[560px] space-y-2 overflow-y-auto">{filtered.map((d)=><button key={d.id} onClick={()=>setSelected(d)} className={`w-full rounded-2xl border p-3 text-left ${selected?.id===d.id?'border-sky-300 bg-sky-50':'border-slate-200 hover:bg-slate-50'}`}><p className="font-bold text-slate-800">{d.full_name}</p><p className="mt-1 text-xs text-slate-500">{d.specialty||'Doctor'}</p></button>)}</div></aside>
      <section className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">{loading?<LoadingState label="Loading doctor schedule..."/>:error?<ErrorState message={error}/>:!selected?<EmptyState title="Select a doctor" description="Choose a doctor to view weekly availability."/>:<><div className="border-b border-slate-100 pb-4"><h2 className="text-lg font-black text-slate-900">{selected.full_name}</h2><p className="text-sm text-slate-500">{selected.specialty||'Doctor'}</p></div><div className="mt-4 grid gap-3 sm:grid-cols-2">{DAYS.map((day)=>{const row=scheduleFor(day);const active=Boolean(row&&Number(row.is_active)!==0);return <div key={day} className={`rounded-2xl border p-4 ${active?'border-emerald-200 bg-emerald-50/40':'border-slate-200 bg-slate-50'}`}><div className="flex items-center justify-between"><p className="font-bold text-slate-800">{day}</p><span className={`rounded-full px-2 py-1 text-xs font-bold ${active?'bg-emerald-100 text-emerald-700':'bg-slate-200 text-slate-500'}`}>{active?'Available':'Unavailable'}</span></div>{active&&<p className="mt-3 text-sm font-semibold text-slate-700">{fmt(row.start_time)} – {fmt(row.end_time)}</p>}</div>})}</div></>}</section>
    </div>
  </div>
}
export default Staff_DoctorSchedules
