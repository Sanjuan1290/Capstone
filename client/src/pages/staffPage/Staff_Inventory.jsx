import { useState, useRef, useEffect } from "react"
import { getInventory, updateStock, getDoctors } from '../../services/staff.service'
import {
  MdSearch, MdClose, MdAdd, MdQrCodeScanner, MdInventory2,
  MdArrowUpward, MdArrowDownward, MdHistory, MdWarning,
  MdCheck, MdCategory, MdTrendingDown,
  MdFilterList, MdCalendarToday, MdPerson,
  MdLocalPharmacy, MdScience, MdCleaningServices
} from "react-icons/md"

const CATEGORIES = ["All", "Derma", "Medicine", "Supplies"]

// ── Helpers ───────────────────────────────────────────────────────────────────
const getStockStatus = (stock, threshold) => {
  if (stock === 0)        return { label: "Out of Stock", color: "text-red-600",    bg: "bg-red-100",    border: "border-red-200",    bar: "bg-red-500",    pct: 0 }
  if (stock <= threshold) return { label: "Low Stock",    color: "text-amber-700",  bg: "bg-amber-50",   border: "border-amber-200",  bar: "bg-amber-400",  pct: Math.round((stock / threshold) * 40) }
  return                         { label: "In Stock",     color: "text-emerald-700",bg: "bg-emerald-50", border: "border-emerald-200",bar: "bg-emerald-500",pct: Math.min(100, Math.round((stock / (threshold * 3)) * 100)) }
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
    const match = items.find(i => i.barcode === val)
    if (match) setFound(match)
    else if (val.length > 5) setError("No item found with that barcode.")
  }

  const handleSubmit = async () => {
    if (!found || qty < 1) return
    try {
      await onDone({ item: found, type, qty, note })
      setSuccess(true)
      setTimeout(onClose, 1200)
    } catch { setError("Failed to update stock.") }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm px-4" onClick={onClose}>
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-sm overflow-hidden" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between px-6 py-5 border-b border-slate-100">
          <div>
            <p className="text-sm font-bold text-slate-800">Barcode Scanner</p>
            <p className="text-xs text-slate-500 mt-0.5">Scan or type a barcode to update stock</p>
          </div>
          <button onClick={onClose} className="w-8 h-8 flex items-center justify-center rounded-xl hover:bg-slate-100 text-slate-400">
            <MdClose className="text-[18px]" />
          </button>
        </div>

        <div className="px-6 py-5 space-y-4">
          {success ? (
            <div className="flex flex-col items-center py-6 gap-3">
              <div className="w-14 h-14 rounded-full bg-emerald-100 flex items-center justify-center">
                <MdCheck className="text-emerald-500 text-[28px]" />
              </div>
              <p className="text-sm font-bold text-emerald-700">Stock Updated!</p>
            </div>
          ) : (
            <>
              {!prefillItem && (
                <div>
                  <label className="text-xs font-bold text-slate-500 uppercase tracking-widest mb-1.5 block">Barcode</label>
                  <input ref={inputRef} type="text" value={barcode} onChange={e => handleBarcode(e.target.value)}
                    placeholder="Scan or type barcode…"
                    className="w-full text-sm text-slate-700 placeholder-slate-300 bg-slate-50 border-2 border-slate-200 rounded-xl px-3 py-2.5 focus:outline-none focus:border-sky-400 transition-colors font-mono" />
                  {error && <p className="text-xs text-red-500 mt-1">{error}</p>}
                </div>
              )}

              {found && (
                <>
                  <div className="bg-emerald-50 border border-emerald-200 rounded-xl px-4 py-3">
                    <p className="text-xs text-emerald-600 font-bold uppercase tracking-widest mb-0.5">Found</p>
                    <p className="text-sm font-bold text-slate-800">{found.name}</p>
                    <p className="text-xs text-slate-500">{found.category} · Current stock: {found.stock} {found.unit}s</p>
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    {[{ v: "out", l: "Stock Out", icon: MdArrowDownward, color: "text-red-600 border-red-200 bg-red-50" },
                      { v: "in",  l: "Stock In",  icon: MdArrowUpward,   color: "text-emerald-600 border-emerald-200 bg-emerald-50" }
                    ].map(({ v, l, icon: Icon, color }) => (
                      <button key={v} onClick={() => setType(v)}
                        className={`flex items-center justify-center gap-2 py-2.5 rounded-xl text-xs font-bold border-2 transition-all
                          ${type === v ? color : "border-slate-200 text-slate-500 hover:border-slate-300"}`}>
                        <Icon className="text-[14px]" /> {l}
                      </button>
                    ))}
                  </div>
                  <div>
                    <label className="text-xs font-bold text-slate-500 uppercase tracking-widest mb-1.5 block">Quantity</label>
                    <input type="number" min={1} value={qty} onChange={e => setQty(Number(e.target.value))}
                      className="w-full text-sm text-slate-700 bg-slate-50 border-2 border-slate-200 rounded-xl px-3 py-2.5 focus:outline-none focus:border-sky-400 transition-colors" />
                  </div>
                  <div>
                    <label className="text-xs font-bold text-slate-500 uppercase tracking-widest mb-1.5 block">Note (optional)</label>
                    <input type="text" value={note} onChange={e => setNote(e.target.value)} placeholder="e.g. dispensed to patient"
                      className="w-full text-sm text-slate-700 bg-slate-50 border-2 border-slate-200 rounded-xl px-3 py-2.5 focus:outline-none focus:border-sky-400 transition-colors" />
                  </div>
                </>
              )}
            </>
          )}
        </div>

        {!success && found && (
          <div className="px-6 pb-6 flex gap-3">
            <button onClick={onClose}
              className="flex-1 py-2.5 text-sm font-semibold text-slate-600 border border-slate-200 rounded-xl hover:bg-slate-50 transition-colors">
              Cancel
            </button>
            <button onClick={handleSubmit} disabled={qty < 1}
              className="flex-1 py-2.5 text-sm font-bold text-white bg-[#0b1a2c] hover:bg-[#122236] disabled:opacity-40 rounded-xl transition-colors">
              Confirm
            </button>
          </div>
        )}
      </div>
    </div>
  )
}

