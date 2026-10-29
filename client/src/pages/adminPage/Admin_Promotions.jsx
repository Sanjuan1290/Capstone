import useClinicRefresh from '../../hooks/useClinicRefresh'
import { useEffect, useState } from 'react'
import { useLocation } from 'react-router-dom'
import { MdAdd, MdCampaign, MdEdit, MdDelete, MdRefresh, MdCloudUpload, MdMap, MdNotificationsActive } from 'react-icons/md'
import { getAdminPromotions, saveAdminPromotion, deleteAdminPromotion, getBillingCatalog, uploadPromotionImage, checkPromotionImage, notifyAdminPromotion } from '../../services/admin.service'
import { useToast } from '../../components/ui/ToastProvider'
import { getLocalDateOnly } from '../../utils/date'

const newPromotion = () => ({
  title: '', description: '', badge_text: 'Special offer', starts_on: '', ends_on: '',
  is_active: true, show_on_dashboard: true, featured_order: 0,
  image_url: '', image_token: '', clear_image: false, service_ids: [],
})

export default function Admin_Promotions() {
  const toast = useToast()
  const location = useLocation()
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
  const isStaff = location.pathname.startsWith('/staff')

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

  const open = (promo = null) => {
    setEditing(promo?.id || 'new')
    setError('')
    setImageScan(null)
    setFilter('')
    setForm(promo ? { ...newPromotion(), ...promo, image_token: '', clear_image: false, service_ids: promo.service_ids || [] } : newPromotion())
  }
  const update = (key, value) => setForm(current => ({ ...current, [key]: value }))
  const toggleService = (id, checked) => setForm(current => ({
    ...current, service_ids: checked ? [...current.service_ids, Number(id)] : current.service_ids.filter(value => Number(value) !== Number(id)),
  }))
  const save = async (event) => {
    event.preventDefault()
    if (form.ends_on < form.starts_on) return setError('End date must be on or after the start date.')
    if (imageScan && imageScan.status !== 'approved') return setError('Please finish checking the photo or remove it before saving.')
    setSaving(true); setError('')
    try {
      await saveAdminPromotion(form, editing === 'new' ? null : editing)
      toast.success('Promotion saved.')
      setEditing(null)
      await load()
    } catch (err) { setError(err.message || 'Could not save promotion.') }
    finally { setSaving(false) }
  }
  const remove = async promo => {
    if (!window.confirm(`Hide “${promo.title}”? Previous bookings and notifications will be kept.`)) return
    try { await deleteAdminPromotion(promo.id); toast.success('Promotion hidden.'); await load() }
    catch (err) { setError(err.message || 'Could not hide promotion.') }
  }
  const notify = async promo => {
    if (!window.confirm(`Notify patients who chose to receive promotion updates about “${promo.title}”?`)) return
    setSaving(true); setError('')
    try {
      const result = await notifyAdminPromotion(promo.id)
      toast.success(result?.message || 'Patient notifications sent.')
    } catch (err) { setError(err.message || 'Could not send notifications.') }
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
        <p className="mt-1 text-xs text-slate-500">Offers do not automatically reduce a patient's bill.</p>
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
      <div className="space-y-2 rounded-xl border border-dashed border-slate-300 p-4">
        <p className="form-label">Promotion Photo (Optional)</p>
        <label className="inline-flex cursor-pointer items-center gap-2 rounded-lg bg-slate-100 px-3 py-2 text-sm font-bold"><MdCloudUpload /> Choose Photo<input className="sr-only" type="file" accept="image/jpeg,image/png" disabled={saving} onChange={e => { void uploadImage(e.target.files?.[0]); e.target.value = '' }} /></label>
        {form.image_url && <img alt="Promotion" src={form.image_url} className="max-h-48 w-full rounded-xl object-cover" />}
        {imageScan?.status === 'pending' && <button type="button" className="button-secondary" disabled={saving} onClick={verifyImage}>Finish Checking Photo</button>}
        {imageScan?.status === 'approved' && <p className="text-xs font-bold text-emerald-700">Photo is ready.</p>}
        {form.image_url && <button type="button" className="block text-xs font-bold text-rose-700 underline" onClick={() => { setImageScan(null); setForm(current => ({ ...current, image_url: '', image_token: '', clear_image: true })) }}>Remove Photo</button>}
      </div>
      <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={Boolean(form.is_active)} onChange={e => update('is_active', e.target.checked)} /> Show this promotion</label>
      <details className="rounded-xl border border-slate-200 p-3">
        <summary className="cursor-pointer text-sm font-bold">Specific Services (Optional)</summary>
        <p className="mt-2 text-xs text-slate-500">Leave blank for a general clinic offer. Choose services only if this promotion is limited to them.</p>
        <input className="form-control mt-3" value={filter} onChange={e => setFilter(e.target.value)} placeholder="Find a service" />
        <div className="mt-2 grid max-h-48 gap-1 overflow-auto sm:grid-cols-2">{services.filter(service => Number(service.is_active) !== 0 && `${service.service_name} ${service.clinic_type}`.toLowerCase().includes(filter.toLowerCase())).map(service => <label key={service.id} className="flex cursor-pointer items-center gap-2 rounded-lg p-2 text-xs hover:bg-slate-50"><input type="checkbox" checked={form.service_ids.some(id => Number(id) === Number(service.id))} onChange={e => toggleService(service.id, e.target.checked)} />{service.service_name}</label>)}</div>
      </details>
      <div className="flex justify-end gap-2"><button type="button" className="button-secondary" disabled={saving} onClick={() => { setEditing(null); setError('') }}>Cancel</button><button type="submit" className="button-primary" disabled={saving}>{saving ? 'Saving…' : 'Save Promotion'}</button></div>
    </form>}
    {loading ? <p className="text-sm text-slate-500">Loading promotions…</p> : !promotions.length ? <div className="rounded-xl border border-dashed bg-white p-8 text-center text-sm text-slate-500">No promotions yet. Select Add Promotion to create one.</div> : <div className="grid gap-3">
      {promotions.map(promo => {
        const live = promo.is_active && promo.starts_on <= today && promo.ends_on >= today
        return <article key={promo.id} className="overflow-hidden rounded-2xl border border-slate-200 bg-white sm:flex">
          {promo.image_url && <img alt="" src={promo.image_url} loading="lazy" className="h-44 w-full object-cover sm:h-auto sm:w-48" />}
          <div className="min-w-0 flex-1 p-4"><div className="flex flex-wrap items-start justify-between gap-3">
            <div><div className="flex items-center gap-2"><h3 className="font-bold">{promo.title}</h3><span className={`rounded-full px-2 py-0.5 text-xs ${live ? 'bg-emerald-50 text-emerald-700' : 'bg-slate-100 text-slate-600'}`}>{live ? 'Showing' : !promo.is_active ? 'Hidden' : promo.starts_on > today ? 'Upcoming' : 'Ended'}</span></div>
              <p className="mt-1 text-sm text-slate-600">{promo.description}</p><p className="mt-2 text-xs text-slate-500">{promo.branch_name || branchName} · {promo.starts_on} to {promo.ends_on}{promo.service_ids?.length ? ` · ${promo.service_ids.length} selected service(s)` : ' · General offer'}</p>
            </div><div className="flex flex-wrap gap-2">{live && !isStaff && <button type="button" className="button-secondary" disabled={saving} onClick={() => notify(promo)}><MdNotificationsActive /> Notify Patients</button>}<button type="button" className="button-secondary" onClick={() => open(promo)}><MdEdit /> Edit</button><button type="button" className="button-secondary text-rose-700" disabled={!promo.is_active || isStaff && saving} onClick={() => remove(promo)}><MdDelete /> Hide</button></div>
          </div></div>
        </article>
      })}
    </div>}
  </div>
}
