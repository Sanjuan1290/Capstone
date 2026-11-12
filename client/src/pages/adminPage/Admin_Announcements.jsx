import {useLocation} from 'react-router-dom'
import useClinicRefresh from '../../hooks/useClinicRefresh'
import { useCallback, useEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { MdCampaign, MdAdd, MdRefresh, MdCloudUpload, MdSend, MdPause, MdPlayArrow, MdCancel, MdSearch, MdArrowBack, MdClose } from 'react-icons/md'
import {
  listAnnouncements, getAnnouncementBookingOptions, saveAnnouncement, deleteAnnouncement, setAnnouncementStatus, uploadAnnouncementCover, checkAnnouncementCover,
  getCampaignAudience, listMarketingCampaigns, listCampaignRecipients, startMarketingCampaign, controlMarketingCampaign,
} from '../../services/admin.service'
import { useToast } from '../../components/ui/ToastProvider'
import { AnnouncementBody } from '../../components/system/AnnouncementRichText'
import QuillAnnouncementEditor from '../../components/system/QuillAnnouncementEditor'
import Admin_Promotions from './Admin_Promotions'
import { documentText } from '../../utils/announcementDocument.mjs'
import { announcementDisplayStatus, clinicNow } from '../../utils/announcementStatus.mjs'
import VisibilitySwitch from '../../components/ui/VisibilitySwitch'

const blank = () => ({type:'news',title:'',caption:'',body:'',status:'draft',publish_at:'',expires_at:'',cover_image_url:'',cover_image_token:'',cta_label:'Book an Appointment',cta_url:'',promotion_id:null})
const getBookingChoice = form => {
  if(form.promotion_id)return `promotion:${form.promotion_id}`
  const match=String(form.cta_url||'').match(/[?&]service_id=(\d+)/)
  if(match)return `service:${match[1]}`
  return form.cta_url ? 'general':'none'
}

const fmt = s => s ? String(s).replace(' ','T').slice(0,16) : ''

// The same preview is used for unsaved edits and for posts in the list.
// Image approval remains a separate requirement when the post is saved.
const AnnouncementPreview = ({ post, onClose, awaitingImageApproval = false }) => {
  const [imageFailed, setImageFailed] = useState(false)
  const coverUrl = String(post.cover_image_url || '').trim()

  useEffect(() => {
    const closeOnEscape = (event) => {
      if (event.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', closeOnEscape)
    return () => window.removeEventListener('keydown', closeOnEscape)
  }, [onClose])

  return <div role="dialog" aria-modal="true" aria-labelledby="announcement-preview-title" className="fixed inset-0 z-[90] flex items-center justify-center bg-black/60 p-3 sm:p-6">
    <div className="flex max-h-[92vh] w-full max-w-3xl flex-col overflow-hidden rounded-2xl bg-white shadow-2xl">
      <div className="flex shrink-0 items-center justify-between gap-4 border-b border-slate-200 px-5 py-4 sm:px-7">
        <div>
          <h2 id="announcement-preview-title" className="text-lg font-bold text-slate-900">Post Preview</h2>
          <p className="mt-1 text-xs text-slate-500">Check the photo and details before publishing.</p>
        </div>
        <button type="button" autoFocus className="button-secondary" onClick={onClose}>Close</button>
      </div>
      <div className="overflow-y-auto">
        {coverUrl && (imageFailed
          ? <div role="alert" className="border-b border-amber-200 bg-amber-50 px-5 py-5 text-sm text-amber-900">The cover photo could not be displayed. Check the image or upload it again before publishing.</div>
          : <img
              src={coverUrl}
              alt={`Cover photo for ${post.title || 'this announcement'}`}
              className="block aspect-video w-full bg-slate-100 object-cover"
              onError={() => setImageFailed(true)}
            />)}
        {awaitingImageApproval && coverUrl && <p className="border-b border-amber-200 bg-amber-50 px-5 py-3 text-sm text-amber-900">This cover photo is still awaiting its safety check. You can preview it, but it must be approved before saving.</p>}
        <div className="space-y-4 px-5 py-6 sm:px-7">
          <p className="text-xs font-bold uppercase tracking-wide text-teal-700">{post.type === 'promotion' ? 'Promotion' : post.type === 'article' ? 'Health Article' : 'Clinic News'}</p>
          <h3 className="text-2xl font-black leading-tight text-slate-900">{post.title || 'Untitled post'}</h3>
          {post.caption && <p className="text-base leading-7 text-slate-600">{post.caption}</p>}
          <div className="border-t border-slate-100 pt-4"><AnnouncementBody body={post.body}/></div>
        </div>
      </div>
    </div>
  </div>
}
const Admin_Announcements = () => {
  const toast=useToast()
  const [posts,setPosts]=useState([])
  const [bookingOptions,setBookingOptions]=useState(null)
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
  const notificationLocation=useLocation()
  const [workspaceTab,setWorkspaceTab]=useState(new URLSearchParams(window.location.search).has('promotion_id')?'offers':'posts')
  useEffect(()=>{if(new URLSearchParams(notificationLocation.search).has('promotion_id'))setWorkspaceTab('offers')},[notificationLocation.search,notificationLocation.key])
  const [postSearch,setPostSearch]=useState('')
  const [postPage,setPostPage]=useState(1)
  const [rowsPerPage,setRowsPerPage]=useState(10)
  const [menuPost,setMenuPost]=useState(null)
  const filteredPosts=posts.filter(p=>(postsTab==='all'||announcementDisplayStatus(p)===postsTab)&&`${p.title} ${p.type} ${p.caption}`.toLowerCase().includes(postSearch.toLowerCase().trim()))
  const totalPages=Math.max(1,Math.ceil(filteredPosts.length/rowsPerPage))
  const currentPage=Math.min(postPage,totalPages)
  const pagePosts=filteredPosts.slice((currentPage-1)*rowsPerPage,currentPage*rowsPerPage)
  const chooseFilter=key=>{setPostsTab(key);setPostPage(1)}
  const refresh=useCallback(async()=>{
    setLoading(true)
    setError('')
    // Posts, campaigns, audience/readiness, and promotions must not block each other.
    const results=await Promise.allSettled([listAnnouncements(),listMarketingCampaigns(),getCampaignAudience(),getAnnouncementBookingOptions()])
    const [postResult,campaignResult,audienceResult,bookingResult]=results
    const failed={}
    if(postResult.status==='fulfilled' && Array.isArray(postResult.value))setPosts(postResult.value)
    else {setPosts([]);failed.posts='Unable to load announcements. Please try Refresh.'}
    if(campaignResult.status==='fulfilled' && Array.isArray(campaignResult.value))setCampaigns(campaignResult.value)
    else {setCampaigns([]);failed.campaigns='Unable to load email campaign history.'}
    if(audienceResult.status==='fulfilled' && audienceResult.value && typeof audienceResult.value==='object')setAudience(audienceResult.value)
    else {setAudience(null);failed.audience='Unable to check email service or eligible patient count.'}
    if(bookingResult.status==='fulfilled')setBookingOptions(bookingResult.value)
    else {setBookingOptions(null);failed.booking='Unable to load available booking destinations. Please try Refresh.'}
    setSectionErrors(failed)
    setLoading(false)
  },[])
  useEffect(()=>{void refresh()},[refresh])
  useClinicRefresh(refresh,['promotion.updated'],{fallbackMs:120000,skip:()=>editing!==null||busy})
  const refreshBookingOptions = useCallback(async () => {
    try {
      const options = await getAnnouncementBookingOptions()
      setBookingOptions(options)
      setSectionErrors(previous => {
        const updated = { ...previous }
        delete updated.booking
        return updated
      })
    } catch {
      setSectionErrors(previous => ({ ...previous, booking: 'Unable to refresh booking destinations. Try Refresh.' }))
    }
  }, [])
  const edit = useCallback(post => {
    setWorkspaceTab('posts')
    setEditing(post?.id || 'new')
    setScan(null)
    setMenuPost(null)
    setError('')
    setForm(post ? { ...post, publish_at: fmt(post.publish_at), expires_at: fmt(post.expires_at), cover_image_token: '' } : blank())
    void refreshBookingOptions()
  }, [refreshBookingOptions])
  const openedAnnouncement=useRef(null)
  useEffect(()=>{
    const id=new URLSearchParams(notificationLocation.search).get('announcement_id')
    if(!id||loading||openedAnnouncement.current===notificationLocation.key)return
    openedAnnouncement.current=notificationLocation.key
    const post=posts.find(row=>Number(row.id)===Number(id))
    if(post)edit(post)
    else setError('This post is no longer available in this branch.')
  },[posts,loading,notificationLocation.search,notificationLocation.key,edit])
  const update=(key,value)=>setForm(current=>({...current,[key]:value}))
  const selectBooking=(choice)=>setForm(current=>{
    if(choice==='none')return {...current,cta_url:'',promotion_id:null}
    const branch=Number(bookingOptions?.branch_id)
    if(!Number.isSafeInteger(branch)||branch<1)return current
    if(choice==='general')return {...current,cta_url:`/patient/book?branch_id=${branch}`,promotion_id:null}
    const [type,id]=choice.split(':')
    if(type==='promotion'&&bookingOptions?.promotions?.some(p=>Number(p.id)===Number(id)))return {...current,cta_url:`/patient/book?branch_id=${branch}&promotion_id=${Number(id)}`,promotion_id:Number(id)}
    const service=bookingOptions?.services?.find(s=>Number(s.id)===Number(id))
    if(type==='service'&&service)return {...current,cta_url:`/patient/book?branch_id=${branch}&clinic=${service.clinic_type}&service_id=${service.id}`,promotion_id:null}
    return current
  })
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
  const save=async (e,desiredStatus='draft')=>{
    e.preventDefault();
    if(desiredStatus==='published' && form.expires_at && `${form.expires_at.replace('T',' ')}:00`<=clinicNow()){setError('This post has expired. Extend the end date before publishing.');return}
    if(!form.title.trim()||!form.caption.trim()||!documentText(form.body)){setError('Add a title, short description and post content before saving.');return}
    if(scan&&scan.state!=='approved'){setError('The cover image must pass the safety check before this post can be saved.');return}
    setBusy(true);setError('')
    try {const result=await saveAnnouncement({...form,status:desiredStatus,publish_at:desiredStatus==='published'?'':form.publish_at},editing==='new'?null:editing);toast.success(result.message);setEditing(null);await refresh()}
    catch(e){setError(e.message)}finally{setBusy(false)}
  }
  const removePost=async post=>{
    if(!window.confirm(`Delete “${post.title}”? This cannot be undone. Posts with campaign history cannot be deleted.`))return
    setBusy(true);setError('')
    try{await deleteAnnouncement(post.id);toast.success('Post deleted.');await refresh()}catch(e){setError(e.message)}finally{setBusy(false)}
  }
  const togglePost=async post=>{
    setBusy(true);setError('')
    try{await setAnnouncementStatus(post.id,announcementDisplayStatus(post)==='published'?'archived':'published');toast.success('Post status updated.');await refresh()}catch(e){setError(e.message)}finally{setBusy(false)}
  }
  const composePromotionPost = promo => {
    const branch=Number(bookingOptions?.branch_id)
    if(!Number.isSafeInteger(branch)||branch<1){setError('Select an active clinic branch and refresh its services before linking an offer to a booking.');return}
    setWorkspaceTab('posts');setEditing('new');setMenuPost(null);setError('')
    setForm({...blank(),type:'promotion',title:promo.title,caption:promo.description,
      promotion_id:promo.id,cta_url:`/patient/book?branch_id=${branch}&promotion_id=${promo.id}`})
  }
  const queue=async()=>{
    if(campaignPost && announcementDisplayStatus(campaignPost)==='expired'){setError('This post has expired. Extend the end date before sending email.');return}
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
  return <section className="mx-auto w-full max-w-7xl space-y-5 pb-8">
    <header className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div><h1 className="flex items-center gap-2 text-2xl font-black text-slate-900"><MdCampaign className="text-amber-500"/> Announcements & Campaigns</h1>
          <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-600">Create clinic news and offers, manage published posts, and send optional patient emails.</p></div>
        <div className="flex flex-wrap gap-2"><></><button type="button" className="button-primary" onClick={()=>edit(null)}><MdAdd/> Create Post</button></div>
      </div>
      <nav className="mt-5 flex flex-wrap gap-2 border-t border-slate-100 pt-4" aria-label="Announcement sections">
        {[['posts','Posts'],['offers','Special Offers'],['emails','Email Campaigns']].map(([id,label])=><button type="button" key={id} aria-current={workspaceTab===id?'page':undefined} onClick={()=>{setWorkspaceTab(id);setMenuPost(null)}} className={`min-h-11 rounded-xl px-4 text-sm font-bold transition-colors duration-200 focus-visible:outline focus-visible:outline-2 focus-visible:outline-sky-700 ${workspaceTab===id?'bg-slate-900 text-white':'border border-slate-200 text-slate-700 hover:bg-slate-50'}`}>{label}</button>)}
        <Link to="/news" target="_blank" rel="noopener noreferrer" className="ml-auto inline-flex min-h-11 items-center rounded-xl px-4 text-sm font-bold text-sky-800 hover:bg-sky-50">View Public News & Offers ↗</Link>
      </nav>
    </header>
    {Object.keys(sectionErrors).length>0&&<div role="alert" className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900"><p className="font-bold">Some information could not load.</p>{Object.values(sectionErrors).map((message)=><p key={message}>{message}</p>)}<button className="mt-2 font-bold underline" type="button" onClick={refresh}>Try Again</button></div>}
    {error&&<div className="flex items-start justify-between gap-3 rounded-xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-700" role="alert"><span>{error}</span><button aria-label="Dismiss message" onClick={()=>setError('')} type="button"><MdClose/></button></div>}
    {workspaceTab==='posts'&&<>
      <div className="grid gap-3 sm:grid-cols-3">{[['All Posts',posts.length],['Published',posts.filter(p=>announcementDisplayStatus(p)==='published').length],['Expired',posts.filter(p=>announcementDisplayStatus(p)==='expired').length]].map(([label,count])=><div key={label} className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm"><p className="text-2xl font-black text-slate-900">{count}</p><p className="mt-1 text-sm text-slate-500">{label}</p></div>)}</div>
    {editing!==null&&<form onSubmit={e=>save(e,'draft')} className="space-y-5 rounded-2xl border border-sky-200 bg-white p-5 shadow-sm sm:p-6">
      <div className="flex items-start justify-between gap-3"><div><h2 className="text-xl font-bold text-slate-900">{editing==='new'?'Create Post':'Edit Post'}</h2><p className="mt-1 text-sm text-slate-500">Fill out the sections below. Save privately or publish when ready.</p></div><button type="button" className="button-secondary" onClick={()=>{setEditing(null);setError('')}}><MdArrowBack/> Back to Posts</button></div><h3 className="text-base font-bold text-slate-900">1. Basic Information</h3>
      <div className="grid gap-3 md:grid-cols-3">
        <label className="form-label">Post Type<select className="form-control mt-1" value={form.type} onChange={e=>update('type',e.target.value)}><option value="promotion">Promotion</option><option value="news">Clinic News</option><option value="article">Health Article</option></select></label>
        <label className="form-label md:col-span-2">Post Title *<input className="form-control mt-1" required maxLength={160} value={form.title} onChange={e=>update('title',e.target.value)}/></label>
        <label className="form-label md:col-span-2">Short Description *<input className="form-control mt-1" required maxLength={350} value={form.caption} onChange={e=>update('caption',e.target.value)}/></label>

      </div>

      <div className="space-y-2"><h3 className="text-base font-bold text-slate-900">2. Post Content</h3><p className="text-sm text-slate-500">Write the full article or offer. The toolbar formats your text automatically.</p><QuillAnnouncementEditor key={editing} value={form.body} onChange={value=>update('body',value)} /><p className="text-xs text-slate-500">{documentText(form.body).length.toLocaleString('en-PH')} text characters · Maximum saved content: 12,000 characters including formatting</p></div>
      <div className="rounded-xl border border-dashed border-slate-300 p-4"><h3 className="mb-3 text-base font-bold text-slate-900">3. Cover Photo</h3><p className="mb-3 text-sm text-slate-500">Choose a clear image for the public post (optional).</p>
        <label className="inline-flex cursor-pointer items-center gap-2 rounded-lg bg-slate-100 px-3 py-2 text-sm font-semibold"><MdCloudUpload/> Upload cover (JPG/PNG, max 5 MB)<input className="sr-only" type="file" accept="image/jpeg,image/png" onChange={e=>onImage(e.target.files?.[0])}/></label>
        {form.cover_image_url&&<img alt="Announcement cover preview" className="mt-3 max-h-40 max-w-xs rounded-lg object-contain" src={form.cover_image_url}/>}
        {scan&&<div className="mt-2 flex items-center gap-2 text-sm"><span>Scan: {scan.state}</span>{scan.state!=='approved'&&<button type="button" className="button-secondary" disabled={busy} onClick={verifyImage}>Check image scan</button>}</div>}
        {form.cover_image_url&&<button type="button" className="mt-2 block text-xs text-rose-600 underline" onClick={()=>{setScan(null);setForm(s=>({...s,cover_image_url:'',cover_image_token:'',clear_cover_image:true}))}}>Remove cover</button>}
      </div>
      <div className="rounded-xl border border-sky-100 bg-sky-50/60 p-4 space-y-3">
        <h3 className="font-bold text-slate-900">4. Booking Button</h3>
        <p className="text-sm text-slate-600">Choose where patients go after clicking Book an Appointment. A linked service opens the correct booking step. A promotion applies only to eligible services and dates.</p>
        <label className="form-label block">Where should the button go?
          <select className="form-control mt-1" value={getBookingChoice(form)} disabled={!bookingOptions} onChange={e=>selectBooking(e.target.value)}>
            <option value="none">No booking button</option>
            <option value="general">General booking — choose service later</option>
            <optgroup label="Book a specific service">{(bookingOptions?.services||[]).map(s=><option key={s.id} value={`service:${s.id}`}>{s.service_name} ({s.clinic_type==='derma'?'Dermatology':'General Medicine'})</option>)}</optgroup>
            <optgroup label="Book with a clinic promotion">{(bookingOptions?.promotions||[]).map(p=><option key={p.id} value={`promotion:${p.id}`}>{p.title}{!p.is_active?' (inactive)':''}</option>)}</optgroup>
          </select>
        </label>
        {form.promotion_id&&<p className="text-xs text-slate-700">The booking page will show this offer only when it is active and the patient selects an eligible service and date.</p>}
        {getBookingChoice(form)==='general'&&form.type==='promotion'&&<p className="text-sm text-amber-800">This button is not linked to a specific service or promotion. Patients will choose a service themselves.</p>}
        {getBookingChoice(form)!=='none'&&<label className="form-label block">Button text<input className="form-control mt-1" value={form.cta_label||''} maxLength={80} onChange={e=>update('cta_label',e.target.value)} placeholder="Book an Appointment"/></label>}
      </div>
      <h3 className="text-base font-bold text-slate-900">5. Publishing</h3><div className="grid gap-3 md:grid-cols-3">
        <label className="form-label">Post status<select className="form-control mt-1" value={form.status} onChange={e=>update('status',e.target.value)}><option value="draft">Draft</option><option value="scheduled">Scheduled</option><option value="published">{announcementDisplayStatus(form)==='expired'?'Expired (change end date)':'Published'}</option><option value="archived">Archived</option></select></label>
        <label className="form-label">When should this post appear? (Philippine time)<input type="datetime-local" className="form-control mt-1" value={form.publish_at||''} onChange={e=>update('publish_at',e.target.value)}/></label>
        <label className="form-label">When should this post stop appearing? (optional)<input type="datetime-local" className="form-control mt-1" value={form.expires_at||''} onChange={e=>update('expires_at',e.target.value)}/></label>

      </div>
      <p className="text-xs text-slate-500">The public URL is generated from the post title. Publication and expiration follow clinic time (UTC+08:00).</p>
      <p className="text-sm text-slate-500">Promotional posts automatically send one in-app alert when they go live. Posts linked to a Special Offer share that offer's alert. No email or SMS is sent automatically; email campaigns remain optional.</p>
      {announcementDisplayStatus(form)==='expired'&&<p role="status" className="rounded-lg bg-rose-50 p-3 text-sm font-semibold text-rose-800">Expired — this post is no longer visible to patients. Extend its end date and publish it again to reactivate it.</p>}
      <div className="flex flex-wrap justify-end gap-2"><button type="button" className="button-secondary" onClick={()=>setPreviewPost({...form,id:'draft'})}>Preview</button><button type="submit" className="button-secondary" disabled={busy}>{busy?'Saving…':'Save Draft'}</button>{form.status==='scheduled'&&<button type="button" className="button-primary" disabled={busy} onClick={e=>save(e,'scheduled')}>Schedule Post</button>}<button type="button" className="button-primary" disabled={busy} onClick={e=>save(e,'published')}>Publish Now</button></div>
    </form>}
    <div className="space-y-4 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:p-6">
      <div className="flex flex-wrap items-center justify-between gap-3"><h2 className="text-lg font-bold text-slate-900">Manage Posts</h2><div className="flex flex-wrap gap-2">{[['all','All'],['published','Published'],['scheduled','Scheduled'],['expired','Expired'],['draft','Drafts'],['archived','Unpublished']].map(([key,label])=><button key={key} type="button" onClick={()=>chooseFilter(key)} aria-pressed={postsTab===key} className={`min-h-10 rounded-xl px-3 text-xs font-bold transition-colors ${postsTab===key?'bg-slate-900 text-white':'border border-slate-200 text-slate-600 hover:bg-slate-50'}`}>{label}</button>)}</div></div>
      <div className="flex flex-wrap items-end gap-3"><label className="relative flex-1 min-w-[220px]"><span className="mb-1 block text-sm font-medium text-slate-700">Find a post</span><MdSearch className="absolute bottom-3 left-3 text-slate-400"/><input className="form-control pl-10" placeholder="Search by title or post type" value={postSearch} onChange={e=>{setPostSearch(e.target.value);setPostPage(1)}}/></label><label className="text-sm font-medium text-slate-700">Posts per page<select className="form-control mt-1" value={rowsPerPage} onChange={e=>{setRowsPerPage(Number(e.target.value));setPostPage(1)}}>{[5,10,20].map(n=><option key={n} value={n}>{n}</option>)}</select></label></div>
      {loading?<p role="status" className="p-6 text-slate-500">Loading posts…</p>:!filteredPosts.length?<div className="rounded-xl bg-slate-50 p-8 text-center"><h3 className="font-bold text-slate-800">No matching posts</h3><p className="mt-1 text-sm text-slate-500">Try another filter or create a new post.</p><button type="button" className="button-secondary mt-4" onClick={()=>{setPostSearch('');chooseFilter('all')}}>Clear Filters</button></div>:<div className="grid gap-3">{pagePosts.map(post=><article key={post.id} className="carait-editor-card rounded-2xl border border-slate-200 p-4 sm:p-5"><div className="flex flex-wrap items-start gap-4"><div className="min-w-0 flex-1"><div className="flex flex-wrap items-center gap-2"><h3 className="text-base font-bold text-slate-900">{post.title}</h3><span className={`rounded-full px-2.5 py-1 text-xs font-bold ${announcementDisplayStatus(post)==='published'?'bg-emerald-50 text-emerald-700':announcementDisplayStatus(post)==='expired'?'bg-rose-50 text-rose-700':announcementDisplayStatus(post)==='draft'?'bg-slate-100 text-slate-600':announcementDisplayStatus(post)==='scheduled'?'bg-sky-50 text-sky-700':'bg-amber-50 text-amber-700'}`}>{announcementDisplayStatus(post)==='archived'?'Unpublished':announcementDisplayStatus(post)}</span></div><p className="mt-1 text-sm text-slate-600">{post.caption}</p><p className="mt-2 text-xs text-slate-500">{post.type==='promotion'?'Promotion':post.type==='article'?'Health Article':'Clinic News'} · {post.publish_at?`Publish: ${fmt(post.publish_at)}`:'Not scheduled'}{post.expires_at?` · Ends: ${fmt(post.expires_at)}`:''}</p></div><div className="flex flex-wrap gap-2"><button type="button" className="button-secondary" onClick={()=>setPreviewPost(post)}>Preview</button><button type="button" className="button-secondary" onClick={()=>edit(post)}>Edit</button><button type="button" className="button-secondary" onClick={()=>setMenuPost(menuPost===post.id?null:post.id)} aria-expanded={menuPost===post.id} aria-label={`More actions for ${post.title}`}>More Actions</button></div></div>{menuPost===post.id&&<div className="mt-4 flex flex-wrap gap-2 border-t border-slate-100 pt-4">{['published','archived'].includes(announcementDisplayStatus(post)) ?
            <VisibilitySwitch checked={announcementDisplayStatus(post)==='published'} label="Show post" disabled={busy} onChange={()=>{togglePost(post);setMenuPost(null)}} /> :
            <button type="button" disabled={busy||announcementDisplayStatus(post)==='expired'} className="button-secondary" onClick={()=>{togglePost(post);setMenuPost(null)}}>{announcementDisplayStatus(post)==='expired'?'Edit end date to republish':'Publish'}</button>}<button type="button" disabled={busy} className="button-secondary text-rose-700" onClick={()=>{removePost(post);setMenuPost(null)}}>Delete</button></div>}</article>)}</div>}
      <div className="flex flex-wrap items-center justify-between gap-3 border-t border-slate-100 pt-4"><p className="text-sm text-slate-600">{filteredPosts.length?`Showing ${(currentPage-1)*rowsPerPage+1}–${Math.min(currentPage*rowsPerPage,filteredPosts.length)} of ${filteredPosts.length}`:'0 posts'} </p><div className="flex flex-wrap gap-2"><button type="button" className="button-secondary" disabled={currentPage===1} onClick={()=>setPostPage(currentPage-1)}>Previous</button>{Array.from({length:totalPages},(_,i)=>i+1).filter(i=>totalPages<=7||i===1||i===totalPages||Math.abs(i-currentPage)<=1).map(i=><button key={i} type="button" onClick={()=>setPostPage(i)} aria-current={i===currentPage?'page':undefined} className={`min-w-10 rounded-lg border px-3 text-sm font-bold ${i===currentPage?'border-slate-900 bg-slate-900 text-white':'border-slate-200 bg-white text-slate-700'}`}>{i}</button>)}<button type="button" className="button-secondary" disabled={currentPage===totalPages} onClick={()=>setPostPage(currentPage+1)}>Next</button></div></div>
    </div>
    {previewPost && <AnnouncementPreview
      key={`${previewPost.id}:${previewPost.cover_image_url || ''}`}
      post={previewPost}
      awaitingImageApproval={previewPost.id === 'draft' && Boolean(scan && scan.state !== 'approved')}
      onClose={() => setPreviewPost(null)}
    />}
    </>}
    {workspaceTab==='offers'&&<Admin_Promotions onComposePost={composePromotionPost} onPromotionsChanged={refreshBookingOptions} />}
    {workspaceTab==='emails'&&<>
      <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm"><h2 className="text-lg font-bold text-slate-900">Email Campaigns</h2><p className="mt-1 text-sm text-slate-500">Only verified patients who agreed to receive marketing emails and visited this branch can be selected. Publishing a post does not send an email.</p><div className="mt-4 flex flex-wrap gap-2"><span className="rounded-xl bg-sky-50 px-3 py-2 text-sm text-sky-800">Patients eligible for email: {audience?.eligible??'Unavailable'}</span><span className={`rounded-xl px-3 py-2 text-sm ${audience?.provider_ready?'bg-emerald-50 text-emerald-700':'bg-amber-50 text-amber-800'}`}>Email Service: {audience?.provider_ready?'Ready':'Unavailable'}</span></div></div>
    <div className="rounded-2xl border border-slate-200 bg-white p-5 space-y-3">
      <label className="form-label block">Choose a published post to email opted-in patients
        <select className="form-control mt-2" value={campaignPost?.id||''} onChange={e=>setCampaignPost(posts.find(p=>String(p.id)===e.target.value)||null)}>
          <option value="">Select a published announcement or promotion</option>
          {posts.filter(p=>announcementDisplayStatus(p)==='published').map(p=><option key={p.id} value={p.id}>{p.type==='promotion'?'Offer: ':''}{p.title}</option>)}
        </select>
      </label>
      {!audience?.provider_ready&&<p role="status" className="text-sm text-amber-800">Email sending is unavailable. Check the Resend API key, marketing sender address, unsubscribe secret and public client URL on the server.</p>}
      {audience?.eligible===0&&<p role="status" className="text-sm text-slate-600">No eligible recipients at this branch. Patients must opt in and verify their email to receive offers.</p>}
    </div>
    {campaignPost&&<div className="rounded-2xl border border-sky-200 bg-white p-5 space-y-3">
      <h2 className="font-bold">Send Email — {campaignPost.title}</h2>
      <p className="text-sm text-slate-500">Recipients are drawn only from email-verified, marketing-opted-in patients with appointment history in this branch. Selection is frozen for this campaign. Emails are queued and throttled, not sent in a single request.</p>
      <div className="grid gap-3 md:grid-cols-3"><label className="form-label">Who should receive this email?<select className="form-control mt-1" value={selection.recipient_mode} onChange={e=>setSelection(s=>({...s,recipient_mode:e.target.value}))}><option value="random">Choose a random group</option><option value="all">All eligible patients (maximum 10,000)</option></select></label><label className="form-label">Maximum number of patients<input type="number" min="1" max="10000" className="form-control mt-1" disabled={selection.recipient_mode==='all'} value={selection.limit} onChange={e=>setSelection(s=>({...s,limit:e.target.value}))}/></label><label className="form-label">When should emails start? (optional)<input type="datetime-local" className="form-control mt-1" value={selection.scheduled_at} onChange={e=>setSelection(s=>({...s,scheduled_at:e.target.value}))}/></label></div>
      <p className="text-xs text-slate-600">Provider quota: up to {audience?.daily_limit||200} emails per day, {audience?.per_minute_limit||5} per minute across all branches. {selection.recipient_mode==='all'?audience?.eligible:Math.min(Number(selection.limit)||0,audience?.eligible||0)} recipients may take multiple days; sending is never immediate.</p>
      <div className="flex justify-end gap-2"><button className="button-secondary" type="button" onClick={()=>setCampaignPost(null)}>Cancel</button><button type="button" className="button-primary" disabled={busy||!audience?.provider_ready} onClick={queue}><MdSend/> Queue campaign</button></div>
    </div>}
    <div className="rounded-2xl border border-slate-200 bg-white p-5"><h2 className="mb-3 text-lg font-bold">Email Sending History</h2>
      {!campaigns.length?<p className="text-sm text-slate-500">{sectionErrors.campaigns?'Campaign history is unavailable right now.':'No email campaigns yet.'}</p>:<div className="space-y-2">{campaigns.map(c=><div key={c.id} className="flex flex-wrap items-center justify-between gap-3 rounded-xl border p-3 text-sm"><div><p className="font-bold">{c.title}</p><p className="text-slate-500">{c.status} · {c.recipient_total} selected · {c.sent||0} accepted by provider · {c.pending||0} pending · {c.needs_review||0} uncertain (review)</p></div><div className="flex gap-2"><button type="button" className="button-secondary" onClick={()=>inspectCampaign(c.id)}>Details</button>{['queued','sending'].includes(c.status)&&<button type="button" className="button-secondary" onClick={()=>changeCampaign(c.id,'pause')}><MdPause/> Pause</button>}{c.status==='paused'&&<button type="button" className="button-secondary" onClick={()=>changeCampaign(c.id,'resume')}><MdPlayArrow/> Resume</button>}{['queued','sending','paused'].includes(c.status)&&<button type="button" className="button-secondary text-rose-600" onClick={()=>changeCampaign(c.id,'cancel')}><MdCancel/> Cancel unsent</button>}</div></div>)}</div>}
      {details&&<div className="mt-3 space-y-2 rounded-xl bg-slate-50 p-3"><h3 className="text-sm font-bold">Campaign #{details.id} — recipient delivery attempts</h3><div className="max-h-64 overflow-auto">{details.recipients.map(r=><div key={r.id} className="border-b border-slate-200 py-2 text-xs"><span className="font-semibold">{r.email}</span> · {r.status} · attempts: {r.attempts}{r.last_error&&<p className="text-rose-600">{r.last_error}</p>}</div>)}</div><div className="flex gap-2"><button type="button" className="button-secondary" disabled={details.page<=1} onClick={()=>listCampaignRecipients(details.id,details.page-1).then(page=>setDetails({id:details.id,...page})).catch(e=>setError(e.message))}>Previous</button><button type="button" className="button-secondary" disabled={details.recipients.length<50} onClick={()=>listCampaignRecipients(details.id,details.page+1).then(page=>setDetails({id:details.id,...page})).catch(e=>setError(e.message))}>Next</button></div></div>}
      <p className="mt-2 text-xs text-slate-500">Provider acceptance is not proof of inbox delivery. Unknown outcomes require provider-log review; they are not automatically resent.</p>
    </div>
    </>}
  </section>
}
export default Admin_Announcements




