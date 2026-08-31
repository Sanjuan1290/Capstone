import { BrowserMultiFormatReader } from '@zxing/browser'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  MdAdd, MdCameraAlt, MdClose, MdDelete, MdEdit, MdInventory2,
  MdQrCodeScanner, MdRefresh, MdSave, MdSearch, MdWarningAmber,
  MdCheckCircle, MdLocationOn, MdCalendarToday, MdFlashOn, MdCameraswitch, MdUploadFile,
} from 'react-icons/md'
import { useToast } from '../../components/ui/ToastProvider'

const CATEGORIES = ['Medicine', 'Derma', 'Supplies']
const UNIT_OPTIONS = ['box', 'tube', 'bottle', 'pack', 'piece', 'sachet']
const BASE_UNITS = ['piece', 'tablet', 'capsule', 'ml', 'gram', 'sachet']
const ITEMS_PER_PAGE = 5
const BATCHES_PER_PAGE = 4

const STOCK_IN_REASONS = [
  { value: 'received', label: 'Received from Supplier' },
  { value: 'returned', label: 'Returned to Stock' },
  { value: 'correction_in', label: 'Inventory Correction (+)' },
]

const STOCK_OUT_REASONS = [
  { value: 'adjustment_out', label: 'Inventory Correction (-)' },
  { value: 'expired', label: 'Expired Stock' },
  { value: 'damaged', label: 'Damaged Stock' },
  { value: 'wastage', label: 'Wastage / Spillage' },
  { value: 'returned_to_supplier', label: 'Returned to Supplier' },
]

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

