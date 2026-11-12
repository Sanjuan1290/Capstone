import {useEffect,useState,useRef} from 'react'
import {Link,useNavigate} from 'react-router-dom'
import {getClinicToday,getMinPatientBirthdate} from '../../utils/patientBirthdate.mjs'

const api=async(path,options={})=>{
  const response=await fetch(`/api/patient/guest/${path}`,{credentials:'omit',...options})
  const result=await response.json().catch(()=>({}))
  if(!response.ok)throw new Error(result.message||'The clinic could not process this request.')
  return result
}
const field='mt-1.5 w-full min-h-11 rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 focus:border-emerald-500 focus:outline-none'
const label='block text-xs font-bold uppercase tracking-wide text-slate-600'
const asList=(data)=>Array.isArray(data)?data:Array.isArray(data?.items)?data.items:[]
const emptyPatient={full_name:'',gender:'',birthdate:'',reported_age:'',phone:'',email:'',address:'',consent_given:false}
export default function GuestBookAppointment(){
  const navigate=useNavigate()
  const [branches,setBranches]=useState([])
  const [branchId,setBranchId]=useState('')
  const [clinicType,setClinicType]=useState('medical')
  const [services,setServices]=useState([])
  const [serviceId,setServiceId]=useState('')
  const [doctors,setDoctors]=useState([])
  const [doctorId,setDoctorId]=useState('')
  const [date,setDate]=useState('')
  const [time,setTime]=useState('')
  const [slots,setSlots]=useState([])
  const [reasons,setReasons]=useState([])
  const [reason,setReason]=useState('')
  const [otherReason,setOtherReason]=useState('')
  const [patient,setPatient]=useState(emptyPatient)
  const [busy,setBusy]=useState(false)
  const [loading,setLoading]=useState(false)
  const [error,setError]=useState('')
  const submitted=useRef(false)
  const set=(key,value)=>setPatient(prev=>({...prev,[key]:value}))
  useEffect(()=>{
    let live=true
    fetch('/api/patient/branches').then(r=>r.json()).then(r=>{if(live)setBranches(asList(r))}).catch(()=>{if(live)setError('Could not load clinic branches.')})
    return ()=>{live=false}
  },[])
  useEffect(()=>{
    if(!branchId){setServices([]);setDoctors([]);setReasons([]);return}
    let active=true
    setLoading(true);setError('');setServiceId('');setDoctorId('');setTime('');setDate('')
    const q=`branch_id=${encodeURIComponent(branchId)}&clinic_type=${encodeURIComponent(clinicType)}`
    Promise.all([api(`booking-services?${q}`),api(`doctors?branch_id=${encodeURIComponent(branchId)}`),api(`appointment-reasons?${q}`),api(`booking-readiness?branch_id=${encodeURIComponent(branchId)}`)])
      .then(([serviceRows,doctorRows,reasonRows,readiness])=>{
        if(!active)return
        setServices(asList(serviceRows).filter(item=>['all',clinicType].includes(String(item.clinic_type))))
        setDoctors(asList(doctorRows).filter(doc=>doc.clinic_type===clinicType))
        setReasons(asList(reasonRows))
        if(!readiness?.[clinicType]?.bookable)setError('This branch is not currently accepting online bookings for the selected clinic type.')
      }).catch(e=>{if(active)setError(e.message)}).finally(()=>{if(active)setLoading(false)})
    return ()=>{active=false}
  },[branchId,clinicType])
  useEffect(()=>{
    if(!branchId||!doctorId||!serviceId||!date){setSlots([]);return}
    let active=true
    setLoading(true);setTime('')
    const qs=new URLSearchParams({branch_id:branchId,clinic_type:clinicType,service_id:serviceId,date})
    api(`doctors/${doctorId}/available-slots?${qs}`).then(r=>{if(active)setSlots(Array.isArray(r.slots)?r.slots:[])}).catch(e=>{if(active){setSlots([]);setError(e.message)}}).finally(()=>{if(active)setLoading(false)})
    return ()=>{active=false}
  },[branchId,clinicType,doctorId,serviceId,date])
  const submit=async(event)=>{
    event.preventDefault()
    if(busy||submitted.current)return
    submitted.current=true;setBusy(true);setError('')
    try {
      const result=await api('appointments',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({
        ...patient,branch_id:Number(branchId),clinic_type:clinicType,doctor_id:Number(doctorId),requested_service_id:Number(serviceId),
        appointment_date:date,appointment_time:time,reason,reason_details:otherReason,
      })})
      navigate(`/guest/appointments/${result.id}#${encodeURIComponent(result.access_token)}`,{replace:true})
    }catch(e){setError(e.message);submitted.current=false}
    finally{setBusy(false)}
  }
  return <main className="min-h-screen bg-slate-50 px-4 py-10"><div className="mx-auto max-w-4xl space-y-5">
    <header className="flex items-center justify-between gap-4"><div><Link to="/" className="text-sm font-semibold text-emerald-700">← Carait Clinic</Link><h1 className="mt-2 text-2xl font-black text-slate-900">Guest Online Appointment</h1><p className="mt-1 text-sm text-slate-600">Book without creating a patient portal account.</p></div><img src="/logo.png" alt="Carait Clinic" className="h-14 w-14 object-contain" /></header>
    <form onSubmit={submit} className="space-y-5">
      <section className="rounded-2xl border bg-white p-5 shadow-sm"><h2 className="text-lg font-black">1. Branch and Service</h2><div className="mt-4 grid gap-4 sm:grid-cols-2">
        <div><label className={label}>Clinic Branch *</label><select required value={branchId} onChange={e=>setBranchId(e.target.value)} className={field}><option value="">Choose a branch</option>{branches.map(b=><option key={b.id} value={b.id}>{b.name}</option>)}</select></div>
        <div><label className={label}>Clinic Type *</label><select value={clinicType} onChange={e=>setClinicType(e.target.value)} className={field}><option value="medical">General Medicine</option><option value="derma">Dermatology</option></select></div>
        <div className="sm:col-span-2"><label className={label}>Service *</label><select required value={serviceId} onChange={e=>{setServiceId(e.target.value);setTime('')}} className={field} disabled={!branchId||loading}><option value="">Choose a service</option>{services.map(service=><option key={service.id} value={service.id}>{service.service_name}{service.default_price!=null?` · ₱${Number(service.default_price).toFixed(2)}`:''}</option>)}</select></div>
      </div></section>
      <section className="rounded-2xl border bg-white p-5 shadow-sm"><h2 className="text-lg font-black">2. Doctor and Schedule</h2><div className="mt-4 grid gap-4 sm:grid-cols-2">
        <div><label className={label}>Doctor *</label><select required className={field} value={doctorId} onChange={e=>setDoctorId(e.target.value)} disabled={!serviceId||loading}><option value="">Choose a doctor</option>{doctors.map(d=><option key={d.id} value={d.id}>{d.full_name||d.name}</option>)}</select></div>
        <div><label className={label}>Appointment Date *</label><input required type="date" min={getClinicToday()} value={date} onChange={e=>setDate(e.target.value)} className={field} disabled={!doctorId}/></div>
        <div className="sm:col-span-2"><label className={label}>Available Time *</label><select required className={field} value={time} onChange={e=>setTime(e.target.value)} disabled={!date||loading}><option value="">{loading?'Checking available times…':'Select an available time'}</option>{slots.map(t=><option key={t} value={t}>{t}</option>)}</select>{date&&!loading&&slots.length===0&&<p className="mt-2 text-sm text-amber-700">No available times on this date. Try another date or doctor.</p>}</div>
        <div className="sm:col-span-2"><label className={label}>Reason for Visit *</label><select className={field} required value={reason} onChange={e=>setReason(e.target.value)} disabled={!branchId}><option value="">Choose a reason</option>{reasons.map(r=><option key={r.id||r.label} value={r.label}>{r.label}</option>)}</select></div>
        {reason.toLowerCase()==='other'&&<div className="sm:col-span-2"><label className={label}>Describe Your Reason *</label><textarea required maxLength={180} minLength={2} className={field} value={otherReason} onChange={e=>setOtherReason(e.target.value)}/></div>}
      </div></section>
      <section className="rounded-2xl border bg-white p-5 shadow-sm"><h2 className="text-lg font-black">3. Patient Information</h2><p className="mt-1 text-sm text-slate-500">Your mobile number is required so clinic staff can contact you when necessary. There are no automatic email or SMS booking reminders.</p><div className="mt-4 grid gap-4 sm:grid-cols-2">
        <div className="sm:col-span-2"><label className={label}>Full Name *</label><input required maxLength={150} className={field} autoComplete="name" value={patient.full_name} onChange={e=>set('full_name',e.target.value)}/></div>
        <div><label className={label}>Gender *</label><select required className={field} value={patient.gender} onChange={e=>set('gender',e.target.value)}><option value="">Select gender</option><option>Male</option><option>Female</option><option>Other</option></select></div>
        <div><label className={label}>Mobile Number *</label><input required inputMode="tel" pattern="09[0-9]{9}" placeholder="09XXXXXXXXX" maxLength={11} className={field} value={patient.phone} onChange={e=>set('phone',e.target.value.replace(/[^0-9]/g,''))}/></div>
        <div><label className={label}>Birthdate (Optional if age is provided)</label><input type="date" min={getMinPatientBirthdate()} max={getClinicToday()} className={field} value={patient.birthdate} onChange={e=>setPatient(p=>({...p,birthdate:e.target.value,reported_age:e.target.value?'':p.reported_age}))}/></div>
        <div><label className={label}>Age (Required without birthdate)</label><input type="number" min="0" max="120" required={!patient.birthdate} disabled={Boolean(patient.birthdate)} className={field} value={patient.reported_age} onChange={e=>set('reported_age',e.target.value)}/></div>
        <div><label className={label}>Email Address (Optional)</label><input type="email" maxLength={150} autoComplete="email" className={field} value={patient.email} onChange={e=>set('email',e.target.value)}/></div>
        <div><label className={label}>Address (Optional)</label><input maxLength={500} className={field} autoComplete="street-address" value={patient.address} onChange={e=>set('address',e.target.value)}/></div>
      </div>
      <label className="mt-5 flex gap-3 rounded-xl border border-slate-200 bg-slate-50 p-4 text-sm"><input type="checkbox" required checked={patient.consent_given} onChange={e=>set('consent_given',e.target.checked)} /><span>I have read the <Link to="/privacy-policy" target="_blank" className="font-bold text-emerald-700 underline">Privacy Policy</Link> and consent to processing my booking details.</span></label>
      </section>
      <section className="rounded-2xl border bg-white p-5 shadow-sm"><h2 className="text-lg font-black">4. Review and Submit</h2><p className="mt-2 text-sm text-slate-600">Your request starts as Pending. After submitting, save your secure booking link to check the status and updates inside this website. Guest bookings do not receive an email or SMS.</p>
      {error&&<p role="alert" className="my-3 rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-700">{error}</p>}
      <div className="mt-4 flex flex-wrap gap-3"><button className="button-primary" type="submit" disabled={busy||loading||!time}>{busy?'Submitting…':'Submit Guest Appointment'}</button><Link to="/patient/login" className="button-secondary">I already have an account</Link></div></section>
    </form>
  </div></main>
}