// ── Add Item Modal ─────────────────────────────────────────────────────────────
const AddItemModal = ({ onClose, onAdd }) => {
  const [form,   setForm]   = useState({ barcode: "", name: "", category: "Medicine", unit: "box", stock: 0, threshold: 5, price: 0, supplier: "" })
  const [saving, setSaving] = useState(false)
  const [error,  setError]  = useState("")
  const set   = k => e => setForm(f => ({ ...f, [k]: e.target.value }))
  const valid = form.barcode.trim() && form.name.trim()

  const handleAdd = async () => {
    setSaving(true); setError("")
    try {
      await onAdd(form)
      onClose()
    } catch (err) {
      setError(err.message || "Failed to add item.")
    } finally { setSaving(false) }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm px-4" onClick={onClose}>
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-sm overflow-hidden" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between px-6 py-5 border-b border-slate-100">
          <p className="text-sm font-bold text-slate-800">Add Inventory Item</p>
          <button onClick={onClose} className="w-8 h-8 flex items-center justify-center rounded-xl hover:bg-slate-100 text-slate-400">
            <MdClose className="text-[18px]" />
          </button>
        </div>
        <div className="px-6 py-5 space-y-3 max-h-[70vh] overflow-y-auto">
          {error && <p className="text-xs text-red-600 bg-red-50 border border-red-200 rounded-xl px-4 py-3">{error}</p>}
          {[
            { k: "barcode",  l: "Barcode",         t: "text",   p: "e.g. 8800123456789", required: true  },
            { k: "name",     l: "Product Name",     t: "text",   p: "e.g. Paracetamol",   required: true  },
            { k: "supplier", l: "Supplier",         t: "text",   p: "e.g. MedSupply PH",  required: false },
            { k: "stock",    l: "Initial Stock",    t: "number", p: "0",                   required: false },
            { k: "threshold",l: "Low Stock Alert",  t: "number", p: "5",                   required: false },
            { k: "price",    l: "Unit Price (₱)",   t: "number", p: "0.00",                required: false },
          ].map(({ k, l, t, p, required }) => (
            <div key={k}>
              <label className="text-xs font-bold text-slate-500 uppercase tracking-widest mb-1.5 block">
                {l} {required && <span className="text-red-400">*</span>}
              </label>
              <input type={t} value={form[k]} onChange={set(k)} placeholder={p}
                className="w-full text-sm text-slate-700 placeholder-slate-300 bg-slate-50 border-2 border-slate-200 rounded-xl px-3 py-2.5 focus:outline-none focus:border-sky-400 transition-colors" />
            </div>
          ))}
          <div>
            <label className="text-xs font-bold text-slate-500 uppercase tracking-widest mb-1.5 block">Category <span className="text-red-400">*</span></label>
            <select value={form.category} onChange={set("category")}
              className="w-full text-sm text-slate-700 bg-slate-50 border-2 border-slate-200 rounded-xl px-3 py-2.5 focus:outline-none focus:border-sky-400 transition-colors">
              {["Medicine","Derma","Supplies"].map(c => <option key={c}>{c}</option>)}
            </select>
          </div>
          <div>
            <label className="text-xs font-bold text-slate-500 uppercase tracking-widest mb-1.5 block">Unit <span className="text-red-400">*</span></label>
            <select value={form.unit} onChange={set("unit")}
              className="w-full text-sm text-slate-700 bg-slate-50 border-2 border-slate-200 rounded-xl px-3 py-2.5 focus:outline-none focus:border-sky-400 transition-colors">
              {["box","tube","bottle","pack","piece","sachet"].map(u => <option key={u}>{u}</option>)}
            </select>
          </div>
        </div>
        <div className="px-6 pb-6 flex gap-3">
          <button onClick={onClose}
            className="flex-1 py-2.5 text-sm font-semibold text-slate-600 border border-slate-200 rounded-xl hover:bg-slate-50 transition-colors">
            Cancel
          </button>
          <button disabled={!valid || saving} onClick={handleAdd}
            className="flex-1 py-2.5 text-sm font-bold text-white bg-[#0b1a2c] hover:bg-[#122236] disabled:opacity-40 disabled:cursor-not-allowed rounded-xl transition-colors">
            {saving ? "Adding…" : "Add Item"}
          </button>
        </div>
      </div>
    </div>
  )
}

