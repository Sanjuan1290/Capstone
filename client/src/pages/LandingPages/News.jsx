import { AnnouncementBody } from '../../components/system/AnnouncementRichText'
import { useEffect, useState } from 'react'
import { Link, useParams, useSearchParams } from 'react-router-dom'
import { MdArrowForward, MdArrowBack, MdCalendarMonth, MdRefresh } from 'react-icons/md'
import { Reveal } from './LandingPage'
import { isExternalPath, normalizeAppPath } from '../../utils/navigation'

const readNews = async url => {
  const response = await fetch(`/api/news${url}`, { credentials: 'same-origin', cache: 'no-store' })
  const result = await response.json()
  if (!response.ok) throw Object.assign(new Error(result.message || 'News is temporarily unavailable.'), { code: result.code })
  return result
}
const categories = [['all','All Updates'],['promotion','Offers'],['news','Clinic News'],['article','Health Articles']]
const formattedDate = date => {
  if (!date) return ''
  const parsed = new Date(date)
  return Number.isNaN(parsed.getTime()) ? '' : parsed.toLocaleDateString('en-PH', { year: 'numeric', month: 'long', day: 'numeric' })
}
const NewsImage = ({ src, alt='' }) => <div className="aspect-[16/9] overflow-hidden bg-gradient-to-br from-sky-50 to-teal-100">{src ? <img src={src} alt={alt} loading="lazy" className="h-full w-full object-cover transition-transform duration-300 motion-safe:group-hover:scale-[1.04]"/> : <div className="flex h-full items-center justify-center text-5xl" aria-hidden="true">📰</div>}</div>
const categoryLabel = type => categories.find(([key])=>key===type)?.[1] || 'Clinic Update'
export const NewsList = () => {
  const [search] = useSearchParams()
  const type = categories.some(([key])=>key===search.get('type')) ? search.get('type') : 'all'
  const [posts,setPosts] = useState([]), [error,setError] = useState(''), [loading,setLoading] = useState(true), [refresh,setRefresh] = useState(0)
  const [accountRequired,setAccountRequired] = useState(false)
  useEffect(() => {
    let active=true
    setLoading(true);setError('');setPosts([]);setAccountRequired(false)
    readNews(`?type=${encodeURIComponent(type)}`).then(items => { if(active) setPosts(Array.isArray(items)?items:[]) }).catch(err => { if(active) { setError(err.message);setAccountRequired(err.code==='PATIENT_ACCOUNT_REQUIRED') } }).finally(()=>{if(active)setLoading(false)})
    return ()=>{active=false}
  },[type,refresh])
  return <main className="carait-landing min-h-[65vh] bg-slate-50 pb-20">
    <header className="bg-gradient-to-br from-teal-900 to-sky-900 px-4 py-16 text-white sm:px-6 sm:py-20"><div className="mx-auto max-w-6xl"><p className="text-xs font-extrabold uppercase tracking-[.18em] text-teal-100">CARAIT Clinic</p><h1 className="mt-3 text-4xl font-black tracking-tight sm:text-5xl">News & Offers</h1><p className="mt-4 max-w-2xl text-base leading-7 text-sky-100">Clinic announcements, patient information and current service promotions. Check the terms of each offer before booking.</p></div></header>
    <div className="mx-auto max-w-6xl px-4 pt-9 sm:px-6"><nav className="mb-8 flex flex-wrap gap-2" aria-label="News categories">{categories.map(([key,label])=><Link key={key} to={key==='all'?'/news':`/news?type=${key}`} aria-current={type===key?'page':undefined} className={`inline-flex min-h-11 items-center rounded-xl px-4 text-sm font-bold transition-colors duration-200 focus-visible:outline focus-visible:outline-2 focus-visible:outline-sky-700 ${type===key?'bg-sky-800 text-white':'border border-slate-200 bg-white text-slate-700 hover:bg-sky-50'}`}>{label}</Link>)}</nav>
      {loading ? <div role="status" className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3" aria-label="Loading updates">{[1,2,3].map(n=><div key={n} className="h-72 animate-pulse rounded-2xl bg-slate-200" />)}</div> : error ? <div role="alert" className="rounded-2xl border border-red-200 bg-white p-8"><h2 className="text-lg font-bold text-slate-900">{accountRequired ? 'Patient account required' : 'Unable to load clinic updates'}</h2><p className="mt-2 text-sm text-slate-600">{error}</p>{accountRequired && <Link to="/patient/login?next=%2Fnews%3Ftype%3Dpromotion" className="mt-5 inline-flex min-h-11 items-center rounded-xl bg-emerald-700 px-5 text-sm font-bold text-white">Sign in to view offers</Link>}<button type="button" onClick={()=>setRefresh(n=>n+1)} className="mt-5 inline-flex min-h-11 items-center gap-2 rounded-xl bg-sky-800 px-5 text-sm font-bold text-white"><MdRefresh /> Try Again</button></div> : !posts.length ? <div className="rounded-2xl border border-slate-200 bg-white p-10 text-center"><h2 className="text-xl font-bold text-slate-900">No updates in this category yet</h2><p className="mt-3 text-sm text-slate-600">Choose another category or check again later.</p></div> : <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">{posts.map((post,index)=><Reveal key={`${post.branch_id}-${post.id}`} delay={index%3*65}><article className="group flex h-full flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm transition-[transform,box-shadow] duration-300 motion-safe:hover:-translate-y-1 hover:shadow-lg"><NewsImage src={post.cover_image_url} /><div className="flex flex-1 flex-col p-6"><p className="text-xs font-extrabold uppercase tracking-wide text-teal-700">{categoryLabel(post.type)}{post.branch_name?` · ${post.branch_name}`:''}</p>{formattedDate(post.published_at || post.created_at) && <p className="mt-2 flex items-center gap-1 text-xs text-slate-500"><MdCalendarMonth /> {formattedDate(post.published_at || post.created_at)}</p>}<h2 className="mt-3 text-xl font-extrabold leading-7 text-slate-900">{post.title}</h2><p className="mt-3 flex-1 text-sm leading-6 text-slate-600">{post.caption}</p><Link className="mt-5 inline-flex min-h-11 items-center gap-2 self-start font-bold text-sky-800 underline underline-offset-4" to={`/news/${post.branch_id}/${post.slug}`}>Read Details <MdArrowForward /></Link></div></article></Reveal>)}</div>}
    </div>
  </main>
}
export const NewsDetail = () => {
  const { branchId,slug } = useParams()
  const [post,setPost] = useState(null), [error,setError] = useState(''), [loading,setLoading] = useState(true), [refresh,setRefresh] = useState(0)
  useEffect(()=>{let active=true;setPost(null);setError('');setLoading(true);readNews(`/${branchId}/${encodeURIComponent(slug)}`).then(value=>{if(active)setPost(value)}).catch(err=>{if(active)setError(err.message)}).finally(()=>{if(active)setLoading(false)});return()=>{active=false}},[branchId,slug,refresh])
  const path = post?.booking_url ? normalizeAppPath(post.booking_url,'/patient/book') : null
  return <main className="min-h-[65vh] bg-slate-50 px-4 py-10 sm:px-6"><div className="mx-auto max-w-4xl"><Link to="/news" className="inline-flex min-h-11 items-center gap-2 text-sm font-bold text-sky-800"><MdArrowBack /> Back to News & Offers</Link>{error ? <div role="alert" className="mt-8 rounded-2xl bg-white p-7"><p className="text-red-700">{error}</p><button className="mt-5 inline-flex min-h-11 items-center gap-2 rounded-lg bg-sky-800 px-4 text-white" onClick={()=>setRefresh(n=>n+1)}><MdRefresh/>Try Again</button></div> : loading ? <div className="mt-8 h-96 animate-pulse rounded-3xl bg-slate-200" role="status" aria-label="Loading article"/> : post ? <article className="mt-8 overflow-hidden rounded-3xl bg-white shadow-sm"><NewsImage src={post.cover_image_url} /><div className="space-y-5 p-6 sm:p-10"><p className="text-xs font-extrabold uppercase tracking-wide text-teal-700">{categoryLabel(post.type)}{post.branch_name ? ` · ${post.branch_name}` : ''}</p><h1 className="text-3xl font-black text-slate-900 sm:text-4xl">{post.title}</h1><p className="text-lg text-slate-600">{post.caption}</p><div className="break-words text-base leading-8 text-slate-700"><AnnouncementBody body={post.body}/></div>{post.booking_unavailable && <p className="rounded-lg bg-amber-50 p-3 text-sm text-amber-900">This clinic offer is not currently available for booking. Contact the clinic for current services.</p>}{path && (isExternalPath(path) ? <a className="inline-flex min-h-11 items-center gap-2 rounded-xl bg-sky-800 px-5 text-sm font-bold text-white" href={path} rel="noopener noreferrer" target="_blank">{post.booking_multiple_services?'Choose Eligible Service':post.cta_label||'Book an Appointment'} <MdArrowForward /></a> : <Link to={path} className="inline-flex min-h-11 items-center gap-2 rounded-xl bg-sky-800 px-5 text-sm font-bold text-white">{post.booking_multiple_services?'Choose Eligible Service':post.cta_label||'Book an Appointment'} <MdArrowForward /></Link>)}</div></article>:null}</div></main>
}
export const MarketingUnsubscribe = () => {
  const [params] = useSearchParams(), token = params.get('token') || ''
  const [message,setMessage] = useState(''), [busy,setBusy] = useState(false)
  const submit = async () => {setBusy(true);try{const response=await fetch('/api/news/unsubscribe',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({token})});const result=await response.json();if(!response.ok)throw new Error(result.message||'Please try again.');setMessage(result.message)}catch(err){setMessage(err.message)}finally{setBusy(false)}}
  return <main className="mx-auto max-w-xl px-4 py-16 text-center"><h1 className="text-2xl font-bold">Promotional email preferences</h1><p className="my-4 text-slate-600">Unsubscribe from CARAIT marketing campaigns. Appointment and account security messages are not affected.</p>{message?<p role="status">{message}</p>:<button className="button-primary" disabled={!token||busy} onClick={submit}>{busy?'Updating…':'Unsubscribe from promotions'}</button>}</main>
}
