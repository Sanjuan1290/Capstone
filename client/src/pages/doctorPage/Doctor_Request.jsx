import { useEffect, useState } from 'react'
import { getInventoryItems, getMyRequests, submitRequest } from '../../services/doctor.service'
import {
  MdAdd, MdClose, MdInventory2, MdCheck, MdPending,
  MdSearch, MdInfoOutline, MdLocalPharmacy,
  MdScience, MdCleaningServices, MdCategory, MdCancel
} from "react-icons/md"

const STATUS_CONFIG = {
  pending:  { label: "Pending",  badge: "bg-amber-50   text-amber-700  border-amber-200",   icon: MdPending  },
  approved: { label: "Approved", badge: "bg-emerald-50 text-emerald-700 border-emerald-200", icon: MdCheck    },
  rejected: { label: "Rejected", badge: "bg-red-50     text-red-500    border-red-200",      icon: MdCancel   },
}

const getCatStyle = cat => ({
  Derma:    { bg: "bg-purple-50", text: "text-purple-700", icon: MdScience          },
  Medicine: { bg: "bg-sky-50",    text: "text-sky-700",    icon: MdLocalPharmacy    },
  Supplies: { bg: "bg-slate-100", text: "text-slate-600",  icon: MdCleaningServices },
})[cat] || { bg: "bg-slate-100", text: "text-slate-600", icon: MdCategory }

