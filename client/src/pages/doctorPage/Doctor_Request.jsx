import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  MdAdd,
  MdCheckCircle,
  MdClose,
  MdDescription,
  MdInventory2,
  MdLocalPharmacy,
  MdRefresh,
  MdScience,
  MdCleaningServices,
  MdCategory,
  MdSearch,
  MdSchedule,
  MdWarningAmber,
} from 'react-icons/md'
import { getInventoryItems, getMyRequests, submitRequest } from '../../services/doctor.service'

const STATUS_CFG = {
  pending: {
    label: 'Pending',
    badge: 'border-amber-200 bg-amber-50 text-amber-700',
    stripe: 'bg-amber-400',
  },
  approved: {
    label: 'Approved',
    badge: 'border-emerald-200 bg-emerald-50 text-emerald-700',
    stripe: 'bg-emerald-500',
  },
  rejected: {
    label: 'Rejected',
    badge: 'border-rose-200 bg-rose-50 text-rose-700',
    stripe: 'bg-rose-500',
  },
}

const CATEGORY_CFG = {
  Derma: { bg: 'bg-fuchsia-50', text: 'text-fuchsia-700', Icon: MdScience },
  Medicine: { bg: 'bg-sky-50', text: 'text-sky-700', Icon: MdLocalPharmacy },
  Supplies: { bg: 'bg-slate-100', text: 'text-slate-600', Icon: MdCleaningServices },
}

const TABS = ['all', 'pending', 'approved', 'rejected']

const getCategory = (category) => CATEGORY_CFG[category] || {
  bg: 'bg-slate-100',
  text: 'text-slate-600',
  Icon: MdCategory,
}

const formatDate = (value) => {
  if (!value) return '-'
  return new Date(value).toLocaleDateString('en-PH', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  })
}

const formatStock = (item) => {
  const amount = Number(item.stock ?? 0)
  return Number.isFinite(amount) ? amount : 0
}

