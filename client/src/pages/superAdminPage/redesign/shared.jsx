import {useEffect,useRef,useState} from 'react'
import {MdClose,MdInfoOutline,MdErrorOutline,MdCheckCircle,MdWarningAmber,MdRefresh,MdInbox,MdSearch} from 'react-icons/md'
export const PERMISSIONS=['dashboard','appointments','patient_records','doctor_schedules','billing','inventory','stock_transfers','accounts','system_setup','reports','audit_logs']
export const LABEL={dashboard:'Dashboard',appointments:'Appointments',patient_records:'Patient Records',doctor_schedules:'Doctor Schedules',billing:'Billing',inventory:'Inventory',stock_transfers:'Stock Transfers',accounts:'Accounts',system_setup:'System Setup',reports:'Reports',audit_logs:'Audit Logs'}
export const pesos=(n)=>new Intl.NumberFormat('en-PH',{style:'currency',currency:'PHP',maximumFractionDigits:2}).format(Number(n)||0)
export const whole=n=>new Intl.NumberFormat('en-PH').format(Number(n)||0)
export const localDate=(date)=>date?new Date(date).toLocaleString('en-PH',{dateStyle:'medium',timeStyle:'short'}):'—'
export const todayISO=()=>{const d=new Date();return [d.getFullYear(),String(d.getMonth()+1).padStart(2,'0'),String(d.getDate()).padStart(2,'0')].join('-')}
export const beforeISO=(days)=>{const d=new Date(`${todayISO()}T12:00:00`);d.setDate(d.getDate()-days+1);return [d.getFullYear(),String(d.getMonth()+1).padStart(2,'0'),String(d.getDate()).padStart(2,'0')].join('-')}
export async function fetchJson(path,options={}){
 let response
 try {response=await fetch(`/api/branches${path}`,{credentials:'include',...options,headers:{...(options.body?{'Content-Type':'application/json'}:{}),...options.headers}})}
 catch {throw new Error('Cannot connect to the clinic server. Check your connection and try again.')}
 const contentType=response.headers.get('content-type')||''
 if(!contentType.toLowerCase().includes('application/json')) {
  if(response.status===401)throw new Error('Your session has expired. Sign in again to continue.')
  if(response.status===403)throw new Error('You do not have permission to view this information.')
  if(response.status===404)throw new Error('This feature is unavailable. Verify that the backend is running and the API proxy points to the correct server.')
  throw new Error('The server returned an unexpected response. Check the backend API or development proxy and try again.')
 }
 let data
 try {data=await response.json()}catch{throw new Error('The server sent an incomplete response. Please retry.')}
 if(!response.ok) {const error=new Error(data?.message||`Request failed (${response.status}).`);error.status=response.status;throw error}
 return data
}
export const PageHead=({title,description,action,eyebrow})=><div className="flex flex-wrap items-start justify-between gap-4"><div><p className="mb-1 text-xs font-semibold uppercase tracking-[0.18em] text-amber-600">{eyebrow||'Super Admin / Carait Clinic'}</p><h1 className="text-2xl font-black tracking-tight text-slate-900 sm:text-3xl">{title}</h1>{description&&<p className="mt-2 max-w-3xl text-sm text-slate-500">{description}</p>}</div>{action&&<div className="flex flex-wrap items-center gap-2">{action}</div>}</div>
export const Card=({title,description,action,children,className=''})=><section className={`rounded-2xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6 ${className}`}><div className="flex flex-wrap items-start justify-between gap-3">{title&&<div><h2 className="text-base font-bold text-slate-900">{title}</h2>{description&&<p className="mt-1 text-sm text-slate-500">{description}</p>}</div>}{action}</div>{children&&<div className={title?'mt-4':''}>{children}</div>}</section>
export const StatCard=({label,value,icon:Icon,helper})=><section className="min-w-0 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:p-5"><div className="flex items-center justify-between gap-2 text-sm text-slate-500"><span>{label}</span>{Icon&&<span className="rounded-lg bg-slate-100 p-2 text-slate-600"><Icon size={19}/></span>}</div><p className="mt-2 text-2xl font-black tracking-tight text-slate-900">{value??'—'}</p>{helper&&<p className="mt-2 text-xs text-slate-500">{helper}</p>}</section>
export const Pill=({children,tone='neutral'})=>{const colors={success:'bg-emerald-50 text-emerald-700 ring-emerald-100',warning:'bg-amber-50 text-amber-800 ring-amber-100',danger:'bg-rose-50 text-rose-700 ring-rose-100',neutral:'bg-slate-100 text-slate-600 ring-slate-200',info:'bg-sky-50 text-sky-700 ring-sky-100'};return <span className={`inline-flex rounded-full px-2.5 py-1 text-xs font-semibold ring-1 ${colors[tone]||colors.neutral}`}>{children}</span>}
export const Banner=({type='error',title,children,onRetry,onDismiss})=>{const style={error:['border-rose-200 bg-rose-50 text-rose-800',MdErrorOutline],warning:['border-amber-200 bg-amber-50 text-amber-900',MdWarningAmber],info:['border-sky-200 bg-sky-50 text-sky-900',MdInfoOutline],success:['border-emerald-200 bg-emerald-50 text-emerald-900',MdCheckCircle]}[type]||['border-slate-200 bg-slate-50 text-slate-700',MdInfoOutline];const Icon=style[1];return <div role={type==='error'?'alert':'status'} className={`flex items-start gap-3 rounded-xl border px-4 py-3 text-sm ${style[0]}`}><Icon size={20} className="mt-0.5 shrink-0"/><div className="flex-1"><p className="font-semibold">{title||(type==='error'?'Unable to load data':'Notice')}</p><p className="mt-1">{children}</p>{onRetry&&<button className="mt-2 inline-flex items-center gap-1 font-semibold underline" type="button" onClick={onRetry}><MdRefresh/> Try again</button>}</div>{onDismiss&&<button onClick={onDismiss} aria-label="Dismiss notification"><MdClose/></button>}</div>}
export const Empty=({title='No records found',description,icon:Icon=MdInbox,action})=><div className="flex flex-col items-center gap-2 py-12 text-center"><div className="rounded-2xl bg-slate-100 p-4 text-slate-400"><Icon size={28}/></div><h3 className="font-bold text-slate-800">{title}</h3><p className="max-w-md text-sm text-slate-500">{description}</p>{action&&<div className="mt-3">{action}</div>}</div>
export const Loading=({cards=3})=><div aria-label="Loading information" role="status" className="animate-pulse space-y-4"><div className="h-7 w-52 rounded bg-slate-200"/><div className="grid gap-3 sm:grid-cols-3">{Array.from({length:cards},(_,i)=><div key={i} className="h-28 rounded-2xl bg-slate-200"/>)}</div><div className="h-40 rounded-2xl bg-slate-200"/></div>
export const Field=({label,required=false,help,children})=><label className="block text-sm font-semibold text-slate-800"><span>{label}{required&&<span className="ml-1 text-rose-600">*</span>}</span>{children}{help&&<span className="mt-1 block text-xs font-normal text-slate-500">{help}</span>}</label>
export function Modal({open,title,description,onClose,children,wide=false}){
 const panel=useRef(null),closeRef=useRef(onClose)
 closeRef.current=onClose
 useEffect(()=>{
  if(!open)return undefined
  const previous=document.activeElement,oldOverflow=document.body.style.overflow
  document.body.style.overflow='hidden'
  const focusables=()=>Array.from(panel.current?.querySelectorAll('button:not(:disabled),[href],input:not(:disabled),select:not(:disabled),textarea:not(:disabled),[tabindex]:not([tabindex="-1"])')||[])
  focusables()[0]?.focus()
  const onKey=e=>{
   if(e.key==='Escape'){e.preventDefault();closeRef.current?.();return}
   if(e.key==='Tab'){const list=focusables();if(!list.length)return;const first=list[0],last=list[list.length-1];if(e.shiftKey&&document.activeElement===first){e.preventDefault();last.focus()}else if(!e.shiftKey&&document.activeElement===last){e.preventDefault();first.focus()}}
  }
  document.addEventListener('keydown',onKey)
  return()=>{document.body.style.overflow=oldOverflow;document.removeEventListener('keydown',onKey);previous?.focus?.()}
 },[open])
 if(!open)return null
 return <div className="fixed inset-0 z-[90] flex items-center justify-center overflow-y-auto bg-slate-950/60 p-4" onMouseDown={e=>{if(e.target===e.currentTarget)onClose()}}><section ref={panel} role="dialog" aria-modal="true" aria-label={title} className={`my-auto max-h-[90vh] w-full overflow-y-auto rounded-2xl bg-white shadow-2xl ${wide?'max-w-3xl':'max-w-xl'}`}><header className="sticky top-0 z-10 flex items-start justify-between gap-4 border-b bg-white px-6 py-5"><div><h2 className="text-lg font-black text-slate-900">{title}</h2>{description&&<p className="mt-1 text-sm text-slate-500">{description}</p>}</div><button type="button" className="rounded-lg p-2 text-slate-500 hover:bg-slate-100" aria-label="Close dialog" onClick={onClose}><MdClose size={20}/></button></header><div className="p-6">{children}</div></section></div>
}
export const SearchInput=({value,onChange,placeholder='Search records...'})=><label className="relative block"><MdSearch aria-hidden="true" className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400"/><input className="form-control w-full pl-10" value={value} onChange={e=>onChange(e.target.value)} placeholder={placeholder} aria-label={placeholder}/></label>
export const TableWrap=({children})=><div className="overflow-x-auto rounded-xl border border-slate-200"><table className="w-full min-w-[640px] text-left text-sm"><tbody>{children}</tbody></table></div>
export const PrimaryButton=({children,...props})=><button type="button" className="button-primary inline-flex items-center justify-center gap-2" {...props}>{children}</button>
export const SecondaryButton=({children,...props})=><button type="button" className="button-secondary inline-flex items-center justify-center gap-2" {...props}>{children}</button>
export function useAsync(load,deps=[]){const [data,setData]=useState(null),[error,setError]=useState(''),[loading,setLoading]=useState(true);useEffect(()=>{let active=true;setLoading(true);setError('');Promise.resolve().then(load).then(v=>{if(active)setData(v)}).catch(e=>{if(active)setError(e.message)}).finally(()=>{if(active)setLoading(false)});return()=>{active=false}},deps);return {data,error,loading,setData}}
