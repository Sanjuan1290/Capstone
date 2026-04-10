// client/src/pages/doctorPage/Doctor_Request.jsx
// REDESIGNED: Card layout, mobile-first modal, status tabs, qty stepper

import { useEffect, useState } from 'react'
import { getInventoryItems, getMyRequests, submitRequest } from '../../services/doctor.service'
import {
  MdAdd, MdClose, MdInventory2, MdCheck, MdSearch,
  MdLocalPharmacy, MdScience, MdCleaningServices, MdCategory,
  MdCancel, MdPending, MdRefresh, MdArrowBack,
} from 'react-icons/md'

const STATUS = {
  pending:  { label: 'Pending',  badge: 'bg-amber-50   text-amber-700  border-amber-200',   icon: MdPending  },
  approved: { label: 'Approved', badge: 'bg-emerald-50 text-emerald-700 border-emerald-200', icon: MdCheck    },
  rejected: { label: 'Rejected', badge: 'bg-red-50     text-red-500    border-red-200',      icon: MdCancel   },
}

const CAT = {
  Derma:    { bg: 'bg-purple-50', text: 'text-purple-700', Icon: MdScience        },
  Medicine: { bg: 'bg-sky-50',    text: 'text-sky-700',    Icon: MdLocalPharmacy  },
  Supplies: { bg: 'bg-slate-100', text: 'text-slate-600',  Icon: MdCleaningServices },
}
const getCat = cat => CAT[cat] || { bg: 'bg-slate-100', text: 'text-slate-600', Icon: MdCategory }

const TABS = ['all','pending','approved','rejected']

// ── New Request Modal ─────────────────────────────────────────────────────────
const NewRequestModal = ({ onClose, onSubmit, inventoryItems }) => {
  const [search,   setSearch]   = useState('')
  const [selected, setSelected] = useState(null)
  const [qty,      setQty]      = useState(1)
  const [reason,   setReason]   = useState('')
  const [submitting, setSub]    = useState(false)

  const filtered = inventoryItems.filter(i =>
    !search || i.name.toLowerCase().includes(search.toLowerCase()) ||
    i.category?.toLowerCase().includes(search.toLowerCase())
  )

  const handleSubmit = async () => {
    if (!selected) return
    setSub(true)
    try {
      await onSubmit({ item: selected, qty, reason })
      onClose()
    } catch (err) {
      alert(err.message || 'Request failed.')
    } finally { setSub(false) }
  }

  return (
    <>
      {/* Overlay */}
      <div className="fixed inset-0 z-40 bg-black/50 backdrop-blur-sm" onClick={onClose} />

      {/* Sheet — bottom on mobile, centered on tablet+ */}
      <div className="fixed bottom-0 left-0 right-0 z-50 bg-white rounded-t-3xl shadow-2xl
        flex flex-col max-h-[92vh] overflow-hidden
        sm:static sm:fixed sm:inset-auto sm:top-1/2 sm:left-1/2 sm:-translate-x-1/2 sm:-translate-y-1/2
        sm:w-full sm:max-w-md sm:rounded-3xl sm:shadow-2xl sm:max-h-[85vh]">

        {/* Handle (mobile) */}
        <div className="sm:hidden flex justify-center pt-3 pb-1">
          <div className="w-10 h-1 bg-slate-200 rounded-full" />
        </div>

        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100 shrink-0">
          <div>
            <p className="text-sm font-bold text-slate-800">New Supply Request</p>
            <p className="text-xs text-slate-400 mt-0.5">Select an item from inventory</p>
          </div>
          <button onClick={onClose}
            className="w-8 h-8 flex items-center justify-center rounded-xl hover:bg-slate-100 text-slate-400">
            <MdClose />
          </button>
        </div>

        {/* Search */}
        <div className="px-6 py-3 border-b border-slate-100 shrink-0">
          <div className="relative">
            <MdSearch className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400 text-[17px]" />
            <input type="text" value={search} onChange={e => setSearch(e.target.value)}
              placeholder="Search by name or category…"
              className="w-full pl-10 pr-4 py-2.5 bg-slate-50 border-2 border-slate-200 rounded-xl text-sm
                focus:outline-none focus:border-violet-400 transition-all" />
          </div>
        </div>

        {/* Item list */}
        <div className="flex-1 overflow-y-auto px-6 py-3 space-y-2">
          {filtered.length === 0 ? (
            <p className="text-center text-sm text-slate-400 py-8">No items found.</p>
          ) : filtered.map(item => {
            const c = getCat(item.category)
            return (
              <button key={item.id} onClick={() => setSelected(item)}
                className={`w-full flex items-center gap-3 p-3.5 rounded-2xl border-2 text-left transition-all
                  ${selected?.id === item.id
                    ? 'border-violet-400 bg-violet-50'
                    : 'border-slate-200 bg-white hover:border-slate-300'}`}>
                <div className={`w-9 h-9 rounded-xl ${c.bg} flex items-center justify-center shrink-0`}>
                  <c.Icon className={`text-[16px] ${c.text}`} />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold text-slate-800 truncate">{item.name}</p>
                  <p className="text-xs text-slate-400">{item.category} · {item.stock} {item.unit}(s) in stock</p>
                </div>
                {selected?.id === item.id && (
                  <div className="w-5 h-5 rounded-full bg-violet-500 flex items-center justify-center shrink-0">
                    <MdCheck className="text-white text-[11px]" />
                  </div>
                )}
              </button>
            )
          })}
        </div>

        {/* Qty + Reason (shown when item selected) */}
        {selected && (
          <div className="px-6 py-4 space-y-4 border-t border-slate-100 shrink-0 bg-slate-50/50">
            <div>
              <label className="text-[11px] font-bold text-slate-500 uppercase tracking-widest mb-2 block">
                Quantity ({selected.unit}s)
              </label>
              <div className="flex items-center gap-3">
                <button onClick={() => setQty(q => Math.max(1, q - 1))}
                  className="w-11 h-11 rounded-xl border-2 border-slate-200 font-bold text-lg hover:bg-slate-100 transition-colors">
                  −
                </button>
                <input type="number" min={1} value={qty}
                  onChange={e => setQty(Math.max(1, parseInt(e.target.value) || 1))}
                  className="flex-1 text-center text-lg font-black bg-white border-2 border-slate-200 rounded-xl py-2.5
                    focus:outline-none focus:border-violet-400 transition-all" />
                <button onClick={() => setQty(q => q + 1)}
                  className="w-11 h-11 rounded-xl border-2 border-slate-200 font-bold text-lg hover:bg-slate-100 transition-colors">
                  +
                </button>
              </div>
            </div>
            <div>
              <label className="text-[11px] font-bold text-slate-500 uppercase tracking-widest mb-1.5 block">
                Reason <span className="normal-case font-normal text-slate-300">(optional)</span>
              </label>
              <textarea value={reason} onChange={e => setReason(e.target.value)}
                placeholder="Why do you need this item?" rows={2}
                className="w-full text-sm bg-white border-2 border-slate-200 rounded-xl px-3 py-2.5
                  outline-none focus:border-violet-400 resize-none transition-all" />
            </div>
          </div>
        )}

        {/* Footer */}
        <div className="px-6 pb-6 pt-3 flex gap-3 shrink-0 border-t border-slate-100">
          <button onClick={onClose}
            className="flex-1 py-3 text-sm font-semibold text-slate-600 border border-slate-200 rounded-2xl hover:bg-slate-50 transition-colors">
            Cancel
          </button>
          <button onClick={handleSubmit} disabled={!selected || submitting}
            className="flex-1 py-3 text-sm font-bold text-white bg-violet-600 hover:bg-violet-700
              disabled:opacity-40 rounded-2xl transition-colors shadow-lg shadow-violet-600/20">
            {submitting ? 'Submitting…' : 'Submit Request'}
          </button>
        </div>
      </div>
    </>
  )
}

