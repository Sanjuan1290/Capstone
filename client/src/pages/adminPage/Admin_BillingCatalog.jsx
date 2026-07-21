import { useEffect, useMemo, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  createBillingCatalogService,
  deleteBillingCatalogService,
  getBillingCatalog,
  getBillingPaymentSettings,
  getInventory,
  updateBillingCatalogService,
  updateBillingPaymentSettings,
} from '../../services/admin.service'
import {
  MdAdd,
  MdBuild,
  MdCheck,
  MdClose,
  MdDelete,
  MdEdit,
  MdPayments,
  MdRefresh,
  MdSearch,
} from 'react-icons/md'
import { useToast } from '../../components/ui/ToastProvider'
import Pagination from '../../components/ui/Pagination'
import ConfirmDialog from '../../components/ui/ConfirmDialog'
import Modal from '../../components/ui/Modal'
import { EmptyState, ErrorState, LoadingState } from '../../components/ui/PageState'

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
  consultation_fee: 0,
  profit_percentage: 20,
  is_active: 1,
  materials: [makeBlankMaterial()],
}

const clinicLabel = (value) => CLINIC_TYPES.find((item) => item.value === value)?.label || value

const computeMaterialPreview = (materials, inventoryMap) => (
  roundMoney((materials || []).reduce((sum, material) => {
    const inventoryItem = inventoryMap.get(Number(material.inventory_id) || 0)
    const unitCost = material.unit_cost_override !== '' && material.unit_cost_override !== null && material.unit_cost_override !== undefined
      ? Number(material.unit_cost_override) || 0
      : Number(inventoryItem?.price) || 0
    return sum + roundMoney((Number(material.quantity) || 0) * unitCost)
  }, 0))
)

