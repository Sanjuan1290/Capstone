import { useEffect, useMemo, useState } from 'react'
import {
  getBillById,
  getBillingCatalog,
  getBillingPaymentSettings,
  getBills,
  getInventory,
  getDiscountPresets,
  getBillingAdjustmentRequests,
  requestBillingAdjustment,
  finalizeBill,
  payBill,
  updateBill,
} from '../../services/staff.service'
import {
  MdAccessTime,
  MdAdd,
  MdCalendarToday,
  MdCheck,
  MdClose,
  MdInventory2,
  MdLocalHospital,
  MdLocalPharmacy,
  MdPayments,
  MdPerson,
  MdReceiptLong,
  MdRefresh,
  MdSearch,
} from 'react-icons/md'
import { useToast } from '../../components/ui/ToastProvider'
import { getClinicSettings } from '../../services/clinic.service'
import Pagination from '../../components/ui/Pagination'
import ConfirmDialog from '../../components/ui/ConfirmDialog'
import { EmptyState, ErrorState, LoadingState } from '../../components/ui/PageState'

const STATUS_FILTERS = [
  { value: '', label: 'All' },
  { value: 'draft', label: 'Draft' },
  { value: 'ready', label: 'Ready for Payment' },
  { value: 'partially_paid', label: 'Partially Paid' },
  { value: 'paid', label: 'Paid' },
]

const PAYMENT_OPTIONS = [
  { value: 'cash', label: 'Cash' },
  { value: 'gcash', label: 'GCash' },
  { value: 'maya', label: 'Maya' },
  { value: 'bank_transfer', label: 'Bank Transfer' },
]

const BILL_STATUS_META = {
  draft: { label: 'Draft', tone: 'border-slate-200 bg-slate-50 text-slate-700' },
  pending: { label: 'Draft', tone: 'border-slate-200 bg-slate-50 text-slate-700' },
  ready: { label: 'Ready for Payment', tone: 'border-sky-200 bg-sky-50 text-sky-700' },
  partially_paid: { label: 'Partially Paid', tone: 'border-amber-200 bg-amber-50 text-amber-700' },
  paid: { label: 'Paid', tone: 'border-emerald-200 bg-emerald-50 text-emerald-700' },
  voided: { label: 'Voided', tone: 'border-rose-200 bg-rose-50 text-rose-700' },
  refunded: { label: 'Refunded', tone: 'border-violet-200 bg-violet-50 text-violet-700' },
}

const getBillStatusMeta = (status) => BILL_STATUS_META[status] || BILL_STATUS_META.draft

const ITEM_TYPES = [
  { value: 'service', label: 'Clinic Service' },
  { value: 'supply', label: 'Medicine / Supply' },
  { value: 'custom', label: 'Custom Charge' },
]

const roundMoney = (value) => Math.round((Number(value) || 0) * 100) / 100

const formatMoney = (value) => new Intl.NumberFormat('en-PH', {
  style: 'currency',
  currency: 'PHP',
}).format(Number(value) || 0)

const buildServiceDetails = (service) => ({
  pricing: {
    materials_cost: Number(service?.materials_cost) || 0,
    consultation_fee: Number(service?.consultation_fee) || 0,
    profit_percentage: Number(service?.profit_percentage) || 0,
    profit_amount: Number(service?.profit_amount) || 0,
    suggested_price: Number(service?.suggested_price) || 0,
    patient_price: Number(service?.default_price ?? service?.patient_price ?? service?.suggested_price) || 0,
  },
  materials: Array.isArray(service?.materials)
    ? service.materials.map((material) => ({
      inventory_id: material.inventory_id || null,
      material_name: material.material_name || material.inventory_name || '',
      quantity: Number(material.quantity) || 0,
      unit_label: material.unit_label || material.inventory_base_unit || material.inventory_unit || '',
      unit_cost: material.unit_cost_override ?? ((Number(material.inventory_price) || 0) / Math.max(1, Number(material.inventory_unit_size) || 1)),
      line_total: roundMoney(
        (Number(material.quantity) || 0)
        * Number(material.unit_cost_override ?? ((Number(material.inventory_price) || 0) / Math.max(1, Number(material.inventory_unit_size) || 1)))
      ),
      notes: material.notes || '',
    }))
    : [],
})

const makeBlankItem = (itemType = 'custom') => ({
  item_type: itemType,
  catalog_service_id: '',
  source_inventory_id: '',
  category: itemType === 'supply' ? 'Medicine / Supply' : '',
  service_name: '',
  quantity: 1,
  base_amount: 0,
  markup_percentage: itemType === 'service' ? 20 : 0,
  unit_price: 0,
  price_overridden: false,
  original_price: 0,
  override_reason: '',
  requested_override_price: '',
  override_request_reason: '',
  notes: '',
  details: null,
})

const normalizeBillForEditor = (bill) => ({
  ...bill,
  discount_type: bill?.discount_type || 'none',
  discount_label: bill?.discount_label || '',
  discount_amount: Number(bill?.discount_amount) || 0,
  payment_method: bill?.payment_method || '',
  payment_notes: bill?.payment_notes || '',
  reference_number: bill?.payments?.[0]?.reference_number || '',
  payment_amount: Number(bill?.balance_amount ?? bill?.total_amount) || 0,
  amount_received: Number(bill?.balance_amount ?? bill?.total_amount) || 0,
  items: Array.isArray(bill?.items) && bill.items.length > 0
    ? bill.items.map((item) => ({
      id: item.id,
      item_type: item.item_type || 'custom',
      catalog_service_id: item.catalog_service_id || '',
      source_inventory_id: item.source_inventory_id || '',
      category: item.category || '',
      service_name: item.service_name || '',
      quantity: Number(item.quantity) || 1,
      base_amount: Number(item.base_amount) || 0,
      markup_percentage: Number(item.markup_percentage) || 0,
      unit_price: Number(item.unit_price) || 0,
      price_overridden: Boolean(item?.details?.pricing?.price_overridden),
      original_price: Number(item?.details?.pricing?.original_price ?? item.unit_price) || 0,
      override_reason: item?.details?.pricing?.override_reason || '',
      requested_override_price: '',
      override_request_reason: '',
      notes: item.notes || '',
      details: item.details || null,
    }))
    : [makeBlankItem('service')],
})

const computeEditorTotals = (draft) => {
  const subtotal = roundMoney(
    (draft?.items || []).reduce((sum, item) => (
      sum + (Math.max(0, Number(item.quantity) || 0) * Math.max(0, Number(item.unit_price) || 0))
    ), 0)
  )
  const discount = Math.max(0, Number(draft?.discount_amount) || 0)
  const total = Math.max(0, roundMoney(subtotal - discount))
  return { subtotal, discount, total }
}

const serializeDraftItems = (items = []) => (
  items.map((item, index) => ({
    item_type: item.item_type,
    catalog_service_id: item.catalog_service_id || null,
    source_inventory_id: item.source_inventory_id || null,
    category: item.category,
    service_name: item.service_name,
    quantity: Number(item.quantity) || 0,
    base_amount: Number(item.base_amount) || 0,
    markup_percentage: Number(item.markup_percentage) || 0,
    unit_price: Number(item.unit_price) || 0,
    price_overridden: Boolean(item.price_overridden),
    override_reason: item.override_reason || '',
    notes: item.notes || '',
    sort_order: index,
    details: item.details || null,
  }))
)

