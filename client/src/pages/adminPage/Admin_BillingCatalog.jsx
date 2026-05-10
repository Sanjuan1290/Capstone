import { useEffect, useMemo, useState } from 'react'
import {
  createBillingCatalogService,
  deleteBillingCatalogService,
  getBillingCatalog,
  getInventory,
  updateBillingCatalogService,
} from '../../services/admin.service'
import {
  MdAdd,
  MdBuild,
  MdCheck,
  MdClose,
  MdDelete,
  MdEdit,
  MdInventory2,
  MdPayments,
  MdRefresh,
  MdSearch,
} from 'react-icons/md'

const CLINIC_TYPES = [
  { value: 'all', label: 'All Clinics' },
  { value: 'medical', label: 'General Medicine' },
  { value: 'derma', label: 'Dermatology' },
]

const roundMoney = (value) => Math.round((Number(value) || 0) * 100) / 100

const formatMoney = (value) => new Intl.NumberFormat('en-PH', {
  style: 'currency',
  currency: 'PHP',
}).format(Number(value) || 0)

const makeBlankMaterial = () => ({
  inventory_id: '',
  material_name: '',
  quantity: 1,
  unit_label: '',
  unit_cost_override: '',
  notes: '',
})

const BLANK_FORM = {
  category: '',
  service_name: '',
  clinic_type: 'all',
  profit_percentage: 20,
  is_active: 1,
  materials: [makeBlankMaterial()],
}

const clinicLabel = (value) => (
  CLINIC_TYPES.find((item) => item.value === value)?.label || value
)

const computeMaterialPreview = (materials, inventoryMap) => {
  const materialsCost = roundMoney((materials || []).reduce((sum, material) => {
    const inventoryItem = inventoryMap.get(Number(material.inventory_id) || 0)
    const unitCost = material.unit_cost_override !== '' && material.unit_cost_override !== null && material.unit_cost_override !== undefined
      ? Number(material.unit_cost_override) || 0
      : Number(inventoryItem?.price) || 0
    return sum + roundMoney((Number(material.quantity) || 0) * unitCost)
  }, 0))
  return materialsCost
}

