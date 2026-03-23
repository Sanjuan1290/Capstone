import { useState, useRef, useEffect } from "react"
import {
  MdSearch, MdClose, MdAdd, MdQrCodeScanner, MdInventory2,
  MdArrowUpward, MdArrowDownward, MdHistory, MdWarning,
  MdCheck, MdCategory, MdTrendingDown, MdTrendingUp,
  MdInfoOutline, MdFilterList, MdCalendarToday, MdPerson,
  MdLocalPharmacy, MdScience, MdCleaningServices
} from "react-icons/md"

// ── Mock Data ─────────────────────────────────────────────────────────────────
const initialItems = [
  { id: "ITM-001", barcode: "8850001001234", name: "Tretinoin 0.025% Cream",   category: "Derma",    unit: "tube",   stock: 3,  threshold: 5,  price: 450,  supplier: "Dermacare PH"    },
  { id: "ITM-002", barcode: "8850001002345", name: "Clindamycin Gel 1%",       category: "Derma",    unit: "tube",   stock: 12, threshold: 8,  price: 280,  supplier: "Dermacare PH"    },
  { id: "ITM-003", barcode: "8850001003456", name: "Hydroquinone 2% Cream",    category: "Derma",    unit: "tube",   stock: 2,  threshold: 5,  price: 320,  supplier: "Dermacare PH"    },
  { id: "ITM-004", barcode: "8850001004567", name: "Sunscreen SPF 50",         category: "Derma",    unit: "bottle", stock: 7,  threshold: 5,  price: 560,  supplier: "Dermacare PH"    },
  { id: "ITM-005", barcode: "8850002001234", name: "Amoxicillin 500mg",        category: "Medicine", unit: "box",    stock: 8,  threshold: 10, price: 95,   supplier: "MedPhil Supply"  },
  { id: "ITM-006", barcode: "8850002002345", name: "Amlodipine 5mg",           category: "Medicine", unit: "box",    stock: 15, threshold: 10, price: 85,   supplier: "MedPhil Supply"  },
  { id: "ITM-007", barcode: "8850002003456", name: "Paracetamol 500mg",        category: "Medicine", unit: "box",    stock: 24, threshold: 15, price: 45,   supplier: "MedPhil Supply"  },
  { id: "ITM-008", barcode: "8850002004567", name: "Amoxicillin-Clav 625mg",   category: "Medicine", unit: "box",    stock: 6,  threshold: 8,  price: 185,  supplier: "MedPhil Supply"  },
  { id: "ITM-009", barcode: "8850003001234", name: "Alcohol 70% 500mL",        category: "Supplies", unit: "bottle", stock: 18, threshold: 10, price: 75,   supplier: "MedSupplies Co." },
  { id: "ITM-010", barcode: "8850003002345", name: "Disposable Gloves (M)",    category: "Supplies", unit: "box",    stock: 4,  threshold: 5,  price: 220,  supplier: "MedSupplies Co." },
  { id: "ITM-011", barcode: "8850003003456", name: "Surgical Mask (50pcs)",    category: "Supplies", unit: "box",    stock: 9,  threshold: 5,  price: 165,  supplier: "MedSupplies Co." },
  { id: "ITM-012", barcode: "8850003004567", name: "Cotton Balls (100pcs)",    category: "Supplies", unit: "pack",   stock: 11, threshold: 8,  price: 55,   supplier: "MedSupplies Co." },
]

const initialLogs = [
  { id: 1,  itemId: "ITM-001", itemName: "Tretinoin 0.025% Cream", type: "out", qty: 2, note: "Dispensed to patient — Maria Cruz",      by: "Staff",  date: "Mar 23, 2026", time: "9:10 AM"  },
  { id: 2,  itemId: "ITM-005", itemName: "Amoxicillin 500mg",      type: "out", qty: 1, note: "Dispensed to patient — Carlo Santos",    by: "Staff",  date: "Mar 23, 2026", time: "9:45 AM"  },
  { id: 3,  itemId: "ITM-007", itemName: "Paracetamol 500mg",      type: "in",  qty: 10, note: "Restocked from MedPhil Supply",         by: "Staff",  date: "Mar 22, 2026", time: "2:00 PM"  },
  { id: 4,  itemId: "ITM-003", itemName: "Hydroquinone 2% Cream",  type: "out", qty: 1, note: "Dispensed to patient — Grace Tan",       by: "Staff",  date: "Mar 21, 2026", time: "3:15 PM"  },
  { id: 5,  itemId: "ITM-009", itemName: "Alcohol 70% 500mL",      type: "in",  qty: 6, note: "Restocked from MedSupplies Co.",         by: "Staff",  date: "Mar 20, 2026", time: "10:00 AM" },
  { id: 6,  itemId: "ITM-010", itemName: "Disposable Gloves (M)",  type: "out", qty: 2, note: "Used during consultation",               by: "Staff",  date: "Mar 20, 2026", time: "8:30 AM"  },
  { id: 7,  itemId: "ITM-002", itemName: "Clindamycin Gel 1%",     type: "in",  qty: 5, note: "Restocked from Dermacare PH",            by: "Staff",  date: "Mar 18, 2026", time: "11:00 AM" },
]

