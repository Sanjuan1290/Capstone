// client/src/pages/shared/Inventory.jsx
// Single shared component used by both /staff/inventory and /admin/inventory.
// Pass in the correct service functions as the `services` prop.
// Camera barcode scanner uses the BarcodeDetector Web API (Chrome/Edge 83+).

import { useEffect, useState, useRef, useCallback } from 'react'
import {
  MdSearch, MdClose, MdQrCodeScanner, MdAdd, MdInventory2,
  MdHistory, MdWarning, MdTrendingDown, MdMedication,
  MdScience, MdBuild, MdArrowUpward, MdArrowDownward,
  MdCalendarToday, MdEdit, MdDelete, MdRefresh, MdCamera,
  MdFilterList,
} from 'react-icons/md'

const CATEGORIES = ['All', 'Medicine', 'Derma', 'Supplies']
const MONTHS = [
  'January','February','March','April','May','June',
  'July','August','September','October','November','December',
]

const getStockStatus = (stock, threshold) => {
  const pct = threshold > 0 ? Math.round((stock / (threshold * 3)) * 100) : 100
  if (stock === 0)        return { label:'Out', bg:'bg-red-50',    color:'text-red-600',    border:'border-red-200',    bar:'bg-red-400',    pct:0 }
  if (stock <= threshold) return { label:'Low', bg:'bg-amber-50',  color:'text-amber-600',  border:'border-amber-200',  bar:'bg-amber-400',  pct:Math.min(pct,30) }
  return                         { label:'OK',  bg:'bg-emerald-50',color:'text-emerald-600',border:'border-emerald-200',bar:'bg-emerald-400',pct:Math.min(pct,100) }
}

const getCatStyle = (cat) => {
  if (cat === 'Medicine') return { bg:'bg-sky-50',    text:'text-sky-600',    border:'border-sky-200',    icon:MdMedication }
  if (cat === 'Derma')    return { bg:'bg-violet-50', text:'text-violet-600', border:'border-violet-200', icon:MdScience    }
  return                         { bg:'bg-slate-100', text:'text-slate-500',  border:'border-slate-200',  icon:MdBuild      }
}

