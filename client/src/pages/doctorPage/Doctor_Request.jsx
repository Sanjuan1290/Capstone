import { useState } from "react"
import {
  MdAdd, MdClose, MdInventory2, MdCheck, MdPending,
  MdChevronRight, MdSearch, MdInfoOutline, MdLocalPharmacy,
  MdScience, MdCleaningServices, MdCategory, MdAccessTime,
  MdCancel
} from "react-icons/md"

// ── Mock available items (from inventory) ─────────────────────────────────────
const inventoryItems = [
  { id: "ITM-001", name: "Tretinoin 0.025% Cream",  category: "Derma",    unit: "tube",   stock: 3  },
  { id: "ITM-002", name: "Clindamycin Gel 1%",      category: "Derma",    unit: "tube",   stock: 12 },
  { id: "ITM-003", name: "Hydroquinone 2% Cream",   category: "Derma",    unit: "tube",   stock: 2  },
  { id: "ITM-004", name: "Sunscreen SPF 50",         category: "Derma",    unit: "bottle", stock: 7  },
  { id: "ITM-005", name: "Amoxicillin 500mg",        category: "Medicine", unit: "box",    stock: 8  },
  { id: "ITM-007", name: "Paracetamol 500mg",        category: "Medicine", unit: "box",    stock: 24 },
  { id: "ITM-009", name: "Alcohol 70% 500mL",        category: "Supplies", unit: "bottle", stock: 18 },
  { id: "ITM-010", name: "Disposable Gloves (M)",    category: "Supplies", unit: "box",    stock: 4  },
  { id: "ITM-011", name: "Surgical Mask (50pcs)",    category: "Supplies", unit: "box",    stock: 9  },
  { id: "ITM-012", name: "Cotton Balls (100pcs)",    category: "Supplies", unit: "pack",   stock: 11 },
]