const getBatchLocationQuantity = (batch, locationName = 'Main Stockroom') => {
  const locations = Array.isArray(batch?.locations) ? batch.locations : []
  if (!locations.length) return Number(batch?.quantity || 0)
  const location = locations.find((entry) => String(entry?.name || '') === locationName)
  return Number(location?.quantity || 0)
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
  const lastCodeRef = useRef({ code: '', at: 0 })
  const [status, setStatus] = useState('starting')
  const [errorMsg, setErrorMsg] = useState('')
  const [devices, setDevices] = useState([])
  const [selectedDeviceId, setSelectedDeviceId] = useState('')
  const [manualCode, setManualCode] = useState('')
  const [torchOn, setTorchOn] = useState(false)
  const [retryKey, setRetryKey] = useState(0)

  const stopScanner = useCallback(() => {
    controlsRef.current?.stop?.()
    controlsRef.current = null
    readerRef.current?.reset?.()
    if (videoRef.current) videoRef.current.srcObject = null
  }, [])

  const emitCode = useCallback((rawCode) => {
    const code = String(rawCode || '').trim()
    if (!code) return
    const now = Date.now()
    if (lastCodeRef.current.code === code && now - lastCodeRef.current.at < 1800) return
    lastCodeRef.current = { code, at: now }
    setStatus('detected')
    stopScanner()
    window.setTimeout(() => onDetected(code), 180)
  }, [onDetected, stopScanner])

  useEffect(() => {
    mountedRef.current = true
    let permissionStream = null

    const init = async () => {
      setStatus('starting')
      setErrorMsg('')
      setTorchOn(false)

      if (!navigator.mediaDevices?.getUserMedia) {
        setStatus('error')
        setErrorMsg('Camera access is unavailable. Use HTTPS on a phone, or enter the barcode manually.')
        return
      }

      try {
        // Ask for permission first so mobile browsers expose camera labels and rear cameras.
        permissionStream = await navigator.mediaDevices.getUserMedia({ video: true, audio: false })
        permissionStream.getTracks().forEach((track) => track.stop())
        permissionStream = null

        const availableDevices = await BrowserMultiFormatReader.listVideoInputDevices().catch(() => [])
        if (!mountedRef.current) return
        setDevices(availableDevices)

        const preferred = selectedDeviceId
          || availableDevices.find((device) => /back|rear|environment/i.test(device.label))?.deviceId
          || availableDevices[0]?.deviceId
          || ''
        if (!selectedDeviceId && preferred) setSelectedDeviceId(preferred)

        readerRef.current = new BrowserMultiFormatReader()
        controlsRef.current = await readerRef.current.decodeFromConstraints(
          {
            video: preferred
              ? { deviceId: { exact: preferred }, width: { ideal: 1920 }, height: { ideal: 1080 } }
              : { facingMode: { ideal: 'environment' }, width: { ideal: 1920 }, height: { ideal: 1080 } },
          },
          videoRef.current,
          (result) => {
            if (!mountedRef.current || !result) return
            emitCode(result.getText())
          }
        )
        if (mountedRef.current) setStatus('scanning')
      } catch (err) {
        if (!mountedRef.current) return
        setStatus('error')
        const message = err?.name === 'NotAllowedError'
          ? 'Camera permission was denied. Allow camera access in your browser settings, then retry.'
          : err?.name === 'NotFoundError'
            ? 'No camera was found. Enter the barcode manually or upload a barcode image.'
            : err?.name === 'OverconstrainedError'
              ? 'The selected camera is unavailable. Switch cameras and retry.'
              : err?.message || 'The scanner could not start.'
        setErrorMsg(message)
      }
    }

    stopScanner()
    init()
    return () => {
      mountedRef.current = false
      permissionStream?.getTracks?.().forEach((track) => track.stop())
      stopScanner()
    }
  }, [emitCode, retryKey, selectedDeviceId, stopScanner])

  const switchCamera = () => {
    if (devices.length < 2) return
    const currentIndex = devices.findIndex((device) => device.deviceId === selectedDeviceId)
    const next = devices[(currentIndex + 1) % devices.length]
    if (next?.deviceId) setSelectedDeviceId(next.deviceId)
  }

  const toggleTorch = async () => {
    try {
      if (controlsRef.current?.switchTorch) {
        await controlsRef.current.switchTorch()
        setTorchOn((current) => !current)
        return
      }
      const track = videoRef.current?.srcObject?.getVideoTracks?.()[0]
      const capabilities = track?.getCapabilities?.()
      if (!capabilities?.torch) throw new Error('Torch is not supported by this camera.')
      const next = !torchOn
      await track.applyConstraints({ advanced: [{ torch: next }] })
      setTorchOn(next)
    } catch (error) {
      setErrorMsg(error.message || 'Torch control is unavailable.')
    }
  }

  const scanImage = async (event) => {
    const file = event.target.files?.[0]
    if (!file) return
    const objectUrl = URL.createObjectURL(file)
    setStatus('starting')
    try {
      const reader = readerRef.current || new BrowserMultiFormatReader()
      const result = await reader.decodeFromImageUrl(objectUrl)
      emitCode(result?.getText())
    } catch {
      setStatus('error')
      setErrorMsg('No readable barcode was found in that image.')
    } finally {
      URL.revokeObjectURL(objectUrl)
      event.target.value = ''
    }
  }

  const statusConfig = {
    starting: { color: '#64748b', text: 'Starting camera...', pulse: false },
    scanning: { color: '#0ea5e9', text: 'Scanning — hold the barcode steady', pulse: true },
    detected: { color: '#22c55e', text: 'Barcode detected', pulse: false },
    error: { color: '#ef4444', text: errorMsg, pulse: false },
  }
  const cfg = statusConfig[status]

  return (
    <div className="fixed inset-0 z-[90] flex items-end justify-center bg-black/80 sm:items-center sm:px-4" onClick={onClose}>
      <div className="flex h-[100dvh] w-full flex-col overflow-hidden bg-white shadow-2xl sm:h-auto sm:max-h-[94vh] sm:max-w-lg sm:rounded-3xl" onClick={(event) => event.stopPropagation()}>
        <div className="flex items-center justify-between border-b border-slate-100 px-5 py-4">
          <div>
            <p className="flex items-center gap-2 text-sm font-bold text-slate-800"><MdCameraAlt className="text-sky-500" /> Camera Barcode Scanner</p>
            <p className="text-xs text-slate-400">Rear camera is preferred on supported phones</p>
          </div>
          <button type="button" onClick={onClose} className="icon-button" aria-label="Close barcode scanner"><MdClose /></button>
        </div>

        <div className="relative min-h-[42vh] flex-1 overflow-hidden bg-black sm:aspect-[4/3] sm:min-h-0 sm:flex-none">
          {status === 'error' ? (
            <div className="flex h-full flex-col items-center justify-center gap-3 px-8 text-center text-sm text-slate-200">
              <MdWarningAmber className="text-3xl text-amber-400" />
              <p>{errorMsg}</p>
              <button type="button" className="rounded-xl bg-white px-4 py-2 text-xs font-bold text-slate-800" onClick={() => setRetryKey((current) => current + 1)}>Retry Camera</button>
            </div>
          ) : (
            <>
              <video ref={videoRef} className="h-full w-full object-cover" muted playsInline autoPlay />
              <div className="pointer-events-none absolute inset-[12%] rounded-2xl border-2 border-sky-400 shadow-[0_0_0_999px_rgba(0,0,0,0.35)]" />
              {status === 'scanning' && <div className="absolute left-[14%] right-[14%] top-1/2 h-0.5 animate-pulse bg-sky-400 shadow-[0_0_8px_#38bdf8]" />}
              {status === 'starting' && <div className="absolute inset-0 flex items-center justify-center bg-black/40"><span className="loading-spinner" /></div>}
              {status === 'detected' && <div className="absolute inset-0 flex items-center justify-center bg-emerald-500/25"><MdCheckCircle className="text-6xl text-white drop-shadow" /></div>}
            </>
          )}
        </div>

        <div className="space-y-4 overflow-y-auto p-5">
          <div className="flex items-center justify-between gap-2">
            <div className="flex min-w-0 items-center gap-2 text-xs text-slate-500">
              <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: cfg.color }} />
              <span className="truncate">{cfg.text}</span>
            </div>
            <div className="flex gap-2">
              <button type="button" onClick={switchCamera} disabled={devices.length < 2} className="icon-button border border-slate-200" aria-label="Switch camera"><MdCameraswitch /></button>
              <button type="button" onClick={toggleTorch} disabled={status !== 'scanning'} className={`icon-button border border-slate-200 ${torchOn ? 'bg-amber-50 text-amber-600' : ''}`} aria-label="Toggle camera torch"><MdFlashOn /></button>
            </div>
          </div>

          {devices.length > 1 && (
            <div>
              <label htmlFor="scanner-camera" className="form-label">Camera</label>
              <select id="scanner-camera" value={selectedDeviceId} onChange={(event) => setSelectedDeviceId(event.target.value)} className="form-control mt-1.5">
                {devices.map((device, index) => <option key={device.deviceId} value={device.deviceId}>{device.label || `Camera ${index + 1}`}</option>)}
              </select>
            </div>
          )}

          <div>
            <label htmlFor="manual-barcode" className="form-label">Manual Barcode</label>
            <div className="mt-1.5 flex gap-2">
              <input id="manual-barcode" value={manualCode} onChange={(event) => setManualCode(event.target.value)} onKeyDown={(event) => event.key === 'Enter' && emitCode(manualCode)} placeholder="Type or paste barcode" className="form-control" />
              <button type="button" className="button-primary shrink-0" disabled={!manualCode.trim()} onClick={() => emitCode(manualCode)}>Use Code</button>
            </div>
          </div>

          <label className="button-secondary w-full cursor-pointer">
            <MdUploadFile /> Scan Barcode Image
            <input type="file" accept="image/*" capture="environment" onChange={scanImage} className="sr-only" />
          </label>

          <p className="text-[11px] leading-relaxed text-slate-400">
            Phone camera access requires HTTPS or localhost. On a local network, open the app through an HTTPS development URL.
          </p>
        </div>
      </div>
    </div>
  )
}