const CATEGORIES = ["All", "Derma", "Medicine", "Supplies"]

// ── Helpers ───────────────────────────────────────────────────────────────────
const getStockStatus = (stock, threshold) => {
  if (stock === 0)                    return { label: "Out of Stock", color: "text-red-600",    bg: "bg-red-100",    border: "border-red-200",    bar: "bg-red-500",    pct: 0   }
  if (stock <= threshold)             return { label: "Low Stock",    color: "text-amber-700",  bg: "bg-amber-50",   border: "border-amber-200",  bar: "bg-amber-400",  pct: Math.round((stock / threshold) * 40) }
  return                                     { label: "In Stock",     color: "text-emerald-700",bg: "bg-emerald-50", border: "border-emerald-200",bar: "bg-emerald-500",pct: Math.min(100, Math.round((stock / (threshold * 3)) * 100)) }
}

const getCategoryStyle = (cat) => ({
  Derma:    { bg: "bg-purple-50",  text: "text-purple-700",  border: "border-purple-200",  icon: MdScience          },
  Medicine: { bg: "bg-sky-50",     text: "text-sky-700",     border: "border-sky-200",     icon: MdLocalPharmacy    },
  Supplies: { bg: "bg-slate-100",  text: "text-slate-600",   border: "border-slate-200",   icon: MdCleaningServices },
})[cat] || { bg: "bg-slate-100", text: "text-slate-600", border: "border-slate-200", icon: MdCategory }

