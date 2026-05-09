import { useEffect, useMemo, useState } from 'react'
import {
  getBills,
  getBillById,
  updateBill,
  confirmBillPayment,
} from '../../services/staff.service'
import {
  MdAccessTime,
  MdAdd,
  MdCalendarToday,
  MdCheck,
  MdClose,
  MdPayments,
  MdPerson,
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

const roundMoney = (value) => Math.round((Number(value) || 0) * 100) / 100

const formatMoney = (value) => new Intl.NumberFormat('en-PH', {
  style: 'currency',
  currency: 'PHP',
}).format(Number(value) || 0)

const makeBlankItem = () => ({
  category: '',
  service_name: '',
  quantity: 1,
  unit_price: 0,
  notes: '',
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
        category: item.category || '',
        service_name: item.service_name || '',
        quantity: Number(item.quantity) || 1,
        unit_price: Number(item.unit_price) || 0,
        notes: item.notes || '',
      }))
    : [makeBlankItem()],
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

const Staff_Billing = () => {
  const [filter, setFilter] = useState('')
  const [search, setSearch] = useState('')
  const [bills, setBills] = useState([])
  const [selectedId, setSelectedId] = useState(null)
  const [detail, setDetail] = useState(null)
  const [draft, setDraft] = useState(null)
  const [loadingList, setLoadingList] = useState(true)
  const [loadingDetail, setLoadingDetail] = useState(false)
  const [saving, setSaving] = useState(false)
  const [confirming, setConfirming] = useState(false)

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

  useEffect(() => {
    loadBills(filter, null)
  }, [filter])

  useEffect(() => {
    loadBillDetail(selectedId)
  }, [selectedId])

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

  const addItem = () => {
    setDraft((current) => ({
      ...current,
      items: [...(current?.items || []), makeBlankItem()],
    }))
  }

  const removeItem = (index) => {
    setDraft((current) => ({
      ...current,
      items: current.items.length === 1
        ? [makeBlankItem()]
        : current.items.filter((_, itemIndex) => itemIndex !== index),
    }))
  }

  const handleSave = async () => {
    if (!selectedId || !draft) return
    setSaving(true)
    try {
      const updated = await updateBill(selectedId, {
        items: draft.items,
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
        items: draft.items,
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
            Review consultation bills, update charges, and manually confirm payments.
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

              <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_320px]">
                <div className="space-y-4">
                  <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                    <div className="mb-3 flex items-center justify-between">
                      <h3 className="text-sm font-bold text-slate-800">Bill Items</h3>
                      {!isPaid && (
                        <button
                          onClick={addItem}
                          className="flex items-center gap-1 rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-bold text-slate-600 hover:bg-slate-50"
                        >
                          <MdAdd className="text-[14px]" /> Add Item
                        </button>
                      )}
                    </div>

                    <div className="space-y-3">
                      {draft.items.map((item, index) => (
                        <div key={index} className="rounded-2xl border border-slate-200 bg-white p-4">
                          <div className="flex items-start justify-between gap-3">
                            <p className="text-xs font-bold uppercase tracking-widest text-slate-400">
                              Item {index + 1}
                            </p>
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
                            <input
                              type="text"
                              value={item.category}
                              onChange={(e) => updateDraftItem(index, 'category', e.target.value)}
                              disabled={isPaid}
                              placeholder="Category"
                              className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 text-sm focus:outline-none focus:border-sky-400 disabled:opacity-70"
                            />
                            <input
                              type="text"
                              value={item.service_name}
                              onChange={(e) => updateDraftItem(index, 'service_name', e.target.value)}
                              disabled={isPaid}
                              placeholder="Service name"
                              className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 text-sm focus:outline-none focus:border-sky-400 disabled:opacity-70"
                            />
                            <input
                              type="number"
                              min="0"
                              step="0.01"
                              value={item.quantity}
                              onChange={(e) => updateDraftItem(index, 'quantity', e.target.value)}
                              disabled={isPaid}
                              placeholder="Quantity"
                              className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 text-sm focus:outline-none focus:border-sky-400 disabled:opacity-70"
                            />
                            <input
                              type="number"
                              min="0"
                              step="0.01"
                              value={item.unit_price}
                              onChange={(e) => updateDraftItem(index, 'unit_price', e.target.value)}
                              disabled={isPaid}
                              placeholder="Unit price"
                              className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 text-sm focus:outline-none focus:border-sky-400 disabled:opacity-70"
                            />
                          </div>

                          <textarea
                            value={item.notes}
                            onChange={(e) => updateDraftItem(index, 'notes', e.target.value)}
                            disabled={isPaid}
                            rows={2}
                            placeholder="Notes (optional)"
                            className="mt-3 w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 text-sm focus:outline-none focus:border-sky-400 disabled:opacity-70"
                          />

                          <p className="mt-3 text-right text-sm font-bold text-slate-700">
                            Line Total: {formatMoney((Number(item.quantity) || 0) * (Number(item.unit_price) || 0))}
                          </p>
                        </div>
                      ))}
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
