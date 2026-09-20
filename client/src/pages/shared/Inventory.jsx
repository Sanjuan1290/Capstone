import { BrowserMultiFormatReader } from '@zxing/browser'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  MdAdd, MdCameraAlt, MdClose, MdDelete, MdEdit, MdInventory2,
  MdQrCodeScanner, MdRefresh, MdSave, MdSearch, MdWarningAmber,
  MdCheckCircle, MdLocationOn, MdCalendarToday, MdFlashOn, MdCameraswitch, MdUploadFile,
} from 'react-icons/md'
import { useToast } from '../../components/ui/ToastProvider'
import ConfirmDialog from '../../components/ui/ConfirmDialog'

const CATEGORIES = [{ value: 'medical', label: 'General Medicine' }, { value: 'derma', label: 'Dermatology' }]
const ITEM_TYPES = [{ value: 'medicine', label: 'Medicine' }, { value: 'supplies', label: 'Supplies' }]
const FALLBACK_UOMS = ['piece', 'tablet', 'capsule', 'bottle', 'tube', 'sachet', 'vial', 'ampule', 'ml', 'gram', 'roll', 'pack', 'box']
const ITEMS_PER_PAGE = 5
const BATCHES_PER_PAGE = 4


const CODE39_PATTERNS = {
  '0':'nnnwwnwnn','1':'wnnwnnnnw','2':'nnwwnnnnw','3':'wnwwnnnnn','4':'nnnwwnnnw',
  '5':'wnnwwnnnn','6':'nnwwwnnnn','7':'nnnwnnwnw','8':'wnnwnnwnn','9':'nnwwnnwnn',
  A:'wnnnnwnnw',B:'nnwnnwnnw',C:'wnwnnwnnn',D:'nnnnwwnnw',E:'wnnnwwnnn',F:'nnwnwwnnn',
  G:'nnnnnwwnw',H:'wnnnnwwnn',I:'nnwnnwwnn',J:'nnnnwwwnn',K:'wnnnnnnww',L:'nnwnnnnww',
  M:'wnwnnnnwn',N:'nnnnwnnww',O:'wnnnwnnwn',P:'nnwnwnnwn',Q:'nnnnnnwww',R:'wnnnnnwwn',
  S:'nnwnnnwwn',T:'nnnnwnwwn',U:'wwnnnnnnw',V:'nwwnnnnnw',W:'wwwnnnnnn',X:'nwnnwnnnw',
  Y:'wwnnwnnnn',Z:'nwwnwnnnn','-':'nwnnnnwnw','.':'wwnnnnwnn',' ':'nwwnnnwnn',
  '$':'nwnwnwnnn','/':'nwnwnnnwn','+':'nwnnnwnwn','%':'nnnwnwnwn','*':'nwnnwnwnn',
}

const buildCode39 = (rawValue) => {
  const value = String(rawValue || '').trim().toUpperCase()
  if (!value || [...value].some((char) => !CODE39_PATTERNS[char] || char === '*')) return null
  const bars = []
  let x = 10
  for (const char of `*${value}*`) {
    const pattern = CODE39_PATTERNS[char]
    for (let index = 0; index < pattern.length; index += 1) {
      const width = pattern[index] === 'w' ? 3 : 1
      if (index % 2 === 0) bars.push({ x, width })
      x += width
    }
    x += 1
  }
  return { value, bars, width: x + 9 }
}

const BarcodePreview = ({ value, title = 'Barcode', compact = false }) => {
  const encoded = buildCode39(value)
  if (!String(value || '').trim()) return null
  if (!encoded) {
    return <div className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-xs text-amber-700">Barcode preview is unavailable for characters outside Code 39, but the entered code can still be saved and scanned by supported product scanners.</div>
  }
  return <div className={`rounded-2xl border border-slate-200 bg-white ${compact ? 'p-2.5' : 'p-4'}`}>
    <div className="mb-2 flex items-center justify-between gap-2">
      <span className="text-[10px] font-bold uppercase tracking-widest text-slate-400">{title}</span>
      <span className="rounded-full bg-emerald-50 px-2 py-0.5 text-[10px] font-bold text-emerald-700">Scannable</span>
    </div>
    <div className="overflow-hidden rounded-lg bg-white px-2 py-1">
      <svg viewBox={`0 0 ${encoded.width} 54`} className={`${compact ? 'h-10' : 'h-16'} w-full`} preserveAspectRatio="xMidYMid meet" role="img" aria-label={`${title}: ${encoded.value}`} shapeRendering="crispEdges">
        <rect width={encoded.width} height="54" fill="white" />
        {encoded.bars.map((bar, index) => <rect key={`${bar.x}-${index}`} x={bar.x} y="3" width={bar.width} height="46" fill="black" />)}
      </svg>
    </div>
    <p className={`mt-1 text-center font-mono font-bold tracking-[0.16em] text-slate-800 ${compact ? 'text-[9px]' : 'text-xs'}`}>{encoded.value}</p>
  </div>
}

const getNextGeneratedItemCode = (category, items = []) => {
  const prefix = category === 'derma' ? 'DRM' : 'GMED'
  let max = 0
  for (const item of items) {
    const match = String(item?.barcode || '').match(new RegExp(`^${prefix}-(\\d+)$`, 'i'))
    if (match) max = Math.max(max, Number(match[1]) || 0)
  }
  return `${prefix}-${String(max + 1).padStart(5, '0')}`
}

const getNextBatchCodePreview = (item) => {
  const prefix = String(item?.barcode || `ITEM-${item?.id || 'NEW'}`).trim()
  let max = 0
  for (const batch of Array.isArray(item?.batches) ? item.batches : []) {
    const escaped = prefix.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
    const match = String(batch?.batch_code || '').match(new RegExp(`^${escaped}-B(\\d+)$`, 'i'))
    if (match) max = Math.max(max, Number(match[1]) || 0)
  }
  return `${prefix}-B${String(max + 1).padStart(3, '0')}`
}

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
    <div className="fixed inset-0 z-[90] flex items-end justify-center bg-black/80 sm:items-center sm:px-4">
      <div className="flex h-[100dvh] w-full flex-col overflow-hidden bg-white shadow-2xl sm:h-auto sm:max-h-[94vh] sm:max-w-lg sm:rounded-3xl">
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