const NewRequestModal = ({ inventoryItems, onClose, onSubmit, submitting }) => {
  const [search, setSearch] = useState('')
  const [selectedId, setSelectedId] = useState(null)
  const [qty, setQty] = useState(1)
  const [reason, setReason] = useState('')

  const filtered = useMemo(() => inventoryItems.filter((item) => {
    const needle = search.trim().toLowerCase()
    return !needle ||
      item.name?.toLowerCase().includes(needle) ||
      item.category?.toLowerCase().includes(needle) ||
      item.supplier?.toLowerCase().includes(needle)
  }), [inventoryItems, search])

  const selected = useMemo(
    () => inventoryItems.find((item) => item.id === selectedId) || null,
    [inventoryItems, selectedId]
  )

  const handleSubmit = async () => {
    if (!selected) return
    await onSubmit({
      inventory_id: selected.id,
      qty_requested: qty,
      reason: reason.trim(),
    })
    onClose()
  }

  return (
    <>
      <div className="fixed inset-0 z-40 bg-slate-950/45 backdrop-blur-sm" onClick={onClose} />

      <div className="fixed inset-x-0 bottom-0 z-50 max-h-[92vh] rounded-t-[30px] bg-white shadow-2xl sm:inset-auto sm:left-1/2 sm:top-1/2 sm:w-full sm:max-w-3xl sm:-translate-x-1/2 sm:-translate-y-1/2 sm:rounded-[30px]">
        <div className="flex justify-center pt-3 sm:hidden">
          <div className="h-1.5 w-14 rounded-full bg-slate-200" />
        </div>

        <div className="flex items-start justify-between gap-3 border-b border-slate-100 px-6 py-5">
          <div>
            <p className="text-xs font-bold uppercase tracking-[0.24em] text-violet-500">New Request</p>
            <h2 className="mt-1 text-lg font-bold text-slate-900">Request supplies from inventory</h2>
            <p className="mt-1 text-sm text-slate-500">Pick an item, set a quantity, and explain the clinical need if needed.</p>
          </div>
          <button
            onClick={onClose}
            className="flex h-10 w-10 items-center justify-center rounded-2xl border border-slate-200 text-slate-500 hover:bg-slate-50"
          >
            <MdClose className="text-lg" />
          </button>
        </div>

        <div className="grid gap-5 overflow-y-auto px-6 py-5 sm:grid-cols-[1.15fr_0.85fr] sm:max-h-[68vh]">
          <div className="space-y-4">
            <div className="relative">
              <MdSearch className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-lg text-slate-400" />
              <input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search by item, category, or supplier"
                className="w-full rounded-2xl border border-slate-200 bg-slate-50 py-3 pl-11 pr-4 text-sm text-slate-700 outline-none transition focus:border-violet-400 focus:ring-2 focus:ring-violet-100"
              />
            </div>

            <div className="space-y-3">
              {filtered.length === 0 ? (
                <div className="rounded-2xl border border-dashed border-slate-200 bg-slate-50 px-4 py-10 text-center">
                  <p className="text-sm font-semibold text-slate-600">No inventory items found</p>
                  <p className="mt-1 text-xs text-slate-400">Try a different search term.</p>
                </div>
              ) : filtered.map((item) => {
                const category = getCategory(item.category)
                const CategoryIcon = category.Icon
                const selectedState = selected?.id === item.id
                const stock = formatStock(item)

                return (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => setSelectedId(item.id)}
                    className={`w-full rounded-[24px] border p-4 text-left transition ${
                      selectedState
                        ? 'border-violet-300 bg-violet-50 shadow-sm'
                        : 'border-slate-200 bg-white hover:border-slate-300 hover:bg-slate-50'
                    }`}
                  >
                    <div className="flex items-start gap-3">
                      <div className={`flex h-11 w-11 items-center justify-center rounded-2xl ${category.bg}`}>
                        <CategoryIcon className={`text-xl ${category.text}`} />
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center justify-between gap-2">
                          <p className="truncate text-sm font-bold text-slate-900">{item.name}</p>
                          {selectedState && (
                            <span className="rounded-full bg-violet-600 px-2 py-0.5 text-[11px] font-bold text-white">Selected</span>
                          )}
                        </div>
                        <p className="mt-1 text-xs text-slate-500">{item.category || 'Uncategorized'} • {item.supplier || 'Clinic stock'}</p>
                        <div className="mt-3 flex flex-wrap gap-2">
                          <span className="rounded-full border border-slate-200 bg-white px-2.5 py-1 text-[11px] font-semibold text-slate-600">
                            {stock} {item.unit}(s) available
                          </span>
                          {Number(item.threshold || 0) >= stock && (
                            <span className="rounded-full border border-amber-200 bg-amber-50 px-2.5 py-1 text-[11px] font-semibold text-amber-700">
                              Low stock
                            </span>
                          )}
                        </div>
                      </div>
                    </div>
                  </button>
                )
              })}
            </div>
          </div>

          <div className="space-y-4">
            <div className="rounded-[24px] border border-slate-200 bg-slate-50 p-5">
              <p className="text-xs font-bold uppercase tracking-[0.22em] text-slate-400">Request Details</p>

              {selected ? (
                <div className="mt-4 space-y-4">
                  <div>
                    <p className="text-base font-bold text-slate-900">{selected.name}</p>
                    <p className="mt-1 text-sm text-slate-500">{selected.category || 'Uncategorized'} • {selected.unit}(s)</p>
                  </div>

                  <label className="block">
                    <span className="mb-2 block text-[11px] font-bold uppercase tracking-[0.2em] text-slate-400">
                      Quantity
                    </span>
                    <div className="flex items-center gap-3">
                      <button
                        type="button"
                        onClick={() => setQty((current) => Math.max(1, current - 1))}
                        className="flex h-11 w-11 items-center justify-center rounded-2xl border border-slate-200 bg-white text-lg font-bold text-slate-700"
                      >
                        -
                      </button>
                      <input
                        type="number"
                        min="1"
                        value={qty}
                        onChange={(e) => setQty(Math.max(1, Number(e.target.value) || 1))}
                        className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-center text-lg font-black text-slate-900 outline-none focus:border-violet-400"
                      />
                      <button
                        type="button"
                        onClick={() => setQty((current) => current + 1)}
                        className="flex h-11 w-11 items-center justify-center rounded-2xl border border-slate-200 bg-white text-lg font-bold text-slate-700"
                      >
                        +
                      </button>
                    </div>
                  </label>

                  <label className="block">
                    <span className="mb-2 block text-[11px] font-bold uppercase tracking-[0.2em] text-slate-400">
                      Reason
                    </span>
                    <textarea
                      value={reason}
                      onChange={(e) => setReason(e.target.value)}
                      rows={4}
                      placeholder="Optional note for staff or admin."
                      className="w-full resize-none rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-700 outline-none focus:border-violet-400"
                    />
                  </label>
                </div>
              ) : (
                <div className="mt-4 rounded-2xl border border-dashed border-slate-200 bg-white px-4 py-10 text-center">
                  <MdInventory2 className="mx-auto text-4xl text-slate-300" />
                  <p className="mt-3 text-sm font-semibold text-slate-600">Select an inventory item</p>
                  <p className="mt-1 text-xs text-slate-400">Request details will appear here once an item is selected.</p>
                </div>
              )}
            </div>
          </div>
        </div>

        <div className="flex gap-3 border-t border-slate-100 px-6 py-5">
          <button
            onClick={onClose}
            className="flex-1 rounded-2xl border border-slate-200 px-4 py-3 text-sm font-semibold text-slate-600 hover:bg-slate-50"
          >
            Cancel
          </button>
          <button
            onClick={handleSubmit}
            disabled={!selected || submitting}
            className="flex-1 rounded-2xl bg-violet-600 px-4 py-3 text-sm font-bold text-white shadow-lg shadow-violet-600/20 hover:bg-violet-700 disabled:opacity-50"
          >
            {submitting ? 'Submitting...' : 'Submit Request'}
          </button>
        </div>
      </div>
    </>
  )
}

