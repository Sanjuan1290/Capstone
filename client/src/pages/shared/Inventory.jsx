import { BrowserMultiFormatReader } from '@zxing/browser'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  MdAdd, MdCameraAlt, MdClose, MdDelete, MdEdit, MdInventory2,
  MdQrCodeScanner, MdRefresh, MdSave, MdSearch, MdWarningAmber,
  MdCheckCircle, MdLocationOn, MdCalendarToday,
} from 'react-icons/md'

const CATEGORIES = ['Medicine', 'Derma', 'Supplies']
const UNIT_OPTIONS = ['box', 'tube', 'bottle', 'pack', 'piece', 'sachet']
const BASE_UNITS = ['piece', 'tablet', 'capsule', 'ml', 'gram', 'sachet']

const getPackageCount = (item) => {
  const unitSize = Number(item.unit_size || 1)
  const stockBase = Number(item.stock_base ?? Number(item.stock || 0) * unitSize)
  return Math.floor(stockBase / unitSize)
}

const getStockBadge = (item) => {
  const count = getPackageCount(item)
  if (count === 0) return 'bg-red-50 text-red-600 border-red-200'
  if (count <= Number(item.threshold || 0)) return 'bg-amber-50 text-amber-700 border-amber-200'
  return 'bg-emerald-50 text-emerald-700 border-emerald-200'
}

const parseDateOnly = (value) => {
  const normalized = String(value || '').trim().slice(0, 10)
  const [year, month, day] = normalized.split('-').map(Number)
  if (!year || !month || !day) return null
  return new Date(year, month - 1, day)
}

const formatDate = (value) => {
  if (!value) return 'No expiry recorded'
  const parsed = parseDateOnly(value)
  if (!parsed) return 'No expiry recorded'
  return parsed.toLocaleDateString('en-PH', { month: 'short', day: 'numeric', year: 'numeric' })
}

const formatBatchLabel = (batch, unit) => {
  const qty = Number(batch?.quantity || 0)
  const expiry = batch?.expiration_date ? formatDate(batch.expiration_date) : 'No expiry'
  return `${qty} ${unit}${qty === 1 ? '' : 's'} - ${expiry}`
}

const getExpiryMeta = (item) => {
  if (!item.expiration_date) return { label: 'No expiry recorded', tone: 'text-slate-400' }
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  const expiry = parseDateOnly(item.expiration_date)
  if (!expiry) return { label: 'No expiry recorded', tone: 'text-slate-400' }
  expiry.setHours(0, 0, 0, 0)
  const diffDays = Math.round((expiry - today) / 86400000)
  if (diffDays < 0) return { label: `Expired ${Math.abs(diffDays)} day${Math.abs(diffDays) === 1 ? '' : 's'} ago`, tone: 'text-red-600' }
  if (diffDays <= 30) return { label: `Expires in ${diffDays} day${diffDays === 1 ? '' : 's'}`, tone: 'text-amber-600' }
  return { label: `Expires ${formatDate(item.expiration_date)}`, tone: 'text-slate-500' }
}