// ── Scanner Modal ─────────────────────────────────────────────────────────────
const ScannerModal = ({ items, onClose, onDone }) => {
  const [barcode, setBarcode] = useState("")
  const [found,   setFound]   = useState(null)
  const [error,   setError]   = useState("")
  const [type,    setType]    = useState("out")
  const [qty,     setQty]     = useState(1)
  const [note,    setNote]    = useState("")
  const [success, setSuccess] = useState(false)
  const inputRef = useRef(null)

  useEffect(() => { inputRef.current?.focus() }, [])

  const handleBarcode = val => {
    setBarcode(val)
    setError("")
    setFound(null)
    setSuccess(false)
    if (!val.trim()) return
    const item = items.find(i => i.barcode === val.trim())
    if (item) setFound(item)
    else if (val.length >= 8) setError("No item found for this barcode.")
  }

  const handleConfirm = () => {
    if (!found || qty < 1) return
    onDone({ item: found, type, qty: parseInt(qty), note })
    setSuccess(true)
    setTimeout(() => {
      setBarcode(""); setFound(null); setNote(""); setQty(1); setSuccess(false)
      inputRef.current?.focus()
    }, 1200)
  }

  const status = found ? getStockStatus(found.stock, found.threshold) : null

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm px-4"
      onClick={onClose}>
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md" onClick={e => e.stopPropagation()}>

        {/* Header */}
        <div className="flex items-center justify-between px-6 py-5 border-b border-slate-100">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-[#0b1a2c] flex items-center justify-center">
              <MdQrCodeScanner className="text-sky-400 text-[20px]" />
            </div>
            <div>
              <p className="text-sm font-bold text-slate-800">Barcode Scanner</p>
              <p className="text-xs text-slate-500">Point scanner at item or type manually</p>
            </div>
          </div>
          <button onClick={onClose} className="w-8 h-8 flex items-center justify-center rounded-xl hover:bg-slate-100 text-slate-400 transition-colors">
            <MdClose className="text-[18px]" />
          </button>
        </div>

        <div className="px-6 py-5 space-y-4">
          {/* Barcode field */}
          <div>
            <label className="text-xs font-bold text-slate-500 uppercase tracking-widest mb-1.5 block">Barcode</label>
            <div className={`flex items-center gap-2.5 border-2 rounded-xl px-3 py-3 transition-all
              ${success ? "border-emerald-400 bg-emerald-50" : found ? "border-sky-400 bg-sky-50/40" : error ? "border-red-300 bg-red-50/30" : "border-slate-200 focus-within:border-sky-400"}`}>
              <MdQrCodeScanner className={`text-[18px] shrink-0 ${success ? "text-emerald-500" : found ? "text-sky-500" : error ? "text-red-400" : "text-slate-300"}`} />
              <input ref={inputRef} type="text" value={barcode}
                onChange={e => handleBarcode(e.target.value)}
                placeholder="Scan or type barcode here…"
                className="flex-1 text-sm text-slate-700 placeholder-slate-300 bg-transparent outline-none font-mono" />
              {success && <MdCheck className="text-emerald-500 text-[18px] shrink-0" />}
            </div>
            {error && (
              <p className="text-xs text-red-500 font-medium mt-1.5 flex items-center gap-1">
                <MdInfoOutline className="text-[13px]" /> {error}
              </p>
            )}
            {!found && !error && (
              <p className="text-[11px] text-slate-400 mt-1.5">USB barcode scanners auto-submit — just scan the item.</p>
            )}
          </div>

          {/* Found item */}
          {found && (
            <div className="space-y-3">
              {/* Item card */}
              <div className="bg-slate-50 border border-slate-200 rounded-2xl p-4">
                <div className="flex items-start justify-between gap-3 mb-3">
                  <div>
                    <p className="text-sm font-bold text-slate-800">{found.name}</p>
                    <p className="text-xs text-slate-500 mt-0.5">{found.id} · {found.supplier}</p>
                  </div>
                  <span className={`text-[10px] font-bold border px-2 py-0.5 rounded-full shrink-0 ${status.bg} ${status.color} ${status.border}`}>
                    {status.label}
                  </span>
                </div>
                {/* Stock bar */}
                <div className="space-y-1">
                  <div className="flex items-center justify-between text-xs">
                    <span className="text-slate-500">Current stock</span>
                    <span className="font-bold text-slate-800">{found.stock} {found.unit}s</span>
                  </div>
                  <div className="h-2 bg-slate-200 rounded-full overflow-hidden">
                    <div className={`h-full ${status.bar} rounded-full transition-all`} style={{ width: `${status.pct}%` }} />
                  </div>
                  <p className="text-[10px] text-slate-400">Reorder at {found.threshold} {found.unit}s</p>
                </div>
              </div>

              {/* Stock In / Out */}
              <div>
                <label className="text-xs font-bold text-slate-500 uppercase tracking-widest mb-1.5 block">Transaction Type</label>
                <div className="grid grid-cols-2 gap-2">
                  {[
                    { v: "out", l: "Stock Out", sub: "Dispensed to patient", icon: MdArrowDownward, active: "border-red-400 bg-red-50 text-red-700", inactive: "border-slate-200 text-slate-500" },
                    { v: "in",  l: "Stock In",  sub: "Received from supplier", icon: MdArrowUpward, active: "border-emerald-400 bg-emerald-50 text-emerald-700", inactive: "border-slate-200 text-slate-500" },
                  ].map(({ v, l, sub, icon: Icon, active, inactive }) => (
                    <button key={v} onClick={() => setType(v)}
                      className={`flex flex-col items-center gap-1 py-3 rounded-xl border-2 transition-all ${type === v ? active : inactive + " hover:border-slate-300"}`}>
                      <Icon className="text-[18px]" />
                      <p className="text-xs font-bold">{l}</p>
                      <p className="text-[10px] opacity-70">{sub}</p>
                    </button>
                  ))}
                </div>
              </div>

              {/* Quantity */}
              <div>
                <label className="text-xs font-bold text-slate-500 uppercase tracking-widest mb-1.5 block">Quantity</label>
                <div className="flex items-center gap-2">
                  <button onClick={() => setQty(q => Math.max(1, q - 1))}
                    className="w-10 h-10 rounded-xl border-2 border-slate-200 text-slate-600 text-lg font-bold hover:border-slate-300 hover:bg-slate-50 transition-all">
                    −
                  </button>
                  <input type="number" min={1} value={qty}
                    onChange={e => setQty(Math.max(1, parseInt(e.target.value) || 1))}
                    className="flex-1 text-center text-sm font-bold text-slate-800 bg-slate-50 border-2 border-slate-200
                      rounded-xl py-2.5 focus:outline-none focus:border-sky-400 transition-colors" />
                  <button onClick={() => setQty(q => q + 1)}
                    className="w-10 h-10 rounded-xl border-2 border-slate-200 text-slate-600 text-lg font-bold hover:border-slate-300 hover:bg-slate-50 transition-all">
                    +
                  </button>
                </div>
                {type === "out" && qty > found.stock && (
                  <p className="text-xs text-red-500 font-medium mt-1.5 flex items-center gap-1">
                    <MdWarning className="text-[13px]" /> Quantity exceeds current stock ({found.stock})
                  </p>
                )}
              </div>

              {/* Note */}
              <div>
                <label className="text-xs font-bold text-slate-500 uppercase tracking-widest mb-1.5 block">
                  Note <span className="font-normal text-slate-400 normal-case">(optional)</span>
                </label>
                <input type="text" value={note} onChange={e => setNote(e.target.value)}
                  placeholder={type === "out" ? "e.g. Dispensed to patient Juan Dela Cruz" : "e.g. Restocked from supplier"}
                  className="w-full text-sm text-slate-700 placeholder-slate-300 bg-slate-50 border-2 border-slate-200
                    rounded-xl px-3 py-2.5 focus:outline-none focus:border-sky-400 transition-colors" />
              </div>
            </div>
          )}
        </div>

        <div className="px-6 pb-6 flex gap-3">
          <button onClick={onClose}
            className="flex-1 py-2.5 text-sm font-semibold text-slate-600 border border-slate-200 rounded-xl hover:bg-slate-50 transition-colors">
            Close
          </button>
          <button onClick={handleConfirm}
            disabled={!found || qty < 1 || (type === "out" && qty > found.stock)}
            className={`flex-1 py-2.5 text-sm font-bold text-white rounded-xl transition-colors
              disabled:opacity-40 disabled:cursor-not-allowed
              ${type === "in" ? "bg-emerald-500 hover:bg-emerald-600" : "bg-[#0b1a2c] hover:bg-[#122236]"}`}>
            {success ? "✓ Done!" : `Confirm ${type === "in" ? "Stock In" : "Stock Out"}`}
          </button>
        </div>
      </div>
    </div>
  )
}

