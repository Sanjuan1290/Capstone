import {useEffect,useState} from 'react'
import {getQueueDisplaySecurity,generateQueueDisplayPin} from '../../services/admin.service'

export default function QueueDisplaySecurity(){
  const [status,setStatus]=useState(null)
  const [pin,setPin]=useState('')
  const [busy,setBusy]=useState(false)
  const [error,setError]=useState('')
  const [message,setMessage]=useState('')
  const load=async()=>{try{setStatus(await getQueueDisplaySecurity());setError('')}catch(e){setError(e.message||'Cannot load queue display security.')}}
  useEffect(()=>{void load()},[])
  const generate=async()=>{
    if(!window.confirm('Generate a new queue display PIN? Existing display sessions will be locked.'))return
    setBusy(true);setError('');setMessage('');setPin('')
    try{const result=await generateQueueDisplayPin();setPin(result.pin);setMessage(result.message);await load()}
    catch(e){setError(e.message||'Could not generate PIN.')}
    finally{setBusy(false)}
  }
  return <section className="max-w-2xl space-y-4 rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
    <div><h2 className="text-lg font-black text-slate-900">Queue Display Security</h2><p className="mt-1 text-sm text-slate-600">The selected branch uses its own 8-digit display PIN. Generate a new one when you need to change it.</p></div>
    <p className="text-sm text-slate-700">Status: <strong>{status===null?'Loading…':status.configured?'Configured':'Not configured in System Setup (may still use legacy server PIN)'}</strong></p>
    {status?.updated_at&&<p className="text-xs text-slate-500">Last updated: {new Date(status.updated_at).toLocaleString('en-PH')}</p>}
    <button type="button" className="button-primary" disabled={busy} onClick={generate}>{busy?'Generating…':'Generate New PIN'}</button>
    {pin&&<div className="rounded-2xl border border-emerald-200 bg-emerald-50 p-4"><p className="text-xs font-semibold text-emerald-800">Copy this PIN now. It will not be displayed again.</p><p className="mt-2 font-mono text-2xl font-black tracking-widest">{pin}</p><button type="button" className="button-secondary mt-3" onClick={()=>{navigator.clipboard?.writeText(pin).then(()=>setMessage('PIN copied.')).catch(()=>setError('Copy failed. Select the PIN manually.'))}}>Copy PIN</button><button type="button" className="button-secondary mt-3 ml-2" onClick={()=>setPin('')}>Hide PIN</button></div>}
    {message&&<p role="status" className="text-sm text-emerald-700">{message}</p>}
    {error&&<p role="alert" className="text-sm text-red-700">{error}</p>}
  </section>
}