// ─── Camera Barcode Scanner ───────────────────────────────────────────────────
// Uses the BarcodeDetector Web API — supported in Chrome 83+, Edge 83+.
// Falls back to a manual text entry message for unsupported browsers.
const CameraScanner = ({ onDetected, onClose }) => {
  const videoRef    = useRef(null)
  const streamRef   = useRef(null)
  const detectorRef = useRef(null)
  const rafRef      = useRef(null)
  const [status, setStatus] = useState('starting') // starting | scanning | detected | error
  const [errorMsg, setErrorMsg] = useState('')
  const [detectedCode, setDetectedCode] = useState('')

  const stopStream = useCallback(() => {
    if (rafRef.current)    cancelAnimationFrame(rafRef.current)
    if (streamRef.current) streamRef.current.getTracks().forEach(t => t.stop())
  }, [])

  // Recursive scan loop — runs on every animation frame
  const scan = useCallback(() => {
    if (!videoRef.current || !detectorRef.current) return
    detectorRef.current.detect(videoRef.current)
      .then(barcodes => {
        if (barcodes.length > 0) {
          const code = barcodes[0].rawValue
          setDetectedCode(code)
          setStatus('detected')
          stopStream()
          // Brief pause so user sees the "detected" feedback before closing
          setTimeout(() => onDetected(code), 600)
        } else {
          rafRef.current = requestAnimationFrame(scan)
        }
      })
      .catch(() => { rafRef.current = requestAnimationFrame(scan) })
  }, [onDetected, stopStream])

  useEffect(() => {
    const init = async () => {
      // 1. Check API support
      if (!('BarcodeDetector' in window)) {
        setStatus('error')
        setErrorMsg(
          'Barcode Detection API not supported.\n' +
          'Please use Chrome 83+ or Edge 83+.\n\n' +
          'You can still type the barcode manually.'
        )
        return
      }

      try {
        // 2. Create detector with all supported formats
        const formats = await window.BarcodeDetector.getSupportedFormats()
        detectorRef.current = new window.BarcodeDetector({ formats })

        // 3. Request camera — prefer rear camera on mobile, environment on laptop
        const stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: { ideal: 'environment' }, width: { ideal: 1280 }, height: { ideal: 720 } }
        })
        streamRef.current = stream

        if (videoRef.current) {
          videoRef.current.srcObject = stream
          // Wait for video to be ready before scanning
          videoRef.current.onloadedmetadata = () => {
            videoRef.current.play().then(() => {
              setStatus('scanning')
              rafRef.current = requestAnimationFrame(scan)
            })
          }
        }
      } catch (err) {
        setStatus('error')
        if (err.name === 'NotAllowedError') {
          setErrorMsg('Camera permission denied.\nPlease allow camera access in your browser settings and try again.')
        } else if (err.name === 'NotFoundError') {
          setErrorMsg('No camera found on this device.')
        } else {
          setErrorMsg(`Camera error: ${err.message}`)
        }
      }
    }

    init()
    return stopStream // cleanup on unmount
  }, [scan, stopStream])

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/75 backdrop-blur-sm px-4"
      onClick={onClose}>
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm overflow-hidden"
        onClick={e => e.stopPropagation()}>

        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100">
          <div>
            <p className="text-sm font-bold text-slate-800 flex items-center gap-2">
              <MdCamera className="text-sky-500" /> Camera Barcode Scanner
            </p>
            <p className="text-xs text-slate-400 mt-0.5">Point camera at a barcode</p>
          </div>
          <button onClick={onClose} className="w-8 h-8 flex items-center justify-center rounded-xl hover:bg-slate-100 text-slate-400">
            <MdClose className="text-[18px]" />
          </button>
        </div>

        {/* Video / overlay */}
        <div className="relative bg-black" style={{ aspectRatio: '4/3' }}>
          <video ref={videoRef} muted playsInline autoPlay
            className="w-full h-full object-cover" />

          {/* Scan frame overlay */}
          {status === 'scanning' && (
            <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
              <div className="relative w-52 h-36">
                {/* Corner brackets */}
                <div className="absolute top-0 left-0 w-6 h-6 border-t-[3px] border-l-[3px] border-emerald-400 rounded-tl" />
                <div className="absolute top-0 right-0 w-6 h-6 border-t-[3px] border-r-[3px] border-emerald-400 rounded-tr" />
                <div className="absolute bottom-0 left-0 w-6 h-6 border-b-[3px] border-l-[3px] border-emerald-400 rounded-bl" />
                <div className="absolute bottom-0 right-0 w-6 h-6 border-b-[3px] border-r-[3px] border-emerald-400 rounded-br" />
                {/* Animated scan line */}
                <div className="absolute left-1 right-1 h-0.5 bg-emerald-400/80 shadow-lg shadow-emerald-400/50"
                  style={{ animation: 'scanline 2s ease-in-out infinite', top: '50%' }} />
              </div>
            </div>
          )}

          {/* Detected flash */}
          {status === 'detected' && (
            <div className="absolute inset-0 flex flex-col items-center justify-center bg-emerald-500/90">
              <div className="text-5xl mb-2">✓</div>
              <p className="text-white font-bold text-sm">Barcode Detected!</p>
              <p className="text-white/80 font-mono text-xs mt-1 px-4 text-center break-all">{detectedCode}</p>
            </div>
          )}

          {/* Error state */}
          {status === 'error' && (
            <div className="absolute inset-0 flex items-center justify-center bg-slate-900/95 px-6">
              <p className="text-slate-300 text-xs text-center whitespace-pre-line leading-relaxed">{errorMsg}</p>
            </div>
          )}

          {/* Starting spinner */}
          {status === 'starting' && (
            <div className="absolute inset-0 flex items-center justify-center bg-slate-900">
              <div className="w-8 h-8 border-2 border-white/20 border-t-white rounded-full animate-spin" />
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-5 py-3 text-center">
          {status === 'scanning' && <p className="text-xs text-slate-500">Hold steady — scanning automatically…</p>}
          {status === 'starting' && <p className="text-xs text-slate-500">Starting camera…</p>}
          {status === 'error'    && <p className="text-xs text-slate-500">Use manual text entry below instead.</p>}
          <button onClick={onClose} className="mt-2 text-xs text-slate-400 hover:text-slate-600 underline">
            Cancel
          </button>
        </div>
      </div>

      {/* Scanline animation keyframes */}
      <style>{`
        @keyframes scanline {
          0%   { transform: translateY(-40px); opacity: 0; }
          10%  { opacity: 1; }
          90%  { opacity: 1; }
          100% { transform: translateY(40px); opacity: 0; }
        }
      `}</style>
    </div>
  )
}

