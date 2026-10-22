import useClinicRefresh from '../../hooks/useClinicRefresh'
import { useEffect, useState } from 'react'
import { Link, useLocation } from 'react-router-dom'
import { MdAdd, MdCampaign, MdEdit, MdDelete, MdRefresh, MdNotificationsActive, MdCloudUpload } from 'react-icons/md'
import { getAdminPromotions, saveAdminPromotion, deleteAdminPromotion, notifyAdminPromotion, getBillingCatalog, uploadPromotionImage, checkPromotionImage } from '../../services/admin.service'
import { useToast } from '../../components/ui/ToastProvider'
import { branchPortalPath } from '../../utils/branchPortalPath.mjs'
import { getLocalDateOnly } from '../../utils/date'

const empty = () => ({ title:'', description:'', badge_text:'Special offer', starts_on:'', ends_on:'', is_active:false, show_on_dashboard:true, featured_order:0, image_url:'', image_token:'', clear_image:false, service_ids:[] })

const Admin_Promotions = () => {
  const toast=useToast()
  const location=useLocation()
  const [imageScan,setImageScan]=useState(null)
  const [promotions,setPromotions]=useState([])
  const [services,setServices]=useState([])
  const [loading,setLoading]=useState(true)
  const [error,setError]=useState('')
  const [editing,setEditing]=useState(null)
  const [form,setForm]=useState(empty())
  const [saving,setSaving]=useState(false)
  const [filter,setFilter]=useState('')

  const load = async () => {
    setLoading(true); setError('')
    try {
      const [offers,catalog]=await Promise.all([getAdminPromotions(),getBillingCatalog({includeInactive:true})])
      setPromotions(Array.isArray(offers)?offers:[])
      setServices(Array.isArray(catalog)?catalog:[])
    } catch(err) {setError(err.message||'Unable to load promotions.')} finally {setLoading(false)}
  }
  useEffect(()=>{void load()},[])
  useClinicRefresh(load,['promotion.updated','service.updated'],{fallbackMs:90000,skip:()=>editing!==null})

  const open=(promo=null)=>{setEditing(promo?.id||'new');setImageScan(null);setForm(promo ? {...promo,image_token:'',clear_image:false,service_ids:promo.service_ids||[]} : empty())}
  const save=async(e)=>{
    e.preventDefault()
    if(!form.service_ids.length){setError('Select at least one service.');return}
    if(imageScan && imageScan.status!=='approved'){setError('The promotional image must pass the security scan before saving.');return}
    setSaving(true);setError('')
    try {await saveAdminPromotion(form, editing==='new'?null:editing);toast.success('Promotion saved.');setEditing(null);await load()}
    catch(err){setError(err.message||'Could not save promotion.')} finally {setSaving(false)}
  }
  const remove=async(promo)=>{
    if(!window.confirm(`Deactivate promotion “${promo.title}”? Existing patient notifications and history will be preserved.`))return
    try {await deleteAdminPromotion(promo.id);toast.success('Promotion deactivated.');await load()}
    catch(err){setError(err.message||'Could not delete promotion.')}
  }
  const notify=async(promo)=>{
    if(!window.confirm(`Send this offer to patients who have opted in to promotional notifications?\n\n“${promo.title}”`))return
    try {const result=await notifyAdminPromotion(promo.id);toast.success(result.message);if(result.failed)setError(`${result.failed} notification(s) failed and can be retried.`);if(result.more_possible)setError('A batch was sent. Click Notify again to send the next 500 opted-in patients.');}
    catch(err){setError(err.message||'Could not send promotional notifications.')}
  }
  const uploadImage=async file=>{
    if(!file)return
    if(!['image/jpeg','image/png'].includes(file.type)||file.size>5*1024*1024){setError('Select a JPG or PNG image up to 5 MB.');return}
    setSaving(true);setError('')
    try{const result=await uploadPromotionImage(file);setForm(old=>({...old,image_url:result.url,image_token:'',clear_image:false}));setImageScan({status:'pending',token:result.scan_token});toast.success('Image uploaded. Verify the security scan before saving.')}catch(err){setError(err.message)}finally{setSaving(false)}
  }
  const verifyImage=async()=>{
    if(!imageScan?.token)return
    setSaving(true);setError('')
    try{const result=await checkPromotionImage(imageScan.token);setImageScan(old=>({...old,status:result.status}));if(result.status==='approved'){setForm(old=>({...old,image_url:result.url,image_token:result.security_token,clear_image:false}));toast.success('Promotional image approved.')}else setError(result.message||`Image scan: ${result.status}. Try again shortly.`)}catch(err){setError(err.message)}finally{setSaving(false)}
  }
  const update=(key,value)=>setForm(current=>({...current,[key]:value}))
  const toggleService=(id,checked)=>update('service_ids',checked ? [...form.service_ids,Number(id)] : form.service_ids.filter(value=>Number(value)!==Number(id)))
  const today=getLocalDateOnly()
  return <div className="space-y-5">
    <div className="flex flex-wrap items-start justify-between gap-3 rounded-2xl border border-slate-200 bg-white p-5">
      <div><h2 className="flex items-center gap-2 text-lg font-black text-slate-900"><MdCampaign className="text-amber-500"/>Promotions</h2>
        <p className="mt-1 max-w-3xl text-sm text-slate-500">Display service-specific offers while patients book and, optionally, on their dashboard. Promotions are informational and do not automatically discount bills. They appear on the site for everyone; use Notify opted-in patients for in-app notifications to patients who consented. Monetary discounts at checkout still require the normal approved discount flow.</p>
      </div><div className="flex flex-wrap gap-2"><Link className="button-secondary" to={branchPortalPath("/admin/announcements",location.pathname)}>News & Email Campaigns</Link><button type="button" onClick={load} className="button-secondary" aria-label="Refresh promotions"><MdRefresh/> Refresh</button><button type="button" onClick={()=>open()} className="button-primary"><MdAdd/> Add Promo</button></div>
    </div>
    {error&&<div role="alert" className="rounded-xl border border-rose-200 bg-rose-50 p-3 text-sm text-rose-700">{error}</div>}
    {editing!==null && <form onSubmit={save} className="space-y-4 rounded-2xl border border-emerald-200 bg-white p-5">
      <h3 className="font-bold text-slate-900">{editing==='new'?'Create Promotion':'Edit Promotion'}</h3>
      <div className="grid gap-4 sm:grid-cols-2">
        <label><span className="form-label">Title *</span><input className="form-control mt-1" maxLength={120} required value={form.title} onChange={e=>update('title',e.target.value)} placeholder="e.g. October Skin Care Special"/></label>
        <label><span className="form-label">Short badge</span><input className="form-control mt-1" maxLength={48} value={form.badge_text||''} onChange={e=>update('badge_text',e.target.value)} placeholder="e.g. Limited offer"/></label>
        <label><span className="form-label">Start date *</span><input className="form-control mt-1" type="date" required value={form.starts_on} onChange={e=>update('starts_on',e.target.value)}/></label>
        <label><span className="form-label">End date *</span><input className="form-control mt-1" type="date" required min={form.starts_on||undefined} value={form.ends_on} onChange={e=>update('ends_on',e.target.value)}/></label>
      </div>
      <div className="rounded-xl border border-dashed border-slate-300 p-4 space-y-3">
        <p className="form-label">Promotion image (optional)</p>
        <label className="inline-flex cursor-pointer items-center gap-2 rounded-lg bg-slate-100 px-3 py-2 text-sm font-bold"><MdCloudUpload/> Upload JPG/PNG (up to 5 MB)<input type="file" accept="image/jpeg,image/png" className="sr-only" disabled={saving} onChange={e=>{void uploadImage(e.target.files?.[0]);e.target.value=''}}/></label>
        {form.image_url&&<img alt="Preview of promotional artwork" src={form.image_url} className="max-h-48 w-full rounded-xl object-cover"/>}
        {imageScan?.status==='pending'&&<button type="button" className="button-secondary" disabled={saving} onClick={verifyImage}>Check image security status</button>}
        {imageScan&&<p className="text-xs text-slate-600">Security scan: {imageScan.status}</p>}
        {form.image_url&&<button type="button" className="text-xs font-bold text-rose-700 underline" onClick={()=>{setImageScan(null);setForm(old=>({...old,image_url:'',image_token:'',clear_image:true}))}}>Remove image</button>}
      </div>
      <label className="block"><span className="form-label">Featured display order</span><input className="form-control mt-1" type="number" min="0" max="9999" value={form.featured_order??0} onChange={e=>update('featured_order',Number(e.target.value||0))}/><span className="text-xs text-slate-500">Lower numbers appear first on the patient dashboard.</span></label>
      <label className="block"><span className="form-label">Offer description *</span><textarea className="form-control mt-1" rows={3} maxLength={1000} required value={form.description} onChange={e=>update('description',e.target.value)} placeholder="Describe offer terms. Do not promise automatic checkout discounts."/></label>
      <div><p className="form-label">Applies to services *</p><input value={filter} onChange={e=>setFilter(e.target.value)} className="form-control mt-2" placeholder="Filter services by name or clinic"/>
        <div className="mt-2 grid max-h-64 grid-cols-1 gap-1 overflow-auto rounded-xl border border-slate-200 p-3 sm:grid-cols-2">
          {services.filter(service=>`${service.service_name} ${service.clinic_type}`.toLowerCase().includes(filter.toLowerCase())).map(service=><label key={service.id} className="flex cursor-pointer items-center gap-2 rounded-lg p-2 text-xs hover:bg-slate-50"><input type="checkbox" checked={form.service_ids.some(id=>Number(id)===Number(service.id))} onChange={e=>toggleService(service.id,e.target.checked)}/><span>{service.service_name} · {service.clinic_type} {Number(service.is_active)===0?'(inactive)':''}</span></label>)}
        </div><p className="mt-1 text-xs text-slate-500">Only active services will display promotions to patients.</p>
      </div>
      <div className="flex flex-wrap gap-4"><label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={Boolean(form.is_active)} onChange={e=>update('is_active',e.target.checked)}/> Active promotion</label><label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={Boolean(form.show_on_dashboard)} onChange={e=>update('show_on_dashboard',e.target.checked)}/> Show on patient dashboard</label></div>
      <div className="flex justify-end gap-2"><button type="button" className="button-secondary" disabled={saving} onClick={()=>{setEditing(null);setError('')}}>Cancel</button><button type="submit" className="button-primary" disabled={saving||!form.service_ids.length}>{saving?'Saving…':'Save Promotion'}</button></div>
    </form>}
    {loading?<p className="text-sm text-slate-500">Loading promotions…</p>:promotions.length===0?<div className="rounded-2xl border border-dashed border-slate-200 bg-white p-8 text-center text-sm text-slate-500">No promotions yet. Create a service-specific promotion above.</div>:
      <div className="grid gap-3">{promotions.map(promo=>{
        const live=promo.is_active && promo.starts_on<=today && promo.ends_on>=today
        return <div key={promo.id} className="overflow-hidden rounded-2xl border border-slate-200 bg-white sm:flex">{promo.image_url&&<img alt="" src={promo.image_url} loading="lazy" className="h-44 w-full object-cover sm:h-auto sm:w-48"/>}<div className="min-w-0 flex-1 p-5"><div className="flex flex-wrap items-start justify-between gap-3"><div className="min-w-0"><div className="flex flex-wrap items-center gap-2"><h3 className="font-bold text-slate-900">{promo.title}</h3><span className={`rounded-full px-2 py-0.5 text-[10px] font-bold ${live?'bg-emerald-50 text-emerald-700':'bg-slate-100 text-slate-500'}`}>{live?'Live':promo.is_active?'Scheduled or expired':'Inactive'}</span></div><p className="mt-1 text-sm text-slate-600">{promo.description}</p><p className="mt-2 text-xs text-slate-400">{promo.starts_on} – {promo.ends_on} · {promo.service_ids.length} service(s) · {promo.show_on_dashboard?'Dashboard + booking':'Booking only'}</p></div><div className="flex shrink-0 gap-2">{live&&<button type="button" className="button-secondary" onClick={()=>notify(promo)}><MdNotificationsActive/> Notify opted-in patients</button>}<button type="button" className="button-secondary" onClick={()=>open(promo)}><MdEdit/> Edit</button><button type="button" className="button-secondary text-rose-600" disabled={!promo.is_active} onClick={()=>remove(promo)}><MdDelete/> {promo.is_active?'Deactivate':'Inactive'}</button></div></div></div></div>
      })}</div>}
  </div>
}
export default Admin_Promotions

