import { useEffect, useMemo, useState } from 'react'
import { useLocation, useNavigate, useParams } from 'react-router-dom'
import { MdAdd, MdArrowBack, MdCheck, MdClose, MdDelete, MdPayments } from 'react-icons/md'
import { createBillingCatalogService, deleteBillingCatalogService, getBillingCatalog, getInventory, getSystemSetup, updateBillingCatalogService } from '../../services/admin.service'
import { useToast } from '../../components/ui/ToastProvider'
import ConfirmDialog from '../../components/ui/ConfirmDialog'
import { LoadingState, ErrorState } from '../../components/ui/PageState'
import { formatMoney } from '../../utils/billingUi'

const CLINIC_TYPES = [{ value: 'medical', label: 'General Medicine' }, { value: 'derma', label: 'Dermatology' }]
const blankMaterial = () => ({ inventory_id: '', material_name: '', quantity: 1, unit_label: '', notes: '' })
const blank = { category_id: '', category: '', service_name: '', clinic_type: 'medical', default_price: '', is_active: 1, materials: [] }
const clinicLabel = (value) => CLINIC_TYPES.find((item) => item.value === value)?.label || value
const toForm = (service) => ({
  category_id: service?.category_id || '', category: service?.category || '', service_name: service?.service_name || '',
  clinic_type: ['medical','derma'].includes(service?.clinic_type) ? service.clinic_type : 'medical',
  default_price: Number(service?.default_price ?? service?.patient_price ?? 0) > 0 ? String(Number(service.default_price ?? service.patient_price)) : '',
  is_active: Number(service?.is_active) === 1 ? 1 : 0,
  materials: Array.isArray(service?.materials) ? service.materials.map((m) => ({ inventory_id: m.inventory_id || '', material_name: m.material_name || m.inventory_name || '', quantity: Number(m.quantity || 1), unit_label: m.unit_label || m.inventory_unit || '', notes: m.notes || '' })) : [],
})

