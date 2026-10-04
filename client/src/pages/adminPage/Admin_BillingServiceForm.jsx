import { useEffect, useMemo, useState } from 'react'
import { useLocation, useNavigate, useParams, useSearchParams } from 'react-router-dom'
import { MdAdd, MdArrowBack, MdCheck, MdClose, MdDelete, MdLock, MdPayments } from 'react-icons/md'
import { createBillingCatalogService, deleteBillingCatalogService, getBillingCatalog, getInventory, getSystemSetup, updateBillingCatalogService } from '../../services/admin.service'
import { useToast } from '../../components/ui/ToastProvider'
import ConfirmDialog from '../../components/ui/ConfirmDialog'
import { LoadingState, ErrorState } from '../../components/ui/PageState'
import { formatMoney } from '../../utils/billingUi'

const CLINIC_TYPES = [{ value: 'medical', label: 'General Medicine' }, { value: 'derma', label: 'Dermatology' }]
const blankMaterial = () => ({ inventory_id: '', material_name: '', quantity: 1, unit_label: '', notes: '' })
const DURATION_OPTIONS = Array.from({ length: 32 }, (_, index) => (index + 1) * 15)
const formatDuration = (minutes) => { const total = Number(minutes || 0); const hours = Math.floor(total / 60); const mins = total % 60; if (!hours) return `${mins} minutes`; if (!mins) return `${hours} hour${hours === 1 ? '' : 's'}`; return `${hours} hour${hours === 1 ? '' : 's'} ${mins} minutes` }
const reservedDuration = (minutes) => Math.ceil(Math.max(15, Number(minutes || 60)) / 30) * 30
const blank = { category_id: '', category: '', service_name: '', clinic_type: 'medical', default_price: '', average_duration_minutes: 60, is_active: 1, materials: [] }
const clinicLabel = (value) => CLINIC_TYPES.find((item) => item.value === value)?.label || value
const toForm = (service) => ({
  category_id: service?.category_id || '', category: service?.category || '', service_name: service?.service_name || '',
  clinic_type: ['medical','derma'].includes(service?.clinic_type) ? service.clinic_type : 'medical',
  default_price: Number(service?.consultation_fee ?? 0) > 0
    ? String(Number(service.consultation_fee))
    : (Number(service?.default_price ?? service?.patient_price ?? 0) > 0 ? String(Number(service.default_price ?? service.patient_price)) : ''),
  average_duration_minutes: Number(service?.average_duration_minutes || 60),
  is_active: Number(service?.is_active) === 1 ? 1 : 0,
  materials: Array.isArray(service?.materials) ? service.materials.map((m) => ({ inventory_id: m.inventory_id || '', material_name: m.material_name || m.inventory_name || '', quantity: Number(m.quantity || 1), unit_label: m.unit_label || m.inventory_unit || '', notes: m.notes || '' })) : [],
})