const ServiceBreakdown = ({ item }) => {
  const materials = Array.isArray(item?.details?.materials) ? item.details.materials : []
  const pricing = item?.details?.pricing || null

  if (materials.length === 0 && !pricing) {
    return (
      <div className="mt-3 rounded-xl border border-dashed border-slate-200 bg-slate-50 px-4 py-3 text-xs text-slate-400">
        Select a service to review its default consumables and pricing snapshot.
      </div>
    )
  }

  return (
    <div className="mt-3 rounded-2xl border border-sky-100 bg-sky-50/70 p-4">
      <div className="flex items-center justify-between gap-3">
        <p className="text-xs font-bold uppercase tracking-widest text-sky-600">Service Breakdown</p>
        {pricing && (
          <p className="text-xs font-semibold text-sky-700">
            Cost estimate + {Number(pricing.profit_percentage) || 0}% markup
          </p>
        )}
      </div>

      <div className="mt-3 space-y-2">
        {materials.map((material, index) => (
          <div key={`${material.material_name}-${index}`} className="flex items-start justify-between gap-3 rounded-xl bg-white px-3 py-2.5 text-sm">
            <div className="min-w-0">
              <p className="font-semibold text-slate-800">{material.material_name}</p>
              <p className="text-xs text-slate-500">
                {material.quantity} {material.unit_label || 'unit'} x {formatMoney(material.unit_cost)}
              </p>
            </div>
            <span className="shrink-0 font-bold text-slate-700">{formatMoney(material.line_total)}</span>
          </div>
        ))}
      </div>

      {pricing && (
        <div className="mt-3 rounded-xl border border-sky-100 bg-white px-4 py-3 text-sm">
          <div className="flex items-center justify-between text-slate-500">
            <span>Materials Cost</span>
            <span>{formatMoney(pricing.materials_cost)}</span>
          </div>
          <div className="mt-1 flex items-center justify-between text-slate-500">
            <span>Service Fee</span>
            <span>{formatMoney(pricing.consultation_fee)}</span>
          </div>
          <div className="mt-1 flex items-center justify-between text-slate-500">
            <span>Markup Amount</span>
            <span>{formatMoney(pricing.profit_amount)}</span>
          </div>
          <div className="mt-2 flex items-center justify-between border-t border-slate-100 pt-2 text-slate-500">
            <span>Suggested Cost-Based Price</span>
            <span>{formatMoney(pricing.suggested_price)}</span>
          </div>
          <div className="mt-2 flex items-center justify-between font-black text-slate-900">
            <span>Patient Price</span>
            <span>{formatMoney(pricing.patient_price ?? pricing.suggested_price)}</span>
          </div>
        </div>
      )}
    </div>
  )
}