// ── Add Item Modal ────────────────────────────────────────────────────────────
const AddItemModal = ({ onClose, onAdd }) => {
  const [form, setForm] = useState({ barcode: "", name: "", category: "Medicine", unit: "box", stock: "", threshold: "5", price: "", supplier: "" })
  const set = k => e => setForm(f => ({ ...f, [k]: e.target.value }))
  const valid = form.barcode.trim() && form.name.trim() && form.supplier.trim()

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm px-4"
      onClick={onClose}>
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between px-6 py-5 border-b border-slate-100">
          <div>
            <p className="text-sm font-bold text-slate-800">Add New Item</p>
            <p className="text-xs text-slate-500 mt-0.5">Register a new product in the inventory</p>
          </div>
          <button onClick={onClose} className="w-8 h-8 flex items-center justify-center rounded-xl hover:bg-slate-100 text-slate-400 transition-colors">
            <MdClose className="text-[18px]" />
          </button>
        </div>
        <div className="px-6 py-5 space-y-3 max-h-[65vh] overflow-y-auto">
          {[
            { k: "barcode",   l: "Barcode",              t: "text",   p: "e.g. 8850001001234",              required: true  },
            { k: "name",      l: "Product Name",         t: "text",   p: "e.g. Tretinoin 0.025% Cream",     required: true  },
            { k: "supplier",  l: "Supplier",             t: "text",   p: "e.g. Dermacare PH",               required: true  },
            { k: "stock",     l: "Initial Stock",        t: "number", p: "0",                               required: false },
            { k: "threshold", l: "Low Stock Alert At",   t: "number", p: "5",                               required: false },
            { k: "price",     l: "Unit Price (₱)",       t: "number", p: "0.00",                            required: false },
          ].map(({ k, l, t, p, required }) => (
            <div key={k}>
              <label className="text-xs font-bold text-slate-500 uppercase tracking-widest mb-1.5 block">
                {l} {required && <span className="text-red-400">*</span>}
              </label>
              <input type={t} value={form[k]} onChange={set(k)} placeholder={p}
                className="w-full text-sm text-slate-700 placeholder-slate-300 bg-slate-50 border-2 border-slate-200
                  rounded-xl px-3 py-2.5 focus:outline-none focus:border-sky-400 transition-colors" />
            </div>
          ))}
          <div>
            <label className="text-xs font-bold text-slate-500 uppercase tracking-widest mb-1.5 block">Category <span className="text-red-400">*</span></label>
            <select value={form.category} onChange={set("category")}
              className="w-full text-sm text-slate-700 bg-slate-50 border-2 border-slate-200 rounded-xl px-3 py-2.5 focus:outline-none focus:border-sky-400 transition-colors">
              {["Medicine", "Derma", "Supplies"].map(c => <option key={c}>{c}</option>)}
            </select>
          </div>
          <div>
            <label className="text-xs font-bold text-slate-500 uppercase tracking-widest mb-1.5 block">Unit <span className="text-red-400">*</span></label>
            <select value={form.unit} onChange={set("unit")}
              className="w-full text-sm text-slate-700 bg-slate-50 border-2 border-slate-200 rounded-xl px-3 py-2.5 focus:outline-none focus:border-sky-400 transition-colors">
              {["box", "tube", "bottle", "pack", "piece", "sachet"].map(u => <option key={u}>{u}</option>)}
            </select>
          </div>
        </div>
        <div className="px-6 pb-6 flex gap-3">
          <button onClick={onClose}
            className="flex-1 py-2.5 text-sm font-semibold text-slate-600 border border-slate-200 rounded-xl hover:bg-slate-50 transition-colors">
            Cancel
          </button>
          <button disabled={!valid}
            onClick={() => { onAdd({ ...form, id: `ITM-${String(Date.now()).slice(-3)}`, stock: parseInt(form.stock)||0, threshold: parseInt(form.threshold)||5, price: parseFloat(form.price)||0 }); onClose() }}
            className="flex-1 py-2.5 text-sm font-bold text-white bg-[#0b1a2c] hover:bg-[#122236] disabled:opacity-40 disabled:cursor-not-allowed rounded-xl transition-colors">
            Add Item
          </button>
        </div>
      </div>
    </div>
  )
}