const Admin_BillingCatalog = () => {
  const [services, setServices] = useState([])
  const [inventoryItems, setInventoryItems] = useState([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [deletingId, setDeletingId] = useState(null)
  const [editingId, setEditingId] = useState(null)
  const [search, setSearch] = useState('')
  const [filter, setFilter] = useState('all')
  const [form, setForm] = useState(BLANK_FORM)

  const inventoryMap = useMemo(
    () => new Map((inventoryItems || []).map((item) => [Number(item.id), item])),
    [inventoryItems]
  )

  const loadData = async () => {
    setLoading(true)
    try {
      const [catalogRows, inventoryRows] = await Promise.all([
        getBillingCatalog({ includeInactive: true }),
        getInventory(),
      ])
      setServices(Array.isArray(catalogRows) ? catalogRows : [])
      setInventoryItems(Array.isArray(inventoryRows) ? inventoryRows : [])
    } catch (err) {
      alert(err.message || 'Failed to load billing catalog.')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    loadData()
  }, [])

  const filteredServices = useMemo(() => {
    const query = search.trim().toLowerCase()
    return services.filter((service) => {
      const matchesFilter = filter === 'all' ? true : service.clinic_type === filter
      const haystack = [
        service.category,
        service.service_name,
        clinicLabel(service.clinic_type),
      ].join(' ').toLowerCase()
      const matchesSearch = !query || haystack.includes(query)
      return matchesFilter && matchesSearch
    })
  }, [filter, search, services])

  const activeCount = services.filter((service) => Number(service.is_active) === 1).length
  const totalMaterials = services.reduce((sum, service) => sum + (service.materials?.length || 0), 0)

  const resetForm = () => {
    setForm(BLANK_FORM)
    setEditingId(null)
  }

  const startEdit = (service) => {
    setEditingId(service.id)
    setForm({
      category: service.category || '',
      service_name: service.service_name || '',
      clinic_type: service.clinic_type || 'all',
      profit_percentage: Number(service.profit_percentage) || 20,
      is_active: Number(service.is_active) === 1 ? 1 : 0,
      materials: Array.isArray(service.materials) && service.materials.length > 0
        ? service.materials.map((material) => ({
          inventory_id: material.inventory_id || '',
          material_name: material.material_name || material.inventory_name || '',
          quantity: Number(material.quantity) || 1,
          unit_label: material.unit_label || material.inventory_unit || '',
          unit_cost_override: material.unit_cost_override ?? '',
          notes: material.notes || '',
        }))
        : [makeBlankMaterial()],
    })
  }

  const updateMaterial = (index, field, value) => {
    setForm((current) => ({
      ...current,
      materials: current.materials.map((material, materialIndex) => (
        materialIndex === index ? { ...material, [field]: value } : material
      )),
    }))
  }

  const handleInventorySelect = (index, rawInventoryId) => {
    const inventoryId = Number(rawInventoryId) || 0
    const inventoryItem = inventoryMap.get(inventoryId)
    setForm((current) => ({
      ...current,
      materials: current.materials.map((material, materialIndex) => (
        materialIndex === index
          ? {
              ...material,
              inventory_id: inventoryId || '',
              material_name: inventoryItem?.name || material.material_name,
              unit_label: inventoryItem?.unit || material.unit_label,
            }
          : material
      )),
    }))
  }

  const addMaterial = () => {
    setForm((current) => ({
      ...current,
      materials: [...current.materials, makeBlankMaterial()],
    }))
  }

  const removeMaterial = (index) => {
    setForm((current) => ({
      ...current,
      materials: current.materials.length === 1
        ? [makeBlankMaterial()]
        : current.materials.filter((_, materialIndex) => materialIndex !== index),
    }))
  }

  const previewMaterialsCost = computeMaterialPreview(form.materials, inventoryMap)
  const previewProfitAmount = roundMoney(previewMaterialsCost * ((Number(form.profit_percentage) || 0) / 100))
  const previewSuggestedPrice = roundMoney(previewMaterialsCost + previewProfitAmount)

  const handleSubmit = async () => {
    const payload = {
      category: form.category.trim(),
      service_name: form.service_name.trim(),
      clinic_type: form.clinic_type,
      profit_percentage: Number(form.profit_percentage) || 20,
      is_active: Number(form.is_active) === 1 ? 1 : 0,
      materials: form.materials
        .map((material, index) => ({
          inventory_id: material.inventory_id || null,
          material_name: String(material.material_name || '').trim(),
          quantity: Number(material.quantity) || 0,
          unit_label: String(material.unit_label || '').trim(),
          unit_cost_override: material.unit_cost_override === '' ? null : Number(material.unit_cost_override) || 0,
          notes: String(material.notes || '').trim(),
          sort_order: index,
        }))
        .filter((material) => material.material_name && material.quantity > 0),
    }

    if (!payload.category || !payload.service_name) {
      alert('Category and service name are required.')
      return
    }

    setSaving(true)
    try {
      const saved = editingId
        ? await updateBillingCatalogService(editingId, payload)
        : await createBillingCatalogService(payload)

      setServices((current) => {
        const next = editingId
          ? current.map((service) => (service.id === saved.id ? saved : service))
          : [...current, saved]
        return next.sort((a, b) => {
          const categoryCompare = String(a.category || '').localeCompare(String(b.category || ''))
          if (categoryCompare !== 0) return categoryCompare
          return String(a.service_name || '').localeCompare(String(b.service_name || ''))
        })
      })
      resetForm()
    } catch (err) {
      alert(err.message || 'Failed to save billing service.')
    } finally {
      setSaving(false)
    }
  }

  const handleDelete = async (serviceId) => {
    if (!window.confirm('Remove this billing service from the catalog?')) return
    setDeletingId(serviceId)
    try {
      await deleteBillingCatalogService(serviceId)
      setServices((current) => current.filter((service) => service.id !== serviceId))
      if (editingId === serviceId) resetForm()
    } catch (err) {
      alert(err.message || 'Failed to delete billing service.')
    } finally {
      setDeletingId(null)
    }
  }

  return (
    <div className="max-w-7xl space-y-5">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-xl lg:text-2xl font-bold text-slate-800 flex items-center gap-2">
            <MdPayments className="text-amber-500 text-[22px]" /> Billing Service Catalog
          </h1>
          <p className="text-xs lg:text-sm text-slate-500 mt-0.5">
            Define billable services, required materials, and automatic profit-based pricing for staff billing.
          </p>
        </div>
        <button
          onClick={loadData}
          className="flex items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-semibold text-slate-600 hover:bg-slate-50 transition-colors"
        >
          <MdRefresh className="text-[16px]" /> Refresh
        </button>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        {[
          { label: 'Services', value: services.length, tone: 'text-sky-600 bg-sky-50 border-sky-200' },
          { label: 'Active', value: activeCount, tone: 'text-emerald-600 bg-emerald-50 border-emerald-200' },
          { label: 'Materials Linked', value: totalMaterials, tone: 'text-violet-600 bg-violet-50 border-violet-200' },
          { label: 'Visible Items', value: filteredServices.length, tone: 'text-amber-600 bg-amber-50 border-amber-200' },
        ].map((card) => (
          <div key={card.label} className={`rounded-2xl border p-4 shadow-sm ${card.tone}`}>
            <p className="text-[11px] font-bold uppercase tracking-widest opacity-80">{card.label}</p>
            <p className="mt-2 text-2xl font-black">{card.value}</p>
          </div>
        ))}
      </div>

      <div className="grid gap-5 xl:grid-cols-[430px_minmax(0,1fr)]">
        <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm space-y-4">
          <div>
            <h2 className="text-sm font-bold text-slate-800 flex items-center gap-2">
              {editingId ? <MdEdit className="text-amber-500" /> : <MdAdd className="text-amber-500" />}
              {editingId ? 'Edit Billing Service' : 'Add Billing Service'}
            </h2>
            <p className="text-xs text-slate-500 mt-1">
              Service price is computed from required materials plus the configured profit percentage.
            </p>
          </div>

          <div className="grid gap-3 md:grid-cols-2">
            <div>
              <label className="text-[11px] font-bold text-slate-500 uppercase tracking-widest mb-1.5 block">Category</label>
              <input
                type="text"
                value={form.category}
                onChange={(e) => setForm((current) => ({ ...current, category: e.target.value }))}
                placeholder="e.g. Dermatologic Services"
                className="w-full text-sm bg-slate-50 border-2 border-slate-200 rounded-xl px-3 py-2.5 focus:outline-none focus:border-amber-400 transition-colors"
              />
            </div>

            <div>
              <label className="text-[11px] font-bold text-slate-500 uppercase tracking-widest mb-1.5 block">Clinic Type</label>
              <select
                value={form.clinic_type}
                onChange={(e) => setForm((current) => ({ ...current, clinic_type: e.target.value }))}
                className="w-full text-sm bg-slate-50 border-2 border-slate-200 rounded-xl px-3 py-2.5 focus:outline-none focus:border-amber-400 transition-colors"
              >
                {CLINIC_TYPES.map((option) => (
                  <option key={option.value} value={option.value}>{option.label}</option>
                ))}
              </select>
            </div>
          </div>

          <div className="grid gap-3 md:grid-cols-2">
            <div>
              <label className="text-[11px] font-bold text-slate-500 uppercase tracking-widest mb-1.5 block">Service Name</label>
              <input
                type="text"
                value={form.service_name}
                onChange={(e) => setForm((current) => ({ ...current, service_name: e.target.value }))}
                placeholder="e.g. Chemical Peeling"
                className="w-full text-sm bg-slate-50 border-2 border-slate-200 rounded-xl px-3 py-2.5 focus:outline-none focus:border-amber-400 transition-colors"
              />
            </div>

            <div>
              <label className="text-[11px] font-bold text-slate-500 uppercase tracking-widest mb-1.5 block">Profit %</label>
              <input
                type="number"
                min="0"
                step="0.01"
                value={form.profit_percentage}
                onChange={(e) => setForm((current) => ({ ...current, profit_percentage: e.target.value }))}
                className="w-full text-sm bg-slate-50 border-2 border-slate-200 rounded-xl px-3 py-2.5 focus:outline-none focus:border-amber-400 transition-colors"
              />
            </div>
          </div>

          <div>
            <label className="text-[11px] font-bold text-slate-500 uppercase tracking-widest mb-2 block">Visibility</label>
            <div className="flex gap-2">
              {[
                { value: 1, label: 'Active' },
                { value: 0, label: 'Inactive' },
              ].map((option) => (
                <button
                  key={option.label}
                  onClick={() => setForm((current) => ({ ...current, is_active: option.value }))}
                  className={`flex-1 rounded-xl border px-3 py-2.5 text-xs font-bold transition-colors ${
                    Number(form.is_active) === option.value
                      ? option.value === 1
                        ? 'border-emerald-200 bg-emerald-50 text-emerald-700'
                        : 'border-slate-300 bg-slate-100 text-slate-700'
                      : 'border-slate-200 bg-white text-slate-500 hover:bg-slate-50'
                  }`}
                >
                  {option.label}
                </button>
              ))}
            </div>
          </div>

          <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
            <div className="flex items-start justify-between gap-3">
              <div>
                <h3 className="text-sm font-bold text-slate-800 flex items-center gap-2">
                  <MdBuild className="text-[17px] text-violet-500" /> Required Materials
                </h3>
                <p className="text-xs text-slate-500 mt-1">
                  Leave the cost override blank to use the current inventory price automatically.
                </p>
              </div>
              <button
                onClick={addMaterial}
                className="flex items-center gap-1 rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-bold text-slate-600 hover:bg-slate-50"
              >
                <MdAdd className="text-[14px]" /> Material
              </button>
            </div>

            <div className="mt-4 space-y-3">
              {form.materials.map((material, index) => (
                <div key={index} className="rounded-2xl border border-slate-200 bg-white p-4">
                  <div className="flex items-start justify-between gap-3">
                    <p className="text-xs font-bold uppercase tracking-widest text-slate-400">Material {index + 1}</p>
                    <button
                      onClick={() => removeMaterial(index)}
                      className="rounded-lg p-1 text-slate-300 hover:bg-red-50 hover:text-red-500"
                    >
                      <MdClose className="text-[16px]" />
                    </button>
                  </div>

                  <div className="mt-3 grid gap-3 md:grid-cols-2">
                    <select
                      value={material.inventory_id}
                      onChange={(e) => handleInventorySelect(index, e.target.value)}
                      className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 text-sm focus:outline-none focus:border-amber-400"
                    >
                      <option value="">Select inventory item</option>
                      {inventoryItems.map((inventoryItem) => (
                        <option key={inventoryItem.id} value={inventoryItem.id}>
                          {inventoryItem.category} - {inventoryItem.name}
                        </option>
                      ))}
                    </select>

                    <input
                      type="text"
                      value={material.material_name}
                      onChange={(e) => updateMaterial(index, 'material_name', e.target.value)}
                      placeholder="Material name"
                      className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 text-sm focus:outline-none focus:border-amber-400"
                    />

                    <input
                      type="number"
                      min="0"
                      step="0.01"
                      value={material.quantity}
                      onChange={(e) => updateMaterial(index, 'quantity', e.target.value)}
                      placeholder="Quantity"
                      className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 text-sm focus:outline-none focus:border-amber-400"
                    />

                    <input
                      type="text"
                      value={material.unit_label}
                      onChange={(e) => updateMaterial(index, 'unit_label', e.target.value)}
                      placeholder="Unit"
                      className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 text-sm focus:outline-none focus:border-amber-400"
                    />

                    <input
                      type="number"
                      min="0"
                      step="0.01"
                      value={material.unit_cost_override}
                      onChange={(e) => updateMaterial(index, 'unit_cost_override', e.target.value)}
                      placeholder="Cost override (optional)"
                      className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 text-sm focus:outline-none focus:border-amber-400"
                    />

                    <input
                      type="text"
                      value={material.notes}
                      onChange={(e) => updateMaterial(index, 'notes', e.target.value)}
                      placeholder="Notes (optional)"
                      className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 text-sm focus:outline-none focus:border-amber-400"
                    />
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div className="rounded-2xl border border-sky-200 bg-sky-50 p-4">
            <p className="text-[11px] font-bold uppercase tracking-widest text-sky-600">Price Preview</p>
            <div className="mt-3 space-y-2 text-sm">
              <div className="flex items-center justify-between text-slate-600">
                <span>Materials Cost</span>
                <span>{formatMoney(previewMaterialsCost)}</span>
              </div>
              <div className="flex items-center justify-between text-slate-600">
                <span>Profit</span>
                <span>{formatMoney(previewProfitAmount)}</span>
              </div>
              <div className="flex items-center justify-between border-t border-sky-100 pt-2 text-base font-black text-slate-800">
                <span>Suggested Service Price</span>
                <span>{formatMoney(previewSuggestedPrice)}</span>
              </div>
            </div>
          </div>

          <div className="flex gap-3 pt-2">
            {editingId && (
              <button
                onClick={resetForm}
                className="flex-1 py-3 text-sm font-semibold text-slate-600 border border-slate-200 rounded-2xl hover:bg-slate-50"
              >
                Cancel Edit
              </button>
            )}
            <button
              onClick={handleSubmit}
              disabled={saving}
              className="flex-1 py-3 text-sm font-bold text-white bg-amber-500 hover:bg-amber-600 disabled:opacity-50 rounded-2xl transition-colors"
            >
              {saving ? 'Saving...' : editingId ? 'Save Changes' : 'Add Service'}
            </button>
          </div>
        </div>

        <div className="rounded-2xl border border-slate-200 bg-white shadow-sm overflow-hidden">
          <div className="px-5 py-4 border-b border-slate-100 space-y-3">
            <div className="flex flex-wrap gap-2">
              {CLINIC_TYPES.map((option) => (
                <button
                  key={option.value}
                  onClick={() => setFilter(option.value)}
                  className={`rounded-xl px-3 py-2 text-xs font-bold transition-colors ${
                    filter === option.value
                      ? 'bg-amber-500 text-white'
                      : 'bg-slate-100 text-slate-500 hover:bg-slate-200'
                  }`}
                >
                  {option.label}
                </button>
              ))}
            </div>

            <div className="relative">
              <MdSearch className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 text-[18px]" />
              <input
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search service or category..."
                className="w-full rounded-2xl border border-slate-200 bg-slate-50 py-3 pl-10 pr-10 text-sm text-slate-700 focus:outline-none focus:border-amber-400 focus:ring-2 focus:ring-amber-400/10"
              />
              {search && (
                <button
                  onClick={() => setSearch('')}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
                >
                  <MdClose className="text-[16px]" />
                </button>
              )}
            </div>
          </div>

          {loading ? (
            <div className="flex items-center justify-center py-20">
              <div className="w-8 h-8 border-4 border-slate-200 border-t-amber-500 rounded-full animate-spin" />
            </div>
          ) : filteredServices.length === 0 ? (
            <div className="flex flex-col items-center py-16 text-center px-6">
              <MdPayments className="text-slate-200 text-[34px] mb-3" />
              <p className="text-sm font-semibold text-slate-500">No billing services found</p>
              <p className="text-xs text-slate-400 mt-1">
                Add a service or adjust the current filter.
              </p>
            </div>
          ) : (
            <div className="divide-y divide-slate-100">
              {filteredServices.map((service) => (
                <div key={service.id} className="px-5 py-4">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2 flex-wrap">
                        <p className="text-sm font-bold text-slate-800">{service.service_name}</p>
                        <span className={`text-[10px] font-bold border px-2 py-0.5 rounded-full ${
                          Number(service.is_active) === 1
                            ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                            : 'bg-slate-100 text-slate-500 border-slate-200'
                        }`}>
                          {Number(service.is_active) === 1 ? 'Active' : 'Inactive'}
                        </span>
                      </div>
                      <div className="mt-1 flex flex-wrap items-center gap-3 text-[11px] text-slate-400">
                        <span>{service.category}</span>
                        <span>{clinicLabel(service.clinic_type)}</span>
                        <span>{service.materials?.length || 0} materials</span>
                      </div>

                      <div className="mt-3 grid gap-2 sm:grid-cols-3">
                        <div className="rounded-xl border border-slate-100 bg-slate-50 px-3 py-2.5">
                          <p className="text-[10px] font-bold uppercase tracking-widest text-slate-400">Materials</p>
                          <p className="mt-1 text-sm font-black text-slate-700">{formatMoney(service.materials_cost)}</p>
                        </div>
                        <div className="rounded-xl border border-slate-100 bg-slate-50 px-3 py-2.5">
                          <p className="text-[10px] font-bold uppercase tracking-widest text-slate-400">Profit</p>
                          <p className="mt-1 text-sm font-black text-slate-700">{formatMoney(service.profit_amount)}</p>
                        </div>
                        <div className="rounded-xl border border-slate-100 bg-slate-50 px-3 py-2.5">
                          <p className="text-[10px] font-bold uppercase tracking-widest text-slate-400">Service Price</p>
                          <p className="mt-1 text-sm font-black text-slate-800">{formatMoney(service.suggested_price)}</p>
                        </div>
                      </div>

                      {service.materials?.length > 0 && (
                        <div className="mt-3 flex flex-wrap gap-2">
                          {service.materials.map((material) => (
                            <span key={`${service.id}-${material.id || material.material_name}`} className="rounded-full bg-slate-100 px-2.5 py-1 text-[11px] text-slate-500">
                              {material.material_name} x{material.quantity}
                            </span>
                          ))}
                        </div>
                      )}
                    </div>

                    <div className="flex items-center gap-2 shrink-0">
                      <button
                        onClick={() => startEdit(service)}
                        className="rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-xs font-bold text-amber-700 hover:bg-amber-100 transition-colors"
                      >
                        <span className="flex items-center gap-1"><MdEdit className="text-[13px]" /> Edit</span>
                      </button>
                      <button
                        onClick={() => handleDelete(service.id)}
                        disabled={deletingId === service.id}
                        className="rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-xs font-bold text-red-600 hover:bg-red-100 disabled:opacity-50 transition-colors"
                      >
                        <span className="flex items-center gap-1">
                          <MdDelete className="text-[13px]" />
                          {deletingId === service.id ? 'Removing...' : 'Remove'}
                        </span>
                      </button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <div className="flex items-start gap-3">
          <div className="w-10 h-10 rounded-xl bg-amber-50 border border-amber-200 flex items-center justify-center shrink-0">
            <MdCheck className="text-amber-600 text-[18px]" />
          </div>
          <div>
            <p className="text-sm font-bold text-slate-800">How this affects staff billing</p>
            <p className="text-xs text-slate-500 mt-1 leading-relaxed">
              Staff can pick these services from a dropdown, see the required materials, and use the automatically computed price.
              They can still add extra medicines, supplies, or custom items on top of the selected service when needed.
            </p>
          </div>
        </div>
      </div>
    </div>
  )
}

export default Admin_BillingCatalog
