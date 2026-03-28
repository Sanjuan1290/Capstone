// client/src/pages/adminPage/Admin_Inventory.jsx
import { useEffect, useState } from 'react'
import { getInventory, updateStock, addInventoryItem } from '../../services/admin.service'
import {
  MdSearch, MdClose, MdQrCodeScanner, MdAdd, MdInventory2,
  MdHistory, MdWarning, MdTrendingDown, MdMedication,
  MdScience, MdBuild, MdArrowUpward, MdArrowDownward,
  MdFilterList, MdCalendarToday
} from 'react-icons/md'

const CATEGORIES = ['All', 'Medicine', 'Derma', 'Supplies']
const MONTHS = ['January','February','March','April','May','June','July','August','September','October','November','December']

const getStockStatus = (stock, threshold) => {
  const pct = threshold > 0 ? Math.round((stock / (threshold * 3)) * 100) : 100
  if (stock === 0)         return { label: 'Out', bg: 'bg-red-50',    color: 'text-red-600',    border: 'border-red-200',    bar: 'bg-red-400',    pct: 0 }
  if (stock <= threshold)  return { label: 'Low', bg: 'bg-amber-50',  color: 'text-amber-600',  border: 'border-amber-200',  bar: 'bg-amber-400',  pct: Math.min(pct, 30) }
  return                          { label: 'OK',  bg: 'bg-emerald-50',color: 'text-emerald-600',border: 'border-emerald-200',bar: 'bg-emerald-400',pct: Math.min(pct, 100) }
}

const getCategoryStyle = (cat) => {
  switch(cat) {
    case 'Medicine': return { bg: 'bg-sky-50',    text: 'text-sky-600',    border: 'border-sky-200',    icon: MdMedication }
    case 'Derma':    return { bg: 'bg-violet-50', text: 'text-violet-600', border: 'border-violet-200', icon: MdScience    }
    default:         return { bg: 'bg-slate-100', text: 'text-slate-500',  border: 'border-slate-200',  icon: MdBuild      }
  }
}

