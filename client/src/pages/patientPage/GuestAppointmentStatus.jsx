import {useCallback,useEffect,useState} from 'react'
import {Link,useLocation,useParams} from 'react-router-dom'
export default function GuestAppointmentStatus(){
  const {id}=useParams(),location=useLocation()
  const token=location.hash.replace(/^#/,'')
  const [details,setDetails]=useState(null)
  const [error,setError]=useState('')
  const [loading,setLoading]=useState(true)
  const [copied,setCopied]=useState(false)
  const refresh=useCallback(async()=>{
    if(!token){setError('Your secure booking link is missing. Use the full link saved after booking.');setLoading(false);return}
    try{
      const response=await fetch(`/api/patient/guest/appointments/${encodeURIComponent(id)}`,{credentials:'omit',headers:{'x-guest-booking-token':token}})
      const data=await response.json().catch(()=>({}))
      if(!response.ok)throw new Error(data.message||'Booking status could not be loaded.')
      setDetails(data);setError('')
    }catch(e){setError(e.message)}finally{setLoading(false)}
  },[id,token])
  useEffect(()=>{void refresh();const poll=window.setInterval(()=>void refresh(),45000);return()=>window.clearInterval(poll)},[refresh])
  const copy=()=>navigator.clipboard?.writeText(window.location.href).then(()=>setCopied(true)).catch(()=>setError('Could not copy the link. Copy it from your browser address bar.'))
  return <main className="min-h-screen bg-slate-50 px-4 py-12"><div className="mx-auto max-w-lg space-y-5 rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
    <Link to="/" className="text-sm font-semibold text-emerald-700">← Carait Clinic</Link>
    <h1 className="text-2xl font-black text-slate-900">Guest Appointment Status</h1>
    <p className="text-sm text-slate-600">This private booking page displays your current appointment status. It updates while you have it open. Save the full link to check again later.</p>
    {loading&&<p role="status">Checking appointment status…</p>}
    {error&&<p role="alert" className="rounded-xl bg-red-50 p-3 text-sm text-red-700">{error}</p>}
    {details&&<div className="space-y-3 rounded-xl bg-emerald-50 p-4 text-sm"><p><strong>Booking Reference:</strong> {details.reference}</p><p><strong>Status:</strong> <span className="font-bold uppercase text-emerald-800">{String(details.status||'Pending').replace(/_/g,' ')}</span></p><p><strong>Clinic:</strong> {details.branch_name}</p><p><strong>Service:</strong> {details.service_name}</p><p><strong>Doctor:</strong> {details.doctor_name}</p><p><strong>Date:</strong> {details.appointment_date}</p><p><strong>Time:</strong> {details.appointment_time}</p></div>}
    <div className="flex flex-wrap gap-2"><button type="button" className="button-primary" onClick={()=>void refresh()}>Refresh Status</button><button type="button" className="button-secondary" onClick={copy}>{copied?'Link Copied':'Copy Private Link'}</button></div>
    <p className="text-xs text-slate-500">No automatic email or SMS updates will be sent for this guest booking. Clinic staff may call the number you provided if needed. Do not share the private booking link.</p>
  </div></main>
}