const serviceToForm = (service) => ({
  category: service?.category || '',
  service_name: service?.service_name || '',
  clinic_type: service?.clinic_type || 'all',
  consultation_fee: Number(service?.consultation_fee) || 0,
  profit_percentage: Number(service?.profit_percentage) || 20,
  is_active: Number(service?.is_active) === 1 ? 1 : 0,
  materials: Array.isArray(service?.materials) && service.materials.length > 0
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

const Admin_BillingCatalog = () => {
  const queryClient = useQueryClient()
  const toast = useToast()
  const [deletingId, setDeletingId] = useState(null)
  const [deleteCandidate, setDeleteCandidate] = useState(null)
  const [formErrors, setFormErrors] = useState({})
  const [editingId, setEditingId] = useState(null)
  const [selectedService, setSelectedService] = useState(null)
  const [modalOpen, setModalOpen] = useState(false)
  const [paymentSetupOpen, setPaymentSetupOpen] = useState(false)
  const [paymentForm, setPaymentForm] = useState({ gcash_qr_url: '', maya_qr_url: '', bank_name: '', bank_account_name: '', bank_account_number: '' })
  const [search, setSearch] = useState('')
  const [filter, setFilter] = useState('all')
  const [page, setPage] = useState(1)
  const [pageSize, setPageSize] = useState(10)
  const [form, setForm] = useState(BLANK_FORM)
  const catalogQueryKey = ['admin', 'billingCatalog', { includeInactive: true }]
  const inventoryQueryKey = ['admin', 'inventory']

  const catalogQuery = useQuery({
    queryKey: catalogQueryKey,
    queryFn: () => getBillingCatalog({ includeInactive: true }),
    staleTime: 2 * 60 * 1000,
  })

  const inventoryQuery = useQuery({
    queryKey: inventoryQueryKey,
    queryFn: getInventory,
    staleTime: 5 * 60 * 1000,
  })

  const paymentSettingsQuery = useQuery({
    queryKey: ['admin', 'billingPaymentSettings'],
    queryFn: getBillingPaymentSettings,
    staleTime: 5 * 60 * 1000,
  })

  const services = Array.isArray(catalogQuery.data) ? catalogQuery.data : []
  const inventoryItems = Array.isArray(inventoryQuery.data) ? inventoryQuery.data : []
  const loading = catalogQuery.isPending || inventoryQuery.isPending
  const loadError = catalogQuery.error || inventoryQuery.error

  const inventoryMap = useMemo(
    () => new Map((inventoryItems || []).map((item) => [Number(item.id), item])),
    [inventoryItems]
  )

  const refreshData = () => {
    queryClient.invalidateQueries({ queryKey: catalogQueryKey })
    queryClient.invalidateQueries({ queryKey: inventoryQueryKey })
  }

  const filteredServices = useMemo(() => {
    const query = search.trim().toLowerCase()
    return services.filter((service) => {
      const matchesFilter = filter === 'all' ? true : service.clinic_type === filter
      const haystack = [service.category, service.service_name, clinicLabel(service.clinic_type)].join(' ').toLowerCase()
      return matchesFilter && (!query || haystack.includes(query))
    })
  }, [filter, search, services])

  const totalPages = Math.max(1, Math.ceil(filteredServices.length / pageSize))
  const pagedServices = filteredServices.slice((page - 1) * pageSize, page * pageSize)
  const activeCount = services.filter((service) => Number(service.is_active) === 1).length
  const totalMaterials = services.reduce((sum, service) => sum + (service.materials?.length || 0), 0)

  useEffect(() => {
    setPage(1)
  }, [filter, search])

  useEffect(() => {
    if (!paymentSettingsQuery.data) return
    setPaymentForm({
      gcash_qr_url: paymentSettingsQuery.data.gcash_qr_url || '',
      maya_qr_url: paymentSettingsQuery.data.maya_qr_url || '',
      bank_name: paymentSettingsQuery.data.bank_name || '',
      bank_account_name: paymentSettingsQuery.data.bank_account_name || '',
      bank_account_number: paymentSettingsQuery.data.bank_account_number || '',
    })
  }, [paymentSettingsQuery.data])

  const openAddModal = () => {
    setEditingId(null)
    setSelectedService(null)
    setFormErrors({})
    setForm({ ...BLANK_FORM, materials: [makeBlankMaterial()] })
    setModalOpen(true)
  }

  const openServiceModal = (service) => {
    setFormErrors({})
    setEditingId(service.id)
    setSelectedService(service)
    setForm(serviceToForm(service))
    setModalOpen(true)
  }

  const closeModal = (force = false) => {
    if (saveMutation.isPending && !force) return
    setFormErrors({})
    setModalOpen(false)
    setEditingId(null)
    setSelectedService(null)
    setForm({ ...BLANK_FORM, materials: [makeBlankMaterial()] })
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
    setForm((current) => ({ ...current, materials: [...current.materials, makeBlankMaterial()] }))
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
  const previewConsultationFee = Math.max(0, Number(form.consultation_fee) || 0)
  const previewBase = roundMoney(previewMaterialsCost + previewConsultationFee)
  const previewProfitAmount = roundMoney(previewBase * ((Number(form.profit_percentage) || 0) / 100))
  const previewSuggestedPrice = roundMoney(previewBase + previewProfitAmount)

  const paymentSettingsMutation = useMutation({
    mutationFn: updateBillingPaymentSettings,
    onSuccess: (saved) => {
      queryClient.setQueryData(['admin', 'billingPaymentSettings'], saved)
      toast.success('Payment setup saved.')
      setPaymentSetupOpen(false)
    },
    onError: (error) => toast.error(error.message || 'Payment setup could not be saved.'),
  })

  const saveMutation = useMutation({
    mutationFn: ({ id, payload }) => id
      ? updateBillingCatalogService(id, payload)
      : createBillingCatalogService(payload),
    onSuccess: (saved, variables) => {
      queryClient.setQueryData(catalogQueryKey, (current = []) => {
        const list = Array.isArray(current) ? current : []
        const next = variables.id
          ? list.map((service) => Number(service.id) === Number(saved.id) ? saved : service)
          : [...list, saved]
        return next.sort((a, b) => {
          const categoryCompare = String(a.category || '').localeCompare(String(b.category || ''))
          return categoryCompare || String(a.service_name || '').localeCompare(String(b.service_name || ''))
        })
      })
      toast.success(variables.id ? 'Billing service updated.' : 'Billing service added.')
      closeModal(true)
    },
    onError: (error) => toast.error(error.message || 'Billing service could not be saved.'),
  })

  const deleteMutation = useMutation({
    mutationFn: deleteBillingCatalogService,
    onSuccess: (_, serviceId) => {
      queryClient.setQueryData(catalogQueryKey, (current = []) => (
        Array.isArray(current) ? current.filter((service) => Number(service.id) !== Number(serviceId)) : []
      ))
      toast.success('Billing service removed.')
      setDeleteCandidate(null)
      if (Number(editingId) === Number(serviceId)) closeModal()
    },
    onError: (error) => toast.error(error.message || 'Billing service could not be removed.'),
    onSettled: () => setDeletingId(null),
  })

  const validateForm = (payload) => {
    const errors = {}
    if (!payload.category) errors.category = 'Enter a category.'
    if (!payload.service_name) errors.service_name = 'Enter a service name.'
    if (payload.consultation_fee < 0) errors.consultation_fee = 'The service fee cannot be negative.'
    if (payload.profit_percentage < 0 || payload.profit_percentage > 1000) errors.profit_percentage = 'Enter a percentage from 0 to 1,000.'
    payload.materials.forEach((material, index) => {
      if (!material.material_name) errors[`material_name_${index}`] = 'Enter a material name.'
      if (!(material.quantity > 0)) errors[`material_quantity_${index}`] = 'Quantity must be greater than zero.'
      if (material.unit_cost_override !== null && material.unit_cost_override < 0) errors[`material_cost_${index}`] = 'Cost cannot be negative.'
    })
    setFormErrors(errors)
    return Object.keys(errors).length === 0
  }

  const handleSubmit = async () => {
    const payload = {
      category: form.category.trim(),
      service_name: form.service_name.trim(),
      clinic_type: form.clinic_type,
      consultation_fee: Number(form.consultation_fee),
      profit_percentage: Number(form.profit_percentage),
      is_active: Number(form.is_active) === 1 ? 1 : 0,
      materials: form.materials
        .map((material, index) => ({
          inventory_id: material.inventory_id || null,
          material_name: String(material.material_name || '').trim(),
          quantity: Number(material.quantity),
          unit_label: String(material.unit_label || '').trim(),
          unit_cost_override: material.unit_cost_override === '' ? null : Number(material.unit_cost_override),
          notes: String(material.notes || '').trim(),
          sort_order: index,
        }))
        .filter((material) => material.material_name || material.inventory_id),
    }

    if (!validateForm(payload)) {
      toast.warning('Check the highlighted billing service fields.')
      return
    }

    await saveMutation.mutateAsync({ id: editingId, payload }).catch(() => {})
  }

  const handleDelete = (serviceId) => {
    const service = services.find((entry) => Number(entry.id) === Number(serviceId))
    setDeleteCandidate(service || { id: serviceId, service_name: 'this service' })
  }

  const confirmDelete = async () => {
    if (!deleteCandidate?.id) return
    setDeletingId(deleteCandidate.id)
    await deleteMutation.mutateAsync(deleteCandidate.id).catch(() => {})
  }

  const saving = saveMutation.isPending

  return (
    <div className="mx-auto max-w-7xl space-y-5">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-xl lg:text-2xl font-bold text-slate-800 flex items-center gap-2">
            <MdPayments className="text-amber-500 text-[22px]" /> Billing Service Catalog
          </h1>
          <p className="text-xs lg:text-sm text-slate-500 mt-0.5">
            Maintain service fees, required materials, and the prices staff use for billing.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button
            onClick={refreshData}
            className="flex items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-semibold text-slate-600 hover:bg-slate-50 transition-colors"
          >
            <MdRefresh className="text-[16px]" /> Refresh
          </button>
          <button
            onClick={() => setPaymentSetupOpen(true)}
            className="button-secondary"
          >
            <MdPayments className="text-[16px]" /> Payment Setup
          </button>
          <button
            onClick={openAddModal}
            className="flex items-center gap-1.5 rounded-xl bg-amber-500 px-4 py-2.5 text-sm font-bold text-white hover:bg-amber-600 transition-colors"
          >
            <MdAdd className="text-[16px]" /> Add Service
          </button>
        </div>
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
          <LoadingState label="Loading billing services and inventory..." />
        ) : loadError ? (
          <ErrorState message={loadError.message || 'Billing services could not be loaded.'} onRetry={refreshData} />
        ) : filteredServices.length === 0 ? (
          <EmptyState title="No billing services found" description="Add a service or adjust the search and clinic filter." />
        ) : (
          <>
            <div className="divide-y divide-slate-100">
              {pagedServices.map((service) => (
                <button
                  key={service.id}
                  onClick={() => openServiceModal(service)}
                  className="block w-full px-5 py-4 text-left hover:bg-slate-50 transition-colors"
                >
                  <div className="flex items-start justify-between gap-4">
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <p className="truncate text-sm font-bold text-slate-800">{service.service_name}</p>
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
                    </div>
                    <div className="grid shrink-0 grid-cols-2 gap-2 text-right sm:grid-cols-4">
                      <div>
                        <p className="text-[10px] font-bold uppercase text-slate-400">Fee</p>
                        <p className="text-xs font-black text-slate-700">{formatMoney(service.consultation_fee)}</p>
                      </div>
                      <div>
                        <p className="text-[10px] font-bold uppercase text-slate-400">Materials</p>
                        <p className="text-xs font-black text-slate-700">{formatMoney(service.materials_cost)}</p>
                      </div>
                      <div>
                        <p className="text-[10px] font-bold uppercase text-slate-400">Profit</p>
                        <p className="text-xs font-black text-slate-700">{formatMoney(service.profit_amount)}</p>
                      </div>
                      <div>
                        <p className="text-[10px] font-bold uppercase text-slate-400">Price</p>
                        <p className="text-sm font-black text-slate-900">{formatMoney(service.suggested_price)}</p>
                      </div>
                    </div>
                  </div>
                </button>
              ))}
            </div>

            <Pagination
              page={page}
              totalPages={totalPages}
              total={filteredServices.length}
              pageSize={pageSize}
              onPageChange={setPage}
              onPageSizeChange={(nextSize) => { setPageSize(nextSize); setPage(1) }}
            />
          </>
        )}
      </div>

      <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <div className="flex items-start gap-3">
          <div className="w-10 h-10 rounded-xl bg-amber-50 border border-amber-200 flex items-center justify-center shrink-0">
            <MdCheck className="text-amber-600 text-[18px]" />
          </div>
          <div>
            <p className="text-sm font-bold text-slate-800">How this affects staff billing</p>
            <p className="text-xs text-slate-500 mt-1 leading-relaxed">
              Staff can select these services, review required materials, and use the computed service price on patient bills.
            </p>
          </div>
        </div>
      </div>

      {modalOpen && (
        <div className="fixed inset-0 z-[80] flex items-center justify-center bg-slate-900/50 p-4">
          <div className="max-h-[92vh] w-full max-w-5xl overflow-hidden rounded-2xl bg-white shadow-2xl">
            <div className="flex items-start justify-between gap-4 border-b border-slate-100 px-5 py-4">
              <div>
                <h2 className="text-base font-black text-slate-800 flex items-center gap-2">
                  {editingId ? <MdEdit className="text-amber-500" /> : <MdAdd className="text-amber-500" />}
                  {editingId ? 'Billing Service Details' : 'Add Billing Service'}
                </h2>
                <p className="mt-1 text-xs text-slate-500">
                  Review details, edit service pricing, and maintain required materials.
                </p>
              </div>
              <button onClick={closeModal} className="rounded-xl p-2 text-slate-400 hover:bg-slate-100 hover:text-slate-700">
                <MdClose className="text-[20px]" />
              </button>
            </div>

            <div className="max-h-[calc(92vh-76px)] overflow-y-auto p-5">
              {selectedService && (
                <div className="mb-4 grid gap-3 sm:grid-cols-4">
                  {[
                    ['Materials', formatMoney(selectedService.materials_cost)],
                    ['Service Fee', formatMoney(selectedService.consultation_fee)],
                    ['Profit', formatMoney(selectedService.profit_amount)],
                    ['Current Price', formatMoney(selectedService.suggested_price)],
                  ].map(([label, value]) => (
                    <div key={label} className="rounded-xl border border-slate-100 bg-slate-50 px-4 py-3">
                      <p className="text-[10px] font-bold uppercase tracking-widest text-slate-400">{label}</p>
                      <p className="mt-1 text-sm font-black text-slate-800">{value}</p>
                    </div>
                  ))}
                </div>
              )}

              <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_320px]">
                <div className="space-y-4">
                  <div className="grid gap-3 md:grid-cols-2">
                    <div>
                      <label className="text-[11px] font-bold text-slate-500 uppercase tracking-widest mb-1.5 block">Category</label>
                      <input id="billing-category" aria-invalid={Boolean(formErrors.category)} placeholder="e.g. Dermatologic Services" value={form.category} onChange={(e) => { setFormErrors((current) => ({ ...current, category: '' })); setForm((current) => ({ ...current, category: e.target.value })) }} className="form-control" />
                      {formErrors.category && <p className="form-error">{formErrors.category}</p>}
                    </div>
                    <div>
                      <label className="text-[11px] font-bold text-slate-500 uppercase tracking-widest mb-1.5 block">Clinic Type</label>
                      <select id="billing-clinic-type" value={form.clinic_type} onChange={(e) => setForm((current) => ({ ...current, clinic_type: e.target.value }))} className="form-control">
                        {CLINIC_TYPES.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
                      </select>
                    </div>
                    <div>
                      <label className="text-[11px] font-bold text-slate-500 uppercase tracking-widest mb-1.5 block">Service Name</label>
                      <input id="billing-service-name" aria-invalid={Boolean(formErrors.service_name)} placeholder="e.g. Dermatology Consultation" value={form.service_name} onChange={(e) => { setFormErrors((current) => ({ ...current, service_name: '' })); setForm((current) => ({ ...current, service_name: e.target.value })) }} className="form-control" />
                      {formErrors.service_name && <p className="form-error">{formErrors.service_name}</p>}
                    </div>
                    <div>
                      <label className="text-[11px] font-bold text-slate-500 uppercase tracking-widest mb-1.5 block">Service Fee</label>
                      <input id="billing-service-fee" aria-invalid={Boolean(formErrors.consultation_fee)} type="number" min="0" step="0.01" placeholder="0.00" value={form.consultation_fee} onChange={(e) => { setFormErrors((current) => ({ ...current, consultation_fee: '' })); setForm((current) => ({ ...current, consultation_fee: e.target.value })) }} className="form-control" />
                      {formErrors.consultation_fee && <p className="form-error">{formErrors.consultation_fee}</p>}
                    </div>
                    <div>
                      <label className="text-[11px] font-bold text-slate-500 uppercase tracking-widest mb-1.5 block">Profit %</label>
                      <input id="billing-profit" aria-invalid={Boolean(formErrors.profit_percentage)} type="number" min="0" max="1000" step="0.01" placeholder="20" value={form.profit_percentage} onChange={(e) => { setFormErrors((current) => ({ ...current, profit_percentage: '' })); setForm((current) => ({ ...current, profit_percentage: e.target.value })) }} className="form-control" />
                      {formErrors.profit_percentage && <p className="form-error">{formErrors.profit_percentage}</p>}
                    </div>
                    <div>
                      <label className="text-[11px] font-bold text-slate-500 uppercase tracking-widest mb-1.5 block">Visibility</label>
                      <select id="billing-visibility" value={form.is_active} onChange={(e) => setForm((current) => ({ ...current, is_active: Number(e.target.value) }))} className="form-control">
                        <option value={1}>Active</option>
                        <option value={0}>Inactive</option>
                      </select>
                    </div>
                  </div>

                  <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <h3 className="text-sm font-bold text-slate-800 flex items-center gap-2">
                          <MdBuild className="text-[17px] text-violet-500" /> Required Materials
                        </h3>
                        <p className="text-xs text-slate-500 mt-1">Blank cost override uses the inventory item price.</p>
                      </div>
                      <button onClick={addMaterial} className="flex items-center gap-1 rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-bold text-slate-600 hover:bg-slate-50">
                        <MdAdd className="text-[14px]" /> Material
                      </button>
                    </div>

                    <div className="mt-4 space-y-3">
                      {form.materials.map((material, index) => (
                        <div key={index} className="rounded-2xl border border-slate-200 bg-white p-4">
                          <div className="flex items-start justify-between gap-3">
                            <p className="text-xs font-bold uppercase tracking-widest text-slate-400">Material {index + 1}</p>
                            <button onClick={() => removeMaterial(index)} className="rounded-lg p-1 text-slate-300 hover:bg-red-50 hover:text-red-500">
                              <MdClose className="text-[16px]" />
                            </button>
                          </div>
                          <div className="mt-3 grid gap-3 md:grid-cols-2">
                            <div>
                              <label className="mb-1.5 block text-[11px] font-bold uppercase tracking-widest text-slate-400">Inventory Item</label>
                              <select value={material.inventory_id} onChange={(e) => handleInventorySelect(index, e.target.value)} className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 text-sm focus:outline-none focus:border-amber-400">
                                <option value="">Select inventory item</option>
                                {inventoryItems.map((inventoryItem) => (
                                  <option key={inventoryItem.id} value={inventoryItem.id}>{inventoryItem.category} - {inventoryItem.name}</option>
                                ))}
                              </select>
                            </div>
                            <div>
                              <label className="mb-1.5 block text-[11px] font-bold uppercase tracking-widest text-slate-400">Material Name</label>
                              <input value={material.material_name} onChange={(e) => updateMaterial(index, 'material_name', e.target.value)} placeholder="e.g. Sterile gauze pad" className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 text-sm focus:outline-none focus:border-amber-400" />
                            </div>
                            <div>
                              <label className="mb-1.5 block text-[11px] font-bold uppercase tracking-widest text-slate-400">Quantity Used</label>
                              <input type="number" min="0" step="1" value={material.quantity} onChange={(e) => updateMaterial(index, 'quantity', e.target.value)} placeholder="e.g. 1" className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 text-sm focus:outline-none focus:border-amber-400" />
                            </div>
                            <div>
                              <label className="mb-1.5 block text-[11px] font-bold uppercase tracking-widest text-slate-400">Unit</label>
                              <input value={material.unit_label} onChange={(e) => updateMaterial(index, 'unit_label', e.target.value)} placeholder="e.g. piece, mL, pack" className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 text-sm focus:outline-none focus:border-amber-400" />
                            </div>
                            <div>
                              <label className="mb-1.5 block text-[11px] font-bold uppercase tracking-widest text-slate-400">Cost Override</label>
                              <input type="number" min="0" step="1" value={material.unit_cost_override} onChange={(e) => updateMaterial(index, 'unit_cost_override', e.target.value)} placeholder="Optional PHP cost" className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 text-sm focus:outline-none focus:border-amber-400" />
                            </div>
                            <div>
                              <label className="mb-1.5 block text-[11px] font-bold uppercase tracking-widest text-slate-400">Notes</label>
                              <input value={material.notes} onChange={(e) => updateMaterial(index, 'notes', e.target.value)} placeholder="Optional notes" className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 text-sm focus:outline-none focus:border-amber-400" />
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>

                <div className="space-y-4">
                  <div className="rounded-2xl border border-sky-200 bg-sky-50 p-4">
                    <p className="text-[11px] font-bold uppercase tracking-widest text-sky-600">Price Preview</p>
                    <div className="mt-3 space-y-2 text-sm">
                      <div className="flex items-center justify-between text-slate-600"><span>Materials</span><span>{formatMoney(previewMaterialsCost)}</span></div>
                      <div className="flex items-center justify-between text-slate-600"><span>Service Fee</span><span>{formatMoney(previewConsultationFee)}</span></div>
                      <div className="flex items-center justify-between text-slate-600"><span>Profit</span><span>{formatMoney(previewProfitAmount)}</span></div>
                      <div className="flex items-center justify-between border-t border-sky-100 pt-2 text-base font-black text-slate-800"><span>Price</span><span>{formatMoney(previewSuggestedPrice)}</span></div>
                    </div>
                  </div>

                  <div className="flex flex-col gap-2">
                    <button onClick={handleSubmit} disabled={saving} className="rounded-xl bg-amber-500 px-4 py-3 text-sm font-bold text-white hover:bg-amber-600 disabled:opacity-50">
                      {saving ? 'Saving...' : editingId ? 'Save Changes' : 'Add Service'}
                    </button>
                    {editingId && (
                      <button onClick={() => handleDelete(editingId)} disabled={deletingId === editingId} className="flex items-center justify-center gap-1 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-bold text-red-600 hover:bg-red-100 disabled:opacity-50">
                        <MdDelete className="text-[16px]" /> {deletingId === editingId ? 'Removing...' : 'Remove Service'}
                      </button>
                    )}
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      <Modal
        open={paymentSetupOpen}
        onClose={() => !paymentSettingsMutation.isPending && setPaymentSetupOpen(false)}
        closeDisabled={paymentSettingsMutation.isPending}
        title="Payment Setup"
        description="Set the QR image URLs and bank details shown to staff during payment."
        size="md"
      >
        <div className="space-y-4">
          <div>
            <label htmlFor="gcash-qr-url" className="form-label">GCash QR Image URL</label>
            <input id="gcash-qr-url" type="url" value={paymentForm.gcash_qr_url} onChange={(e) => setPaymentForm((current) => ({ ...current, gcash_qr_url: e.target.value }))} placeholder="https://.../gcash-qr.png" className="form-control mt-1.5" />
            <p className="form-helper mt-1">Use an HTTPS image URL or a path from the client public folder.</p>
          </div>
          <div>
            <label htmlFor="maya-qr-url" className="form-label">Maya QR Image URL</label>
            <input id="maya-qr-url" type="url" value={paymentForm.maya_qr_url} onChange={(e) => setPaymentForm((current) => ({ ...current, maya_qr_url: e.target.value }))} placeholder="https://.../maya-qr.png" className="form-control mt-1.5" />
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <label htmlFor="bank-name" className="form-label">Bank Name</label>
              <input id="bank-name" value={paymentForm.bank_name} onChange={(e) => setPaymentForm((current) => ({ ...current, bank_name: e.target.value }))} placeholder="e.g. BPI" className="form-control mt-1.5" />
            </div>
            <div>
              <label htmlFor="bank-account-number" className="form-label">Account Number</label>
              <input id="bank-account-number" value={paymentForm.bank_account_number} onChange={(e) => setPaymentForm((current) => ({ ...current, bank_account_number: e.target.value }))} placeholder="Enter account number" className="form-control mt-1.5" />
            </div>
          </div>
          <div>
            <label htmlFor="bank-account-name" className="form-label">Account Name</label>
            <input id="bank-account-name" value={paymentForm.bank_account_name} onChange={(e) => setPaymentForm((current) => ({ ...current, bank_account_name: e.target.value }))} placeholder="Enter registered account name" className="form-control mt-1.5" />
          </div>
          <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
            <button type="button" className="button-secondary" disabled={paymentSettingsMutation.isPending} onClick={() => setPaymentSetupOpen(false)}>Cancel</button>
            <button type="button" className="button-primary" disabled={paymentSettingsMutation.isPending} onClick={() => paymentSettingsMutation.mutate(paymentForm)}>
              {paymentSettingsMutation.isPending ? 'Saving...' : 'Save Payment Setup'}
            </button>
          </div>
        </div>
      </Modal>

      <ConfirmDialog
        open={Boolean(deleteCandidate)}
        title="Remove billing service?"
        message={`Remove ${deleteCandidate?.service_name || 'this service'} from the catalog? Services already used by a bill will be deactivated by the server instead of losing billing history.`}
        confirmLabel="Remove service"
        loading={deleteMutation.isPending}
        onCancel={() => !deleteMutation.isPending && setDeleteCandidate(null)}
        onConfirm={confirmDelete}
      />
    </div>
  )
}

export default Admin_BillingCatalog