// ── New Request Modal ─────────────────────────────────────────────────────────
const NewRequestModal = ({ onClose, onSubmit, inventoryItems }) => {
  const [search, setSearch] = useState("")
  const [selected, setSelected] = useState(null)
  const [qty, setQty] = useState(1)
  const [reason, setReason] = useState("")

  const filtered = inventoryItems.filter(i =>
    !search || i.name.toLowerCase().includes(search.toLowerCase()) || i.category?.toLowerCase().includes(search.toLowerCase())
  )

  const handleModalSubmit = () => {
    if (!selected || qty < 1) return
    onSubmit({ item: selected, qty, reason })
    onClose()
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm px-4" onClick={onClose}>
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md max-h-[90vh] flex flex-col" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between px-6 py-5 border-b border-slate-100 shrink-0">
          <div>
            <p className="text-sm font-bold text-slate-800">New Supply Request</p>
            <p className="text-xs text-slate-500 mt-0.5">Select an item and specify quantity needed</p>
          </div>
          <button onClick={onClose} className="w-8 h-8 flex items-center justify-center rounded-xl hover:bg-slate-100 text-slate-400">
            <MdClose className="text-[18px]" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-6 py-5 space-y-4">
          <label className="text-xs font-bold text-slate-500 uppercase tracking-widest mb-1.5 block">Select Item</label>
          <div className="flex items-center gap-2 bg-slate-50 border-2 border-slate-200 rounded-xl px-3 py-2 focus-within:border-violet-400 transition-colors mb-2">
            <MdSearch className="text-slate-400 text-[15px] shrink-0" />
            <input type="text" value={search} onChange={e => setSearch(e.target.value)} placeholder="Search item…" className="flex-1 text-sm text-slate-700 bg-transparent outline-none" />
          </div>

          <div className="space-y-1 max-h-48 overflow-y-auto">
            {filtered.map(item => {
              const catStyle = getCatStyle(item.category)
              const CatIcon = catStyle.icon
              return (
                <button key={item.id} onClick={() => setSelected(item)}
                  className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-left border-2 transition-all ${selected?.id === item.id ? "bg-violet-50 border-violet-400" : "border-transparent hover:bg-slate-50"}`}>
                  <div className={`w-8 h-8 rounded-lg ${catStyle.bg} flex items-center justify-center shrink-0`}>
                    <CatIcon className={`text-[14px] ${catStyle.text}`} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold text-slate-800 truncate">{item.name}</p>
                    <p className="text-[11px] text-slate-400">{item.category} · {item.stock} {item.unit}s in stock</p>
                  </div>
                  {selected?.id === item.id && <MdCheck className="text-violet-600 text-[16px]" />}
                </button>
              )
            })}
          </div>

          {selected && (
            <div className="space-y-4 pt-2">
              <div>
                <label className="text-xs font-bold text-slate-500 uppercase tracking-widest mb-1.5 block">Quantity Needed ({selected.unit}s)</label>
                <div className="flex items-center gap-2">
                  <button onClick={() => setQty(q => Math.max(1, q - 1))} className="w-10 h-10 rounded-xl border-2 border-slate-200 font-bold hover:bg-slate-50">−</button>
                  <input type="number" min={1} value={qty} onChange={e => setQty(Math.max(1, parseInt(e.target.value) || 1))} className="flex-1 text-center text-sm font-bold bg-slate-50 border-2 border-slate-200 rounded-xl py-2.5 outline-none focus:border-violet-400" />
                  <button onClick={() => setQty(q => q + 1)} className="w-10 h-10 rounded-xl border-2 border-slate-200 font-bold hover:bg-slate-50">+</button>
                </div>
              </div>
              <textarea value={reason} onChange={e => setReason(e.target.value)} placeholder="Reason for request..." className="w-full text-sm bg-slate-50 border-2 border-slate-200 rounded-xl px-3 py-2.5 outline-none focus:border-violet-400" rows={2} />
            </div>
          )}
        </div>

        <div className="px-6 pb-6 pt-4 border-t border-slate-100 flex gap-3">
          <button onClick={onClose} className="flex-1 py-2.5 text-sm font-semibold text-slate-600 border border-slate-200 rounded-xl hover:bg-slate-50">Cancel</button>
          <button onClick={handleModalSubmit} disabled={!selected} className="flex-1 py-2.5 text-sm font-bold text-white bg-[#0b1a2c] disabled:opacity-40 rounded-xl">Submit Request</button>
        </div>
      </div>
    </div>
  )
}

// ── Main ──────────────────────────────────────────────────────────────────────
const Doctor_Request = () => {
  const [inventoryItems, setInventoryItems] = useState([])
  const [requests, setRequests] = useState([])
  const [loading, setLoading] = useState(true)
  const [showModal, setShowModal] = useState(false)
  const [filter, setFilter] = useState("all")
  const [search, setSearch] = useState("")

  useEffect(() => {
    Promise.all([getInventoryItems(), getMyRequests()])
      .then(([items, reqs]) => {
        setInventoryItems(items)
        setRequests(reqs)
      })
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [])

  const handleSubmit = async ({ item, qty, reason }) => {
    try {
      const newReq = await submitRequest({
        inventory_id: item.id,
        qty_requested: qty,
        reason: reason || '',
      })
      setRequests(prev => [newReq, ...prev])
    } catch (err) {
      alert(err.message || 'Request failed.')
    }
  }

  const filtered = requests.filter(r => {
    const matchFilter = filter === "all" || r.status === filter
    const matchSearch = !search || r.item_name?.toLowerCase().includes(search.toLowerCase())
    return matchFilter && matchSearch
  })

  if (loading) return <div className="p-10 text-center text-slate-500">Loading supply data...</div>

  return (
    <div className="max-w-3xl space-y-5">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-800">Supply Requests</h1>
          <p className="text-sm text-slate-500 mt-0.5">Request supplies from the clinic inventory.</p>
        </div>
        <button onClick={() => setShowModal(true)} className="flex items-center gap-1.5 bg-[#0b1a2c] text-white text-xs font-semibold px-4 py-2.5 rounded-xl">
          <MdAdd className="text-[15px]" /> New Request
        </button>
      </div>

      {/* Stats Summary */}
      <div className="grid grid-cols-3 gap-4">
        {['pending', 'approved', 'rejected'].map(s => (
          <div key={s} className="bg-white border border-slate-200 rounded-2xl px-5 py-4 text-center shadow-sm">
            <p className={`text-3xl font-black ${STATUS_CONFIG[s].badge.split(' ')[1]}`}>
              {requests.filter(r => r.status === s).length}
            </p>
            <p className="text-[11px] text-slate-500 font-medium uppercase mt-0.5">{s}</p>
          </div>
        ))}
      </div>

      <div className="bg-white border border-slate-200 rounded-2xl overflow-hidden shadow-sm">
        <div className="flex items-center gap-3 px-5 py-4 border-b border-slate-100 flex-wrap">
          <div className="flex items-center gap-2 bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 flex-1 min-w-40">
            <MdSearch className="text-slate-400" />
            <input type="text" value={search} onChange={e => setSearch(e.target.value)} placeholder="Search item…" className="text-sm bg-transparent outline-none w-full" />
          </div>
          <div className="flex gap-1">
            {["all", "pending", "approved", "rejected"].map(k => (
              <button key={k} onClick={() => setFilter(k)} className={`px-3 py-1.5 rounded-lg text-[11px] font-bold capitalize ${filter === k ? "bg-[#0b1a2c] text-violet-400" : "text-slate-500 hover:bg-slate-100"}`}>{k}</button>
            ))}
          </div>
        </div>

        {/* Table Rows */}
        <div className="divide-y divide-slate-100">
          {filtered.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-14 text-center">
              <MdInventory2 className="text-4xl text-slate-200 mb-3" />
              <p className="text-sm font-semibold text-slate-500">No requests found</p>
            </div>
          ) : filtered.map(req => {
            const cfg = STATUS_CONFIG[req.status] || STATUS_CONFIG.pending
            const StatusIcon = cfg.icon
            const catStyle = getCatStyle(req.category)
            const CatIcon = catStyle.icon
            return (
              <div key={req.id} className="grid grid-cols-[28px_2fr_80px_100px_1fr_90px] gap-4 px-5 py-4 items-center hover:bg-slate-50">
                <div className={`w-7 h-7 rounded-lg ${catStyle.bg} flex items-center justify-center`}>
                  <CatIcon className={`text-[13px] ${catStyle.text}`} />
                </div>
                <div>
                  <p className="text-sm font-semibold text-slate-800 truncate">{req.item_name}</p>
                  <p className="text-[10px] font-mono text-slate-400">#{req.id}</p>
                </div>
                <p className="text-sm font-bold text-slate-700">{req.qty_requested}</p>
                <span className={`flex items-center gap-1 text-[10px] font-bold border px-2 py-0.5 rounded-full w-fit ${cfg.badge}`}>
                  <StatusIcon /> {cfg.label}
                </span>
                <p className="text-xs text-slate-500 truncate">{req.reason || "—"}</p>
                <p className="text-[11px] font-semibold text-slate-600">{new Date(req.requested_at).toLocaleDateString()}</p>
              </div>
            )
          })}
        </div>
      </div>

      {showModal && <NewRequestModal inventoryItems={inventoryItems} onClose={() => setShowModal(false)} onSubmit={handleSubmit} />}
    </div>
  )
}

export default Doctor_Request