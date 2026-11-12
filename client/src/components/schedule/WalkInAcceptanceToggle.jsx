import {useCallback,useEffect,useRef,useState} from 'react'
import {useLocation} from 'react-router-dom'
import useClinicRefresh from '../../hooks/useClinicRefresh'

const readValue=result=>{
    const value=result?.accepting_walk_ins
    if(![true,false,1,0,'1','0'].includes(value))throw new Error('Walk-in status is unavailable. Refresh to try again.')
    return value===true||value===1||value==='1'
  }

/** Per-branch live acceptance. Does not alter a doctor's weekly schedule. */
export default function WalkInAcceptanceToggle({load,save,doctorId,readOnly=false}) {
  const [current,setCurrent]=useState(null)
  const [busy,setBusy]=useState(false)
  const [error,setError]=useState('')
  const {pathname}=useLocation()
  const methods=useRef({load,save})
  useEffect(()=>{methods.current={load,save}},[load,save])
  const generation=useRef(0),saving=useRef(false),mounted=useRef(false)
  const invalidate=useCallback(()=>{mounted.current=false;generation.current++},[])
  const refresh=useCallback(async()=>{
    if(saving.current)return
    const version=++generation.current
    try{
      const result=await methods.current.load()
      if(mounted.current&&version===generation.current){setCurrent(readValue(result));setError('')}
    }catch(e){if(mounted.current&&version===generation.current)setError(e.message||'Status unavailable')}
  },[])
  // Inline parent callbacks change identity on every render. Only the selected
  // doctor/branch route changes the resource; an older GET must never undo a PUT.
  useEffect(()=>{
    mounted.current=true;saving.current=false;setBusy(false);setCurrent(null);setError('')
    void refresh()
    return invalidate
  },[doctorId,pathname,refresh,invalidate])
  useClinicRefresh(refresh,['schedule.updated','accounts.updated'],{fallbackMs:30000,skip:()=>busy})
  const change=async()=>{
    if(saving.current||current===null||readOnly)return
    const next=!current,version=++generation.current
    saving.current=true;setBusy(true);setError('')
    try{const result=await methods.current.save(next);if(mounted.current&&version===generation.current)setCurrent(readValue(result))}
    catch(e){if(mounted.current&&version===generation.current)setError(e.message||'Could not update walk-in status.')}
    finally{if(mounted.current&&version===generation.current){saving.current=false;setBusy(false)}}
  }
  return <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm" aria-label="Walk-in acceptance">
    <div className="flex flex-wrap items-center justify-between gap-3">
      <div><h2 className="text-sm font-bold text-slate-900">Accepting Walk-ins</h2><p className="mt-1 text-xs text-slate-500">Separate from scheduled bookings. You must also be on duty and not have a blocked date.</p></div>
      {current===null?<span role="status" className="rounded-full bg-slate-100 px-3 py-2 text-xs text-slate-500">Checking…</span>:<button type="button" role="switch" aria-label="Accepting Walk-ins" aria-checked={current} onClick={change} disabled={busy||readOnly} className={`relative h-9 w-[64px] rounded-full transition-colors disabled:opacity-60 ${current?'bg-emerald-600':'bg-slate-300'}`}>
        <span className={`absolute top-1 h-7 w-7 rounded-full bg-white shadow transition-all ${current?'left-[33px]':'left-1'}`} />
      </button>}
    </div>
    <p className={`mt-2 text-xs font-semibold ${current?'text-emerald-700':'text-slate-500'}`}>{current===null?'Loading walk-in status…':current?'Walk-ins enabled for this branch':'Walk-ins paused for this branch'}{busy?' · Saving…':''}</p>
    {error&&<p role="alert" className="mt-2 text-xs text-rose-700">{error}</p>}
  </section>
}