const RequestCard = ({ request }) => {
  const status = STATUS_CFG[request.status] || STATUS_CFG.pending
  const category = getCategory(request.category)
  const CategoryIcon = category.Icon

  return (
    <article className="overflow-hidden rounded-[24px] border border-slate-200 bg-white shadow-sm">
      <div className={`h-1 w-full ${status.stripe}`} />
      <div className="p-4 md:p-5">
        <div className="flex items-start gap-3">
          <div className={`flex h-12 w-12 items-center justify-center rounded-2xl ${category.bg}`}>
            <CategoryIcon className={`text-xl ${category.text}`} />
          </div>

          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <h3 className="text-base font-bold text-slate-900">{request.item_name}</h3>
              <span className={`rounded-full border px-2.5 py-1 text-[11px] font-bold uppercase tracking-[0.15em] ${status.badge}`}>
                {status.label}
              </span>
            </div>

            <div className="mt-3 grid gap-2 text-sm text-slate-600 md:grid-cols-3">
              <div className="inline-flex items-center gap-2 rounded-2xl bg-slate-50 px-3 py-2">
                <MdInventory2 className="text-slate-400" />
                <span>{request.qty_requested} {request.unit}(s)</span>
              </div>
              <div className="inline-flex items-center gap-2 rounded-2xl bg-slate-50 px-3 py-2">
                <MdSchedule className="text-slate-400" />
                <span>{formatDate(request.requested_at)}</span>
              </div>
              <div className="inline-flex items-center gap-2 rounded-2xl bg-slate-50 px-3 py-2">
                <MdDescription className="text-slate-400" />
                <span>{request.category || 'General'}</span>
              </div>
            </div>

            <div className="mt-3 rounded-2xl border border-slate-100 bg-slate-50 px-4 py-3">
              <p className="text-[11px] font-bold uppercase tracking-[0.2em] text-slate-400">Reason</p>
              <p className="mt-1 text-sm text-slate-600">{request.reason || 'No reason provided.'}</p>
            </div>
          </div>
        </div>
      </div>
    </article>
  )
}

