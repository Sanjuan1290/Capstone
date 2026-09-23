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
const ITEMS_PER_PAGE = 5
const LOCATION_TYPES_PER_PAGE = 6
const supplierSupportsClinic = (supplier, clinic) => String(supplier?.category || '')
  .split(',')
  .map((value) => value.trim())
  .filter(Boolean)
  .includes(clinic)

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

const DEFAULT_STOCK_IN_REASONS = [
  { value: 'received', label: 'Received from Supplier' },
  { value: 'returned', label: 'Returned to Stock' },
  { value: 'correction_in', label: 'Inventory Correction (+)' },
]

const DEFAULT_STOCK_OUT_REASONS = [
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

const getLocationTotals = (item) => {
  const totals = new Map()
  ;(Array.isArray(item?.batches) ? item.batches : []).filter((batch)=>!batch.archived_at).forEach((batch)=>{
    ;(Array.isArray(batch?.locations) ? batch.locations : []).forEach((location)=>{
      const qty=Number(location?.quantity||0)
      if(qty<=0) return
      const name=location?.name||'Main Stockroom'
      totals.set(name,(totals.get(name)||0)+qty)
    })
  })
  return [...totals.entries()].map(([name,quantity])=>({name,quantity})).sort((a,b)=>b.quantity-a.quantity||a.name.localeCompare(b.name))
}

const getActiveBatchCostSummary = (item) => {
  const active=(Array.isArray(item?.batches)?item.batches:[]).filter((batch)=>!batch.archived_at&&Number(batch.quantity||0)>0)
  if(!active.length) return 'No active batch cost'
  const costs=active.map((batch)=>Number(batch.unit_cost||0)).filter((value)=>Number.isFinite(value))
  if(!costs.length) return 'No active batch cost'
  const min=Math.min(...costs), max=Math.max(...costs)
  return Math.abs(max-min)<0.0001?`PHP ${max.toFixed(2)}`:`PHP ${min.toFixed(2)} – ${max.toFixed(2)}`
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

const getBatchLotSuffix = (item, batch) => {
  const code = String(batch?.batch_code || '').trim()
  const prefix = String(item?.barcode || '').trim()
  if (prefix && code.toLowerCase().startsWith(`${prefix.toLowerCase()}-`)) return code.slice(prefix.length + 1)
  return code
}

const getBatchStatusMeta = (batch) => {
  if (batch?.archived_at) return { label: 'Archived', tone: 'bg-slate-100 text-slate-600 border-slate-200' }
  const qty = Number(batch?.quantity || 0)
  if (qty <= 0) return { label: 'Depleted', tone: 'bg-slate-50 text-slate-500 border-slate-200' }
  const expiry = batch?.expiration_date ? parseDateOnly(batch.expiration_date) : null
  const today = new Date(); today.setHours(0,0,0,0)
  if (expiry) { expiry.setHours(0,0,0,0); if (expiry < today) return { label: 'Expired', tone: 'bg-red-50 text-red-700 border-red-200' } }
  return { label: 'Active', tone: 'bg-emerald-50 text-emerald-700 border-emerald-200' }
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

const ItemFormModal = ({ title, initialItem, initialBarcode = '', onClose, onSubmit, canManageSellingPrice = false, masterData = {}, existingItems = [] }) => {
  const isEditing = Boolean(initialItem?.id)
  const [step, setStep] = useState(1)
  const [supplierChoice, setSupplierChoice] = useState(initialItem?.supplier_id ? String(initialItem.supplier_id) : '')
  const [barcodeScannerOpen, setBarcodeScannerOpen] = useState(false)
  const [supplierLotMissing, setSupplierLotMissing] = useState(true)
  const [form, setForm] = useState({
    barcode: initialItem?.barcode || initialBarcode || '',
    name: initialItem?.name || '',
    category: ['medical','derma'].includes(initialItem?.category) ? initialItem.category : (String(initialItem?.category || '').toLowerCase().includes('derm') ? 'derma' : 'medical'),
    item_type: initialItem?.item_type || 'medicine',
    uom: initialItem?.uom || initialItem?.base_unit || initialItem?.unit || '',
    stock: String(isEditing ? 0 : (initialItem?.stock ?? 0)),
    threshold: String(initialItem?.threshold ?? 5),
    price: String(initialItem?.price ?? 0),
    selling_price: initialItem?.selling_price === null || initialItem?.selling_price === undefined ? '' : String(initialItem.selling_price),
    expiration_date: '',
    supplier_lot_number: '',
    location_type_id: initialItem?.location_type_id ? String(initialItem.location_type_id) : '',
  })

  const categorySuppliers = (masterData.suppliers || []).filter((entry) => supplierSupportsClinic(entry, form.category))
  const uomOptions = (masterData.uoms || []).map((entry) => ({
    id: entry.id,
    value: String(entry.name || '').trim().toLowerCase(),
    label: entry.abbreviation ? `${entry.name} (${entry.abbreviation})` : entry.name,
  })).filter((entry) => entry.value)
  const locationTypes = (masterData.location_types || []).filter((entry) => Number(entry.is_active ?? 1) === 1)
  const selectedLocationType = locationTypes.find((entry) => Number(entry.id) === Number(form.location_type_id)) || null
  const update = (key) => (e) => setForm(prev => ({ ...prev, [key]: e.target.value }))
  const normalizedBarcode = String(form.barcode || '').trim()
  const duplicateBarcode = normalizedBarcode
    ? existingItems.find((item) => Number(item.id) !== Number(initialItem?.id) && String(item.barcode || '').trim().toLowerCase() === normalizedBarcode.toLowerCase())
    : null
  const generatedItemPreview = getNextGeneratedItemCode(form.category, existingItems)
  const barcodePreview = normalizedBarcode || generatedItemPreview
  const canSaveDetails = Boolean(form.name.trim() && form.category && form.item_type && form.uom && form.location_type_id && !duplicateBarcode)

  const handleScannedBarcode = (code) => {
    const normalized = String(code || '').trim()
    setBarcodeScannerOpen(false)
    if (normalized) setForm((current) => ({ ...current, barcode: normalized }))
  }

  const handleSubmit = async () => {
    if (!canSaveDetails) return
    const supplierId = supplierChoice ? Number(supplierChoice) : null
    const supplierName = categorySuppliers.find((x) => Number(x.id) === supplierId)?.name || ''
    await onSubmit({
      ...form,
      batch_code: '',
      batch_lot_code: '',
      supplier_lot_number: supplierLotMissing ? '' : form.supplier_lot_number.trim(),
      supplier_id: supplierId,
      supplier: supplierName,
      unit: form.uom,
      base_unit: form.uom,
      unit_size: 1,
      stock: isEditing ? 0 : Math.max(0, parseFloat(form.stock) || 0),
      threshold: Math.max(0, parseFloat(form.threshold) || 0),
      price: isEditing ? undefined : Math.max(0, parseFloat(form.price) || 0),
      ...(canManageSellingPrice ? { selling_price: form.selling_price === '' ? null : Math.max(0, parseFloat(form.selling_price) || 0) } : {}),
    })
    onClose()
  }

  return <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/50 px-4">
    <div className="w-full max-w-2xl overflow-hidden rounded-3xl bg-white shadow-2xl">
      <div className="flex items-center justify-between border-b border-slate-100 px-6 py-4">
        <div>
          <p className="text-base font-bold text-slate-900">{title}</p>
          <p className="mt-0.5 text-sm text-slate-500">{isEditing ? 'Edit product-level details only. Batch quantity, expiry and unit cost are managed in Manage Batches.' : 'Create the product, then record its opening batch.'}</p>
        </div>
        <button onClick={onClose} className="flex h-9 w-9 items-center justify-center rounded-xl text-slate-400 hover:bg-slate-100" aria-label="Close"><MdClose/></button>
      </div>

      {!isEditing && <div className="px-6 pt-5"><div className="grid grid-cols-2 gap-2 rounded-2xl bg-slate-100 p-1 text-sm font-semibold">
        <div className={`rounded-xl px-3 py-2 text-center ${step===1?'bg-white text-slate-900 shadow-sm':'text-slate-500'}`}>1. Item Details</div>
        <div className={`rounded-xl px-3 py-2 text-center ${step===2?'bg-white text-slate-900 shadow-sm':'text-slate-500'}`}>2. Opening Batch</div>
      </div></div>}

      <div className="max-h-[68vh] overflow-y-auto p-6">
        {(isEditing || step===1) ? <div className="grid gap-4 md:grid-cols-2">
          <div className="md:col-span-2"><Field label="Item Name *"><input value={form.name} onChange={update('name')} className={inputClass} placeholder={form.item_type==='medicine'?'e.g. Amoxicillin 500mg':'e.g. Sterile Gauze Pad'}/></Field></div>
          <Field label="Category *"><select value={form.category} onChange={(e)=>{setForm(p=>({...p,category:e.target.value}));setSupplierChoice('')}} className={inputClass}>{CATEGORIES.map(x=><option key={x.value} value={x.value}>{x.label}</option>)}</select></Field>
          <Field label="Type *"><select value={form.item_type} onChange={update('item_type')} className={inputClass}>{ITEM_TYPES.map(x=><option key={x.value} value={x.value}>{x.label}</option>)}</select></Field>
          <div className="md:col-span-2">
            <Field label="Product Barcode"><div className="flex flex-col gap-2 sm:flex-row">
              <input value={form.barcode} onChange={update('barcode')} className={`${inputClass} flex-1`} placeholder={`Leave blank to auto-generate ${form.category==='derma'?'DRM':'GMED'} code`} />
              <button type="button" onClick={() => setBarcodeScannerOpen(true)} className="button-secondary shrink-0"><MdQrCodeScanner /> Scan Barcode</button>
              {form.barcode && <button type="button" onClick={() => setForm((current)=>({...current,barcode:''}))} className="button-secondary shrink-0">Use Auto Code</button>}
            </div></Field>
            {duplicateBarcode ? <div className="mt-2 rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-xs font-semibold text-red-700">This barcode is already registered to <strong>{duplicateBarcode.name}</strong>. Use the existing inventory item instead.</div> : <p className="mt-2 text-xs text-slate-400">The product barcode identifies the product. Batch barcodes are generated separately for each receipt.</p>}
            <div className="mt-3"><BarcodePreview value={barcodePreview} title={normalizedBarcode ? 'Product Barcode Preview' : 'Auto-generated Barcode Preview'} /></div>
          </div>
          <Field label="Unit of Measure *"><select value={form.uom} onChange={update('uom')} className={inputClass} disabled={!uomOptions.length}><option value="">{uomOptions.length ? 'Select unit of measure' : 'No units configured'}</option>{uomOptions.map((entry)=><option key={entry.id || entry.value} value={entry.value}>{entry.label}</option>)}</select></Field>
          <Field label="Location Type *"><select value={form.location_type_id} onChange={update('location_type_id')} className={inputClass} disabled={!locationTypes.length}><option value="">{locationTypes.length ? 'Select location type' : 'No location types configured'}</option>{locationTypes.map((entry)=><option key={entry.id} value={entry.id}>{entry.name}</option>)}</select></Field>
          <Field label="Supplier"><select value={supplierChoice} onChange={(e)=>setSupplierChoice(e.target.value)} className={inputClass}><option value="">Select supplier (optional)</option>{categorySuppliers.map(x=><option key={x.id} value={x.id}>{x.name}</option>)}</select><p className="mt-1 text-xs text-slate-400">Suppliers are managed in System Setup.</p></Field>
          <Field label="Low Stock Alert"><input type="number" min="0" step="0.01" value={form.threshold} onChange={update('threshold')} className={inputClass}/></Field>
          {canManageSellingPrice && <Field label="Patient Selling Price"><input type="number" min="0" step="0.01" value={form.selling_price} onChange={update('selling_price')} className={inputClass} placeholder="Optional"/></Field>}
          <div className="md:col-span-2 rounded-2xl border border-sky-100 bg-sky-50 px-4 py-3 text-sm text-sky-800">Item details describe the product. <strong>Quantity, supplier lot, expiry and acquisition cost are batch-level information.</strong></div>
        </div> : <div className="grid gap-4 md:grid-cols-2">
          <div className="md:col-span-2 rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-700"><strong>{form.name}</strong><div className="mt-1 text-xs text-slate-500">{CATEGORIES.find(x=>x.value===form.category)?.label} · {ITEM_TYPES.find(x=>x.value===form.item_type)?.label} · Unit: {form.uom} · Location Type: {selectedLocationType?.name || 'Not selected'}</div></div>
          <Field label="Opening Quantity"><input type="number" min="0" step="0.01" value={form.stock} onChange={update('stock')} className={inputClass}/></Field>
          <Field label="Unit Cost"><input type="number" min="0" step="0.01" value={form.price} onChange={update('price')} className={inputClass}/></Field>
          <Field label="Batch Expiry"><input type="date" value={form.expiration_date} onChange={update('expiration_date')} className={inputClass}/></Field>
          <div className="md:col-span-2 space-y-3 rounded-2xl border border-slate-200 bg-slate-50 p-4">
            <label className="flex items-start gap-3 text-sm font-semibold text-slate-700"><input type="checkbox" checked={supplierLotMissing} onChange={(e)=>setSupplierLotMissing(e.target.checked)} className="mt-1"/><span><strong>Supplier did not provide a lot number</strong><span className="mt-0.5 block text-xs font-normal text-slate-500">The system will still create its own internal batch barcode.</span></span></label>
            {!supplierLotMissing && <Field label="Supplier Lot Number *"><input value={form.supplier_lot_number} onChange={update('supplier_lot_number')} className={inputClass} placeholder="e.g. LOT-A123"/></Field>}
            <BarcodePreview value={`${barcodePreview}-B001`} title="Internal Batch Barcode Preview" />
            <p className="text-[11px] text-slate-400">Preview only. Every receipt receives a new internal batch code such as B001, B002, B003.</p>
          </div>
          <div className="md:col-span-2 rounded-2xl border border-emerald-100 bg-emerald-50 px-4 py-3 text-sm text-emerald-800"><strong>Opening stock is one receipt.</strong> Future Stock In transactions will always create a new batch so different expiry dates and unit costs never get mixed.</div>
        </div>}
      </div>

      <div className="flex gap-3 border-t border-slate-100 px-6 py-5">
        {isEditing ? <><button onClick={onClose} className="flex-1 rounded-2xl border border-slate-200 py-3 text-sm font-semibold text-slate-600">Cancel</button><button onClick={handleSubmit} disabled={!canSaveDetails} className="flex-1 rounded-2xl bg-[#0b1a2c] py-3 text-sm font-semibold text-white disabled:opacity-50"><MdSave className="inline mr-2"/>Save Item Details</button></> : step===1 ? <><button onClick={onClose} className="flex-1 rounded-2xl border border-slate-200 py-3 text-sm font-semibold text-slate-600">Cancel</button><button onClick={()=>canSaveDetails&&setStep(2)} disabled={!canSaveDetails} className="flex-1 rounded-2xl bg-[#0b1a2c] py-3 text-sm font-semibold text-white disabled:opacity-50">Next: Opening Batch</button></> : <><button onClick={()=>setStep(1)} className="flex-1 rounded-2xl border border-slate-200 py-3 text-sm font-semibold text-slate-600">Back</button><button onClick={handleSubmit} disabled={Number(form.stock||0)>0 && !supplierLotMissing && !form.supplier_lot_number.trim()} className="flex-1 rounded-2xl bg-[#0b1a2c] py-3 text-sm font-semibold text-white disabled:opacity-50"><MdSave className="inline mr-2"/>Add Item</button></>}
      </div>
    </div>
    {barcodeScannerOpen && <CameraScanner onDetected={handleScannedBarcode} onClose={()=>setBarcodeScannerOpen(false)} />}
  </div>
}

const LocationTypeModal = ({ onClose, onCreate }) => {
  const [name, setName] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const save = async () => {
    if (!name.trim()) return
    setBusy(true)
    setError('')
    try {
      await onCreate({ name: name.trim(), is_active: 1 })
      onClose()
    } catch (err) {
      setError(err.message || 'Could not add location type.')
    } finally {
      setBusy(false)
    }
  }
  return <div className="fixed inset-0 z-[70] flex items-center justify-center bg-black/50 px-4">
    <div className="w-full max-w-md rounded-3xl bg-white p-6 shadow-2xl">
      <div className="flex justify-between">
        <div><h3 className="font-bold text-slate-900">Add Location Type</h3><p className="mt-1 text-xs text-slate-500">Create a reusable location type for inventory items.</p></div>
        <button onClick={onClose}><MdClose/></button>
      </div>
      <div className="mt-5 grid gap-4">
        <Field label="Location Type *"><input className={inputClass} value={name} onChange={(e)=>setName(e.target.value)} placeholder="e.g. Pharmacy, Refrigerator, Treatment Room"/></Field>
        {error && <p className="rounded-xl bg-red-50 px-3 py-2 text-sm text-red-600">{error}</p>}
        <div className="flex justify-end gap-2"><button className="button-secondary" onClick={onClose}>Cancel</button><button className="button-primary" disabled={busy || !name.trim()} onClick={save}>{busy ? 'Saving...' : 'Add Location Type'}</button></div>
      </div>
    </div>
  </div>
}

const LocationTypesSection = ({ locationTypes = [], items = [], onAdd, onEdit }) => {
  const [search, setSearch] = useState('')
  const [page, setPage] = useState(1)
  const [edit, setEdit] = useState(null)
  const [form, setForm] = useState({ name: '', is_active: 1 })
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  const visible = locationTypes.filter((entry) => String(entry.name || '').toLowerCase().includes(search.trim().toLowerCase()))
  const totalPages = Math.max(1, Math.ceil(visible.length / LOCATION_TYPES_PER_PAGE))
  const currentPage = Math.min(page, totalPages)
  const paginated = visible.slice((currentPage - 1) * LOCATION_TYPES_PER_PAGE, currentPage * LOCATION_TYPES_PER_PAGE)

  useEffect(() => { setPage(1) }, [search, locationTypes.length])

  const usageFor = (entry) => items.filter((item) => Number(item.location_type_id) === Number(entry.id)).length
  const openEdit = (entry) => {
    setEdit(entry)
    setForm({ name: entry.name || '', is_active: Number(entry.is_active ?? 1) })
    setError('')
  }
  const save = async () => {
    if (!onEdit || !form.name.trim()) return
    setBusy(true)
    setError('')
    try {
      await onEdit(edit.id, form)
      setEdit(null)
    } catch (err) {
      setError(err.message || 'Could not update location type.')
    } finally {
      setBusy(false)
    }
  }

  return <section className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
    <div className="flex flex-wrap items-start justify-between gap-3">
      <div><h2 className="text-lg font-bold text-slate-800">Location Types</h2><p className="mt-1 text-sm text-slate-500">Reusable location classifications assigned to inventory items. Add a type here before selecting it on an item.</p></div>
      {onAdd && <button type="button" onClick={onAdd} className="button-primary"><MdAdd/> Add Location Type</button>}
    </div>
    <div className="mt-4 flex items-center gap-2 rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3"><MdSearch className="text-slate-400"/><input className="w-full bg-transparent text-sm outline-none" value={search} onChange={(e)=>setSearch(e.target.value)} placeholder="Search location types..."/></div>

    <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-3">
      {paginated.map((entry) => {
        const itemCount = usageFor(entry)
        return <div key={entry.id} className={`rounded-2xl border p-4 ${Number(entry.is_active ?? 1) ? 'border-slate-200' : 'border-slate-200 bg-slate-50 opacity-70'}`}>
          <div className="flex items-start justify-between gap-3">
            <div><p className="font-bold text-slate-800">{entry.name}</p><p className="mt-1 text-xs text-slate-500">{itemCount} assigned item{itemCount === 1 ? '' : 's'}</p></div>
            <span className={`rounded-full px-2 py-1 text-[10px] font-bold ${Number(entry.is_active ?? 1) ? 'bg-emerald-50 text-emerald-700' : 'bg-slate-200 text-slate-600'}`}>{Number(entry.is_active ?? 1) ? 'ACTIVE' : 'INACTIVE'}</span>
          </div>
          {onEdit && <div className="mt-4 flex justify-end"><button type="button" className="button-secondary" onClick={()=>openEdit(entry)}><MdEdit/> Edit</button></div>}
        </div>
      })}
    </div>

    {!visible.length && <div className="mt-4 rounded-2xl bg-slate-50 p-8 text-center text-sm text-slate-400">No location types found. Add one before creating inventory items.</div>}

    {visible.length > 0 && <div className="mt-4 flex flex-col gap-3 rounded-2xl border border-slate-100 bg-slate-50 px-4 py-3 text-sm text-slate-500 sm:flex-row sm:items-center sm:justify-between">
      <p>Showing {((currentPage - 1) * LOCATION_TYPES_PER_PAGE) + 1}-{Math.min(currentPage * LOCATION_TYPES_PER_PAGE, visible.length)} of {visible.length} location types</p>
      <div className="flex items-center gap-2">
        <button type="button" className="button-secondary" disabled={currentPage === 1} onClick={()=>setPage((value)=>Math.max(1,value-1))}>Previous</button>
        <span className="rounded-xl bg-white px-3 py-2 text-xs font-bold uppercase tracking-wider text-slate-500">Page {currentPage} of {totalPages}</span>
        <button type="button" className="button-secondary" disabled={currentPage === totalPages} onClick={()=>setPage((value)=>Math.min(totalPages,value+1))}>Next</button>
      </div>
    </div>}

    {edit && <div className="fixed inset-0 z-[80] flex items-center justify-center bg-black/50 px-4">
      <div className="w-full max-w-md rounded-3xl bg-white p-6 shadow-2xl">
        <div className="flex items-start justify-between">
          <div><h3 className="font-bold text-slate-900">Edit Location Type</h3><p className="mt-1 text-xs text-slate-500">Renaming keeps existing item assignments intact.</p></div>
          <button type="button" onClick={()=>!busy && setEdit(null)}><MdClose/></button>
        </div>
        <div className="mt-5 space-y-4">
          <Field label="Location Type *"><input className={inputClass} value={form.name} onChange={(e)=>setForm((value)=>({...value,name:e.target.value}))}/></Field>
          <Field label="Status"><select className={inputClass} value={form.is_active} onChange={(e)=>setForm((value)=>({...value,is_active:Number(e.target.value)}))}><option value={1}>Active</option><option value={0}>Inactive</option></select></Field>
          {error && <p className="rounded-xl bg-red-50 px-3 py-2 text-sm text-red-600">{error}</p>}
          <div className="flex justify-end gap-2"><button type="button" className="button-secondary" disabled={busy} onClick={()=>setEdit(null)}>Cancel</button><button type="button" className="button-primary" disabled={busy || !form.name.trim()} onClick={save}>{busy ? 'Saving...' : 'Save Changes'}</button></div>
        </div>
      </div>
    </div>}
  </section>
}

const StockModal = ({ item, initialType = 'in', onClose, onSubmit, movementReasons = [] }) => {
  const type = initialType === 'out' ? 'out' : 'in'
  const [qty, setQty] = useState(type === 'in' ? '1' : '')
  const [note, setNote] = useState('')
  const [expirationDate, setExpirationDate] = useState('')
  const [supplierLot, setSupplierLot] = useState('')
  const [supplierLotMissing, setSupplierLotMissing] = useState(true)
  const [movementReason, setMovementReason] = useState(type === 'in' ? 'received' : 'adjustment_out')
  const [stockOutSelectionKey, setStockOutSelectionKey] = useState('')
  const [batchScannerOpen, setBatchScannerOpen] = useState(false)
  const [unitCost, setUnitCost] = useState(String(item?.price ?? 0))
  const configuredStockInReasons = (Array.isArray(movementReasons) ? movementReasons : []).filter((reason) => reason.movement_type === 'in').map((reason) => ({ value: reason.code, label: reason.name, ...reason }))
  const configuredStockOutReasons = (Array.isArray(movementReasons) ? movementReasons : []).filter((reason) => reason.movement_type === 'out').map((reason) => ({ value: reason.code, label: reason.name, ...reason }))
  const stockInReasons = configuredStockInReasons.length ? configuredStockInReasons : DEFAULT_STOCK_IN_REASONS
  const stockOutReasons = configuredStockOutReasons.length ? configuredStockOutReasons : DEFAULT_STOCK_OUT_REASONS
  const reasons = type === 'in' ? stockInReasons : stockOutReasons
  const batches = (Array.isArray(item?.batches) ? item.batches : []).filter((batch) => !batch.archived_at)
  const stockOutOptions = useMemo(() => batches.flatMap((batch) => {
    const locations = (Array.isArray(batch?.locations) ? batch.locations : []).filter((location) => Number(location?.quantity || 0) > 0)
    if (locations.length) return locations.map((location) => ({ key: `${batch.id}:${location.id || location.name}`, batch, location, available: Number(location.quantity || 0) }))
    if (Number(batch.quantity || 0) <= 0) return []
    return [{ key: `${batch.id}:default`, batch, location: { id: null, name: 'Main Stockroom', quantity: Number(batch.quantity || 0) }, available: Number(batch.quantity || 0) }]
  }), [batches])
  const selectedStockOut = stockOutOptions.find((option) => option.key === stockOutSelectionKey) || null
  const selectedStockOutBatch = selectedStockOut?.batch || null
  const selectedStockOutAvailable = Number(selectedStockOut?.available || 0)
  const numericQty = Math.max(0, Number(qty) || 0)
  const clinicStock = Number(item?.stock ?? 0)
  const internalBatchPreview = getNextBatchCodePreview(item)

  useEffect(() => {
    if (!reasons.some((reason) => reason.value === movementReason)) setMovementReason(reasons[0]?.value || '')
  }, [movementReason, reasons])

  const handleScannedLot = (code) => {
    const normalized = String(code || '').trim()
    setBatchScannerOpen(false)
    if (!normalized) return
    setSupplierLot(normalized)
    setSupplierLotMissing(false)
  }

  const stockInInvalid = type === 'in' && (numericQty <= 0 || !movementReason || (!supplierLotMissing && !supplierLot.trim()))
  const stockOutInvalid = type === 'out' && (!movementReason || !selectedStockOut || numericQty <= 0 || numericQty > selectedStockOutAvailable)

  const handleSave = () => onSubmit(type === 'in' ? {
    type: 'in',
    qty: numericQty,
    note,
    movement_reason: movementReason,
    expiration_date: expirationDate,
    batch_code: '',
    supplier_lot_number: supplierLotMissing ? '' : supplierLot.trim(),
    existing_batch_id: null,
    unit_cost: Math.max(0, Number(unitCost) || 0),
  } : {
    type: 'out',
    qty: numericQty,
    batch_id: Number(selectedStockOutBatch?.id),
    storage_location_id: selectedStockOut?.location?.id ? Number(selectedStockOut.location.id) : null,
    movement_reason: movementReason,
    note,
  })

  return <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/50 px-4">
    <div className="flex max-h-[90vh] w-full max-w-lg flex-col overflow-hidden rounded-3xl bg-white shadow-2xl">
      <div className="flex shrink-0 items-center justify-between border-b border-slate-100 px-6 py-4">
        <div><p className="text-base font-bold text-slate-900">{type === 'in' ? 'Stock In' : 'Stock Out'} · {item.name}</p><p className="mt-0.5 text-xs text-slate-500">Clinic-wide stock: {clinicStock} {item.uom || item.unit}</p></div>
        <button onClick={onClose} className="flex h-8 w-8 items-center justify-center rounded-xl text-slate-400 hover:bg-slate-100" aria-label="Close"><MdClose /></button>
      </div>

      <div className="flex-1 overflow-y-auto px-6 py-6"><div className="space-y-4">
        {type === 'in' ? <>
          <div className="rounded-2xl border border-emerald-100 bg-emerald-50 px-4 py-3 text-sm text-emerald-800"><strong>Every Stock In creates a new batch.</strong> This keeps each delivery's expiry date, supplier lot and unit cost separate.</div>
          <Field label={`Quantity Received (${item.uom || item.unit}) *`}><input type="number" min="0.01" step="0.01" value={qty} onChange={(e) => setQty(e.target.value)} className={inputClass}/></Field>
          <Field label="Movement Reason *"><select value={movementReason} onChange={(e)=>setMovementReason(e.target.value)} className={inputClass}>{stockInReasons.map((reason)=><option key={reason.value} value={reason.value}>{reason.label}</option>)}</select></Field>
          <label className="flex items-start gap-3 rounded-2xl border border-slate-200 bg-slate-50 p-4 text-sm text-slate-700"><input type="checkbox" checked={supplierLotMissing} onChange={(e)=>setSupplierLotMissing(e.target.checked)} className="mt-1"/><span><strong>Supplier did not provide a lot number</strong><span className="mt-0.5 block text-xs text-slate-500">An internal batch barcode is still generated automatically.</span></span></label>
          {!supplierLotMissing && <Field label="Supplier Lot Number *"><div className="flex gap-2"><input value={supplierLot} onChange={(e)=>setSupplierLot(e.target.value)} className={`${inputClass} flex-1`} placeholder="e.g. LOT-A123"/><button type="button" onClick={()=>setBatchScannerOpen(true)} className="button-secondary shrink-0"><MdQrCodeScanner/> Scan</button></div></Field>}
          <Field label="Batch Expiry"><input type="date" value={expirationDate} onChange={(e)=>setExpirationDate(e.target.value)} className={inputClass}/></Field>
          <Field label="Unit Cost"><input type="number" min="0" step="0.01" value={unitCost} onChange={(e)=>setUnitCost(e.target.value)} className={inputClass}/></Field>
          <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4"><p className="text-[10px] font-black uppercase tracking-widest text-slate-400">Internal Batch Barcode</p><div className="mt-2"><BarcodePreview value={internalBatchPreview} title="New Batch" compact/></div><p className="mt-2 text-xs text-slate-500">This internal code is unique to this receipt. Supplier lot is stored separately.</p></div>
          <Field label="Reference / Delivery Note"><input value={note} onChange={(e)=>setNote(e.target.value)} className={inputClass} placeholder="e.g. Delivery receipt DR-1024"/></Field>
          <div className="rounded-2xl border border-slate-200 bg-white p-4 text-sm"><p className="text-[10px] font-black uppercase tracking-widest text-slate-400">After Stock In</p><div className="mt-2 flex justify-between"><span>Current clinic stock</span><strong>{clinicStock}</strong></div><div className="mt-1 flex justify-between text-emerald-700"><span>Receiving</span><strong>+{numericQty}</strong></div><div className="mt-2 border-t border-slate-100 pt-2 flex justify-between"><span>New clinic stock</span><strong>{clinicStock + numericQty} {item.uom || item.unit}</strong></div></div>
        </> : <>
          {!stockOutOptions.length ? <div className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-4 text-sm text-amber-800">There is no available batch stock to remove.</div> : <>
            <Field label="Stock Out From Batch / Location *"><select value={stockOutSelectionKey} onChange={(e)=>{setStockOutSelectionKey(e.target.value);setQty('')}} className={inputClass}><option value="">Select batch and location</option>{stockOutOptions.map((option)=>{const batch=option.batch;const supplierLot=batch.supplier_lot_number?` · Lot ${batch.supplier_lot_number}`:'';return <option key={option.key} value={option.key}>{batch.batch_code || `Batch #${batch.id}`}{supplierLot} · {option.location?.name || 'Main Stockroom'} · {option.available} {item.uom || item.unit}</option>})}</select></Field>
            {selectedStockOutBatch && <div className="rounded-2xl border border-sky-200 bg-sky-50 p-4"><div className="flex items-start justify-between gap-3"><div><p className="text-[10px] font-black uppercase tracking-widest text-sky-700">Selected Batch</p><p className="mt-1 font-mono text-sm font-bold text-slate-900">{selectedStockOutBatch.batch_code}</p>{selectedStockOutBatch.supplier_lot_number&&<p className="mt-1 text-xs text-slate-500">Supplier Lot: {selectedStockOutBatch.supplier_lot_number}</p>}</div><span className="rounded-full bg-white px-2.5 py-1 text-xs font-bold text-sky-700">{selectedStockOutAvailable} available here</span></div><div className="mt-3 grid grid-cols-2 gap-3 text-sm"><div><p className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Expiry</p><p className="mt-1 font-semibold text-slate-700">{selectedStockOutBatch.expiration_date?formatDate(selectedStockOutBatch.expiration_date):'No expiry'}</p></div><div><p className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Location</p><p className="mt-1 font-semibold text-slate-700">{selectedStockOut?.location?.name || 'Main Stockroom'}</p></div></div></div>}
            <Field label={`Quantity to Stock Out (${item.uom || item.unit}) *`}><input type="number" min="0.01" max={selectedStockOutAvailable||undefined} step="0.01" value={qty} onChange={(e)=>setQty(e.target.value)} className={inputClass} disabled={!selectedStockOut}/></Field>
            <Field label="Movement Reason *"><select value={movementReason} onChange={(e)=>setMovementReason(e.target.value)} className={inputClass}>{stockOutReasons.map((reason)=><option key={reason.value} value={reason.value}>{reason.label}</option>)}</select></Field>
            <Field label="Note"><input value={note} onChange={(e)=>setNote(e.target.value)} className={inputClass} placeholder="Optional explanation or reference"/></Field>
            {selectedStockOut && <div className={`rounded-2xl border p-4 text-sm ${numericQty>selectedStockOutAvailable?'border-red-200 bg-red-50':'border-slate-200 bg-slate-50'}`}><p className="text-[10px] font-black uppercase tracking-widest text-slate-400">After Stock Out</p><div className="mt-2 flex justify-between"><span>Location available</span><strong>{selectedStockOutAvailable}</strong></div><div className="mt-1 flex justify-between text-red-600"><span>Stocking out</span><strong>-{numericQty}</strong></div><div className="mt-2 border-t border-slate-200 pt-2 flex justify-between"><span>Location remaining</span><strong>{Math.max(0,selectedStockOutAvailable-numericQty)}</strong></div><div className="mt-1 flex justify-between"><span>Clinic remaining</span><strong>{Math.max(0,clinicStock-numericQty)} {item.uom || item.unit}</strong></div>{numericQty>selectedStockOutAvailable&&<p className="mt-2 text-xs font-bold text-red-600">Quantity exceeds the selected batch/location balance.</p>}</div>}
          </>}
        </>}
      </div></div>

      <div className="shrink-0 border-t border-slate-100 bg-white px-6 pb-6 pt-4"><button onClick={handleSave} disabled={stockInInvalid || stockOutInvalid || (type==='out'&&!stockOutOptions.length)} className={`w-full rounded-2xl py-3 text-sm font-bold text-white disabled:opacity-40 ${type==='in'?'bg-emerald-600 hover:bg-emerald-700':'bg-red-600 hover:bg-red-700'}`}>{type==='in'?`Receive ${numericQty || ''} ${item.uom || item.unit}`:`Stock Out ${numericQty || ''} ${item.uom || item.unit}`}</button></div>
    </div>
    {batchScannerOpen && <CameraScanner onDetected={handleScannedLot} onClose={()=>setBatchScannerOpen(false)}/>} 
  </div>
}

const Field = ({ label, children }) => (
  <label className="space-y-1.5">
    <span className="text-xs font-bold uppercase tracking-widest text-slate-400">{label}</span>
    {children}
  </label>
)

const inputClass = 'w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-700 outline-none focus:border-sky-400'

const ProtectedBatchActionModal = ({ item, batch, action, onClose, onRequest, onConfirm, onSuccess }) => {
  const [reason,setReason]=useState('')
  const [password,setPassword]=useState('')
  const [code,setCode]=useState('')
  const [step,setStep]=useState('details')
  const [busy,setBusy]=useState(false)
  const [error,setError]=useState('')
  const [targetQuantity,setTargetQuantity]=useState(String(Number(batch?.quantity || 0)))
  const [lotCode,setLotCode]=useState(getBatchLotSuffix(item,batch))
  const [expiry,setExpiry]=useState(batch?.expiration_date ? String(batch.expiration_date).slice(0,10) : '')
  const [unitCost,setUnitCost]=useState(String(Number(batch?.unit_cost || 0)))
  const [note,setNote]=useState(batch?.note || '')
  const [supplierLot,setSupplierLot]=useState(batch?.supplier_lot_number || '')
  const labels={correct_quantity:'Correct Quantity',correct_details:'Edit Batch',archive:'Archive Batch',restore:'Restore Batch',delete:'Delete Batch'}
  const submitRequest=async()=>{
    if(reason.trim().length<5 || !password) return setError('Enter a reason (at least 5 characters) and your Admin password.')
    setBusy(true);setError('')
    try{
      const payload={action,password,reason:reason.trim()}
      if(action==='correct_quantity') payload.target_quantity=Math.max(0,Number(targetQuantity)||0)
      if(action==='correct_details') Object.assign(payload,{batch_lot_code:lotCode.trim(),supplier_lot_number:supplierLot.trim(),expiration_date:expiry,unit_cost:Math.max(0,Number(unitCost)||0),note:note.trim()})
      await onRequest(batch.id,payload);setStep('code')
    }catch(err){setError(err.message||'Could not send verification code.')}finally{setBusy(false)}
  }
  const confirm=async()=>{
    if(code.length!==6)return
    setBusy(true);setError('')
    try{const result=await onConfirm(batch.id,code);onSuccess(result?.message||'Batch updated.')}catch(err){setError(err.message||'Could not complete the batch action.')}finally{setBusy(false)}
  }
  return <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/60 px-4"><div className="w-full max-w-lg rounded-3xl bg-white shadow-2xl overflow-hidden">
    <div className="flex items-start justify-between border-b border-slate-100 px-6 py-4"><div><h3 className="font-bold text-slate-900">{labels[action]||'Batch Action'}</h3><p className="mt-1 text-xs text-slate-500">{item.name} · {batch.batch_code||`Batch #${batch.id}`}</p></div><button onClick={onClose} disabled={busy}><MdClose/></button></div>
    <div className="max-h-[70vh] overflow-y-auto p-6 space-y-4">
      {step==='details'?<>
        {action==='correct_quantity'&&<><div className="rounded-2xl border border-slate-200 bg-slate-50 p-4 text-sm"><span className="text-slate-500">Current Quantity</span><p className="mt-1 text-xl font-black text-slate-900">{Number(batch.quantity||0)} {item.uom||item.unit}</p></div><Field label="Correct Quantity *"><input type="number" min="0" step="0.01" value={targetQuantity} onChange={e=>setTargetQuantity(e.target.value)} className={inputClass}/><p className="mt-1 text-xs text-slate-400">The system records only the difference as Inventory Correction (+/-); it never rewrites history silently.</p></Field></>}
        {action==='correct_details'&&<><div className="rounded-2xl border border-slate-200 bg-slate-50 p-4 text-xs text-slate-600"><strong>Internal batch barcode:</strong> {batch.batch_code||'—'}<br/>The internal suffix can be corrected without changing the product barcode.</div><Field label="Internal Batch Suffix *"><input value={lotCode} onChange={e=>setLotCode(e.target.value)} className={inputClass}/><p className="mt-1 text-xs text-slate-400">Final internal barcode: <strong>{item.barcode?`${item.barcode}-${lotCode}`:lotCode}</strong></p></Field><Field label="Supplier Lot Number"><input value={supplierLot} onChange={e=>setSupplierLot(e.target.value)} className={inputClass} placeholder="Optional supplier/manufacturer lot"/></Field><Field label="Batch Expiry"><input type="date" value={expiry} onChange={e=>setExpiry(e.target.value)} className={inputClass}/></Field><Field label="Unit Cost"><input type="number" min="0" step="0.01" value={unitCost} onChange={e=>setUnitCost(e.target.value)} className={inputClass}/></Field><Field label="Batch Note"><textarea value={note} onChange={e=>setNote(e.target.value)} rows={3} className={inputClass}/></Field></>}
        {action==='archive'&&<div className="rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800">Archiving hides this zero-stock batch from normal stock operations while preserving its history.</div>}
        {action==='restore'&&<div className="rounded-2xl border border-sky-200 bg-sky-50 p-4 text-sm text-sky-800">Restoring makes this batch visible again for future stock operations.</div>}
        {action==='delete'&&<div className="rounded-2xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">Hard delete is allowed only when the batch has zero stock and absolutely no inventory, clinical, billing, or transfer history. Otherwise the backend will require Archive instead.</div>}
        <Field label="Reason *"><textarea rows={3} value={reason} onChange={e=>setReason(e.target.value)} className={inputClass} placeholder="Explain why this correction/action is required."/></Field>
        <Field label="Admin Password *"><input type="password" value={password} onChange={e=>setPassword(e.target.value)} className={inputClass} autoComplete="current-password"/></Field>
      </>:<div className="space-y-4"><div className="rounded-2xl border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-800">Password verified. Enter the 6-digit code sent to your administrator email.</div><Field label="6-Digit Email Verification Code *"><input value={code} onChange={e=>setCode(e.target.value.replace(/\D/g,'').slice(0,6))} inputMode="numeric" maxLength={6} className={`${inputClass} text-center text-lg font-black tracking-[.35em]`} placeholder="000000"/></Field></div>}
      {error&&<p className="rounded-xl bg-red-50 px-3 py-2 text-sm text-red-600">{error}</p>}
    </div>
    <div className="flex gap-2 border-t border-slate-100 p-5"><button className="button-secondary flex-1" disabled={busy} onClick={onClose}>Cancel</button>{step==='details'?<button className="button-primary flex-1" disabled={busy||reason.trim().length<5||!password} onClick={submitRequest}>{busy?'Checking...':'Verify Password & Send Code'}</button>:<button className="button-primary flex-1" disabled={busy||code.length!==6} onClick={confirm}>{busy?'Applying...':'Verify & Apply'}</button>}</div>
  </div></div>
}

const BatchManagerModal = ({ item, onClose, onRequestAction, onConfirmAction, onLoadHistory, onChanged }) => {
  const [showHistorical,setShowHistorical]=useState(false)
  const [selected,setSelected]=useState(null)
  const [historyBatch,setHistoryBatch]=useState(null)
  const [historyData,setHistoryData]=useState({movements:[],audit:[]})
  const [historyLoading,setHistoryLoading]=useState(false)
  const [historyError,setHistoryError]=useState('')
  const batches=Array.isArray(item?.batches)?item.batches:[]
  const visible=batches.filter((batch)=>showHistorical || (!batch.archived_at && Number(batch.quantity||0)>0))
  const openHistory=async(batch)=>{setHistoryBatch(batch);setHistoryData({movements:[],audit:[]});setHistoryError('');setHistoryLoading(true);try{const result=await onLoadHistory(batch.id);setHistoryData({movements:Array.isArray(result?.movements)?result.movements:[],audit:Array.isArray(result?.audit)?result.audit:[]})}catch(err){setHistoryError(err.message||'Could not load batch history.')}finally{setHistoryLoading(false)}}
  const formatAuditValue=(value)=>value===null||value===undefined||value===''?'—':String(value)
  const auditChanges=(row)=>{const oldValues=row?.old_values||{};const newValues=row?.new_values||{};return Object.keys(newValues).filter(key=>!['authorization','item_name','reason'].includes(key)&&formatAuditValue(oldValues[key])!==formatAuditValue(newValues[key])).map(key=>({key:key.replace(/_/g,' '),before:formatAuditValue(oldValues[key]),after:formatAuditValue(newValues[key])}))}

  return <div className="fixed inset-0 z-[90] flex items-center justify-center bg-black/55 px-4"><div className="flex max-h-[92vh] w-full max-w-4xl flex-col overflow-hidden rounded-3xl bg-white shadow-2xl">
    <div className="flex items-start justify-between border-b border-slate-100 px-6 py-4"><div><h3 className="text-lg font-bold text-slate-900">Manage Batches</h3><p className="mt-1 text-xs text-slate-500">{item.name} · batch quantity, expiry, supplier lot and unit cost are managed here.</p></div><button onClick={onClose}><MdClose/></button></div>
    <div className="grid gap-3 border-b border-slate-100 bg-slate-50 px-6 py-4 sm:grid-cols-3"><div><p className="text-[10px] font-black uppercase tracking-widest text-slate-400">Product Barcode</p><p className="mt-1 font-mono text-sm font-bold text-slate-800">{item.barcode||'—'}</p></div><div><p className="text-[10px] font-black uppercase tracking-widest text-slate-400">Clinic-wide Stock</p><p className="mt-1 text-sm font-black text-slate-800">{Number(item.stock||0)} {item.uom||item.unit}</p></div><div className="flex items-end justify-start sm:justify-end"><label className="inline-flex items-center gap-2 text-sm font-semibold text-slate-600"><input type="checkbox" checked={showHistorical} onChange={e=>setShowHistorical(e.target.checked)}/> Show depleted / archived</label></div></div>
    <div className="flex-1 overflow-y-auto p-6 space-y-4">{visible.length?visible.map((batch)=>{const status=getBatchStatusMeta(batch);const locations=(Array.isArray(batch.locations)?batch.locations:[]).filter((location)=>Number(location.quantity||0)>0);return <div key={batch.id} className="rounded-3xl border border-slate-200 p-5"><div className="flex flex-wrap items-start justify-between gap-4"><div className="min-w-0 flex-1"><div className="flex flex-wrap items-center gap-2"><p className="font-mono text-sm font-black text-slate-900">{batch.batch_code||`Batch #${batch.id}`}</p><span className={`rounded-full border px-2 py-0.5 text-[10px] font-bold ${status.tone}`}>{status.label}</span></div><div className="mt-3 grid gap-3 text-sm sm:grid-cols-2 lg:grid-cols-4"><div><p className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Supplier Lot</p><p className="mt-1 font-semibold text-slate-700">{batch.supplier_lot_number||'Not provided'}</p></div><div><p className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Quantity</p><p className="mt-1 font-semibold text-slate-700">{Number(batch.quantity||0)} {item.uom||item.unit}</p></div><div><p className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Expiry</p><p className="mt-1 font-semibold text-slate-700">{batch.expiration_date?formatDate(batch.expiration_date):'No expiry'}</p></div><div><p className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Unit Cost</p><p className="mt-1 font-semibold text-slate-700">PHP {Number(batch.unit_cost||0).toFixed(2)}</p></div></div>{locations.length>0&&<div className="mt-4"><p className="text-[10px] font-black uppercase tracking-widest text-slate-400">Location Balance</p><div className="mt-2 flex flex-wrap gap-2">{locations.map((location)=><span key={`${batch.id}-${location.id||location.name}`} className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-600"><strong>{location.name||'Location'}</strong> · {Number(location.quantity||0)} {item.uom||item.unit}</span>)}</div></div>}{batch.archive_reason&&<p className="mt-3 text-xs text-slate-400">Archive reason: {batch.archive_reason}</p>}</div><div className="flex flex-wrap gap-2"><button className="button-secondary" onClick={()=>openHistory(batch)}>View History</button>{!batch.archived_at&&<><button className="button-secondary" onClick={()=>setSelected({action:'correct_details',batch})}><MdEdit/> Edit Batch</button><button className="button-secondary" onClick={()=>setSelected({action:'correct_quantity',batch})}>Correct Quantity</button></>}{!batch.archived_at&&Number(batch.quantity||0)<=0&&<button className="button-secondary" onClick={()=>setSelected({action:'archive',batch})}>Archive</button>}{batch.archived_at&&<button className="button-secondary" onClick={()=>setSelected({action:'restore',batch})}>Restore</button>}{Number(batch.quantity||0)<=0&&<button className="button-danger" onClick={()=>setSelected({action:'delete',batch})}>Delete</button>}</div></div></div>}) : <div className="rounded-2xl bg-slate-50 p-8 text-center text-sm text-slate-400">No batches in this view.</div>}</div>
    <div className="border-t border-slate-100 p-5 flex justify-end"><button className="button-secondary" onClick={onClose}>Close</button></div>
    {selected&&<ProtectedBatchActionModal item={item} batch={selected.batch} action={selected.action} onClose={()=>setSelected(null)} onRequest={onRequestAction} onConfirm={onConfirmAction} onSuccess={(message)=>{setSelected(null);onChanged(message)}}/>}
    {historyBatch&&<div className="fixed inset-0 z-[110] flex items-center justify-center bg-black/60 px-4"><div className="flex max-h-[82vh] w-full max-w-2xl flex-col overflow-hidden rounded-3xl bg-white shadow-2xl"><div className="flex items-start justify-between border-b border-slate-100 px-6 py-4"><div><h3 className="font-bold text-slate-900">Batch History</h3><p className="mt-1 text-xs text-slate-500">{historyBatch.batch_code||`Batch #${historyBatch.id}`} · {item.name}</p></div><button onClick={()=>setHistoryBatch(null)}><MdClose/></button></div><div className="flex-1 overflow-y-auto p-6">{historyLoading?<div className="py-10 text-center text-sm text-slate-400">Loading history...</div>:historyError?<p className="rounded-xl bg-red-50 px-3 py-2 text-sm text-red-600">{historyError}</p>:<div className="space-y-6"><section><h4 className="mb-3 text-xs font-black uppercase tracking-widest text-slate-400">Movements</h4>{historyData.movements.length?<div className="space-y-3">{historyData.movements.map((row)=><div key={`move-${row.id}`} className="rounded-2xl border border-slate-200 p-4 text-sm"><div className="flex justify-between gap-3"><strong className="text-slate-800">{String(row.movement_type||row.type||'movement').replace(/_/g,' ')}</strong><span className="text-xs text-slate-400">{row.logged_at?new Date(row.logged_at).toLocaleString('en-PH'):'—'}</span></div><p className="mt-1 text-slate-600">Qty: {Number(row.qty||0)} {item.uom||item.unit} · By: {row.performed_by||'System'} ({row.performed_by_role||'System'})</p>{row.from_location&&<p className="mt-1 text-xs text-slate-500">From: {row.from_location}</p>}{row.to_location&&<p className="mt-1 text-xs text-slate-500">To: {row.to_location}</p>}{row.note&&<p className="mt-1 text-xs text-slate-500">{row.note}</p>}</div>)}</div>:<p className="rounded-2xl bg-slate-50 p-4 text-sm text-slate-400">No stock movement history recorded.</p>}</section><section><h4 className="mb-3 text-xs font-black uppercase tracking-widest text-slate-400">Protected Corrections & Actions</h4>{historyData.audit.length?<div className="space-y-3">{historyData.audit.map((row)=>{const changes=auditChanges(row);const reason=row?.new_values?.reason||row?.old_values?.reason;return <div key={`audit-${row.id}`} className="rounded-2xl border border-slate-200 p-4 text-sm"><div className="flex justify-between gap-3"><strong className="text-slate-800">{String(row.action||'batch action').replace(/^inventory\\./,'').replace(/_/g,' ')}</strong><span className="text-xs text-slate-400">{row.created_at?new Date(row.created_at).toLocaleString('en-PH'):'—'}</span></div>{changes.map((change)=><p key={change.key} className="mt-1 text-xs text-slate-600"><span className="font-semibold capitalize">{change.key}:</span> {change.before} → {change.after}</p>)}{reason&&<p className="mt-2 text-xs text-slate-500"><span className="font-semibold">Reason:</span> {reason}</p>}</div>})}</div>:<p className="rounded-2xl bg-slate-50 p-4 text-sm text-slate-400">No protected corrections recorded.</p>}</section></div>}</div><div className="border-t border-slate-100 p-5 flex justify-end"><button className="button-secondary" onClick={()=>setHistoryBatch(null)}>Close</button></div></div></div>}
  </div></div>
}

const Inventory = ({ services, canManageSellingPrice = false }) => {
  const toast = useToast()
  const { getInventory, updateStock, addInventoryItem, updateInventoryItem, deleteInventoryItem, getInventoryMasterData, createInventoryLocationType, updateInventoryLocationType, requestInventoryBatchActionCode, confirmInventoryBatchAction, getInventoryBatchHistory } = services
  const [items, setItems] = useState([])
  const [batchManagerItem, setBatchManagerItem] = useState(null)
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [category, setCategory] = useState('All')
  const [locationTypeFilter, setLocationTypeFilter] = useState('All')
  const [showAdd, setShowAdd] = useState(false)
  const [newItemBarcode, setNewItemBarcode] = useState('')
  const [showLocationType, setShowLocationType] = useState(false)
  const [masterData, setMasterData] = useState({ uoms: [], suppliers: [], location_types: [], movement_reasons: [] })
  const [editItem, setEditItem] = useState(null)
  const [deleteCandidate, setDeleteCandidate] = useState(null)
  const [deleting, setDeleting] = useState(false)
  const [stockItem, setStockItem] = useState(null)
  const [stockMode, setStockMode] = useState('in')
  const [scannerOpen, setScannerOpen] = useState(false)
  const [feedback, setFeedback] = useState(null)
  const [page, setPage] = useState(1)
  const hasActiveLocationType = (masterData.location_types || []).some((entry) => Number(entry.is_active ?? 1) === 1)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const [data, masters] = await Promise.all([
        getInventory(),
        getInventoryMasterData ? getInventoryMasterData().catch(() => null) : Promise.resolve(null),
      ])
      setItems(Array.isArray(data) ? data : data?.items || [])
      if (masters) setMasterData({ uoms: masters?.uoms || [], suppliers: masters?.suppliers || [], location_types: masters?.location_types || [], movement_reasons: masters?.movement_reasons || [] })
    } finally {
      setLoading(false)
    }
  }, [getInventory, getInventoryMasterData])

  useEffect(() => { load() }, [load])

  useEffect(() => {
    if (!feedback) return undefined
    const timer = window.setTimeout(() => setFeedback(null), 3500)
    return () => window.clearTimeout(timer)
  }, [feedback])

  useEffect(() => {
    setPage(1)
  }, [search, category, locationTypeFilter])

  const filtered = useMemo(() => items.filter(item => {
    const matchesCategory = category === 'All' || item.category === category
    const matchesLocationType = locationTypeFilter === 'All' || Number(item.location_type_id) === Number(locationTypeFilter)
    const needle = search.toLowerCase()
    const matchesSearch = !needle ||
      item.name?.toLowerCase().includes(needle) ||
      item.barcode?.toLowerCase().includes(needle) ||
      item.supplier?.toLowerCase().includes(needle) ||
      item.location_type_name?.toLowerCase().includes(needle)
    return matchesCategory && matchesLocationType && matchesSearch
  }), [items, category, locationTypeFilter, search])

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
      await load().catch(() => {})
      setDeleteCandidate(null)
    } finally {
      setDeleting(false)
    }
  }

  const handleStockUpdate = async (payload) => {
    try {
      const updated = await updateStock(stockItem.id, payload)
      if (updated?.id) setItems((current)=>current.map((entry)=>Number(entry.id)===Number(updated.id)?updated:entry))
      await load()
      setFeedback({ type: 'success', message: payload.type === 'in' ? `${stockItem.name} stock received as a new batch.` : `${stockItem.name} stock out recorded and inventory totals refreshed.` })
      setStockItem(null)
    } catch (err) {
      setFeedback({ type: 'error', message: err.message || 'Failed to update stock.' })
      await load().catch(()=>{})
    }
  }

  const handleScannerDetected = useCallback((code) => {
    setScannerOpen(false)
    const normalizedCode = String(code || '').trim()
    const found = items.find((item) => String(item.barcode || '').trim() === normalizedCode)
    if (found) {
      toast.success(`Barcode matched ${found.name}.`)
      setStockMode('in')
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
          <p className="text-sm text-slate-500 mt-1">Batch-aware inventory with configurable Units of Measure and Location Types, generated barcodes, and single-unit stock tracking.</p>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={load} className="w-10 h-10 rounded-xl border border-slate-200 text-slate-500 hover:bg-slate-50 flex items-center justify-center"><MdRefresh className="text-[18px]" /></button>
          <button onClick={() => setScannerOpen(true)} className="rounded-2xl border border-sky-200 bg-sky-50 px-4 py-3 text-sm font-semibold text-sky-700 flex items-center gap-2"><MdQrCodeScanner /> Scan Barcode</button>
          {createInventoryLocationType && <button onClick={() => setShowLocationType(true)} className="rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm font-semibold text-slate-700 flex items-center gap-2"><MdLocationOn /> Add Location Type</button>}<button title={masterData.uoms.length && hasActiveLocationType ? 'Add inventory item' : 'Configure at least one active Unit of Measure and Location Type first'} disabled={!masterData.uoms.length || !hasActiveLocationType} onClick={() => { setNewItemBarcode(''); setShowAdd(true) }} className="rounded-2xl bg-[#0b1a2c] px-4 py-3 text-sm font-semibold text-white flex items-center gap-2 disabled:cursor-not-allowed disabled:opacity-40"><MdAdd /> Add Item</button>
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

      {(!masterData.uoms.length || !hasActiveLocationType) && <div className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800"><strong>Inventory setup required.</strong> {!masterData.uoms.length ? 'Add at least one active Unit of Measure in Admin → System Setup. ' : ''}{!hasActiveLocationType ? 'Add at least one active Location Type before creating items.' : ''}</div>}

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

      <div className="grid gap-3 lg:grid-cols-[1fr_auto_240px]">
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
        <select aria-label="Filter by location type" value={locationTypeFilter} onChange={(e)=>setLocationTypeFilter(e.target.value)} className="rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm font-semibold text-slate-600 outline-none focus:border-sky-400">
          <option value="All">All Location Types</option>
          {(masterData.location_types || []).map((entry)=><option key={entry.id} value={entry.id}>{entry.name}</option>)}
        </select>
      </div>

      <div className="grid gap-4">
        {paginated.map(item => {
          const locationTotals = getLocationTotals(item)
          const activeBatches = (Array.isArray(item.batches)?item.batches:[]).filter((batch)=>!batch.archived_at&&Number(batch.quantity||0)>0)
          return <div key={item.id} className="bg-white border border-slate-200 rounded-3xl p-5 shadow-sm">
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
                <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
                  {locationTotals.length ? locationTotals.slice(0,6).map((location)=><div key={location.name} className="rounded-xl border border-slate-100 bg-slate-50 px-3 py-2 text-xs"><p className="font-semibold text-slate-500">{location.name}</p><p className="mt-0.5 font-black text-slate-800">{location.quantity} {item.uom || item.unit}</p></div>) : <div className="rounded-xl border border-slate-100 bg-slate-50 px-3 py-2 text-xs text-slate-400">No location stock</div>}
                </div>
                <p className="text-xs text-slate-400">Low stock threshold: {item.threshold} {item.uom || item.unit} · Active batch cost: {getActiveBatchCostSummary(item)} · Patient price {item.selling_price === null || item.selling_price === undefined ? 'not configured' : `PHP ${Number(item.selling_price).toFixed(2)}`}</p>
                {item.barcode && <div className="max-w-sm pt-1"><BarcodePreview value={item.barcode} title="Item Barcode" compact /></div>}
                <div className="flex flex-wrap gap-3 pt-1 text-xs">
                  <span className="inline-flex items-center gap-1 text-slate-500">
                    <MdLocationOn className="text-[14px]" /> Location Type: {item.location_type_name || 'Not assigned'}
                  </span>
                  <span className={`inline-flex items-center gap-1 ${getExpiryMeta(item).tone}`}>
                    <MdCalendarToday className="text-[14px]" /> {getExpiryMeta(item).label}
                  </span>
                </div>
                {Array.isArray(item.batches) && item.batches.length > 0 && (
                  <div className="pt-3">
                    <div className="flex items-center justify-between gap-3"><p className="text-xs font-bold uppercase tracking-widest text-slate-400">Active Batches ({activeBatches.length})</p></div>
                    <div className="mt-2 flex flex-wrap gap-2">
                      {item.batches.filter((batch)=>!batch.archived_at && Number(batch.quantity || 0)>0).slice(0, 4).map(batch => (
                        <span key={batch.id} className="rounded-full border border-slate-200 bg-slate-50 px-3 py-1 text-xs text-slate-600">
                          {batch.batch_code || `Batch #${batch.id}`}{batch.supplier_lot_number ? ` · Lot ${batch.supplier_lot_number}` : ''} - {formatBatchLabel(batch, item.unit)}
                        </span>
                      ))}
                      {item.batches.filter((batch)=>!batch.archived_at && Number(batch.quantity || 0)>0).length > 4 && (
                        <span className="rounded-full border border-slate-200 bg-slate-50 px-3 py-1 text-xs text-slate-500">+{item.batches.filter((batch)=>!batch.archived_at && Number(batch.quantity || 0)>0).length - 4} more active batches</span>
                      )}
                      {item.batches.filter((batch)=>!batch.archived_at && Number(batch.quantity || 0)>0).length===0 && <span className="text-xs text-slate-400">No active batch stock.</span>}
                    </div>
                  </div>
                )}
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <button onClick={() => { setStockMode('in'); setStockItem(item) }} className="rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm font-bold text-emerald-700 hover:bg-emerald-100 flex items-center gap-2"><MdInventory2 /> Stock In</button>
                <button onClick={() => { setStockMode('out'); setStockItem(item) }} className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-bold text-red-700 hover:bg-red-100 flex items-center gap-2"><MdInventory2 /> Stock Out</button>
                <button onClick={() => setEditItem(item)} className="rounded-2xl border border-slate-200 px-4 py-3 text-sm font-semibold text-slate-600 hover:bg-slate-50 flex items-center gap-2"><MdEdit /> Edit Item</button>
                {requestInventoryBatchActionCode && confirmInventoryBatchAction && <button onClick={()=>setBatchManagerItem(item)} className="rounded-2xl border border-sky-200 bg-sky-50 px-4 py-3 text-sm font-bold text-sky-700 hover:bg-sky-100 flex items-center gap-2"><MdInventory2/> Manage Batches</button>}
                <button onClick={() => handleDelete(item)} title="Delete item" className="w-11 h-11 rounded-2xl border border-red-200 text-red-500 hover:bg-red-50 flex items-center justify-center"><MdDelete className="text-[18px]" /></button>
              </div>
            </div>
          </div>
        })}
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

      <LocationTypesSection
        locationTypes={masterData.location_types || []}
        items={items}
        onAdd={createInventoryLocationType ? () => setShowLocationType(true) : null}
        onEdit={updateInventoryLocationType ? async (id,payload) => { const updated=await updateInventoryLocationType(id,payload); setMasterData((prev)=>({...prev,location_types:prev.location_types.map((entry)=>Number(entry.id)===Number(id)?{...entry,...updated}:entry)})); setItems((prev)=>prev.map((item)=>Number(item.location_type_id)===Number(id)?{...item,location_type_name:updated.name}:item)); setFeedback({type:'success',message:'Location Type updated.'}) } : null}
      />

      {showLocationType && createInventoryLocationType && <LocationTypeModal onClose={() => setShowLocationType(false)} onCreate={async (payload) => { const created = await createInventoryLocationType(payload); setMasterData((prev)=>({ ...prev, location_types: [...prev.location_types, created].sort((a,b)=>String(a.name).localeCompare(String(b.name))) })); setFeedback({ type: 'success', message: `${created.name} Location Type added.` }) }} />}
      {showAdd && <ItemFormModal title="Add Item" initialBarcode={newItemBarcode} canManageSellingPrice={canManageSellingPrice} masterData={masterData} existingItems={items} onClose={() => { setShowAdd(false); setNewItemBarcode('') }} onSubmit={handleAdd} />}
      {editItem && <ItemFormModal title="Edit Inventory Item" initialItem={editItem} canManageSellingPrice={canManageSellingPrice} masterData={masterData} existingItems={items} onClose={() => setEditItem(null)} onSubmit={handleEdit} />}
      {stockItem && <StockModal item={stockItem} initialType={stockMode} movementReasons={masterData.movement_reasons || []} onClose={() => setStockItem(null)} onSubmit={handleStockUpdate} />}
      {scannerOpen && <CameraScanner onDetected={handleScannerDetected} onClose={() => setScannerOpen(false)} />}
      {batchManagerItem && requestInventoryBatchActionCode && confirmInventoryBatchAction && <BatchManagerModal item={batchManagerItem} onClose={()=>setBatchManagerItem(null)} onRequestAction={requestInventoryBatchActionCode} onConfirmAction={confirmInventoryBatchAction} onLoadHistory={getInventoryBatchHistory} onChanged={async (message)=>{setBatchManagerItem(null);await load();setFeedback({type:'success',message})}} />}
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