// ── Request Card ──────────────────────────────────────────────────────────────
const RequestCard = ({ req }) => {
  const st  = STATUS[req.status] || STATUS.pending
  const cat = getCat(req.category)
  const SI  = st.icon
  return (
    <div className="bg-white rounded-2xl border border-slate-200 p-4 flex items-center gap-3 hover:border-slate-300 transition-all">
      <div className={`w-10 h-10 rounded-xl ${cat.bg} flex items-center justify-center shrink-0`}>
        <cat.Icon className={`text-[18px] ${cat.text}`} />
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 flex-wrap">
          <p className="text-sm font-bold text-slate-800 truncate">{req.item_name}</p>
          <span className={`text-[10px] font-bold border px-2 py-0.5 rounded-full flex items-center gap-1 ${st.badge}`}>
            <SI className="text-[10px]" /> {st.label}
          </span>
        </div>
        <p className="text-xs text-slate-500 mt-0.5">
          {req.qty_requested} {req.unit}(s) · {req.reason || 'No reason provided'}
        </p>
        <p className="text-[10px] text-slate-400 mt-0.5">
          {new Date(req.requested_at).toLocaleDateString('en-PH', { month: 'short', day: 'numeric', year: 'numeric' })}
        </p>
      </div>
    </div>
  )
}