const CameraScanner = ({ onDetected, onClose }) => {
  const videoRef = useRef(null)
  const readerRef = useRef(null)
  const controlsRef = useRef(null)
  const mountedRef = useRef(true)
  const [status, setStatus] = useState('starting')
  const [errorMsg, setErrorMsg] = useState('')

  useEffect(() => {
    mountedRef.current = true

    const stop = () => {
      controlsRef.current?.stop?.()
      controlsRef.current = null
      readerRef.current?.reset?.()
      if (videoRef.current) {
        videoRef.current.srcObject = null
      }
    }

    const init = async () => {
      if (!navigator.mediaDevices?.getUserMedia) {
        setStatus('error')
        setErrorMsg('Camera access is not supported in this browser.')
        return
      }

      try {
        readerRef.current = new BrowserMultiFormatReader()
        controlsRef.current = await readerRef.current.decodeFromConstraints(
          {
            video: {
              facingMode: { ideal: 'environment' },
              width: { ideal: 1280 },
              height: { ideal: 720 },
            },
          },
          videoRef.current,
          (result) => {
            if (!mountedRef.current || !result) return

            const code = result.getText()?.trim()
            if (!code) return

            setStatus('detected')
            stop()
            window.setTimeout(() => onDetected(code), 250)
          }
        )

        if (mountedRef.current) {
          setStatus('scanning')
        }
      } catch (err) {
        if (!mountedRef.current) return

        setStatus('error')
        const message = err?.name === 'NotAllowedError'
          ? 'Camera permission was denied.'
          : err?.name === 'NotFoundError'
            ? 'No camera device was found.'
            : err?.message || 'Scanner failed to start.'
        setErrorMsg(message)
      }
    }

    init()
    return () => {
      mountedRef.current = false
      stop()
    }
  }, [onDetected])

  const statusConfig = {
    starting: { color: '#64748b', text: 'Starting camera...', pulse: false },
    scanning: { color: '#0ea5e9', text: 'Scanning - hold barcode steady', pulse: true },
    detected: { color: '#22c55e', text: 'Barcode detected!', pulse: false },
    error: { color: '#ef4444', text: errorMsg, pulse: false },
  }
  const cfg = statusConfig[status]

  return (
    <div
      className="fixed inset-0 z-[70] flex items-center justify-center bg-black/70 px-4"
      onClick={onClose}
    >
      <div
        className="w-full max-w-md rounded-3xl bg-white overflow-hidden shadow-2xl"
        onClick={e => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100">
          <div>
            <p className="text-sm font-bold text-slate-800 flex items-center gap-2">
              <MdCameraAlt className="text-sky-500" /> Camera Barcode Scanner
            </p>
            <p className="text-xs text-slate-400">Point camera at barcode</p>
          </div>
          <button
            onClick={onClose}
            className="w-8 h-8 rounded-xl hover:bg-slate-100 text-slate-400 flex items-center justify-center"
          >
            <MdClose />
          </button>
        </div>

        <div className="bg-black aspect-[4/3] relative overflow-hidden">
          {status === 'error' ? (
            <div className="h-full flex items-center justify-center text-center text-sm text-slate-300 px-6">
              {errorMsg}
            </div>
          ) : (
            <>
              <video
                ref={videoRef}
                className="w-full h-full object-cover"
                muted
                playsInline
                autoPlay
              />

              {['top-6 left-6', 'top-6 right-6', 'bottom-6 left-6', 'bottom-6 right-6'].map((pos, i) => (
                <div
                  key={i}
                  className={`absolute ${pos} w-8 h-8`}
                  style={{
                    borderColor: cfg.color,
                    borderStyle: 'solid',
                    borderWidth: 0,
                    ...(i === 0 && { borderTopWidth: 3, borderLeftWidth: 3, borderRadius: '4px 0 0 0' }),
                    ...(i === 1 && { borderTopWidth: 3, borderRightWidth: 3, borderRadius: '0 4px 0 0' }),
                    ...(i === 2 && { borderBottomWidth: 3, borderLeftWidth: 3, borderRadius: '0 0 0 4px' }),
                    ...(i === 3 && { borderBottomWidth: 3, borderRightWidth: 3, borderRadius: '0 0 4px 0' }),
                    transition: 'border-color 0.3s',
                  }}
                />
              ))}

              {status === 'scanning' && (
                <div
                  className="absolute left-8 right-8"
                  style={{
                    height: 2,
                    background: cfg.color,
                    boxShadow: `0 0 6px ${cfg.color}`,
                    animation: 'scanline 2s ease-in-out infinite',
                    top: '50%',
                  }}
                />
              )}

              {status === 'detected' && (
                <div
                  className="absolute inset-0 flex items-center justify-center"
                  style={{ background: 'rgba(34,197,94,0.25)' }}
                >
                  <div className="bg-white rounded-full w-14 h-14 flex items-center justify-center shadow-lg">
                    <svg width="28" height="28" viewBox="0 0 24 24" fill="none">
                      <path d="M5 13l4 4L19 7" stroke="#22c55e" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
                    </svg>
                  </div>
                </div>
              )}

              {status === 'starting' && (
                <div className="absolute inset-0 flex items-center justify-center bg-black/40">
                  <div
                    className="w-8 h-8 rounded-full border-2 border-white/20"
                    style={{ borderTopColor: '#fff', animation: 'spin 0.8s linear infinite' }}
                  />
                </div>
              )}
            </>
          )}
        </div>

        <div className="px-5 py-3 flex items-center gap-2">
          <div className="relative flex items-center justify-center w-3 h-3 flex-shrink-0">
            <div
              className="w-2 h-2 rounded-full"
              style={{ background: cfg.color }}
            />
            {cfg.pulse && (
              <div
                className="absolute w-3 h-3 rounded-full"
                style={{ background: cfg.color, opacity: 0.4, animation: 'ping 1.2s ease-out infinite' }}
              />
            )}
          </div>
          <span className="text-xs text-slate-500">{cfg.text}</span>
        </div>

        <style>{`
          @keyframes scanline {
            0%   { top: 25%; }
            50%  { top: 75%; }
            100% { top: 25%; }
          }
          @keyframes spin {
            to { transform: rotate(360deg); }
          }
          @keyframes ping {
            0%   { transform: scale(1); opacity: 0.4; }
            100% { transform: scale(2.5); opacity: 0; }
          }
        `}</style>
      </div>
    </div>
  )
}

const ItemFormModal = ({ title, initialItem, onClose, onSubmit }) => {
  const isEditing = Boolean(initialItem?.id)
  const [form, setForm] = useState({
    barcode: initialItem?.barcode || '',
    name: initialItem?.name || '',
    category: initialItem?.category || 'Medicine',
    unit: initialItem?.unit || 'box',
    base_unit: initialItem?.base_unit || 'piece',
    unit_size: String(initialItem?.unit_size ?? 1),
    stock: String(initialItem?.stock ?? 0),
    threshold: String(initialItem?.threshold ?? 5),
    price: String(initialItem?.price ?? 0),
    supplier: initialItem?.supplier || '',
    expiration_date: initialItem?.expiration_date ? String(initialItem.expiration_date).slice(0, 10) : '',
    storage_location: initialItem?.storage_location || '',
  })

  const update = (key) => (e) => setForm(prev => ({ ...prev, [key]: e.target.value }))

  const handleSubmit = async () => {
    if (!form.name.trim()) return
    await onSubmit({
      ...form,
      unit_size: Math.max(1, parseFloat(form.unit_size) || 1),
      stock: Math.max(0, parseFloat(form.stock) || 0),
      threshold: Math.max(0, parseFloat(form.threshold) || 0),
      price: Math.max(0, parseFloat(form.price) || 0),
    })
    onClose()
  }

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/50 px-4" onClick={onClose}>
      <div className="w-full max-w-lg rounded-3xl bg-white shadow-2xl overflow-hidden" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100">
          <div>
            <p className="text-sm font-bold text-slate-800">{title}</p>
            <p className="text-xs text-slate-400">
              {isEditing
                ? 'Product details only. Stock and expiry are managed per batch.'
                : 'Set opening stock and its batch expiry so inventory stays accurate.'}
            </p>
          </div>
          <button onClick={onClose} className="w-8 h-8 rounded-xl hover:bg-slate-100 text-slate-400 flex items-center justify-center"><MdClose /></button>
        </div>
        <div className="p-6 grid md:grid-cols-2 gap-4 max-h-[70vh] overflow-y-auto">
          <Field label="Barcode"><input value={form.barcode} onChange={update('barcode')} className={inputClass} /></Field>
          <Field label="Product Name"><input value={form.name} onChange={update('name')} className={inputClass} /></Field>
          <Field label="Category"><select value={form.category} onChange={update('category')} className={inputClass}>{CATEGORIES.map(option => <option key={option}>{option}</option>)}</select></Field>
          <Field label="Selling Unit"><select value={form.unit} onChange={update('unit')} className={inputClass}>{UNIT_OPTIONS.map(option => <option key={option}>{option}</option>)}</select></Field>
          <Field label="Base Quantity Type"><select value={form.base_unit} onChange={update('base_unit')} className={inputClass}>{BASE_UNITS.map(option => <option key={option}>{option}</option>)}</select></Field>
          <Field label="Quantity per Unit"><input type="number" min="1" value={form.unit_size} onChange={update('unit_size')} className={inputClass} /></Field>
          {!isEditing && <Field label="Opening Stock"><input type="number" min="0" value={form.stock} onChange={update('stock')} className={inputClass} /></Field>}
          <Field label="Low Stock Threshold"><input type="number" min="0" value={form.threshold} onChange={update('threshold')} className={inputClass} /></Field>
          <Field label="Unit Price"><input type="number" min="0" value={form.price} onChange={update('price')} className={inputClass} /></Field>
          <Field label="Supplier"><input value={form.supplier} onChange={update('supplier')} className={inputClass} /></Field>
          {!isEditing && <Field label="Opening Batch Expiry"><input type="date" value={form.expiration_date} onChange={update('expiration_date')} className={inputClass} /></Field>}
          <Field label="Storage Location"><input value={form.storage_location} onChange={update('storage_location')} className={inputClass} placeholder="e.g. Shelf A2 / Cold storage" /></Field>
          {isEditing && (
            <div className="md:col-span-2 rounded-2xl border border-sky-100 bg-sky-50 px-4 py-3 text-sm text-sky-700">
              Existing stock keeps its own batch expiry dates. Use <strong>Update Stock</strong> when a new delivery arrives.
            </div>
          )}
        </div>
        <div className="px-6 pb-6 flex gap-3">
          <button onClick={onClose} className="flex-1 rounded-2xl border border-slate-200 py-3 text-sm font-semibold text-slate-600">Cancel</button>
          <button onClick={handleSubmit} className="flex-1 rounded-2xl bg-[#0b1a2c] py-3 text-sm font-semibold text-white flex items-center justify-center gap-2"><MdSave /> Save</button>
        </div>
      </div>
    </div>
  )
}

