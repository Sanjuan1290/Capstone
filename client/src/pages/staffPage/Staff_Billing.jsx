import { useEffect, useMemo, useState } from 'react'
import {
  confirmBillPayment,
  getBillById,
  getBillingCatalog,
  getBills,
  getInventory,
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

const STATUS_FILTERS = [
  { value: '', label: 'All' },
  { value: 'pending', label: 'Pending' },
  { value: 'paid', label: 'Paid' },
]

const PAYMENT_OPTIONS = [
  { value: 'cash', label: 'Cash' },
  { value: 'gcash', label: 'GCash' },
  { value: 'maya', label: 'Maya' },
  { value: 'bank_transfer', label: 'Bank Transfer' },
]

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
  },
  materials: Array.isArray(service?.materials)
    ? service.materials.map((material) => ({
      inventory_id: material.inventory_id || null,
      material_name: material.material_name || material.inventory_name || '',
      quantity: Number(material.quantity) || 0,
      unit_label: material.unit_label || material.inventory_unit || '',
      unit_cost: material.unit_cost_override ?? material.inventory_price ?? 0,
      line_total: roundMoney((Number(material.quantity) || 0) * (Number(material.unit_cost_override ?? material.inventory_price) || 0)),
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
        Select a service to see its required materials and automatic pricing.
      </div>
    )
  }

  return (
    <div className="mt-3 rounded-2xl border border-sky-100 bg-sky-50/70 p-4">
      <div className="flex items-center justify-between gap-3">
        <p className="text-xs font-bold uppercase tracking-widest text-sky-600">Service Breakdown</p>
        {pricing && (
          <p className="text-xs font-semibold text-sky-700">
            Materials + service fee + {Number(pricing.profit_percentage) || 0}% profit
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
            <span>Profit</span>
            <span>{formatMoney(pricing.profit_amount)}</span>
          </div>
          <div className="mt-2 flex items-center justify-between border-t border-slate-100 pt-2 font-black text-slate-800">
            <span>Service Price</span>
            <span>{formatMoney(pricing.suggested_price)}</span>
          </div>
        </div>
      )}
    </div>
  )
}

