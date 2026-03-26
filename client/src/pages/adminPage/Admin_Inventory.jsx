import { useState, useRef, useEffect } from "react"
import { getInventory, updateStock, addInventoryItem } from '../../services/admin.service'
import {
  MdSearch, MdClose, MdAdd, MdQrCodeScanner, MdInventory2,
  MdArrowUpward, MdArrowDownward, MdHistory, MdWarning,
  MdCheck, MdCategory, MdTrendingDown, MdTrendingUp,
  MdInfoOutline, MdFilterList, MdCalendarToday, MdPerson,
  MdLocalPharmacy, MdScience, MdCleaningServices
} from "react-icons/md"

// ── Initial Data (Logs fallback) ──────────────────────────────────────────────
const initialLogs = [
  { id: 1,  itemId: "ITM-001", itemName: "Tretinoin 0.025% Cream", type: "out", qty: 2, note: "Dispensed to patient — Maria Cruz",      by: "Admin",  date: "Mar 23, 2026", time: "9:10 AM"  },
  { id: 2,  itemId: "ITM-005", itemName: "Amoxicillin 500mg",      type: "out", qty: 1, note: "Dispensed to patient — Carlo Santos",    by: "Admin",  date: "Mar 23, 2026", time: "9:45 AM"  },
  { id: 3,  itemId: "ITM-007", itemName: "Paracetamol 500mg",      type: "in",  qty: 10, note: "Restocked from MedPhil Supply",         by: "Admin",  date: "Mar 22, 2026", time: "2:00 PM"  },
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
const ScannerModal = ({ items, onClose, onDone, prefillItem = null }) => {
  const [barcode, setBarcode] = useState(prefillItem ? prefillItem.barcode : "")
  const [found,   setFound]   = useState(prefillItem)
  const [error,   setError]   = useState("")
  const [type,    setType]    = useState("out")
  const [qty,     setQty]     = useState(1)
  const [note,    setNote]    = useState("")
  const [success, setSuccess] = useState(false)
  const inputRef = useRef(null)

  useEffect(() => { if (!prefillItem) inputRef.current?.focus() }, [prefillItem])

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
      if (!prefillItem) inputRef.current?.focus()
      else onClose()
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

  const handleSumbit = () => {
    onAdd({
      ...form,
      stock: parseInt(form.stock) || 0,
      threshold: parseInt(form.threshold) || 5,
      price: parseFloat(form.price) || 0
    });
    onClose();
  }

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
            onClick={handleSumbit}
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
          <span className="truncate">{item.supplier}</span>
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
const Admin_Inventory = () => {
  const [items,       setItems]       = useState([])
  const [logs,        setLogs]        = useState(initialLogs)
  const [loading,     setLoading]     = useState(true)
  const [search,      setSearch]      = useState("")
  const [category,    setCategory]    = useState("All")
  const [activeTab,   setActiveTab]   = useState("inventory")
  const [showScanner, setShowScanner] = useState(false)
  const [showAdd,     setShowAdd]     = useState(false)
  const [logFilter,   setLogFilter]   = useState("all")
  const [preselect,   setPreselect]   = useState(null)

  // Fetch data on mount
  useEffect(() => {
    const fetchInventoryData = async () => {
      try {
        const data = await getInventory()
        setItems(data || [])
      } catch (err) {
        console.error("Failed to load inventory:", err)
      } finally {
        setLoading(false)
      }
    }
    fetchInventoryData()
  }, [])

  const lowStock   = items.filter(i => i.stock <= i.threshold && i.stock > 0)
  const outOfStock = items.filter(i => i.stock === 0)
  const totalValue = items.reduce((sum, i) => sum + i.stock * (i.price || 0), 0)

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

  const handleScanResult = async ({ item, type, qty, note }) => {
    try {
      // API call to update stock
      const updatedItem = await updateStock(item.id, { type, qty, note })
      
      // Update local state with response
      setItems(prev => prev.map(i => i.id === item.id ? updatedItem : i))
      
      // Update local logs
      setLogs(prev => [{
        id: Date.now(), itemId: item.id, itemName: item.name,
        type, qty, note: note || (type === "in" ? "Restocked" : "Dispensed"),
        by: "Admin",
        date: new Date().toLocaleDateString("en-PH", { month: "short", day: "numeric", year: "numeric" }),
        time: new Date().toLocaleTimeString("en-PH", { hour: "2-digit", minute: "2-digit" }),
      }, ...prev])
    } catch (err) {
      console.error("Failed to update stock:", err)
      // Fallback for demo purposes if backend isn't returning updated item structure yet:
      setItems(prev => prev.map(i => {
        if (i.id !== item.id) return i
        return { ...i, stock: type === "in" ? i.stock + qty : Math.max(0, i.stock - qty) }
      }))
    }
  }

  const handleAddItem = async (newItem) => {
    try {
      // API call to create new item
      const createdItem = await addInventoryItem(newItem)
      setItems(prev => [createdItem, ...prev])
    } catch (err) {
      console.error("Failed to add inventory item:", err)
      // Fallback for demo:
      setItems(prev => [{...newItem, id: `ITM-${String(Date.now()).slice(-3)}`}, ...prev])
    }
  }

  const openScannerFor = (item) => {
    setPreselect(item)
    setShowScanner(true)
  }

  const closeScanner = () => {
    setPreselect(null)
    setShowScanner(false)
  }

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center p-20 space-y-4">
        <div className="w-10 h-10 border-4 border-slate-200 border-t-sky-500 rounded-full animate-spin" />
        <p className="text-slate-400 font-medium animate-pulse text-sm">Syncing admin inventory database...</p>
      </div>
    )
  }

  return (
    <div className="max-w-6xl space-y-5">

      {/* Header */}
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold text-slate-800">Inventory Management</h1>
          <p className="text-sm text-slate-500 mt-0.5">
            Track stock levels, add new products, and monitor transactions.
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
          <p className="text-[11px] text-slate-400 mt-0.5">{items.filter(i=>i.category==="Medicine").length} medicine · {items.filter(i=>i.category==="Derma").length} derma</p>
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
                <MdInventory2 className="text-slate-400 text-2xl" />
              </div>
              <p className="text-sm font-bold text-slate-700">No items found</p>
              <p className="text-xs text-slate-500 mt-1">Try adjusting your search or category filter.</p>
            </div>
          ) : (
            <div className="divide-y divide-slate-100">
              {filtered.map(item => (
                <InventoryRow key={item.id} item={item} onScan={openScannerFor} />
              ))}
            </div>
          )}
        </div>
      )}

      {/* ── Logs Tab ── */}
      {activeTab === "logs" && (
        <div className="bg-white border border-slate-200 rounded-2xl overflow-hidden">
          <div className="px-5 py-4 border-b border-slate-100 flex justify-between items-center">
            <h3 className="text-sm font-bold text-slate-800">Recent Transactions</h3>
            <div className="flex gap-2">
              {["all", "in", "out"].map(f => (
                <button key={f} onClick={() => setLogFilter(f)} 
                  className={`px-3 py-1 rounded-lg text-[10px] font-bold uppercase transition-all ${logFilter === f ? "bg-[#0b1a2c] text-white" : "bg-slate-100 text-slate-500 hover:bg-slate-200"}`}>
                  {f}
                </button>
              ))}
            </div>
          </div>
          <div className="divide-y divide-slate-100 max-h-[600px] overflow-y-auto">
            {filteredLogs.map(log => (
              <div key={log.id} className="px-5 py-4 flex items-center justify-between hover:bg-slate-50 transition-colors">
                <div className="flex items-center gap-4">
                  <div className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 ${log.type === "in" ? "bg-emerald-50 border border-emerald-100" : "bg-amber-50 border border-amber-100"}`}>
                    {log.type === "in" ? <MdArrowUpward className="text-emerald-600 text-[18px]" /> : <MdArrowDownward className="text-amber-600 text-[18px]" />}
                  </div>
                  <div>
                    <p className="text-sm font-bold text-slate-800">{log.itemName}</p>
                    <div className="flex items-center gap-2 mt-0.5">
                      <span className={`text-[10px] font-bold uppercase tracking-wider ${log.type === "in" ? "text-emerald-600" : "text-amber-600"}`}>
                        Stock {log.type}
                      </span>
                      <span className="text-slate-300">·</span>
                      <span className="text-[11px] text-slate-500">{log.note}</span>
                    </div>
                  </div>
                </div>
                <div className="text-right">
                  <p className={`text-base font-black ${log.type === "in" ? "text-emerald-600" : "text-amber-600"}`}>
                    {log.type === "in" ? "+" : "-"}{log.qty}
                  </p>
                  <p className="text-[10px] text-slate-400 mt-0.5">
                    {log.date} · {log.time} · {log.by}
                  </p>
                </div>
              </div>
            ))}
            {filteredLogs.length === 0 && (
              <div className="py-14 text-center">
                <div className="w-12 h-12 rounded-2xl bg-slate-100 flex items-center justify-center mx-auto mb-3">
                  <MdHistory className="text-slate-400 text-2xl" />
                </div>
                <p className="text-sm font-bold text-slate-700">No transactions yet</p>
                <p className="text-xs text-slate-500 mt-1">Stock movements will be recorded here.</p>
              </div>
            )}
          </div>
        </div>
      )}

      {showScanner && <ScannerModal items={items} onClose={closeScanner} onDone={handleScanResult} prefillItem={preselect} />}
      {showAdd && <AddItemModal onClose={() => setShowAdd(false)} onAdd={handleAddItem} />}
    </div>
  )
}

export default Admin_Inventory