const Admin_BillingServiceForm = () => {
  const { serviceId } = useParams()
  const editing = Boolean(serviceId)
  const navigate = useNavigate()
  const location = useLocation()
  const portalBase = location.pathname.startsWith('/staff') ? '/staff' : '/admin'
  const toast = useToast()
  const [form, setForm] = useState(blank)
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
  const changeClinic = (clinicType) => { setForm((current) => ({ ...current, clinic_type: clinicType, category_id: '', category: '' })); setDirty(true) }
  const changeCategory = (categoryId) => { const category = serviceCategories.find((item) => Number(item.id) === Number(categoryId)); setForm((current) => ({ ...current, category_id: categoryId, category: category?.name || '' })); setDirty(true) }
  const updateMaterial = (index, key, value) => { setForm((current) => ({ ...current, materials: current.materials.map((m, i) => i === index ? { ...m, [key]: value } : m) })); setDirty(true) }
  const chooseInventory = (index, value) => { const item = inventoryMap.get(Number(value)); setForm((current) => ({ ...current, materials: current.materials.map((m, i) => i === index ? { ...m, inventory_id: value, material_name: item?.name || '', unit_label: item?.uom || item?.base_unit || item?.unit || '' } : m) })); setDirty(true) }
  const openCategorySetup = () => { if (dirty && !window.confirm('You have unsaved service changes. Leave this page and manage Service Categories?')) return; navigate(`${portalBase}/system-setup?tab=service_categories`) }

  const payload = () => ({
    category_id: Number(form.category_id) || null, category: String(form.category || '').trim(), service_name: String(form.service_name || '').trim(), clinic_type: form.clinic_type,
    default_price: Number(form.default_price || 0), consultation_fee: 0, profit_percentage: 0, is_active: Number(form.is_active) === 1 ? 1 : 0,
    materials: form.materials.map((m, index) => ({ inventory_id: m.inventory_id || null, material_name: String(m.material_name || '').trim(), quantity: Number(m.quantity || 0), unit_label: String(m.unit_label || '').trim(), unit_cost_override: null, notes: String(m.notes || '').trim(), sort_order: index })).filter((m) => m.inventory_id || m.material_name),
  })

  const validate = (target = 3) => {
    const p = payload(); const next = {}
    if (target === 1 || target === 3) {
      if (!p.category_id) next.category = 'Select a service category.'
      if (!p.service_name) next.service_name = 'Enter a service name.'
      if (!(p.default_price > 0)) next.default_price = 'Service Price is required and must be greater than ₱0.00.'
    }
    if (target === 2 || target === 3) p.materials.forEach((m, i) => {
      if (!m.inventory_id) next[`material_${i}`] = 'Select an inventory item.'
      if (!(m.quantity > 0)) next[`qty_${i}`] = 'Quantity must be greater than zero.'
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

  return <div className="mx-auto max-w-5xl space-y-5">
    <div className="flex flex-wrap items-start justify-between gap-3">
      <div><button className="mb-2 inline-flex items-center gap-1 text-sm font-bold text-slate-500 hover:text-slate-900" onClick={leaveEditor}><MdArrowBack /> Billing Setup</button><h1 className="flex items-center gap-2 text-2xl font-black text-slate-900"><MdPayments className="text-amber-500" /> {editing ? 'Edit Service' : 'Add Service'}</h1><p className="mt-1 text-sm text-slate-500">Configure one Service Price and the inventory quantities normally consumed. Inventory Selling Price is not used as service cost.</p></div>
      {editing && <button className="button-danger" onClick={() => setRemoveOpen(true)}><MdDelete /> Remove Service</button>}
    </div>

    <div className="grid grid-cols-3 gap-2 rounded-2xl bg-slate-100 p-1 text-sm font-bold">
      {['Service Details','Consumables','Review'].map((label,index)=><div key={label} className={`rounded-xl px-3 py-2 text-center ${step===index+1?'bg-white text-slate-900 shadow-sm':'text-slate-500'}`}>{index+1}. {label}</div>)}
    </div>

    <section className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
      {step === 1 && <div className="space-y-5">
        <div><h2 className="text-lg font-black">Service Details</h2><p className="mt-1 text-sm text-slate-500">The Service Price is the amount billed to the patient. No automatic material-cost or markup calculation is performed.</p></div>
        <div className="grid gap-4 sm:grid-cols-2">
          <label><span className="form-label">Clinic *</span><select className="form-control mt-1.5" value={form.clinic_type} onChange={(e)=>changeClinic(e.target.value)}>{CLINIC_TYPES.map((option)=><option key={option.value} value={option.value}>{option.label}</option>)}</select></label>
          <label><span className="form-label">Service Category *</span><select className="form-control mt-1.5" value={form.category_id} onChange={(e)=>changeCategory(e.target.value)}><option value="">Select category</option>{availableCategories.map((option)=><option key={option.id} value={option.id}>{option.name}</option>)}</select>{!availableCategories.length&&<p className="form-helper">No active categories. <button type="button" className="font-bold text-sky-700 underline" onClick={openCategorySetup}>Add one in System Setup</button>.</p>}{errors.category&&<p className="form-error">{errors.category}</p>}</label>
          <label><span className="form-label">Service Name *</span><input className="form-control mt-1.5" maxLength={180} value={form.service_name} onChange={(e)=>update('service_name',e.target.value)} placeholder="e.g. Skin Scraping & KOH Examination" />{errors.service_name&&<p className="form-error">{errors.service_name}</p>}</label>
          <label className="rounded-2xl border-2 border-amber-300 bg-amber-50 p-4"><span className="text-sm font-black text-amber-900">Service Price *</span><input type="number" min="0.01" step="0.01" className="form-control mt-2 bg-white text-lg font-black" value={form.default_price} onChange={(e)=>update('default_price',e.target.value)} /><span className="mt-2 block text-xs text-amber-800">Amount Staff charges for this service at Checkout.</span>{errors.default_price&&<p className="form-error">{errors.default_price}</p>}</label>
        </div>
        <label className="flex items-center gap-3 rounded-2xl bg-slate-50 p-4 text-sm font-bold text-slate-700"><input type="checkbox" checked={Number(form.is_active)===1} onChange={(e)=>update('is_active',e.target.checked?1:0)} /> Active for patient booking and Doctor consultation</label>
      </div>}

      {step === 2 && <div className="space-y-4">
        <div className="flex items-start justify-between gap-4"><div><h2 className="text-lg font-black">Default Consumables</h2><p className="mt-1 text-sm text-slate-500">Consumables describe stock usage only. They do not change the Service Price.</p></div><button className="button-secondary" onClick={()=>update('materials',[...form.materials,blankMaterial()])}><MdAdd /> Add Consumable</button></div>
        {!form.materials.length ? <div className="rounded-2xl border border-dashed border-slate-300 bg-slate-50 p-8 text-center text-sm text-slate-500">No default consumables.</div> : <div className="space-y-3">{form.materials.map((m,index)=>{const item=inventoryMap.get(Number(m.inventory_id)); const decimal=Number(item?.uom_allow_decimal||0)===1; const stepValue=decimal?0.01:1; return <div key={index} className="rounded-2xl border border-slate-200 p-4"><div className="flex justify-between"><strong className="text-xs uppercase tracking-wide text-slate-400">Consumable {index+1}</strong><button className="text-slate-400 hover:text-rose-600" onClick={()=>update('materials',form.materials.filter((_,i)=>i!==index))}><MdClose /></button></div><div className="mt-3 grid gap-3 sm:grid-cols-[1.5fr_1fr]"><label><span className="form-label">Inventory Item *</span><select className="form-control mt-1.5" value={m.inventory_id} onChange={(e)=>chooseInventory(index,e.target.value)}><option value="">Select item</option>{inventory.filter((inv)=>!inv.category||inv.category===form.clinic_type).map((inv)=><option key={inv.id} value={inv.id}>{inv.name} — {inv.uom||inv.unit||'unit'}</option>)}</select>{errors[`material_${index}`]&&<p className="form-error">{errors[`material_${index}`]}</p>}</label><label><span className="form-label">Default Quantity *</span><div className="mt-1.5 flex gap-2"><input type="number" min={stepValue} step={stepValue} className="form-control" value={m.quantity} onChange={(e)=>updateMaterial(index,'quantity',e.target.value)} /><span className="flex min-w-20 items-center justify-center rounded-xl border border-slate-200 bg-slate-50 px-3 text-sm font-bold">{m.unit_label||item?.uom||'unit'}</span></div>{errors[`qty_${index}`]&&<p className="form-error">{errors[`qty_${index}`]}</p>}</label><label className="sm:col-span-2"><span className="form-label">Notes</span><input maxLength={255} className="form-control mt-1.5" value={m.notes} onChange={(e)=>updateMaterial(index,'notes',e.target.value)} placeholder="Optional usage note" /></label></div></div>})}</div>}
      </div>}

      {step === 3 && <div className="space-y-4"><div><h2 className="text-lg font-black">Review Service</h2><p className="mt-1 text-sm text-slate-500">Confirm the billing price and expected consumables.</p></div><div className="rounded-2xl border border-slate-200 p-5"><h3 className="text-xl font-black">{form.service_name||'Unnamed Service'}</h3><p className="mt-1 text-sm text-slate-500">{form.category||'No category'} · {clinicLabel(form.clinic_type)} · {Number(form.is_active)===1?'Active':'Inactive'}</p><div className="mt-4 rounded-2xl bg-amber-50 p-4"><p className="text-xs font-bold uppercase text-amber-700">Service Price</p><p className="mt-2 text-2xl font-black text-amber-900">{formatMoney(form.default_price)}</p></div></div><div className="rounded-2xl border border-slate-200 p-5"><div className="flex items-center justify-between"><strong>Default Consumables</strong><span className="rounded-full bg-slate-100 px-2.5 py-1 text-xs font-bold">{form.materials.length}</span></div>{form.materials.length?<div className="mt-3 divide-y divide-slate-100">{form.materials.map((m,index)=><div key={index} className="flex justify-between gap-4 py-2 text-sm"><span>{m.material_name||inventoryMap.get(Number(m.inventory_id))?.name}</span><span className="text-slate-500">{m.quantity} {m.unit_label}</span></div>)}</div>:<p className="mt-3 text-sm text-slate-500">No default consumables.</p>}</div><div className="rounded-2xl border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-800"><MdCheck className="mr-1 inline" /> Doctors record actual consumable usage. Staff bills only the configured Service Price.</div></div>}
    </section>

    <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-between"><div>{step===1?<button className="button-secondary" onClick={leaveEditor}><MdArrowBack /> Cancel</button>:<button className="button-secondary" disabled={saving} onClick={()=>move(step-1)}>Back</button>}</div><div>{step<3?<button className="button-primary min-w-32" onClick={()=>move(step+1)}>Continue</button>:<button className="button-primary min-w-40" disabled={saving} onClick={save}>{saving?'Saving…':editing?'Save Changes':'Add Service'}</button>}</div></div>
    <ConfirmDialog open={removeOpen} title="Remove or archive service?" message="Unused services are deleted. Services already referenced by a historical bill are archived instead so billing history remains intact." confirmLabel="Continue" loading={deleting} onCancel={()=>!deleting&&setRemoveOpen(false)} onConfirm={remove} />
  </div>
}

export default Admin_BillingServiceForm
