import {useCallback,useEffect,useRef,useState} from 'react'
import {getClinicalChargeAdjustments,requestClinicalChargeAdjustment,cancelClinicalChargeAdjustment} from '../../services/doctor.service'
import {formatMoney} from '../../utils/billingUi'
export default function DoctorChargeReductionPanel({appointmentId,services,ensureSaved,revision,completed=false}){
 const [data,setData]=useState(null),[error,setError]=useState(''),[message,setMessage]=useState(''),[busy,setBusy]=useState(false)
 const [target,setTarget]=useState(''),[amount,setAmount]=useState(''),[reason,setReason]=useState('')
 const submitting=useRef(false)
 const load=useCallback(async()=>{try{setData(await getClinicalChargeAdjustments(appointmentId));setError('')}catch(e){setError(e.message)}},[appointmentId])
 useEffect(()=>{void load()},[load,revision])
 const selected=data?.targets?.find(t=>`${t.target_type}:${t.catalog_service_id}:${t.inventory_id||0}`===target)
 const submit=async()=>{
  if(!selected||submitting.current)return
  submitting.current=true;setBusy(true);setError('');setMessage('')
  try{
   if(!completed&&!await ensureSaved())throw new Error('Wait for the consultation draft to save, then try again.')
   await requestClinicalChargeAdjustment(appointmentId,{...selected,amount:Number(amount),reason,billable_services:services})
   setAmount('');setReason('');setMessage('Pending Billing Approval');await load()
  }catch(e){setError(e.message)}finally{submitting.current=false;setBusy(false)}
 }
 return <section className="rounded-2xl border border-slate-200 bg-white p-4 space-y-3" aria-label="Request charge reduction"><h3 className="font-bold text-slate-900">Request a Charge Reduction</h3><p className="text-xs text-slate-600">Billing Admin reviews each request after consultation completion. Inventory usage stays as recorded.</p>
 {error&&<p role="alert" className="text-sm text-rose-700">{error}</p>}{message&&<p role="status" className="text-sm font-semibold text-amber-800">{message}</p>}
 {['draft','pending'].includes(data?.bill?.status)&&<div className="grid gap-3 sm:grid-cols-2"><label className="text-xs font-semibold sm:col-span-2">Charge to Reduce<select className="form-control mt-1" value={target} onChange={e=>setTarget(e.target.value)}><option value="">Select a charge</option>{(data.targets||[]).map(t=><option key={`${t.target_type}:${t.catalog_service_id}:${t.inventory_id||0}`} value={`${t.target_type}:${t.catalog_service_id}:${t.inventory_id||0}`}>{t.label} · {formatMoney(t.original_charge)}</option>)}</select></label><label className="text-xs font-semibold">Reduction Amount<input type="number" min="0.01" step="0.01" max={selected?.original_charge} value={amount} onChange={e=>setAmount(e.target.value)} className="form-control mt-1"/></label><label className="text-xs font-semibold">Reason<input maxLength={255} value={reason} onChange={e=>setReason(e.target.value)} className="form-control mt-1"/></label><button type="button" disabled={busy||!selected||Number(amount)<=0||reason.trim().length<5} onClick={submit} className="button-secondary sm:col-span-2">{busy?'Submitting…':'Submit Request'}</button></div>}
 {!data?.bill&&<p className="text-xs text-slate-500">Charges become available when your consultation draft saves.</p>}
 {(data?.requests||[]).map(r=><div key={r.id} className="rounded-xl border border-slate-200 p-3 text-xs"><strong>{formatMoney(r.requested_amount)} · {r.status==='pending'?'Pending Billing Approval':r.status==='approved'?'Approved':r.status==='rejected'?'Rejected':r.status}</strong><p>{r.reason}</p>{r.admin_note&&<p>Billing review: {r.admin_note}</p>}{r.status==='pending'&&r.requester_role==='doctor'&&Number(r.requester_user_id)===Number(data.actor?.id)&&<button type="button" className="mt-2 font-semibold underline" disabled={busy} onClick={async()=>{if(submitting.current)return;submitting.current=true;setBusy(true);try{await cancelClinicalChargeAdjustment(appointmentId,r.id);await load()}catch(e){setError(e.message)}finally{submitting.current=false;setBusy(false)}}}>Cancel Request</button>}</div>)}
 </section>
}
