import { useCallback, useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { getRecommendedFollowups } from '../../services/patient.service'
import { getClinicToday } from '../../utils/patientBirthdate.mjs'

export default function PatientFollowupRecommendations({ compact = false, branchId }) {
  const [rows,setRows]=useState([]),[loading,setLoading]=useState(true),[error,setError]=useState('')
  const load=useCallback(async()=>{setLoading(true);setError('');try{const data=await getRecommendedFollowups();setRows(Array.isArray(data)?data:[])}catch(e){setError(e.message)}finally{setLoading(false)}},[])
  useEffect(()=>{void load();const refresh=()=>void load();window.addEventListener('clinic:refresh',refresh);return()=>window.removeEventListener('clinic:refresh',refresh)},[load])
  const visible=rows.filter(row=>row.status==='active'&&(!branchId||Number(row.branch_id)===Number(branchId))&&(!compact||row.return_date>=getClinicToday()&&!row.booked_appointment_id)).sort((a,b)=>a.return_date.localeCompare(b.return_date))
  if(!loading&&!error&&!visible.length)return null
  return <section className="space-y-3 rounded-2xl border border-emerald-200 bg-white p-5" aria-label="Recommended Follow-Up"><h2 className="font-bold">Recommended Follow-Up</h2>
    {loading?<p role="status" className="text-sm text-slate-500">Loading recommendations...</p>:error?<div role="alert" className="text-sm text-rose-700">{error}<button type="button" className="ml-2 underline" onClick={load}>Try Again</button></div>:(compact?visible.slice(0,3):visible).map(row=><article key={row.id} className="rounded-xl bg-emerald-50 p-4 text-sm">
      <p className="font-bold">Recommended return: {new Date(`${row.return_date}T12:00:00`).toLocaleDateString('en-PH',{year:'numeric',month:'long',day:'numeric'})}</p>
      {row.doctor_note&&<p className="mt-2 whitespace-pre-wrap"><strong>Doctor’s Note:</strong> {row.doctor_note}</p>}
      <p className="mt-2 text-xs text-slate-600">{row.doctor_name} · {row.branch_name} · Original appointment #{row.appointment_id} ({row.original_date})</p>
      <p className="mt-2">This is a recommendation from your doctor, not a confirmed appointment. You may schedule another appointment if you wish to return.</p>
      {row.booked_appointment_id?<Link className="button-secondary mt-3 inline-flex" to="/patient/appointments">View Your Appointment</Link>:<Link className="button-secondary mt-3 inline-flex" to={`/patient/book?${new URLSearchParams({follow_up_id:String(row.id),branch_id:String(row.branch_id),...(row.return_date>=getClinicToday()?{date:row.return_date}:{})})}`}>Book Appointment</Link>}
    </article>)}
  </section>
}