const ItemFormModal = ({ title, initialItem, onClose, onSubmit }) => {
  const isEditing = Boolean(initialItem?.id)
  const [step, setStep] = useState(1)
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
    batch_code: '',
    storage_location: initialItem?.storage_location || '',
  })

  const update = (key) => (e) => setForm(prev => ({ ...prev, [key]: e.target.value }))
  const goNext = () => {
    if (!form.name.trim()) return
    setStep(2)
  }

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
      <div className="w-full max-w-xl overflow-hidden rounded-3xl bg-white shadow-2xl" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between border-b border-slate-100 px-6 py-4">
          <div>
            <p className="text-base font-bold text-slate-900">{title}</p>
            <p className="mt-0.5 text-sm text-slate-500">
              {isEditing ? 'Update the product definition. Stock is managed separately per batch.' : 'Create the item first, then define packaging and the opening batch.'}
            </p>
          </div>
          <button onClick={onClose} className="flex h-9 w-9 items-center justify-center rounded-xl text-slate-400 hover:bg-slate-100"><MdClose /></button>
        </div>

        <div className="px-6 pt-5">
          <div className="grid grid-cols-2 gap-2 rounded-2xl bg-slate-100 p-1 text-sm font-semibold">
            <div className={`rounded-xl px-3 py-2 text-center ${step === 1 ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500'}`}>1. Item Details</div>
            <div className={`rounded-xl px-3 py-2 text-center ${step === 2 ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500'}`}>2. Stock & Packaging</div>
          </div>
        </div>

        <div className="max-h-[66vh] overflow-y-auto p-6">
          {step === 1 ? (
            <div className="grid gap-4 md:grid-cols-2">
              <div className="md:col-span-2"><Field label="Item Name *"><input value={form.name} onChange={update('name')} className={inputClass} placeholder="e.g. Sterile Gauze Pad" /></Field></div>
              <Field label="Category"><select value={form.category} onChange={update('category')} className={inputClass}>{CATEGORIES.map(option => <option key={option}>{option}</option>)}</select></Field>
              <Field label="Barcode"><input value={form.barcode} onChange={update('barcode')} className={inputClass} placeholder="Optional" /></Field>
              <Field label="Supplier"><input value={form.supplier} onChange={update('supplier')} className={inputClass} placeholder="Optional" /></Field>
              <Field label="Storage Location"><input value={form.storage_location} onChange={update('storage_location')} className={inputClass} placeholder="e.g. Shelf A2 / Cold storage" /></Field>
              <div className="md:col-span-2 rounded-2xl border border-sky-100 bg-sky-50 px-4 py-3 text-sm text-sky-800">
                Stock is tracked <strong>per batch</strong>. Each delivery can have its own lot number, expiry date, quantity, and room/location balance.
              </div>
            </div>
          ) : (
            <div className="grid gap-4 md:grid-cols-2">
              <Field label="Stock Unit"><select value={form.unit} onChange={update('unit')} className={inputClass}>{UNIT_OPTIONS.map(option => <option key={option}>{option}</option>)}</select></Field>
              <Field label="Dispensing Unit"><select value={form.base_unit} onChange={update('base_unit')} className={inputClass}>{BASE_UNITS.map(option => <option key={option}>{option}</option>)}</select></Field>
              <Field label="Units per Package"><input type="number" min="1" step="0.01" value={form.unit_size} onChange={update('unit_size')} className={inputClass} /></Field>
              <Field label="Low Stock Alert"><input type="number" min="0" step="0.01" value={form.threshold} onChange={update('threshold')} className={inputClass} /></Field>
              <Field label="Cost per Stock Unit"><input type="number" min="0" step="0.01" value={form.price} onChange={update('price')} className={inputClass} /></Field>
              <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-600">
                Example: <strong>1 box = 100 pieces</strong>. Choose “box” as Stock Unit, “piece” as Dispensing Unit, and 100 as Units per Package.
              </div>

              {!isEditing && (
                <>
                  <Field label="Opening Stock"><input type="number" min="0" step="0.01" value={form.stock} onChange={update('stock')} className={inputClass} /></Field>
                  <Field label="Opening Batch / Lot No."><input value={form.batch_code} onChange={update('batch_code')} className={inputClass} placeholder="e.g. LOT-2026-081" /></Field>
                  <Field label="Opening Batch Expiry"><input type="date" value={form.expiration_date} onChange={update('expiration_date')} className={inputClass} /></Field>
                </>
              )}

              {isEditing && (
                <div className="md:col-span-2 rounded-2xl border border-sky-100 bg-sky-50 px-4 py-3 text-sm text-sky-700">
                  Existing quantities keep their own batch records. Use <strong>Update Stock</strong> for each new delivery or stock-out.
                </div>
              )}
            </div>
          )}
        </div>

        <div className="flex gap-3 border-t border-slate-100 px-6 py-5">
          {step === 1 ? (
            <>
              <button onClick={onClose} className="flex-1 rounded-2xl border border-slate-200 py-3 text-sm font-semibold text-slate-600">Cancel</button>
              <button onClick={goNext} disabled={!form.name.trim()} className="flex-1 rounded-2xl bg-[#0b1a2c] py-3 text-sm font-semibold text-white disabled:opacity-50">Next</button>
            </>
          ) : (
            <>
              <button onClick={() => setStep(1)} className="flex-1 rounded-2xl border border-slate-200 py-3 text-sm font-semibold text-slate-600">Back</button>
              <button onClick={handleSubmit} className="flex-1 rounded-2xl bg-[#0b1a2c] py-3 text-sm font-semibold text-white flex items-center justify-center gap-2"><MdSave /> {isEditing ? 'Save Changes' : 'Add Item'}</button>
            </>
          )}
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
  const [batchCode, setBatchCode] = useState('')
  const [movementReason, setMovementReason] = useState('received')
  const [stockOutMode, setStockOutMode] = useState('fefo')
  const [batchPage, setBatchPage] = useState(1)
  const [batchAllocations, setBatchAllocations] = useState(
    Array.isArray(item?.batches)
      ? item.batches.map((batch) => ({ batch_id: batch.id, quantity: '' }))
      : []
  )

  const batches = Array.isArray(item?.batches) ? item.batches : []
  const available = batches.length > 0 ? batches.reduce((sum, batch) => sum + getBatchLocationQuantity(batch), 0) : getPackageCount(item)
  const selectedBatchQty = batchAllocations.reduce((sum, batch) => sum + Number(batch.quantity || 0), 0)
  const exactBatchReason = type === 'out' && ['expired', 'damaged', 'wastage', 'returned_to_supplier'].includes(movementReason)
  const isManualStockOut = type === 'out' && stockOutMode === 'manual'
  const effectiveQty = isManualStockOut ? selectedBatchQty : Number(qty)
  const manualModeInvalid = isManualStockOut && selectedBatchQty <= 0
  const totalBatchPages = Math.max(1, Math.ceil(batches.length / BATCHES_PER_PAGE))
  const currentBatchPage = Math.min(batchPage, totalBatchPages)
  const paginatedBatches = batches.slice((currentBatchPage - 1) * BATCHES_PER_PAGE, currentBatchPage * BATCHES_PER_PAGE)

  useEffect(() => {
    setBatchPage(1)
  }, [item?.id, type, stockOutMode])

  useEffect(() => {
    setMovementReason(type === 'in' ? 'received' : 'adjustment_out')
  }, [type])

  useEffect(() => {
    if (exactBatchReason && stockOutMode !== 'manual') setStockOutMode('manual')
  }, [exactBatchReason, stockOutMode])

  useEffect(() => {
    if (batchPage > totalBatchPages) {
      setBatchPage(totalBatchPages)
    }
  }, [batchPage, totalBatchPages])

  const updateBatchQty = (batchId, value) => {
    const maxForBatch = getBatchLocationQuantity(item?.batches?.find((batch) => batch.id === batchId))
    setBatchAllocations((prev) => prev.map((batch) => (
      batch.batch_id === batchId
        ? { ...batch, quantity: value === '' ? '' : Math.min(maxForBatch, Math.max(0, parseFloat(value || '0'))) }
        : batch
    )))
  }

  const fillBatchQty = (batchId, quantity) => {
    setBatchAllocations((prev) => prev.map((batch) => (
      batch.batch_id === batchId
        ? { ...batch, quantity }
        : batch
    )))
  }

  const handleSave = () => {
    onSubmit({
      type,
      qty: effectiveQty,
      note,
      movement_reason: movementReason,
      expiration_date: type === 'in' ? expirationDate : '',
      batch_code: type === 'in' ? batchCode.trim() : '',
      selected_batches: isManualStockOut
        ? batchAllocations
            .filter((batch) => Number(batch.quantity || 0) > 0)
            .map((batch) => ({ batch_id: batch.batch_id, quantity: Number(batch.quantity) }))
        : [],
    })
  }

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/50 px-4" onClick={onClose}>
      <div className="flex max-h-[88vh] w-full max-w-md flex-col overflow-hidden rounded-3xl bg-white shadow-2xl" onClick={e => e.stopPropagation()}>
        <div className="flex shrink-0 items-center justify-between border-b border-slate-100 px-6 py-4">
          <div>
            <p className="text-sm font-bold text-slate-800">{item.name}</p>
            <p className="text-xs text-slate-400">Available: {available} {item.unit}s - {item.unit_size || 1} {item.base_unit || item.unit} per {item.unit}</p>
          </div>
          <button onClick={onClose} className="w-8 h-8 rounded-xl hover:bg-slate-100 text-slate-400 flex items-center justify-center"><MdClose /></button>
        </div>
        <div className="flex-1 overflow-y-auto px-6 py-6">
          <div className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <button onClick={() => setType('in')} className={`rounded-2xl border py-3 text-sm font-semibold ${type === 'in' ? 'bg-emerald-50 border-emerald-300 text-emerald-700' : 'border-slate-200 text-slate-600'}`}>Stock In</button>
            <button onClick={() => setType('out')} className={`rounded-2xl border py-3 text-sm font-semibold ${type === 'out' ? 'bg-red-50 border-red-300 text-red-600' : 'border-slate-200 text-slate-600'}`}>Stock Out</button>
          </div>

          {(!isManualStockOut || type === 'in') ? (
            <Field label={`Quantity (${item.unit}s)`}>
              <input type="number" min="0.01" step="0.01" value={qty} onChange={e => setQty(Math.max(0.01, parseFloat(e.target.value || '1')))} className={inputClass} />
            </Field>
          ) : (
            <div className="rounded-2xl border border-sky-200 bg-sky-50 px-4 py-3">
              <p className="text-xs font-bold uppercase tracking-widest text-sky-700">Selected Stock-Out Quantity</p>
              <p className="mt-1 text-2xl font-black text-sky-900">{selectedBatchQty}</p>
              <p className="mt-1 text-xs text-sky-700">
                Total is calculated from the batches you choose below.
              </p>
            </div>
          )}

          <Field label="Movement Reason *">
            <select value={movementReason} onChange={e => setMovementReason(e.target.value)} className={inputClass}>
              {(type === 'in' ? STOCK_IN_REASONS : STOCK_OUT_REASONS).map((reason) => (
                <option key={reason.value} value={reason.value}>{reason.label}</option>
              ))}
            </select>
          </Field>

          {type === 'in' && (
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="Batch / Lot Number">
                <input value={batchCode} onChange={e => setBatchCode(e.target.value)} className={inputClass} placeholder="e.g. LOT-2026-081" />
              </Field>
              <Field label="Batch Expiration Date">
                <input type="date" value={expirationDate} onChange={e => setExpirationDate(e.target.value)} className={inputClass} />
              </Field>
              <div className="sm:col-span-2 rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-xs leading-relaxed text-slate-500">
                Every stock-in creates a separate batch. If the supplier does not provide a lot number, the system still keeps the delivery as its own internal batch record.
              </div>
            </div>
          )}

          <Field label="Movement Note">
            <input value={note} onChange={e => setNote(e.target.value)} className={inputClass} placeholder={type === 'in' ? 'e.g. Delivery receipt DR-1024' : 'Explain the stock-out when needed'} />
          </Field>

          {type === 'out' && (
            <div className="space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <button disabled={exactBatchReason} onClick={() => setStockOutMode('fefo')} className={`rounded-2xl border px-4 py-3 text-sm font-semibold disabled:cursor-not-allowed disabled:opacity-40 ${stockOutMode === 'fefo' ? 'border-amber-300 bg-amber-50 text-amber-700' : 'border-slate-200 text-slate-600'}`}>
                  Use FEFO
                </button>
                <button onClick={() => setStockOutMode('manual')} className={`rounded-2xl border px-4 py-3 text-sm font-semibold ${stockOutMode === 'manual' ? 'border-sky-300 bg-sky-50 text-sky-700' : 'border-slate-200 text-slate-600'}`}>
                  Choose Batches
                </button>
              </div>

              {exactBatchReason ? (
                <div className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
                  This movement reason requires an exact batch/lot selection so expiry, damage, wastage, or supplier returns remain fully traceable.
                </div>
              ) : stockOutMode === 'fefo' ? (
                <div className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-700">
                  Automatic FEFO skips expired stock and deducts from the usable batch with the nearest expiration first.
                </div>
              ) : (
                <div className="rounded-2xl border border-sky-200 bg-sky-50 px-4 py-3 text-sm text-sky-700">
                  Choose exactly which batch or batches were used. The stock-out total is calculated automatically from your selections.
                </div>
              )}
            </div>
          )}

          {batches.length > 0 && (
            <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
              <div className="flex items-center justify-between gap-3">
                <p className="text-xs font-bold uppercase tracking-widest text-slate-400">Active Batches</p>
                {batches.length > BATCHES_PER_PAGE && (
                  <span className="text-[11px] font-semibold text-slate-500">
                    Page {currentBatchPage} of {totalBatchPages}
                  </span>
                )}
              </div>
              <div className="mt-3 space-y-2">
                {paginatedBatches.map(batch => (
                  <div key={batch.id} className="rounded-2xl bg-white px-3 py-2 text-sm text-slate-600">
                    <div className="flex items-center justify-between gap-3">
                      <span>{batch.batch_code || `Batch #${batch.id}`}</span>
                      <span>{formatBatchLabel(batch, item.unit)}</span>
                    </div>
                    {Array.isArray(batch.locations) && batch.locations.length > 0 && (
                      <div className="mt-1 space-y-0.5 text-[11px] text-slate-400">
                        <p>{batch.locations.map((location) => `${location.name}: ${location.quantity}`).join(' · ')}</p>
                        {type === 'out' && <p className="font-semibold text-slate-500">Available for manual stock-out from Main Stockroom: {getBatchLocationQuantity(batch)} {item.unit}(s)</p>}
                      </div>
                    )}
                    {isManualStockOut && (
                      <div className="mt-2 space-y-2">
                        <div className="flex gap-2">
                          <button
                            type="button"
                            onClick={() => fillBatchQty(batch.id, getBatchLocationQuantity(batch))}
                            className="rounded-xl border border-sky-200 bg-sky-50 px-3 py-1.5 text-xs font-semibold text-sky-700"
                          >
                            Use all
                          </button>
                          <button
                            type="button"
                            onClick={() => fillBatchQty(batch.id, '')}
                            className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-1.5 text-xs font-semibold text-slate-600"
                          >
                            Clear
                          </button>
                        </div>
                        <input
                          type="number"
                          min="0"
                          max={getBatchLocationQuantity(batch)}
                          value={batchAllocations.find((entry) => entry.batch_id === batch.id)?.quantity ?? ''}
                          onChange={(e) => updateBatchQty(batch.id, e.target.value)}
                          placeholder={`Qty from ${batch.batch_code || `batch #${batch.id}`}`}
                          className={inputClass}
                        />
                      </div>
                    )}
                  </div>
                ))}
              </div>
              {batches.length > BATCHES_PER_PAGE && (
                <div className="mt-3 flex items-center justify-between gap-2">
                  <button
                    type="button"
                    onClick={() => setBatchPage((prev) => Math.max(1, prev - 1))}
                    disabled={currentBatchPage === 1}
                    className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-600 disabled:opacity-40"
                  >
                    Previous
                  </button>
                  <button
                    type="button"
                    onClick={() => setBatchPage((prev) => Math.min(totalBatchPages, prev + 1))}
                    disabled={currentBatchPage === totalBatchPages}
                    className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-600 disabled:opacity-40"
                  >
                    Next
                  </button>
                </div>
              )}
              {type === 'out' && stockOutMode === 'manual' && (
                <p className={`mt-3 text-xs font-semibold ${manualModeInvalid ? 'text-rose-600' : 'text-slate-500'}`}>
                  {manualModeInvalid
                    ? `Select at least one batch quantity before saving.`
                    : `Selected total: ${selectedBatchQty} ${item.unit}(s)`}
                </p>
              )}
            </div>
          )}

          <button onClick={onOpenScanner} className="w-full rounded-2xl border border-sky-200 bg-sky-50 py-3 text-sm font-semibold text-sky-700 flex items-center justify-center gap-2">
            <MdQrCodeScanner className="text-[18px]" /> Open Camera Scanner
          </button>
          </div>
        </div>
        <div className="shrink-0 border-t border-slate-100 bg-white px-6 pb-6 pt-4">
          <button
            onClick={handleSave}
            disabled={(type === 'out' && !isManualStockOut && qty > available) || manualModeInvalid}
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
  const toast = useToast()
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
  const [page, setPage] = useState(1)

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

  useEffect(() => {
    setPage(1)
  }, [search, category])

  const filtered = useMemo(() => items.filter(item => {
    const matchesCategory = category === 'All' || item.category === category
    const needle = search.toLowerCase()
    const matchesSearch = !needle ||
      item.name?.toLowerCase().includes(needle) ||
      item.barcode?.toLowerCase().includes(needle) ||
      item.supplier?.toLowerCase().includes(needle)
    return matchesCategory && matchesSearch
  }), [items, category, search])

  const totalPages = Math.max(1, Math.ceil(filtered.length / ITEMS_PER_PAGE))
  const currentPage = Math.min(page, totalPages)
  const paginated = filtered.slice((currentPage - 1) * ITEMS_PER_PAGE, currentPage * ITEMS_PER_PAGE)

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

  const handleStockUpdate = async ({ type, qty, note, movement_reason, expiration_date, batch_code, selected_batches }) => {
    try {
      await updateStock(stockItem.id, { type, qty, note, movement_reason, expiration_date, batch_code, selected_batches })
      await load()
      setFeedback({ type: 'success', message: `${stockItem.name} stock was updated successfully.` })
      setStockItem(null)
    } catch (err) {
      setFeedback({ type: 'error', message: err.message || 'Failed to update stock.' })
    }
  }

  const handleScannerDetected = useCallback((code) => {
    setScannerOpen(false)
    const normalizedCode = String(code || '').trim()
    const found = items.find((item) => String(item.barcode || '').trim() === normalizedCode)
    if (found) {
      toast.success(`Barcode matched ${found.name}.`)
      setStockItem(found)
    } else {
      toast.warning(`Barcode ${normalizedCode} was read, but no inventory item matches it.`)
    }
  }, [items, toast])

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
    <div className="mx-auto max-w-7xl space-y-6">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold text-slate-800">Inventory</h1>
          <p className="text-sm text-slate-500 mt-1">Package-aware inventory with barcode scanning, batch expiry tracking, and flexible stock deductions.</p>
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
          <input aria-label="Search inventory" value={search} onChange={e => setSearch(e.target.value)} className="w-full bg-transparent text-sm outline-none" placeholder="Search item, barcode, or supplier" />
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
        {paginated.map(item => (
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
                          {batch.batch_code || `Batch #${batch.id}`} - {formatBatchLabel(batch, item.unit)}
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

      {filtered.length > 0 && (
        <div className="flex flex-col gap-3 rounded-3xl border border-slate-200 bg-white px-5 py-4 text-sm text-slate-500 sm:flex-row sm:items-center sm:justify-between">
          <p>
            Showing {((currentPage - 1) * ITEMS_PER_PAGE) + 1}-{Math.min(currentPage * ITEMS_PER_PAGE, filtered.length)} of {filtered.length} items
          </p>
          <div className="flex items-center gap-2">
            <button
              onClick={() => setPage((prev) => Math.max(1, prev - 1))}
              disabled={currentPage === 1}
              className="rounded-2xl border border-slate-200 px-4 py-2 font-semibold text-slate-600 disabled:opacity-40"
            >
              Previous
            </button>
            <span className="rounded-2xl bg-slate-100 px-3 py-2 text-xs font-bold uppercase tracking-wider text-slate-500">
              Page {currentPage} of {totalPages}
            </span>
            <button
              onClick={() => setPage((prev) => Math.min(totalPages, prev + 1))}
              disabled={currentPage === totalPages}
              className="rounded-2xl border border-slate-200 px-4 py-2 font-semibold text-slate-600 disabled:opacity-40"
            >
              Next
            </button>
          </div>
        </div>
      )}

      {showAdd && <ItemFormModal title="Add Item" onClose={() => setShowAdd(false)} onSubmit={handleAdd} />}
      {editItem && <ItemFormModal title="Edit Inventory Item" initialItem={editItem} onClose={() => setEditItem(null)} onSubmit={handleEdit} />}
      {stockItem && <StockModal item={stockItem} onClose={() => setStockItem(null)} onSubmit={handleStockUpdate} onOpenScanner={() => setScannerOpen(true)} />}
      {scannerOpen && <CameraScanner onDetected={handleScannerDetected} onClose={() => setScannerOpen(false)} />}
    </div>
  )
}

export default Inventory