const initialRequests = [
  { id: "REQ-001", itemId: "ITM-001", itemName: "Tretinoin 0.025% Cream",  category: "Derma",    qty: 2, unit: "tube",   reason: "Running low during consultations",  status: "approved", date: "Mar 20, 2026", time: "8:30 AM"  },
  { id: "REQ-002", itemId: "ITM-002", itemName: "Clindamycin Gel 1%",      category: "Derma",    qty: 3, unit: "tube",   reason: "Needed for upcoming acne patients", status: "approved", date: "Mar 22, 2026", time: "9:00 AM"  },
  { id: "REQ-003", itemId: "ITM-010", itemName: "Disposable Gloves (M)",   category: "Supplies", qty: 2, unit: "box",    reason: "Stock getting low in room",         status: "pending",  date: "Mar 23, 2026", time: "7:45 AM"  },
  { id: "REQ-004", itemId: "ITM-011", itemName: "Surgical Mask (50pcs)",   category: "Supplies", qty: 1, unit: "box",    reason: "Daily supply",                      status: "pending",  date: "Mar 23, 2026", time: "7:50 AM"  },
  { id: "REQ-005", itemId: "ITM-004", itemName: "Sunscreen SPF 50",        category: "Derma",    qty: 2, unit: "bottle", reason: "For patient samples",               status: "rejected", date: "Mar 18, 2026", time: "2:00 PM"  },
]

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
const NewRequestModal = ({ onClose, onSubmit }) => {
  const [search,   setSearch]   = useState("")
  const [selected, setSelected] = useState(null)
  const [qty,      setQty]      = useState(1)
  const [reason,   setReason]   = useState("")

  const filtered = inventoryItems.filter(i =>
    !search || i.name.toLowerCase().includes(search.toLowerCase()) || i.category.toLowerCase().includes(search.toLowerCase())
  )

  const handleSubmit = () => {
    if (!selected || qty < 1) return
    onSubmit({ item: selected, qty, reason })
    onClose()
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm px-4"
      onClick={onClose}>
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md max-h-[90vh] flex flex-col"
        onClick={e => e.stopPropagation()}>

        {/* Header */}
        <div className="flex items-center justify-between px-6 py-5 border-b border-slate-100 shrink-0">
          <div>
            <p className="text-sm font-bold text-slate-800">New Supply Request</p>
            <p className="text-xs text-slate-500 mt-0.5">Select an item and specify quantity needed</p>
          </div>
          <button onClick={onClose} className="w-8 h-8 flex items-center justify-center rounded-xl hover:bg-slate-100 text-slate-400 transition-colors">
            <MdClose className="text-[18px]" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-6 py-5 space-y-4">
          {/* Search items */}
          <div>
            <label className="text-xs font-bold text-slate-500 uppercase tracking-widest mb-1.5 block">Select Item</label>
            <div className="flex items-center gap-2 bg-slate-50 border-2 border-slate-200 rounded-xl px-3 py-2 focus-within:border-violet-400 transition-colors mb-2">
              <MdSearch className="text-slate-400 text-[15px] shrink-0" />
              <input type="text" value={search} onChange={e => setSearch(e.target.value)}
                placeholder="Search item…"
                className="flex-1 text-sm text-slate-700 placeholder-slate-300 bg-transparent outline-none" />
            </div>

            <div className="space-y-1 max-h-48 overflow-y-auto">
              {filtered.map(item => {
                const catStyle = getCatStyle(item.category)
                const CatIcon  = catStyle.icon
                const isLow    = item.stock <= 5
                return (
                  <button key={item.id} onClick={() => setSelected(item)}
                    className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-left transition-all
                      ${selected?.id === item.id ? "bg-violet-50 border-2 border-violet-400" : "border-2 border-transparent hover:bg-slate-50"}`}>
                    <div className={`w-8 h-8 rounded-lg ${catStyle.bg} flex items-center justify-center shrink-0`}>
                      <CatIcon className={`text-[14px] ${catStyle.text}`} />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-semibold text-slate-800 truncate">{item.name}</p>
                      <p className="text-[11px] text-slate-400">{item.category} · {item.stock} {item.unit}s in stock</p>
                    </div>
                    {isLow && <span className="text-[10px] font-bold text-amber-600 bg-amber-50 border border-amber-200 px-1.5 py-0.5 rounded-full shrink-0">Low</span>}
                    {selected?.id === item.id && <MdCheck className="text-violet-600 text-[16px] shrink-0" />}
                  </button>
                )
              })}
            </div>
          </div>

          {/* Quantity */}
          {selected && (
            <>
              <div>
                <label className="text-xs font-bold text-slate-500 uppercase tracking-widest mb-1.5 block">
                  Quantity Needed ({selected.unit}s)
                </label>
                <div className="flex items-center gap-2">
                  <button onClick={() => setQty(q => Math.max(1, q - 1))}
                    className="w-10 h-10 rounded-xl border-2 border-slate-200 text-slate-600 text-lg font-bold hover:border-slate-300 hover:bg-slate-50 transition-all">
                    −
                  </button>
                  <input type="number" min={1} value={qty}
                    onChange={e => setQty(Math.max(1, parseInt(e.target.value) || 1))}
                    className="flex-1 text-center text-sm font-bold text-slate-800 bg-slate-50 border-2 border-slate-200
                      rounded-xl py-2.5 focus:outline-none focus:border-violet-400 transition-colors" />
                  <button onClick={() => setQty(q => q + 1)}
                    className="w-10 h-10 rounded-xl border-2 border-slate-200 text-slate-600 text-lg font-bold hover:border-slate-300 hover:bg-slate-50 transition-all">
                    +
                  </button>
                </div>
              </div>

              {/* Reason */}
              <div>
                <label className="text-xs font-bold text-slate-500 uppercase tracking-widest mb-1.5 block">
                  Reason <span className="font-normal text-slate-400 normal-case">(optional but recommended)</span>
                </label>
                <input type="text" value={reason} onChange={e => setReason(e.target.value)}
                  placeholder="e.g. Running low during consultations, daily supply…"
                  className="w-full text-sm text-slate-700 placeholder-slate-300 bg-slate-50 border-2 border-slate-200
                    rounded-xl px-3 py-2.5 focus:outline-none focus:border-violet-400 transition-colors" />
              </div>

              <div className="bg-violet-50 border border-violet-200 rounded-xl px-4 py-3 flex items-start gap-2">
                <MdInfoOutline className="text-violet-500 text-[14px] shrink-0 mt-0.5" />
                <p className="text-xs text-violet-700">
                  Your request will be sent to the staff for approval. They will update the inventory once approved.
                </p>
              </div>
            </>
          )}
        </div>

        <div className="px-6 pb-6 pt-4 border-t border-slate-100 flex gap-3 shrink-0">
          <button onClick={onClose}
            className="flex-1 py-2.5 text-sm font-semibold text-slate-600 border border-slate-200 rounded-xl hover:bg-slate-50 transition-colors">
            Cancel
          </button>
          <button onClick={handleSubmit} disabled={!selected || qty < 1}
            className="flex-1 py-2.5 text-sm font-bold text-white bg-[#0b1a2c] hover:bg-[#122236]
              disabled:opacity-40 disabled:cursor-not-allowed rounded-xl transition-colors">
            Submit Request
          </button>
        </div>
      </div>
    </div>
  )
}

// ── Main ──────────────────────────────────────────────────────────────────────
const Doctor_Request = () => {
  const [requests,    setRequests]    = useState(initialRequests)
  const [showModal,   setShowModal]   = useState(false)
  const [filter,      setFilter]      = useState("all")
  const [search,      setSearch]      = useState("")

  const pending  = requests.filter(r => r.status === "pending").length
  const approved = requests.filter(r => r.status === "approved").length
  const rejected = requests.filter(r => r.status === "rejected").length

  const filtered = requests.filter(r => {
    const matchFilter = filter === "all" || r.status === filter
    const matchSearch = !search || r.itemName.toLowerCase().includes(search.toLowerCase())
    return matchFilter && matchSearch
  })

  const handleSubmit = ({ item, qty, reason }) => {
    const newReq = {
      id: `REQ-00${requests.length + 1}`,
      itemId: item.id, itemName: item.name, category: item.category,
      qty, unit: item.unit, reason: reason || "—",
      status: "pending",
      date: new Date().toLocaleDateString("en-PH", { month: "short", day: "numeric", year: "numeric" }),
      time: new Date().toLocaleTimeString("en-PH", { hour: "2-digit", minute: "2-digit" }),
    }
    setRequests(prev => [newReq, ...prev])
  }

  return (
    <div className="max-w-3xl space-y-5">

      {/* Header */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-800">Supply Requests</h1>
          <p className="text-sm text-slate-500 mt-0.5">Request supplies, medicines, or equipment from the clinic inventory.</p>
        </div>
        <button onClick={() => setShowModal(true)}
          className="flex items-center gap-1.5 bg-[#0b1a2c] hover:bg-[#122236] text-white
            text-xs font-semibold px-4 py-2.5 rounded-xl transition-colors shrink-0">
          <MdAdd className="text-[15px]" /> New Request
        </button>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-3 gap-4">
        {[
          { label: "Pending",  value: pending,  color: "text-amber-600",   bg: "bg-amber-50",   border: "border-amber-200"   },
          { label: "Approved", value: approved, color: "text-emerald-600", bg: "bg-emerald-50", border: "border-emerald-200" },
          { label: "Rejected", value: rejected, color: "text-red-500",     bg: "bg-red-50",     border: "border-red-200"     },
        ].map(({ label, value, color, bg, border }) => (
          <div key={label} className={`${bg} border ${border} rounded-2xl px-5 py-4 text-center`}>
            <p className={`text-3xl font-black ${color}`}>{value}</p>
            <p className="text-[11px] text-slate-500 font-medium mt-0.5">{label}</p>
          </div>
        ))}
      </div>

      {/* How it works banner */}
      <div className="bg-slate-50 border border-slate-200 rounded-2xl px-5 py-4 flex items-start gap-3">
        <MdInfoOutline className="text-slate-400 text-[16px] shrink-0 mt-0.5" />
        <div>
          <p className="text-xs font-bold text-slate-700">How it works</p>
          <p className="text-xs text-slate-500 mt-0.5 leading-relaxed">
            Submit a request → Staff reviews and approves/rejects → Approved requests are pulled from inventory and prepared for you.
            Rejected requests are flagged with a reason.
          </p>
        </div>
      </div>

      {/* Filters + list */}
      <div className="bg-white border border-slate-200 rounded-2xl overflow-hidden">
        {/* Toolbar */}
        <div className="flex items-center gap-3 px-5 py-4 border-b border-slate-100 flex-wrap">
          <div className="flex items-center gap-2 bg-slate-50 border border-slate-200 rounded-xl px-3 py-2
            flex-1 min-w-40 focus-within:border-slate-300 transition-colors">
            <MdSearch className="text-slate-400 text-[15px] shrink-0" />
            <input type="text" value={search} onChange={e => setSearch(e.target.value)}
              placeholder="Search item…"
              className="text-sm text-slate-700 placeholder-slate-300 bg-transparent outline-none w-full" />
            {search && (
              <button onClick={() => setSearch("")} className="text-slate-300 hover:text-slate-500 transition-colors">
                <MdClose className="text-[13px]" />
              </button>
            )}
          </div>
          <div className="flex gap-1">
            {[
              { key: "all",      label: "All"      },
              { key: "pending",  label: "Pending"  },
              { key: "approved", label: "Approved" },
              { key: "rejected", label: "Rejected" },
            ].map(({ key, label }) => (
              <button key={key} onClick={() => setFilter(key)}
                className={`px-3 py-1.5 rounded-lg text-[11px] font-bold transition-all
                  ${filter === key ? "bg-[#0b1a2c] text-violet-400" : "text-slate-500 hover:bg-slate-100"}`}>
                {label}
              </button>
            ))}
          </div>
        </div>

        {/* Table head */}
        <div className="grid grid-cols-[28px_2fr_80px_80px_1fr_90px] gap-4 px-5 py-2.5 bg-slate-50 border-b border-slate-100">
          {["", "Item", "Qty", "Status", "Reason", "Date"].map((h, i) => (
            <p key={i} className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">{h}</p>
          ))}
        </div>

        {/* Rows */}
        <div className="divide-y divide-slate-100">
          {filtered.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-14 text-center">
              <div className="w-12 h-12 rounded-2xl bg-slate-100 flex items-center justify-center mb-3">
                <MdInventory2 className="text-[22px] text-slate-300" />
              </div>
              <p className="text-sm font-semibold text-slate-500">No requests found</p>
              <p className="text-xs text-slate-400 mt-1">Click "New Request" to request supplies from the clinic.</p>
            </div>
          ) : filtered.map(req => {
            const cfg      = STATUS_CONFIG[req.status]
            const StatusIcon = cfg.icon
            const catStyle = getCatStyle(req.category)
            const CatIcon  = catStyle.icon
            return (
              <div key={req.id}
                className="grid grid-cols-[28px_2fr_80px_80px_1fr_90px] gap-4 px-5 py-4 items-center hover:bg-slate-50 transition-colors">
                <div className={`w-7 h-7 rounded-lg ${catStyle.bg} flex items-center justify-center shrink-0`}>
                  <CatIcon className={`text-[13px] ${catStyle.text}`} />
                </div>
                <div>
                  <p className="text-sm font-semibold text-slate-800 truncate">{req.itemName}</p>
                  <p className="text-[10px] font-mono text-slate-400 mt-0.5">{req.id}</p>
                </div>
                <p className="text-sm font-bold text-slate-700">{req.qty} <span className="text-xs font-normal text-slate-400">{req.unit}s</span></p>
                <span className={`flex items-center gap-1 text-[10px] font-bold border px-2 py-0.5 rounded-full w-fit ${cfg.badge}`}>
                  <StatusIcon className="text-[11px]" />
                  {cfg.label}
                </span>
                <p className="text-xs text-slate-500 truncate">{req.reason}</p>
                <div>
                  <p className="text-[11px] font-semibold text-slate-600">{req.date}</p>
                  <p className="text-[10px] text-slate-400 mt-0.5">{req.time}</p>
                </div>
              </div>
            )
          })}
        </div>

        <div className="px-5 py-3 border-t border-slate-100">
          <p className="text-[11px] text-slate-400 font-medium">{filtered.length} of {requests.length} requests</p>
        </div>
      </div>

      {showModal && <NewRequestModal onClose={() => setShowModal(false)} onSubmit={handleSubmit} />}
    </div>
  )
}

export default Doctor_Request