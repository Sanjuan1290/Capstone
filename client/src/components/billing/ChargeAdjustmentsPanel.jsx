import {useCallback,useEffect,useRef,useState} from 'react'
import { MdCheckCircle, MdHourglassEmpty, MdInfoOutline, MdPayments, MdWarningAmber } from 'react-icons/md'
const money=n=>`₱${(Number(n)||0).toLocaleString('en-PH',{minimumFractionDigits:2,maximumFractionDigits:2})}`
const base=()=>{
  const path=window.location.pathname
  const branch=path.match(/^\/superadmin\/branches\/(\d+)(?:\/|$)/)
  if(branch)return `/api/branches/workspace/${branch[1]}/legacy`
  if(path.startsWith('/staff'))return '/api/staff'
  return '/api/branches/my/legacy'
}
const fetchJson=async(url,options={})=>{
 const response=await fetch(url,{credentials:'include',...options,headers:{...(window.location.pathname.startsWith('/superadmin')?{'X-Admin-Portal':'superadmin'}:{}),...(options.headers||{})}})
 const data=await response.json().catch(()=>({}))
 if(!response.ok)throw new Error(data.message || 'Unable to update adjustment.')
 return data
}
export default function ChargeAdjustmentsPanel({billingId,onUpdated,staffOnly=false}){
 const [data,setData]=useState(null),[error,setError]=useState(''),[busy,setBusy]=useState(false)
 const [target,setTarget]=useState(''),[amount,setAmount]=useState(''),[reason,setReason]=useState(''),[success,setSuccess]=useState('')
 const load=useCallback(async()=>{
   try{const response=await fetchJson(`${base()}/billing/${billingId}/charge-adjustments`);setData(response);setError('')}
   catch(e){setError(e.message)}
 },[billingId])
 useEffect(()=>{void load()},[load])
 const targets=data?.targets||[],requests=data?.requests||[]
 const submitting=useRef(false)
 const direct=!staffOnly && data?.can_adjust_directly===true
 const ownRequest=t=>Number(t.requester_user_id)===Number(data?.actor?.id)&&(t.requester_role===data?.actor?.role||['admin','superadmin'].includes(t.requester_role)&&['admin','superadmin'].includes(data?.actor?.role))
 const reduced=t=>requests.filter(r=>r.status==='approved'&&r.target_type===t.target_type&&Number(r.catalog_service_id)===Number(t.catalog_service_id)&&Number(r.inventory_id||0)===Number(t.inventory_id||0)).reduce((sum,r)=>sum+Number(r.requested_amount),0)
 const selected=targets.find(t=>`${t.target_type}:${t.catalog_service_id}:${t.inventory_id||0}`===target)
 const editable=['draft','pending'].includes(data?.bill?.status)
 const submit=async()=>{
  if(!selected||submitting.current)return
  if(direct&&!window.confirm(`Apply a ${money(amount)} reduction to ${selected.label}? Reason: ${reason.trim()}`))return
  submitting.current=true
  setBusy(true);setError('');setSuccess('')
  try{
   await fetchJson(`${base()}/billing/${billingId}/charge-adjustments`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({...selected,amount:Number(amount),reason})})
   setAmount('');setReason('');setSuccess(direct?'Charge reduction applied.':'Charge reduction submitted for approval.');await load();onUpdated?.()
  }catch(e){setError(e.message)}finally{submitting.current=false;setBusy(false)}
 }
 const resolve=async(id,status)=>{
  if(submitting.current)return
  const note=status==='rejected'?window.prompt('Reason for rejecting the adjustment:'):''
  if(status==='rejected'&&!String(note||'').trim())return
  submitting.current=true;setBusy(true);setError('');setSuccess('')
  try{
    await fetchJson(`${base()}/billing/${billingId}/charge-adjustments/${id}`,{method:'PATCH',headers:{'Content-Type':'application/json'},body:JSON.stringify({status,note})})
    setSuccess(status==='approved'?'Charge reduction approved. Bill totals will refresh.':'Charge reduction rejected.');await load();onUpdated?.()
  }catch(e){setError(e.message)}finally{submitting.current=false;setBusy(false)}
 }
 return <section className="mt-5 rounded-2xl border border-slate-200 bg-slate-50/60 p-4 sm:p-5" aria-label="Adjust service and consumable charges">
   <div className="flex items-start gap-3"><span className="rounded-xl bg-sky-100 p-2 text-sky-700"><MdPayments className="text-xl" /></span><div><h3 className="font-black text-slate-900">Charge Reductions</h3>
   <p className="mt-1 text-xs leading-relaxed text-slate-600">Review original charges, approved reductions, and remaining charges. Each staff request is reviewed separately.</p></div></div>
   <div className="mt-3 flex items-start gap-2 rounded-xl border border-sky-100 bg-white px-3 py-2 text-xs text-sky-800"><MdInfoOutline className="mt-0.5 shrink-0"/><span>{direct?'Your authorized reduction applies immediately and is recorded in the audit log.':'An Admin must approve each request before the reduction applies.'}</span></div>
   {success && <p role="status" className="mt-3 flex items-center gap-2 rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs font-semibold text-emerald-800"><MdCheckCircle />{success}</p>}
   {error&&<p role="alert" className="mt-2 rounded-lg bg-rose-50 p-2 text-xs text-rose-700">{error}</p>}
   {targets.length>0 && <div className="mt-3 overflow-x-auto"><table className="w-full text-left text-xs"><thead><tr><th className="py-2">Charge</th><th>Original</th><th>Approved reductions</th><th>Remaining charge</th></tr></thead><tbody>{targets.map(t=><tr key={`${t.target_type}:${t.catalog_service_id}:${t.inventory_id||0}`}><td className="py-2 pr-2">{t.label}</td><td>{money(t.original_charge)}</td><td>−{money(reduced(t))}</td><td>{money(Math.max(0,Number(t.original_charge)-reduced(t)))}</td></tr>)}</tbody></table><p className="mt-2 text-xs text-slate-500">Promotions and additional discounts also reduce the bill balance. The server checks the available amount before applying a reduction.</p></div>}
   {editable && <div className="mt-4 grid gap-3 rounded-xl border border-slate-200 bg-white p-3 sm:grid-cols-2">
    <label className="sm:col-span-2 text-xs font-semibold">Charge to reduce
      <select className="form-control mt-1" value={target} onChange={e=>setTarget(e.target.value)}>
       <option value="">Select a service fee or supply</option>
       {targets.map(t=><option key={`${t.target_type}:${t.catalog_service_id}:${t.inventory_id||0}`} value={`${t.target_type}:${t.catalog_service_id}:${t.inventory_id||0}`}>{t.label} · {money(t.original_charge)}</option>)}
      </select>
    </label>
    <label className="text-xs font-semibold">Reduction (₱)
     <input className="form-control mt-1" type="number" min="0.01" max={selected?.original_charge||0} step="0.01" value={amount} onChange={e=>setAmount(e.target.value)}/>
    </label>
    <label className="text-xs font-semibold">Reason
     <input className="form-control mt-1" maxLength={255} placeholder="e.g. Courtesy discount" value={reason} onChange={e=>setReason(e.target.value)}/>
    </label>
    <button className="button-secondary sm:col-span-2" type="button" disabled={busy||!selected||!Number.isFinite(Number(amount))||Number(amount)<=0||Number(amount)>Number(selected?.original_charge||0)||reason.trim().length<5} onClick={submit}>{busy?'Submitting…':direct?'Apply Direct Reduction':'Request Charge Reduction'}</button>
   </div>}
   {requests.length>0&&<div className="mt-4 space-y-2">{requests.map(t=><div className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-slate-100 bg-slate-50 p-3 text-xs" key={t.id}>
     <div className="min-w-0"><strong>{t.target_type==='service_fee'?'Service fee':'Consumable'} — {money(t.requested_amount)}</strong><p className="mt-1 break-words text-slate-600">{t.reason}</p><span className={`mt-2 inline-flex items-center gap-1 rounded-full px-2 py-1 text-[11px] font-bold ${t.status==='approved'?'bg-emerald-100 text-emerald-700':t.status==='rejected'?'bg-rose-100 text-rose-700':'bg-amber-100 text-amber-800'}`}>{t.status==='approved'?<MdCheckCircle/>:t.status==='pending'?<MdHourglassEmpty/>:<MdWarningAmber/>}{t.status==='approved'?'Approved':t.status==='rejected'?'Rejected':t.status==='pending'?'Pending':'Needs review'}</span></div>
     {t.admin_note && <p className="mt-1 text-slate-500">{t.admin_note}</p>}{!staffOnly && ownRequest(t)&&t.status==='pending'&&<p>Another administrator must approve your request. You may reject it to cancel.</p>}{!staffOnly && t.status==='pending'&&<div className="flex gap-2"><button className="button-secondary" disabled={busy||!editable||ownRequest(t)} onClick={()=>resolve(t.id,'approved')}>Approve</button><button className="button-secondary" disabled={busy} onClick={()=>resolve(t.id,'rejected')}>Reject</button></div>}
     {staffOnly&&ownRequest(t)&&t.status==='pending'&&<button type="button" className="button-secondary" disabled={busy} onClick={async()=>{if(submitting.current)return;submitting.current=true;setBusy(true);try{await fetchJson(`${base()}/billing/${billingId}/charge-adjustments/${t.id}`,{method:'DELETE'});await load();onUpdated?.()}catch(e){setError(e.message)}finally{submitting.current=false;setBusy(false)}}}>Cancel Request</button>}
   </div>)}</div>}
   {data && targets.length===0 && <p className="mt-3 text-xs text-slate-500">This bill has no eligible itemized charges yet. Complete the consultation first.</p>}
 </section>
}
