import { useCallback, useEffect, useState } from 'react'
import { getCurrentPromotions } from '../../services/patient.service'
import { PromotionCard,visiblePromotions } from '../../components/promotions/PromotionCards'
export default function PatientOffers(){
  const [promos,setPromos]=useState([]),[loading,setLoading]=useState(true),[error,setError]=useState('')
  const load=useCallback(async()=>{setLoading(true);setError('');try{setPromos(visiblePromotions(await getCurrentPromotions()))}catch(err){setError(err.message||'Unable to load offers.')}finally{setLoading(false)}},[])
  useEffect(()=>{void load();const onUpdate=e=>{if(['promotion.updated','promotion_updated','stream.reconnected'].includes(e.detail?.eventName))void load()};window.addEventListener('clinic:refresh',onUpdate);const onFocus=()=>void load();window.addEventListener('focus',onFocus);return()=>{window.removeEventListener('clinic:refresh',onUpdate);window.removeEventListener('focus',onFocus)}},[load])
  return <main className="mx-auto max-w-5xl space-y-5"><header><h1 className="text-2xl font-black text-slate-900">Clinic Offers</h1><p className="text-sm text-slate-500">Currently active offers. Promotion details do not automatically reduce checkout prices.</p></header>{error&&<div role="alert" className="rounded-lg bg-rose-50 p-3 text-sm text-rose-800">{error} <button type="button" onClick={load} className="font-bold underline">Try Again</button></div>}{loading?<p role="status">Loading current offers…</p>:promos.length?<div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">{promos.map(p=><PromotionCard key={p.id} promotion={p}/>)}</div>:<p className="rounded-xl bg-slate-50 p-5 text-sm text-slate-600">No active offers at the moment.</p>}</main>
}