const Staff_Billing = () => {
  const [filter, setFilter] = useState('')
  const [search, setSearch] = useState('')
  const [bills, setBills] = useState([])
  const [selectedId, setSelectedId] = useState(null)
  const [detail, setDetail] = useState(null)
  const [draft, setDraft] = useState(null)
  const [billingCatalog, setBillingCatalog] = useState([])
  const [inventoryItems, setInventoryItems] = useState([])
  const [loadingList, setLoadingList] = useState(true)
  const [loadingDetail, setLoadingDetail] = useState(false)
  const [catalogLoading, setCatalogLoading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [confirming, setConfirming] = useState(false)

  const serviceMap = useMemo(
    () => new Map((billingCatalog || []).map((service) => [Number(service.id), service])),
    [billingCatalog]
  )
  const inventoryMap = useMemo(
    () => new Map((inventoryItems || []).map((item) => [Number(item.id), item])),
    [inventoryItems]
  )

  const loadBills = async (status = filter, preferredId = selectedId) => {
    setLoadingList(true)
    try {
      const rows = await getBills(status)
      const list = Array.isArray(rows) ? rows : []
      setBills(list)

      if (list.length === 0) {
        setSelectedId(null)
        setDetail(null)
        setDraft(null)
        return
      }

      const hasPreferred = preferredId && list.some((bill) => bill.id === preferredId)
      if (!hasPreferred) setSelectedId(list[0].id)
    } catch (err) {
      alert(err.message || 'Failed to load billing records.')
    } finally {
      setLoadingList(false)
    }
  }

  const loadBillDetail = async (billId) => {
    if (!billId) {
      setDetail(null)
      setDraft(null)
      return
    }

    setLoadingDetail(true)
    try {
      const bill = await getBillById(billId)
      setDetail(bill)
      setDraft(normalizeBillForEditor(bill))
    } catch (err) {
      alert(err.message || 'Failed to load billing details.')
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
      alert(err.message || 'Failed to load billing services.')
      setBillingCatalog([])
    } finally {
      setCatalogLoading(false)
    }
  }

  useEffect(() => {
    loadBills(filter, null)
  }, [filter])

  useEffect(() => {
    loadBillDetail(selectedId)
  }, [selectedId])

  useEffect(() => {
    getInventory()
      .then((rows) => setInventoryItems(Array.isArray(rows) ? rows : []))
      .catch(() => setInventoryItems([]))
  }, [])

  useEffect(() => {
    if (!detail?.clinic_type) {
      setBillingCatalog([])
      return
    }
    loadCatalog(detail.clinic_type)
  }, [detail?.clinic_type])

  useEffect(() => {
    const handleRefresh = () => {
      loadBills(filter, selectedId)
      if (selectedId) loadBillDetail(selectedId)
    }

    window.addEventListener('clinic:refresh', handleRefresh)
    return () => window.removeEventListener('clinic:refresh', handleRefresh)
  }, [filter, selectedId])

  const filteredBills = useMemo(() => {
    const query = search.trim().toLowerCase()
    if (!query) return bills
    return bills.filter((bill) => {
      const haystack = [
        bill.patient_name,
        bill.doctor_name,
        bill.appointment_reason,
        bill.payment_method,
      ].join(' ').toLowerCase()
      return haystack.includes(query)
    })
  }, [bills, search])

  const totals = computeEditorTotals(draft)
  const pendingCount = bills.filter((bill) => bill.status === 'pending').length
  const paidCount = bills.filter((bill) => bill.status === 'paid').length
  const totalOutstanding = bills
    .filter((bill) => bill.status === 'pending')
    .reduce((sum, bill) => sum + (Number(bill.total_amount) || 0), 0)

  const selectedPaymentMethod = String(draft?.payment_method || '').toLowerCase()
  const showQr = selectedPaymentMethod === 'gcash' || selectedPaymentMethod === 'maya'
  const isPaid = detail?.status === 'paid'

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
              unit_price: Number(service.suggested_price) || 0,
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

  const handleSave = async () => {
    if (!selectedId || !draft) return
    setSaving(true)
    try {
      const updated = await updateBill(selectedId, {
        items: serializeDraftItems(draft.items),
        discount_type: draft.discount_type,
        discount_label: draft.discount_label,
        discount_amount: draft.discount_amount,
        payment_method: draft.payment_method,
        payment_notes: draft.payment_notes,
      })
      setDetail(updated)
      setDraft(normalizeBillForEditor(updated))
      await loadBills(filter, selectedId)
    } catch (err) {
      alert(err.message || 'Failed to save bill.')
    } finally {
      setSaving(false)
    }
  }

  const handleConfirmPayment = async () => {
    if (!selectedId || !draft) return
    setConfirming(true)
    try {
      await updateBill(selectedId, {
        items: serializeDraftItems(draft.items),
        discount_type: draft.discount_type,
        discount_label: draft.discount_label,
        discount_amount: draft.discount_amount,
        payment_method: draft.payment_method,
        payment_notes: draft.payment_notes,
      })
      const updated = await confirmBillPayment(selectedId, {
        payment_method: draft.payment_method,
        payment_notes: draft.payment_notes,
      })
      setDetail(updated)
      setDraft(normalizeBillForEditor(updated))
      await loadBills(filter, selectedId)
    } catch (err) {
      alert(err.message || 'Failed to confirm payment.')
    } finally {
      setConfirming(false)
    }
  }

  return (
    <div className="space-y-5 max-w-7xl">
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div>
          <h1 className="text-xl lg:text-2xl font-bold text-slate-800 flex items-center gap-2">
            <MdPayments className="text-sky-500 text-[22px]" /> Billing
          </h1>
          <p className="text-xs lg:text-sm text-slate-500 mt-0.5">
            Build structured clinic bills with service breakdowns, supply add-ons, and manual payment confirmation.
          </p>
        </div>
        <button
          onClick={() => {
            loadBills(filter, selectedId)
            if (selectedId) loadBillDetail(selectedId)
          }}
          className="flex items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-semibold text-slate-600 hover:bg-slate-50 transition-colors"
        >
          <MdRefresh className="text-[16px]" /> Refresh
        </button>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        {[
          { label: 'All Bills', value: bills.length, tone: 'text-sky-600 bg-sky-50 border-sky-200' },
          { label: 'Pending', value: pendingCount, tone: 'text-amber-600 bg-amber-50 border-amber-200' },
          { label: 'Paid', value: paidCount, tone: 'text-emerald-600 bg-emerald-50 border-emerald-200' },
          { label: 'Outstanding', value: formatMoney(totalOutstanding), tone: 'text-violet-600 bg-violet-50 border-violet-200' },
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
                  onClick={() => setFilter(option.value)}
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
                value={search}
                onChange={(e) => setSearch(e.target.value)}
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
              <div className="flex items-center justify-center py-16">
                <div className="h-8 w-8 animate-spin rounded-full border-4 border-slate-200 border-t-sky-500" />
              </div>
            ) : filteredBills.length === 0 ? (
              <div className="px-6 py-14 text-center">
                <MdPayments className="mx-auto mb-3 text-[34px] text-slate-200" />
                <p className="text-sm font-semibold text-slate-500">No billing records found</p>
                <p className="mt-1 text-xs text-slate-400">
                  Bills appear here after a doctor completes a consultation.
                </p>
              </div>
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
                        <span
                          className={`shrink-0 rounded-full border px-2 py-0.5 text-[10px] font-bold ${
                            bill.status === 'paid'
                              ? 'border-emerald-200 bg-emerald-50 text-emerald-700'
                              : 'border-amber-200 bg-amber-50 text-amber-700'
                          }`}
                        >
                          {bill.status === 'paid' ? 'Paid' : 'Pending'}
                        </span>
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
                      <div className="mt-2 text-sm font-black text-slate-800">
                        {formatMoney(bill.total_amount)}
                      </div>
                    </button>
                  )
                })}
              </div>
            )}
          </div>
        </div>

        <div className="rounded-2xl border border-slate-200 bg-white shadow-sm overflow-hidden">
          {loadingDetail ? (
            <div className="flex min-h-[480px] items-center justify-center">
              <div className="h-8 w-8 animate-spin rounded-full border-4 border-slate-200 border-t-sky-500" />
            </div>
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
                <span
                  className={`rounded-full border px-3 py-1 text-xs font-bold ${
                    isPaid
                      ? 'border-emerald-200 bg-emerald-50 text-emerald-700'
                      : 'border-amber-200 bg-amber-50 text-amber-700'
                  }`}
                >
                  {isPaid ? 'Paid' : 'Pending Payment'}
                </span>
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
                      {!isPaid && (
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
                              {!isPaid && (
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
                                  disabled={isPaid}
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
                                    disabled={isPaid || catalogLoading}
                                    onChange={(e) => handleServiceSelect(index, e.target.value)}
                                    className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 text-sm focus:outline-none focus:border-sky-400 disabled:opacity-70"
                                  >
                                    <option value="">Select service</option>
                                    {billingCatalog.map((service) => (
                                      <option key={service.id} value={service.id}>
                                        {service.category} - {service.service_name} ({formatMoney(service.suggested_price)})
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
                                    disabled={isPaid}
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
                                    disabled={isPaid}
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
                                    disabled={isPaid}
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
                                  disabled={isPaid}
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
                                  disabled={isPaid || itemType === 'service'}
                                  onChange={(e) => updateDraftItem(index, 'unit_price', e.target.value)}
                                  placeholder="Unit price"
                                  className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 text-sm focus:outline-none focus:border-sky-400 disabled:opacity-70"
                                />
                              </div>
                            </div>

                            {itemType === 'service' && <ServiceBreakdown item={item} />}

                            {itemType === 'supply' && item.source_inventory_id && (
                              <div className="mt-3 rounded-xl border border-emerald-100 bg-emerald-50 px-4 py-3 text-sm text-emerald-800">
                                <p className="font-semibold">Additional supply item</p>
                                <p className="mt-1 text-xs text-emerald-700">
                                  This item is pulled from inventory for easier pricing and documentation. You can still adjust the unit price before payment if needed.
                                </p>
                              </div>
                            )}

                            <textarea
                              value={item.notes}
                              onChange={(e) => updateDraftItem(index, 'notes', e.target.value)}
                              disabled={isPaid}
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
                    <h3 className="text-sm font-bold text-slate-800">Payment Details</h3>

                    <div className="mt-3 space-y-3">
                      <select
                        value={draft.payment_method}
                        onChange={(e) => updateDraftField('payment_method', e.target.value)}
                        disabled={isPaid}
                        className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm focus:outline-none focus:border-sky-400 disabled:opacity-70"
                      >
                        <option value="">Select payment method</option>
                        {PAYMENT_OPTIONS.map((option) => (
                          <option key={option.value} value={option.value}>{option.label}</option>
                        ))}
                      </select>

                      <input
                        type="text"
                        value={draft.discount_label}
                        onChange={(e) => updateDraftField('discount_label', e.target.value)}
                        disabled={isPaid}
                        placeholder="Discount label (e.g. Senior Citizen)"
                        className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm focus:outline-none focus:border-sky-400 disabled:opacity-70"
                      />

                      <input
                        type="number"
                        min="0"
                        step="0.01"
                        value={draft.discount_amount}
                        onChange={(e) => updateDraftField('discount_amount', e.target.value)}
                        disabled={isPaid}
                        placeholder="Discount amount"
                        className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm focus:outline-none focus:border-sky-400 disabled:opacity-70"
                      />

                      <textarea
                        value={draft.payment_notes}
                        onChange={(e) => updateDraftField('payment_notes', e.target.value)}
                        disabled={isPaid}
                        rows={3}
                        placeholder="Payment notes or confirmation details"
                        className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm focus:outline-none focus:border-sky-400 disabled:opacity-70"
                      />
                    </div>
                  </div>

                  {showQr && (
                    <div className="rounded-2xl border border-emerald-200 bg-emerald-50 p-4">
                      <p className="text-sm font-bold text-emerald-800">
                        {selectedPaymentMethod === 'gcash' ? 'GCash' : 'Maya'} QR
                      </p>
                      <p className="mt-1 text-xs leading-relaxed text-emerald-700">
                        Show this QR to the patient, wait for the confirmation screen, then click confirm payment below.
                      </p>
                      <img
                        src="/payments/qr-ph-placeholder.svg"
                        alt="Clinic QR placeholder"
                        className="mt-3 w-full rounded-2xl border border-emerald-200 bg-white p-3"
                      />
                      <p className="mt-2 text-[11px] text-emerald-700">
                        Replace `client/public/payments/qr-ph-placeholder.svg` with your real clinic QR image.
                      </p>
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
                    </div>

                    <div className="mt-3 rounded-xl border border-sky-100 bg-sky-50 px-4 py-3 text-xs text-sky-700">
                      Clinic services automatically use: materials cost + service fee + configured profit. Additional medicines and custom charges can still be added separately.
                    </div>

                    {detail.confirmed_by_staff_name && (
                      <p className="mt-3 text-xs text-slate-400">
                        Confirmed by {detail.confirmed_by_staff_name}
                        {detail.paid_at ? ` on ${detail.paid_at}` : ''}.
                      </p>
                    )}

                    <div className="mt-4 flex flex-col gap-2">
                      {!isPaid && (
                        <button
                          onClick={handleSave}
                          disabled={saving}
                          className="rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-bold text-slate-700 hover:bg-slate-50 disabled:opacity-60"
                        >
                          {saving ? 'Saving...' : 'Save Bill'}
                        </button>
                      )}
                      <button
                        onClick={handleConfirmPayment}
                        disabled={isPaid || confirming}
                        className="flex items-center justify-center gap-1.5 rounded-xl bg-emerald-500 px-4 py-2.5 text-sm font-bold text-white hover:bg-emerald-600 disabled:opacity-60"
                      >
                        <MdCheck className="text-[16px]" />
                        {isPaid ? 'Payment Confirmed' : confirming ? 'Confirming...' : 'Confirm Payment'}
                      </button>
                    </div>
                  </div>

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
                        Review discount and payment notes before marking the bill as paid.
                      </li>
                    </ul>
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

export default Staff_Billing