// ── Main ──────────────────────────────────────────────────────────────────────
const Doctor_Request = () => {
  const [inventoryItems, setInventoryItems] = useState([])
  const [requests,       setRequests]       = useState([])
  const [loading,        setLoading]        = useState(true)
  const [showModal,      setShowModal]      = useState(false)
  const [filter,         setFilter]         = useState('all')
  const [search,         setSearch]         = useState('')

  const load = () => {
    setLoading(true)
    Promise.all([getInventoryItems(), getMyRequests()])
      .then(([items, reqs]) => { setInventoryItems(items); setRequests(reqs) })
      .catch(() => {})
      .finally(() => setLoading(false))
  }

  useEffect(() => { load() }, [])

  const handleSubmit = async ({ item, qty, reason }) => {
    try {
      const newReq = await submitRequest({ inventory_id: item.id, qty_requested: qty, reason: reason || '' })
      setRequests(prev => [newReq, ...prev])
    } catch (err) {
      alert(err.message || 'Request failed.')
    }
  }

  const filtered = requests.filter(r => {
    const matchFilter = filter === 'all' || r.status === filter
    const matchSearch = !search || r.item_name?.toLowerCase().includes(search.toLowerCase())
    return matchFilter && matchSearch
  })

  const counts = TABS.reduce((acc, t) => {
    acc[t] = t === 'all' ? requests.length : requests.filter(r => r.status === t).length
    return acc
  }, {})

  if (loading) return (
    <div className="flex items-center justify-center py-20">
      <div className="w-8 h-8 border-4 border-slate-200 border-t-violet-500 rounded-full animate-spin" />
    </div>
  )

  return (
    <div className="max-w-3xl space-y-5">

      {/* Header */}
      <div className="flex items-start justify-between gap-3">
        <div>
          <h1 className="text-xl lg:text-2xl font-bold text-slate-800">Supply Requests</h1>
          <p className="text-xs lg:text-sm text-slate-500 mt-0.5">Request supplies from the clinic inventory.</p>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <button onClick={load}
            className="w-9 h-9 flex items-center justify-center rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-500 transition-colors">
            <MdRefresh className="text-[18px]" />
          </button>
          <button onClick={() => setShowModal(true)}
            className="flex items-center gap-1.5 bg-violet-600 hover:bg-violet-700 text-white text-xs font-bold
              px-4 py-2.5 rounded-xl transition-colors shadow-lg shadow-violet-600/20">
            <MdAdd className="text-[15px]" /> New Request
          </button>
        </div>
      </div>

      {/* Stat cards */}
      <div className="grid grid-cols-3 gap-3">
        {['pending','approved','rejected'].map(s => {
          const cfg = STATUS[s]
          return (
            <div key={s} className={`rounded-2xl border p-4 text-center ${cfg.badge}`}>
              <p className="text-2xl font-black">{counts[s]}</p>
              <p className="text-[11px] font-bold uppercase mt-0.5">{cfg.label}</p>
            </div>
          )
        })}
      </div>

      {/* Filter tabs + search */}
      <div className="space-y-3">
        <div className="flex gap-1.5 overflow-x-auto pb-1">
          {TABS.map(t => (
            <button key={t} onClick={() => setFilter(t)}
              className={`flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-bold whitespace-nowrap transition-all
                ${filter === t ? 'bg-violet-600 text-white shadow-sm' : 'bg-white text-slate-500 border border-slate-200 hover:border-slate-300'}`}>
              {t.charAt(0).toUpperCase()+t.slice(1)}
              {counts[t] > 0 && (
                <span className={`text-[10px] font-black px-1.5 py-0.5 rounded-full
                  ${filter === t ? 'bg-white/20 text-white' : 'bg-slate-100 text-slate-500'}`}>
                  {counts[t]}
                </span>
              )}
            </button>
          ))}
        </div>

        <div className="relative">
          <MdSearch className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400 text-[17px]" />
          <input type="text" value={search} onChange={e => setSearch(e.target.value)}
            placeholder="Search by item name…"
            className="w-full pl-10 pr-4 py-3 bg-white border border-slate-200 rounded-2xl text-sm
              focus:outline-none focus:border-violet-400 focus:ring-2 focus:ring-violet-400/10 transition-all" />
        </div>
      </div>

      {/* List */}
      {filtered.length === 0 ? (
        <div className="flex flex-col items-center py-16 bg-white rounded-2xl border border-slate-200">
          <MdInventory2 className="text-slate-200 text-[36px] mb-3" />
          <p className="text-sm font-semibold text-slate-500">No requests found</p>
          <p className="text-xs text-slate-400 mt-1">
            {filter === 'all' ? "You haven't submitted any requests yet." : `No ${filter} requests.`}
          </p>
          {filter === 'all' && (
            <button onClick={() => setShowModal(true)}
              className="mt-4 flex items-center gap-1.5 bg-violet-600 text-white text-xs font-bold px-5 py-2.5 rounded-xl">
              <MdAdd className="text-[14px]" /> New Request
            </button>
          )}
        </div>
      ) : (
        <div className="space-y-3">
          {filtered.map(req => <RequestCard key={req.id} req={req} />)}
        </div>
      )}

      {showModal && (
        <NewRequestModal
          inventoryItems={inventoryItems}
          onClose={() => setShowModal(false)}
          onSubmit={handleSubmit}
        />
      )}
    </div>
  )
}

export default Doctor_Request