import { useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import {
  MdAdd, MdArrowBack, MdCheck, MdDeleteOutline, MdInfoOutline,
  MdLocalPharmacy, MdLock, MdPayments, MdPrint, MdRefresh, MdWarning,
} from 'react-icons/md'
import {
  cancelBillingAdjustmentRequest,
  finalizeBill,
  getBillById,
  getBillingAdjustmentRequests,
  getBillingCatalog,
  getBillingPaymentSettings,
  getCashierShiftStatus,
  getDiscountPresets,
  getFinalizePreview,
  getInventory,
  payBill,
  requestBillingAdjustment,
  updateBill,
} from '../../services/staff.service'
import { getClinicSettings } from '../../services/clinic.service'
import { useToast } from '../../components/ui/ToastProvider'
import Modal from '../../components/ui/Modal'
import ConfirmDialog from '../../components/ui/ConfirmDialog'
import { LoadingState, ErrorState } from '../../components/ui/PageState'
import BillingStatusBadge from '../../components/billing/BillingStatusBadge'
import { enabledPaymentMethods, formatMoney, paymentMethodLabel, roundMoney } from '../../utils/billingUi'
import { printBillingReceipt } from '../../utils/billingReceipt'

const makeBlankItem = (itemType = 'custom') => ({
  id: null,
  item_type: itemType,
  source_type: itemType === 'supply' ? 'staff_supply' : 'staff_custom',
  catalog_service_id: null,
  source_inventory_id: '',
  category: itemType === 'supply' ? 'Medicine / Supply' : 'Custom Charge',
  service_name: '',
  quantity: 1,
  base_amount: 0,
  markup_percentage: 0,
  unit_price: 0,
  price_overridden: false,
  original_price: 0,
  override_reason: '',
  requested_override_price: '',
  override_request_reason: '',
  notes: '',
  details: null,
})

const normalizeBill = (bill) => ({
  ...bill,
  payment_method: '',
  payment_notes: '',
  reference_number: '',
  payment_amount: Number(bill?.balance_amount ?? bill?.total_amount) || 0,
  amount_received: Number(bill?.balance_amount ?? bill?.total_amount) || 0,
  discount_amount: Number(bill?.discount_amount || 0),
  items: Array.isArray(bill?.items) ? bill.items.map((item) => ({
    id: item.id,
    item_type: item.item_type || 'custom',
    source_type: item.source_type || (item.item_type === 'service' ? 'consultation' : item.item_type === 'supply' ? 'staff_supply' : 'staff_custom'),
    source_reference_id: item.source_reference_id || null,
    catalog_service_id: item.catalog_service_id || null,
    source_inventory_id: item.source_inventory_id || '',
    category: item.category || '',
    service_name: item.service_name || '',
    quantity: Number(item.quantity || 1),
    base_amount: Number(item.base_amount || 0),
    markup_percentage: Number(item.markup_percentage || 0),
    unit_price: Number(item.unit_price || 0),
    price_overridden: Boolean(item?.details?.pricing?.price_overridden),
    original_price: Number(item?.details?.pricing?.original_price ?? item.unit_price ?? 0),
    override_reason: item?.details?.pricing?.override_reason || '',
    requested_override_price: '',
    override_request_reason: '',
    notes: item.notes || '',
    details: item.details || null,
  })) : [],
})

const serializeItems = (items = []) => items.map((item, index) => ({
  id: item.id || null,
  item_type: item.item_type,
  source_type: item.source_type,
  source_reference_id: item.source_reference_id || null,
  catalog_service_id: item.catalog_service_id || null,
  source_inventory_id: item.source_inventory_id || null,
  category: item.category || '',
  service_name: item.service_name || '',
  quantity: Number(item.quantity || 0),
  base_amount: Number(item.base_amount || 0),
  markup_percentage: Number(item.markup_percentage || 0),
  unit_price: Number(item.unit_price || 0),
  price_overridden: Boolean(item.price_overridden),
  override_reason: item.override_reason || '',
  notes: item.notes || '',
  sort_order: index,
  details: item.details || null,
}))

const totalsFor = (draft) => {
  const subtotal = roundMoney((draft?.items || []).reduce((sum, item) => (
    sum + Math.max(0, Number(item.quantity || 0)) * Math.max(0, Number(item.unit_price || 0))
  ), 0))
  const discount = Math.min(subtotal, Math.max(0, Number(draft?.discount_amount || 0)))
  return { subtotal, discount, total: Math.max(0, roundMoney(subtotal - discount)) }
}

const Stepper = ({ active, complete }) => (
  <div className="grid grid-cols-3 gap-2">
    {['Review Charges', 'Confirm Bill', 'Payment'].map((label, index) => {
      const n = index + 1
      const done = complete >= n
      const current = active === n
      return (
        <div key={label} className={`rounded-xl border px-2 py-3 text-center text-xs font-black sm:text-sm ${done ? 'border-emerald-200 bg-emerald-50 text-emerald-700' : current ? 'border-sky-300 bg-sky-50 text-sky-700' : 'border-slate-200 bg-white text-slate-400'}`}>
          {done && !current ? <MdCheck className="mr-1 inline" /> : `${n}. `}{label}
        </div>
      )
    })}
  </div>
)

const Staff_CheckoutDetail = () => {
  const { billingId } = useParams()
  const navigate = useNavigate()
  const toast = useToast()
  const [bill, setBill] = useState(null)
  const [draft, setDraft] = useState(null)
  const [catalog, setCatalog] = useState([])
  const [inventory, setInventory] = useState([])
  const [paymentSettings, setPaymentSettings] = useState({})
  const [cashierShift, setCashierShift] = useState(null)
  const [discounts, setDiscounts] = useState([])
  const [adjustments, setAdjustments] = useState([])
  const [clinicSettings, setClinicSettings] = useState({})
  const [selectedDiscountId, setSelectedDiscountId] = useState('')
  const [discountReference, setDiscountReference] = useState('')
  const [discountReason, setDiscountReason] = useState('')
  const [step, setStep] = useState(1)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [saving, setSaving] = useState(false)
  const [finalizing, setFinalizing] = useState(false)
  const [paying, setPaying] = useState(false)
  const [adjusting, setAdjusting] = useState(false)
  const [addOpen, setAddOpen] = useState(false)
  const [paymentConfirm, setPaymentConfirm] = useState(false)
  const [finalizePreview, setFinalizePreview] = useState(null)
  const [paymentSuccess, setPaymentSuccess] = useState(false)
  const [lastPayment, setLastPayment] = useState(null)
  const [dirty, setDirty] = useState(false)
  const [externalUpdate, setExternalUpdate] = useState(false)
  const [versionConflict, setVersionConflict] = useState(false)
  const initialLoadRef = useRef(true)

  const inventoryMap = useMemo(() => new Map(inventory.map((item) => [Number(item.id), item])), [inventory])
  const totals = totalsFor(draft)
  const paymentMethods = enabledPaymentMethods(paymentSettings)
  const selectedDiscount = discounts.find((item) => Number(item.id) === Number(selectedDiscountId)) || null
  const isDraft = ['draft', 'pending'].includes(bill?.status)
  const isPayable = ['ready', 'partially_paid'].includes(bill?.status)
  const isPaid = bill?.status === 'paid'
  const complete = isPaid ? 3 : isPayable ? 2 : step > 1 ? 1 : 0
  const currentVersion = Number(bill?.version || 1)
  const currentAdjustments = adjustments.filter((item) => Number(item.bill_version || 1) === currentVersion)

  const latestAdjustment = (type, matcher = () => true, status = null) => currentAdjustments.find((item) => (
    item.request_type === type && matcher(item) && (!status || item.status === status)
  ))

  const restoreAdjustmentState = (current, requests, presets) => {
    const version = Number(current?.version || 1)
    const sameVersion = (Array.isArray(requests) ? requests : []).filter((row) => Number(row.bill_version || 1) === version)
    const approvedDiscount = sameVersion.find((row) => row.request_type === 'discount' && row.status === 'approved')
    const pendingDiscount = sameVersion.find((row) => row.request_type === 'discount' && row.status === 'pending')
    const discountRequest = approvedDiscount || pendingDiscount
    if (discountRequest?.discount_preset_id) {
      setSelectedDiscountId(String(discountRequest.discount_preset_id))
      setDiscountReference(discountRequest.reference_text || '')
      setDiscountReason(discountRequest.reason || '')
      if (discountRequest.requested_amount) {
        setDraft((value) => value ? { ...value, discount_amount: Number(discountRequest.requested_amount) } : value)
      }
      return
    }
    const preset = (Array.isArray(presets) ? presets : []).find((p) => (
      String(p.label || '').toLowerCase() === String(current.discount_label || '').toLowerCase()
      && p.discount_type === current.discount_type
    ))
    setSelectedDiscountId(preset ? String(preset.id) : '')
    setDiscountReference(current.discount_reference || '')
    setDiscountReason('')
  }

  const load = async ({ preserveStep = false } = {}) => {
    setLoading(true)
    setError('')
    try {
      const current = await getBillById(billingId)
      const [items, settings, presets, requests, clinic, services, shift] = await Promise.all([
        getInventory(),
        getBillingPaymentSettings(),
        getDiscountPresets(),
        getBillingAdjustmentRequests(billingId),
        getClinicSettings(),
        getBillingCatalog(current.clinic_type || ''),
        getCashierShiftStatus(),
      ])
      setBill(current)
      setDraft(normalizeBill(current))
      setInventory(Array.isArray(items) ? items : [])
      setPaymentSettings(settings || {})
      setCashierShift(shift || null)
      setDiscounts(Array.isArray(presets) ? presets : [])
      setAdjustments(Array.isArray(requests) ? requests : [])
      setClinicSettings(clinic || {})
      setCatalog(Array.isArray(services) ? services : [])
      restoreAdjustmentState(current, requests, presets)
      if (!preserveStep || initialLoadRef.current) {
        setStep(['ready', 'partially_paid'].includes(current.status) ? 3 : current.status === 'paid' ? 3 : 1)
      }
      setDirty(false)
      setExternalUpdate(false)
      setVersionConflict(false)
      initialLoadRef.current = false
    } catch (err) {
      setError(err.message || 'Checkout could not be loaded.')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { load() }, [billingId]) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    const refresh = () => {
      if (dirty) setExternalUpdate(true)
      else load({ preserveStep: true })
    }
    window.addEventListener('clinic:refresh', refresh)
    return () => window.removeEventListener('clinic:refresh', refresh)
  }, [dirty, billingId]) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    const beforeUnload = (event) => {
      if (!dirty) return
      event.preventDefault()
      event.returnValue = ''
    }
    window.addEventListener('beforeunload', beforeUnload)
    return () => window.removeEventListener('beforeunload', beforeUnload)
  }, [dirty])

  const markDraft = (updater) => {
    setDraft((current) => typeof updater === 'function' ? updater(current) : updater)
    setDirty(true)
  }

  const handleBack = () => {
    if (dirty && !window.confirm('You have unsaved changes. Leave Checkout and discard them?')) return
    navigate('/staff/checkout')
  }

  const updateItem = (index, key, value) => markDraft((current) => ({
    ...current,
    items: current.items.map((item, i) => i === index ? { ...item, [key]: value } : item),
  }))

  const addType = (type) => {
    markDraft((current) => ({ ...current, items: [...current.items, makeBlankItem(type)] }))
    setAddOpen(false)
  }

  const removeItem = (index) => {
    const item = draft.items[index]
    if (item?.source_type === 'consultation') return
    markDraft((current) => ({ ...current, items: current.items.filter((_, i) => i !== index) }))
  }

  const selectSupply = (index, value) => {
    const item = inventoryMap.get(Number(value))
    if (!item) return
    if (item.selling_price === null || item.selling_price === undefined || item.selling_price === '') {
      toast.error('This inventory item has no patient selling price. Ask an administrator to configure it first.')
      return
    }
    updateItem(index, 'source_inventory_id', item.id)
    markDraft((current) => ({
      ...current,
      items: current.items.map((row, i) => i === index ? {
        ...row,
        source_inventory_id: item.id,
        service_name: item.name || '',
        category: item.category || 'Medicine / Supply',
        unit_price: Number(item.selling_price || 0),
        original_price: Number(item.selling_price || 0),
        details: { ...(row.details || {}), unit: item.base_unit || item.unit || '' },
      } : row),
    }))
  }

  const discountNeedsApproval = Boolean(selectedDiscount && (
    Number(selectedDiscount.requires_admin_approval) === 1
    || (selectedDiscount.discount_type === 'fixed' && Number(selectedDiscount.value || 0) <= 0)
  ))
  const discountPersistedApproval = Boolean(discountNeedsApproval && selectedDiscount
    && String(bill?.discount_label || '').toLowerCase() === String(selectedDiscount.label || '').toLowerCase()
    && Number(bill?.discount_amount || 0) >= 0
    && !dirty)
  const discountPending = selectedDiscount ? latestAdjustment('discount', (item) => Number(item.discount_preset_id) === Number(selectedDiscount.id), 'pending') : null
  const discountApproval = selectedDiscount ? latestAdjustment('discount', (item) => Number(item.discount_preset_id) === Number(selectedDiscount.id), 'approved') : null
  const discountRejected = selectedDiscount ? latestAdjustment('discount', (item) => Number(item.discount_preset_id) === Number(selectedDiscount.id), 'rejected') : null

  const selectDiscount = (value) => {
    const preset = discounts.find((item) => Number(item.id) === Number(value)) || null
    setSelectedDiscountId(value)
    setDiscountReference('')
    setDiscountReason('')
    markDraft((current) => {
      if (!preset) return { ...current, discount_amount: 0 }
      const amount = preset.discount_type === 'percentage'
        ? roundMoney(totals.subtotal * Math.max(0, Number(preset.value || 0)) / 100)
        : Math.max(0, Number(preset.value || 0))
      return { ...current, discount_amount: Math.min(totals.subtotal, amount) }
    })
  }

  const saveDraft = async ({ quiet = false, draftOverride = null } = {}) => {
    const workingDraft = draftOverride || draft
    if (!workingDraft || !isDraft) return bill
    const invalidCustom = workingDraft.items.find((item) => item.item_type === 'custom' && !String(item.notes || '').trim())
    if (invalidCustom) {
      toast.error('Every custom charge needs a reason or note before saving.')
      return null
    }
    const invalidSupply = workingDraft.items.find((item) => item.item_type === 'supply' && !item.source_inventory_id)
    if (invalidSupply) {
      toast.error('Select an inventory item for every Medicine / Supply charge.')
      return null
    }
    setSaving(true)
    try {
      const updated = await updateBill(billingId, {
        expected_version: currentVersion,
        items: serializeItems(workingDraft.items),
        discount_preset_id: selectedDiscountId || null,
        discount_reference: discountReference || null,
        discount_amount: workingDraft.discount_amount,
        payment_notes: workingDraft.payment_notes || null,
      })
      setBill(updated)
      setDraft(normalizeBill(updated))
      setDirty(false)
      setVersionConflict(false)
      const requests = await getBillingAdjustmentRequests(billingId)
      setAdjustments(Array.isArray(requests) ? requests : [])
      if (!quiet) toast.success('Draft saved.')
      return updated
    } catch (err) {
      if (err.code === 'BILL_VERSION_CONFLICT' || /updated by another user|changed while/i.test(err.message || '')) {
        setVersionConflict(true)
      }
      toast.error(err.message || 'Draft could not be saved.')
      return null
    } finally {
      setSaving(false)
    }
  }

  const requestDiscount = async () => {
    if (!selectedDiscount) return
    if (Number(selectedDiscount.requires_reference) === 1 && !discountReference.trim()) {
      toast.error('Enter the required discount reference or ID.')
      return
    }
    if (!discountReason.trim()) {
      toast.error('Enter a reason for administrator approval.')
      return
    }
    setAdjusting(true)
    try {
      await requestBillingAdjustment(billingId, {
        request_type: 'discount',
        discount_preset_id: selectedDiscount.id,
        requested_amount: Number(draft.discount_amount || 0),
        reference: discountReference.trim() || null,
        reason: discountReason.trim(),
      })
      setAdjustments(await getBillingAdjustmentRequests(billingId))
      toast.success('Administrator approval requested.')
    } catch (err) {
      toast.error(err.message || 'Approval request could not be sent.')
    } finally {
      setAdjusting(false)
    }
  }

  const cancelAdjustment = async (request) => {
    if (!request?.id) return
    setAdjusting(true)
    try {
      await cancelBillingAdjustmentRequest(billingId, request.id)
      setAdjustments(await getBillingAdjustmentRequests(billingId))
      toast.success('Approval request cancelled.')
    } catch (err) {
      toast.error(err.message || 'Approval request could not be cancelled.')
    } finally {
      setAdjusting(false)
    }
  }

  const requestPriceOverride = async (item, index) => {
    const requestedPrice = Number(item.requested_override_price)
    if (!Number.isFinite(requestedPrice) || requestedPrice < 0) {
      toast.error('Enter a valid requested price.')
      return
    }
    if (!String(item.override_request_reason || '').trim()) {
      toast.error('Enter a reason for the price override.')
      return
    }
    setAdjusting(true)
    try {
      await requestBillingAdjustment(billingId, {
        request_type: 'price_override',
        catalog_service_id: item.catalog_service_id,
        requested_price: requestedPrice,
        reason: item.override_request_reason.trim(),
      })
      const requests = await getBillingAdjustmentRequests(billingId)
      setAdjustments(requests)
      setDraft((current) => ({ ...current, items: current.items.map((row, i) => i === index ? { ...row, requested_override_price: requestedPrice } : row) }))
      toast.success('Price override sent for administrator approval.')
    } catch (err) {
      toast.error(err.message || 'Price override request could not be sent.')
    } finally {
      setAdjusting(false)
    }
  }

  const applyApprovedOverridesToDraft = () => {
    if (!draft) return draft
    const items = draft.items.map((item) => {
      if (item.source_type !== 'consultation') return item
      const approval = latestAdjustment('price_override', (request) => (
        Number(request.catalog_service_id) === Number(item.catalog_service_id)
      ), 'approved')
      if (!approval) return item
      return {
        ...item,
        unit_price: Number(approval.requested_price || item.unit_price),
        requested_override_price: Number(approval.requested_price || 0),
        price_overridden: true,
        override_reason: approval.reason || 'Admin-approved price override',
      }
    })
    const next = { ...draft, items }
    if (discountApproval?.requested_amount) next.discount_amount = Number(discountApproval.requested_amount)
    return next
  }

  const proceedToReview = () => {
    setDraft(applyApprovedOverridesToDraft())
    setStep(2)
  }

  const prepareFinalize = async () => {
    const discountAuthorized = !discountNeedsApproval || Boolean(discountApproval) || discountPersistedApproval
    if (!discountAuthorized) {
      toast.error('This discount still needs administrator approval for the current bill version.')
      return
    }
    const withApproved = applyApprovedOverridesToDraft()
    setDraft(withApproved)
    const hasCurrentApprovedAdjustment = currentAdjustments.some((request) => request.status === 'approved')
    if (dirty || hasCurrentApprovedAdjustment) {
      const current = await saveDraft({ quiet: true, draftOverride: withApproved })
      if (!current) return
    }
    setFinalizing(true)
    try {
      const preview = await getFinalizePreview(billingId)
      setFinalizePreview(preview)
    } catch (err) {
      toast.error(err.message || 'Bill confirmation could not be reviewed.')
    } finally {
      setFinalizing(false)
    }
  }

  const confirmFinalize = async () => {
    if (!finalizePreview) return
    if (!finalizePreview.can_finalize) return
    setFinalizing(true)
    try {
      const updated = await finalizeBill(billingId, finalizePreview.version)
      setBill(updated)
      setDraft(normalizeBill(updated))
      setDirty(false)
      setFinalizePreview(null)
      setStep(3)
      toast.success('Bill confirmed and ready for payment.')
    } catch (err) {
      if (err.code === 'BILL_VERSION_CONFLICT' || /changed/i.test(err.message || '')) setVersionConflict(true)
      toast.error(err.message || 'Bill could not be confirmed.')
    } finally {
      setFinalizing(false)
    }
  }

  const requestPay = () => {
    if (cashierShift?.status === 'closed') return toast.error('Your cashier shift is closed. Ask an administrator to reopen it before accepting another payment.')
    const amount = Number(draft.payment_amount || 0)
    if (!draft.payment_method) return toast.error('Select a payment method.')
    if (amount <= 0 || amount > Number(bill.balance_amount || 0) + 0.001) return toast.error('Enter a valid payment amount.')
    if (draft.payment_method !== 'cash' && !String(draft.reference_number || '').trim()) return toast.error('Enter the payment reference number.')
    if (draft.payment_method === 'cash' && Number(draft.amount_received || 0) < amount) return toast.error('Cash received cannot be lower than the payment amount.')
    setPaymentConfirm(true)
  }

  const recordPayment = async () => {
    setPaying(true)
    try {
      const updated = await payBill(billingId, {
        payment_method: draft.payment_method,
        payment_amount: Number(draft.payment_amount || 0),
        amount_received: Number(draft.amount_received || 0),
        reference_number: String(draft.reference_number || '').trim() || null,
        payment_notes: String(draft.payment_notes || '').trim() || null,
        idempotency_key: `checkout-${billingId}-${Date.now()}-${Math.random().toString(36).slice(2)}`,
      })
      const payments = Array.isArray(updated.payments) ? updated.payments : []
      const payment = payments[0] || null
      setBill(updated)
      setDraft(normalizeBill(updated))
      setLastPayment(payment)
      setPaymentSuccess(true)
      setPaymentConfirm(false)
      setDirty(false)
      toast.success('Payment recorded.')
    } catch (err) {
      if (/cashier shift.*closed|shift is already closed/i.test(err.message || '')) {
        getCashierShiftStatus().then((shift) => setCashierShift(shift || null)).catch(() => {})
      }
      toast.error(err.message || 'Payment could not be recorded.')
    } finally {
      setPaying(false)
    }
  }

  const printReceipt = (payment) => printBillingReceipt({
    bill,
    payment,
    clinicSettings,
    onPopupBlocked: () => toast.error('Receipt window was blocked by the browser.'),
  })

  if (loading) return <div className="mx-auto max-w-6xl"><LoadingState label="Loading checkout..." /></div>
  if (error || !bill || !draft) return <div className="mx-auto max-w-6xl"><ErrorState message={error || 'Billing record not found.'} onRetry={() => load()} /></div>

  if (paymentSuccess && lastPayment) {
    return (
      <div className="mx-auto max-w-2xl py-8">
        <div className="rounded-3xl border border-emerald-200 bg-white p-8 text-center shadow-sm">
          <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-emerald-100 text-3xl text-emerald-700"><MdCheck /></div>
          <h1 className="mt-5 text-2xl font-black text-slate-900">Payment Recorded</h1>
          <p className="mt-2 text-slate-500">{bill.patient_name}</p>
          <p className="mt-5 text-4xl font-black text-slate-900">{formatMoney(lastPayment.amount)}</p>
          <p className="mt-1 font-bold text-slate-500">{paymentMethodLabel(lastPayment.payment_method)}</p>
          <div className="mx-auto mt-5 max-w-sm rounded-2xl bg-slate-50 p-4 text-sm text-slate-600">
            <p><strong>Receipt:</strong> {lastPayment.receipt_number || '—'}</p>
            <p className="mt-1"><strong>Remaining Balance:</strong> {formatMoney(bill.balance_amount)}</p>
          </div>
          <div className="mt-6 flex flex-wrap justify-center gap-3">
            <button className="button-secondary" onClick={() => printReceipt(lastPayment)}><MdPrint /> Print Receipt</button>
            {Number(bill.balance_amount || 0) > 0 && <button className="button-secondary" onClick={() => setPaymentSuccess(false)}>Collect Another Payment</button>}
            <button className="button-primary" onClick={() => navigate('/staff/checkout')}>Next Patient →</button>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="mx-auto w-full max-w-6xl space-y-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <button className="mb-2 inline-flex items-center gap-1 text-sm font-bold text-slate-500 hover:text-slate-900" onClick={handleBack}><MdArrowBack /> Back to Checkout</button>
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="text-2xl font-black text-slate-900">{bill.patient_name}</h1>
            <BillingStatusBadge status={bill.status} audience="staff" />
            {dirty && <span className="rounded-full bg-amber-100 px-2.5 py-1 text-xs font-black text-amber-800">● Unsaved changes</span>}
          </div>
          <p className="mt-1 text-sm text-slate-500">{bill.doctor_name} · {bill.appointment_reason || 'Consultation'} · Bill #{bill.id} · Version {bill.version || 1}</p>
        </div>
        <button className="button-secondary" onClick={() => dirty ? setExternalUpdate(true) : load({ preserveStep: true })}><MdRefresh /> Refresh</button>
      </div>

      {externalUpdate && <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900"><div><strong>New billing information is available.</strong><p className="mt-1">Your unsaved changes were not overwritten.</p></div><button className="button-secondary" onClick={() => { if (!dirty || window.confirm('Discard your unsaved changes and load the latest bill?')) load({ preserveStep: true }) }}>Review Latest Version</button></div>}
      {versionConflict && <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-900"><div><strong>This bill changed while you were working on it.</strong><p className="mt-1">The system blocked the stale save so another Staff member's changes were not overwritten.</p></div><button className="button-secondary" onClick={() => load({ preserveStep: true })}>Review Latest Bill</button></div>}

      <Stepper active={step} complete={complete} />

      {isDraft && step === 1 && (
        <div className="grid gap-5 lg:grid-cols-[1fr_320px]">
          <section className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div><h2 className="font-black text-slate-900">Review Charges</h2><p className="mt-1 text-sm text-slate-500">Doctor-recorded clinical services are locked. Staff can add medicines/supplies or a traceable custom charge.</p></div>
              <button className="button-secondary" onClick={() => setAddOpen(true)}><MdAdd /> Add Charge</button>
            </div>

            <div className="mt-5 space-y-3">
              {draft.items.length === 0 && <div className="rounded-2xl border border-dashed border-slate-300 p-5 text-center text-sm text-slate-500">No charges yet.</div>}
              {draft.items.map((item, index) => {
                const protectedLine = item.source_type === 'consultation'
                const pendingOverride = protectedLine ? latestAdjustment('price_override', (request) => Number(request.catalog_service_id) === Number(item.catalog_service_id), 'pending') : null
                const approvedOverride = protectedLine ? latestAdjustment('price_override', (request) => Number(request.catalog_service_id) === Number(item.catalog_service_id), 'approved') : null
                const rejectedOverride = protectedLine ? latestAdjustment('price_override', (request) => Number(request.catalog_service_id) === Number(item.catalog_service_id), 'rejected') : null
                return (
                  <div key={item.id || `new-${index}`} className={`rounded-2xl border p-4 ${protectedLine ? 'border-sky-100 bg-sky-50/50' : 'border-slate-200'}`}>
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <p className="font-black text-slate-900">{item.service_name || (item.item_type === 'supply' ? 'Medicine / Supply' : 'Custom Charge')}</p>
                          {protectedLine && <span className="inline-flex items-center gap-1 rounded-full bg-sky-100 px-2 py-1 text-[11px] font-black text-sky-800"><MdLock /> From Consultation</span>}
                        </div>
                        {protectedLine && <p className="mt-1 text-xs text-slate-500">Recorded by the Doctor. Service and quantity cannot be changed at Checkout.</p>}
                      </div>
                      {!protectedLine && <button className="rounded-lg p-2 text-slate-400 hover:bg-rose-50 hover:text-rose-600" onClick={() => removeItem(index)} aria-label="Remove charge"><MdDeleteOutline /></button>}
                    </div>

                    {protectedLine ? (
                      <div className="mt-4 grid gap-3 sm:grid-cols-[1fr_130px_140px]">
                        <div><span className="form-label">Service</span><div className="mt-1.5 rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm font-semibold">{item.service_name}</div></div>
                        <div><span className="form-label">Qty</span><div className="mt-1.5 rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm font-semibold">{item.quantity}</div></div>
                        <div><span className="form-label">Patient Price</span><div className="mt-1.5 rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm font-semibold">{formatMoney(item.unit_price)}</div></div>
                      </div>
                    ) : item.item_type === 'supply' ? (
                      <div className="mt-4 grid gap-3 sm:grid-cols-[1fr_110px_140px]">
                        <label><span className="form-label">Medicine / Supply *</span><select className="form-control mt-1.5" value={item.source_inventory_id || ''} onChange={(e) => selectSupply(index, e.target.value)}><option value="">Select inventory item</option>{inventory.map((inv) => <option key={inv.id} value={inv.id} disabled={inv.selling_price === null || inv.selling_price === undefined}>{inv.name}{inv.selling_price === null || inv.selling_price === undefined ? ' — price not configured' : ` — ${formatMoney(inv.selling_price)}`}</option>)}</select></label>
                        <label><span className="form-label">Qty</span><input type="number" min="0.01" step="0.01" className="form-control mt-1.5" value={item.quantity} onChange={(e) => updateItem(index, 'quantity', e.target.value)} /></label>
                        <div><span className="form-label">Patient Price</span><div className="mt-1.5 rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 text-sm font-black">{formatMoney(item.unit_price)}</div></div>
                      </div>
                    ) : (
                      <div className="mt-4 grid gap-3 sm:grid-cols-[1fr_110px_140px]">
                        <label><span className="form-label">Description *</span><input className="form-control mt-1.5" value={item.service_name} onChange={(e) => updateItem(index, 'service_name', e.target.value)} placeholder="e.g. Medical Certificate" /></label>
                        <label><span className="form-label">Qty</span><input type="number" min="0.01" step="0.01" className="form-control mt-1.5" value={item.quantity} onChange={(e) => updateItem(index, 'quantity', e.target.value)} /></label>
                        <label><span className="form-label">Amount *</span><input type="number" min="0" step="0.01" className="form-control mt-1.5" value={item.unit_price} onChange={(e) => updateItem(index, 'unit_price', e.target.value)} /></label>
                        <label className="sm:col-span-3"><span className="form-label">Reason / Notes *</span><textarea rows={2} className="form-control mt-1.5 resize-none" value={item.notes} onChange={(e) => updateItem(index, 'notes', e.target.value)} placeholder="Required for the billing audit trail" /></label>
                      </div>
                    )}

                    {protectedLine && (
                      <div className="mt-4 rounded-xl border border-slate-200 bg-white p-3">
                        <div className="flex items-center gap-2 text-xs font-black uppercase tracking-wide text-slate-500"><MdInfoOutline /> Price correction</div>
                        {approvedOverride ? <div className="mt-2 rounded-xl bg-emerald-50 p-3 text-sm text-emerald-800"><strong>Approved:</strong> {formatMoney(approvedOverride.requested_price)}. This price will be applied when you save the draft.</div>
                          : item.price_overridden ? <div className={`mt-2 rounded-xl p-3 text-sm ${dirty ? 'bg-amber-50 text-amber-900' : 'bg-emerald-50 text-emerald-800'}`}><strong>{dirty ? 'Approval expired for this edit:' : 'Approved price applied:'}</strong> {formatMoney(item.unit_price)}. {dirty ? 'Because the bill changed, request this price again before saving.' : 'You may confirm this saved bill; a later edit will require new approval.'}</div>
                          : pendingOverride ? <div className="mt-2 flex flex-wrap items-center justify-between gap-3 rounded-xl bg-amber-50 p-3 text-sm text-amber-900"><span><strong>Waiting for Admin:</strong> {formatMoney(pendingOverride.requested_price)}</span><button className="text-xs font-black text-rose-700" disabled={adjusting} onClick={() => cancelAdjustment(pendingOverride)}>Cancel Request</button></div>
                            : <div className="mt-3 grid gap-2 sm:grid-cols-[140px_1fr_auto]"><input type="number" min="0" step="0.01" className="form-control" placeholder="Requested price" value={item.requested_override_price} onChange={(e) => setDraft((current) => ({ ...current, items: current.items.map((row, i) => i === index ? { ...row, requested_override_price: e.target.value } : row) }))} /><input className="form-control" placeholder="Reason for override" value={item.override_request_reason} onChange={(e) => setDraft((current) => ({ ...current, items: current.items.map((row, i) => i === index ? { ...row, override_request_reason: e.target.value } : row) }))} /><button className="button-secondary" disabled={adjusting} onClick={() => requestPriceOverride(item, index)}>Request Approval</button></div>}
                        {rejectedOverride && <div className="mt-2 rounded-xl bg-rose-50 p-3 text-sm text-rose-800"><strong>Previous request rejected.</strong> {rejectedOverride.admin_note || 'No reason supplied.'}</div>}
                      </div>
                    )}

                    <div className="mt-4 flex justify-end border-t border-slate-100 pt-3 text-sm"><span className="mr-3 text-slate-500">Line Total</span><strong>{formatMoney(Number(item.quantity || 0) * Number(item.unit_price || 0))}</strong></div>
                  </div>
                )
              })}
            </div>
          </section>

          <aside className="lg:sticky lg:top-24 lg:self-start">
            <div className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
              <h2 className="font-black text-slate-900">Charge Summary</h2>
              <div className="mt-4 space-y-3 text-sm"><div className="flex justify-between"><span className="text-slate-500">Subtotal</span><strong>{formatMoney(totals.subtotal)}</strong></div><div className="flex justify-between border-t border-slate-100 pt-3 text-lg"><span className="font-black">Current Total</span><strong>{formatMoney(totals.total)}</strong></div></div>
              <button className="button-primary mt-5 w-full justify-center" disabled={draft.items.length === 0} onClick={proceedToReview}>Continue to Confirm Bill →</button>
              <button className="button-secondary mt-2 w-full justify-center" disabled={saving || !dirty} onClick={() => saveDraft()}>{saving ? 'Saving…' : 'Save Draft'}</button>
            </div>
          </aside>
        </div>
      )}

      {isDraft && step === 2 && (
        <div className="grid gap-5 lg:grid-cols-[1fr_340px]">
          <section className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
            <h2 className="font-black text-slate-900">Confirm Bill</h2>
            <p className="mt-1 text-sm text-slate-500">Apply an eligible discount and review the patient's final charges before locking the bill.</p>
            <label className="mt-5 block"><span className="form-label">Discount</span><select className="form-control mt-1.5" value={selectedDiscountId} onChange={(e) => selectDiscount(e.target.value)}><option value="">No Discount</option>{discounts.map((preset) => <option key={preset.id} value={preset.id}>{preset.label}</option>)}</select></label>
            {selectedDiscount && <div className="mt-4 space-y-3 rounded-2xl bg-slate-50 p-4">
              {selectedDiscount.discount_type === 'fixed' && Number(selectedDiscount.value || 0) <= 0 && <label><span className="form-label">Discount Amount</span><input type="number" min="0" max={totals.subtotal} step="0.01" className="form-control mt-1.5" value={draft.discount_amount} onChange={(e) => markDraft((current) => ({ ...current, discount_amount: Math.min(totals.subtotal, Math.max(0, Number(e.target.value || 0))) }))} /></label>}
              {Number(selectedDiscount.requires_reference) === 1 && <label><span className="form-label">Reference / ID *</span><input className="form-control mt-1.5" value={discountReference} onChange={(e) => { setDiscountReference(e.target.value); setDirty(true) }} /></label>}
              {discountNeedsApproval && !discountApproval && !discountPersistedApproval && <>
                <label><span className="form-label">Reason for Admin Approval *</span><textarea rows={2} className="form-control mt-1.5 resize-none" value={discountReason} onChange={(e) => setDiscountReason(e.target.value)} /></label>
                {discountPending ? <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl bg-amber-50 p-3 text-sm font-bold text-amber-800"><span>Waiting for Admin approval.</span><button className="text-xs font-black text-rose-700" disabled={adjusting} onClick={() => cancelAdjustment(discountPending)}>Cancel Request</button></div> : <button className="button-secondary" disabled={adjusting} onClick={requestDiscount}>{adjusting ? 'Sending…' : 'Request Admin Approval'}</button>}
              </>}
              {discountApproval && <div className="rounded-xl bg-emerald-50 p-3 text-sm font-bold text-emerald-700"><MdCheck className="mr-1 inline" /> Approved by Admin{discountApproval.admin_note ? ` — ${discountApproval.admin_note}` : ''}</div>}
              {discountPersistedApproval && !discountApproval && <div className="rounded-xl bg-emerald-50 p-3 text-sm font-bold text-emerald-700"><MdCheck className="mr-1 inline" /> Approved discount already applied to this saved bill. Any later bill edit will require a new approval.</div>}
              {discountRejected && !discountPending && !discountApproval && <div className="rounded-xl bg-rose-50 p-3 text-sm font-bold text-rose-800">Previous request rejected: {discountRejected.admin_note || 'No reason supplied.'}</div>}
            </div>}
            <div className="mt-6 rounded-2xl border border-slate-200 p-4"><h3 className="text-sm font-black">Charges</h3><div className="mt-3 divide-y divide-slate-100">{draft.items.map((item, index) => <div key={item.id || index} className="flex justify-between gap-4 py-2 text-sm"><span>{item.service_name || 'Charge'} <span className="text-slate-400">× {item.quantity}</span>{item.source_type === 'consultation' && <MdLock className="ml-1 inline text-sky-500" />}</span><strong>{formatMoney(Number(item.quantity || 0) * Number(item.unit_price || 0))}</strong></div>)}</div></div>
            <div className="mt-5 flex flex-wrap gap-2"><button className="button-secondary" onClick={() => setStep(1)}>← Back to Charges</button><button className="button-secondary" disabled={saving} onClick={() => saveDraft()}>{saving ? 'Saving…' : 'Save Draft'}</button></div>
          </section>
          <aside className="lg:sticky lg:top-24 lg:self-start"><div className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm"><h2 className="font-black">Final Total</h2><div className="mt-4 space-y-3"><div className="flex justify-between text-sm"><span className="text-slate-500">Subtotal</span><strong>{formatMoney(totals.subtotal)}</strong></div><div className="flex justify-between text-sm"><span className="text-slate-500">Discount</span><strong className="text-violet-700">− {formatMoney(totals.discount)}</strong></div><div className="flex justify-between border-t border-slate-200 pt-4 text-xl"><span className="font-black">TOTAL</span><strong>{formatMoney(totals.total)}</strong></div></div><button className="button-primary mt-5 w-full justify-center" disabled={finalizing || saving || (discountNeedsApproval && !discountApproval && !discountPersistedApproval)} onClick={prepareFinalize}>{finalizing ? 'Checking…' : `Confirm Bill — ${formatMoney(totals.total)}`}</button><p className="mt-3 text-center text-xs text-slate-500">Confirmation locks charges and may dispense directly added medicine/supply inventory.</p></div></aside>
        </div>
      )}

      {isPayable && step === 3 && (
        <div className="space-y-4">
          {cashierShift?.status === 'closed' && <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-900"><div><strong>Cashier Shift Closed</strong><p className="mt-1">Payments are locked for today. Ask an Administrator to reopen your shift before collecting another payment.</p></div><button type="button" className="button-secondary" onClick={() => getCashierShiftStatus().then((shift) => setCashierShift(shift || null)).catch(() => {})}><MdRefresh /> Refresh Shift</button></div>}
          {cashierShift?.status === 'reopened' && <div className="rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm font-semibold text-amber-900"><MdWarning className="mr-1 inline" /> Your cashier shift was reopened by an Administrator. You may accept payments again, but remember to close the shift when finished.</div>}
          <div className="grid gap-5 lg:grid-cols-[1fr_340px]">
          <section className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
            <h2 className="font-black text-slate-900">Collect Payment</h2><p className="mt-1 text-sm text-slate-500">Only payment methods enabled by Admin are shown here.</p>
            <div className="mt-5 rounded-2xl bg-sky-50 p-5 text-center"><p className="text-xs font-black uppercase tracking-wide text-sky-700">Amount Due</p><p className="mt-2 text-4xl font-black text-sky-950">{formatMoney(bill.balance_amount)}</p></div>
            <div className="mt-5"><p className="form-label">Payment Method</p><div className="mt-2 grid gap-2 sm:grid-cols-2">{paymentMethods.map((method) => <button key={method.value} disabled={cashierShift?.status === 'closed'} onClick={() => setDraft((current) => ({ ...current, payment_method: method.value, reference_number: '', amount_received: current.payment_amount || bill.balance_amount }))} className={`rounded-2xl border p-4 text-left font-black disabled:cursor-not-allowed disabled:opacity-50 ${draft.payment_method === method.value ? 'border-sky-400 bg-sky-50 text-sky-800' : 'border-slate-200 hover:bg-slate-50'}`}>{method.label}</button>)}</div>{paymentMethods.length === 0 && <div className="mt-2 rounded-xl bg-rose-50 p-3 text-sm font-bold text-rose-700">No payment methods are enabled. Ask an administrator to update Billing → Setup → Payment Methods.</div>}</div>
            {draft.payment_method && <div className="mt-5 space-y-4"><label><span className="form-label">Payment Amount</span><input type="number" min="0.01" max={bill.balance_amount} step="0.01" className="form-control mt-1.5" value={draft.payment_amount} onChange={(e) => setDraft((current) => ({ ...current, payment_amount: e.target.value, amount_received: current.payment_method === 'cash' ? e.target.value : current.amount_received }))} /></label>
              {draft.payment_method === 'cash' ? <label><span className="form-label">Cash Received</span><input type="number" min="0" step="0.01" className="form-control mt-1.5" value={draft.amount_received} onChange={(e) => setDraft((current) => ({ ...current, amount_received: e.target.value }))} />{Number(draft.amount_received || 0) >= Number(draft.payment_amount || 0) && Number(draft.payment_amount || 0) > 0 && <span className="mt-2 block rounded-xl bg-emerald-50 px-3 py-2 text-sm font-black text-emerald-700">Change: {formatMoney(Number(draft.amount_received || 0) - Number(draft.payment_amount || 0))}</span>}</label> : <>
                <label><span className="form-label">Reference Number *</span><input className="form-control mt-1.5" value={draft.reference_number} onChange={(e) => setDraft((current) => ({ ...current, reference_number: e.target.value }))} /></label>
                {['gcash', 'maya'].includes(draft.payment_method) && <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4 text-center">{paymentSettings[`${draft.payment_method}_qr_mode`] === 'external' ? <p className="text-sm font-bold text-slate-700">Use the clinic's {paymentMethodLabel(draft.payment_method)} QR available at the cashier.</p> : paymentSettings[`${draft.payment_method}_qr_url`] ? <><img src={paymentSettings[`${draft.payment_method}_qr_url`]} alt={`${paymentMethodLabel(draft.payment_method)} QR`} className="mx-auto max-h-64 rounded-xl object-contain" /><p className="mt-3 text-sm font-bold">Scan to pay {formatMoney(draft.payment_amount)}</p></> : <p className="text-sm font-bold text-rose-700">This digital payment method is enabled but its QR instructions are incomplete. Ask an administrator to correct Billing Setup.</p>}</div>}
                {draft.payment_method === 'bank_transfer' && <div className="rounded-2xl bg-slate-50 p-4 text-sm"><p><strong>Bank:</strong> {paymentSettings.bank_name || 'Not configured'}</p><p className="mt-1"><strong>Account Name:</strong> {paymentSettings.bank_account_name || '—'}</p><p className="mt-1"><strong>Account Number:</strong> {paymentSettings.bank_account_number || '—'}</p></div>}
              </>}
              <label><span className="form-label">Payment Notes</span><textarea rows={2} className="form-control mt-1.5 resize-none" value={draft.payment_notes || ''} onChange={(e) => setDraft((current) => ({ ...current, payment_notes: e.target.value }))} /></label>
            </div>}
          </section>
          <aside className="lg:sticky lg:top-24 lg:self-start"><div className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm"><h2 className="font-black">Payment Summary</h2><div className="mt-4 space-y-2 text-sm"><div className="flex justify-between"><span>Total Bill</span><strong>{formatMoney(bill.total_amount)}</strong></div><div className="flex justify-between"><span>Paid</span><strong className="text-emerald-700">{formatMoney(bill.paid_amount)}</strong></div><div className="flex justify-between border-t border-slate-100 pt-3 text-lg"><span className="font-black">Balance</span><strong>{formatMoney(bill.balance_amount)}</strong></div></div><button className="button-primary mt-5 w-full justify-center" disabled={paying || !draft.payment_method || cashierShift?.status === 'closed'} onClick={requestPay}>Record {formatMoney(draft.payment_amount)} Payment</button>{bill.payments?.length > 0 && <div className="mt-5 border-t border-slate-100 pt-4"><p className="text-xs font-black uppercase text-slate-400">Previous Payments</p><div className="mt-2 space-y-2">{bill.payments.slice(0, 3).map((payment) => <div key={payment.id} className="rounded-xl bg-slate-50 p-3 text-xs"><div className="flex justify-between"><strong>{payment.receipt_number}</strong><strong>{formatMoney(payment.amount)}</strong></div>{Number(payment.refund_amount || 0) > 0 && <p className="mt-1 font-bold text-violet-700">Refunded: {formatMoney(payment.refund_amount)}</p>}<button className="mt-2 font-bold text-sky-700" onClick={() => printReceipt(payment)}>Print Receipt</button></div>)}</div></div>}</div></aside>
          </div>
        </div>
      )}

      {isPaid && <div className="rounded-3xl border border-emerald-200 bg-emerald-50 p-8 text-center"><MdCheck className="mx-auto text-5xl text-emerald-700" /><h2 className="mt-3 text-xl font-black text-emerald-900">Paid in Full</h2><p className="mt-1 text-sm text-emerald-800">This checkout is complete.</p><button className="button-primary mt-5" onClick={() => navigate('/staff/checkout')}>Next Patient →</button></div>}

      <Modal open={addOpen} onClose={() => setAddOpen(false)} title="Add Charge" description="Clinical services come from the Doctor consultation. Staff may add only a medicine/supply or a traceable custom charge." size="md"><div className="grid gap-3 sm:grid-cols-2"><button className="rounded-2xl border border-slate-200 p-5 text-center hover:border-emerald-300 hover:bg-emerald-50" onClick={() => addType('supply')}><MdLocalPharmacy className="mx-auto text-3xl text-emerald-600" /><p className="mt-3 font-black">Medicine / Supply</p></button><button className="rounded-2xl border border-slate-200 p-5 text-center hover:border-violet-300 hover:bg-violet-50" onClick={() => addType('custom')}><MdAdd className="mx-auto text-3xl text-violet-600" /><p className="mt-3 font-black">Custom Charge</p></button></div><div className="mt-4 rounded-xl bg-sky-50 p-3 text-sm text-sky-800"><MdLock className="mr-1 inline" /> Missing a clinical service? Ask the Doctor to correct or amend the consultation rather than adding it at Checkout.</div></Modal>

      <Modal open={Boolean(finalizePreview)} onClose={() => !finalizing && setFinalizePreview(null)} title="Confirm this bill?" description="This is the final review before charges are locked and direct medicines/supplies are dispensed." size="lg">
        {finalizePreview && <div className="space-y-4"><div className="grid gap-3 sm:grid-cols-3"><div className="rounded-2xl bg-slate-50 p-4"><p className="text-xs font-black uppercase text-slate-400">Total</p><p className="mt-1 text-xl font-black">{formatMoney(finalizePreview.total_amount)}</p></div><div className="rounded-2xl bg-slate-50 p-4"><p className="text-xs font-black uppercase text-slate-400">Charges</p><p className="mt-1 text-xl font-black">{finalizePreview.charge_count}</p></div><div className="rounded-2xl bg-slate-50 p-4"><p className="text-xs font-black uppercase text-slate-400">Supply Items</p><p className="mt-1 text-xl font-black">{finalizePreview.supply_count}</p></div></div>
          {finalizePreview.supplies?.length > 0 && <div className="rounded-2xl border border-slate-200"><div className="border-b border-slate-100 px-4 py-3 font-black">Inventory Preflight</div><div className="divide-y divide-slate-100">{finalizePreview.supplies.map((supply) => <div key={supply.billing_item_id} className="flex flex-wrap items-center justify-between gap-3 p-4 text-sm"><div><strong>{supply.name}</strong><p className="mt-1 text-slate-500">Requested {supply.requested} {supply.unit || ''} · Available {supply.available} {supply.unit || ''}</p></div><span className={`rounded-full px-2.5 py-1 text-xs font-black ${supply.sufficient ? 'bg-emerald-100 text-emerald-800' : 'bg-rose-100 text-rose-800'}`}>{supply.sufficient ? 'Available' : 'Insufficient Stock'}</span></div>)}</div></div>}
          <div className={`rounded-2xl p-4 text-sm ${finalizePreview.can_finalize ? 'bg-amber-50 text-amber-900' : 'bg-rose-50 text-rose-900'}`}>{finalizePreview.can_finalize ? <><MdWarning className="mr-1 inline" /><strong>After confirmation:</strong> charges are locked, direct supply items are deducted from inventory, and later financial corrections require Admin action.</> : <><MdWarning className="mr-1 inline" /><strong>Cannot confirm this bill.</strong> Correct the insufficient inventory quantity or replenish stock first.</>}</div>
          <div className="flex justify-end gap-2"><button className="button-secondary" disabled={finalizing} onClick={() => setFinalizePreview(null)}>Go Back</button><button className="button-primary" disabled={finalizing || !finalizePreview.can_finalize} onClick={confirmFinalize}>{finalizing ? 'Confirming…' : `Confirm Bill — ${formatMoney(finalizePreview.total_amount)}`}</button></div>
        </div>}
      </Modal>

      <ConfirmDialog open={paymentConfirm} title={Number(draft.payment_amount || 0) < Number(bill.balance_amount || 0) ? 'Record Partial Payment?' : 'Record Payment?'} message={`${paymentMethodLabel(draft.payment_method)} payment: ${formatMoney(draft.payment_amount)}. ${Number(draft.payment_amount || 0) < Number(bill.balance_amount || 0) ? `Remaining balance after payment: ${formatMoney(Number(bill.balance_amount || 0) - Number(draft.payment_amount || 0))}. ` : ''}${draft.payment_method === 'cash' ? `Cash received: ${formatMoney(draft.amount_received)}; change: ${formatMoney(Math.max(0, Number(draft.amount_received || 0) - Number(draft.payment_amount || 0)))}.` : `Reference: ${draft.reference_number || '—'}.`} Confirm that the payment was actually received before recording it.`} confirmLabel={paying ? 'Recording…' : `Record ${formatMoney(draft.payment_amount)}`} tone="primary" loading={paying} onCancel={() => !paying && setPaymentConfirm(false)} onConfirm={recordPayment} />
    </div>
  )
}

export default Staff_CheckoutDetail