// ── Inventory Row ─────────────────────────────────────────────────────────────
const InventoryRow = ({ item, onScan }) => {
  const status  = getStockStatus(item.stock, item.threshold)
  const catStyle = getCategoryStyle(item.category)
  const CatIcon  = catStyle.icon

  return (
    <div className="grid grid-cols-[28px_2.5fr_1fr_1fr_1.2fr_80px] gap-4 px-5 py-4 items-center hover:bg-slate-50/80 transition-colors border-b border-slate-100 last:border-0">

      {/* Category icon */}
      <div className={`w-7 h-7 rounded-lg ${catStyle.bg} flex items-center justify-center shrink-0`}>
        <CatIcon className={`text-[13px] ${catStyle.text}`} />
      </div>

      {/* Name + ID */}
      <div className="min-w-0">
        <p className="text-sm font-semibold text-slate-800 truncate">{item.name}</p>
        <p className="text-[11px] text-slate-400 mt-0.5 flex items-center gap-2">
          <span className="font-mono">{item.id}</span>
          <span className="text-slate-300">·</span>
          <span>{item.supplier}</span>
        </p>
      </div>

      {/* Category badge */}
      <span className={`text-[11px] font-bold border px-2.5 py-0.5 rounded-full w-fit ${catStyle.bg} ${catStyle.text} ${catStyle.border}`}>
        {item.category}
      </span>

      {/* Barcode */}
      <p className="text-xs font-mono text-slate-400 truncate">{item.barcode}</p>

      {/* Stock level */}
      <div className="space-y-1.5">
        <div className="flex items-center justify-between">
          <span className={`text-sm font-bold ${item.stock === 0 ? "text-red-600" : item.stock <= item.threshold ? "text-amber-600" : "text-slate-800"}`}>
            {item.stock} <span className="text-xs font-normal text-slate-400">{item.unit}s</span>
          </span>
          <span className={`text-[10px] font-bold border px-1.5 py-0.5 rounded-full ${status.bg} ${status.color} ${status.border}`}>
            {status.label}
          </span>
        </div>
        {/* Stock bar */}
        <div className="h-1.5 bg-slate-100 rounded-full overflow-hidden">
          <div className={`h-full ${status.bar} rounded-full transition-all duration-500`}
            style={{ width: `${Math.max(3, status.pct)}%` }} />
        </div>
        <p className="text-[10px] text-slate-400">Threshold: {item.threshold}</p>
      </div>

      {/* Scan button */}
      <button onClick={() => onScan(item)}
        className="flex items-center justify-center gap-1 py-1.5 px-2.5 rounded-lg border border-slate-200
          text-slate-500 text-[11px] font-semibold hover:border-sky-300 hover:text-sky-600 hover:bg-sky-50 transition-all">
        <MdQrCodeScanner className="text-[13px]" /> Scan
      </button>
    </div>
  )
}