const Doctor_Request = () => {
  const [inventoryItems, setInventoryItems] = useState([])
  const [requests, setRequests] = useState([])
  const [loading, setLoading] = useState(true)
  const [submitting, setSubmitting] = useState(false)
  const [showModal, setShowModal] = useState(false)
  const [filter, setFilter] = useState('all')
  const [search, setSearch] = useState('')
  const [feedback, setFeedback] = useState(null)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const [items, requestRows] = await Promise.all([getInventoryItems(), getMyRequests()])
      setInventoryItems(Array.isArray(items) ? items : [])
      setRequests(Array.isArray(requestRows) ? requestRows : [])
    } catch (err) {
      setFeedback({ type: 'error', message: err.message || 'Failed to load supply requests.' })
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { load() }, [load])

  useEffect(() => {
    const refresh = () => load()
    window.addEventListener('clinic:refresh', refresh)
    return () => window.removeEventListener('clinic:refresh', refresh)
  }, [load])

  useEffect(() => {
    if (!feedback) return undefined
    const timer = window.setTimeout(() => setFeedback(null), 3500)
    return () => window.clearTimeout(timer)
  }, [feedback])

  const handleSubmit = async (payload) => {
    setSubmitting(true)
    try {
      const newRequest = await submitRequest(payload)
      setRequests((prev) => [newRequest, ...prev])
      setFeedback({ type: 'success', message: 'Supply request submitted.' })
    } catch (err) {
      setFeedback({ type: 'error', message: err.message || 'Request failed.' })
      throw err
    } finally {
      setSubmitting(false)
    }
  }

  const counts = useMemo(() => TABS.reduce((acc, tab) => {
    acc[tab] = tab === 'all' ? requests.length : requests.filter((request) => request.status === tab).length
    return acc
  }, {}), [requests])

  const availableItems = inventoryItems.filter((item) => formatStock(item) > 0).length
  const lowStockItems = inventoryItems.filter((item) => {
    const stock = formatStock(item)
    return stock > 0 && stock <= Number(item.threshold || 0)
  }).length

  const filtered = useMemo(() => requests.filter((request) => {
    const matchesFilter = filter === 'all' || request.status === filter
    const needle = search.trim().toLowerCase()
    const matchesSearch = !needle ||
      request.item_name?.toLowerCase().includes(needle) ||
      request.reason?.toLowerCase().includes(needle) ||
      request.category?.toLowerCase().includes(needle)
    return matchesFilter && matchesSearch
  }), [requests, filter, search])

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="h-10 w-10 animate-spin rounded-full border-4 border-slate-200 border-t-violet-500" />
      </div>
    )
  }

  return (
    <div className="max-w-6xl space-y-6">
      <section className="overflow-hidden rounded-[30px] border border-violet-200 bg-[radial-gradient(circle_at_top_left,_rgba(139,92,246,0.18),_transparent_45%),linear-gradient(135deg,#ffffff_0%,#f8f7ff_52%,#f4f1ff_100%)] p-6 shadow-sm">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="max-w-2xl">
            <div className="inline-flex items-center gap-2 rounded-full border border-violet-200 bg-white/80 px-3 py-1 text-[11px] font-bold uppercase tracking-[0.24em] text-violet-600">
              <MdInventory2 className="text-sm" />
              Doctor Supply Desk
            </div>
            <h1 className="mt-3 text-2xl font-bold text-slate-900">Supply Requests</h1>
            <p className="mt-2 text-sm text-slate-600">
              Submit supply requests from clinic inventory and track approval status without leaving the doctor portal.
            </p>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={load}
              className="inline-flex h-11 w-11 items-center justify-center rounded-2xl border border-slate-200 bg-white text-slate-500 hover:bg-slate-50"
            >
              <MdRefresh className="text-lg" />
            </button>
            <button
              onClick={() => setShowModal(true)}
              className="inline-flex items-center gap-2 rounded-2xl bg-violet-600 px-5 py-3 text-sm font-bold text-white shadow-lg shadow-violet-600/20 hover:bg-violet-700"
            >
              <MdAdd className="text-lg" />
              New Request
            </button>
          </div>
        </div>

        <div className="mt-6 grid gap-3 md:grid-cols-4">
          {[
            { label: 'Pending', value: counts.pending || 0, tone: 'border-amber-200 bg-amber-50 text-amber-700' },
            { label: 'Approved', value: counts.approved || 0, tone: 'border-emerald-200 bg-emerald-50 text-emerald-700' },
            { label: 'Available Items', value: availableItems, tone: 'border-sky-200 bg-sky-50 text-sky-700' },
            { label: 'Low Stock Items', value: lowStockItems, tone: 'border-rose-200 bg-rose-50 text-rose-700' },
          ].map((card) => (
            <div key={card.label} className={`rounded-2xl border px-4 py-4 ${card.tone}`}>
              <p className="text-3xl font-black">{card.value}</p>
              <p className="mt-1 text-[11px] font-bold uppercase tracking-[0.2em]">{card.label}</p>
            </div>
          ))}
        </div>
      </section>

      {feedback && (
        <div className={`flex items-start gap-3 rounded-2xl border px-4 py-3 text-sm ${
          feedback.type === 'error'
            ? 'border-rose-200 bg-rose-50 text-rose-700'
            : 'border-emerald-200 bg-emerald-50 text-emerald-700'
        }`}>
          {feedback.type === 'error'
            ? <MdWarningAmber className="mt-0.5 text-lg" />
            : <MdCheckCircle className="mt-0.5 text-lg" />}
          <p>{feedback.message}</p>
        </div>
      )}

      <div className="grid gap-3 lg:grid-cols-[1fr_auto]">
        <div className="relative">
          <MdSearch className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-lg text-slate-400" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search request by item, category, or reason"
            className="w-full rounded-2xl border border-slate-200 bg-white py-3 pl-11 pr-4 text-sm text-slate-700 outline-none transition focus:border-violet-400 focus:ring-2 focus:ring-violet-100"
          />
        </div>

        <div className="flex gap-2 overflow-x-auto">
          {TABS.map((tab) => (
            <button
              key={tab}
              onClick={() => setFilter(tab)}
              className={`rounded-2xl px-4 py-3 text-sm font-semibold capitalize transition ${
                filter === tab
                  ? 'bg-violet-600 text-white'
                  : 'border border-slate-200 bg-white text-slate-600 hover:bg-slate-50'
              }`}
            >
              {tab}
              <span className={`ml-2 rounded-full px-2 py-0.5 text-[11px] ${filter === tab ? 'bg-white/15' : 'bg-slate-100 text-slate-500'}`}>
                {counts[tab] || 0}
              </span>
            </button>
          ))}
        </div>
      </div>

      {filtered.length === 0 ? (
        <section className="rounded-[28px] border border-dashed border-slate-200 bg-white px-6 py-14 text-center">
          <MdInventory2 className="mx-auto text-5xl text-slate-300" />
          <p className="mt-4 text-sm font-semibold text-slate-600">No supply requests found</p>
          <p className="mt-1 text-xs text-slate-400">
            {filter === 'all' ? 'Create a new request to start tracking supply needs.' : `There are no ${filter} requests right now.`}
          </p>
        </section>
      ) : (
        <div className="space-y-3">
          {filtered.map((request) => (
            <RequestCard key={request.id} request={request} />
          ))}
        </div>
      )}

      {showModal && (
        <NewRequestModal
          inventoryItems={inventoryItems}
          onClose={() => setShowModal(false)}
          onSubmit={handleSubmit}
          submitting={submitting}
        />
      )}
    </div>
  )
}

export default Doctor_Request