// ─── Stock Update Modal ───────────────────────────────────────────────────────
const ScannerModal = ({ onClose, onConfirm, items, preselect }) => {
  const [barcode,    setBarcode]    = useState(preselect?.barcode || '')
  const [type,       setType]       = useState('in')
  const [qty,        setQty]        = useState(1)
  const [note,       setNote]       = useState('')
  const [success,    setSuccess]    = useState(false)
  const [showCam,    setShowCam]    = useState(false)

  const found = preselect || items.find(i =>
    (i.barcode && i.barcode === barcode) ||
    i.name.toLowerCase() === barcode.toLowerCase()
  )

  const handleConfirm = async () => {
    if (!found) return
    setSuccess(true)
    await onConfirm({ item: found, type, qty, note })
    setTimeout(() => { setSuccess(false); onClose() }, 800)
  }

  return (
    <>
      {showCam && (
        <CameraScanner
          onDetected={code => { setBarcode(code); setShowCam(false) }}
          onClose={() => setShowCam(false)}
        />
      )}

      <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm px-4"
        onClick={onClose}>
        <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md"
          onClick={e => e.stopPropagation()}>

          <div className="flex items-center justify-between px-6 py-5 border-b border-slate-100">
            <div>
              <p className="text-sm font-bold text-slate-800">Update Stock</p>
              <p className="text-xs text-slate-500 mt-0.5">Scan barcode or enter item name / barcode</p>
            </div>
            <button onClick={onClose} className="w-8 h-8 flex items-center justify-center rounded-xl hover:bg-slate-100 text-slate-400">
              <MdClose className="text-[18px]" />
            </button>
          </div>

          <div className="px-6 py-5 space-y-4">
            {/* Input row with camera button */}
            {!preselect && (
              <div>
                <label className="text-xs font-bold text-slate-500 uppercase tracking-widest mb-1.5 block">
                  Barcode / Item Name
                </label>
                <div className="flex gap-2">
                  <input
                    type="text"
                    value={barcode}
                    onChange={e => setBarcode(e.target.value)}
                    placeholder="Type or scan barcode…"
                    autoFocus
                    className="flex-1 text-sm text-slate-700 placeholder-slate-300 bg-slate-50 border-2 border-slate-200
                      rounded-xl px-3 py-2.5 focus:outline-none focus:border-sky-400 transition-colors"
                  />
                  {/* Camera scan button */}
                  <button
                    onClick={() => setShowCam(true)}
                    title="Open camera scanner"
                    className="w-11 h-11 flex items-center justify-center rounded-xl border-2 border-slate-200
                      text-slate-500 hover:border-sky-400 hover:text-sky-600 hover:bg-sky-50 transition-all shrink-0">
                    <MdQrCodeScanner className="text-[20px]" />
                  </button>
                </div>
                {barcode && !found && (
                  <p className="text-xs text-amber-600 mt-1.5 flex items-center gap-1">
                    <MdWarning className="text-[12px]" /> No matching item found
                  </p>
                )}
              </div>
            )}

            {found && (
              <>
                <div className="bg-sky-50 border border-sky-200 rounded-xl px-4 py-3">
                  <p className="text-sm font-bold text-sky-800">{found.name}</p>
                  <p className="text-xs text-sky-600 mt-0.5">
                    {found.category} · {found.barcode || '—'} · Current stock: <strong>{found.stock} {found.unit}s</strong>
                  </p>
                </div>

                <div>
                  <label className="text-xs font-bold text-slate-500 uppercase tracking-widest mb-1.5 block">Transaction Type</label>
                  <div className="grid grid-cols-2 gap-2">
                    {[
                      { v:'in',  l:'Stock In',  Icon:MdArrowUpward,   color:'emerald' },
                      { v:'out', l:'Stock Out', Icon:MdArrowDownward, color:'red'     },
                    ].map(({ v, l, Icon, color }) => (
                      <button key={v} onClick={() => setType(v)}
                        className={`flex items-center justify-center gap-2 py-3 rounded-xl text-xs font-bold border-2 transition-all
                          ${type === v
                            ? color === 'emerald' ? 'border-emerald-400 bg-emerald-50 text-emerald-700'
                                                  : 'border-red-400 bg-red-50 text-red-600'
                            : 'border-slate-200 text-slate-600 hover:border-slate-300'}`}>
                        <Icon className="text-[14px]" /> {l}
                      </button>
                    ))}
                  </div>
                </div>

                <div>
                  <label className="text-xs font-bold text-slate-500 uppercase tracking-widest mb-1.5 block">Quantity</label>
                  <div className="flex items-center gap-2">
                    <button onClick={() => setQty(q => Math.max(1, q - 1))}
                      className="w-10 h-10 rounded-xl border-2 border-slate-200 text-slate-600 text-lg font-bold hover:bg-slate-50">−</button>
                    <input type="number" min={1} value={qty}
                      onChange={e => setQty(Math.max(1, parseInt(e.target.value) || 1))}
                      className="flex-1 text-center text-sm font-bold text-slate-800 bg-slate-50 border-2 border-slate-200 rounded-xl py-2.5 focus:outline-none focus:border-sky-400" />
                    <button onClick={() => setQty(q => q + 1)}
                      className="w-10 h-10 rounded-xl border-2 border-slate-200 text-slate-600 text-lg font-bold hover:bg-slate-50">+</button>
                  </div>
                  {type === 'out' && qty > found.stock && (
                    <p className="text-xs text-red-500 font-medium mt-1.5 flex items-center gap-1">
                      <MdWarning className="text-[13px]" /> Exceeds current stock ({found.stock})
                    </p>
                  )}
                </div>

                <div>
                  <label className="text-xs font-bold text-slate-500 uppercase tracking-widest mb-1.5 block">
                    Note <span className="font-normal text-slate-400 normal-case">(optional)</span>
                  </label>
                  <input type="text" value={note} onChange={e => setNote(e.target.value)}
                    placeholder={type === 'out' ? 'e.g. Dispensed to patient' : 'e.g. Received from supplier'}
                    className="w-full text-sm text-slate-700 placeholder-slate-300 bg-slate-50 border-2 border-slate-200 rounded-xl px-3 py-2.5 focus:outline-none focus:border-sky-400" />
                </div>
              </>
            )}
          </div>

          <div className="px-6 pb-6 flex gap-3">
            <button onClick={onClose}
              className="flex-1 py-2.5 text-sm font-semibold text-slate-600 border border-slate-200 rounded-xl hover:bg-slate-50">
              Close
            </button>
            <button
              onClick={handleConfirm}
              disabled={!found || qty < 1 || (type === 'out' && qty > found.stock)}
              className={`flex-1 py-2.5 text-sm font-bold text-white rounded-xl disabled:opacity-40 disabled:cursor-not-allowed transition-colors
                ${type === 'in' ? 'bg-emerald-500 hover:bg-emerald-600' : 'bg-[#0b1a2c] hover:bg-[#122236]'}`}>
              {success ? '✓ Done!' : `Confirm ${type === 'in' ? 'Stock In' : 'Stock Out'}`}
            </button>
          </div>
        </div>
      </div>
    </>
  )
}

