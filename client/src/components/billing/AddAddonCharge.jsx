import { useRef, useState } from 'react'
import { Link, useLocation, useNavigate } from 'react-router-dom'
import { useAuth } from '../../context/AuthContext'
import { hasStaffPermission } from '../../config/staffPermissions'
import { getBillAddons, confirmBillAddon } from '../../services/addons.service'
import { formatMoney } from '../../utils/billingUi'
import { portalBaseForPath } from '../../utils/branchPortalPath.mjs'
import Modal from '../ui/Modal'
export default function AddAddonCharge({bill,onAdded,dirty=false}){
 const {user}=useAuth(),location=useLocation(),navigate=useNavigate()
 const [open,setOpen]=useState(false),[data,setData]=useState({options:[],charges:[]}),[selection,setSelection]=useState(''),[busy,setBusy]=useState(false),[error,setError]=useState(''),[loading,setLoading]=useState(false),[result,setResult]=useState(null)
 const submitting=useRef(false),requestKey=useRef(null)
 const staff=location.pathname.startsWith('/staff'),base=portalBaseForPath(location.pathname)
 const checkout=id=>staff?`/staff/checkout/${id}`:`${base}/billing/checkout/${id}`
 const history=id=>staff?`/staff/billing/history/${id}`:`${base}/billing/transactions/${id}`
 const editable=['draft','pending'].includes(bill?.status) && !bill.finalized_at && !(bill.payments||[]).length
 if(!bill||bill.original_bill_id||!['draft','pending','ready','paid','partially_paid'].includes(bill.status)||staff&&!hasStaffPermission(user,'checkout'))return null
 const choices=data.options.filter(o=>!data.charges.some(c=>Number(c.addon_id)===Number(o.addon_id)&&Number(c.service_id)===Number(o.service_id)))
 const chosen=choices.find(o=>`${o.service_id}:${o.addon_id}`===selection)
 const show=async()=>{setOpen(true);setError('');setResult(null);setSelection('');setLoading(true);requestKey.current=crypto.randomUUID();try{setData(await getBillAddons(bill.id))}catch(e){setError(e.message)}finally{setLoading(false)}}
 const confirm=async()=>{
  if(!chosen||submitting.current)return
  submitting.current=true;setBusy(true);setError('')
  try{
   const saved=await confirmBillAddon(bill.id,{addon_id:chosen.addon_id,service_id:chosen.service_id,expected_price:Number(chosen.price),request_key:requestKey.current})
   setResult(saved)
   if(editable){await onAdded?.();setOpen(false)}
  }catch(e){setError(e.message)}finally{submitting.current=false;setBusy(false)}
 }
 return <><button type="button" disabled={dirty} title={dirty?'Save bill changes before adding an add-on.':undefined} className="button-secondary" onClick={show}>{editable?'Add Add-on':'New Add-on Charge'}</button>
 <Modal open={open} onClose={()=>!busy&&setOpen(false)} closeDisabled={busy} title={editable?'Add Add-on':'New Add-on Charge'} description="Review the configured price and confirm. Certificate issuance is handled separately by the doctor.">
 <div className="space-y-4"><div className="rounded-xl bg-slate-50 p-3 text-sm"><p><strong>Patient:</strong> {bill.patient_name}</p><p><strong>Branch:</strong> {bill.branch_name}</p><p><strong>Original visit:</strong> {bill.appointment_date} · Bill #{bill.id}</p></div>{error&&<p role="alert" className="text-rose-700">{error}</p>}
 {result?<div className="space-y-3"><p role="status">{Number(result.price_snapshot)===0?'Free / included add-on recorded. No collection or payment receipt is required.':'Add-on transaction created. It is available under Payments → Pending.'}</p><Link className="button-secondary" to={history(result.billing_id)}>View Add-on Bill</Link>{Number(result.price_snapshot)>0&&<button className="button-primary" onClick={()=>navigate(checkout(result.billing_id))}>Bill Checkout</button>}</div>:loading?<p>Loading configured add-ons…</p>:<><label className="form-label">Add-on<select className="form-control mt-1" value={selection} onChange={e=>setSelection(e.target.value)}><option value="">Select an add-on</option>{choices.map(o=><option key={`${o.service_id}:${o.addon_id}`} value={`${o.service_id}:${o.addon_id}`}>{o.service_name} — {o.name} ({formatMoney(o.price)})</option>)}</select></label>{!choices.length&&<p className="text-sm text-slate-500">No uncharged add-ons are configured for this visit’s services.</p>}{chosen&&<p className="text-lg font-bold">{formatMoney(chosen.price)}{Number(chosen.price)===0?' · Free / included':''}</p>}<button disabled={!chosen||busy} className="button-primary" onClick={confirm}>{busy?'Confirming…':'Confirm Add-on'}</button></>}
 {data.charges.length>0&&<div className="space-y-2 border-t pt-3"><strong>Recorded add-ons</strong>{data.charges.map(c=><p key={c.id} className="text-sm"><Link className="text-sky-700 underline" to={history(c.billing_id)}>{c.name_snapshot} · {formatMoney(c.price_snapshot)} · Bill #{c.billing_id}</Link></p>)}</div>}</div></Modal></>
}