// ── Barcode Scanner / Stock Modal ─────────────────────────────────────────────
const ScannerModal = ({ onClose, onConfirm, items, preselect }) => {
  const [barcode, setBarcode]   = useState(preselect?.barcode || '')
  const [type,    setType]      = useState('in')
  const [qty,     setQty]       = useState(1)
  const [note,    setNote]      = useState('')
  const [success, setSuccess]   = useState(false)

  const found = preselect || items.find(i => i.barcode === barcode || i.name.toLowerCase() === barcode.toLowerCase())

  const handleConfirm = async () => {
    if (!found) return
    setSuccess(true)
    await onConfirm({ item: found, type, qty, note })
    setTimeout(() => { setSuccess(false); onClose() }, 800)
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm px-4" onClick={onClose}>
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between px-6 py-5 border-b border-slate-100">
          <div>
            <p className="text-sm font-bold text-slate-800">Update Stock</p>
            <p className="text-xs text-slate-500 mt-0.5">Scan barcode or enter item name</p>
          </div>
          <button onClick={onClose} className="w-8 h-8 flex items-center justify-center rounded-xl hover:bg-slate-100 text-slate-400">
            <MdClose className="text-[18px]" />
          </button>
        </div>
        <div className="px-6 py-5 space-y-4">
          {!preselect && (
            <div>
              <label className="text-xs font-bold text-slate-500 uppercase tracking-widest mb-1.5 block">Barcode / Item Name</label>
              <input type="text" value={barcode} onChange={e => setBarcode(e.target.value)} placeholder="Scan or type here…"
                autoFocus
                className="w-full text-sm text-slate-700 placeholder-slate-300 bg-slate-50 border-2 border-slate-200 rounded-xl px-3 py-2.5 focus:outline-none focus:border-sky-400 transition-colors" />
            </div>
          )}
          {found && (
            <>
              <div className="bg-sky-50 border border-sky-200 rounded-xl px-4 py-3">
                <p className="text-sm font-bold text-sky-800">{found.name}</p>
                <p className="text-xs text-sky-600 mt-0.5">{found.category} · {found.barcode} · Current: {found.stock} {found.unit}s</p>
              </div>
              <div>
                <label className="text-xs font-bold text-slate-500 uppercase tracking-widest mb-1.5 block">Transaction Type</label>
                <div className="grid grid-cols-2 gap-2">
                  {[{ v: 'in', l: 'Stock In', icon: MdArrowUpward, color: 'emerald' }, { v: 'out', l: 'Stock Out', icon: MdArrowDownward, color: 'red' }].map(({ v, l, icon: Icon, color }) => (
                    <button key={v} onClick={() => setType(v)}
                      className={`flex items-center justify-center gap-2 py-3 rounded-xl text-xs font-bold border-2 transition-all
                        ${type === v
                          ? (color === 'emerald' ? 'border-emerald-400 bg-emerald-50 text-emerald-700' : 'border-red-400 bg-red-50 text-red-600')
                          : 'border-slate-200 text-slate-600 hover:border-slate-300'}`}>
                      <Icon className="text-[14px]" /> {l}
                    </button>
                  ))}
                </div>
              </div>
              <div>
                <label className="text-xs font-bold text-slate-500 uppercase tracking-widest mb-1.5 block">Quantity</label>
                <div className="flex items-center gap-2">
                  <button onClick={() => setQty(q => Math.max(1, q - 1))} className="w-10 h-10 rounded-xl border-2 border-slate-200 text-slate-600 text-lg font-bold hover:border-slate-300 hover:bg-slate-50 transition-all">−</button>
                  <input type="number" min={1} value={qty} onChange={e => setQty(Math.max(1, parseInt(e.target.value) || 1))}
                    className="flex-1 text-center text-sm font-bold text-slate-800 bg-slate-50 border-2 border-slate-200 rounded-xl py-2.5 focus:outline-none focus:border-sky-400 transition-colors" />
                  <button onClick={() => setQty(q => q + 1)} className="w-10 h-10 rounded-xl border-2 border-slate-200 text-slate-600 text-lg font-bold hover:border-slate-300 hover:bg-slate-50 transition-all">+</button>
                </div>
                {type === 'out' && qty > found.stock && (
                  <p className="text-xs text-red-500 font-medium mt-1.5 flex items-center gap-1">
                    <MdWarning className="text-[13px]" /> Exceeds current stock ({found.stock})
                  </p>
                )}
              </div>
              <div>
                <label className="text-xs font-bold text-slate-500 uppercase tracking-widest mb-1.5 block">Note <span className="font-normal text-slate-400 normal-case">(optional)</span></label>
                <input type="text" value={note} onChange={e => setNote(e.target.value)}
                  placeholder={type === 'out' ? 'e.g. Dispensed to patient' : 'e.g. Restocked from supplier'}
                  className="w-full text-sm text-slate-700 placeholder-slate-300 bg-slate-50 border-2 border-slate-200 rounded-xl px-3 py-2.5 focus:outline-none focus:border-sky-400 transition-colors" />
              </div>
            </>
          )}
        </div>
        <div className="px-6 pb-6 flex gap-3">
          <button onClick={onClose} className="flex-1 py-2.5 text-sm font-semibold text-slate-600 border border-slate-200 rounded-xl hover:bg-slate-50 transition-colors">Close</button>
          <button onClick={handleConfirm}
            disabled={!found || qty < 1 || (type === 'out' && qty > found.stock)}
            className={`flex-1 py-2.5 text-sm font-bold text-white rounded-xl transition-colors disabled:opacity-40 disabled:cursor-not-allowed
              ${type === 'in' ? 'bg-emerald-500 hover:bg-emerald-600' : 'bg-[#0b1a2c] hover:bg-[#122236]'}`}>
            {success ? '✓ Done!' : `Confirm ${type === 'in' ? 'Stock In' : 'Stock Out'}`}
          </button>
        </div>
      </div>
    </div>
  )
}