// ─── Add Item Modal ───────────────────────────────────────────────────────────
const AddItemModal = ({ onClose, onAdd }) => {
  const [form, setForm] = useState({
    barcode:'', name:'', category:'Medicine', unit:'box',
    stock:'', threshold:'5', price:'', supplier:'',
  })
  const set = k => e => setForm(f => ({ ...f, [k]: e.target.value }))
  const valid = form.name.trim()

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm px-4" onClick={onClose}>
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between px-6 py-5 border-b border-slate-100">
          <div>
            <p className="text-sm font-bold text-slate-800">Add New Item</p>
            <p className="text-xs text-slate-500 mt-0.5">Register a product in the inventory</p>
          </div>
          <button onClick={onClose} className="w-8 h-8 flex items-center justify-center rounded-xl hover:bg-slate-100 text-slate-400"><MdClose /></button>
        </div>
        <div className="px-6 py-5 space-y-3 max-h-[65vh] overflow-y-auto">
          {[
            { k:'barcode',   l:'Barcode',        t:'text',   p:'e.g. 8850001001234' },
            { k:'name',      l:'Product Name',    t:'text',   p:'e.g. Paracetamol', req:true },
            { k:'supplier',  l:'Supplier',        t:'text',   p:'e.g. Dermacare PH' },
            { k:'stock',     l:'Initial Stock',   t:'number', p:'0' },
            { k:'threshold', l:'Low Stock Alert', t:'number', p:'5' },
            { k:'price',     l:'Unit Price (₱)',  t:'number', p:'0.00' },
          ].map(({ k, l, t, p, req }) => (
            <div key={k}>
              <label className="text-xs font-bold text-slate-500 uppercase tracking-widest mb-1.5 block">
                {l} {req && <span className="text-red-400">*</span>}
              </label>
              <input type={t} value={form[k]} onChange={set(k)} placeholder={p}
                className="w-full text-sm bg-slate-50 border-2 border-slate-200 rounded-xl px-3 py-2.5 focus:outline-none focus:border-sky-400" />
            </div>
          ))}
          <div>
            <label className="text-xs font-bold text-slate-500 uppercase tracking-widest mb-1.5 block">Category <span className="text-red-400">*</span></label>
            <select value={form.category} onChange={set('category')} className="w-full text-sm bg-slate-50 border-2 border-slate-200 rounded-xl px-3 py-2.5 focus:outline-none focus:border-sky-400">
              {['Medicine','Derma','Supplies'].map(c => <option key={c}>{c}</option>)}
            </select>
          </div>
          <div>
            <label className="text-xs font-bold text-slate-500 uppercase tracking-widest mb-1.5 block">Unit <span className="text-red-400">*</span></label>
            <select value={form.unit} onChange={set('unit')} className="w-full text-sm bg-slate-50 border-2 border-slate-200 rounded-xl px-3 py-2.5 focus:outline-none focus:border-sky-400">
              {['box','tube','bottle','pack','piece','sachet'].map(u => <option key={u}>{u}</option>)}
            </select>
          </div>
        </div>
        <div className="px-6 pb-6 flex gap-3">
          <button onClick={onClose} className="flex-1 py-2.5 text-sm font-semibold text-slate-600 border border-slate-200 rounded-xl hover:bg-slate-50">Cancel</button>
          <button disabled={!valid}
            onClick={() => {
              onAdd({ ...form, stock: parseInt(form.stock)||0, threshold: parseInt(form.threshold)||5, price: parseFloat(form.price)||0 })
              onClose()
            }}
            className="flex-1 py-2.5 text-sm font-bold text-white bg-[#0b1a2c] hover:bg-[#122236] disabled:opacity-40 rounded-xl">
            Add Item
          </button>
        </div>
      </div>
    </div>
  )
}