const Admin_BillingServiceForm = () => {
  const { serviceId } = useParams()
  const editing = Boolean(serviceId)
  const navigate = useNavigate()
  const location = useLocation()
  const [searchParams] = useSearchParams()
  const portalBase = location.pathname.startsWith('/staff') ? '/staff' : '/admin'
  const canEditPricing = portalBase === '/admin'
  const requestedClinic = ['medical', 'derma'].includes(searchParams.get('clinic')) ? searchParams.get('clinic') : 'medical'
  const toast = useToast()
  const [form, setForm] = useState(() => ({ ...blank, clinic_type: requestedClinic }))
  const [inventory, setInventory] = useState([])
  const [serviceCategories, setServiceCategories] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [step, setStep] = useState(1)
  const [saving, setSaving] = useState(false)
  const [removeOpen, setRemoveOpen] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [errors, setErrors] = useState({})
  const [dirty, setDirty] = useState(false)

  const inventoryMap = useMemo(() => new Map(inventory.map((item) => [Number(item.id), item])), [inventory])
  const availableCategories = useMemo(() => serviceCategories
    .filter((category) => category.clinic_type === form.clinic_type && (Number(category.is_active) === 1 || Number(category.id) === Number(form.category_id)))
    .sort((a,b) => String(a.name || '').localeCompare(String(b.name || ''), 'en', { sensitivity: 'base' })), [serviceCategories, form.clinic_type, form.category_id])

  const servicePrice = Math.max(0, Number(form.default_price || 0))
  const isInventoryCompatible = (item, clinicType = form.clinic_type) => Boolean(
    item && !item.archived_at && (!item.category || item.category === clinicType)
  )
  const consumablesTotal = useMemo(() => form.materials.reduce((sum, material) => {
    const item = inventoryMap.get(Number(material.inventory_id))
    if (!isInventoryCompatible(item)) return sum
    const unitPrice = Math.max(0, Number(item?.selling_price || 0))
    const quantity = Math.max(0, Number(material.quantity || 0))
    return sum + (unitPrice * quantity)
  }, 0), [form.materials, inventoryMap, form.clinic_type])
  const patientPrice = Math.round((servicePrice + consumablesTotal) * 100) / 100

  useEffect(() => { (async () => {
    setLoading(true)
    try {
      const [items, setup, catalog] = await Promise.all([getInventory(), getSystemSetup(), editing ? getBillingCatalog({ includeInactive: true }) : Promise.resolve([])])
      setInventory((Array.isArray(items) ? items : []).filter((item) => !item.archived_at))
      const categories = Array.isArray(setup?.service_categories) ? setup.service_categories : []
      setServiceCategories(categories)
      if (editing) {
        const found = (Array.isArray(catalog) ? catalog : []).find((item) => Number(item.id) === Number(serviceId))
        if (!found) throw new Error('Billing service not found.')
        const legacyCategory = !found.category_id ? categories.find((category) => category.clinic_type === found.clinic_type && category.name === found.category) : null
        setForm(toForm({ ...found, category_id: found.category_id || legacyCategory?.id || '' }))
      }
      setDirty(false)
    } catch (err) { setError(err.message || 'Could not load service editor.') }
    finally { setLoading(false) }
  })() }, [editing, serviceId])

  useEffect(() => {
    const beforeUnload = (event) => { if (!dirty) return; event.preventDefault(); event.returnValue = '' }
    window.addEventListener('beforeunload', beforeUnload)
    return () => window.removeEventListener('beforeunload', beforeUnload)
  }, [dirty])

  const update = (key, value) => { setForm((current) => ({ ...current, [key]: value })); setDirty(true) }
  const changeClinic = (clinicType) => {
    setForm((current) => ({ ...current, clinic_type: clinicType, category_id: '', category: '', materials: [] }))
    setErrors((current) => Object.fromEntries(Object.entries(current).filter(([key]) => !key.startsWith('material_') && !key.startsWith('qty_') && !key.startsWith('price_'))))
    setDirty(true)
    toast.info('Clinic changed. Consumables were cleared so only inventory for the selected clinic can be added.')
  }
  const changeCategory = (categoryId) => { const category = serviceCategories.find((item) => Number(item.id) === Number(categoryId)); setForm((current) => ({ ...current, category_id: categoryId, category: category?.name || '' })); setDirty(true) }
  const updateMaterial = (index, key, value) => { setForm((current) => ({ ...current, materials: current.materials.map((m, i) => i === index ? { ...m, [key]: value } : m) })); setDirty(true) }
  const chooseInventory = (index, value) => {
    const item = inventoryMap.get(Number(value))
    setForm((current) => ({
      ...current,
      materials: current.materials.map((m, i) => i === index
        ? { ...m, inventory_id: value, material_name: item?.name || '', unit_label: value ? 'unit' : '' }
        : m),
    }))
    setDirty(true)
  }
  const openCategorySetup = () => { if (dirty && !window.confirm('You have unsaved service changes. Leave this page and manage Service Categories?')) return; navigate(`${portalBase}/system-setup?tab=service_categories`) }

  const payload = () => ({
    category_id: Number(form.category_id) || null, category: String(form.category || '').trim(), service_name: String(form.service_name || '').trim(), clinic_type: form.clinic_type,
    // consultation_fee stores the base Service Price; default_price stores the final patient price.
    default_price: patientPrice, consultation_fee: servicePrice, average_duration_minutes: Number(form.average_duration_minutes || 60), profit_percentage: 0, is_active: Number(form.is_active) === 1 ? 1 : 0,
    materials: form.materials.map((m, index) => ({ inventory_id: m.inventory_id || null, material_name: String(m.material_name || '').trim(), quantity: Number(m.quantity || 0), unit_label: String(m.unit_label || '').trim(), unit_cost_override: null, notes: String(m.notes || '').trim(), sort_order: index })).filter((m) => m.inventory_id || m.material_name),
  })

  const validate = (target = 3) => {
    const p = payload(); const next = {}
    if (target === 1 || target === 3) {
      if (!p.category_id) next.category = 'Select a service category.'
      if (!p.service_name) next.service_name = 'Enter a service name.'
      if (!(servicePrice > 0)) next.default_price = 'Service Price is required and must be greater than ₱0.00.'
      if (!DURATION_OPTIONS.includes(Number(form.average_duration_minutes))) next.average_duration_minutes = 'Select an Average Duration from 15 minutes to 8 hours.'
    }
    if (target === 2 || target === 3) form.materials.forEach((m, i) => {
      const item = inventoryMap.get(Number(m.inventory_id))
      if (!m.inventory_id || !isInventoryCompatible(item)) {
        next[`material_${i}`] = m.inventory_id
          ? 'This inventory item does not belong to the selected clinic. Choose another item.'
          : 'Select an inventory item.'
      }
      if (!(Number(m.quantity) > 0) || !Number.isInteger(Number(m.quantity))) next[`qty_${i}`] = 'Quantity must be a whole number greater than zero.'
      if (m.inventory_id && isInventoryCompatible(item) && !(Number(item?.selling_price || 0) > 0)) next[`price_${i}`] = 'Set a Selling Price for this inventory item before using it as a consumable.'
    })
    setErrors(next); return Object.keys(next).length === 0
  }
  const move = (next) => { if (next > step && !validate(step)) { toast.warning('Check the highlighted fields before continuing.'); return } setStep(next); window.scrollTo({ top: 0, behavior: 'smooth' }) }
  const save = async () => {
    if (!validate(3)) { toast.warning('Check the service details before saving.'); return }
    setSaving(true)
    try { editing ? await updateBillingCatalogService(serviceId, payload()) : await createBillingCatalogService(payload()); setDirty(false); toast.success(editing ? 'Billing service updated.' : 'Billing service added.'); navigate(`${portalBase}/system-setup/billing/services`) }
    catch (err) { toast.error(err.message || 'Billing service could not be saved.') }
    finally { setSaving(false) }
  }
  const remove = async () => { setDeleting(true); try { const result = await deleteBillingCatalogService(serviceId); toast.success(result?.message || 'Service removed.'); setDirty(false); navigate(`${portalBase}/system-setup/billing/services`) } catch (err) { toast.error(err.message || 'Service could not be removed.') } finally { setDeleting(false) } }
  const leaveEditor = () => { if (dirty && !window.confirm('You have unsaved service changes. Leave this page and discard them?')) return; navigate(`${portalBase}/system-setup/billing/services`) }

  if (loading) return <div className="mx-auto max-w-5xl"><LoadingState label="Loading service editor..." /></div>
  if (error) return <div className="mx-auto max-w-5xl"><ErrorState message={error} onRetry={() => window.location.reload()} /></div>
  if (!canEditPricing) return <div className="mx-auto max-w-3xl"><div className="rounded-3xl border border-slate-200 bg-white p-8 shadow-sm"><div className="flex items-start gap-4"><div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-slate-100 text-slate-500"><MdLock className="text-xl" /></div><div><h1 className="text-xl font-black text-slate-900">Services & Pricing is Admin-only</h1><p className="mt-2 text-sm text-slate-500">Staff can review configured services and prices, but only an Admin can add services or change Service Price and consumable pricing.</p><button className="button-secondary mt-5" onClick={() => navigate(`${portalBase}/system-setup/billing/services`)}><MdArrowBack /> Back to Services & Pricing</button></div></div></div></div>

  return <div className="mx-auto max-w-5xl space-y-5">
    <div className="flex flex-wrap items-start justify-between gap-3">
      <div><button className="mb-2 inline-flex items-center gap-1 text-sm font-bold text-slate-500 hover:text-slate-900" onClick={leaveEditor}><MdArrowBack /> Services & Pricing Setup</button><h1 className="flex items-center gap-2 text-2xl font-black text-slate-900"><MdPayments className="text-amber-500" /> {editing ? 'Edit Service' : 'Add Service'}</h1><p className="mt-1 text-sm text-slate-500">Set the Service Price and the inventory consumables normally used. Consumable Selling Prices are added automatically to the patient price.</p></div>
      {editing && <button className="button-danger" onClick={() => setRemoveOpen(true)}><MdDelete /> Remove Service</button>}
    </div>

    <div className="grid grid-cols-3 gap-2 rounded-2xl bg-slate-100 p-1 text-sm font-bold">
      {['Service Details','Consumables','Review'].map((label,index)=><div key={label} className={`rounded-xl px-3 py-2 text-center ${step===index+1?'bg-white text-slate-900 shadow-sm':'text-slate-500'}`}>{index+1}. {label}</div>)}
    </div>

    <section className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
      {step === 1 && <div className="space-y-5">
        <div><h2 className="text-lg font-black">Service Details</h2><p className="mt-1 text-sm text-slate-500">Service Price covers the service itself. Selected consumables are added using their Inventory Selling Price.</p></div>
        <div className="grid gap-4 sm:grid-cols-2">
          <label><span className="form-label">Clinic *</span><select className="form-control mt-1.5" value={form.clinic_type} onChange={(e)=>changeClinic(e.target.value)}>{CLINIC_TYPES.map((option)=><option key={option.value} value={option.value}>{option.label}</option>)}</select></label>
          <label><span className="form-label">Service Category *</span><select className="form-control mt-1.5" value={form.category_id} onChange={(e)=>changeCategory(e.target.value)}><option value="">Select category</option>{availableCategories.map((option)=><option key={option.id} value={option.id}>{option.name}</option>)}</select>{!availableCategories.length&&<p className="form-helper">No active categories. <button type="button" className="font-bold text-sky-700 underline" onClick={openCategorySetup}>Add one in System Setup</button>.</p>}{errors.category&&<p className="form-error">{errors.category}</p>}</label>
          <label><span className="form-label">Service Name *</span><input className="form-control mt-1.5" maxLength={180} value={form.service_name} onChange={(e)=>update('service_name',e.target.value)} placeholder="e.g. Skin Scraping & KOH Examination" />{errors.service_name&&<p className="form-error">{errors.service_name}</p>}</label>
          <label className="rounded-2xl border-2 border-amber-300 bg-amber-50 p-4"><span className="text-sm font-black text-amber-900">Service Price *</span><input type="number" min="0.01" step="0.01" className="form-control mt-2 bg-white text-lg font-black" value={form.default_price} onChange={(e)=>update('default_price',e.target.value)} /><span className="mt-2 block text-xs text-amber-800">Base service amount before consumable prices are added.</span>{errors.default_price&&<p className="form-error">{errors.default_price}</p>}</label>
          <label><span className="form-label">Average Duration *</span><select className="form-control mt-1.5" value={form.average_duration_minutes} onChange={(e)=>update('average_duration_minutes',Number(e.target.value))}>{DURATION_OPTIONS.map((minutes)=><option key={minutes} value={minutes}>{formatDuration(minutes)}</option>)}</select><span className="form-helper">Booking time reserved: <strong>{formatDuration(reservedDuration(form.average_duration_minutes))}</strong>. Start times use 30-minute intervals.</span>{errors.average_duration_minutes&&<p className="form-error">{errors.average_duration_minutes}</p>}</label>
        </div>
        <label className="flex items-center gap-3 rounded-2xl bg-slate-50 p-4 text-sm font-bold text-slate-700"><input type="checkbox" checked={Number(form.is_active)===1} onChange={(e)=>update('is_active',e.target.checked?1:0)} /> Active for patient booking and Doctor consultation</label>
      </div>}

      {step === 2 && <div className="space-y-4">
        <div className="flex items-start justify-between gap-4"><div><h2 className="text-lg font-black">Default Consumables</h2><p className="mt-1 text-sm text-slate-500">Choose inventory items normally used when this service is performed. Quantity Used is deducted from treatment-room stock only when the consultation is completed. Inventory quantities are tracked as whole units.</p></div><button className="button-secondary" onClick={()=>update('materials',[...form.materials,blankMaterial()])}><MdAdd /> Add Consumable</button></div>
        {!form.materials.length ? <div className="rounded-2xl border border-dashed border-slate-300 bg-slate-50 p-8 text-center text-sm text-slate-500">No default consumables.</div> : <div className="space-y-3">{form.materials.map((m,index)=>{const item=inventoryMap.get(Number(m.inventory_id)); const stepValue=1; const unitPrice=Number(item?.selling_price||0); const lineTotal=unitPrice*Math.max(0,Number(m.quantity||0)); return <div key={index} className="rounded-2xl border border-slate-200 p-4"><div className="flex justify-between"><strong className="text-xs uppercase tracking-wide text-slate-400">Consumable {index+1}</strong><button className="text-slate-400 hover:text-rose-600" onClick={()=>update('materials',form.materials.filter((_,i)=>i!==index))}><MdClose /></button></div><div className="mt-3 grid gap-3 sm:grid-cols-[1.4fr_.7fr_.9fr]"><label><span className="form-label">Inventory Item *</span><select className="form-control mt-1.5" value={m.inventory_id} onChange={(e)=>chooseInventory(index,e.target.value)}><option value="">Select item</option>{inventory.filter((inv)=>!inv.category||inv.category===form.clinic_type).map((inv)=><option key={inv.id} value={inv.id}>{inv.name} — {Number(inv.selling_price||0)>0?formatMoney(inv.selling_price):'Price not set'}</option>)}</select>{errors[`material_${index}`]&&<p className="form-error">{errors[`material_${index}`]}</p>}{errors[`price_${index}`]&&<p className="form-error">{errors[`price_${index}`]}</p>}</label><div><span className="form-label">Quantity Used *</span><input aria-label={`Quantity used for consumable ${index+1}`} type="number" min={stepValue} step={stepValue} className="form-control mt-1.5" value={m.quantity} onChange={(e)=>updateMaterial(index,'quantity',e.target.value)} /><p className="mt-1 text-[11px] text-slate-400">Whole units only.</p>{errors[`qty_${index}`]&&<p className="form-error">{errors[`qty_${index}`]}</p>}</div><div><span className="form-label">Consumable Price</span><div className="mt-1.5 rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 text-sm"><p className="font-bold text-slate-800">{unitPrice>0?formatMoney(unitPrice):'Not set'}</p><p className="mt-0.5 text-[11px] text-slate-400">{Number(m.quantity||0)>0&&unitPrice>0?`${formatMoney(lineTotal)} total`:'Inventory Selling Price'}</p></div></div><label className="sm:col-span-3"><span className="form-label">Notes</span><input maxLength={255} className="form-control mt-1.5" value={m.notes} onChange={(e)=>updateMaterial(index,'notes',e.target.value)} placeholder="Optional usage note" /></label></div></div>})}</div>}
        <div className="grid gap-3 rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm sm:grid-cols-3"><div><p className="text-[10px] font-black uppercase tracking-wider text-amber-700">Service Price</p><p className="mt-1 font-black text-amber-950">{formatMoney(servicePrice)}</p></div><div><p className="text-[10px] font-black uppercase tracking-wider text-amber-700">Consumables</p><p className="mt-1 font-black text-amber-950">{formatMoney(consumablesTotal)}</p></div><div><p className="text-[10px] font-black uppercase tracking-wider text-amber-700">Total Patient Price</p><p className="mt-1 text-lg font-black text-amber-950">{formatMoney(patientPrice)}</p></div></div>
      </div>}

      {step === 3 && <div className="space-y-4"><div><h2 className="text-lg font-black">Review Service</h2><p className="mt-1 text-sm text-slate-500">Confirm the Service Price, consumable prices, and final patient price.</p></div><div className="rounded-2xl border border-slate-200 p-5"><h3 className="text-xl font-black">{form.service_name||'Unnamed Service'}</h3><p className="mt-1 text-sm text-slate-500">{form.category||'No category'} · {clinicLabel(form.clinic_type)} · {formatDuration(Number(form.average_duration_minutes || 60))} average · {formatDuration(reservedDuration(form.average_duration_minutes))} reserved · {Number(form.is_active)===1?'Active':'Inactive'}</p><div className="mt-4 grid gap-3 sm:grid-cols-3"><div className="rounded-2xl bg-slate-50 p-4"><p className="text-xs font-bold uppercase text-slate-500">Service Price</p><p className="mt-2 text-xl font-black text-slate-900">{formatMoney(servicePrice)}</p></div><div className="rounded-2xl bg-slate-50 p-4"><p className="text-xs font-bold uppercase text-slate-500">Consumables</p><p className="mt-2 text-xl font-black text-slate-900">{formatMoney(consumablesTotal)}</p></div><div className="rounded-2xl bg-amber-50 p-4"><p className="text-xs font-bold uppercase text-amber-700">Total Patient Price</p><p className="mt-2 text-2xl font-black text-amber-900">{formatMoney(patientPrice)}</p></div></div></div><div className="rounded-2xl border border-slate-200 p-5"><div className="flex items-center justify-between"><strong>Default Consumables</strong><span className="rounded-full bg-slate-100 px-2.5 py-1 text-xs font-bold">{form.materials.length}</span></div>{form.materials.length?<div className="mt-3 divide-y divide-slate-100">{form.materials.map((m,index)=>{const item=inventoryMap.get(Number(m.inventory_id));const validItem=isInventoryCompatible(item);const unitPrice=validItem?Number(item?.selling_price||0):0;const lineTotal=unitPrice*Math.max(0,Number(m.quantity||0));return <div key={index} className="grid gap-1 py-3 text-sm sm:grid-cols-[1fr_auto]"><div><p className="font-semibold text-slate-800">{m.material_name||item?.name}</p><p className="text-xs text-slate-400">{m.quantity} unit{Number(m.quantity)===1?'':'s'} × {formatMoney(unitPrice)}</p></div><span className="font-bold text-slate-700">{formatMoney(lineTotal)}</span></div>})}</div>:<p className="mt-3 text-sm text-slate-500">No default consumables.</p>}</div><div className="rounded-2xl border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-800"><MdCheck className="mr-1 inline" /> Total Patient Price = Service Price + Consumable Prices. Consumable stock is deducted when the consultation is completed.</div></div>}
    </section>

    <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-between"><div>{step===1?<button className="button-secondary" onClick={leaveEditor}><MdArrowBack /> Cancel</button>:<button className="button-secondary" disabled={saving} onClick={()=>move(step-1)}>Back</button>}</div><div>{step<3?<button className="button-primary min-w-32" onClick={()=>move(step+1)}>Continue</button>:<button className="button-primary min-w-40" disabled={saving} onClick={save}>{saving?'Saving…':editing?'Save Changes':'Add Service'}</button>}</div></div>
    <ConfirmDialog open={removeOpen} title="Remove or archive service?" message="Unused services are deleted. Services already referenced by a historical bill are archived instead so billing history remains intact." confirmLabel="Continue" loading={deleting} onCancel={()=>!deleting&&setRemoveOpen(false)} onConfirm={remove} />
  </div>
}

export default Admin_BillingServiceForm
