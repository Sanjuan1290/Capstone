import {useLocation} from 'react-router-dom'
import useClinicRefresh from '../../hooks/useClinicRefresh'
import { useCallback, useEffect, useRef, useState } from 'react'
import { MdAdd, MdCampaign, MdEdit, MdRefresh, MdCloudUpload, MdMap } from 'react-icons/md'
import { getAdminPromotions, saveAdminPromotion, getBillingCatalog, uploadPromotionImage, checkPromotionImage, } from '../../services/admin.service'
import { useToast } from '../../components/ui/ToastProvider'
import { getLocalDateOnly } from '../../utils/date'
import {promotionQuote,peso} from '../../utils/promotionPricing.mjs'
import VisibilitySwitch from '../../components/ui/VisibilitySwitch'

const newPromotion = () => ({
  title: '', description: '', badge_text: 'Special offer', starts_on: '', ends_on: '',
  is_active: true, show_on_dashboard: true, featured_order: 0, discount_type:'none',discount_value:0, eligibility_type:'all',
  image_url: '', image_token: '', clear_image: false, service_ids: [],
})

export default function Admin_Promotions({ onComposePost, onPromotionsChanged }) {
  const toast = useToast()
  const [promotions, setPromotions] = useState([])
  const [services, setServices] = useState([])
  const [loading, setLoading] = useState(true)
  const [editing, setEditing] = useState(null)
  const [form, setForm] = useState(newPromotion())
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [imageScan, setImageScan] = useState(null)
  const [filter, setFilter] = useState('')
  const [branchName, setBranchName] = useState('Your clinic branch')

  const load = async () => {
    setLoading(true)
    setError('')
    try {
      const [offers, catalog] = await Promise.all([getAdminPromotions(), getBillingCatalog({ includeInactive: true })])
      setPromotions(Array.isArray(offers) ? offers : [])
      setServices(Array.isArray(catalog) ? catalog : [])
      if (offers?.[0]?.branch_name) setBranchName(offers[0].branch_name)
    } catch (err) { setError(err.message || 'Unable to load promotions.') }
    finally { setLoading(false) }
  }
  useEffect(() => { void load() }, []) // eslint-disable-line react-hooks/exhaustive-deps
  useClinicRefresh(load, ['promotion.updated', 'service.updated'], { fallbackMs: 90000, skip: () => editing !== null })

  const open = useCallback((promo = null) => {
    setEditing(promo?.id || 'new')
    setError('')
    setImageScan(null)
    setFilter('')
    setForm(promo ? { ...newPromotion(), ...promo, image_token: '', clear_image: false, service_ids: promo.service_ids || [] } : newPromotion())
  },[])
  const notificationLocation=useLocation()
  const openedNotification=useRef(null)
  useEffect(()=>{
    const id=new URLSearchParams(notificationLocation.search).get('promotion_id')
    if(!id||loading||openedNotification.current===notificationLocation.key)return
    openedNotification.current=notificationLocation.key
    const promotion=promotions.find(p=>Number(p.id)===Number(id))
    if(promotion)open(promotion)
    else setError('This offer is no longer available in this branch.')
  },[loading,promotions,notificationLocation.search,notificationLocation.key,open])
  const update = (key, value) => setForm(current => ({ ...current, [key]: value }))
  const toggleService = (id, checked) => setForm(current => ({
    ...current, service_ids: checked ? [...current.service_ids, Number(id)] : current.service_ids.filter(value => Number(value) !== Number(id)),
  }))
  const save = async (event) => {
    event.preventDefault()
    if (form.ends_on < form.starts_on) return setError('End date must be on or after the start date.')
    if(form.discount_type!=='none' && (!form.service_ids.length || Number(form.discount_value)<=0 || (form.discount_type==='percentage'&&Number(form.discount_value)>100)))return setError('Select at least one service and enter a valid discount amount.')
    if (imageScan && imageScan.status !== 'approved') return setError('Please finish checking the photo or remove it before saving.')
    setSaving(true); setError('')
    try {
      await saveAdminPromotion(form, editing === 'new' ? null : editing)
      toast.success('Promotion saved.')
      setEditing(null)
      await load()
      await onPromotionsChanged?.()
    } catch (err) { setError(err.message || 'Could not save promotion.') }
    finally { setSaving(false) }
  }
  const setVisibility = async (promo, visible) => {
    setSaving(true); setError('')
    try {
      await saveAdminPromotion({ ...promo, is_active: visible }, promo.id)
      toast.success(visible ? 'Promotion is visible.' : 'Promotion hidden.')
      await load()
      await onPromotionsChanged?.()
    } catch (err) { setError(err.message || 'Could not update promotion visibility.') }
    finally { setSaving(false) }
  }
  const uploadImage = async file => {
    if (!file) return
    if (!['image/jpeg', 'image/png'].includes(file.type) || file.size > 5 * 1024 * 1024) {
      return setError('Choose a JPG or PNG photo under 5 MB.')
    }
    setSaving(true); setError('')
    try {
      const uploaded = await uploadPromotionImage(file)
      setForm(current => ({ ...current, image_url: uploaded.url, image_token: '', clear_image: false }))
      setImageScan({ status: 'pending', token: uploaded.scan_token })
    } catch (err) { setError(err.message || 'Photo upload failed.') }
    finally { setSaving(false) }
  }
  const verifyImage = async () => {
    if (!imageScan?.token) return
    setSaving(true); setError('')
    try {
      const result = await checkPromotionImage(imageScan.token)
      setImageScan(current => ({ ...current, status: result.status }))
      if (result.status === 'approved') {
        setForm(current => ({ ...current, image_url: result.url, image_token: result.security_token, clear_image: false }))
        toast.success('Photo ready.')
      } else setError('The photo is still being checked. Please try again, or remove it.')
    } catch (err) { setError(err.message || 'Could not check the photo.') }
    finally { setSaving(false) }
  }
  const today = getLocalDateOnly()
  return <div className="space-y-5">
    <header className="flex flex-wrap items-start justify-between gap-3 rounded-2xl border border-slate-200 bg-white p-5">
      <div>
        <h2 className="flex items-center gap-2 text-xl font-black text-slate-900"><MdCampaign className="text-amber-500" /> Promotions</h2>
        <p className="mt-1 text-sm text-slate-500">Create an offer once. It will appear on the website and in the patient dashboard during its dates.</p>
        <p className="mt-2 flex items-center gap-1 text-xs font-semibold text-slate-600"><MdMap /> {branchName}</p>
        <p className="mt-1 text-xs text-slate-500">Linked service discounts apply automatically when the booked service is billed.</p>
      </div>
      <div className="flex gap-2"><button type="button" onClick={load} className="button-secondary"><MdRefresh /> Refresh</button><button type="button" onClick={() => open()} className="button-primary"><MdAdd /> Add Promotion</button></div>
    </header>
    {error && <p role="alert" className="rounded-xl border border-rose-200 bg-rose-50 p-3 text-sm text-rose-700">{error}</p>}
    {editing !== null && <form onSubmit={save} className="space-y-4 rounded-2xl border border-emerald-200 bg-white p-5">
      <h3 className="text-lg font-black">{editing === 'new' ? 'Add Promotion' : 'Edit Promotion'}</h3>
      <p className="text-xs text-slate-500">This offer belongs to {branchName}. Patients will see the branch name.</p>
      <label className="block"><span className="form-label">Promotion Name *</span><input className="form-control mt-1" required maxLength={120} placeholder="Example: Skin Care Special" value={form.title} onChange={e => update('title', e.target.value)} /></label>
      <label className="block"><span className="form-label">Promotion Details *</span><textarea className="form-control mt-1" required rows={3} maxLength={1000} value={form.description} onChange={e => update('description', e.target.value)} placeholder="What is the offer and who can use it?" /></label>
      <div className="grid gap-3 sm:grid-cols-2">
        <label><span className="form-label">Start Date *</span><input className="form-control mt-1" type="date" required value={form.starts_on} onChange={e => update('starts_on', e.target.value)} /></label>
        <label><span className="form-label">End Date *</span><input className="form-control mt-1" type="date" required min={form.starts_on || undefined} value={form.ends_on} onChange={e => update('ends_on', e.target.value)} /></label>
      </div>
      <fieldset className="rounded-xl border border-slate-200 p-4">
        <legend className="px-1 text-sm font-bold text-slate-900">Promotion Eligibility</legend>
        <div className="grid gap-3 sm:grid-cols-2">
          <label className="flex cursor-pointer items-start gap-2 rounded-xl bg-slate-50 p-3 text-sm"><input className="mt-1" type="radio" name="eligibility_type" value="all" checked={form.eligibility_type==='all'} onChange={()=>update('eligibility_type','all')} /><span><strong className="block">All Patients</strong>Guests and registered patients can use the offer when its other terms are met.</span></label>
          <label className="flex cursor-pointer items-start gap-2 rounded-xl bg-slate-50 p-3 text-sm"><input className="mt-1" type="radio" name="eligibility_type" value="verified" checked={form.eligibility_type==='verified'} onChange={()=>update('eligibility_type','verified')} /><span><strong className="block">Verified Patients Only</strong>Requires a registered account plus verified email and mobile number.</span></label>
        </div>
      </fieldset>
      <div className="space-y-2 rounded-xl border border-dashed border-slate-300 p-4">
        <p className="form-label">Promotion Photo (Optional)</p>
        <label className="inline-flex cursor-pointer items-center gap-2 rounded-lg bg-slate-100 px-3 py-2 text-sm font-bold"><MdCloudUpload /> Choose Photo<input className="sr-only" type="file" accept="image/jpeg,image/png" disabled={saving} onChange={e => { void uploadImage(e.target.files?.[0]); e.target.value = '' }} /></label>
        {form.image_url && <img alt="Promotion" src={form.image_url} className="max-h-48 w-full rounded-xl object-cover" />}
        {imageScan?.status === 'pending' && <button type="button" className="button-secondary" disabled={saving} onClick={verifyImage}>Finish Checking Photo</button>}
        {imageScan?.status === 'approved' && <p className="text-xs font-bold text-emerald-700">Photo is ready.</p>}
        {form.image_url && <button type="button" className="block text-xs font-bold text-rose-700 underline" onClick={() => { setImageScan(null); setForm(current => ({ ...current, image_url: '', image_token: '', clear_image: true })) }}>Remove Photo</button>}
      </div>
      <div className="grid gap-3 rounded-xl border border-emerald-100 bg-emerald-50/40 p-4 sm:grid-cols-2">
        <label className="form-label">Discount type
          <select className="form-control mt-1" value={form.discount_type} onChange={e=>setForm(s=>({...s,discount_type:e.target.value,discount_value:e.target.value==='none'?0:s.discount_value}))}>
            <option value="none">Informational offer (no price change)</option>
            <option value="percentage">Percentage (%)</option>
            <option value="fixed">Fixed amount (₱)</option>
          </select>
        </label>
        {form.discount_type!=='none' && <label className="form-label">{form.discount_type==='percentage'?'Discount percentage':'Discount amount (₱)'}
          <input className="form-control mt-1" type="number" required min="0.01" max={form.discount_type==='percentage'?100:99999999.99} step="0.01" value={form.discount_value} onChange={e=>update('discount_value',e.target.value)}/>
        </label>}
        <p className="text-xs text-slate-600 sm:col-span-2">Discounts apply only to eligible services. They do not change the service catalog's original price.</p>
      </div>
      <div className="rounded-xl border border-slate-200 px-3 py-2">
        <VisibilitySwitch checked={Boolean(form.is_active)} onChange={visible=>update('is_active',visible)} label="Show promotion" disabled={saving} />
        <p className="pl-2 text-xs text-slate-500">Patients who opted in and previously visited this branch receive one in-app alert when this offer goes live. No SMS or email is sent.</p>
      </div>
      <details className="rounded-xl border border-slate-200 p-3">
        <summary className="cursor-pointer text-sm font-bold">Eligible Services {form.discount_type==='none'?'(Optional)':'*'}</summary>
        <p className="mt-2 text-xs text-slate-500">Choose the services this offer applies to. Discounted offers require at least one service.</p>
        <input className="form-control mt-3" value={filter} onChange={e => setFilter(e.target.value)} placeholder="Find a service" />
        <div className="mt-2 grid max-h-48 gap-1 overflow-auto sm:grid-cols-2">{services.filter(service => Number(service.is_active) !== 0 && `${service.service_name} ${service.clinic_type}`.toLowerCase().includes(filter.toLowerCase())).map(service => <label key={service.id} className="flex cursor-pointer items-center gap-2 rounded-lg p-2 text-xs hover:bg-slate-50"><input type="checkbox" checked={form.service_ids.some(id => Number(id) === Number(service.id))} onChange={e => toggleService(service.id, e.target.checked)} />{service.service_name}</label>)}</div>
      </details>
      {form.discount_type!=='none' && form.service_ids.length>0 && <div className="rounded-xl bg-slate-50 p-4 text-sm">
        <p className="mb-2 font-bold text-slate-800">Patient price preview</p>
        {services.filter(service=>form.service_ids.some(id=>Number(id)===Number(service.id))).slice(0,5).map(service=>{
          const quote=promotionQuote(service.default_price,form)
          return <div className="flex flex-wrap justify-between gap-2 py-1" key={service.id}><span>{service.service_name}</span><span>{quote ? <><s className="text-slate-500">{peso(quote.original)}</s> <strong className="text-emerald-700">{peso(quote.current)}</strong></> : 'Price unavailable'}</span></div>
        })}
      </div>}
      <div className="flex justify-end gap-2"><button type="button" className="button-secondary" disabled={saving} onClick={() => { setEditing(null); setError('') }}>Cancel</button><button type="submit" className="button-primary" disabled={saving}>{saving ? 'Saving…' : 'Save Promotion'}</button></div>
    </form>}
    {loading ? <p className="text-sm text-slate-500">Loading promotions…</p> : !promotions.length ? <div className="rounded-xl border border-dashed bg-white p-8 text-center text-sm text-slate-500">No promotions yet. Select Add Promotion to create one.</div> : <div className="grid gap-3">
      {promotions.map(promo => {
        const live = promo.is_active && promo.starts_on <= today && promo.ends_on >= today
        return <article key={promo.id} className="overflow-hidden rounded-2xl border border-slate-200 bg-white sm:flex">
          {promo.image_url && <img alt="" src={promo.image_url} loading="lazy" className="h-44 w-full object-cover sm:h-auto sm:w-48" />}
          <div className="min-w-0 flex-1 p-4"><div className="flex flex-wrap items-start justify-between gap-3">
            <div><div className="flex items-center gap-2"><h3 className="font-bold">{promo.title}</h3><span className={`rounded-full px-2 py-0.5 text-xs ${live ? 'bg-emerald-50 text-emerald-700' : 'bg-slate-100 text-slate-600'}`}>{live ? 'Showing' : !promo.is_active ? 'Hidden' : promo.starts_on > today ? 'Upcoming' : 'Ended'}</span></div>
              <p className="mt-1 text-sm text-slate-600">{promo.description}</p><p className="mt-2 text-xs text-slate-500">{promo.branch_name || branchName} · {promo.starts_on} to {promo.ends_on}{promo.service_ids?.length ? ` · ${promo.service_ids.length} selected service(s)` : ' · General offer'} · {promo.eligibility_type==='verified' ? 'Verified Patients Only' : 'All Patients'}{promo.discount_type==='percentage'?` · ${promo.discount_value}% off`:promo.discount_type==='fixed'?` · ₱${Number(promo.discount_value).toFixed(2)} off`:''}</p>
            </div><div className="flex flex-wrap gap-2">
              {onComposePost && <button type="button" className="button-secondary" onClick={()=>onComposePost(promo)}>Create Promo Post</button>}
              <button type="button" className="button-secondary" onClick={() => open(promo)}><MdEdit /> Edit</button><VisibilitySwitch checked={Boolean(promo.is_active)} onChange={visible=>setVisibility(promo,visible)} label="Show promotion" disabled={saving} /></div>
          </div></div>
        </article>
      })}
    </div>}
  </div>
}