// ─── Edit Item Modal ──────────────────────────────────────────────────────────
const EditItemModal = ({ item, onClose, onSave }) => {
  const [form, setForm] = useState({
    barcode:   item.barcode   || '',
    name:      item.name      || '',
    category:  item.category  || 'Medicine',
    unit:      item.unit      || 'box',
    threshold: String(item.threshold ?? 5),
    price:     String(item.price     ?? 0),
    supplier:  item.supplier  || '',
  })
  const [saving, setSaving] = useState(false)
  const set = k => e => setForm(f => ({ ...f, [k]: e.target.value }))

  const handleSave = async () => {
    if (!form.name.trim()) return
    setSaving(true)
    try {
      await onSave(item.id, { ...form, threshold: parseInt(form.threshold)||5, price: parseFloat(form.price)||0 })
      onClose()
    } catch (err) { alert('Failed to update: ' + (err.message || 'Unknown error')) }
    finally { setSaving(false) }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm px-4" onClick={onClose}>
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between px-6 py-5 border-b border-slate-100">
          <div>
            <p className="text-sm font-bold text-slate-800">Edit Item</p>
            <p className="text-xs text-slate-500 mt-0.5">{item.name}</p>
          </div>
          <button onClick={onClose} className="w-8 h-8 flex items-center justify-center rounded-xl hover:bg-slate-100 text-slate-400"><MdClose /></button>
        </div>
        <div className="px-6 py-5 space-y-3 max-h-[65vh] overflow-y-auto">
          {[
            { k:'barcode',   l:'Barcode',        t:'text',   p:'e.g. 8850001001234' },
            { k:'name',      l:'Product Name',    t:'text',   p:'e.g. Paracetamol'   },
            { k:'supplier',  l:'Supplier',        t:'text',   p:'e.g. Dermacare PH'  },
            { k:'threshold', l:'Low Stock Alert', t:'number', p:'5'                  },
            { k:'price',     l:'Unit Price (₱)',  t:'number', p:'0.00'               },
          ].map(({ k, l, t, p }) => (
            <div key={k}>
              <label className="text-xs font-bold text-slate-500 uppercase tracking-widest mb-1.5 block">{l}</label>
              <input type={t} value={form[k]} onChange={set(k)} placeholder={p}
                className="w-full text-sm bg-slate-50 border-2 border-slate-200 rounded-xl px-3 py-2.5 focus:outline-none focus:border-sky-400" />
            </div>
          ))}
          <div>
            <label className="text-xs font-bold text-slate-500 uppercase tracking-widest mb-1.5 block">Category</label>
            <select value={form.category} onChange={set('category')} className="w-full text-sm bg-slate-50 border-2 border-slate-200 rounded-xl px-3 py-2.5 focus:outline-none focus:border-sky-400">
              {['Medicine','Derma','Supplies'].map(c => <option key={c}>{c}</option>)}
            </select>
          </div>
          <div>
            <label className="text-xs font-bold text-slate-500 uppercase tracking-widest mb-1.5 block">Unit</label>
            <select value={form.unit} onChange={set('unit')} className="w-full text-sm bg-slate-50 border-2 border-slate-200 rounded-xl px-3 py-2.5 focus:outline-none focus:border-sky-400">
              {['box','tube','bottle','pack','piece','sachet'].map(u => <option key={u}>{u}</option>)}
            </select>
          </div>
        </div>
        <div className="px-6 pb-6 flex gap-3">
          <button onClick={onClose} className="flex-1 py-2.5 text-sm font-semibold text-slate-600 border border-slate-200 rounded-xl hover:bg-slate-50">Cancel</button>
          <button disabled={saving} onClick={handleSave}
            className="flex-1 py-2.5 text-sm font-bold text-white bg-[#0b1a2c] hover:bg-[#122236] disabled:opacity-40 rounded-xl">
            {saving ? 'Saving…' : 'Save Changes'}
          </button>
        </div>
      </div>
    </div>
  )
}

// ─── Inventory Row ────────────────────────────────────────────────────────────
const InventoryRow = ({ item, onScan, onEdit, onDelete }) => {
  const status   = getStockStatus(item.stock, item.threshold)
  const catStyle = getCatStyle(item.category)
  const CatIcon  = catStyle.icon
  return (
    <div className="grid grid-cols-[28px_2fr_1.3fr_120px] gap-4 px-5 py-4 items-center hover:bg-slate-50/80 transition-colors border-b border-slate-100 last:border-0">
      {/* Icon */}
      <div className={`w-7 h-7 rounded-lg ${catStyle.bg} flex items-center justify-center shrink-0`}>
        <CatIcon className={`text-[13px] ${catStyle.text}`} />
      </div>

      {/* Name / meta */}
      <div className="min-w-0">
        <p className="text-sm font-semibold text-slate-800 truncate">{item.name}</p>
        <div className="flex items-center gap-2 mt-0.5 flex-wrap">
          <span className={`text-[10px] font-bold border px-1.5 py-0.5 rounded-full ${catStyle.bg} ${catStyle.text} ${catStyle.border}`}>
            {item.category}
          </span>
          {item.barcode && <span className="text-[11px] font-mono text-slate-400">{item.barcode}</span>}
          {item.supplier && <span className="text-[11px] text-slate-400 truncate">{item.supplier}</span>}
        </div>
      </div>

      {/* Stock level */}
      <div className="space-y-1">
        <div className="flex items-center justify-between">
          <span className={`text-sm font-bold ${item.stock===0?'text-red-600':item.stock<=item.threshold?'text-amber-600':'text-slate-800'}`}>
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
        <p className="text-[10px] text-slate-400">Threshold: {item.threshold} · ₱{parseFloat(item.price||0).toFixed(2)}/unit</p>
      </div>

      {/* Actions */}
      <div className="flex items-center gap-1">
        <button onClick={() => onScan(item)}
          className="flex items-center gap-1 py-1.5 px-2 rounded-lg border border-slate-200 text-slate-500 text-[11px] font-semibold hover:border-sky-300 hover:text-sky-600 hover:bg-sky-50 transition-all">
          <MdQrCodeScanner className="text-[13px]" /> Scan
        </button>
        <button onClick={() => onEdit(item)} title="Edit"
          className="w-7 h-7 flex items-center justify-center rounded-lg border border-slate-200 text-slate-400 hover:border-amber-300 hover:text-amber-600 hover:bg-amber-50 transition-all">
          <MdEdit className="text-[13px]" />
        </button>
        <button onClick={() => onDelete(item)} title="Delete"
          className="w-7 h-7 flex items-center justify-center rounded-lg border border-slate-200 text-slate-400 hover:border-red-300 hover:text-red-500 hover:bg-red-50 transition-all">
          <MdDelete className="text-[13px]" />
        </button>
      </div>
    </div>
  )
}