const Staff_Billing = () => {
  const toast = useToast()
  const [filter, setFilter] = useState('')
  const [search, setSearch] = useState('')
  const [bills, setBills] = useState([])
  const [page, setPage] = useState(1)
  const [pageSize, setPageSize] = useState(10)
  const [pagination, setPagination] = useState({ page: 1, limit: 10, total: 0, totalPages: 1 })
  const [summary, setSummary] = useState({ total: 0, draft: 0, ready: 0, partially_paid: 0, paid: 0, outstanding: 0, collected: 0 })
  const [selectedId, setSelectedId] = useState(null)
  const [detail, setDetail] = useState(null)
  const [draft, setDraft] = useState(null)
  const [billingCatalog, setBillingCatalog] = useState([])
  const [inventoryItems, setInventoryItems] = useState([])
  const [paymentSettings, setPaymentSettings] = useState({})
  const [discountPresets, setDiscountPresets] = useState([])
  const [selectedDiscountPresetId, setSelectedDiscountPresetId] = useState('')
  const [discountReference, setDiscountReference] = useState('')
  const [discountApprovalReason, setDiscountApprovalReason] = useState('')
  const [adjustmentRequests, setAdjustmentRequests] = useState([])
  const [adjustmentBusy, setAdjustmentBusy] = useState(false)
  const [clinicSettings, setClinicSettings] = useState({})
  const [finalizing, setFinalizing] = useState(false)
  const [loadingList, setLoadingList] = useState(true)
  const [loadingDetail, setLoadingDetail] = useState(false)
  const [catalogLoading, setCatalogLoading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [confirming, setConfirming] = useState(false)
  const [confirmOpen, setConfirmOpen] = useState(false)
  const [paymentRequestKey, setPaymentRequestKey] = useState('')
  const [listError, setListError] = useState('')
  const [detailError, setDetailError] = useState('')

  const serviceMap = useMemo(
    () => new Map((billingCatalog || []).map((service) => [Number(service.id), service])),
    [billingCatalog]
  )
  const inventoryMap = useMemo(
    () => new Map((inventoryItems || []).map((item) => [Number(item.id), item])),
    [inventoryItems]
  )

  const loadBills = async ({
    status = filter,
    preferredId = selectedId,
    targetPage = page,
    query = search,
    limit = pageSize,
  } = {}) => {
    setLoadingList(true)
    setListError('')
    try {
      const response = await getBills({ status, search: query, page: targetPage, limit })
      const list = Array.isArray(response?.items) ? response.items : []
      setBills(list)
      setPagination(response?.pagination || { page: targetPage, limit, total: list.length, totalPages: 1 })
      setSummary(response?.summary || { total: list.length, draft: 0, ready: 0, partially_paid: 0, paid: 0, outstanding: 0, collected: 0 })

      if (list.length === 0) {
        setSelectedId(null)
        setDetail(null)
        setDraft(null)
        return
      }

      const hasPreferred = preferredId && list.some((bill) => Number(bill.id) === Number(preferredId))
      if (!hasPreferred) setSelectedId(list[0].id)
    } catch (err) {
      const message = err.message || 'Billing records could not be loaded.'
      setListError(message)
      toast.error(message)
    } finally {
      setLoadingList(false)
    }
  }

  const loadBillDetail = async (billId) => {
    if (!billId) {
      setDetail(null)
      setDraft(null)
      setAdjustmentRequests([])
      return
    }

    setLoadingDetail(true)
    setDetailError('')
    try {
      const [bill, requests] = await Promise.all([
        getBillById(billId),
        getBillingAdjustmentRequests(billId).catch(() => []),
      ])
      setDetail(bill)
      setDraft(normalizeBillForEditor(bill))
      setAdjustmentRequests(Array.isArray(requests) ? requests : [])
    } catch (err) {
      const message = err.message || 'Billing details could not be loaded.'
      setDetailError(message)
      toast.error(message)
    } finally {
      setLoadingDetail(false)
    }
  }

  const loadCatalog = async (clinicType) => {
    setCatalogLoading(true)
    try {
      const rows = await getBillingCatalog(clinicType || '')
      setBillingCatalog(Array.isArray(rows) ? rows : [])
    } catch (err) {
      toast.error(err.message || 'Billing services could not be loaded.')
      setBillingCatalog([])
    } finally {
      setCatalogLoading(false)
    }
  }

  useEffect(() => {
    const timer = window.setTimeout(() => {
      loadBills({ status: filter, preferredId: null, targetPage: page, query: search, limit: pageSize })
    }, search ? 300 : 0)
    return () => window.clearTimeout(timer)
  }, [filter, page, pageSize, search])

  useEffect(() => {
    loadBillDetail(selectedId)
  }, [selectedId])

  useEffect(() => {
    Promise.all([getInventory(), getBillingPaymentSettings(), getDiscountPresets(), getClinicSettings()])
      .then(([inventoryRows, settings, presets, clinic]) => {
        setInventoryItems(Array.isArray(inventoryRows) ? inventoryRows : [])
        setPaymentSettings(settings || {})
        setDiscountPresets(Array.isArray(presets) ? presets : [])
        setClinicSettings(clinic || {})
      })
      .catch((error) => {
        setInventoryItems([])
        setPaymentSettings({})
        setDiscountPresets([])
        setClinicSettings({})
        toast.error(error.message || 'Billing inventory or payment setup could not be loaded.')
      })
  }, [])

  useEffect(() => {
    if (!detail?.clinic_type) {
      setBillingCatalog([])
      return
    }
    loadCatalog(detail.clinic_type)
  }, [detail?.clinic_type])

  useEffect(() => {
    if (!detail || discountPresets.length === 0) return
    const match = discountPresets.find((preset) => (
      String(preset.label || '').trim().toLowerCase() === String(detail.discount_label || '').trim().toLowerCase()
      && String(preset.discount_type || '') === String(detail.discount_type || '')
    ))
    setSelectedDiscountPresetId(match ? String(match.id) : '')
  }, [detail?.id, detail?.discount_label, detail?.discount_type, discountPresets])

  useEffect(() => {
    const handleRefresh = () => {
      loadBills({ status: filter, preferredId: selectedId, targetPage: page, query: search, limit: pageSize })
      if (selectedId) loadBillDetail(selectedId)
    }

    window.addEventListener('clinic:refresh', handleRefresh)
    return () => window.removeEventListener('clinic:refresh', handleRefresh)
  }, [filter, selectedId, page, pageSize, search])

  const filteredBills = bills


  const totals = computeEditorTotals(draft)
  const draftCount = Number(summary.draft ?? summary.pending) || 0
  const readyCount = Number(summary.ready) || 0
  const partialCount = Number(summary.partially_paid) || 0
  const paidCount = Number(summary.paid) || 0
  const totalOutstanding = Number(summary.outstanding) || 0
  const totalCollected = Number(summary.collected) || 0

  const selectedPaymentMethod = String(draft?.payment_method || '').toLowerCase()
  const showQr = selectedPaymentMethod === 'gcash' || selectedPaymentMethod === 'maya'
  const selectedQrUrl = selectedPaymentMethod === 'gcash' ? paymentSettings.gcash_qr_url : paymentSettings.maya_qr_url
  const isPaid = detail?.status === 'paid'
  const isDraft = ['draft', 'pending'].includes(detail?.status)
  const isReadyForPayment = ['ready', 'partially_paid'].includes(detail?.status)
  const isLocked = ['ready', 'partially_paid', 'paid', 'voided', 'refunded'].includes(detail?.status)
  const selectedDiscountPreset = discountPresets.find((preset) => Number(preset.id) === Number(selectedDiscountPresetId)) || null
  const discountApproval = selectedDiscountPreset
    ? adjustmentRequests.find((request) => request.request_type === 'discount' && Number(request.discount_preset_id) === Number(selectedDiscountPreset.id) && request.status === 'approved')
    : null
  const discountPending = selectedDiscountPreset
    ? adjustmentRequests.find((request) => request.request_type === 'discount' && Number(request.discount_preset_id) === Number(selectedDiscountPreset.id) && request.status === 'pending')
    : null

  const getPriceOverrideRequest = (item, statusValue) => adjustmentRequests.find((request) => (
    request.request_type === 'price_override'
    && Number(request.catalog_service_id) === Number(item.catalog_service_id)
    && request.status === statusValue
    && (statusValue !== 'approved' || Math.abs(Number(request.requested_price) - Number(item.requested_override_price || request.requested_price)) < 0.001)
  ))

  const updateDraftField = (field, value) => {
    setDraft((current) => ({ ...current, [field]: value }))
  }

  const updateDraftItem = (index, field, value) => {
    setDraft((current) => ({
      ...current,
      items: current.items.map((item, itemIndex) => (
        itemIndex === index ? { ...item, [field]: value } : item
      )),
    }))
  }

  const changeItemType = (index, itemType) => {
    setDraft((current) => ({
      ...current,
      items: current.items.map((item, itemIndex) => (
        itemIndex === index
          ? {
              ...makeBlankItem(itemType),
              quantity: 1,
              notes: item.notes || '',
            }
          : item
      )),
    }))
  }

  const addItem = (itemType) => {
    setDraft((current) => ({
      ...current,
      items: [...(current?.items || []), makeBlankItem(itemType)],
    }))
  }

  const removeItem = (index) => {
    setDraft((current) => ({
      ...current,
      items: current.items.length === 1
        ? [makeBlankItem('service')]
        : current.items.filter((_, itemIndex) => itemIndex !== index),
    }))
  }

  const handleServiceSelect = (index, rawServiceId) => {
    const serviceId = Number(rawServiceId) || 0
    const service = serviceMap.get(serviceId)
    if (!service) return

    setDraft((current) => ({
      ...current,
      items: current.items.map((item, itemIndex) => (
        itemIndex === index
          ? {
              ...item,
              item_type: 'service',
              catalog_service_id: service.id,
              source_inventory_id: '',
              category: service.category || '',
              service_name: service.service_name || '',
              quantity: Number(item.quantity) || 1,
              base_amount: roundMoney((Number(service.materials_cost) || 0) + (Number(service.consultation_fee) || 0)),
              markup_percentage: Number(service.profit_percentage) || 20,
              unit_price: Number(service.default_price ?? service.patient_price ?? service.suggested_price) || 0,
              details: buildServiceDetails(service),
            }
          : item
      )),
    }))
  }

  const handleSupplySelect = (index, rawInventoryId) => {
    const inventoryId = Number(rawInventoryId) || 0
    const inventoryItem = inventoryMap.get(inventoryId)
    if (!inventoryItem) return

    setDraft((current) => ({
      ...current,
      items: current.items.map((item, itemIndex) => (
        itemIndex === index
          ? {
              ...item,
              item_type: 'supply',
              source_inventory_id: inventoryItem.id,
              category: inventoryItem.category || 'Medicine / Supply',
              service_name: inventoryItem.name || '',
              quantity: Number(item.quantity) || 1,
              base_amount: Number(inventoryItem.price) || 0,
              markup_percentage: 0,
              unit_price: Number(inventoryItem.price) || 0,
              details: {
                source: 'inventory',
                inventory_id: inventoryItem.id,
                inventory_name: inventoryItem.name,
                unit: inventoryItem.unit || '',
              },
            }
          : item
      )),
    }))
  }

  const buildBillingPayload = ({ includePaymentKey = false } = {}) => ({
    items: serializeDraftItems(draft.items),
    discount_preset_id: selectedDiscountPresetId || null,
    discount_reference: discountReference || null,
    payment_method: draft.payment_method,
    payment_notes: draft.payment_notes,
    reference_number: draft.reference_number,
    payment_amount: draft.payment_amount,
    amount_received: draft.amount_received,
    ...(includePaymentKey ? { idempotency_key: paymentRequestKey || (globalThis.crypto?.randomUUID?.() || `${Date.now()}-${Math.random().toString(36).slice(2)}`) } : {}),
  })

  const validateBill = ({ forPayment = false } = {}) => {
    const validItems = serializeDraftItems(draft?.items || []).filter((item) => (
      item.service_name?.trim() && Number(item.quantity) > 0 && Number(item.unit_price) >= 0
    ))
    if (validItems.length === 0) return 'Add at least one complete bill item.'
    if (Number(draft.discount_amount || 0) > totals.subtotal) return 'The discount cannot be higher than the subtotal.'
    if (!forPayment) return ''
    if (!draft.payment_method) return 'Select a payment method.'
    if (draft.payment_method !== 'cash' && !String(draft.reference_number || '').trim()) return 'Enter the payment reference number.'
    const balance = Math.max(0, Number(detail?.balance_amount ?? totals.total) || 0)
    const paymentAmount = Math.max(0, Number(draft.payment_amount || 0) || 0)
    if (paymentAmount <= 0) return 'Enter a payment amount greater than zero.'
    if (paymentAmount > balance) return 'Payment amount cannot be higher than the remaining balance.'
    if (draft.payment_method === 'cash' && Number(draft.amount_received || 0) < paymentAmount) return 'Amount received cannot be lower than the payment amount.'
    return ''
  }

  const handleSave = async () => {
    if (!selectedId || !draft) return
    const validationMessage = validateBill()
    if (validationMessage) {
      toast.warning(validationMessage)
      return
    }
    setSaving(true)
    try {
      const updated = await updateBill(selectedId, buildBillingPayload())
      setDetail(updated)
      setDraft(normalizeBillForEditor(updated))
      toast.success('Bill saved.')
      await loadBills({ status: filter, preferredId: selectedId, targetPage: page, query: search, limit: pageSize })
    } catch (err) {
      toast.error(err.message || 'Bill could not be saved.')
    } finally {
      setSaving(false)
    }
  }

  const handleFinalize = async () => {
    if (!selectedId || !draft || !isDraft) return
    const validationMessage = validateBill()
    if (validationMessage) { toast.warning(validationMessage); return }
    setFinalizing(true)
    try {
      // Persist the final draft first, then lock the charges for payment.
      await updateBill(selectedId, buildBillingPayload())
      const updated = await finalizeBill(selectedId)
      setDetail(updated)
      setDraft(normalizeBillForEditor(updated))
      toast.success('Bill finalized and ready for payment.')
      await loadBills({ status: filter, preferredId: selectedId, targetPage: page, query: search, limit: pageSize })
    } catch (err) {
      toast.error(err.message || 'Bill could not be finalized.')
    } finally { setFinalizing(false) }
  }

  const applyDiscountPreset = (presetId) => {
    setSelectedDiscountPresetId(String(presetId || ''))
    setDiscountReference('')
    setDiscountApprovalReason('')
    const preset = discountPresets.find((row) => Number(row.id) === Number(presetId))
    if (!preset) {
      setDraft((current) => ({ ...current, discount_type: 'none', discount_label: '', discount_amount: 0 }))
      return
    }
    const value = Number(preset.value || 0)
    const amount = preset.discount_type === 'percentage'
      ? roundMoney(totals.subtotal * (value / 100))
      : Math.max(0, value)
    setDraft((current) => ({
      ...current,
      discount_type: preset.discount_type,
      discount_label: preset.label,
      discount_amount: Math.min(totals.subtotal, amount),
    }))
  }

  const requestDiscountApproval = async () => {
    const preset = discountPresets.find((row) => Number(row.id) === Number(selectedDiscountPresetId))
    if (!preset || !selectedId) return
    if (!discountApprovalReason.trim()) return toast.warning('Enter a reason for the administrator approval request.')
    if (Number(preset.requires_reference) === 1 && !discountReference.trim()) return toast.warning('Enter the required discount reference or ID.')
    setAdjustmentBusy(true)
    try {
      await requestBillingAdjustment(selectedId, {
        request_type: 'discount',
        discount_preset_id: preset.id,
        requested_amount: draft.discount_amount,
        reference: discountReference,
        reason: discountApprovalReason,
      })
      const rows = await getBillingAdjustmentRequests(selectedId)
      setAdjustmentRequests(Array.isArray(rows) ? rows : [])
      toast.success('Discount approval request sent to Admin.')
    } catch (err) { toast.error(err.message || 'Approval request could not be sent.') }
    finally { setAdjustmentBusy(false) }
  }

  const requestPriceOverride = async (index) => {
    const item = draft?.items?.[index]
    if (!selectedId || !item?.catalog_service_id) return
    const requestedPrice = Number(item.requested_override_price)
    if (!Number.isFinite(requestedPrice) || requestedPrice < 0) return toast.warning('Enter a valid requested patient price.')
    if (!String(item.override_request_reason || '').trim()) return toast.warning('Enter a reason for the price override request.')
    setAdjustmentBusy(true)
    try {
      await requestBillingAdjustment(selectedId, {
        request_type: 'price_override',
        catalog_service_id: item.catalog_service_id,
        requested_price: requestedPrice,
        reason: item.override_request_reason,
      })
      const rows = await getBillingAdjustmentRequests(selectedId)
      setAdjustmentRequests(Array.isArray(rows) ? rows : [])
      toast.success('Price override request sent to Admin.')
    } catch (err) { toast.error(err.message || 'Price override request could not be sent.') }
    finally { setAdjustmentBusy(false) }
  }

  const applyApprovedPriceOverride = (index, approval) => {
    updateDraftItem(index, 'unit_price', Number(approval.requested_price) || 0)
    updateDraftItem(index, 'price_overridden', true)
    updateDraftItem(index, 'override_reason', approval.reason || approval.admin_note || 'Administrator approved')
  }

  const requestPaymentConfirmation = () => {
    if (!selectedId || !draft) return
    const validationMessage = validateBill({ forPayment: true })
    if (validationMessage) {
      toast.warning(validationMessage)
      return
    }
    setPaymentRequestKey(globalThis.crypto?.randomUUID?.() || `${Date.now()}-${Math.random().toString(36).slice(2)}`)
    setConfirmOpen(true)
  }

  const handleConfirmPayment = async () => {
    if (!selectedId || !draft) return
    setConfirming(true)
    try {
      const updated = await payBill(selectedId, buildBillingPayload({ includePaymentKey: true }))
      setDetail(updated)
      setDraft(normalizeBillForEditor(updated))
      setConfirmOpen(false)
      setPaymentRequestKey('')
      toast.success(`Payment confirmed${updated?.payments?.[0]?.receipt_number ? ` · ${updated.payments[0].receipt_number}` : '.'}`)
      await loadBills({ status: filter, preferredId: selectedId, targetPage: page, query: search, limit: pageSize })
    } catch (err) {
      toast.error(err.message || 'Payment could not be confirmed.')
    } finally {
      setConfirming(false)
    }
  }

  const printReceipt = (payment) => {
    if (!payment || !detail) return
    const popup = window.open('', '_blank', 'width=760,height=900')
    if (!popup) return toast.warning('Allow pop-ups to print the receipt.')
    const esc = (value) => String(value ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
    const rows = (detail.items || []).map((item) => `<tr><td>${esc(item.service_name)}</td><td style="text-align:center">${esc(item.quantity)}</td><td style="text-align:right">${esc(formatMoney(item.unit_price))}</td><td style="text-align:right">${esc(formatMoney(item.line_total))}</td></tr>`).join('')
    popup.document.write(`<!doctype html><html><head><meta charset="utf-8"><title>${esc(payment.receipt_number || 'Receipt')}</title><style>@page{size:A5;margin:12mm}body{font-family:Arial,sans-serif;color:#0f172a;margin:0;font-size:12px}h1,p{margin:0}.head{text-align:center;border-bottom:2px solid #0f172a;padding-bottom:10px}.meta{margin:14px 0;display:grid;grid-template-columns:1fr 1fr;gap:6px}.meta div:nth-child(even){text-align:right}table{width:100%;border-collapse:collapse;margin-top:10px}th,td{padding:7px;border-bottom:1px solid #e2e8f0}th{text-align:left;font-size:10px;text-transform:uppercase;color:#64748b}.totals{margin-top:12px;margin-left:auto;width:230px}.line{display:flex;justify-content:space-between;padding:4px 0}.total{font-size:15px;font-weight:700;border-top:2px solid #0f172a;padding-top:7px}.footer{margin-top:28px;text-align:center;color:#64748b;font-size:10px}</style></head><body><div class="head"><h1>${esc(clinicSettings.clinic_name || 'CARAIT MEDICAL AND DERMATOLOGY CLINIC')}</h1>${clinicSettings.address ? `<p>${esc(clinicSettings.address)}</p>` : ''}${clinicSettings.phone ? `<p>${esc(clinicSettings.phone)}</p>` : ''}<p style="margin-top:7px;font-weight:700">OFFICIAL PAYMENT RECEIPT</p></div><div class="meta"><div><strong>Receipt:</strong> ${esc(payment.receipt_number || '—')}</div><div>${esc(new Date(payment.paid_at || Date.now()).toLocaleString('en-PH'))}</div><div><strong>Patient:</strong> ${esc(detail.patient_name)}</div><div><strong>Doctor:</strong> ${esc(detail.doctor_name)}</div><div><strong>Method:</strong> ${esc(String(payment.payment_method || '').replace(/_/g, ' '))}</div><div>${payment.reference_number ? `<strong>Reference:</strong> ${esc(payment.reference_number)}` : ''}</div></div><table><thead><tr><th>Item</th><th style="text-align:center">Qty</th><th style="text-align:right">Price</th><th style="text-align:right">Amount</th></tr></thead><tbody>${rows}</tbody></table><div class="totals"><div class="line"><span>Bill Total</span><strong>${esc(formatMoney(detail.total_amount))}</strong></div><div class="line"><span>This Payment</span><strong>${esc(formatMoney(payment.amount))}</strong></div><div class="line"><span>Paid to Date</span><strong>${esc(formatMoney(detail.paid_amount))}</strong></div><div class="line total"><span>Balance</span><span>${esc(formatMoney(detail.balance_amount))}</span></div></div><p class="footer">${esc(clinicSettings.receipt_footer || 'Thank you. Please keep this receipt for your records.')}</p></body></html>`)
    popup.document.close()
    popup.focus()
    popup.onload = () => popup.print()
  }


  return (
    <div className="mx-auto max-w-7xl space-y-5">
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div>
          <h1 className="text-xl lg:text-2xl font-bold text-slate-800 flex items-center gap-2">
            <MdPayments className="text-sky-500 text-[22px]" /> Billing
          </h1>
          <p className="text-xs lg:text-sm text-slate-500 mt-0.5">
            Review consultation charges, finalize the bill, then collect full or partial payments. Inventory movements are recorded per batch before payment.
          </p>
        </div>
        <button
          onClick={() => {
            loadBills({ status: filter, preferredId: selectedId, targetPage: page, query: search, limit: pageSize })
            if (selectedId) loadBillDetail(selectedId)
          }}
          className="flex items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-semibold text-slate-600 hover:bg-slate-50 transition-colors"
        >
          <MdRefresh className="text-[16px]" /> Refresh
        </button>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        {[
          { label: 'Draft', value: draftCount, tone: 'text-slate-700 bg-slate-50 border-slate-200' },
          { label: 'Ready / Partial', value: readyCount + partialCount, tone: 'text-sky-700 bg-sky-50 border-sky-200' },
          { label: 'Collected', value: formatMoney(totalCollected), tone: 'text-emerald-700 bg-emerald-50 border-emerald-200' },
          { label: 'Outstanding', value: formatMoney(totalOutstanding), tone: 'text-violet-700 bg-violet-50 border-violet-200' },
        ].map((card) => (
          <div key={card.label} className={`rounded-2xl border p-4 shadow-sm ${card.tone}`}>
            <p className="text-[11px] font-bold uppercase tracking-widest opacity-80">{card.label}</p>
            <p className="mt-2 text-2xl font-black">{card.value}</p>
          </div>
        ))}
      </div>

      <div className="grid gap-5 lg:grid-cols-[360px_minmax(0,1fr)]">
        <div className="space-y-4">
          <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
            <div className="flex flex-wrap gap-2">
              {STATUS_FILTERS.map((option) => (
                <button
                  key={option.label}
                  onClick={() => { setFilter(option.value); setPage(1) }}
                  className={`rounded-xl px-3 py-2 text-xs font-bold transition-colors ${
                    filter === option.value
                      ? 'bg-[#0b1a2c] text-sky-400'
                      : 'bg-slate-100 text-slate-500 hover:bg-slate-200'
                  }`}
                >
                  {option.label}
                </button>
              ))}
            </div>

            <div className="relative mt-3">
              <MdSearch className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 text-[18px]" />
              <input
                type="text"
                aria-label="Search billing records"
                value={search}
                onChange={(e) => { setSearch(e.target.value); setPage(1) }}
                placeholder="Search patient or doctor..."
                className="w-full rounded-2xl border border-slate-200 bg-slate-50 py-3 pl-10 pr-10 text-sm text-slate-700 focus:outline-none focus:border-sky-400 focus:ring-2 focus:ring-sky-400/10"
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

          <div className="rounded-2xl border border-slate-200 bg-white shadow-sm overflow-hidden">
            <div className="border-b border-slate-100 px-4 py-3">
              <p className="text-[11px] font-bold uppercase tracking-widest text-slate-400">
                {filteredBills.length} billing record{filteredBills.length !== 1 ? 's' : ''}
              </p>
            </div>

            {loadingList ? (
              <LoadingState label="Loading billing records..." />
            ) : listError ? (
              <ErrorState message={listError} onRetry={() => loadBills({ status: filter, preferredId: selectedId, targetPage: page, query: search, limit: pageSize })} />
            ) : filteredBills.length === 0 ? (
              <EmptyState title="No billing records found" description="Bills appear after a doctor completes a consultation." />
            ) : (
              <div className="divide-y divide-slate-100">
                {filteredBills.map((bill) => {
                  const active = bill.id === selectedId
                  return (
                    <button
                      key={bill.id}
                      onClick={() => setSelectedId(bill.id)}
                      className={`w-full px-4 py-3.5 text-left transition-colors ${
                        active ? 'bg-sky-50' : 'hover:bg-slate-50'
                      }`}
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <p className="text-sm font-bold text-slate-800 truncate">{bill.patient_name}</p>
                          <p className="mt-0.5 text-xs text-slate-500 truncate">{bill.doctor_name}</p>
                        </div>
                        {(() => {
                          const meta = getBillStatusMeta(bill.status)
                          return <span className={`shrink-0 rounded-full border px-2 py-0.5 text-[10px] font-bold ${meta.tone}`}>{meta.label}</span>
                        })()}
                      </div>
                      <div className="mt-2 flex flex-wrap items-center gap-3 text-[11px] text-slate-400">
                        <span className="flex items-center gap-1">
                          <MdCalendarToday className="text-[12px]" />
                          {bill.appointment_date}
                        </span>
                        <span className="flex items-center gap-1">
                          <MdAccessTime className="text-[12px]" />
                          {bill.appointment_time || '—'}
                        </span>
                      </div>
                      {bill.appointment_reason && (
                        <p className="mt-2 inline-block rounded-lg bg-slate-100 px-2.5 py-1 text-[11px] text-slate-500">
                          {bill.appointment_reason}
                        </p>
                      )}
                      <div className="mt-2 flex items-end justify-between gap-2">
                        <div className="text-sm font-black text-slate-800">{formatMoney(bill.total_amount)}</div>
                        {Number(bill.balance_amount || 0) > 0 && bill.status !== 'draft' && (
                          <div className="text-[11px] font-bold text-amber-700">Balance {formatMoney(bill.balance_amount)}</div>
                        )}
                      </div>
                    </button>
                  )
                })}
              </div>
            )}
            {!loadingList && !listError && (
              <Pagination
                page={pagination.page}
                totalPages={pagination.totalPages}
                total={pagination.total}
                pageSize={pagination.limit}
                onPageChange={setPage}
                onPageSizeChange={(nextSize) => { setPageSize(nextSize); setPage(1) }}
              />
            )}
          </div>
        </div>

        <div className="rounded-2xl border border-slate-200 bg-white shadow-sm overflow-hidden">
          {loadingDetail ? (
            <LoadingState label="Loading bill details..." />
          ) : detailError ? (
            <ErrorState message={detailError} onRetry={() => loadBillDetail(selectedId)} />
          ) : !detail || !draft ? (
            <div className="flex min-h-[480px] flex-col items-center justify-center px-8 text-center">
              <MdPayments className="mb-3 text-[38px] text-slate-200" />
              <p className="text-sm font-semibold text-slate-500">Select a billing record</p>
              <p className="mt-1 text-xs text-slate-400">Its details and payment actions will appear here.</p>
            </div>
          ) : (
            <div className="space-y-5 p-5 lg:p-6">
              <div className="flex items-start justify-between gap-3 flex-wrap">
                <div>
                  <p className="text-[11px] font-bold uppercase tracking-widest text-slate-400">
                    Bill #{detail.id}
                  </p>
                  <h2 className="mt-1 text-lg font-bold text-slate-800">{detail.patient_name}</h2>
                  <div className="mt-1 flex flex-wrap items-center gap-3 text-xs text-slate-500">
                    <span className="flex items-center gap-1">
                      <MdPerson className="text-[13px]" /> {detail.doctor_name}
                    </span>
                    <span className="flex items-center gap-1">
                      <MdCalendarToday className="text-[13px]" /> {detail.appointment_date}
                    </span>
                    <span className="flex items-center gap-1">
                      <MdAccessTime className="text-[13px]" /> {detail.appointment_time || '—'}
                    </span>
                  </div>
                </div>
                {(() => {
                  const meta = getBillStatusMeta(detail.status)
                  return <span className={`rounded-full border px-3 py-1 text-xs font-bold ${meta.tone}`}>{meta.label}</span>
                })()}
              </div>

              <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
                {[
                  { label: 'Clinic', value: detail.clinic_type === 'derma' ? 'Dermatology' : 'General Medicine', icon: MdLocalHospital, tone: 'bg-sky-50 text-sky-700 border-sky-100' },
                  { label: 'Reason', value: detail.appointment_reason || 'Not specified', icon: MdReceiptLong, tone: 'bg-violet-50 text-violet-700 border-violet-100' },
                  { label: 'Patient Phone', value: detail.patient_phone || '—', icon: MdPerson, tone: 'bg-emerald-50 text-emerald-700 border-emerald-100' },
                  { label: 'Catalog Status', value: catalogLoading ? 'Loading services...' : `${billingCatalog.length} services`, icon: MdPayments, tone: 'bg-amber-50 text-amber-700 border-amber-100' },
                ].map((card) => {
                  const Icon = card.icon
                  return (
                    <div key={card.label} className={`rounded-2xl border p-4 ${card.tone}`}>
                      <div className="flex items-center gap-2">
                        <Icon className="text-[18px]" />
                        <p className="text-[11px] font-bold uppercase tracking-widest opacity-80">{card.label}</p>
                      </div>
                      <p className="mt-2 text-sm font-black">{card.value}</p>
                    </div>
                  )
                })}
              </div>

              <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_320px]">
                <div className="space-y-4">
                  <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                    <div className="flex items-start justify-between gap-3 flex-wrap">
                      <div>
                        <h3 className="text-sm font-bold text-slate-800">Bill Items</h3>
                        <p className="mt-1 text-xs text-slate-500">
                          Choose a clinic service for automatic materials, service fee, and markup, then add extra medicines or custom charges if needed.
                        </p>
                      </div>
                      {isDraft && (
                        <div className="flex flex-wrap gap-2">
                          <button
                            onClick={() => addItem('service')}
                            className="flex items-center gap-1 rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-bold text-slate-600 hover:bg-slate-50"
                          >
                            <MdAdd className="text-[14px]" /> Service
                          </button>
                          <button
                            onClick={() => addItem('supply')}
                            className="flex items-center gap-1 rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-bold text-slate-600 hover:bg-slate-50"
                          >
                            <MdAdd className="text-[14px]" /> Supply
                          </button>
                          <button
                            onClick={() => addItem('custom')}
                            className="flex items-center gap-1 rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-bold text-slate-600 hover:bg-slate-50"
                          >
                            <MdAdd className="text-[14px]" /> Custom
                          </button>
                        </div>
                      )}
                    </div>

                    <div className="mt-4 space-y-3">
                      {draft.items.map((item, index) => {
                        const itemTotal = roundMoney((Number(item.quantity) || 0) * (Number(item.unit_price) || 0))
                        const itemType = item.item_type || 'custom'

                        return (
                          <div key={item.id || index} className="rounded-2xl border border-slate-200 bg-white p-4">
                            <div className="flex items-start justify-between gap-3">
                              <div>
                                <p className="text-xs font-bold uppercase tracking-widest text-slate-400">
                                  Item {index + 1}
                                </p>
                                <p className="mt-1 text-sm font-semibold text-slate-700">
                                  {ITEM_TYPES.find((option) => option.value === itemType)?.label || 'Charge'}
                                </p>
                              </div>
                              {isDraft && (
                                <button
                                  onClick={() => removeItem(index)}
                                  className="rounded-lg p-1 text-slate-300 hover:bg-red-50 hover:text-red-500"
                                >
                                  <MdClose className="text-[16px]" />
                                </button>
                              )}
                            </div>

                            <div className="mt-3 grid gap-3 md:grid-cols-2">
                              <div>
                                <label className="mb-1.5 block text-[11px] font-bold uppercase tracking-widest text-slate-400">
                                  Item Type
                                </label>
                                <select
                                  value={itemType}
                                  disabled={!isDraft}
                                  onChange={(e) => changeItemType(index, e.target.value)}
                                  className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 text-sm focus:outline-none focus:border-sky-400 disabled:opacity-70"
                                >
                                  {ITEM_TYPES.map((option) => (
                                    <option key={option.value} value={option.value}>{option.label}</option>
                                  ))}
                                </select>
                              </div>

                              {itemType === 'service' ? (
                                <div>
                                  <label className="mb-1.5 block text-[11px] font-bold uppercase tracking-widest text-slate-400">
                                    Service
                                  </label>
                                  <select
                                    value={item.catalog_service_id}
                                    disabled={!isDraft || catalogLoading}
                                    onChange={(e) => handleServiceSelect(index, e.target.value)}
                                    className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 text-sm focus:outline-none focus:border-sky-400 disabled:opacity-70"
                                  >
                                    <option value="">Select service</option>
                                    {billingCatalog.map((service) => (
                                      <option key={service.id} value={service.id}>
                                        {service.category} - {service.service_name} ({formatMoney(service.default_price ?? service.patient_price ?? service.suggested_price)})
                                      </option>
                                    ))}
                                  </select>
                                </div>
                              ) : itemType === 'supply' ? (
                                <div>
                                  <label className="mb-1.5 block text-[11px] font-bold uppercase tracking-widest text-slate-400">
                                    Inventory Item
                                  </label>
                                  <select
                                    value={item.source_inventory_id}
                                    disabled={!isDraft}
                                    onChange={(e) => handleSupplySelect(index, e.target.value)}
                                    className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 text-sm focus:outline-none focus:border-sky-400 disabled:opacity-70"
                                  >
                                    <option value="">Select medicine or supply</option>
                                    {inventoryItems.map((inventoryItem) => (
                                      <option key={inventoryItem.id} value={inventoryItem.id}>
                                        {inventoryItem.category} - {inventoryItem.name} ({formatMoney(inventoryItem.price)})
                                      </option>
                                    ))}
                                  </select>
                                </div>
                              ) : (
                                <div>
                                  <label className="mb-1.5 block text-[11px] font-bold uppercase tracking-widest text-slate-400">
                                    Charge Name
                                  </label>
                                  <input
                                    type="text"
                                    value={item.service_name}
                                    disabled={!isDraft}
                                    onChange={(e) => updateDraftItem(index, 'service_name', e.target.value)}
                                    placeholder="Custom charge name"
                                    className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 text-sm focus:outline-none focus:border-sky-400 disabled:opacity-70"
                                  />
                                </div>
                              )}

                              {itemType !== 'service' && (
                                <div>
                                  <label className="mb-1.5 block text-[11px] font-bold uppercase tracking-widest text-slate-400">
                                    Category
                                  </label>
                                  <input
                                    type="text"
                                    value={item.category}
                                    disabled={!isDraft}
                                    onChange={(e) => updateDraftItem(index, 'category', e.target.value)}
                                    placeholder="Category"
                                    className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 text-sm focus:outline-none focus:border-sky-400 disabled:opacity-70"
                                  />
                                </div>
                              )}

                              <div>
                                <label className="mb-1.5 block text-[11px] font-bold uppercase tracking-widest text-slate-400">
                                  Quantity
                                </label>
                                <input
                                  type="number"
                                  min="0"
                                  step="0.01"
                                  value={item.quantity}
                                  disabled={!isDraft}
                                  onChange={(e) => updateDraftItem(index, 'quantity', e.target.value)}
                                  className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 text-sm focus:outline-none focus:border-sky-400 disabled:opacity-70"
                                />
                              </div>

                              <div>
                                <label className="mb-1.5 block text-[11px] font-bold uppercase tracking-widest text-slate-400">
                                  Unit Price
                                </label>
                                <input
                                  type="number"
                                  min="0"
                                  step="0.01"
                                  value={item.unit_price}
                                  disabled={!isDraft || itemType === 'service'}
                                  onChange={(e) => updateDraftItem(index, 'unit_price', e.target.value)}
                                  placeholder="Unit price"
                                  className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 text-sm focus:outline-none focus:border-sky-400 disabled:opacity-70"
                                />
                              </div>
                            </div>

                            {itemType === 'service' && (
                              <>
                                <ServiceBreakdown item={item} />
                                {isDraft && item.catalog_service_id && (() => {
                                  const approved = getPriceOverrideRequest(item, 'approved')
                                  const pending = getPriceOverrideRequest(item, 'pending')
                                  return (
                                    <div className="mt-3 rounded-2xl border border-violet-200 bg-violet-50 p-4">
                                      <p className="text-xs font-bold uppercase tracking-widest text-violet-700">Patient Price Override</p>
                                      <p className="mt-1 text-xs text-violet-600">Changing a clinic service price requires administrator approval. The catalog Patient Price remains the default until an approved request is applied.</p>
                                      {item.price_overridden ? (
                                        <div className="mt-3 rounded-xl bg-white px-3 py-2 text-sm text-violet-800">
                                          <strong>Approved override applied:</strong> {formatMoney(item.unit_price)}
                                        </div>
                                      ) : approved ? (
                                        <div className="mt-3 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2">
                                          <span className="text-sm font-semibold text-emerald-800">Approved: {formatMoney(approved.requested_price)}</span>
                                          <button type="button" className="button-primary" onClick={() => applyApprovedPriceOverride(index, approved)}>Apply Approved Price</button>
                                        </div>
                                      ) : pending ? (
                                        <p className="mt-3 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-xs font-semibold text-amber-700">Waiting for Admin approval · Requested {formatMoney(pending.requested_price)}</p>
                                      ) : (
                                        <div className="mt-3 grid gap-2 sm:grid-cols-[150px_1fr_auto]">
                                          <input type="number" min="0" step="0.01" className="form-control" placeholder="Requested price" value={item.requested_override_price || ''} onChange={(e) => updateDraftItem(index, 'requested_override_price', e.target.value)} />
                                          <input type="text" className="form-control" placeholder="Reason for override" value={item.override_request_reason || ''} onChange={(e) => updateDraftItem(index, 'override_request_reason', e.target.value)} />
                                          <button type="button" disabled={adjustmentBusy} className="button-secondary" onClick={() => requestPriceOverride(index)}>Request Approval</button>
                                        </div>
                                      )}
                                    </div>
                                  )
                                })()}
                              </>
                            )}

                            {itemType === 'supply' && item.source_inventory_id && (
                              <div className="mt-3 rounded-xl border border-emerald-100 bg-emerald-50 px-4 py-3 text-sm text-emerald-800">
                                <p className="font-semibold">Additional supply item</p>
                                <p className="mt-1 text-xs text-emerald-700">
                                  When this draft is finalized, the item is dispensed from the earliest-expiring available batch and the exact batch/lot is recorded. Patient pricing can still be reviewed while the bill is a draft.
                                </p>
                              </div>
                            )}

                            <label className="mt-3 mb-1.5 block text-[11px] font-bold uppercase tracking-widest text-slate-400">Item Notes</label>
                            <textarea
                              aria-label={`Notes for bill item ${index + 1}`}
                              value={item.notes}
                              onChange={(e) => updateDraftItem(index, 'notes', e.target.value)}
                              disabled={!isDraft}
                              rows={2}
                              placeholder="Notes (optional)"
                              className="mt-3 w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 text-sm focus:outline-none focus:border-sky-400 disabled:opacity-70"
                            />

                            <p className="mt-3 text-right text-sm font-bold text-slate-700">
                              Line Total: {formatMoney(itemTotal)}
                            </p>
                          </div>
                        )
                      })}
                    </div>
                  </div>
                </div>

                <div className="space-y-4">
                  <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                    <h3 className="text-sm font-bold text-slate-800">{isDraft ? 'Discount & Final Review' : 'Payment Details'}</h3>

                    <div className="mt-3 space-y-3">
                      {isReadyForPayment && (
                        <>
                          <label className="form-label" htmlFor="payment-method">Payment Method</label>
                          <select
                            id="payment-method"
                            aria-label="Payment method"
                            value={draft.payment_method}
                            onChange={(e) => updateDraftField('payment_method', e.target.value)}
                            className="form-control"
                          >
                            <option value="">Select payment method</option>
                            {PAYMENT_OPTIONS.map((option) => (
                              <option key={option.value} value={option.value}>{option.label}</option>
                            ))}
                          </select>

                          <label className="form-label" htmlFor="payment-reference">Reference Number</label>
                          <input
                            id="payment-reference"
                            type="text"
                            aria-label="Payment reference number"
                            value={draft.reference_number}
                            onChange={(e) => updateDraftField('reference_number', e.target.value)}
                            disabled={!draft.payment_method || draft.payment_method === 'cash'}
                            placeholder="Required for digital/bank payments"
                            className="form-control disabled:opacity-60"
                          />

                          <label className="form-label" htmlFor="payment-amount">Payment Amount</label>
                          <input
                            id="payment-amount"
                            type="number"
                            min="0.01"
                            max={Math.max(0, Number(detail.balance_amount ?? totals.total) || 0)}
                            step="0.01"
                            value={draft.payment_amount}
                            onChange={(e) => updateDraftField('payment_amount', e.target.value)}
                            className="form-control"
                          />
                          <p className="form-helper">Remaining balance: {formatMoney(detail.balance_amount ?? totals.total)}</p>

                          {draft.payment_method === 'cash' && (
                            <>
                              <label className="form-label" htmlFor="amount-received">Cash Received</label>
                              <input
                                id="amount-received"
                                type="number"
                                min="0"
                                step="0.01"
                                value={draft.amount_received}
                                onChange={(e) => updateDraftField('amount_received', e.target.value)}
                                className="form-control"
                              />
                              {Number(draft.amount_received || 0) >= Number(draft.payment_amount || 0) && Number(draft.payment_amount || 0) > 0 && (
                                <p className="rounded-xl bg-emerald-50 px-3 py-2 text-xs font-bold text-emerald-700">
                                  Change: {formatMoney(Math.max(0, Number(draft.amount_received || 0) - Number(draft.payment_amount || 0)))}
                                </p>
                              )}
                            </>
                          )}
                        </>
                      )}

                      {isDraft && (
                        <div className="space-y-3">
                          <label className="form-label" htmlFor="discount-preset">Discount</label>
                          <select id="discount-preset" className="form-control" value={selectedDiscountPresetId} onChange={(e) => applyDiscountPreset(e.target.value)}>
                            <option value="">No discount</option>
                            {discountPresets.filter((preset) => preset.is_active !== 0).map((preset) => (
                              <option key={preset.id} value={preset.id}>
                                {preset.label} · {preset.discount_type === 'percentage' ? `${Number(preset.value || 0)}%` : formatMoney(preset.value)}{Number(preset.requires_admin_approval) === 1 ? ' · Admin approval' : ''}
                              </option>
                            ))}
                          </select>

                          {selectedDiscountPreset && Number(selectedDiscountPreset.requires_reference) === 1 && (
                            <>
                              <label className="form-label" htmlFor="discount-reference">Discount Reference / ID</label>
                              <input id="discount-reference" className="form-control" value={discountReference} onChange={(e) => setDiscountReference(e.target.value)} placeholder="Required reference or ID" />
                            </>
                          )}

                          {selectedDiscountPreset && (
                            <div className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm">
                              <div className="flex items-center justify-between gap-3"><span className="text-slate-500">Calculated discount</span><strong className="text-slate-800">{formatMoney(totals.discount)}</strong></div>
                            </div>
                          )}

                          {selectedDiscountPreset && Number(selectedDiscountPreset.requires_admin_approval) === 1 && !discountApproval && (
                            discountPending ? (
                              <p className="rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-xs font-semibold text-amber-700">Waiting for Admin approval.</p>
                            ) : (
                              <>
                                <label className="form-label" htmlFor="discount-approval-reason">Approval Reason</label>
                                <textarea id="discount-approval-reason" rows={2} className="form-control" value={discountApprovalReason} onChange={(e) => setDiscountApprovalReason(e.target.value)} placeholder="Why is this discount being requested?" />
                                <button type="button" disabled={adjustmentBusy} className="button-secondary w-full justify-center" onClick={requestDiscountApproval}>Request Admin Approval</button>
                              </>
                            )
                          )}
                          {discountApproval && <p className="rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs font-semibold text-emerald-700">Administrator approval received. Save/finalize the bill to apply it.</p>}
                        </div>
                      )}

                      <label className="form-label" htmlFor="payment-notes">Payment Notes</label>
                      <textarea
                        id="payment-notes"
                        aria-label="Payment notes"
                        value={draft.payment_notes}
                        onChange={(e) => updateDraftField('payment_notes', e.target.value)}
                        disabled={!isReadyForPayment}
                        rows={3}
                        placeholder="Payment notes or confirmation details"
                        className="form-control disabled:opacity-70"
                      />
                    </div>
                  </div>

                  {isReadyForPayment && showQr && (
                    <div className="rounded-2xl border border-emerald-200 bg-emerald-50 p-4">
                      <p className="text-sm font-bold text-emerald-800">
                        {selectedPaymentMethod === 'gcash' ? 'GCash' : 'Maya'} QR
                      </p>
                      <p className="mt-1 text-xs leading-relaxed text-emerald-700">
                        Show this QR to the patient, wait for the confirmation screen, then click confirm payment below.
                      </p>
                      {selectedQrUrl ? (
                        <img
                          src={selectedQrUrl}
                          alt={`${selectedPaymentMethod === 'gcash' ? 'GCash' : 'Maya'} clinic payment QR`}
                          className="mt-3 w-full rounded-2xl border border-emerald-200 bg-white p-3"
                        />
                      ) : (
                        <p className="mt-3 rounded-xl border border-dashed border-emerald-300 px-3 py-4 text-center text-xs font-semibold text-emerald-700">
                          No QR image is configured. Ask an administrator to add it in Admin → Service Catalog → Payment Setup.
                        </p>
                      )}
                    </div>
                  )}

                  <div className="rounded-2xl border border-slate-200 bg-white p-4">
                    <h3 className="text-sm font-bold text-slate-800">Summary</h3>
                    <div className="mt-3 space-y-2 text-sm">
                      <div className="flex items-center justify-between text-slate-500">
                        <span>Bill Items</span>
                        <span>{draft.items.length}</span>
                      </div>
                      <div className="flex items-center justify-between text-slate-500">
                        <span>Subtotal</span>
                        <span>{formatMoney(totals.subtotal)}</span>
                      </div>
                      <div className="flex items-center justify-between text-slate-500">
                        <span>Discount</span>
                        <span>{formatMoney(totals.discount)}</span>
                      </div>
                      <div className="flex items-center justify-between border-t border-slate-100 pt-2 text-base font-black text-slate-800">
                        <span>Total</span>
                        <span>{formatMoney(totals.total)}</span>
                      </div>
                      {!isDraft && (
                        <>
                          <div className="flex items-center justify-between text-slate-500">
                            <span>Paid</span>
                            <span>{formatMoney(detail.paid_amount || 0)}</span>
                          </div>
                          <div className="flex items-center justify-between font-bold text-amber-700">
                            <span>Balance</span>
                            <span>{formatMoney(detail.balance_amount || 0)}</span>
                          </div>
                        </>
                      )}
                    </div>

                    <div className="mt-3 rounded-xl border border-sky-100 bg-sky-50 px-4 py-3 text-xs text-sky-700">
                      Catalog services keep their patient-facing price snapshot. Clinical consumables are recorded when the doctor completes the consultation; take-home supplies are dispensed per batch when this bill is finalized. Payment changes money only.
                    </div>

                    {detail.confirmed_by_staff_name && (
                      <p className="mt-3 text-xs text-slate-400">
                        Confirmed by {detail.confirmed_by_staff_name}
                        {detail.paid_at ? ` on ${detail.paid_at}` : ''}.
                      </p>
                    )}

                    <div className="mt-4 flex flex-col gap-2">
                      {isDraft && (
                        <>
                          <button
                            onClick={handleSave}
                            disabled={saving || finalizing}
                            className="rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-bold text-slate-700 hover:bg-slate-50 disabled:opacity-60"
                          >
                            {saving ? 'Saving...' : 'Save Draft'}
                          </button>
                          <button
                            onClick={handleFinalize}
                            disabled={saving || finalizing}
                            className="rounded-xl bg-sky-600 px-4 py-2.5 text-sm font-bold text-white hover:bg-sky-700 disabled:opacity-60"
                          >
                            {finalizing ? 'Finalizing...' : 'Finalize & Lock Charges'}
                          </button>
                        </>
                      )}
                      {isReadyForPayment && (
                        <button
                          onClick={requestPaymentConfirmation}
                          disabled={confirming}
                          className="flex items-center justify-center gap-1.5 rounded-xl bg-emerald-500 px-4 py-2.5 text-sm font-bold text-white hover:bg-emerald-600 disabled:opacity-60"
                        >
                          <MdCheck className="text-[16px]" />
                          {confirming ? 'Recording...' : `Record ${formatMoney(draft.payment_amount || 0)} Payment`}
                        </button>
                      )}
                      {isPaid && <p className="rounded-xl bg-emerald-50 px-4 py-2.5 text-center text-sm font-bold text-emerald-700">Paid in Full</p>}
                    </div>
                  </div>

                  {Array.isArray(detail.payments) && detail.payments.length > 0 && (
                    <div className="rounded-2xl border border-slate-200 bg-white p-4">
                      <h3 className="text-sm font-bold text-slate-800">Payment History</h3>
                      <div className="mt-3 space-y-2">
                        {detail.payments.map((payment) => (
                          <div key={payment.id} className="rounded-xl border border-slate-200 bg-slate-50 p-3 text-xs">
                            <div className="flex items-center justify-between gap-3">
                              <span className="font-black text-slate-800">{payment.receipt_number}</span>
                              <span className="font-black text-emerald-600">{formatMoney(payment.amount)}</span>
                            </div>
                            <p className="mt-1 text-slate-500">{String(payment.payment_method || '').replace(/_/g, ' ')} · {payment.paid_at}</p>
                            {payment.status && payment.status !== 'completed' && <p className="mt-1 font-bold uppercase text-rose-600">{payment.status}</p>}
                            {payment.reference_number && <p className="mt-1 text-slate-500">Reference: {payment.reference_number}</p>}
                            {payment.status === 'completed' && <button type="button" onClick={() => printReceipt(payment)} className="mt-2 rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-[11px] font-bold text-slate-600 hover:bg-slate-100">Print Receipt</button>}
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  <div className="rounded-2xl border border-slate-200 bg-white p-4">
                    <h3 className="text-sm font-bold text-slate-800">What staff should verify</h3>
                    <ul className="mt-3 space-y-2 text-sm text-slate-600">
                      <li className="flex items-start gap-2">
                        <MdCheck className="mt-0.5 text-emerald-500" />
                        Confirm the selected clinic service matches the procedure actually performed.
                      </li>
                      <li className="flex items-start gap-2">
                        <MdInventory2 className="mt-0.5 text-sky-500" />
                        Add any extra medicines, supplies, or items given outside the standard service package.
                      </li>
                      <li className="flex items-start gap-2">
                        <MdLocalPharmacy className="mt-0.5 text-violet-500" />
                        Review the approved discount before finalizing, then record payments against the remaining balance.
                      </li>
                    </ul>
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>

      <ConfirmDialog
        open={confirmOpen}
        title="Confirm payment?"
        message={`Record ${formatMoney(draft?.payment_amount || 0)} toward this bill? Inventory is not deducted here; stock movement has already been recorded per batch when clinically used or dispensed.`}
        confirmLabel="Record payment"
        tone="primary"
        loading={confirming}
        onCancel={() => !confirming && setConfirmOpen(false)}
        onConfirm={handleConfirmPayment}
      />
    </div>
  )
}

export default Staff_Billing