const ItemFormModal = ({ title, initialItem, initialBarcode = '', onClose, onSubmit, canManageSellingPrice = false, masterData = {}, onCreateSupplier, existingItems = [] }) => {
  const isEditing = Boolean(initialItem?.id)
  const [step, setStep] = useState(1)
  const [supplierChoice, setSupplierChoice] = useState(initialItem?.supplier_id ? String(initialItem.supplier_id) : '')
  const [otherSupplier, setOtherSupplier] = useState('')
  const [barcodeScannerOpen, setBarcodeScannerOpen] = useState(false)
  const [autoBatchCode, setAutoBatchCode] = useState(true)
  const [form, setForm] = useState({
    barcode: initialItem?.barcode || initialBarcode || '',
    name: initialItem?.name || '',
    category: ['medical','derma'].includes(initialItem?.category) ? initialItem.category : (String(initialItem?.category || '').toLowerCase().includes('derm') ? 'derma' : 'medical'),
    item_type: initialItem?.item_type || (String(initialItem?.category || '').toLowerCase() === 'supplies' ? 'supplies' : 'medicine'),
    uom: initialItem?.uom || initialItem?.base_unit || initialItem?.unit || 'piece',
    stock: String(isEditing ? 0 : (initialItem?.stock ?? 0)),
    threshold: String(initialItem?.threshold ?? 5),
    price: String(initialItem?.price ?? 0),
    selling_price: initialItem?.selling_price === null || initialItem?.selling_price === undefined ? '' : String(initialItem.selling_price),
    supplier: initialItem?.supplier || '',
    supplier_id: initialItem?.supplier_id || '',
    expiration_date: initialItem?.expiration_date ? String(initialItem.expiration_date).slice(0, 10) : '',
    batch_code: '',
    storage_location_id: '',
  })

  const categorySuppliers = (masterData.suppliers || []).filter((entry) => entry.category === form.category)
  const locations = masterData.locations || []
  const uoms = (masterData.uoms || []).map((entry) => String(entry.name || '').toLowerCase()).filter(Boolean)
  const uomOptions = uoms.length ? uoms : FALLBACK_UOMS
  const update = (key) => (e) => setForm(prev => ({ ...prev, [key]: e.target.value }))
  const normalizedBarcode = String(form.barcode || '').trim()
  const duplicateBarcode = normalizedBarcode
    ? existingItems.find((item) => Number(item.id) !== Number(initialItem?.id) && String(item.barcode || '').trim().toLowerCase() === normalizedBarcode.toLowerCase())
    : null
  const generatedItemPreview = getNextGeneratedItemCode(form.category, existingItems)
  const barcodePreview = normalizedBarcode || generatedItemPreview
  const initialBatchPreview = form.batch_code.trim() || `${barcodePreview}-B001`
  const canContinue = Boolean(form.name.trim() && form.category && form.item_type && form.uom && !duplicateBarcode)

  const goNext = () => { if (canContinue) setStep(2) }

  const handleScannedBarcode = (code) => {
    const normalized = String(code || '').trim()
    setBarcodeScannerOpen(false)
    if (!normalized) return
    setForm((current) => ({ ...current, barcode: normalized }))
  }

  const handleSubmit = async () => {
    if (!form.name.trim() || duplicateBarcode) return
    let supplierId = supplierChoice && supplierChoice !== 'other' ? Number(supplierChoice) : null
    let supplierName = categorySuppliers.find((x) => Number(x.id) === supplierId)?.name || form.supplier || ''
    if (supplierChoice === 'other') {
      if (!otherSupplier.trim()) return
      if (onCreateSupplier) {
        const created = await onCreateSupplier({ name: otherSupplier.trim(), category: form.category })
        supplierId = created?.id || null
        supplierName = created?.name || otherSupplier.trim()
      } else supplierName = otherSupplier.trim()
    }
    await onSubmit({
      ...form,
      batch_code: autoBatchCode ? '' : form.batch_code.trim(),
      supplier_id: supplierId,
      supplier: supplierName,
      unit: form.uom,
      base_unit: form.uom,
      unit_size: 1,
      stock: Math.max(0, parseFloat(form.stock) || 0),
      threshold: Math.max(0, parseFloat(form.threshold) || 0),
      price: Math.max(0, parseFloat(form.price) || 0),
      ...(canManageSellingPrice ? { selling_price: form.selling_price === '' ? null : Math.max(0, parseFloat(form.selling_price) || 0) } : {}),
    })
    onClose()
  }

  return <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/50 px-4">
    <div className="w-full max-w-2xl overflow-hidden rounded-3xl bg-white shadow-2xl">
      <div className="flex items-center justify-between border-b border-slate-100 px-6 py-4">
        <div><p className="text-base font-bold text-slate-900">{title}</p><p className="mt-0.5 text-sm text-slate-500">{isEditing ? 'Update the item definition. Stock remains managed by batch.' : 'Create the item first, then add its initial stock and batch.'}</p></div>
        <button onClick={onClose} className="flex h-9 w-9 items-center justify-center rounded-xl text-slate-400 hover:bg-slate-100" aria-label="Close"><MdClose/></button>
      </div>
      <div className="px-6 pt-5"><div className="grid grid-cols-2 gap-2 rounded-2xl bg-slate-100 p-1 text-sm font-semibold"><div className={`rounded-xl px-3 py-2 text-center ${step===1?'bg-white text-slate-900 shadow-sm':'text-slate-500'}`}>1. Item Details</div><div className={`rounded-xl px-3 py-2 text-center ${step===2?'bg-white text-slate-900 shadow-sm':'text-slate-500'}`}>2. Initial Stock & Batch</div></div></div>
      <div className="max-h-[68vh] overflow-y-auto p-6">{step===1 ? <div className="grid gap-4 md:grid-cols-2">
        <div className="md:col-span-2"><Field label="Item Name *"><input value={form.name} onChange={update('name')} className={inputClass} placeholder={form.item_type==='medicine'?'e.g. Amoxicillin 500mg':'e.g. Sterile Gauze Pad'}/></Field></div>
        <Field label="Category *"><select value={form.category} onChange={(e)=>{setForm(p=>({...p,category:e.target.value}));setSupplierChoice('');setOtherSupplier('')}} className={inputClass}>{CATEGORIES.map(x=><option key={x.value} value={x.value}>{x.label}</option>)}</select></Field>
        <Field label="Type *"><select value={form.item_type} onChange={update('item_type')} className={inputClass}>{ITEM_TYPES.map(x=><option key={x.value} value={x.value}>{x.label}</option>)}</select></Field>
        <div className="md:col-span-2">
          <Field label="Product Barcode">
            <div className="flex flex-col gap-2 sm:flex-row">
              <input value={form.barcode} onChange={update('barcode')} className={`${inputClass} flex-1`} placeholder={`Leave blank to auto-generate ${form.category==='derma'?'DRM':'GMED'} code`} />
              <button type="button" onClick={() => setBarcodeScannerOpen(true)} className="button-secondary shrink-0"><MdQrCodeScanner /> Scan Barcode</button>
              {form.barcode && <button type="button" onClick={() => setForm((current)=>({...current,barcode:''}))} className="button-secondary shrink-0">Use Auto Code</button>}
            </div>
          </Field>
          {duplicateBarcode ? <div className="mt-2 rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-xs font-semibold text-red-700">This barcode is already registered to <strong>{duplicateBarcode.name}</strong>. Use the existing inventory item instead.</div> : <p className="mt-2 text-xs text-slate-400">Scan or enter the manufacturer barcode when the product already has one. Leave it blank to create an internal {form.category==='derma'?'DRM':'GMED'} barcode code.</p>}
          <div className="mt-3"><BarcodePreview value={barcodePreview} title={normalizedBarcode ? 'Product Barcode Preview' : 'Auto-generated Barcode Preview'} /></div>
          {!normalizedBarcode && <p className="mt-1 text-[11px] text-amber-600">Preview only. The server reserves the final number when the item is saved, so the final code may advance if another item is created first.</p>}
        </div>
        <Field label="Unit of Measure *"><select value={form.uom} onChange={update('uom')} className={inputClass}>{uomOptions.map(x=><option key={x} value={x}>{x}</option>)}</select></Field>
        <Field label="Supplier"><select value={supplierChoice} onChange={(e)=>setSupplierChoice(e.target.value)} className={inputClass}><option value="">Select supplier (optional)</option>{categorySuppliers.map(x=><option key={x.id} value={x.id}>{x.name}</option>)}<option value="other">Other</option></select></Field>
        {supplierChoice==='other' && <Field label="Other Supplier *"><input value={otherSupplier} onChange={(e)=>setOtherSupplier(e.target.value)} className={inputClass} placeholder="Enter supplier name"/></Field>}
        <Field label="Low Stock Alert"><input type="number" min="0" step="0.01" value={form.threshold} onChange={update('threshold')} className={inputClass}/></Field>
        <div className="md:col-span-2 rounded-2xl border border-sky-100 bg-sky-50 px-4 py-3 text-sm text-sky-800"><strong>Category</strong> is the clinic area (General Medicine / Dermatology). <strong>Type</strong> is Medicine or Supplies. Stock uses one Unit of Measure.</div>
      </div> : <div className="grid gap-4 md:grid-cols-2">
        <div className="md:col-span-2 rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-700"><strong>{form.name}</strong><div className="mt-1 text-xs text-slate-500">{CATEGORIES.find(x=>x.value===form.category)?.label} · {ITEM_TYPES.find(x=>x.value===form.item_type)?.label} · Unit: {form.uom}</div></div>
        {!isEditing && <>
          <Field label="Initial Quantity"><input type="number" min="0" step="0.01" value={form.stock} onChange={update('stock')} className={inputClass}/></Field>
          <Field label="Storage Location *"><select value={form.storage_location_id} onChange={update('storage_location_id')} className={inputClass}><option value="">{locations.length ? 'Select location' : 'Main Stockroom'}</option>{locations.map(x=><option key={x.id} value={x.id}>{x.name}</option>)}</select></Field>
          <div className="md:col-span-2 space-y-3 rounded-2xl border border-slate-200 bg-slate-50 p-4">
            <label className="flex items-start gap-3 text-sm font-semibold text-slate-700"><input type="checkbox" checked={autoBatchCode} onChange={(e)=>setAutoBatchCode(e.target.checked)} className="mt-1"/><span><strong>Supplier did not provide a lot number</strong><span className="mt-0.5 block text-xs font-normal text-slate-500">Generate an internal batch code automatically.</span></span></label>
            {autoBatchCode ? <div className="rounded-xl border border-slate-200 bg-white px-4 py-3"><p className="text-[10px] font-bold uppercase tracking-widest text-slate-400">Generated Batch / Lot Preview</p><p className="mt-1 font-mono text-sm font-bold text-slate-800">{initialBatchPreview}</p></div> : <Field label="Batch / Lot No. *"><input value={form.batch_code} onChange={update('batch_code')} className={inputClass} placeholder="Enter supplier lot number"/></Field>}
            <BarcodePreview value={initialBatchPreview} title="Batch Barcode Preview" />
          </div>
          <Field label="Batch Expiry"><input type="date" value={form.expiration_date} onChange={update('expiration_date')} className={inputClass}/></Field>
        </>}
        <Field label="Unit Cost"><input type="number" min="0" step="0.01" value={form.price} onChange={update('price')} className={inputClass}/></Field>
        {canManageSellingPrice ? <Field label="Selling Price per Unit"><input type="number" min="0" step="0.01" value={form.selling_price} onChange={update('selling_price')} className={inputClass} placeholder="Optional"/></Field> : <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-600"><span className="font-semibold">Selling Price per Unit:</span> {initialItem?.selling_price == null?'Not configured by Admin':`PHP ${Number(initialItem.selling_price).toFixed(2)}`}</div>}
        {isEditing && <div className="md:col-span-2 rounded-2xl border border-sky-100 bg-sky-50 px-4 py-3 text-sm text-sky-700">Use <strong>Stock In / Out</strong> for new deliveries and stock-outs. Existing batch history is preserved.</div>}
      </div>}</div>
      <div className="flex gap-3 border-t border-slate-100 px-6 py-5">{step===1?<><button onClick={onClose} className="flex-1 rounded-2xl border border-slate-200 py-3 text-sm font-semibold text-slate-600">Cancel</button><button onClick={goNext} disabled={!canContinue} className="flex-1 rounded-2xl bg-[#0b1a2c] py-3 text-sm font-semibold text-white disabled:opacity-50">Next</button></>:<><button onClick={()=>setStep(1)} className="flex-1 rounded-2xl border border-slate-200 py-3 text-sm font-semibold text-slate-600">Back</button><button onClick={handleSubmit} disabled={Boolean(duplicateBarcode) || (!isEditing && Number(form.stock||0)>0 && locations.length>0 && !form.storage_location_id) || (!isEditing && Number(form.stock||0)>0 && !autoBatchCode && !form.batch_code.trim())} className="flex-1 rounded-2xl bg-[#0b1a2c] py-3 text-sm font-semibold text-white flex items-center justify-center gap-2 disabled:opacity-50"><MdSave/> {isEditing?'Save Changes':'Add Item'}</button></>}</div>
    </div>
    {barcodeScannerOpen && <CameraScanner onDetected={handleScannedBarcode} onClose={()=>setBarcodeScannerOpen(false)} />}
  </div>
}

const StorageLocationModal = ({ onClose, onCreate }) => {
  const [name,setName]=useState('')
  const [locationType,setLocationType]=useState('storage')
  const [busy,setBusy]=useState(false)
  const save=async()=>{if(!name.trim())return;setBusy(true);try{await onCreate({name:name.trim(),location_type:locationType});onClose()}finally{setBusy(false)}}
  return <div className="fixed inset-0 z-[70] flex items-center justify-center bg-black/50 px-4"><div className="w-full max-w-md rounded-3xl bg-white p-6 shadow-2xl"><div className="flex justify-between"><div><h3 className="font-bold text-slate-900">Add Storage Location</h3><p className="mt-1 text-xs text-slate-500">Create a reusable inventory location.</p></div><button onClick={onClose}><MdClose/></button></div><div className="mt-5 grid gap-4"><Field label="Location Name *"><input className={inputClass} value={name} onChange={e=>setName(e.target.value)} placeholder="e.g. Dermatology Cabinet A"/></Field><Field label="Location Type"><select className={inputClass} value={locationType} onChange={e=>setLocationType(e.target.value)}><option value="stockroom">Main Stockroom</option><option value="room">Treatment Room</option><option value="dispensing">Dispensing Area</option><option value="storage">General Storage</option></select></Field><div className="flex justify-end gap-2"><button className="button-secondary" onClick={onClose}>Cancel</button><button className="button-primary" disabled={busy||!name.trim()} onClick={save}>{busy?'Saving...':'Add Location'}</button></div></div></div></div>
}


const StorageLocationsSection = ({ locations = [], items = [], onAdd, onEdit, onDelete }) => {
  const [search, setSearch] = useState('')
  const [edit, setEdit] = useState(null)
  const [form, setForm] = useState({ name: '', location_type: 'storage', is_active: 1 })
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const visible = locations.filter((location) => String(location.name || '').toLowerCase().includes(search.toLowerCase()))
  const usageFor = (location) => {
    const inventoryIds = new Set(); const batchIds = new Set()
    items.forEach((item) => (item.batches || []).forEach((batch) => (batch.locations || []).forEach((entry) => {
      if ((Number(entry.location_id) === Number(location.id) || entry.name === location.name) && Number(entry.quantity || 0) > 0) { inventoryIds.add(item.id); batchIds.add(batch.id) }
    })))
    return { items: Number(location.item_count ?? inventoryIds.size), batches: Number(location.batch_count ?? batchIds.size) }
  }
  const openEdit = (location) => { setEdit(location); setForm({ name: location.name || '', location_type: location.location_type || 'storage', is_active: Number(location.is_active ?? 1) }); setError('') }
  const save = async () => { if (!onEdit || !form.name.trim()) return; setBusy(true); setError(''); try { await onEdit(edit.id, form); setEdit(null) } catch (e) { setError(e.message || 'Could not update location.') } finally { setBusy(false) } }
  const remove = async (location) => { if (!onDelete) return; if (!window.confirm(`Delete ${location.name}? Only unused locations can be permanently deleted.`)) return; try { await onDelete(location.id) } catch (e) { alert(e.message || 'Could not delete location.') } }
  return <section className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
    <div className="flex flex-wrap items-start justify-between gap-3"><div><h2 className="text-lg font-bold text-slate-800">Storage Locations</h2><p className="mt-1 text-sm text-slate-500">Manage the actual rooms, cabinets, stockrooms, and dispensing areas where batches are stored.</p></div>{onAdd && <button type="button" onClick={onAdd} className="button-primary"><MdAdd/> Add Storage Location</button>}</div>
    <div className="mt-4 flex items-center gap-2 rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3"><MdSearch className="text-slate-400"/><input className="w-full bg-transparent text-sm outline-none" value={search} onChange={(e)=>setSearch(e.target.value)} placeholder="Search storage locations..."/></div>
    <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-3">{visible.map((location)=>{const usage=usageFor(location);return <div key={location.id} className={`rounded-2xl border p-4 ${Number(location.is_active ?? 1) ? 'border-slate-200' : 'border-slate-200 bg-slate-50 opacity-70'}`}><div className="flex items-start justify-between gap-3"><div><p className="font-bold text-slate-800">{location.name}</p><p className="mt-1 text-xs text-slate-500">{String(location.location_type || 'storage').replaceAll('_',' ').replace(/\b\w/g,c=>c.toUpperCase())}</p></div><span className={`rounded-full px-2 py-1 text-[10px] font-bold ${Number(location.is_active ?? 1)?'bg-emerald-50 text-emerald-700':'bg-slate-200 text-slate-600'}`}>{Number(location.is_active ?? 1)?'ACTIVE':'INACTIVE'}</span></div><p className="mt-4 text-sm text-slate-600"><strong>{usage.items}</strong> items · <strong>{usage.batches}</strong> active batches</p><div className="mt-4 flex justify-end gap-2">{onEdit&&<button type="button" className="button-secondary" onClick={()=>openEdit(location)}><MdEdit/> Edit</button>}{onDelete&&<button type="button" className="button-secondary text-red-600" onClick={()=>remove(location)}><MdDelete/> Delete</button>}</div></div>})}</div>
    {!visible.length && <div className="mt-4 rounded-2xl bg-slate-50 p-8 text-center text-sm text-slate-400">No storage locations found.</div>}
    {edit && <div className="fixed inset-0 z-[80] flex items-center justify-center bg-black/50 px-4"><div className="w-full max-w-md rounded-3xl bg-white p-6 shadow-2xl"><div className="flex items-start justify-between"><div><h3 className="font-bold text-slate-900">Edit Storage Location</h3><p className="mt-1 text-xs text-slate-500">Location history is preserved even when the location is renamed.</p></div><button type="button" onClick={()=>!busy&&setEdit(null)}><MdClose/></button></div><div className="mt-5 space-y-4"><Field label="Location Name *"><input className={inputClass} value={form.name} onChange={(e)=>setForm(p=>({...p,name:e.target.value}))}/></Field><Field label="Location Type *"><select className={inputClass} value={form.location_type} onChange={(e)=>setForm(p=>({...p,location_type:e.target.value}))}><option value="stockroom">Main Stockroom</option><option value="room">Treatment Room</option><option value="dispensing">Dispensing Area</option><option value="storage">General Storage</option></select></Field>{onDelete && <Field label="Status"><select className={inputClass} value={form.is_active} onChange={(e)=>setForm(p=>({...p,is_active:Number(e.target.value)}))}><option value={1}>Active</option><option value={0}>Inactive</option></select></Field>}{error&&<p className="rounded-xl bg-red-50 px-3 py-2 text-sm text-red-600">{error}</p>}<div className="flex justify-end gap-2"><button type="button" className="button-secondary" disabled={busy} onClick={()=>setEdit(null)}>Cancel</button><button type="button" className="button-primary" disabled={busy||!form.name.trim()} onClick={save}>{busy?'Saving...':'Save Changes'}</button></div></div></div></div>}
  </section>
}

const StockModal = ({ item, onClose, onSubmit, locations = [] }) => {
  const [type, setType] = useState('in')
  const [qty, setQty] = useState('1')
  const [note, setNote] = useState('')
  const [expirationDate, setExpirationDate] = useState('')
  const [movementReason, setMovementReason] = useState('received')
  const [stockOutMode, setStockOutMode] = useState('fefo')
  const [batchPage, setBatchPage] = useState(1)
  const [batchAllocations, setBatchAllocations] = useState(
    Array.isArray(item?.batches) ? item.batches.map((batch) => ({ batch_id: batch.id, quantity: '' })) : []
  )
  const [stockInBatchMode, setStockInBatchMode] = useState(Array.isArray(item?.batches) && item.batches.length ? 'pick' : 'new')
  const [selectedBatchId, setSelectedBatchId] = useState('')
  const [batchSearch, setBatchSearch] = useState('')
  const [batchPickerOpen, setBatchPickerOpen] = useState(false)
  const [newBatchCode, setNewBatchCode] = useState('')
  const [autoGenerateBatch, setAutoGenerateBatch] = useState(false)
  const [batchScannerOpen, setBatchScannerOpen] = useState(false)
  const mainLocation = locations.find((location) => String(location.name).toLowerCase() === 'main stockroom')
  const [locationId, setLocationId] = useState(mainLocation?.id ? String(mainLocation.id) : (locations[0]?.id ? String(locations[0].id) : ''))

  const batches = Array.isArray(item?.batches) ? item.batches : []
  const stockOutBatches = batches.filter((batch) => getBatchLocationQuantity(batch) > 0)
  const selectedBatch = batches.find((batch) => Number(batch.id) === Number(selectedBatchId)) || null
  const available = stockOutBatches.length > 0 ? stockOutBatches.reduce((sum, batch) => sum + getBatchLocationQuantity(batch), 0) : getPackageCount(item)
  const numericQty = Math.max(0, Number(qty) || 0)
  const selectedBatchQty = batchAllocations.reduce((sum, batch) => sum + Number(batch.quantity || 0), 0)
  const exactBatchReason = type === 'out' && ['expired', 'damaged', 'wastage', 'returned_to_supplier'].includes(movementReason)
  const isManualStockOut = type === 'out' && stockOutMode === 'manual'
  const effectiveQty = isManualStockOut ? selectedBatchQty : numericQty
  const manualModeInvalid = isManualStockOut && selectedBatchQty <= 0
  const totalBatchPages = Math.max(1, Math.ceil(stockOutBatches.length / BATCHES_PER_PAGE))
  const currentBatchPage = Math.min(batchPage, totalBatchPages)
  const paginatedBatches = stockOutBatches.slice((currentBatchPage - 1) * BATCHES_PER_PAGE, currentBatchPage * BATCHES_PER_PAGE)
  const autoBatchPreview = getNextBatchCodePreview(item)
  const effectiveNewBatchCode = autoGenerateBatch ? autoBatchPreview : newBatchCode.trim()
  const filteredStockInBatches = batches.filter((batch) => {
    const needle = batchSearch.trim().toLowerCase()
    if (!needle) return true
    return String(batch.batch_code || `Batch #${batch.id}`).toLowerCase().includes(needle)
      || String(batch.expiration_date || '').toLowerCase().includes(needle)
  })

  const fefoPreview = useMemo(() => {
    if (type !== 'out' || stockOutMode !== 'fefo' || numericQty <= 0) return []
    const today = new Date(); today.setHours(0,0,0,0)
    let remaining = numericQty
    const allocation = []
    for (const batch of stockOutBatches) {
      if (remaining <= 0) break
      const expiry = batch.expiration_date ? parseDateOnly(batch.expiration_date) : null
      if (expiry) { expiry.setHours(0,0,0,0); if (expiry < today) continue }
      const usable = getBatchLocationQuantity(batch)
      if (usable <= 0) continue
      const used = Math.min(usable, remaining)
      allocation.push({ ...batch, allocation: used })
      remaining -= used
    }
    return allocation
  }, [stockOutBatches, numericQty, stockOutMode, type])

  useEffect(() => { setBatchPage(1) }, [item?.id, type, stockOutMode])
  useEffect(() => { setMovementReason(type === 'in' ? 'received' : 'adjustment_out') }, [type])
  useEffect(() => { if (exactBatchReason && stockOutMode !== 'manual') setStockOutMode('manual') }, [exactBatchReason, stockOutMode])
  useEffect(() => { if (batchPage > totalBatchPages) setBatchPage(totalBatchPages) }, [batchPage, totalBatchPages])

  const selectExistingBatch = (batch) => {
    setSelectedBatchId(String(batch.id))
    setBatchSearch(batch.batch_code || `Batch #${batch.id}`)
    setStockInBatchMode('existing')
    setBatchPickerOpen(false)
    setExpirationDate(batch.expiration_date ? String(batch.expiration_date).slice(0,10) : '')
  }

  const startNewBatch = () => {
    setSelectedBatchId('')
    setBatchSearch('')
    setStockInBatchMode('new')
    setBatchPickerOpen(false)
    setExpirationDate('')
    setNewBatchCode('')
    setAutoGenerateBatch(false)
  }

  const handleScannedBatch = (code) => {
    const normalized = String(code || '').trim()
    setBatchScannerOpen(false)
    if (!normalized) return
    const existing = batches.find((batch) => String(batch.batch_code || '').trim().toLowerCase() === normalized.toLowerCase())
    if (existing) selectExistingBatch(existing)
    else {
      setStockInBatchMode('new')
      setSelectedBatchId('')
      setNewBatchCode(normalized)
      setAutoGenerateBatch(false)
    }
  }

  const updateBatchQty = (batchId, value) => {
    const maxForBatch = getBatchLocationQuantity(item?.batches?.find((batch) => batch.id === batchId))
    setBatchAllocations((prev) => prev.map((batch) => (
      batch.batch_id === batchId ? { ...batch, quantity: value === '' ? '' : Math.min(maxForBatch, Math.max(0, parseFloat(value || '0'))) } : batch
    )))
  }
  const fillBatchQty = (batchId, quantity) => setBatchAllocations((prev) => prev.map((batch) => batch.batch_id === batchId ? { ...batch, quantity } : batch))

  const stockInInvalid = type === 'in' && (
    numericQty <= 0
    || (stockInBatchMode === 'pick')
    || (stockInBatchMode === 'existing' && !selectedBatch)
    || (stockInBatchMode === 'new' && !autoGenerateBatch && !newBatchCode.trim())
  )

  const handleSave = () => onSubmit({
    type,
    qty: effectiveQty,
    note,
    movement_reason: movementReason,
    expiration_date: type === 'in' && stockInBatchMode === 'new' ? expirationDate : '',
    batch_code: type === 'in' && stockInBatchMode === 'new' ? (autoGenerateBatch ? '' : newBatchCode.trim()) : '',
    existing_batch_id: type === 'in' && stockInBatchMode === 'existing' ? Number(selectedBatchId) : null,
    storage_location_id: type === 'in' && locationId ? Number(locationId) : null,
    selected_batches: isManualStockOut
      ? batchAllocations.filter((batch) => Number(batch.quantity || 0) > 0).map((batch) => ({ batch_id: batch.batch_id, quantity: Number(batch.quantity) }))
      : [],
  })

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/50 px-4">
      <div className="flex max-h-[90vh] w-full max-w-lg flex-col overflow-hidden rounded-3xl bg-white shadow-2xl">
        <div className="flex shrink-0 items-center justify-between border-b border-slate-100 px-6 py-4">
          <div><p className="text-sm font-bold text-slate-800">{item.name}</p><p className="text-xs text-slate-400">Available: {available} {item.uom || item.unit}</p></div>
          <button onClick={onClose} className="w-8 h-8 rounded-xl hover:bg-slate-100 text-slate-400 flex items-center justify-center" aria-label="Close"><MdClose /></button>
        </div>
        <div className="flex-1 overflow-y-auto px-6 py-6"><div className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <button onClick={() => setType('in')} className={`rounded-2xl border py-3 text-sm font-semibold ${type === 'in' ? 'bg-emerald-50 border-emerald-300 text-emerald-700' : 'border-slate-200 text-slate-600'}`}>Stock In</button>
            <button onClick={() => setType('out')} className={`rounded-2xl border py-3 text-sm font-semibold ${type === 'out' ? 'bg-red-50 border-red-300 text-red-600' : 'border-slate-200 text-slate-600'}`}>Stock Out</button>
          </div>

          {(!isManualStockOut || type === 'in') ? <Field label={`Quantity (${item.uom || item.unit}) *`}><input type="number" min="0.01" step="0.01" value={qty} onChange={e => setQty(e.target.value)} className={inputClass} /></Field> : <div className="rounded-2xl border border-sky-200 bg-sky-50 px-4 py-3"><p className="text-xs font-bold uppercase tracking-widest text-sky-700">Selected Stock-Out Quantity</p><p className="mt-1 text-2xl font-black text-sky-900">{selectedBatchQty}</p><p className="mt-1 text-xs text-sky-700">Total is calculated from the batches you choose below.</p></div>}

          <Field label="Movement Reason *"><select value={movementReason} onChange={e => setMovementReason(e.target.value)} className={inputClass}>{(type === 'in' ? STOCK_IN_REASONS : STOCK_OUT_REASONS).map((reason) => <option key={reason.value} value={reason.value}>{reason.label}</option>)}</select></Field>

          {type === 'in' && <div className="space-y-4 rounded-2xl border border-slate-200 bg-slate-50 p-4">
            <div>
              <p className="text-xs font-bold uppercase tracking-widest text-slate-400">Batch / Lot No. *</p>
              {stockInBatchMode !== 'new' && <div className="relative mt-1.5">
                <div className="flex gap-2">
                  <div className="relative flex-1"><MdSearch className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400"/><input value={batchSearch} onFocus={()=>setBatchPickerOpen(true)} onChange={(e)=>{setBatchSearch(e.target.value);setSelectedBatchId('');setStockInBatchMode('pick');setBatchPickerOpen(true)}} className={`${inputClass} pl-10`} placeholder="Search batch / lot number..." /></div>
                  <button type="button" onClick={()=>setBatchScannerOpen(true)} className="button-secondary shrink-0"><MdQrCodeScanner /> Scan</button>
                </div>
                {batchPickerOpen && <div className="absolute left-0 right-0 top-full z-30 mt-2 max-h-72 overflow-y-auto rounded-2xl border border-slate-200 bg-white p-2 shadow-xl">
                  <p className="px-3 py-2 text-[10px] font-bold uppercase tracking-widest text-slate-400">Existing Batches</p>
                  {filteredStockInBatches.length ? filteredStockInBatches.map((batch)=><button key={batch.id} type="button" onClick={()=>selectExistingBatch(batch)} className="w-full rounded-xl px-3 py-2.5 text-left hover:bg-slate-50"><div className="flex items-start justify-between gap-3"><div><p className="text-sm font-bold text-slate-800">{batch.batch_code || `Batch #${batch.id}`}</p><p className="mt-0.5 text-xs text-slate-500">Expiry: {batch.expiration_date ? formatDate(batch.expiration_date) : 'No expiry'}</p></div><span className="text-xs font-semibold text-slate-500">{Number(batch.quantity || 0)} {item.uom || item.unit}</span></div></button>) : <p className="px-3 py-3 text-xs text-slate-400">No existing batch matches your search.</p>}
                  <div className="my-1 border-t border-slate-100"/><button type="button" onClick={startNewBatch} className="flex w-full items-center gap-2 rounded-xl px-3 py-2.5 text-left text-sm font-bold text-sky-700 hover:bg-sky-50"><MdAdd /> Create New Batch</button>
                </div>}
              </div>}
            </div>

            {stockInBatchMode === 'existing' && selectedBatch && <div className="space-y-3 rounded-2xl border border-emerald-200 bg-emerald-50 p-4">
              <div className="flex items-start justify-between gap-3"><div><p className="text-[10px] font-bold uppercase tracking-widest text-emerald-700">Existing Batch Selected</p><p className="mt-1 font-mono text-sm font-bold text-slate-900">{selectedBatch.batch_code || `Batch #${selectedBatch.id}`}</p></div><button type="button" onClick={()=>{setStockInBatchMode('pick');setSelectedBatchId('');setBatchSearch('');setBatchPickerOpen(true)}} className="text-xs font-bold text-sky-700">Change</button></div>
              <div className="grid grid-cols-2 gap-3 text-sm"><div><p className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Batch Expiry</p><p className="mt-1 font-semibold text-slate-700">{selectedBatch.expiration_date ? formatDate(selectedBatch.expiration_date) : 'No expiry'}</p><p className="text-[10px] text-slate-400">Locked for existing batch</p></div><div><p className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Current Stock</p><p className="mt-1 font-semibold text-slate-700">{Number(selectedBatch.quantity || 0)} {item.uom || item.unit}</p></div></div>
              <div className="rounded-xl bg-white px-3 py-2 text-xs text-slate-600">After Stock In: <strong>{Number(selectedBatch.quantity || 0) + numericQty} {item.uom || item.unit}</strong></div>
              <BarcodePreview value={selectedBatch.batch_code || `${item.barcode}-B${String(selectedBatch.id).padStart(3,'0')}`} title="Batch Barcode" compact />
            </div>}

            {stockInBatchMode === 'new' && <div className="space-y-3">
              <div className="flex items-center justify-between gap-3"><p className="text-sm font-bold text-slate-800">Create New Batch</p>{batches.length > 0 && <button type="button" onClick={()=>{setStockInBatchMode('pick');setBatchPickerOpen(true)}} className="text-xs font-bold text-sky-700">Choose Existing</button>}</div>
              {!autoGenerateBatch && <Field label="New Batch / Lot No. *"><div className="flex gap-2"><input value={newBatchCode} onChange={e=>setNewBatchCode(e.target.value)} className={`${inputClass} flex-1`} placeholder="Enter or scan supplier lot number"/><button type="button" onClick={()=>setBatchScannerOpen(true)} className="button-secondary shrink-0"><MdQrCodeScanner /> Scan</button></div></Field>}
              <label className="flex items-start gap-3 rounded-xl border border-slate-200 bg-white px-3 py-3 text-sm text-slate-700"><input type="checkbox" checked={autoGenerateBatch} onChange={(e)=>setAutoGenerateBatch(e.target.checked)} className="mt-1"/><span><strong>Supplier did not provide a lot number</strong><span className="mt-0.5 block text-xs text-slate-500">Generate {autoBatchPreview} automatically.</span></span></label>
              <Field label="Batch Expiry"><input type="date" value={expirationDate} onChange={e => setExpirationDate(e.target.value)} className={inputClass} /></Field>
              <BarcodePreview value={effectiveNewBatchCode} title="New Batch Barcode Preview" compact />
            </div>}

            <Field label="Storage Location *"><select value={locationId} onChange={(e)=>setLocationId(e.target.value)} className={inputClass}><option value="">{locations.length ? 'Select location' : 'Main Stockroom'}</option>{locations.map((location)=><option key={location.id} value={location.id}>{location.name}</option>)}</select></Field>
          </div>}

          <Field label="Movement Note"><input value={note} onChange={e => setNote(e.target.value)} className={inputClass} placeholder={type === 'in' ? 'e.g. Delivery receipt DR-1024' : 'Explain the stock-out when needed'} /></Field>

          {type === 'out' && <div className="space-y-3">
            {!exactBatchReason && <div className="rounded-2xl border border-amber-200 bg-amber-50 p-4"><div className="flex items-center justify-between gap-3"><div><p className="text-xs font-bold uppercase tracking-widest text-amber-700">Batch Allocation</p><p className="mt-1 text-sm font-semibold text-amber-900">Automatic — Earliest Expiry First (FEFO)</p></div><button type="button" onClick={()=>setStockOutMode(stockOutMode==='fefo'?'manual':'fefo')} className="rounded-xl border border-amber-300 bg-white px-3 py-2 text-xs font-bold text-amber-700">{stockOutMode==='fefo'?'Change Batch':'Use FEFO'}</button></div>{stockOutMode==='fefo' && <div className="mt-3 space-y-1">{fefoPreview.length ? fefoPreview.map((batch)=><div key={batch.id} className="flex justify-between rounded-xl bg-white px-3 py-2 text-xs text-slate-600"><span>{batch.batch_code || `Batch #${batch.id}`} · {batch.expiration_date ? formatDate(batch.expiration_date) : 'No expiry'}</span><strong>{batch.allocation} {item.uom || item.unit}</strong></div>) : <p className="text-xs text-amber-700">Enter a quantity to preview FEFO allocation.</p>}</div>}</div>}
            {exactBatchReason && <div className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">This movement reason requires an exact batch/lot selection so expiry, damage, wastage, or supplier returns remain fully traceable.</div>}
          </div>}

          {type === 'out' && stockOutMode === 'manual' && stockOutBatches.length > 0 && <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
            <div className="flex items-center justify-between gap-3"><p className="text-xs font-bold uppercase tracking-widest text-slate-400">Choose Batch Quantities</p>{stockOutBatches.length > BATCHES_PER_PAGE && <span className="text-[11px] font-semibold text-slate-500">Page {currentBatchPage} of {totalBatchPages}</span>}</div>
            <div className="mt-3 space-y-2">{paginatedBatches.map(batch => <div key={batch.id} className="rounded-2xl bg-white px-3 py-3 text-sm text-slate-600"><div className="flex items-center justify-between gap-3"><div><p className="font-semibold text-slate-800">{batch.batch_code || `Batch #${batch.id}`}</p><p className="text-[11px] text-slate-400">{batch.expiration_date ? `Expires ${formatDate(batch.expiration_date)}` : 'No expiry'} · Main Stockroom: {getBatchLocationQuantity(batch)}</p></div></div><div className="mt-2 flex gap-2"><input type="number" min="0" max={getBatchLocationQuantity(batch)} value={batchAllocations.find((entry) => entry.batch_id === batch.id)?.quantity ?? ''} onChange={(e)=>updateBatchQty(batch.id,e.target.value)} placeholder="Qty" className={inputClass}/><button type="button" onClick={()=>fillBatchQty(batch.id,getBatchLocationQuantity(batch))} className="button-secondary shrink-0">Use all</button></div></div>)}</div>
            {stockOutBatches.length > BATCHES_PER_PAGE && <div className="mt-3 flex items-center justify-between gap-2"><button type="button" onClick={()=>setBatchPage(prev=>Math.max(1,prev-1))} disabled={currentBatchPage===1} className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-600 disabled:opacity-40">Previous</button><button type="button" onClick={()=>setBatchPage(prev=>Math.min(totalBatchPages,prev+1))} disabled={currentBatchPage===totalBatchPages} className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-600 disabled:opacity-40">Next</button></div>}
            <p className={`mt-3 text-xs font-semibold ${manualModeInvalid ? 'text-rose-600' : 'text-slate-500'}`}>{manualModeInvalid ? 'Select at least one batch quantity before saving.' : `Selected total: ${selectedBatchQty} ${item.uom || item.unit}`}</p>
          </div>}
        </div></div>
        <div className="shrink-0 border-t border-slate-100 bg-white px-6 pb-6 pt-4"><button onClick={handleSave} disabled={stockInInvalid || (type === 'out' && !isManualStockOut && (numericQty <= 0 || numericQty > available)) || manualModeInvalid} className="w-full rounded-2xl bg-[#0b1a2c] py-3 text-sm font-semibold text-white disabled:opacity-40">Save Stock Update</button></div>
      </div>
      {batchScannerOpen && <CameraScanner onDetected={handleScannedBatch} onClose={()=>setBatchScannerOpen(false)} />}
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

const Inventory = ({ services, canManageSellingPrice = false }) => {
  const toast = useToast()
  const { getInventory, updateStock, addInventoryItem, updateInventoryItem, deleteInventoryItem, getInventoryMasterData, getInventoryLocations, createInventoryLocation, updateInventoryLocation, deleteInventoryLocation, createInventorySupplier } = services
  const [items, setItems] = useState([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [category, setCategory] = useState('All')
  const [showAdd, setShowAdd] = useState(false)
  const [newItemBarcode, setNewItemBarcode] = useState('')
  const [showLocation, setShowLocation] = useState(false)
  const [masterData, setMasterData] = useState({ uoms: [], suppliers: [], locations: [] })
  const [editItem, setEditItem] = useState(null)
  const [deleteCandidate, setDeleteCandidate] = useState(null)
  const [deleting, setDeleting] = useState(false)
  const [stockItem, setStockItem] = useState(null)
  const [scannerOpen, setScannerOpen] = useState(false)
  const [feedback, setFeedback] = useState(null)
  const [page, setPage] = useState(1)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const [data, masters, locationRows] = await Promise.all([
        getInventory(),
        getInventoryMasterData ? getInventoryMasterData().catch(() => null) : Promise.resolve(null),
        getInventoryLocations ? getInventoryLocations().catch(() => null) : Promise.resolve(null),
      ])
      setItems(Array.isArray(data) ? data : data?.items || [])
      if (masters || locationRows) setMasterData({ uoms: masters?.uoms || [], suppliers: masters?.suppliers || [], locations: Array.isArray(locationRows) ? locationRows : (masters?.locations || []) })
    } finally {
      setLoading(false)
    }
  }, [getInventory, getInventoryMasterData, getInventoryLocations])

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

  const handleDelete = (item) => setDeleteCandidate(item)

  const confirmDelete = async () => {
    if (!deleteCandidate?.id) return
    setDeleting(true)
    try {
      await deleteInventoryItem(deleteCandidate.id)
      setItems(prev => prev.filter(entry => entry.id !== deleteCandidate.id))
      setFeedback({ type: 'success', message: `${deleteCandidate.name} was removed from inventory.` })
      setDeleteCandidate(null)
    } catch (err) {
      setFeedback({ type: 'error', message: err.message || 'Failed to remove inventory item.' })
    } finally {
      setDeleting(false)
    }
  }

  const handleStockUpdate = async (payload) => {
    try {
      await updateStock(stockItem.id, payload)
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
      if (typeof toast.info === 'function') toast.info(`Barcode ${normalizedCode} is not registered yet. Add Item has been opened with the scanned barcode.`)
      else toast.warning(`Barcode ${normalizedCode} is not registered yet. Add Item has been opened with the scanned barcode.`)
      setNewItemBarcode(normalizedCode)
      setShowAdd(true)
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
          <p className="text-sm text-slate-500 mt-1">Batch-aware inventory with category/type classification, generated barcodes, storage locations, and single-unit stock tracking.</p>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={load} className="w-10 h-10 rounded-xl border border-slate-200 text-slate-500 hover:bg-slate-50 flex items-center justify-center"><MdRefresh className="text-[18px]" /></button>
          <button onClick={() => setScannerOpen(true)} className="rounded-2xl border border-sky-200 bg-sky-50 px-4 py-3 text-sm font-semibold text-sky-700 flex items-center gap-2"><MdQrCodeScanner /> Scan Barcode</button>
          {createInventoryLocation && <button onClick={() => setShowLocation(true)} className="rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm font-semibold text-slate-700 flex items-center gap-2"><MdLocationOn /> Add Storage Location</button>}<button onClick={() => { setNewItemBarcode(''); setShowAdd(true) }} className="rounded-2xl bg-[#0b1a2c] px-4 py-3 text-sm font-semibold text-white flex items-center gap-2"><MdAdd /> Add Item</button>
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
          {['All', ...CATEGORIES.map(x => x.value)].map(option => (
            <button key={option} onClick={() => setCategory(option)} className={`rounded-2xl px-4 py-3 text-sm font-semibold ${category === option ? 'bg-[#0b1a2c] text-white' : 'bg-white border border-slate-200 text-slate-600'}`}>
              {option === 'All' ? 'All' : (CATEGORIES.find(x => x.value === option)?.label || option)}
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
                <p className="text-sm text-slate-500">{CATEGORIES.find(x=>x.value===item.category)?.label || item.category} · {(ITEM_TYPES.find(x=>x.value===item.item_type)?.label || item.item_type || 'Supplies')} · {item.barcode || 'No barcode'} · {item.supplier || 'No supplier'}</p>
                <p className="text-sm text-slate-600">
                  <strong>{Number(item.stock ?? item.stock_base ?? 0)}</strong> {item.uom || item.base_unit || item.unit} in stock
                </p>
                <p className="text-xs text-slate-400">Low stock threshold: {item.threshold} {item.uom || item.unit} · Unit cost PHP {Number(item.price || 0).toFixed(2)} · Patient price {item.selling_price === null || item.selling_price === undefined ? 'not configured' : `PHP ${Number(item.selling_price).toFixed(2)}`}</p>
                {item.barcode && <div className="max-w-sm pt-1"><BarcodePreview value={item.barcode} title="Item Barcode" compact /></div>}
                <div className="flex flex-wrap gap-3 pt-1 text-xs">
                  <span className="inline-flex items-center gap-1 text-slate-500">
                    <MdLocationOn className="text-[14px]" /> {Array.from(new Set((item.batches || []).flatMap((batch)=>(batch.locations || []).filter((location)=>Number(location.quantity || 0)>0).map((location)=>location.name)))).join(', ') || item.storage_location || 'No location assigned'}
                  </span>
                  <span className={`inline-flex items-center gap-1 ${getExpiryMeta(item).tone}`}>
                    <MdCalendarToday className="text-[14px]" /> {getExpiryMeta(item).label}
                  </span>
                </div>
                {Array.isArray(item.batches) && item.batches.some((batch)=>Number(batch.quantity || 0)>0) && (
                  <div className="pt-3">
                    <p className="text-xs font-bold uppercase tracking-widest text-slate-400">Batches</p>
                    <div className="mt-2 flex flex-wrap gap-2">
                      {item.batches.filter((batch)=>Number(batch.quantity || 0)>0).slice(0, 4).map(batch => (
                        <span key={batch.id} className="rounded-full border border-slate-200 bg-slate-50 px-3 py-1 text-xs text-slate-600">
                          {batch.batch_code || `Batch #${batch.id}`} - {formatBatchLabel(batch, item.unit)}
                        </span>
                      ))}
                      {item.batches.filter((batch)=>Number(batch.quantity || 0)>0).length > 4 && (
                        <span className="rounded-full border border-slate-200 bg-slate-50 px-3 py-1 text-xs text-slate-500">
                          +{item.batches.filter((batch)=>Number(batch.quantity || 0)>0).length - 4} more batches
                        </span>
                      )}
                    </div>
                  </div>
                )}
              </div>
              <div className="flex items-center gap-2">
                <button onClick={() => setStockItem(item)} className="rounded-2xl border border-slate-200 px-4 py-3 text-sm font-semibold text-slate-600 hover:bg-slate-50 flex items-center gap-2"><MdInventory2 /> Stock In / Out</button>
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

      <StorageLocationsSection
        locations={masterData.locations || []}
        items={items}
        onAdd={createInventoryLocation ? () => setShowLocation(true) : null}
        onEdit={updateInventoryLocation ? async (id,payload) => { const updated=await updateInventoryLocation(id,payload); setMasterData(prev=>({...prev,locations:prev.locations.map(x=>Number(x.id)===Number(id)?{...x,...updated}:x)})); setFeedback({type:'success',message:'Storage location updated.'}) } : null}
        onDelete={deleteInventoryLocation ? async (id) => { await deleteInventoryLocation(id); setMasterData(prev=>({...prev,locations:prev.locations.filter(x=>Number(x.id)!==Number(id))})); setFeedback({type:'success',message:'Unused storage location deleted.'}) } : null}
      />

      {showLocation && createInventoryLocation && <StorageLocationModal onClose={() => setShowLocation(false)} onCreate={async (payload) => { const created = await createInventoryLocation(payload); setMasterData(prev => ({ ...prev, locations: [...prev.locations, created] })); setFeedback({ type: 'success', message: `${created.name} storage location added.` }) }} />}
      {showAdd && <ItemFormModal title="Add Item" initialBarcode={newItemBarcode} canManageSellingPrice={canManageSellingPrice} masterData={masterData} existingItems={items} onCreateSupplier={async (payload) => { if (!createInventorySupplier) return payload; const created = await createInventorySupplier(payload); setMasterData(prev => ({ ...prev, suppliers: [...prev.suppliers.filter(x => Number(x.id)!==Number(created.id)), created] })); return created }} onClose={() => { setShowAdd(false); setNewItemBarcode('') }} onSubmit={handleAdd} />}
      {editItem && <ItemFormModal title="Edit Inventory Item" initialItem={editItem} canManageSellingPrice={canManageSellingPrice} masterData={masterData} existingItems={items} onCreateSupplier={async (payload) => { if (!createInventorySupplier) return payload; const created = await createInventorySupplier(payload); setMasterData(prev => ({ ...prev, suppliers: [...prev.suppliers.filter(x => Number(x.id)!==Number(created.id)), created] })); return created }} onClose={() => setEditItem(null)} onSubmit={handleEdit} />}
      {stockItem && <StockModal item={stockItem} locations={masterData.locations || []} onClose={() => setStockItem(null)} onSubmit={handleStockUpdate} />}
      {scannerOpen && <CameraScanner onDetected={handleScannerDetected} onClose={() => setScannerOpen(false)} />}
      <ConfirmDialog
        open={Boolean(deleteCandidate)}
        title="Remove inventory item?"
        message={deleteCandidate ? `Remove ${deleteCandidate.name} from inventory? Items with remaining batch stock cannot be deleted.` : ''}
        confirmLabel="Remove Item"
        loading={deleting}
        onCancel={() => !deleting && setDeleteCandidate(null)}
        onConfirm={confirmDelete}
      />
    </div>
  )
}

export default Inventory
