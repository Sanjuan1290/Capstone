import { useCallback, useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { MdCampaign, MdAdd, MdRefresh, MdCloudUpload, MdSend, MdPause, MdPlayArrow, MdCancel } from 'react-icons/md'
import {
  getAdminPromotions, listAnnouncements, saveAnnouncement, uploadAnnouncementCover, checkAnnouncementCover,
  getCampaignAudience, listMarketingCampaigns, listCampaignRecipients, startMarketingCampaign, controlMarketingCampaign,
} from '../../services/admin.service'
import { useToast } from '../../components/ui/ToastProvider'

const blank = () => ({type:'promotion',title:'',slug:'',caption:'',body:'',status:'draft',publish_at:'',expires_at:'',cta_label:'Book an Appointment',cta_url:'/patient/book',promotion_id:'',cover_image_url:'',cover_image_token:''})
const fmt = s => s ? String(s).replace(' ','T').slice(0,16) : ''
const Admin_Announcements = () => {
  const toast=useToast()
  const [posts,setPosts]=useState([])
  const [promotions,setPromotions]=useState([])
  const [campaigns,setCampaigns]=useState([])
  const [audience,setAudience]=useState(null)
  const [editing,setEditing]=useState(null)
  const [form,setForm]=useState(blank())
  const [error,setError]=useState('')
  const [loading,setLoading]=useState(true)
  const [busy,setBusy]=useState(false)
  const [scan,setScan]=useState(null)
  const [selection,setSelection]=useState({recipient_mode:'random',limit:500,scheduled_at:''})
  const [campaignPost,setCampaignPost]=useState(null)
  const [details,setDetails]=useState(null)
  const refresh=useCallback(async()=>{
    setLoading(true)
    try{
      const [announcements,campaignList,count,promos]=await Promise.all([listAnnouncements(),listMarketingCampaigns(),getCampaignAudience(),getAdminPromotions()])
      setPosts(announcements);setCampaigns(campaignList);setAudience(count);setPromotions(promos);setError('')
    }catch(e){setError(e.message||'Could not load announcements.')}finally{setLoading(false)}
  },[])
  useEffect(()=>{void refresh()},[refresh])
  const edit = post => {setEditing(post?.id||'new');setScan(null);setForm(post?{...post,publish_at:fmt(post.publish_at),expires_at:fmt(post.expires_at),promotion_id:post.promotion_id||'',cover_image_token:''}:blank())}
  const update=(key,value)=>setForm(s=>({...s,[key]:value}))
  const onImage=async file=>{
    if(!file)return
    if(!['image/jpeg','image/png'].includes(file.type)||file.size>5*1024*1024){setError('Select a JPG or PNG cover up to 5 MB.');return}
    setBusy(true);setError('')
    try{
      const result=await uploadAnnouncementCover(file)
      update('cover_image_url',result.url)
      setScan({state:'pending',token:result.scan_token})
      toast.success('Image uploaded. Awaiting security scan approval.')
    }catch(e){setError(e.message)}finally{setBusy(false)}
  }
  const verifyImage=async()=>{
    setBusy(true)
    try{
      const result=await checkAnnouncementCover(scan.token)
      if(result.status==='approved') {setForm(s=>({...s,cover_image_url:result.url,cover_image_token:result.security_token}));setScan({state:'approved',token:scan.token});toast.success('Image approved.')}
      else {setScan(s=>({...s,state:result.status}));setError(result.message||`Security scan status: ${result.status}. Try again shortly.`)}
    }catch(e){setError(e.message)}finally{setBusy(false)}
  }
  const save=async e=>{
    e.preventDefault();if(scan&&scan.state!=='approved'){setError('Security scan must approve the cover image before it can be saved.');return}
    setBusy(true);setError('')
    try {const result=await saveAnnouncement({...form,promotion_id:form.promotion_id||null},editing==='new'?null:editing);toast.success(result.message);setEditing(null);await refresh()}
    catch(e){setError(e.message)}finally{setBusy(false)}
  }
  const queue=async()=>{
    if(!campaignPost || !window.confirm(`Queue this email campaign for opted-in, verified patients of this branch? Sending may take multiple days and cannot be recalled once delivered.`))return
    setBusy(true);setError('')
    try{const result=await startMarketingCampaign(campaignPost.id,{...selection,limit:Number(selection.limit)});toast.success(`${result.queued} patients added to the email queue.`);setCampaignPost(null);await refresh()}catch(e){setError(e.message)}finally{setBusy(false)}
  }
  const inspectCampaign=async id=>{
    if(details?.id===id){setDetails(null);return}
    try{const page=await listCampaignRecipients(id);setDetails({id,...page})}catch(e){setError(e.message)}
  }
  const changeCampaign=async(id,action)=>{
    if(action==='cancel'&&!window.confirm('Cancel all unsent emails? Messages already accepted by the provider cannot be recalled.'))return
    setBusy(true)
    try{await controlMarketingCampaign(id,action);await refresh()}catch(e){setError(e.message)}finally{setBusy(false)}
  }
  return <section className="mx-auto max-w-7xl space-y-5">
    <header className="flex flex-wrap items-start justify-between gap-3 rounded-2xl border border-slate-200 bg-white p-5">
      <div><h1 className="flex items-center gap-2 text-xl font-black text-slate-900"><MdCampaign className="text-amber-500"/> Announcements & Campaigns</h1>
        <p className="mt-1 max-w-3xl text-sm text-slate-500">Create public News & Offers posts independently of email campaigns. Email is sent only to eligible, consenting patients of this branch. Posting an offer never changes checkout prices.</p></div>
      <div className="flex gap-2"><button type="button" className="button-secondary" onClick={refresh}><MdRefresh/> Refresh</button><button type="button" className="button-primary" onClick={()=>edit(null)}><MdAdd/> New post</button></div>
    </header>
    {error&&<div className="rounded-xl border border-rose-200 bg-rose-50 p-3 text-sm text-rose-700" role="alert">{error}</div>}
    <div className="flex flex-wrap gap-3 text-sm"><span className="rounded-full bg-sky-50 px-3 py-2 text-sky-800">Eligible patients: {audience?.eligible??'—'}</span><span className={`rounded-full px-3 py-2 ${audience?.provider_ready?'bg-emerald-50 text-emerald-700':'bg-amber-50 text-amber-800'}`}>Email provider: {audience?.provider_ready?'Configured':'Not configured — sending disabled'}</span><Link to="/news" target="_blank" rel="noreferrer" className="button-secondary">View public News & Offers ↗</Link></div>
    {editing!==null&&<form onSubmit={save} className="space-y-4 rounded-2xl border border-emerald-200 bg-white p-5">
      <h2 className="font-bold">{editing==='new'?'Create a news post or promotion':'Edit announcement'}</h2>
      <div className="grid gap-3 md:grid-cols-3">
        <label className="form-label">Category<select className="form-control mt-1" value={form.type} onChange={e=>update('type',e.target.value)}><option value="promotion">Promotion</option><option value="news">Clinic News</option><option value="article">Health Article</option></select></label>
        <label className="form-label md:col-span-2">Title *<input className="form-control mt-1" required maxLength={160} value={form.title} onChange={e=>update('title',e.target.value)}/></label>
        <label className="form-label md:col-span-2">Short caption *<input className="form-control mt-1" required maxLength={350} value={form.caption} onChange={e=>update('caption',e.target.value)}/></label>
        <label className="form-label">URL slug<input className="form-control mt-1" value={form.slug||''} onChange={e=>update('slug',e.target.value)} placeholder="auto from title"/></label>
      </div>
      {form.type==='promotion'&&<label className="block form-label">Link to existing service promotion (optional)<select className="form-control mt-1" value={form.promotion_id||''} onChange={e=>update('promotion_id',e.target.value)}><option value="">No linked offer</option>{promotions.filter(p=>p.is_active).map(p=><option key={p.id} value={p.id}>{p.title}</option>)}</select><span className="mt-1 block text-xs font-normal text-slate-500">This link does not automatically apply a billing discount.</span></label>}
      <label className="block form-label">Full article or offer details *<textarea required maxLength={12000} rows={7} className="form-control mt-1" value={form.body} onChange={e=>update('body',e.target.value)} placeholder="Terms, service information, booking details..."/></label>
      <div className="rounded-xl border border-dashed border-slate-300 p-3">
        <label className="inline-flex cursor-pointer items-center gap-2 rounded-lg bg-slate-100 px-3 py-2 text-sm font-semibold"><MdCloudUpload/> Upload cover (JPG/PNG, max 5 MB)<input className="sr-only" type="file" accept="image/jpeg,image/png" onChange={e=>onImage(e.target.files?.[0])}/></label>
        {form.cover_image_url&&<img alt="Announcement cover preview" className="mt-3 max-h-40 max-w-xs rounded-lg object-contain" src={form.cover_image_url}/>}
        {scan&&<div className="mt-2 flex items-center gap-2 text-sm"><span>Scan: {scan.state}</span>{scan.state!=='approved'&&<button type="button" className="button-secondary" disabled={busy} onClick={verifyImage}>Check image scan</button>}</div>}
        {form.cover_image_url&&<button type="button" className="mt-2 block text-xs text-rose-600 underline" onClick={()=>{setScan(null);setForm(s=>({...s,cover_image_url:'',cover_image_token:'',clear_cover_image:true}))}}>Remove cover</button>}
      </div>
      <div className="grid gap-3 md:grid-cols-3">
        <label className="form-label">Publish status<select className="form-control mt-1" value={form.status} onChange={e=>update('status',e.target.value)}><option value="draft">Draft</option><option value="scheduled">Scheduled</option><option value="published">Published</option><option value="archived">Archived</option></select></label>
        <label className="form-label">Publish at (clinic time)<input type="datetime-local" className="form-control mt-1" value={form.publish_at||''} onChange={e=>update('publish_at',e.target.value)}/></label>
        <label className="form-label">Expires at (optional)<input type="datetime-local" className="form-control mt-1" value={form.expires_at||''} onChange={e=>update('expires_at',e.target.value)}/></label>
        <label className="form-label">CTA label<input className="form-control mt-1" maxLength={60} value={form.cta_label||''} onChange={e=>update('cta_label',e.target.value)}/></label>
        <label className="form-label md:col-span-2">Internal CTA path<input className="form-control mt-1" value={form.cta_url||''} onChange={e=>update('cta_url',e.target.value)} placeholder="/patient/book"/></label>
      </div>
      <div className="flex justify-end gap-2"><button type="button" className="button-secondary" onClick={()=>{setEditing(null);setScan(null)}}>Cancel</button><button type="submit" className="button-primary" disabled={busy}>{busy?'Working…':'Save announcement'}</button></div>
    </form>}
    {campaignPost&&<div className="rounded-2xl border border-sky-200 bg-white p-5 space-y-3">
      <h2 className="font-bold">New email campaign — {campaignPost.title}</h2>
      <p className="text-sm text-slate-500">Recipients are drawn only from email-verified, marketing-opted-in patients with appointment history in this branch. Selection is frozen for this campaign. Emails are queued and throttled, not sent in a single request.</p>
      <div className="grid gap-3 md:grid-cols-3"><label className="form-label">Audience<select className="form-control mt-1" value={selection.recipient_mode} onChange={e=>setSelection(s=>({...s,recipient_mode:e.target.value}))}><option value="random">Random selection</option><option value="all">All eligible (max 10,000)</option></select></label><label className="form-label">Max recipients (e.g. 500 / 1,000 / 5,000)<input type="number" min="1" max="10000" className="form-control mt-1" disabled={selection.recipient_mode==='all'} value={selection.limit} onChange={e=>setSelection(s=>({...s,limit:e.target.value}))}/></label><label className="form-label">Start after (optional)<input type="datetime-local" className="form-control mt-1" value={selection.scheduled_at} onChange={e=>setSelection(s=>({...s,scheduled_at:e.target.value}))}/></label></div>
      <p className="text-xs text-slate-600">Provider quota: up to {audience?.daily_limit||200} emails per day, {audience?.per_minute_limit||5} per minute across all branches. {selection.recipient_mode==='all'?audience?.eligible:Math.min(Number(selection.limit)||0,audience?.eligible||0)} recipients may take multiple days; sending is never immediate.</p>
      <div className="flex justify-end gap-2"><button className="button-secondary" type="button" onClick={()=>setCampaignPost(null)}>Cancel</button><button type="button" className="button-primary" disabled={busy||!audience?.provider_ready} onClick={queue}><MdSend/> Queue campaign</button></div>
    </div>}
    <div className="rounded-2xl border border-slate-200 bg-white p-5"><h2 className="mb-3 font-bold">Posts</h2>
      {loading?<p className="text-sm text-slate-500">Loading posts…</p>:!posts.length?<p className="text-sm text-slate-500">No announcements created yet.</p>:<div className="space-y-2">{posts.map(post=><div key={post.id} className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-slate-100 p-3"><div className="flex items-center gap-3">{post.cover_image_url&&<img src={post.cover_image_url} className="h-14 w-20 rounded-lg object-cover" alt=""/>}<div><p className="font-semibold text-slate-900">{post.title}</p><p className="text-xs text-slate-500">{post.type} · {post.status} · /news/{post.branch_id}/{post.slug}</p></div></div><div className="flex flex-wrap gap-2"><button type="button" className="button-secondary" onClick={()=>edit(post)}>Edit</button><button type="button" className="button-primary" disabled={!audience?.provider_ready||!['published','scheduled'].includes(post.status)} onClick={()=>setCampaignPost(post)}><MdSend/> Email patients</button></div></div>)}</div>}
    </div>
    <div className="rounded-2xl border border-slate-200 bg-white p-5"><h2 className="mb-3 font-bold">Campaign history</h2>
      {!campaigns.length?<p className="text-sm text-slate-500">No email campaigns yet.</p>:<div className="space-y-2">{campaigns.map(c=><div key={c.id} className="flex flex-wrap items-center justify-between gap-3 rounded-xl border p-3 text-sm"><div><p className="font-bold">{c.title}</p><p className="text-slate-500">{c.status} · {c.recipient_total} selected · {c.sent||0} accepted by provider · {c.pending||0} pending · {c.needs_review||0} uncertain (review)</p></div><div className="flex gap-2"><button type="button" className="button-secondary" onClick={()=>inspectCampaign(c.id)}>Details</button>{['queued','sending'].includes(c.status)&&<button type="button" className="button-secondary" onClick={()=>changeCampaign(c.id,'pause')}><MdPause/> Pause</button>}{c.status==='paused'&&<button type="button" className="button-secondary" onClick={()=>changeCampaign(c.id,'resume')}><MdPlayArrow/> Resume</button>}{['queued','sending','paused'].includes(c.status)&&<button type="button" className="button-secondary text-rose-600" onClick={()=>changeCampaign(c.id,'cancel')}><MdCancel/> Cancel unsent</button>}</div></div>)}</div>}
      {details&&<div className="mt-3 space-y-2 rounded-xl bg-slate-50 p-3"><h3 className="text-sm font-bold">Campaign #{details.id} — recipient delivery attempts</h3><div className="max-h-64 overflow-auto">{details.recipients.map(r=><div key={r.id} className="border-b border-slate-200 py-2 text-xs"><span className="font-semibold">{r.email}</span> · {r.status} · attempts: {r.attempts}{r.last_error&&<p className="text-rose-600">{r.last_error}</p>}</div>)}</div><div className="flex gap-2"><button type="button" className="button-secondary" disabled={details.page<=1} onClick={()=>listCampaignRecipients(details.id,details.page-1).then(page=>setDetails({id:details.id,...page})).catch(e=>setError(e.message))}>Previous</button><button type="button" className="button-secondary" disabled={details.recipients.length<50} onClick={()=>listCampaignRecipients(details.id,details.page+1).then(page=>setDetails({id:details.id,...page})).catch(e=>setError(e.message))}>Next</button></div></div>}
      <p className="mt-2 text-xs text-slate-500">Provider acceptance is not proof of inbox delivery. Unknown outcomes require provider-log review; they are not automatically resent.</p>
    </div>
  </section>
}
export default Admin_Announcements
JS
cat > /mnt/data/CARAIT_ANNOUNCEMENTS_STAGE_20261017/client/src/pages/LandingPages/News.jsx <<'JSX'
import {useEffect,useState} from 'react'
import {Link,useParams,useSearchParams} from 'react-router-dom'
const fetchNews=async(path)=>{const r=await fetch(`/api/news${path}`);const data=await r.json();if(!r.ok)throw new Error(data.message||'Could not load news.');return data}
export const NewsList=()=>{
 const [search]=useSearchParams(),type=search.get('type')||'all';const [posts,setPosts]=useState([]),[error,setError]=useState(''),[loading,setLoading]=useState(true)
 useEffect(()=>{let live=true;setLoading(true);fetchNews(`?type=${encodeURIComponent(type)}`).then(rows=>{if(live){setPosts(rows);setError('')}}).catch(e=>{if(live)setError(e.message)}).finally(()=>{if(live)setLoading(false)});return()=>{live=false}},[type])
 return <main className="mx-auto w-full max-w-6xl px-4 py-10 sm:px-6"><div className="mb-8"><p className="font-semibold uppercase tracking-widest text-amber-600">CARAIT Clinic</p><h1 className="mt-1 text-3xl font-black text-slate-900">News & Offers</h1><p className="mt-2 text-slate-600">Clinic news, helpful articles and current service promotions.</p></div><nav className="mb-6 flex flex-wrap gap-2">{[['all','All'],['promotion','Promotions'],['news','Clinic News'],['article','Articles']].map(([value,label])=><Link key={value} to={value==='all'?'/news':`/news?type=${value}`} className={`rounded-full px-4 py-2 text-sm font-semibold ${type===value?'bg-[#0b1a2c] text-white':'bg-slate-100 text-slate-700'}`}>{label}</Link>)}</nav>
 {loading?<p role="status">Loading News & Offers…</p>:error?<p role="alert" className="rounded-lg bg-red-50 p-4 text-red-700">{error}</p>:!posts.length?<p className="rounded-lg bg-slate-50 p-8 text-slate-500">No published posts are available right now.</p>:<div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">{posts.map(p=><article key={p.id} className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm"><div className="h-44 bg-slate-100">{p.cover_image_url?<img loading="lazy" src={p.cover_image_url} alt="" className="h-full w-full object-cover"/>:<div className="flex h-full items-center justify-center text-4xl">📰</div>}</div><div className="space-y-2 p-5"><span className="text-xs font-bold uppercase text-amber-700">{p.type} · {p.branch_name}</span><h2 className="text-lg font-black text-slate-900">{p.title}</h2><p className="text-sm text-slate-600">{p.caption}</p><Link className="inline-block pt-2 text-sm font-semibold text-blue-700 underline" to={`/news/${p.branch_id}/${p.slug}`}>Read more →</Link></div></article>)}</div>}
 </main>
}
export const NewsDetail=()=>{
 const {branchId,slug}=useParams(),[post,setPost]=useState(null),[error,setError]=useState('')
 useEffect(()=>{let live=true;setPost(null);setError('');fetchNews(`/${branchId}/${encodeURIComponent(slug)}`).then(data=>{if(live)setPost(data)}).catch(e=>{if(live)setError(e.message)});return()=>{live=false}},[branchId,slug])
 return <main className="mx-auto max-w-4xl px-4 py-10 sm:px-6"><Link to="/news" className="text-sm font-semibold text-blue-700">← News & Offers</Link>{error?<p className="mt-8" role="alert">{error}</p>:!post?<p className="mt-8" role="status">Loading article…</p>:<article className="mt-6 space-y-5"><p className="text-xs font-bold uppercase tracking-wide text-amber-700">{post.type} · {post.branch_name}</p><h1 className="text-3xl font-black text-slate-900">{post.title}</h1><p className="text-lg text-slate-600">{post.caption}</p>{post.cover_image_url&&<img alt="" src={post.cover_image_url} className="max-h-[440px] w-full rounded-2xl object-cover"/>}<div className="whitespace-pre-wrap break-words text-base leading-relaxed text-slate-700">{post.body}</div>{post.cta_url&&<Link className="button-primary inline-flex" to={post.cta_url}>{post.cta_label||'Book an Appointment'}</Link>}</article>}</main>
}
export const MarketingUnsubscribe=()=>{
 const [params]=useSearchParams(),token=params.get('token')||'';const [state,setState]=useState(''),[busy,setBusy]=useState(false)
 const unsubscribe=async()=>{setBusy(true);try{const r=await fetch('/api/news/unsubscribe',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({token})});const body=await r.json();if(!r.ok)throw new Error(body.message||'Please try again.');setState(body.message)}catch(e){setState(e.message)}finally{setBusy(false)}}
 return <main className="mx-auto max-w-xl px-4 py-16 text-center"><h1 className="text-2xl font-bold">Manage promotional emails</h1><p className="my-4 text-sm text-slate-600">Opt out of promotional announcements from CARAIT Clinic. You will still receive essential appointment and account-security messages.</p>{state?<p role="status">{state}</p>:<button className="button-primary" disabled={!token||busy} onClick={unsubscribe}>{busy?'Working…':'Unsubscribe from promotions'}</button>}</main>
}
