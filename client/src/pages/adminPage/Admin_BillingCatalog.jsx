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
  default_price: 0,
  is_active: 1,
  materials: [],
}

const clinicLabel = (value) => CLINIC_TYPES.find((item) => item.value === value)?.label || value

const computeMaterialPreview = (materials, inventoryMap) => (
  roundMoney((materials || []).reduce((sum, material) => {
    const inventoryItem = inventoryMap.get(Number(material.inventory_id) || 0)
    const packageCost = Number(inventoryItem?.price) || 0
    const unitSize = Math.max(1, Number(inventoryItem?.unit_size) || 1)
    const usageUnit = String(material.unit_label || '').toLowerCase()
    const baseUnit = String(inventoryItem?.base_unit || '').toLowerCase()
    const unitCost = material.unit_cost_override !== '' && material.unit_cost_override !== null && material.unit_cost_override !== undefined
      ? Number(material.unit_cost_override) || 0
      : (usageUnit && baseUnit && usageUnit === baseUnit ? packageCost / unitSize : packageCost)
    return sum + roundMoney((Number(material.quantity) || 0) * unitCost)
  }, 0))
)

const serviceToForm = (service) => ({
  category: service?.category || '',
  service_name: service?.service_name || '',
  clinic_type: service?.clinic_type || 'all',
  consultation_fee: Number(service?.consultation_fee) || 0,
  profit_percentage: Number(service?.profit_percentage) || 20,
  default_price: Number(service?.default_price ?? service?.patient_price ?? service?.suggested_price) || 0,
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
    : [],
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
  const [modalStep, setModalStep] = useState(1)
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
    setForm({ ...BLANK_FORM, materials: [] })
    setModalStep(1)
    setModalOpen(true)
  }

  const openServiceModal = (service) => {
    setFormErrors({})
    setEditingId(service.id)
    setSelectedService(service)
    setForm(serviceToForm(service))
    setModalStep(1)
    setModalOpen(true)
  }

  const closeModal = (force = false) => {
    if (saveMutation.isPending && !force) return
    setFormErrors({})
    setModalOpen(false)
    setModalStep(1)
    setEditingId(null)
    setSelectedService(null)
    setForm({ ...BLANK_FORM, materials: [] })
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
              unit_label: inventoryItem?.base_unit || inventoryItem?.unit || material.unit_label,
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
      materials: current.materials.filter((_, materialIndex) => materialIndex !== index),
    }))
  }

  const previewMaterialsCost = computeMaterialPreview(form.materials, inventoryMap)
  const previewConsultationFee = Math.max(0, Number(form.consultation_fee) || 0)
  const previewBase = roundMoney(previewMaterialsCost + previewConsultationFee)
  const previewProfitAmount = roundMoney(previewBase * ((Number(form.profit_percentage) || 0) / 100))
  const previewSuggestedPrice = roundMoney(previewBase + previewProfitAmount)
  const previewPatientPrice = Math.max(0, Number(form.default_price) || 0)

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

  const validateForm = (payload, step = 4) => {
    const errors = {}
    if (step === 1 || step === 4) {
      if (!payload.category) errors.category = 'Enter a category.'
      if (!payload.service_name) errors.service_name = 'Enter a service name.'
      if (payload.consultation_fee < 0) errors.consultation_fee = 'The service fee cannot be negative.'
      if (payload.profit_percentage < 0 || payload.profit_percentage > 1000) errors.profit_percentage = 'Enter a markup from 0 to 1,000%.'
    }
    if (step === 2 || step === 4) {
      payload.materials.forEach((material, index) => {
        if (!material.inventory_id && !material.material_name) errors[`material_name_${index}`] = 'Select an inventory item.'
        if (!(material.quantity > 0)) errors[`material_quantity_${index}`] = 'Quantity must be greater than zero.'
        if (material.unit_cost_override !== null && material.unit_cost_override < 0) errors[`material_cost_${index}`] = 'Cost cannot be negative.'
      })
    }
    if (step === 3 || step === 4) {
      if (payload.default_price < 0) errors.default_price = 'Patient price cannot be negative.'
    }
    setFormErrors(errors)
    return Object.keys(errors).length === 0
  }

  const buildPayload = () => ({
    category: form.category.trim(),
    service_name: form.service_name.trim(),
    clinic_type: form.clinic_type,
    consultation_fee: Number(form.consultation_fee),
    profit_percentage: Number(form.profit_percentage),
    default_price: Number(form.default_price),
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
  })

  const goToStep = (nextStep) => {
    const payload = buildPayload()
    if (nextStep > modalStep && !validateForm(payload, modalStep)) {
      toast.warning('Check the highlighted fields before continuing.')
      return
    }
    if (modalStep === 2 && nextStep === 3 && Number(form.default_price || 0) === 0 && previewSuggestedPrice > 0) {
      setForm((current) => ({ ...current, default_price: previewSuggestedPrice }))
    }
    setModalStep(nextStep)
  }

  const handleSubmit = async () => {
    const payload = buildPayload()
    if (!validateForm(payload, 4)) {
      toast.warning('Check the highlighted service fields.')
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
            <MdPayments className="text-amber-500 text-[22px]" /> Service Catalog
          </h1>
          <p className="text-xs lg:text-sm text-slate-500 mt-0.5">
            Configure clinic services, default consumables, internal costing, and the patient price used for billing.
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
                        <span>{service.materials?.length || 0} default consumables</span>
                      </div>
                    </div>
                    <div className="grid shrink-0 grid-cols-2 gap-2 text-right sm:grid-cols-4">
                      <div>
                        <p className="text-[10px] font-bold uppercase text-slate-400">Fee</p>
                        <p className="text-xs font-black text-slate-700">{formatMoney(service.consultation_fee)}</p>
                      </div>
                      <div>
                        <p className="text-[10px] font-bold uppercase text-slate-400">Consumables</p>
                        <p className="text-xs font-black text-slate-700">{formatMoney(service.materials_cost)}</p>
                      </div>
                      <div>
                        <p className="text-[10px] font-bold uppercase text-slate-400">Markup</p>
                        <p className="text-xs font-black text-slate-700">{formatMoney(service.profit_amount)}</p>
                      </div>
                      <div>
                        <p className="text-[10px] font-bold uppercase text-amber-600">Patient Price</p>
                        <p className="text-sm font-black text-amber-700">{formatMoney(service.default_price ?? service.patient_price ?? service.suggested_price)}</p>
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
              Doctors can record services performed while Staff bills the saved patient price. Default consumables are used as a starting point for actual clinical usage.
            </p>
          </div>
        </div>
      </div>

      {modalOpen && (
        <div className="fixed inset-0 z-[80] flex items-center justify-center bg-slate-900/50 p-4">
          <div className="flex max-h-[94vh] w-full max-w-3xl flex-col overflow-hidden rounded-3xl bg-white shadow-2xl">
            <div className="flex items-start justify-between gap-4 border-b border-slate-100 px-6 py-5">
              <div>
                <h2 className="flex items-center gap-2 text-lg font-black text-slate-900">
                  {editingId ? <MdEdit className="text-amber-500" /> : <MdAdd className="text-amber-500" />}
                  {editingId ? 'Edit Service' : 'Add Service'}
                </h2>
                <p className="mt-1 text-sm text-slate-500">Set the service details, default consumables, patient price, then review before saving.</p>
              </div>
              <button onClick={closeModal} className="rounded-xl p-2 text-slate-400 hover:bg-slate-100 hover:text-slate-700"><MdClose className="text-[20px]" /></button>
            </div>

            <div className="border-b border-slate-100 px-6 py-4">
              <div className="grid grid-cols-4 gap-2">
                {[
                  [1, 'Details'], [2, 'Consumables'], [3, 'Pricing'], [4, 'Review'],
                ].map(([step, label]) => (
                  <div key={step} className={`rounded-xl px-2 py-2 text-center text-xs font-bold ${modalStep === step ? 'bg-amber-500 text-white' : modalStep > step ? 'bg-emerald-50 text-emerald-700' : 'bg-slate-100 text-slate-400'}`}>
                    {modalStep > step ? '✓ ' : ''}{label}
                  </div>
                ))}
              </div>
            </div>

            <div className="flex-1 overflow-y-auto p-6">
              {modalStep === 1 && (
                <div className="grid gap-4 sm:grid-cols-2">
                  <div>
                    <label className="form-label">Category *</label>
                    <input value={form.category} onChange={(e) => { setFormErrors((c) => ({ ...c, category: '' })); setForm((c) => ({ ...c, category: e.target.value })) }} placeholder="e.g. Dermatology Procedures" className="form-control mt-1.5" />
                    {formErrors.category && <p className="form-error">{formErrors.category}</p>}
                  </div>
                  <div>
                    <label className="form-label">Clinic Type *</label>
                    <select value={form.clinic_type} onChange={(e) => setForm((c) => ({ ...c, clinic_type: e.target.value }))} className="form-control mt-1.5">{CLINIC_TYPES.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}</select>
                  </div>
                  <div className="sm:col-span-2">
                    <label className="form-label">Service Name *</label>
                    <input value={form.service_name} onChange={(e) => { setFormErrors((c) => ({ ...c, service_name: '' })); setForm((c) => ({ ...c, service_name: e.target.value })) }} placeholder="e.g. Chemical Peel" className="form-control mt-1.5" />
                    {formErrors.service_name && <p className="form-error">{formErrors.service_name}</p>}
                  </div>
                  <div>
                    <label className="form-label">Professional / Service Cost</label>
                    <input type="number" min="0" step="0.01" value={form.consultation_fee} onChange={(e) => setForm((c) => ({ ...c, consultation_fee: e.target.value }))} className="form-control mt-1.5" />
                    <p className="form-helper">Internal costing component. This is not automatically the patient charge.</p>
                  </div>
                  <div>
                    <label className="form-label">Visibility</label>
                    <select value={form.is_active} onChange={(e) => setForm((c) => ({ ...c, is_active: Number(e.target.value) }))} className="form-control mt-1.5"><option value={1}>Active</option><option value={0}>Inactive</option></select>
                  </div>
                </div>
              )}

              {modalStep === 2 && (
                <div className="space-y-4">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <h3 className="flex items-center gap-2 text-base font-bold text-slate-900"><MdBuild className="text-violet-500" /> Default Consumables</h3>
                      <p className="mt-1 text-sm text-slate-500">Optional. These are defaults only; the doctor records the actual quantity used during consultation.</p>
                    </div>
                    <button onClick={addMaterial} className="button-secondary"><MdAdd /> Add Consumable</button>
                  </div>

                  {form.materials.length === 0 ? (
                    <div className="rounded-2xl border border-dashed border-slate-300 bg-slate-50 p-8 text-center">
                      <p className="font-semibold text-slate-700">No default consumables</p>
                      <p className="mt-1 text-sm text-slate-500">This service can be saved without inventory materials.</p>
                      <button onClick={addMaterial} className="button-secondary mt-4"><MdAdd /> Add Consumable</button>
                    </div>
                  ) : (
                    <div className="space-y-3">
                      {form.materials.map((material, index) => {
                        const inventoryItem = inventoryMap.get(Number(material.inventory_id) || 0)
                        const packageCost = Number(inventoryItem?.price || 0)
                        const unitSize = Math.max(1, Number(inventoryItem?.unit_size) || 1)
                        const baseUnit = inventoryItem?.base_unit || inventoryItem?.unit || 'unit'
                        return (
                          <div key={index} className="rounded-2xl border border-slate-200 bg-white p-4">
                            <div className="flex items-center justify-between gap-3"><p className="text-xs font-bold uppercase tracking-widest text-slate-400">Consumable {index + 1}</p><button onClick={() => removeMaterial(index)} className="rounded-lg p-1.5 text-slate-400 hover:bg-red-50 hover:text-red-500"><MdClose /></button></div>
                            <div className="mt-3 grid gap-3 sm:grid-cols-2">
                              <div>
                                <label className="form-label">Inventory Item *</label>
                                <select value={material.inventory_id} onChange={(e) => handleInventorySelect(index, e.target.value)} className="form-control mt-1.5"><option value="">Select item</option>{inventoryItems.map((item) => <option key={item.id} value={item.id}>{item.category} — {item.name}</option>)}</select>
                                {formErrors[`material_name_${index}`] && <p className="form-error">{formErrors[`material_name_${index}`]}</p>}
                              </div>
                              <div>
                                <label className="form-label">Default Quantity Used *</label>
                                <div className="mt-1.5 flex gap-2"><input type="number" min="0.01" step="0.01" value={material.quantity} onChange={(e) => updateMaterial(index, 'quantity', e.target.value)} className="form-control" /><div className="flex min-w-20 items-center justify-center rounded-xl border border-slate-200 bg-slate-50 px-3 text-sm font-semibold text-slate-600">{material.unit_label || baseUnit}</div></div>
                                {formErrors[`material_quantity_${index}`] && <p className="form-error">{formErrors[`material_quantity_${index}`]}</p>}
                              </div>
                              <div className="sm:col-span-2">
                                <label className="form-label">Notes</label>
                                <input value={material.notes} onChange={(e) => updateMaterial(index, 'notes', e.target.value)} placeholder="Optional usage note" className="form-control mt-1.5" />
                              </div>
                              {inventoryItem && <div className="sm:col-span-2 rounded-xl bg-slate-50 px-3 py-2 text-xs text-slate-500">{inventoryItem.unit_size || 1} {baseUnit} per {inventoryItem.unit}. Package cost {formatMoney(packageCost)}; estimated base-unit cost {formatMoney(packageCost / unitSize)}.</div>}
                              <details className="sm:col-span-2 rounded-xl border border-slate-200 bg-slate-50 p-3">
                                <summary className="cursor-pointer text-xs font-bold text-slate-600">Advanced cost override</summary>
                                <div className="mt-3"><label className="form-label">Cost per {material.unit_label || baseUnit}</label><input type="number" min="0" step="0.01" value={material.unit_cost_override} onChange={(e) => updateMaterial(index, 'unit_cost_override', e.target.value)} placeholder="Leave blank to use inventory cost" className="form-control mt-1.5" /></div>
                              </details>
                            </div>
                          </div>
                        )
                      })}
                    </div>
                  )}
                </div>
              )}

              {modalStep === 3 && (
                <div className="space-y-5">
                  <div className="rounded-2xl border border-sky-200 bg-sky-50 p-5">
                    <p className="text-xs font-bold uppercase tracking-widest text-sky-700">Internal Costing</p>
                    <div className="mt-4 space-y-2 text-sm"><div className="flex justify-between"><span>Estimated consumables</span><strong>{formatMoney(previewMaterialsCost)}</strong></div><div className="flex justify-between"><span>Professional / service cost</span><strong>{formatMoney(previewConsultationFee)}</strong></div><div className="flex justify-between border-t border-sky-200 pt-2"><span>Estimated cost base</span><strong>{formatMoney(previewBase)}</strong></div></div>
                  </div>
                  <div className="grid gap-4 sm:grid-cols-2">
                    <div>
                      <label className="form-label">Markup %</label>
                      <input type="number" min="0" max="1000" step="0.01" value={form.profit_percentage} onChange={(e) => setForm((c) => ({ ...c, profit_percentage: e.target.value }))} className="form-control mt-1.5" />
                      <p className="form-helper">Used only to calculate the suggested price.</p>
                    </div>
                    <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4"><p className="text-xs font-bold uppercase tracking-widest text-slate-400">Suggested Price</p><p className="mt-2 text-2xl font-black text-slate-900">{formatMoney(previewSuggestedPrice)}</p></div>
                  </div>
                  <div className="rounded-2xl border-2 border-amber-300 bg-amber-50 p-5">
                    <label className="text-sm font-bold text-amber-900">Patient Price *</label>
                    <input type="number" min="0" step="0.01" value={form.default_price} onChange={(e) => { setFormErrors((c) => ({ ...c, default_price: '' })); setForm((c) => ({ ...c, default_price: e.target.value })) }} className="form-control mt-2 bg-white text-lg font-black" />
                    <p className="mt-2 text-sm text-amber-800">This is the standard clinic price Staff will bill. Inventory cost changes will not automatically change it.</p>
                    {formErrors.default_price && <p className="form-error">{formErrors.default_price}</p>}
                  </div>
                </div>
              )}

              {modalStep === 4 && (
                <div className="space-y-4">
                  <div className="rounded-2xl border border-slate-200 p-5"><p className="text-xs font-bold uppercase tracking-widest text-slate-400">Service</p><h3 className="mt-2 text-xl font-black text-slate-900">{form.service_name || 'Unnamed Service'}</h3><p className="mt-1 text-sm text-slate-500">{form.category || 'No category'} · {clinicLabel(form.clinic_type)} · {Number(form.is_active) === 1 ? 'Active' : 'Inactive'}</p></div>
                  <div className="grid gap-3 sm:grid-cols-3"><div className="rounded-2xl bg-slate-50 p-4"><p className="text-xs font-bold uppercase text-slate-400">Consumable Cost</p><p className="mt-2 font-black text-slate-900">{formatMoney(previewMaterialsCost)}</p></div><div className="rounded-2xl bg-slate-50 p-4"><p className="text-xs font-bold uppercase text-slate-400">Suggested</p><p className="mt-2 font-black text-slate-900">{formatMoney(previewSuggestedPrice)}</p></div><div className="rounded-2xl bg-amber-50 p-4"><p className="text-xs font-bold uppercase text-amber-700">Patient Price</p><p className="mt-2 text-xl font-black text-amber-900">{formatMoney(previewPatientPrice)}</p></div></div>
                  <div className="rounded-2xl border border-slate-200 p-5"><div className="flex items-center justify-between"><p className="font-bold text-slate-900">Default Consumables</p><span className="rounded-full bg-slate-100 px-2.5 py-1 text-xs font-bold text-slate-600">{form.materials.length}</span></div>{form.materials.length === 0 ? <p className="mt-3 text-sm text-slate-500">No default consumables.</p> : <div className="mt-3 divide-y divide-slate-100">{form.materials.map((m, index) => <div key={index} className="flex justify-between gap-4 py-2 text-sm"><span className="font-semibold text-slate-700">{m.material_name || inventoryMap.get(Number(m.inventory_id))?.name}</span><span className="text-slate-500">{m.quantity} {m.unit_label}</span></div>)}</div>}</div>
                  <div className="rounded-2xl border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-800">After saving, doctors can select this service during consultation. These consumables are defaults; actual usage is recorded and inventory is deducted per batch.</div>
                </div>
              )}
            </div>

            <div className="flex items-center justify-between gap-3 border-t border-slate-100 px-6 py-5">
              <div>{editingId && modalStep === 4 && <button onClick={() => handleDelete(editingId)} disabled={deletingId === editingId} className="button-danger"><MdDelete /> Remove Service</button>}</div>
              <div className="flex gap-2">
                {modalStep > 1 && <button onClick={() => goToStep(modalStep - 1)} disabled={saving} className="button-secondary">Back</button>}
                {modalStep < 4 ? <button onClick={() => goToStep(modalStep + 1)} className="button-primary">Next</button> : <button onClick={handleSubmit} disabled={saving} className="button-primary">{saving ? 'Saving...' : editingId ? 'Save Changes' : 'Add Service'}</button>}
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