// ── Inventory Row ─────────────────────────────────────────────────────────────
const InventoryRow = ({ item, onScan }) => {
  const status   = getStockStatus(item.stock, item.threshold)
  const catStyle = getCategoryStyle(item.category)
  const CatIcon  = catStyle.icon

  return (
    <div className="grid grid-cols-[28px_2.5fr_1fr_1fr_1.2fr_80px] gap-4 px-5 py-4 items-center hover:bg-slate-50/80 transition-colors border-b border-slate-100 last:border-0">
      <div className={`w-7 h-7 rounded-lg ${catStyle.bg} flex items-center justify-center shrink-0`}>
        <CatIcon className={`text-[13px] ${catStyle.text}`} />
      </div>
      <div className="min-w-0">
        <p className="text-sm font-semibold text-slate-800 truncate">{item.name}</p>
        <p className="text-[11px] text-slate-400 mt-0.5 flex items-center gap-2">
          <span className="font-mono">{item.id}</span>
          <span className="text-slate-300">·</span>
          <span>{item.supplier}</span>
        </p>
      </div>
      <span className={`text-[11px] font-bold border px-2.5 py-0.5 rounded-full w-fit ${catStyle.bg} ${catStyle.text} ${catStyle.border}`}>
        {item.category}
      </span>
      <p className="text-xs font-mono text-slate-400 truncate">{item.barcode}</p>
      <div className="space-y-1.5">
        <div className="flex items-center justify-between">
          <span className={`text-sm font-bold ${item.stock === 0 ? "text-red-600" : item.stock <= item.threshold ? "text-amber-600" : "text-slate-800"}`}>
            {item.stock} <span className="text-xs font-normal text-slate-400">{item.unit}s</span>
          </span>
          <span className={`text-[10px] font-bold border px-1.5 py-0.5 rounded-full ${status.bg} ${status.color} ${status.border}`}>
            {status.label}
          </span>
        </div>
        <div className="h-1.5 bg-slate-100 rounded-full overflow-hidden">
          <div className={`h-full ${status.bar} rounded-full transition-all duration-500`}
            style={{ width: `${Math.max(3, status.pct)}%` }} />
        </div>
        <p className="text-[10px] text-slate-400">Threshold: {item.threshold}</p>
      </div>
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
  const [items,       setItems]       = useState([])
  const [logs,        setLogs]        = useState([])
  const [loading,     setLoading]     = useState(true)
  const [search,      setSearch]      = useState("")
  const [category,    setCategory]    = useState("All")
  const [activeTab,   setActiveTab]   = useState("inventory")
  const [showScanner, setShowScanner] = useState(false)
  const [showAdd,     setShowAdd]     = useState(false)
  const [logFilter,   setLogFilter]   = useState("all")
  const [preselect,   setPreselect]   = useState(null)

  // ✅ NEW: date filter state for transaction log
  const [logDateFilter, setLogDateFilter] = useState("today")
  const [logCustomDate, setLogCustomDate] = useState("")

  useEffect(() => {
    getInventory()
      .then(data => {
        setItems(data.items || [])
        setLogs(data.logs   || [])
      })
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [])

  const lowStock   = items.filter(i => i.stock <= i.threshold && i.stock > 0)
  const outOfStock = items.filter(i => i.stock === 0)
  const totalValue = items.reduce((sum, i) => sum + i.stock * i.price, 0)

  const filtered = items.filter(i => {
    const matchCat    = category === "All" || i.category === category
    const matchSearch = !search ||
      i.name.toLowerCase().includes(search.toLowerCase()) ||
      (i.barcode || "").includes(search) ||
      (i.supplier || "").toLowerCase().includes(search.toLowerCase())
    return matchCat && matchSearch
  })

  // ✅ NEW: apply both type AND date filters to logs
  const filteredLogs = logs.filter(l => {
    const typeMatch = logFilter === "all" || l.type === logFilter
    let dateMatch = true
    if (logDateFilter === "today") {
      const today = new Date().toISOString().split('T')[0]
      dateMatch = (l.logged_at || "").startsWith(today)
    } else if (logDateFilter === "month") {
      const ym = new Date().toISOString().slice(0, 7)
      dateMatch = (l.logged_at || "").startsWith(ym)
    } else if (logDateFilter === "custom" && logCustomDate) {
      dateMatch = (l.logged_at || "").startsWith(logCustomDate)
    }
    // "all_time" → dateMatch stays true
    return typeMatch && dateMatch
  })

  const handleScanResult = async ({ item, type, qty, note }) => {
    const res = await updateStock(item.id, { type, qty, note })
    setItems(prev => prev.map(i => i.id === item.id ? { ...i, stock: res.new_stock } : i))
    if (res.log) setLogs(prev => [res.log, ...prev])
  }

  const handleAddItem = async (formData) => {
    const res  = await fetch("/api/staff/inventory", {
      method: "POST", headers: { "Content-Type": "application/json" },
      credentials: "include", body: JSON.stringify(formData),
    })
    const data = await res.json()
    if (!res.ok) throw new Error(data.message || "Failed")
    setItems(prev => [...prev, data])
  }

  const openScannerFor = (item) => { setPreselect(item); setShowScanner(true) }

  if (loading) return (
    <div className="flex items-center justify-center h-96">
      <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-[#0b1a2c]" />
    </div>
  )

  return (
    <div className="max-w-5xl space-y-5">
      {/* Header */}
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold text-slate-800">Inventory</h1>
          <p className="text-sm text-slate-500 mt-0.5">Track stock levels, scan barcodes for stock-in and stock-out transactions.</p>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={() => { setPreselect(null); setShowScanner(true) }}
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
          <p className="text-[11px] text-slate-400 mt-0.5">
            {items.filter(i => i.category === "Medicine").length} medicine ·{" "}
            {items.filter(i => i.category === "Derma").length} derma ·{" "}
            {items.filter(i => i.category === "Supplies").length} supplies
          </p>
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
          { key: "inventory", label: "Stock List",      icon: MdInventory2 },
          { key: "logs",      label: "Transaction Log", icon: MdHistory    },
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
          <div className="flex items-center gap-3 px-5 py-4 border-b border-slate-100 flex-wrap">
            <div className="flex items-center gap-2 bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 flex-1 min-w-52">
              <MdSearch className="text-slate-400 text-[15px] shrink-0" />
              <input type="text" value={search} onChange={e => setSearch(e.target.value)}
                placeholder="Search name, barcode, supplier…"
                className="text-sm text-slate-700 placeholder-slate-300 bg-transparent outline-none w-full" />
              {search && (
                <button onClick={() => setSearch("")} className="text-slate-300 hover:text-slate-500">
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

          <div className="grid grid-cols-[28px_2.5fr_1fr_1fr_1.2fr_80px] gap-4 px-5 py-2.5 bg-slate-50 border-b border-slate-100">
            {["","Product","Category","Barcode","Stock Level",""].map((h, i) => (
              <p key={i} className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">{h}</p>
            ))}
          </div>

          {filtered.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-14 text-center">
              <MdInventory2 className="text-[40px] text-slate-200 mb-3" />
              <p className="text-sm font-semibold text-slate-500">No items found</p>
              <p className="text-xs text-slate-400 mt-1">Try a different search or category filter.</p>
            </div>
          ) : filtered.map(item => (
            <InventoryRow key={item.id} item={item} onScan={openScannerFor} />
          ))}

          <div className="px-5 py-3 border-t border-slate-100 flex items-center justify-between">
            <p className="text-[11px] text-slate-400 font-medium">{filtered.length} of {items.length} items</p>
            <p className="text-[11px] text-slate-400 font-medium">
              Filtered value: ₱{filtered.reduce((s, i) => s + i.stock * i.price, 0).toLocaleString()}
            </p>
          </div>
        </div>
      )}

      {/* ── Transaction log tab ── */}
      {activeTab === "logs" && (
        <div className="bg-white border border-slate-200 rounded-2xl overflow-hidden">
          {/* ✅ NEW: Combined type + date filters toolbar */}
          <div className="flex flex-col gap-3 px-5 py-4 border-b border-slate-100">
            {/* Type filter row */}
            <div className="flex items-center gap-2 flex-wrap">
              <div className="flex items-center gap-1 text-xs font-bold text-slate-500 uppercase tracking-widest mr-1">
                <MdFilterList className="text-[14px]" /> Type:
              </div>
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
            </div>

            {/* ✅ Date filter row */}
            <div className="flex items-center gap-2 flex-wrap">
              <div className="flex items-center gap-1 text-xs font-bold text-slate-500 uppercase tracking-widest mr-1">
                <MdCalendarToday className="text-[14px]" /> Period:
              </div>
              {[
                { key: "today",    label: "Today"        },
                { key: "month",    label: "This Month"   },
                { key: "all_time", label: "All Time"     },
                { key: "custom",   label: "Pick Date"    },
              ].map(({ key, label }) => (
                <button key={key} onClick={() => setLogDateFilter(key)}
                  className={`px-3 py-1.5 rounded-lg text-[11px] font-bold transition-all
                    ${logDateFilter === key ? "bg-emerald-500 text-white" : "text-slate-500 hover:bg-slate-100"}`}>
                  {label}
                </button>
              ))}
              {logDateFilter === "custom" && (
                <input
                  type="date"
                  value={logCustomDate}
                  onChange={e => setLogCustomDate(e.target.value)}
                  className="text-xs border-2 border-slate-200 rounded-lg px-2 py-1.5 text-slate-700 focus:outline-none focus:border-emerald-400 transition-colors"
                />
              )}
              <span className="text-[11px] text-slate-400 ml-auto">
                {filteredLogs.length} transaction{filteredLogs.length !== 1 ? "s" : ""}
              </span>
            </div>
          </div>

          {/* Log entries */}
          {filteredLogs.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-14 text-center">
              <MdHistory className="text-[40px] text-slate-200 mb-3" />
              <p className="text-sm font-semibold text-slate-500">No transactions found</p>
              <p className="text-xs text-slate-400 mt-1">Try adjusting the type or date filter.</p>
            </div>
          ) : (
            <div className="divide-y divide-slate-100">
              {filteredLogs.map(log => {
                const isIn  = log.type === "in"
                const item  = items.find(i => i.id === log.inventory_id)
                const logDate = log.logged_at
                  ? new Date(log.logged_at).toLocaleString('en-PH', { month: 'short', day: 'numeric', year: 'numeric', hour: '2-digit', minute: '2-digit' })
                  : "—"
                return (
                  <div key={log.id} className="flex items-center gap-4 px-5 py-3.5 hover:bg-slate-50/80 transition-colors">
                    <div className={`w-8 h-8 rounded-xl flex items-center justify-center shrink-0
                      ${isIn ? "bg-emerald-50" : "bg-red-50"}`}>
                      {isIn
                        ? <MdArrowUpward   className="text-emerald-500 text-[15px]" />
                        : <MdArrowDownward className="text-red-500     text-[15px]" />}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-semibold text-slate-800 truncate">
                        {item?.name || `Item #${log.inventory_id}`}
                      </p>
                      <p className="text-[11px] text-slate-400 mt-0.5 truncate">
                        {log.note || (isIn ? "Stock received" : "Stock dispensed")}
                        {log.staff_id && <span className="ml-1 flex-inline items-center gap-0.5"><MdPerson className="inline text-[10px]" /> Staff #{log.staff_id}</span>}
                      </p>
                    </div>
                    <div className="text-right shrink-0">
                      <p className={`text-sm font-bold ${isIn ? "text-emerald-600" : "text-red-500"}`}>
                        {isIn ? "+" : "−"}{log.qty} {item?.unit || "unit"}s
                      </p>
                      <p className="text-[10px] text-slate-400 mt-0.5">{logDate}</p>
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </div>
      )}

      {/* Modals */}
      {showScanner && (
        <ScannerModal
          items={items}
          prefillItem={preselect}
          onClose={() => { setShowScanner(false); setPreselect(null) }}
          onDone={handleScanResult}
        />
      )}
      {showAdd && (
        <AddItemModal
          onClose={() => setShowAdd(false)}
          onAdd={handleAddItem}
        />
      )}
    </div>
  )
}

export default Staff_Inventory