// ── Add Item Modal ────────────────────────────────────────────────────────────
const AddItemModal = ({ onClose, onAdd }) => {
  const [form, setForm] = useState({ barcode: '', name: '', category: 'Medicine', unit: 'box', stock: '', threshold: '5', price: '', supplier: '' })
  const set = k => e => setForm(f => ({ ...f, [k]: e.target.value }))
  const valid = form.barcode.trim() && form.name.trim() && form.supplier.trim()

  const handleSubmit = () => {
    onAdd({ ...form, stock: parseInt(form.stock) || 0, threshold: parseInt(form.threshold) || 5, price: parseFloat(form.price) || 0 })
    onClose()
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm px-4" onClick={onClose}>
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between px-6 py-5 border-b border-slate-100">
          <div>
            <p className="text-sm font-bold text-slate-800">Add New Item</p>
            <p className="text-xs text-slate-500 mt-0.5">Register a new product in the inventory</p>
          </div>
          <button onClick={onClose} className="w-8 h-8 flex items-center justify-center rounded-xl hover:bg-slate-100 text-slate-400"><MdClose className="text-[18px]" /></button>
        </div>
        <div className="px-6 py-5 space-y-3 max-h-[65vh] overflow-y-auto">
          {[
            { k: 'barcode',  l: 'Barcode',         t: 'text',   p: 'e.g. 8850001001234', required: true  },
            { k: 'name',     l: 'Product Name',     t: 'text',   p: 'e.g. Paracetamol',   required: true  },
            { k: 'supplier', l: 'Supplier',         t: 'text',   p: 'e.g. Dermacare PH',  required: true  },
            { k: 'stock',    l: 'Initial Stock',    t: 'number', p: '0',                  required: false },
            { k: 'threshold',l: 'Low Stock Alert',  t: 'number', p: '5',                  required: false },
            { k: 'price',    l: 'Unit Price (₱)',   t: 'number', p: '0.00',               required: false },
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
            <select value={form.category} onChange={set('category')} className="w-full text-sm text-slate-700 bg-slate-50 border-2 border-slate-200 rounded-xl px-3 py-2.5 focus:outline-none focus:border-sky-400">
              {['Medicine','Derma','Supplies'].map(c => <option key={c}>{c}</option>)}
            </select>
          </div>
          <div>
            <label className="text-xs font-bold text-slate-500 uppercase tracking-widest mb-1.5 block">Unit <span className="text-red-400">*</span></label>
            <select value={form.unit} onChange={set('unit')} className="w-full text-sm text-slate-700 bg-slate-50 border-2 border-slate-200 rounded-xl px-3 py-2.5 focus:outline-none focus:border-sky-400">
              {['box','tube','bottle','pack','piece','sachet'].map(u => <option key={u}>{u}</option>)}
            </select>
          </div>
        </div>
        <div className="px-6 pb-6 flex gap-3">
          <button onClick={onClose} className="flex-1 py-2.5 text-sm font-semibold text-slate-600 border border-slate-200 rounded-xl hover:bg-slate-50">Cancel</button>
          <button disabled={!valid} onClick={handleSubmit}
            className="flex-1 py-2.5 text-sm font-bold text-white bg-[#0b1a2c] hover:bg-[#122236] disabled:opacity-40 disabled:cursor-not-allowed rounded-xl">
            Add Item
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
          <span className="font-mono">{item.barcode}</span>
          <span className="text-slate-300">·</span>
          <span className="truncate">{item.supplier}</span>
        </p>
      </div>
      <span className={`text-[11px] font-bold border px-2.5 py-0.5 rounded-full w-fit ${catStyle.bg} ${catStyle.text} ${catStyle.border}`}>{item.category}</span>
      <p className="text-xs font-mono text-slate-400 truncate">{item.barcode}</p>
      <div className="space-y-1.5">
        <div className="flex items-center justify-between">
          <span className={`text-sm font-bold ${item.stock === 0 ? 'text-red-600' : item.stock <= item.threshold ? 'text-amber-600' : 'text-slate-800'}`}>
            {item.stock} <span className="text-xs font-normal text-slate-400">{item.unit}s</span>
          </span>
          <span className={`text-[10px] font-bold border px-1.5 py-0.5 rounded-full ${status.bg} ${status.color} ${status.border}`}>{status.label}</span>
        </div>
        <div className="h-1.5 bg-slate-100 rounded-full overflow-hidden">
          <div className={`h-full ${status.bar} rounded-full transition-all duration-500`} style={{ width: `${Math.max(3, status.pct)}%` }} />
        </div>
        <p className="text-[10px] text-slate-400">Threshold: {item.threshold}</p>
      </div>
      <button onClick={() => onScan(item)}
        className="flex items-center justify-center gap-1 py-1.5 px-2.5 rounded-lg border border-slate-200 text-slate-500 text-[11px] font-semibold hover:border-sky-300 hover:text-sky-600 hover:bg-sky-50 transition-all">
        <MdQrCodeScanner className="text-[13px]" /> Scan
      </button>
    </div>
  )
}

// ── Main ──────────────────────────────────────────────────────────────────────
const Admin_Inventory = () => {
  const [items,       setItems]       = useState([])
  const [logs,        setLogs]        = useState([])
  const [loading,     setLoading]     = useState(true)
  const [search,      setSearch]      = useState('')
  const [category,    setCategory]    = useState('All')
  const [activeTab,   setActiveTab]   = useState('inventory')
  const [showScanner, setShowScanner] = useState(false)
  const [showAdd,     setShowAdd]     = useState(false)
  const [preselect,   setPreselect]   = useState(null)
  // Transaction log filters
  const [logFilter,   setLogFilter]   = useState('all')   // all / in / out
  const [logMonth,    setLogMonth]    = useState('')       // '01' – '12'
  const [logDate,     setLogDate]     = useState('')       // YYYY-MM-DD

  useEffect(() => {
    getInventory()
      .then(data => {
        if (data?.items) { setItems(data.items); setLogs(data.logs || []) }
        else if (Array.isArray(data)) setItems(data)
      })
      .catch(err => console.error('Failed to load inventory:', err))
      .finally(() => setLoading(false))
  }, [])

  const lowStock   = items.filter(i => i.stock <= i.threshold && i.stock > 0)
  const outOfStock = items.filter(i => i.stock === 0)
  const totalValue = items.reduce((s, i) => s + i.stock * (parseFloat(i.price) || 0), 0)

  const filtered = items.filter(i => {
    const matchCat    = category === 'All' || i.category === category
    const matchSearch = !search ||
      i.name.toLowerCase().includes(search.toLowerCase()) ||
      (i.barcode || '').includes(search) ||
      (i.supplier || '').toLowerCase().includes(search.toLowerCase())
    return matchCat && matchSearch
  })

  const filteredLogs = logs.filter(l => {
    const matchType  = logFilter === 'all' || l.type === logFilter
    const dateStr    = l.logged_at ? String(l.logged_at).slice(0, 10) : ''
    const matchDate  = !logDate  || dateStr === logDate
    const matchMonth = !logMonth || dateStr.slice(5, 7) === logMonth
    return matchType && matchDate && matchMonth
  })

  const handleScanResult = async ({ item, type, qty, note }) => {
    try {
      const res = await updateStock(item.id, { type, qty, note })
      if (res?.new_stock !== undefined) {
        setItems(prev => prev.map(i => i.id === item.id ? { ...i, stock: res.new_stock } : i))
        if (res.log) setLogs(prev => [res.log, ...prev])
      } else {
        setItems(prev => prev.map(i => {
          if (i.id !== item.id) return i
          return { ...i, stock: type === 'in' ? i.stock + qty : Math.max(0, i.stock - qty) }
        }))
      }
    } catch (err) {
      console.error('Failed to update stock:', err)
      alert('Failed to update stock: ' + (err.message || 'Unknown error'))
    }
  }

  const handleAddItem = async (newItem) => {
    try {
      const created = await addInventoryItem(newItem)
      if (created?.id) setItems(prev => [created, ...prev])
    } catch (err) {
      alert('Failed to add item: ' + (err.message || 'Unknown error'))
    }
  }

  const openScannerFor = (item) => { setPreselect(item); setShowScanner(true) }
  const closeScanner   = ()     => { setPreselect(null); setShowScanner(false) }

  const clearLogFilters = () => { setLogFilter('all'); setLogDate(''); setLogMonth('') }

  if (loading) return (
    <div className="flex flex-col items-center justify-center p-20 space-y-4">
      <div className="w-10 h-10 border-4 border-slate-200 border-t-sky-500 rounded-full animate-spin" />
      <p className="text-slate-400 font-medium animate-pulse text-sm">Loading inventory...</p>
    </div>
  )

  return (
    <div className="max-w-6xl space-y-5">
      {/* Header */}
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold text-slate-800">Inventory Management</h1>
          <p className="text-sm text-slate-500 mt-0.5">Track stock levels, add new products, and monitor transactions.</p>
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
          <p className="text-[11px] text-slate-400 mt-0.5">
            {items.filter(i=>i.category==='Medicine').length} medicine · {items.filter(i=>i.category==='Derma').length} derma · {items.filter(i=>i.category==='Supplies').length} supplies
          </p>
        </div>
        <div className="bg-white border border-slate-200 rounded-2xl px-5 py-4">
          <p className="text-xs text-slate-500 font-medium">Inventory Value</p>
          <p className="text-3xl font-black text-slate-800 mt-1">₱{totalValue.toLocaleString()}</p>
          <p className="text-[11px] text-slate-400 mt-0.5">Based on current stock × unit price</p>
        </div>
        <div className={`rounded-2xl px-5 py-4 border ${lowStock.length > 0 ? 'bg-amber-50 border-amber-200' : 'bg-white border-slate-200'}`}>
          <p className={`text-xs font-medium ${lowStock.length > 0 ? 'text-amber-700' : 'text-slate-500'}`}>Low Stock</p>
          <p className={`text-3xl font-black mt-1 ${lowStock.length > 0 ? 'text-amber-600' : 'text-slate-800'}`}>{lowStock.length}</p>
          <p className={`text-[11px] mt-0.5 ${lowStock.length > 0 ? 'text-amber-600' : 'text-slate-400'}`}>
            {lowStock.length > 0 ? 'Items need restocking soon' : 'All items adequately stocked'}
          </p>
        </div>
        <div className={`rounded-2xl px-5 py-4 border ${outOfStock.length > 0 ? 'bg-red-50 border-red-200' : 'bg-white border-slate-200'}`}>
          <p className={`text-xs font-medium ${outOfStock.length > 0 ? 'text-red-600' : 'text-slate-500'}`}>Out of Stock</p>
          <p className={`text-3xl font-black mt-1 ${outOfStock.length > 0 ? 'text-red-600' : 'text-slate-800'}`}>{outOfStock.length}</p>
          <p className={`text-[11px] mt-0.5 ${outOfStock.length > 0 ? 'text-red-500' : 'text-slate-400'}`}>
            {outOfStock.length > 0 ? 'Immediate restocking required' : 'No items out of stock'}
          </p>
        </div>
      </div>

      {/* Alert banners */}
      {outOfStock.length > 0 && (
        <div className="bg-red-50 border border-red-200 rounded-2xl px-5 py-4 flex items-start gap-3">
          <MdWarning className="text-red-500 text-[18px] shrink-0 mt-0.5" />
          <div>
            <p className="text-sm font-bold text-red-700">Out of Stock</p>
            <p className="text-xs text-red-600 mt-0.5">{outOfStock.map(i => i.name).join(', ')}</p>
          </div>
        </div>
      )}
      {lowStock.length > 0 && (
        <div className="bg-amber-50 border border-amber-200 rounded-2xl px-5 py-4 flex items-start gap-3">
          <MdTrendingDown className="text-amber-500 text-[18px] shrink-0 mt-0.5" />
          <div>
            <p className="text-sm font-bold text-amber-700">Low Stock Warning</p>
            <p className="text-xs text-amber-600 mt-0.5">{lowStock.map(i => `${i.name} (${i.stock} left)`).join(' · ')}</p>
          </div>
        </div>
      )}

      {/* Tabs */}
      <div className="flex gap-1 bg-white border border-slate-200 rounded-xl p-1 w-fit">
        {[
          { key: 'inventory', label: 'Stock List',      icon: MdInventory2 },
          { key: 'logs',      label: 'Transaction Log', icon: MdHistory    },
        ].map(({ key, label, icon: Icon }) => (
          <button key={key} onClick={() => setActiveTab(key)}
            className={`flex items-center gap-1.5 px-4 py-2 rounded-lg text-xs font-bold transition-all
              ${activeTab === key ? 'bg-[#0b1a2c] text-sky-400 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}>
            <Icon className="text-[14px]" /> {label}
          </button>
        ))}
      </div>

      {/* ── Stock List Tab ── */}
      {activeTab === 'inventory' && (
        <div className="bg-white border border-slate-200 rounded-2xl overflow-hidden">
          <div className="flex items-center gap-3 px-5 py-4 border-b border-slate-100 flex-wrap">
            <div className="flex items-center gap-2 bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 flex-1 min-w-52 focus-within:border-slate-300 transition-colors">
              <MdSearch className="text-slate-400 text-[15px] shrink-0" />
              <input type="text" value={search} onChange={e => setSearch(e.target.value)}
                placeholder="Search name, barcode, supplier…"
                className="text-sm text-slate-700 placeholder-slate-300 bg-transparent outline-none w-full" />
              {search && (
                <button onClick={() => setSearch('')} className="text-slate-300 hover:text-slate-500"><MdClose className="text-[13px]" /></button>
              )}
            </div>
            <div className="flex gap-1 flex-wrap">
              {CATEGORIES.map(c => (
                <button key={c} onClick={() => setCategory(c)}
                  className={`px-3 py-1.5 rounded-lg text-[11px] font-bold transition-all
                    ${category === c ? 'bg-[#0b1a2c] text-sky-400' : 'text-slate-500 hover:bg-slate-100'}`}>
                  {c}
                </button>
              ))}
            </div>
          </div>
          <div className="grid grid-cols-[28px_2.5fr_1fr_1fr_1.2fr_80px] gap-4 px-5 py-2.5 bg-slate-50 border-b border-slate-100">
            {['', 'Product', 'Category', 'Barcode', 'Stock Level', ''].map((h, i) => (
              <p key={i} className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">{h}</p>
            ))}
          </div>
          {filtered.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-14 text-center">
              <MdInventory2 className="text-slate-300 text-4xl mb-3" />
              <p className="text-sm font-bold text-slate-700">No items found</p>
            </div>
          ) : (
            <div className="divide-y divide-slate-100">
              {filtered.map(item => <InventoryRow key={item.id} item={item} onScan={openScannerFor} />)}
            </div>
          )}
        </div>
      )}

      {/* ── Transaction Log Tab ── */}
      {activeTab === 'logs' && (
        <div className="bg-white border border-slate-200 rounded-2xl overflow-hidden">
          {/* Log filters */}
          <div className="px-5 py-4 border-b border-slate-100 flex flex-wrap justify-between items-center gap-3">
            <h3 className="text-sm font-bold text-slate-800 flex items-center gap-2">
              <MdHistory className="text-[16px] text-slate-400" /> Transaction History
            </h3>
            <div className="flex flex-wrap gap-2 items-center">
              {/* Type filter */}
              <div className="flex gap-1">
                {[
                  { v: 'all', l: 'All' },
                  { v: 'in',  l: '↑ In'  },
                  { v: 'out', l: '↓ Out' },
                ].map(({ v, l }) => (
                  <button key={v} onClick={() => setLogFilter(v)}
                    className={`px-3 py-1.5 rounded-lg text-[11px] font-bold transition-all
                      ${logFilter === v ? 'bg-[#0b1a2c] text-white' : 'bg-slate-100 text-slate-500 hover:bg-slate-200'}`}>
                    {l}
                  </button>
                ))}
              </div>

              {/* Month filter */}
              <select value={logMonth} onChange={e => { setLogMonth(e.target.value); setLogDate('') }}
                className="text-xs bg-slate-50 border border-slate-200 rounded-lg px-2.5 py-1.5 focus:outline-none focus:border-sky-400 text-slate-700">
                <option value="">All Months</option>
                {MONTHS.map((m, i) => (
                  <option key={m} value={String(i + 1).padStart(2, '0')}>{m}</option>
                ))}
              </select>

              {/* Single date picker */}
              <div className="flex items-center gap-1.5 bg-slate-50 border border-slate-200 rounded-lg px-2.5 py-1.5">
                <MdCalendarToday className="text-slate-400 text-[12px] shrink-0" />
                <input type="date" value={logDate} onChange={e => { setLogDate(e.target.value); setLogMonth('') }}
                  className="text-xs bg-transparent focus:outline-none text-slate-700 w-28" />
              </div>

              {/* Clear filters */}
              {(logDate || logMonth || logFilter !== 'all') && (
                <button onClick={clearLogFilters} className="text-xs text-red-500 font-semibold hover:text-red-700 flex items-center gap-1">
                  <MdClose className="text-[12px]" /> Clear
                </button>
              )}
            </div>
          </div>

          {/* Active filter badge */}
          {(logDate || logMonth) && (
            <div className="px-5 py-2 bg-sky-50 border-b border-sky-100 flex items-center gap-2">
              <MdFilterList className="text-sky-500 text-[14px]" />
              <p className="text-xs text-sky-700 font-medium">
                {logDate ? `Showing transactions for ${logDate}` : `Showing transactions for ${MONTHS[parseInt(logMonth) - 1]}`}
                <span className="ml-2 text-slate-400">· {filteredLogs.length} record{filteredLogs.length !== 1 ? 's' : ''}</span>
              </p>
            </div>
          )}

          <div className="grid grid-cols-[1fr_80px_60px_80px_1fr_100px] gap-4 px-5 py-2.5 bg-slate-50 border-b border-slate-100">
            {['Item', 'Type', 'Qty', 'Stock', 'Note', 'Date & Time'].map((h, i) => (
              <p key={i} className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">{h}</p>
            ))}
          </div>

          {filteredLogs.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-14 text-center">
              <MdHistory className="text-slate-300 text-4xl mb-3" />
              <p className="text-sm font-bold text-slate-700">No transactions found</p>
              <p className="text-xs text-slate-400 mt-1">Try adjusting the filters above.</p>
            </div>
          ) : (
            <div className="divide-y divide-slate-100">
              {filteredLogs.map(log => (
                <div key={log.id} className="grid grid-cols-[1fr_80px_60px_80px_1fr_100px] gap-4 px-5 py-3 items-center hover:bg-slate-50/80 transition-colors">
                  <div>
                    <p className="text-sm font-semibold text-slate-800 truncate">{log.item_name}</p>
                    {log.staff_name && <p className="text-[11px] text-slate-400 truncate">{log.staff_name}</p>}
                  </div>
                  <span className={`text-[11px] font-bold border px-2 py-0.5 rounded-full w-fit
                    ${log.type === 'in' ? 'bg-emerald-50 text-emerald-700 border-emerald-200' : 'bg-red-50 text-red-600 border-red-200'}`}>
                    {log.type === 'in' ? '↑ In' : '↓ Out'}
                  </span>
                  <p className={`text-sm font-bold ${log.type === 'in' ? 'text-emerald-600' : 'text-red-600'}`}>
                    {log.type === 'in' ? '+' : '-'}{log.qty}
                  </p>
                  <p className="text-xs text-slate-500 font-mono">{log.stock_after ?? '—'}</p>
                  <p className="text-xs text-slate-500 truncate">{log.note || <span className="text-slate-300 italic">—</span>}</p>
                  <div>
                    <p className="text-[11px] font-semibold text-slate-600">
                      {log.logged_at ? new Date(log.logged_at).toLocaleDateString('en-PH', { month: 'short', day: 'numeric', year: 'numeric' }) : '—'}
                    </p>
                    <p className="text-[10px] text-slate-400">
                      {log.logged_at ? new Date(log.logged_at).toLocaleTimeString('en-PH', { hour: '2-digit', minute: '2-digit' }) : ''}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          )}

          <div className="px-5 py-3 border-t border-slate-100 bg-slate-50/50">
            <p className="text-[11px] text-slate-400 font-medium">
              Showing {filteredLogs.length} of {logs.length} transactions
            </p>
          </div>
        </div>
      )}

      {showScanner && (
        <ScannerModal onClose={closeScanner} onConfirm={handleScanResult} items={items} preselect={preselect} />
      )}
      {showAdd && (
        <AddItemModal onClose={() => setShowAdd(false)} onAdd={handleAddItem} />
      )}
    </div>
  )
}

export default Admin_Inventory