// ── Main ──────────────────────────────────────────────────────────────────────
const Staff_Inventory = () => {
  const [items,       setItems]       = useState(initialItems)
  const [logs,        setLogs]        = useState(initialLogs)
  const [search,      setSearch]      = useState("")
  const [category,    setCategory]    = useState("All")
  const [activeTab,   setActiveTab]   = useState("inventory")
  const [showScanner, setShowScanner] = useState(false)
  const [showAdd,     setShowAdd]     = useState(false)
  const [logFilter,   setLogFilter]   = useState("all")
  const [preselect,   setPreselect]   = useState(null)

  const lowStock   = items.filter(i => i.stock <= i.threshold && i.stock > 0)
  const outOfStock = items.filter(i => i.stock === 0)
  const totalValue = items.reduce((sum, i) => sum + i.stock * i.price, 0)

  const filtered = items.filter(i => {
    const matchCat    = category === "All" || i.category === category
    const matchSearch = !search ||
      i.name.toLowerCase().includes(search.toLowerCase()) ||
      i.barcode.includes(search) ||
      i.id.toLowerCase().includes(search.toLowerCase()) ||
      i.supplier.toLowerCase().includes(search.toLowerCase())
    return matchCat && matchSearch
  })

  const filteredLogs = logs.filter(l => logFilter === "all" || l.type === logFilter)

  const handleScanResult = ({ item, type, qty, note }) => {
    setItems(prev => prev.map(i => {
      if (i.id !== item.id) return i
      return { ...i, stock: type === "in" ? i.stock + qty : Math.max(0, i.stock - qty) }
    }))
    setLogs(prev => [{
      id: Date.now(), itemId: item.id, itemName: item.name,
      type, qty, note: note || (type === "in" ? "Restocked" : "Dispensed"),
      by: "Staff",
      date: new Date().toLocaleDateString("en-PH", { month: "short", day: "numeric", year: "numeric" }),
      time: new Date().toLocaleTimeString("en-PH", { hour: "2-digit", minute: "2-digit" }),
    }, ...prev])
  }

  const openScannerFor = (item) => {
    setPreselect(item)
    setShowScanner(true)
  }

  return (
    <div className="max-w-6xl space-y-5">

      {/* Header */}
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold text-slate-800">Inventory</h1>
          <p className="text-sm text-slate-500 mt-0.5">
            Track stock levels, scan barcodes for stock-in and stock-out transactions.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={() => setShowScanner(true)}
            className="flex items-center gap-1.5 bg-[#0b1a2c] hover:bg-[#122236] text-white text-xs font-semibold px-4 py-2.5 rounded-xl transition-colors">
            <MdQrCodeScanner className="text-[16px]" /> Scan Barcode
          </button>
          <button onClick={() => setShowAdd(true)}
            className="flex items-center gap-1.5 bg-white border border-slate-200 hover:bg-slate-50 text-slate-700 text-xs font-semibold px-4 py-2.5 rounded-xl transition-colors">
            <MdAdd className="text-[15px]" /> Add Item
          </button>
        </div>
      </div>

      {/* Stat cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-white border border-slate-200 rounded-2xl px-5 py-4">
          <p className="text-xs text-slate-500 font-medium">Total Items</p>
          <p className="text-3xl font-black text-slate-800 mt-1">{items.length}</p>
          <p className="text-[11px] text-slate-400 mt-0.5">{items.filter(i=>i.category==="Medicine").length} medicine · {items.filter(i=>i.category==="Derma").length} derma · {items.filter(i=>i.category==="Supplies").length} supplies</p>
        </div>
        <div className="bg-white border border-slate-200 rounded-2xl px-5 py-4">
          <p className="text-xs text-slate-500 font-medium">Inventory Value</p>
          <p className="text-3xl font-black text-slate-800 mt-1">₱{totalValue.toLocaleString()}</p>
          <p className="text-[11px] text-slate-400 mt-0.5">Based on current stock × unit price</p>
        </div>
        <div className={`rounded-2xl px-5 py-4 border ${lowStock.length > 0 ? "bg-amber-50 border-amber-200" : "bg-white border-slate-200"}`}>
          <p className={`text-xs font-medium ${lowStock.length > 0 ? "text-amber-700" : "text-slate-500"}`}>Low Stock</p>
          <p className={`text-3xl font-black mt-1 ${lowStock.length > 0 ? "text-amber-600" : "text-slate-800"}`}>{lowStock.length}</p>
          <p className={`text-[11px] mt-0.5 ${lowStock.length > 0 ? "text-amber-600" : "text-slate-400"}`}>
            {lowStock.length > 0 ? "Items need restocking soon" : "All items adequately stocked"}
          </p>
        </div>
        <div className={`rounded-2xl px-5 py-4 border ${outOfStock.length > 0 ? "bg-red-50 border-red-200" : "bg-white border-slate-200"}`}>
          <p className={`text-xs font-medium ${outOfStock.length > 0 ? "text-red-600" : "text-slate-500"}`}>Out of Stock</p>
          <p className={`text-3xl font-black mt-1 ${outOfStock.length > 0 ? "text-red-600" : "text-slate-800"}`}>{outOfStock.length}</p>
          <p className={`text-[11px] mt-0.5 ${outOfStock.length > 0 ? "text-red-500" : "text-slate-400"}`}>
            {outOfStock.length > 0 ? "Immediate restocking required" : "No items out of stock"}
          </p>
        </div>
      </div>

      {/* Alert banners */}
      {outOfStock.length > 0 && (
        <div className="bg-red-50 border border-red-200 rounded-2xl px-5 py-4 flex items-start gap-3">
          <MdWarning className="text-red-500 text-[18px] shrink-0 mt-0.5" />
          <div>
            <p className="text-sm font-bold text-red-700">Out of Stock</p>
            <p className="text-xs text-red-600 mt-0.5">{outOfStock.map(i => i.name).join(", ")}</p>
          </div>
        </div>
      )}
      {lowStock.length > 0 && (
        <div className="bg-amber-50 border border-amber-200 rounded-2xl px-5 py-4 flex items-start gap-3">
          <MdTrendingDown className="text-amber-500 text-[18px] shrink-0 mt-0.5" />
          <div>
            <p className="text-sm font-bold text-amber-700">Low Stock Warning</p>
            <p className="text-xs text-amber-600 mt-0.5">{lowStock.map(i => `${i.name} (${i.stock} left)`).join(" · ")}</p>
          </div>
        </div>
      )}

      {/* Tabs */}
      <div className="flex gap-1 bg-white border border-slate-200 rounded-xl p-1 w-fit">
        {[
          { key: "inventory", label: "Stock List",       icon: MdInventory2 },
          { key: "logs",      label: "Transaction Log",  icon: MdHistory    },
        ].map(({ key, label, icon: Icon }) => (
          <button key={key} onClick={() => setActiveTab(key)}
            className={`flex items-center gap-1.5 px-4 py-2 rounded-lg text-xs font-bold transition-all
              ${activeTab === key ? "bg-[#0b1a2c] text-sky-400 shadow-sm" : "text-slate-500 hover:text-slate-700"}`}>
            <Icon className="text-[14px]" /> {label}
          </button>
        ))}
      </div>

      {/* ── Inventory tab ── */}
      {activeTab === "inventory" && (
        <div className="bg-white border border-slate-200 rounded-2xl overflow-hidden">
          {/* Toolbar */}
          <div className="flex items-center gap-3 px-5 py-4 border-b border-slate-100 flex-wrap">
            <div className="flex items-center gap-2 bg-slate-50 border border-slate-200 rounded-xl px-3 py-2
              flex-1 min-w-52 focus-within:border-slate-300 transition-colors">
              <MdSearch className="text-slate-400 text-[15px] shrink-0" />
              <input type="text" value={search} onChange={e => setSearch(e.target.value)}
                placeholder="Search name, barcode, supplier…"
                className="text-sm text-slate-700 placeholder-slate-300 bg-transparent outline-none w-full" />
              {search && (
                <button onClick={() => setSearch("")} className="text-slate-300 hover:text-slate-500 transition-colors">
                  <MdClose className="text-[13px]" />
                </button>
              )}
            </div>
            <div className="flex gap-1 flex-wrap">
              {CATEGORIES.map(c => (
                <button key={c} onClick={() => setCategory(c)}
                  className={`px-3 py-1.5 rounded-lg text-[11px] font-bold transition-all
                    ${category === c ? "bg-[#0b1a2c] text-sky-400" : "text-slate-500 hover:bg-slate-100"}`}>
                  {c}
                </button>
              ))}
            </div>
          </div>

          {/* Table head */}
          <div className="grid grid-cols-[28px_2.5fr_1fr_1fr_1.2fr_80px] gap-4 px-5 py-2.5 bg-slate-50 border-b border-slate-100">
            {["", "Product", "Category", "Barcode", "Stock Level", ""].map((h, i) => (
              <p key={i} className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">{h}</p>
            ))}
          </div>

          {/* Rows */}
          {filtered.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-14 text-center">
              <div className="w-12 h-12 rounded-2xl bg-slate-100 flex items-center justify-center mb-3">
                <MdInventory2 className="text-[24px] text-slate-300" />
              </div>
              <p className="text-sm font-semibold text-slate-500">No items found</p>
              <p className="text-xs text-slate-400 mt-1">Try a different search or category filter.</p>
            </div>
          ) : filtered.map(item => (
            <InventoryRow key={item.id} item={item} onScan={openScannerFor} />
          ))}

          <div className="px-5 py-3 border-t border-slate-100 flex items-center justify-between">
            <p className="text-[11px] text-slate-400 font-medium">
              {filtered.length} of {items.length} items
            </p>
            <p className="text-[11px] text-slate-400 font-medium">
              Filtered value: ₱{filtered.reduce((s,i) => s + i.stock * i.price, 0).toLocaleString()}
            </p>
          </div>
        </div>
      )}

      {/* ── Transaction log tab ── */}
      {activeTab === "logs" && (
        <div className="bg-white border border-slate-200 rounded-2xl overflow-hidden">
          {/* Toolbar */}
          <div className="flex items-center gap-3 px-5 py-4 border-b border-slate-100">
            <p className="text-xs font-bold text-slate-500 uppercase tracking-widest mr-1">Filter:</p>
            {[
              { key: "all", label: "All"      },
              { key: "in",  label: "Stock In"  },
              { key: "out", label: "Stock Out" },
            ].map(({ key, label }) => (
              <button key={key} onClick={() => setLogFilter(key)}
                className={`px-3 py-1.5 rounded-lg text-[11px] font-bold transition-all
                  ${logFilter === key ? "bg-[#0b1a2c] text-sky-400" : "text-slate-500 hover:bg-slate-100"}`}>
                {label}
              </button>
            ))}
            <span className="ml-auto text-[11px] text-slate-400 font-medium">{filteredLogs.length} records</span>
          </div>

          {/* Log header */}
          <div className="grid grid-cols-[90px_2fr_80px_60px_1.5fr_90px] gap-4 px-5 py-2.5 bg-slate-50 border-b border-slate-100">
            {["Date", "Item", "Type", "Qty", "Note", "By"].map(h => (
              <p key={h} className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">{h}</p>
            ))}
          </div>

          <div className="divide-y divide-slate-100">
            {filteredLogs.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-12 text-center">
                <p className="text-sm font-semibold text-slate-500">No transactions found</p>
              </div>
            ) : filteredLogs.map(log => (
              <div key={log.id}
                className="grid grid-cols-[90px_2fr_80px_60px_1.5fr_90px] gap-4 px-5 py-3.5 items-center hover:bg-slate-50 transition-colors">
                <div>
                  <p className="text-[11px] font-semibold text-slate-700">{log.date}</p>
                  <p className="text-[10px] text-slate-400 mt-0.5">{log.time}</p>
                </div>
                <div>
                  <p className="text-sm font-semibold text-slate-800 truncate">{log.itemName}</p>
                  <p className="text-[10px] font-mono text-slate-400 mt-0.5">{log.itemId}</p>
                </div>
                <span className={`flex items-center gap-1 text-[11px] font-bold border px-2 py-0.5 rounded-full w-fit
                  ${log.type === "in" ? "bg-emerald-50 text-emerald-700 border-emerald-200" : "bg-red-50 text-red-500 border-red-200"}`}>
                  {log.type === "in" ? <MdArrowUpward className="text-[11px]" /> : <MdArrowDownward className="text-[11px]" />}
                  {log.type === "in" ? "In" : "Out"}
                </span>
                <p className="text-sm font-bold text-slate-700">{log.qty}</p>
                <p className="text-xs text-slate-500 truncate">{log.note || "—"}</p>
                <p className="text-[11px] text-slate-400 font-medium">{log.by}</p>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Modals */}
      {showScanner && (
        <ScannerModal
          items={items}
          onClose={() => { setShowScanner(false); setPreselect(null) }}
          onDone={handleScanResult}
        />
      )}
      {showAdd && <AddItemModal onClose={() => setShowAdd(false)} onAdd={item => setItems(p => [...p, item])} />}
    </div>
  )
}

export default Staff_Inventory