// ─── Main Shared Inventory ────────────────────────────────────────────────────
const Inventory = ({ services }) => {
  const { getInventory, updateStock, addInventoryItem, updateInventoryItem, deleteInventoryItem } = services

  const [items,      setItems]      = useState([])
  const [logs,       setLogs]       = useState([])
  const [loading,    setLoading]    = useState(true)
  const [search,     setSearch]     = useState('')
  const [category,   setCategory]   = useState('All')
  const [activeTab,  setActiveTab]  = useState('inventory')
  const [showScanner,setShowScanner]= useState(false)
  const [showAdd,    setShowAdd]    = useState(false)
  const [preselect,  setPreselect]  = useState(null)
  const [editItem,   setEditItem]   = useState(null)
  const [logFilter,  setLogFilter]  = useState('all')
  const [logMonth,   setLogMonth]   = useState('')
  const [logDate,    setLogDate]    = useState('')

  const load = useCallback(() => {
    getInventory()
      .then(data => {
        if (data?.items) { setItems(data.items); setLogs(data.logs || []) }
        else if (Array.isArray(data)) setItems(data)
      })
      .catch(err => console.error('Inventory load error:', err))
      .finally(() => setLoading(false))
  }, [getInventory])

  useEffect(() => { load() }, [load])

  const lowStock   = items.filter(i => i.stock > 0 && i.stock <= i.threshold)
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
    const ds         = l.logged_at ? String(l.logged_at).slice(0, 10) : ''
    const matchDate  = !logDate  || ds === logDate
    const matchMonth = !logMonth || ds.slice(5, 7) === logMonth
    return matchType && matchDate && matchMonth
  })

  const handleScanResult = async ({ item, type, qty, note }) => {
    try {
      const res = await updateStock(item.id, { type, qty, note })
      const ns = res?.stock ?? res?.new_stock ?? (type==='in' ? item.stock+qty : Math.max(0,item.stock-qty))
      setItems(prev => prev.map(i => i.id === item.id ? { ...i, stock: ns } : i))
    } catch (err) { alert('Failed to update stock: ' + (err.message||'Unknown error')) }
  }

  const handleAddItem = async (payload) => {
    try {
      const created = await addInventoryItem(payload)
      if (created?.id) setItems(prev => [...prev, created])
    } catch (err) { alert('Failed to add item: ' + (err.message||'Unknown error')) }
  }

  const handleEditItem = async (id, payload) => {
    const updated = await updateInventoryItem(id, payload)
    setItems(prev => prev.map(i => i.id === id ? { ...i, ...updated } : i))
  }

  const handleDeleteItem = async (item) => {
    if (!confirm(`Delete "${item.name}"? This cannot be undone.`)) return
    try {
      await deleteInventoryItem(item.id)
      setItems(prev => prev.filter(i => i.id !== item.id))
    } catch (err) { alert('Failed to delete: ' + (err.message||'Unknown error')) }
  }

  const openScannerFor  = item => { setPreselect(item); setShowScanner(true) }
  const closeScanner    = ()   => { setPreselect(null);  setShowScanner(false) }
  const clearLogFilters = ()   => { setLogFilter('all'); setLogDate(''); setLogMonth('') }

  if (loading) return (
    <div className="flex flex-col items-center justify-center p-20 space-y-4">
      <div className="w-10 h-10 border-4 border-slate-200 border-t-sky-500 rounded-full animate-spin" />
      <p className="text-slate-400 font-medium animate-pulse text-sm">Loading inventory…</p>
    </div>
  )

  return (
    <div className="max-w-6xl space-y-5">

      {/* Header */}
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold text-slate-800">Inventory</h1>
          <p className="text-sm text-slate-500 mt-0.5">Track stock levels, add products, and monitor transactions.</p>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={load} title="Refresh data"
            className="w-10 h-10 flex items-center justify-center rounded-xl border border-slate-200 text-slate-500 hover:bg-slate-50 transition-colors">
            <MdRefresh className="text-[18px]" />
          </button>
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

      {/* Stats */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {[
          { label:'Total Items',     value:items.length,       color:'text-slate-800', bg:'bg-white',     border:'border-slate-200'  },
          { label:'Inventory Value', value:`₱${totalValue.toLocaleString('en-PH',{maximumFractionDigits:0})}`, color:'text-slate-800', bg:'bg-white', border:'border-slate-200' },
          { label:'Low Stock',       value:lowStock.length,    color:lowStock.length>0?'text-amber-600':'text-slate-800',    bg:lowStock.length>0?'bg-amber-50':'bg-white',    border:lowStock.length>0?'border-amber-200':'border-slate-200'    },
          { label:'Out of Stock',    value:outOfStock.length,  color:outOfStock.length>0?'text-red-600':'text-slate-800',    bg:outOfStock.length>0?'bg-red-50':'bg-white',      border:outOfStock.length>0?'border-red-200':'border-slate-200'    },
        ].map(({ label, value, color, bg, border }) => (
          <div key={label} className={`${bg} border ${border} rounded-2xl px-5 py-4`}>
            <p className="text-xs text-slate-500 font-medium">{label}</p>
            <p className={`text-2xl font-black mt-1 ${color}`}>{value}</p>
          </div>
        ))}
      </div>

      {/* Alert banners */}
      {outOfStock.length > 0 && (
        <div className="bg-red-50 border border-red-200 rounded-2xl px-5 py-3 flex items-center gap-3">
          <MdWarning className="text-red-500 text-[18px] shrink-0" />
          <p className="text-sm font-medium text-red-700">
            Out of Stock: <span className="font-normal">{outOfStock.map(i=>i.name).join(', ')}</span>
          </p>
        </div>
      )}
      {lowStock.length > 0 && (
        <div className="bg-amber-50 border border-amber-200 rounded-2xl px-5 py-3 flex items-center gap-3">
          <MdTrendingDown className="text-amber-500 text-[18px] shrink-0" />
          <p className="text-sm font-medium text-amber-700">
            Low Stock: <span className="font-normal">{lowStock.map(i=>`${i.name} (${i.stock})`).join(' · ')}</span>
          </p>
        </div>
      )}

      {/* Tabs */}
      <div className="flex gap-1 bg-white border border-slate-200 rounded-xl p-1 w-fit">
        {[
          { key:'inventory', label:'Stock List',      icon:MdInventory2 },
          { key:'logs',      label:'Transaction Log', icon:MdHistory    },
        ].map(({ key, label, icon:Icon }) => (
          <button key={key} onClick={() => setActiveTab(key)}
            className={`flex items-center gap-1.5 px-4 py-2 rounded-lg text-xs font-bold transition-all
              ${activeTab===key ? 'bg-[#0b1a2c] text-sky-400 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}>
            <Icon className="text-[14px]" /> {label}
          </button>
        ))}
      </div>

      {/* ── Stock List ── */}
      {activeTab === 'inventory' && (
        <div className="bg-white border border-slate-200 rounded-2xl overflow-hidden">
          {/* Filters */}
          <div className="flex items-center gap-3 px-5 py-4 border-b border-slate-100 flex-wrap">
            <div className="flex items-center gap-2 bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 flex-1 min-w-52 focus-within:border-slate-300">
              <MdSearch className="text-slate-400 text-[15px] shrink-0" />
              <input type="text" value={search} onChange={e => setSearch(e.target.value)}
                placeholder="Search name, barcode, supplier…"
                className="text-sm text-slate-700 placeholder-slate-300 bg-transparent outline-none w-full" />
              {search && <button onClick={() => setSearch('')}><MdClose className="text-[13px] text-slate-300 hover:text-slate-500" /></button>}
            </div>
            <div className="flex gap-1 flex-wrap">
              {CATEGORIES.map(c => (
                <button key={c} onClick={() => setCategory(c)}
                  className={`px-3 py-1.5 rounded-lg text-[11px] font-bold transition-all
                    ${category===c ? 'bg-[#0b1a2c] text-sky-400' : 'text-slate-500 hover:bg-slate-100'}`}>
                  {c}
                </button>
              ))}
            </div>
          </div>
          {/* Column headers */}
          <div className="grid grid-cols-[28px_2fr_1.3fr_120px] gap-4 px-5 py-2.5 bg-slate-50 border-b border-slate-100">
            {['','Product','Stock Level','Actions'].map((h,i) => (
              <p key={i} className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">{h}</p>
            ))}
          </div>
          {filtered.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-14 text-center">
              <MdInventory2 className="text-slate-300 text-4xl mb-3" />
              <p className="text-sm font-bold text-slate-700">No items found</p>
            </div>
          ) : (
            filtered.map(item => (
              <InventoryRow key={item.id} item={item}
                onScan={openScannerFor} onEdit={setEditItem} onDelete={handleDeleteItem} />
            ))
          )}
          <div className="px-5 py-3 border-t border-slate-100 bg-slate-50/50">
            <p className="text-[11px] text-slate-400 font-medium">
              Showing {filtered.length} of {items.length} items
            </p>
          </div>
        </div>
      )}

      {/* ── Transaction Log ── */}
      {activeTab === 'logs' && (
        <div className="bg-white border border-slate-200 rounded-2xl overflow-hidden">
          <div className="px-5 py-4 border-b border-slate-100 flex flex-wrap justify-between items-center gap-3">
            <h3 className="text-sm font-bold text-slate-800 flex items-center gap-2">
              <MdHistory className="text-[16px] text-slate-400" /> Transaction History
            </h3>
            <div className="flex flex-wrap gap-2 items-center">
              <div className="flex gap-1">
                {[{v:'all',l:'All'},{v:'in',l:'↑ In'},{v:'out',l:'↓ Out'}].map(({v,l}) => (
                  <button key={v} onClick={() => setLogFilter(v)}
                    className={`px-3 py-1.5 rounded-lg text-[11px] font-bold transition-all
                      ${logFilter===v ? 'bg-[#0b1a2c] text-white' : 'bg-slate-100 text-slate-500 hover:bg-slate-200'}`}>
                    {l}
                  </button>
                ))}
              </div>
              <select value={logMonth} onChange={e => { setLogMonth(e.target.value); setLogDate('') }}
                className="text-xs bg-slate-50 border border-slate-200 rounded-lg px-2.5 py-1.5 focus:outline-none text-slate-700">
                <option value="">All Months</option>
                {MONTHS.map((m,i) => <option key={m} value={String(i+1).padStart(2,'0')}>{m}</option>)}
              </select>
              <div className="flex items-center gap-1.5 bg-slate-50 border border-slate-200 rounded-lg px-2.5 py-1.5">
                <MdCalendarToday className="text-slate-400 text-[12px] shrink-0" />
                <input type="date" value={logDate} onChange={e => { setLogDate(e.target.value); setLogMonth('') }}
                  className="text-xs bg-transparent focus:outline-none text-slate-700 w-28" />
              </div>
              {(logDate || logMonth || logFilter !== 'all') && (
                <button onClick={clearLogFilters} className="text-xs text-red-500 font-semibold hover:text-red-700 flex items-center gap-1">
                  <MdClose className="text-[12px]" /> Clear
                </button>
              )}
            </div>
          </div>
          {/* Log column headers */}
          <div className="grid grid-cols-[1fr_70px_55px_1fr_95px] gap-4 px-5 py-2.5 bg-slate-50 border-b border-slate-100">
            {['Item','Type','Qty','Note','Date & Time'].map((h,i) => (
              <p key={i} className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">{h}</p>
            ))}
          </div>
          {filteredLogs.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-14 text-center">
              <MdHistory className="text-slate-300 text-4xl mb-3" />
              <p className="text-sm font-bold text-slate-700">No transactions found</p>
            </div>
          ) : (
            <div className="divide-y divide-slate-100">
              {filteredLogs.map(log => (
                <div key={log.id} className="grid grid-cols-[1fr_70px_55px_1fr_95px] gap-4 px-5 py-3 items-center hover:bg-slate-50/80">
                  <div>
                    <p className="text-sm font-semibold text-slate-800 truncate">{log.item_name}</p>
                    {log.staff_name && <p className="text-[11px] text-slate-400 truncate">{log.staff_name}</p>}
                  </div>
                  <span className={`text-[11px] font-bold border px-2 py-0.5 rounded-full w-fit
                    ${log.type==='in' ? 'bg-emerald-50 text-emerald-700 border-emerald-200' : 'bg-red-50 text-red-600 border-red-200'}`}>
                    {log.type==='in' ? '↑ In' : '↓ Out'}
                  </span>
                  <p className={`text-sm font-bold ${log.type==='in'?'text-emerald-600':'text-red-600'}`}>
                    {log.type==='in'?'+':'-'}{log.qty}
                  </p>
                  <p className="text-xs text-slate-500 truncate">{log.note || <span className="italic text-slate-300">—</span>}</p>
                  <div>
                    <p className="text-[11px] font-semibold text-slate-600">
                      {log.logged_at ? new Date(log.logged_at).toLocaleDateString('en-PH',{month:'short',day:'numeric',year:'numeric'}) : '—'}
                    </p>
                    <p className="text-[10px] text-slate-400">
                      {log.logged_at ? new Date(log.logged_at).toLocaleTimeString('en-PH',{hour:'2-digit',minute:'2-digit'}) : ''}
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

      {showScanner && <ScannerModal onClose={closeScanner} onConfirm={handleScanResult} items={items} preselect={preselect} />}
      {showAdd     && <AddItemModal  onClose={() => setShowAdd(false)}  onAdd={handleAddItem} />}
      {editItem    && <EditItemModal item={editItem} onClose={() => setEditItem(null)} onSave={handleEditItem} />}
    </div>
  )
}

export default Inventory