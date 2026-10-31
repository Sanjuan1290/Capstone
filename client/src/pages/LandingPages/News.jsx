import { AnnouncementBody } from '../../components/system/AnnouncementRichText'
import { useEffect, useState } from 'react'
import { Link, useParams, useSearchParams } from 'react-router-dom'

const readNews = async url => {
  const response = await fetch(`/api/news${url}`)
  const result = await response.json()
  if (!response.ok) throw new Error(result.message || 'News is temporarily unavailable.')
  return result
}
export const NewsList = () => {
  const [search] = useSearchParams(), type = search.get('type') || 'all'
  const [posts, setPosts] = useState([]), [error, setError] = useState(''), [loading, setLoading] = useState(true)
  useEffect(() => {
    let active = true
    setLoading(true)
    readNews(`?type=${encodeURIComponent(type)}`).then(items => {
      if (active) { setPosts(items); setError('') }
    }).catch(err => { if (active) setError(err.message) }).finally(() => { if (active) setLoading(false) })
    return () => { active = false }
  }, [type])
  return <main className="mx-auto w-full max-w-6xl px-4 py-10 sm:px-6">
    <p className="text-sm font-bold uppercase tracking-widest text-amber-700">CARAIT Clinic</p>
    <h1 className="mt-2 text-3xl font-black text-slate-900">News & Offers</h1>
    <p className="mt-2 mb-6 text-slate-600">Clinic announcements, articles and current service promotions.</p>
    <nav className="mb-7 flex flex-wrap gap-2" aria-label="News categories">{[['all','All'],['promotion','Promotions'],['news','News'],['article','Articles']].map(([value,name]) => <Link key={value} to={value==='all'?'/news':`/news?type=${value}`} className={`rounded-full px-4 py-2 text-sm font-semibold ${type===value?'bg-slate-900 text-white':'bg-slate-100 text-slate-700'}`}>{name}</Link>)}</nav>
    {loading?<p role="status">Loading news…</p>:error?<p role="alert" className="rounded-xl bg-red-50 p-4 text-red-700">{error}</p>:!posts.length?<p className="rounded-xl bg-slate-50 p-8 text-slate-500">No published announcements are available yet.</p>:<div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">{posts.map(post => <article key={post.id} className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm"><div className="h-44 bg-slate-100">{post.cover_image_url?<img src={post.cover_image_url} alt="" loading="lazy" className="h-full w-full object-cover"/>:<div className="flex h-full items-center justify-center text-4xl" aria-hidden="true">📰</div>}</div><div className="space-y-2 p-5"><p className="text-xs font-bold uppercase text-amber-700">{post.type} · {post.branch_name}</p><h2 className="text-lg font-black text-slate-900">{post.title}</h2><p className="text-sm text-slate-600">{post.caption}</p><Link className="inline-block pt-2 text-sm font-bold text-blue-700 underline" to={`/news/${post.branch_id}/${post.slug}`}>Read more →</Link></div></article>)}</div>}
  </main>
}
export const NewsDetail = () => {
  const { branchId, slug } = useParams(), [post,setPost] = useState(null), [error,setError] = useState('')
  useEffect(() => {let active = true;setPost(null);setError('');readNews(`/${branchId}/${encodeURIComponent(slug)}`).then(value=>{if(active)setPost(value)}).catch(err=>{if(active)setError(err.message)});return()=>{active=false}},[branchId,slug])
  return <main className="mx-auto max-w-4xl px-4 py-10 sm:px-6"><Link to="/news" className="text-sm font-bold text-blue-700">← News & Offers</Link>{error?<p role="alert" className="mt-8">{error}</p>:!post?<p role="status" className="mt-8">Loading article…</p>:<article className="mt-8 space-y-5"><p className="text-sm font-bold uppercase text-amber-700">{post.type} · {post.branch_name}</p><h1 className="text-3xl font-black text-slate-900">{post.title}</h1><p className="text-lg text-slate-600">{post.caption}</p>{post.cover_image_url&&<img src={post.cover_image_url} alt="" className="max-h-[440px] w-full rounded-2xl object-cover"/>}<div className="whitespace-pre-wrap break-words text-base leading-relaxed text-slate-700"><AnnouncementBody body={post.body}/></div>{post.cta_url&&<Link className="button-primary inline-flex" to={post.cta_url}>{post.cta_label||'Book an Appointment'}</Link>}</article>}</main>
}
export const MarketingUnsubscribe = () => {
  const [params] = useSearchParams(), token = params.get('token') || ''
  const [message,setMessage] = useState(''), [busy,setBusy] = useState(false)
  const submit = async () => {setBusy(true);try{const response=await fetch('/api/news/unsubscribe',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({token})});const result=await response.json();if(!response.ok)throw new Error(result.message || 'Please try again.');setMessage(result.message)}catch(err){setMessage(err.message)}finally{setBusy(false)}}
  return <main className="mx-auto max-w-xl px-4 py-16 text-center"><h1 className="text-2xl font-bold">Promotional email preferences</h1><p className="my-4 text-slate-600">Unsubscribe from CARAIT marketing campaigns. Appointment and account security messages are not affected.</p>{message?<p role="status">{message}</p>:<button className="button-primary" disabled={!token||busy} onClick={submit}>{busy?'Updating…':'Unsubscribe from promotions'}</button>}</main>
}

