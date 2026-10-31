import useClinicRefresh from '../../hooks/useClinicRefresh'
import { useCallback, useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { MdCampaign, MdAdd, MdRefresh, MdCloudUpload, MdSend, MdPause, MdPlayArrow, MdCancel } from 'react-icons/md'
import {
  listAnnouncements, saveAnnouncement, deleteAnnouncement, setAnnouncementStatus, uploadAnnouncementCover, checkAnnouncementCover,
  getCampaignAudience, listMarketingCampaigns, listCampaignRecipients, startMarketingCampaign, controlMarketingCampaign,
} from '../../services/admin.service'
import { useToast } from '../../components/ui/ToastProvider'
import AnnouncementRichText, { AnnouncementBody } from '../../components/system/AnnouncementRichText' 

const blank = () => ({type:'news',title:'',caption:'',body:'',status:'draft',publish_at:'',expires_at:'',cover_image_url:'',cover_image_token:''})
const fmt = s => s ? String(s).replace(' ','T').slice(0,16) : ''
const Admin_Announcements = () => {
  const toast=useToast()
  const [posts,setPosts]=useState([])
    const [campaigns,setCampaigns]=useState([])
  const [audience,setAudience]=useState(null)
  const [editing,setEditing]=useState(null)
  const [form,setForm]=useState(blank())
  const [error,setError]=useState('')
  const [sectionErrors,setSectionErrors]=useState({})
  const [loading,setLoading]=useState(true)
  const [busy,setBusy]=useState(false)
  const [scan,setScan]=useState(null)
  const [selection,setSelection]=useState({recipient_mode:'random',limit:500,scheduled_at:''})
  const [campaignPost,setCampaignPost]=useState(null)
  const [details,setDetails]=useState(null)
  const [previewPost,setPreviewPost]=useState(null)
  const [postsTab,setPostsTab]=useState('all')
  const refresh=useCallback(async()=>{
    setLoading(true)
    setError('')
    // Posts, campaigns, audience/readiness, and promotions must not block each other.
    const results=await Promise.allSettled([listAnnouncements(),listMarketingCampaigns(),getCampaignAudience()])
    const [postResult,campaignResult,audienceResult]=results
    const failed={}
    if(postResult.status==='fulfilled' && Array.isArray(postResult.value))setPosts(postResult.value)
    else {setPosts([]);failed.posts='Unable to load announcements. Please try Refresh.'}
    if(campaignResult.status==='fulfilled' && Array.isArray(campaignResult.value))setCampaigns(campaignResult.value)
    else {setCampaigns([]);failed.campaigns='Unable to load email campaign history.'}
    if(audienceResult.status==='fulfilled' && audienceResult.value && typeof audienceResult.value==='object')setAudience(audienceResult.value)
    else {setAudience(null);failed.audience='Unable to check email service or eligible patient count.'}
    setSectionErrors(failed)
    setLoading(false)
  },[])
  useEffect(()=>{void refresh()},[refresh])
  useClinicRefresh(refresh,['promotion.updated'],{fallbackMs:120000,skip:()=>editing!==null||busy})
  const edit = post => {setEditing(post?.id||'new');setScan(null);setForm(post?{...post,publish_at:fmt(post.publish_at),expires_at:fmt(post.expires_at),cover_image_token:''}:blank())}
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
    try {const result=await saveAnnouncement(form,editing==='new'?null:editing);toast.success(result.message);setEditing(null);await refresh()}
    catch(e){setError(e.message)}finally{setBusy(false)}
  }
  const removePost=async post=>{
    if(!window.confirm(`Delete “${post.title}”? This cannot be undone. Posts with campaign history cannot be deleted.`))return
    setBusy(true);setError('')
    try{await deleteAnnouncement(post.id);toast.success('Post deleted.');await refresh()}catch(e){setError(e.message)}finally{setBusy(false)}
  }
  const togglePost=async post=>{
    setBusy(true);setError('')
    try{await setAnnouncementStatus(post.id,post.status==='published'?'archived':'published');toast.success('Post status updated.');await refresh()}catch(e){setError(e.message)}finally{setBusy(false)}
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
        <p className="mt-1 max-w-3xl text-sm text-slate-500">Create news, promotions, and articles here. Publish times use Philippine clinic time (UTC+08:00). Email is sent only to consenting patients of this branch. A promotional post does not change checkout prices.</p></div>
      <div className="flex gap-2"><button type="button" className="button-secondary" onClick={refresh}><MdRefresh/> Refresh</button><button type="button" className="button-primary" onClick={()=>edit(null)}><MdAdd/> New post</button></div>
    </header>
    {Object.keys(sectionErrors).length>0&&<div role="alert" className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900"><p className="font-semibold">Some sections could not load:</p>{Object.values(sectionErrors).map((message)=><p key={message}>{message}</p>)}<button className="mt-2 font-bold underline" type="button" onClick={refresh}>Try again</button></div>}
    {error&&<div className="rounded-xl border border-rose-200 bg-rose-50 p-3 text-sm text-rose-700" role="alert">{error}</div>}
    <div className="flex flex-wrap gap-3 text-sm"><span className="rounded-full bg-sky-50 px-3 py-2 text-sky-800">Eligible patients: {audience?.eligible??'—'}</span><span className={`rounded-full px-3 py-2 ${audience?.provider_ready?'bg-emerald-50 text-emerald-700':'bg-amber-50 text-amber-800'}`}>Email campaigns: {audience===null?'Status unavailable':audience.provider_ready?'Ready':'Paused — check sender and unsubscribe settings'}</span><Link to="/news" target="_blank" rel="noreferrer" className="button-secondary">View public News & Offers ↗</Link></div>
    {editing!==null&&<form onSubmit={save} className="space-y-4 rounded-2xl border border-emerald-200 bg-white p-5">
      <h2 className="font-bold">{editing==='new'?'Create a news post':'Edit announcement'}</h2>
      <div className="grid gap-3 md:grid-cols-3">
        <label className="form-label">Category<select className="form-control mt-1" value={form.type} onChange={e=>update('type',e.target.value)}><option value="promotion">Promotion</option><option value="news">Clinic News</option><option value="article">Health Article</option></select></label>
        <label className="form-label md:col-span-2">Title *<input className="form-control mt-1" required maxLength={160} value={form.title} onChange={e=>update('title',e.target.value)}/></label>
        <label className="form-label md:col-span-2">Short caption *<input className="form-control mt-1" required maxLength={350} value={form.caption} onChange={e=>update('caption',e.target.value)}/></label>

      </div>

      <div><label className="block form-label mb-2">Full details *</label><AnnouncementRichText value={form.body} onChange={value=>update('body',value)} /></div>
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

      </div>
      <p className="text-xs text-slate-500">The public URL is generated from the post title. Publication and expiration follow clinic time (UTC+08:00).</p>
      <div className="flex justify-end gap-2"><button type="button" className="button-secondary" onClick={()=>{setEditing(null);setScan(null)}}>Cancel</button><button type="submit" className="button-primary" disabled={busy}>{busy?'Working…':'Save announcement'}</button></div>
    </form>}
    {campaignPost&&<div className="rounded-2xl border border-sky-200 bg-white p-5 space-y-3">
      <h2 className="font-bold">New email campaign — {campaignPost.title}</h2>
      <p className="text-sm text-slate-500">Recipients are drawn only from email-verified, marketing-opted-in patients with appointment history in this branch. Selection is frozen for this campaign. Emails are queued and throttled, not sent in a single request.</p>
      <div className="grid gap-3 md:grid-cols-3"><label className="form-label">Audience<select className="form-control mt-1" value={selection.recipient_mode} onChange={e=>setSelection(s=>({...s,recipient_mode:e.target.value}))}><option value="random">Random selection</option><option value="all">All eligible (max 10,000)</option></select></label><label className="form-label">Max recipients (e.g. 500 / 1,000 / 5,000)<input type="number" min="1" max="10000" className="form-control mt-1" disabled={selection.recipient_mode==='all'} value={selection.limit} onChange={e=>setSelection(s=>({...s,limit:e.target.value}))}/></label><label className="form-label">Start after (optional)<input type="datetime-local" className="form-control mt-1" value={selection.scheduled_at} onChange={e=>setSelection(s=>({...s,scheduled_at:e.target.value}))}/></label></div>
      <p className="text-xs text-slate-600">Provider quota: up to {audience?.daily_limit||200} emails per day, {audience?.per_minute_limit||5} per minute across all branches. {selection.recipient_mode==='all'?audience?.eligible:Math.min(Number(selection.limit)||0,audience?.eligible||0)} recipients may take multiple days; sending is never immediate.</p>
      <div className="flex justify-end gap-2"><button className="button-secondary" type="button" onClick={()=>setCampaignPost(null)}>Cancel</button><button type="button" className="button-primary" disabled={busy||!audience?.provider_ready} onClick={queue}><MdSend/> Queue campaign</button></div>
    </div>}
    <div className="rounded-2xl border border-slate-200 bg-white p-5 space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2"><h2 className="font-bold">All Posts</h2><div className="flex gap-2">{[['all','All'],['published','Active'],['draft','Drafts'],['archived','Inactive']].map(([key,label])=><button type="button" key={key} className={`rounded-lg px-3 py-1.5 text-xs font-bold ${postsTab===key?'bg-slate-900 text-white':'bg-slate-100 text-slate-600'}`} onClick={()=>setPostsTab(key)}>{label}</button>)}</div></div>
      {loading?<p className="text-sm text-slate-500">Loading posts…</p>:!posts.length?<p className="text-sm text-slate-500">No posts created yet.</p>:
      <div className="overflow-x-auto"><table className="min-w-full text-left text-sm"><thead className="bg-slate-50 text-slate-600"><tr>{['Title / Category','Created','Publish at','Expires at','Status','Actions'].map(t=><th key={t} className="px-3 py-3">{t}</th>)}</tr></thead><tbody>{posts.filter(p=>postsTab==='all'||p.status===postsTab).map(post=><tr key={post.id} className="border-t align-top"><td className="px-3 py-3"><p className="font-semibold">{post.title}</p><p className="text-xs text-slate-500">{post.type} · /news/{post.branch_id}/{post.slug}</p></td><td className="px-3 py-3">{fmt(post.created_at)||'—'}</td><td className="px-3 py-3">{fmt(post.publish_at)||'Immediately'}</td><td className="px-3 py-3">{fmt(post.expires_at)||'No expiry'}</td><td className="px-3 py-3 capitalize">{post.status}</td><td className="px-3 py-3"><div className="flex flex-wrap gap-2"><button className="button-secondary" type="button" onClick={()=>setPreviewPost(post)}>View</button><button type="button" className="button-secondary" onClick={()=>edit(post)}>Edit</button><button type="button" disabled={busy} className="button-secondary" onClick={()=>togglePost(post)}>{post.status==='published'?'Deactivate':'Activate'}</button><button type="button" disabled={busy} className="button-secondary text-rose-700" onClick={()=>removePost(post)}>Delete</button><button type="button" className="button-primary" disabled={!audience?.provider_ready||!['published','scheduled'].includes(post.status)} onClick={()=>setCampaignPost(post)}><MdSend/> Email</button></div></td></tr>)}</tbody></table></div>}
    </div>
    {previewPost&&<div role="dialog" aria-modal="true" className="fixed inset-0 z-[90] flex items-center justify-center bg-black/50 p-3"><div className="max-h-[90vh] w-full max-w-3xl overflow-y-auto rounded-2xl bg-white p-5 shadow-2xl"><div className="mb-4 flex justify-between gap-3"><h2 className="text-xl font-bold">{previewPost.title}</h2><button className="button-secondary" type="button" onClick={()=>setPreviewPost(null)}>Close</button></div><p className="mb-4 text-slate-600">{previewPost.caption}</p><AnnouncementBody body={previewPost.body}/></div></div>}
    <div className="rounded-2xl border border-slate-200 bg-white p-5"><h2 className="mb-3 font-bold">Campaign history</h2>
      {!campaigns.length?<p className="text-sm text-slate-500">{sectionErrors.campaigns?'Campaign history is unavailable right now.':'No email campaigns yet.'}</p>:<div className="space-y-2">{campaigns.map(c=><div key={c.id} className="flex flex-wrap items-center justify-between gap-3 rounded-xl border p-3 text-sm"><div><p className="font-bold">{c.title}</p><p className="text-slate-500">{c.status} · {c.recipient_total} selected · {c.sent||0} accepted by provider · {c.pending||0} pending · {c.needs_review||0} uncertain (review)</p></div><div className="flex gap-2"><button type="button" className="button-secondary" onClick={()=>inspectCampaign(c.id)}>Details</button>{['queued','sending'].includes(c.status)&&<button type="button" className="button-secondary" onClick={()=>changeCampaign(c.id,'pause')}><MdPause/> Pause</button>}{c.status==='paused'&&<button type="button" className="button-secondary" onClick={()=>changeCampaign(c.id,'resume')}><MdPlayArrow/> Resume</button>}{['queued','sending','paused'].includes(c.status)&&<button type="button" className="button-secondary text-rose-600" onClick={()=>changeCampaign(c.id,'cancel')}><MdCancel/> Cancel unsent</button>}</div></div>)}</div>}
      {details&&<div className="mt-3 space-y-2 rounded-xl bg-slate-50 p-3"><h3 className="text-sm font-bold">Campaign #{details.id} — recipient delivery attempts</h3><div className="max-h-64 overflow-auto">{details.recipients.map(r=><div key={r.id} className="border-b border-slate-200 py-2 text-xs"><span className="font-semibold">{r.email}</span> · {r.status} · attempts: {r.attempts}{r.last_error&&<p className="text-rose-600">{r.last_error}</p>}</div>)}</div><div className="flex gap-2"><button type="button" className="button-secondary" disabled={details.page<=1} onClick={()=>listCampaignRecipients(details.id,details.page-1).then(page=>setDetails({id:details.id,...page})).catch(e=>setError(e.message))}>Previous</button><button type="button" className="button-secondary" disabled={details.recipients.length<50} onClick={()=>listCampaignRecipients(details.id,details.page+1).then(page=>setDetails({id:details.id,...page})).catch(e=>setError(e.message))}>Next</button></div></div>}
      <p className="mt-2 text-xs text-slate-500">Provider acceptance is not proof of inbox delivery. Unknown outcomes require provider-log review; they are not automatically resent.</p>
    </div>
  </section>
}
export default Admin_Announcements
