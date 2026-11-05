import {useEffect,useState} from 'react'
import useClinicRefresh from '../../hooks/useClinicRefresh'

/** Per-branch live acceptance. Does not alter a doctor's weekly schedule. */
export default function WalkInAcceptanceToggle({load,save,doctorId,readOnly=false}) {
  const [current,setCurrent]=useState(null)
  const [busy,setBusy]=useState(false)
  const [error,setError]=useState('')
  const refresh=async()=>{
    const result=await load();setCurrent(Boolean(result?.accepting_walk_ins));setError('')
  }
  useEffect(()=>{let live=true;setCurrent(null);setError('');load().then(r=>{if(live)setCurrent(Boolean(r?.accepting_walk_ins))}).catch(e=>{if(live)setError(e.message||'Status unavailable')});return()=>{live=false}},[doctorId,load])
  useClinicRefresh(refresh,['schedule.updated','accounts.updated'],{fallbackMs:30000,skip:()=>busy})
  const change=async()=>{
    if(busy||current===null||readOnly)return
    const next=!current;setBusy(true);setError('')
    try{const result=await save(next);setCurrent(Boolean(result.accepting_walk_ins))}
    catch(e){setError(e.message||'Could not update walk-in status.')}finally{setBusy(false)}
  }
  return <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm" aria-label="Walk-in acceptance">
    <div className="flex flex-wrap items-center justify-between gap-3">
      <div><h2 className="text-sm font-bold text-slate-900">Accepting Walk-ins</h2><p className="mt-1 text-xs text-slate-500">Separate from scheduled bookings. You must also be on duty and not have a blocked date.</p></div>
      <button type="button" role="switch" aria-label="Accepting Walk-ins" aria-checked={Boolean(current)} onClick={change} disabled={busy||current===null||readOnly} className={`relative h-9 w-[64px] rounded-full transition-colors disabled:opacity-60 ${current?'bg-emerald-600':'bg-slate-300'}`}>
        <span className={`absolute top-1 h-7 w-7 rounded-full bg-white shadow transition-all ${current?'left-[33px]':'left-1'}`} />
      </button>
    </div>
    <p className={`mt-2 text-xs font-semibold ${current?'text-emerald-700':'text-slate-500'}`}>{current===null?'Loading walk-in status…':current?'Walk-ins enabled for this branch':'Walk-ins paused for this branch'}{busy?' · Saving…':''}</p>
    {error&&<p role="alert" className="mt-2 text-xs text-rose-700">{error}</p>}
  </section>
}