const StockModal = ({ item, onClose, onSubmit, onOpenScanner }) => {
  const [type, setType] = useState('in')
  const [qty, setQty] = useState(1)
  const [note, setNote] = useState('')
  const [expirationDate, setExpirationDate] = useState('')

  const available = getPackageCount(item)

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/50 px-4" onClick={onClose}>
      <div className="w-full max-w-md rounded-3xl bg-white shadow-2xl overflow-hidden" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100">
          <div>
            <p className="text-sm font-bold text-slate-800">{item.name}</p>
            <p className="text-xs text-slate-400">Available: {available} {item.unit}s - {item.unit_size || 1} {item.base_unit || item.unit} per {item.unit}</p>
          </div>
          <button onClick={onClose} className="w-8 h-8 rounded-xl hover:bg-slate-100 text-slate-400 flex items-center justify-center"><MdClose /></button>
        </div>
        <div className="p-6 space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <button onClick={() => setType('in')} className={`rounded-2xl border py-3 text-sm font-semibold ${type === 'in' ? 'bg-emerald-50 border-emerald-300 text-emerald-700' : 'border-slate-200 text-slate-600'}`}>Stock In</button>
            <button onClick={() => setType('out')} className={`rounded-2xl border py-3 text-sm font-semibold ${type === 'out' ? 'bg-red-50 border-red-300 text-red-600' : 'border-slate-200 text-slate-600'}`}>Stock Out</button>
          </div>

          <Field label={`Quantity (${item.unit}s)`}>
            <input type="number" min="1" value={qty} onChange={e => setQty(Math.max(1, parseInt(e.target.value || '1', 10)))} className={inputClass} />
          </Field>

          {type === 'in' && (
            <Field label="Batch Expiration Date">
              <input type="date" value={expirationDate} onChange={e => setExpirationDate(e.target.value)} className={inputClass} />
            </Field>
          )}

          <Field label="Note">
            <input value={note} onChange={e => setNote(e.target.value)} className={inputClass} placeholder="Optional note" />
          </Field>

          {type === 'out' && (
            <div className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-700">
              Stock-out follows FEFO, so the batch with the nearest expiration is deducted first.
            </div>
          )}

          {Array.isArray(item.batches) && item.batches.length > 0 && (
            <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
              <p className="text-xs font-bold uppercase tracking-widest text-slate-400">Active Batches</p>
              <div className="mt-3 space-y-2">
                {item.batches.map(batch => (
                  <div key={batch.id} className="flex items-center justify-between gap-3 rounded-2xl bg-white px-3 py-2 text-sm text-slate-600">
                    <span>Lot #{batch.id}</span>
                    <span>{formatBatchLabel(batch, item.unit)}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          <button onClick={onOpenScanner} className="w-full rounded-2xl border border-sky-200 bg-sky-50 py-3 text-sm font-semibold text-sky-700 flex items-center justify-center gap-2">
            <MdQrCodeScanner className="text-[18px]" /> Open Camera Scanner
          </button>
        </div>
        <div className="px-6 pb-6">
          <button
            onClick={() => onSubmit({ type, qty, note, expiration_date: type === 'in' ? expirationDate : '' })}
            disabled={type === 'out' && qty > available}
            className="w-full rounded-2xl bg-[#0b1a2c] py-3 text-sm font-semibold text-white disabled:opacity-40"
          >
            Save Stock Update
          </button>
        </div>
      </div>
    </div>
  )
}

const Field = ({ label, children }) => (
  <label className="space-y-1.5">
    <span className="text-xs font-bold uppercase tracking-widest text-slate-400">{label}</span>
    {children}
  </label>
)

const inputClass = 'w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-700 outline-none focus:border-sky-400'

const Inventory = ({ services }) => {
  const { getInventory, updateStock, addInventoryItem, updateInventoryItem, deleteInventoryItem } = services
  const [items, setItems] = useState([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [category, setCategory] = useState('All')
  const [showAdd, setShowAdd] = useState(false)
  const [editItem, setEditItem] = useState(null)
  const [stockItem, setStockItem] = useState(null)
  const [scannerOpen, setScannerOpen] = useState(false)
  const [feedback, setFeedback] = useState(null)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const data = await getInventory()
      setItems(Array.isArray(data) ? data : data?.items || [])
    } finally {
      setLoading(false)
    }
  }, [getInventory])

  useEffect(() => { load() }, [load])

  useEffect(() => {
    if (!feedback) return undefined
    const timer = window.setTimeout(() => setFeedback(null), 3500)
    return () => window.clearTimeout(timer)
  }, [feedback])

  const filtered = useMemo(() => items.filter(item => {
    const matchesCategory = category === 'All' || item.category === category
    const needle = search.toLowerCase()
    const matchesSearch = !needle ||
      item.name?.toLowerCase().includes(needle) ||
      item.barcode?.toLowerCase().includes(needle) ||
      item.supplier?.toLowerCase().includes(needle)
    return matchesCategory && matchesSearch
  }), [items, category, search])

  const handleAdd = async (payload) => {
    try {
      const created = await addInventoryItem(payload)
      setItems(prev => [...prev, created])
      setFeedback({ type: 'success', message: `${created.name} was added to inventory.` })
    } catch (err) {
      setFeedback({ type: 'error', message: err.message || 'Failed to add inventory item.' })
      throw err
    }
  }

  const handleEdit = async (payload) => {
    try {
      const updated = await updateInventoryItem(editItem.id, payload)
      setItems(prev => prev.map(item => item.id === editItem.id ? { ...item, ...updated } : item))
      setFeedback({ type: 'success', message: `${updated.name} was updated.` })
    } catch (err) {
      setFeedback({ type: 'error', message: err.message || 'Failed to update inventory item.' })
      throw err
    }
  }

  const handleDelete = async (item) => {
    if (!window.confirm(`Delete ${item.name}?`)) return
    await deleteInventoryItem(item.id)
    setItems(prev => prev.filter(entry => entry.id !== item.id))
    setFeedback({ type: 'success', message: `${item.name} was removed from inventory.` })
  }

  const handleStockUpdate = async ({ type, qty, note, expiration_date }) => {
    try {
      await updateStock(stockItem.id, { type, qty, note, expiration_date })
      await load()
      setFeedback({ type: 'success', message: `${stockItem.name} stock was updated successfully.` })
      setStockItem(null)
    } catch (err) {
      setFeedback({ type: 'error', message: err.message || 'Failed to update stock.' })
    }
  }

  const handleScannerDetected = (code) => {
    setScannerOpen(false)
    const normalizedCode = String(code || '').trim()
    const found = items.find(item => String(item.barcode || '').trim() === normalizedCode)
    if (found) {
      setStockItem(found)
    } else {
      alert(`Barcode ${normalizedCode} was read, but no inventory item matches it yet.`)
    }
  }

  if (loading) {
    return <div className="p-12 text-center text-sm text-slate-400">Loading inventory...</div>
  }

  const summary = {
    total: items.length,
    low: items.filter(item => {
      const count = getPackageCount(item)
      return count > 0 && count <= Number(item.threshold || 0)
    }).length,
    out: items.filter(item => getPackageCount(item) === 0).length,
    expiring: items.filter(item => {
      if (!item.expiration_date) return false
      const expiry = parseDateOnly(item.expiration_date)
      if (!expiry) return false
      const today = new Date()
      expiry.setHours(0, 0, 0, 0)
      today.setHours(0, 0, 0, 0)
      return expiry >= today && expiry <= new Date(today.getTime() + 30 * 86400000)
    }).length,
  }

  return (
    <div className="max-w-6xl space-y-6">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold text-slate-800">Inventory</h1>
          <p className="text-sm text-slate-500 mt-1">Package-aware inventory with barcode scanning, batch expiry tracking, and FEFO deductions.</p>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={load} className="w-10 h-10 rounded-xl border border-slate-200 text-slate-500 hover:bg-slate-50 flex items-center justify-center"><MdRefresh className="text-[18px]" /></button>
          <button onClick={() => setScannerOpen(true)} className="rounded-2xl border border-sky-200 bg-sky-50 px-4 py-3 text-sm font-semibold text-sky-700 flex items-center gap-2"><MdQrCodeScanner /> Scan Barcode</button>
          <button onClick={() => setShowAdd(true)} className="rounded-2xl bg-[#0b1a2c] px-4 py-3 text-sm font-semibold text-white flex items-center gap-2"><MdAdd /> Add Item</button>
        </div>
      </div>

      {feedback && (
        <div className={`flex items-start gap-3 rounded-2xl border px-4 py-3 text-sm ${
          feedback.type === 'error'
            ? 'border-red-200 bg-red-50 text-red-700'
            : 'border-emerald-200 bg-emerald-50 text-emerald-700'
        }`}>
          {feedback.type === 'error' ? <MdWarningAmber className="mt-0.5 text-[18px]" /> : <MdCheckCircle className="mt-0.5 text-[18px]" />}
          <p>{feedback.message}</p>
        </div>
      )}

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {[
          { label: 'Tracked Items', value: summary.total, tone: 'text-slate-800' },
          { label: 'Low Stock', value: summary.low, tone: 'text-amber-600' },
          { label: 'Out of Stock', value: summary.out, tone: 'text-red-600' },
          { label: 'Expiring in 30 Days', value: summary.expiring, tone: 'text-violet-600' },
        ].map((card) => (
          <div key={card.label} className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
            <p className="text-xs font-bold uppercase tracking-widest text-slate-400">{card.label}</p>
            <p className={`mt-3 text-3xl font-black ${card.tone}`}>{card.value}</p>
          </div>
        ))}
      </div>

      <div className="grid md:grid-cols-[1fr_auto] gap-3">
        <div className="flex items-center gap-2 rounded-2xl border border-slate-200 bg-white px-4 py-3">
          <MdSearch className="text-slate-400 text-[18px]" />
          <input value={search} onChange={e => setSearch(e.target.value)} className="w-full bg-transparent text-sm outline-none" placeholder="Search item, barcode, or supplier" />
        </div>
        <div className="flex gap-2 overflow-x-auto">
          {['All', ...CATEGORIES].map(option => (
            <button key={option} onClick={() => setCategory(option)} className={`rounded-2xl px-4 py-3 text-sm font-semibold ${category === option ? 'bg-[#0b1a2c] text-white' : 'bg-white border border-slate-200 text-slate-600'}`}>
              {option}
            </button>
          ))}
        </div>
      </div>

      <div className="grid gap-4">
        {filtered.map(item => (
          <div key={item.id} className="bg-white border border-slate-200 rounded-3xl p-5 shadow-sm">
            <div className="flex items-start justify-between gap-4 flex-wrap">
              <div className="space-y-2">
                <div className="flex items-center gap-2 flex-wrap">
                  <p className="text-lg font-bold text-slate-800">{item.name}</p>
                  <span className={`text-xs font-bold border px-2 py-1 rounded-full ${getStockBadge(item)}`}>{getPackageCount(item) === 0 ? 'Out' : getPackageCount(item) <= Number(item.threshold || 0) ? 'Low' : 'OK'}</span>
                </div>
                <p className="text-sm text-slate-500">{item.category} - {item.barcode || 'No barcode'} - {item.supplier || 'No supplier'}</p>
                <p className="text-sm text-slate-600">
                  <strong>{getPackageCount(item)}</strong> {item.unit}s in stock - {Number(item.unit_size || 1)} {item.base_unit || item.unit} per {item.unit}
                </p>
                <p className="text-xs text-slate-400">Low stock threshold: {item.threshold} {item.unit}s - PHP {Number(item.price || 0).toFixed(2)} per {item.unit}</p>
                <div className="flex flex-wrap gap-3 pt-1 text-xs">
                  <span className="inline-flex items-center gap-1 text-slate-500">
                    <MdLocationOn className="text-[14px]" /> {item.storage_location || 'No location assigned'}
                  </span>
                  <span className={`inline-flex items-center gap-1 ${getExpiryMeta(item).tone}`}>
                    <MdCalendarToday className="text-[14px]" /> {getExpiryMeta(item).label}
                  </span>
                </div>
                {Array.isArray(item.batches) && item.batches.length > 0 && (
                  <div className="pt-3">
                    <p className="text-xs font-bold uppercase tracking-widest text-slate-400">Batches</p>
                    <div className="mt-2 flex flex-wrap gap-2">
                      {item.batches.slice(0, 4).map(batch => (
                        <span key={batch.id} className="rounded-full border border-slate-200 bg-slate-50 px-3 py-1 text-xs text-slate-600">
                          Lot #{batch.id} - {formatBatchLabel(batch, item.unit)}
                        </span>
                      ))}
                      {item.batches.length > 4 && (
                        <span className="rounded-full border border-slate-200 bg-slate-50 px-3 py-1 text-xs text-slate-500">
                          +{item.batches.length - 4} more batches
                        </span>
                      )}
                    </div>
                  </div>
                )}
              </div>
              <div className="flex items-center gap-2">
                <button onClick={() => setStockItem(item)} className="rounded-2xl border border-slate-200 px-4 py-3 text-sm font-semibold text-slate-600 hover:bg-slate-50 flex items-center gap-2"><MdInventory2 /> Update Stock</button>
                <button onClick={() => setEditItem(item)} className="w-11 h-11 rounded-2xl border border-slate-200 text-slate-500 hover:bg-slate-50 flex items-center justify-center"><MdEdit className="text-[18px]" /></button>
                <button onClick={() => handleDelete(item)} className="w-11 h-11 rounded-2xl border border-red-200 text-red-500 hover:bg-red-50 flex items-center justify-center"><MdDelete className="text-[18px]" /></button>
              </div>
            </div>
          </div>
        ))}
      </div>

      {filtered.length === 0 && (
        <div className="bg-white border border-slate-200 rounded-3xl p-12 text-center text-sm text-slate-400">No inventory items match your filters.</div>
      )}

      {showAdd && <ItemFormModal title="Add Inventory Item" onClose={() => setShowAdd(false)} onSubmit={handleAdd} />}
      {editItem && <ItemFormModal title="Edit Inventory Item" initialItem={editItem} onClose={() => setEditItem(null)} onSubmit={handleEdit} />}
      {stockItem && <StockModal item={stockItem} onClose={() => setStockItem(null)} onSubmit={handleStockUpdate} onOpenScanner={() => setScannerOpen(true)} />}
      {scannerOpen && <CameraScanner onDetected={handleScannerDetected} onClose={() => setScannerOpen(false)} />}
    </div>
  )
}

export default Inventory
