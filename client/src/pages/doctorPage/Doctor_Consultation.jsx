import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { useLocation, useNavigate, useSearchParams, NavLink } from 'react-router-dom'
import { useAuth } from '../../context/AuthContext'
import { uploadClinicalImageSigned, getClinicalImageScanStatus } from '../../services/portal.service'
import Modal from '../../components/ui/Modal'
import {
  saveConsultationDraft,
  finalizeConsultation,
  updateConsultation,
  getConsultation,
  getPatientHistory,
  getInventoryItems,
  getBillingCatalog,
  addConsultationAmendment,
} from '../../services/doctor.service'
import { doctorClinicLabel } from '../../utils/doctor'
import { getClinicSettings } from '../../services/clinic.service'
import { printConsultationRecord } from '../../utils/consultationPrint'
import {
  MdAccessTime,
  MdAdd,
  MdArrowBack,
  MdCalendarToday,
  MdCheck,
  MdClose,
  MdEdit,
  MdFace,
  MdHistory,
  MdImage,
  MdLocalPharmacy,
  MdMedicalServices,
  MdNotes,
  MdOpenInNew,
  MdPerson,
  MdPrint,
  MdUpload,
  MdSearch,
  MdLock,
  MdInventory2,
  MdVisibility,
  MdChevronLeft,
  MdChevronRight,
} from 'react-icons/md'

function formatDate(raw) {
  if (!raw) return '—'
  const str = typeof raw === 'string' ? raw : String(raw)
  const ymd = str.slice(0, 10)
  const [y, m, d] = ymd.split('-').map(Number)
  if (!y || !m || !d) return str
  return new Date(y, m - 1, d).toLocaleDateString('en-PH', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  })
}

const FREQUENCIES = ['Once daily', 'Twice daily', 'Three times daily', 'Every 8 hours', 'Every 12 hours', 'As needed (PRN)']
const isCustomOption = (value, options) => Boolean(value) && !options.includes(value)

const normalizePrescription = (prescription = {}) => {
  const next = { ...prescription }
  if (next.quantity === undefined || next.quantity === null || next.quantity === '') next.quantity = next.dosage ?? ''
  delete next.dosage
  delete next.duration
  return next
}

const serializePrescription = (prescription) => {
  const next = normalizePrescription(prescription)
  delete next.inventory_id
  delete next.unit_label
  return next
}

const createBlankProgressImage = () => ({
  image_url: '',
  caption: '',
  security_scan_status: 'legacy',
  security_token: '',
})

const normalizeProgressImages = (images = []) => (
  Array.isArray(images)
    ? images.map((image) => ({
      image_url: String(image?.image_url || image?.url || '').trim(),
      caption: String(image?.caption || image?.notes || '').trim(),
      security_scan_status: ['approved', 'bypassed', 'legacy'].includes(String(image?.security_scan_status || '').toLowerCase())
        ? String(image.security_scan_status).toLowerCase()
        : 'legacy',
      security_token: String(image?.security_token || '').trim(),
    })).filter((image) => image.image_url || image.caption)
    : []
)

const PRESCRIPTION_DECISIONS = new Set(['not_recorded', 'prescribed', 'none'])

const blankPrescription = () => ({
  medicine: '',
  quantity: '',
  frequency: '',
  notes: '',
})

const prescriptionHasContent = (prescription = {}) => (
  Boolean(String(prescription?.medicine || '').trim())
  || Boolean(String(prescription?.quantity || '').trim())
  || Boolean(String(prescription?.frequency || '').trim())
  || Boolean(String(prescription?.notes || '').trim())
)

const normalizePrescriptionDecision = (value, prescriptions = [], status = 'draft') => {
  const normalized = String(value || '').trim().toLowerCase()
  if (PRESCRIPTION_DECISIONS.has(normalized)) return normalized
  if ((Array.isArray(prescriptions) ? prescriptions : []).some((item) => String(item?.medicine || '').trim())) return 'prescribed'
  return status === 'finalized' ? 'none' : 'not_recorded'
}

// Render above every layout/overflow container, even on finalized consultations.
const ProgressImagePreviewModal = ({ image, index, total, onClose, onMove }) => {
  useEffect(() => {
    const previousOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    const handleKeyDown = (event) => {
      if (event.key === 'Escape') onClose?.()
    }
    document.addEventListener('keydown', handleKeyDown)
    return () => {
      document.body.style.overflow = previousOverflow
      document.removeEventListener('keydown', handleKeyDown)
    }
  }, [onClose])

  if (!image?.image_url) return null

  return createPortal(
    <div
      className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/90 p-3 sm:p-6"
      onClick={onClose}
      role="presentation"
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Consultation progress image preview"
        className="flex h-full w-full max-w-6xl flex-col items-center justify-center gap-4"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="flex w-full items-center justify-between gap-3 text-white">
          <p className="text-xs font-semibold sm:text-sm">Progress Image {index + 1} of {total}</p>
          <button type="button" onClick={onClose} aria-label="Close image preview" autoFocus className="rounded-lg p-2 hover:bg-white/20 focus-visible:outline focus-visible:outline-2 focus-visible:outline-white">
            <MdClose className="text-2xl" />
          </button>
        </div>
        <div className="flex min-h-0 w-full flex-1 items-center justify-center gap-2 sm:gap-4">
          <button type="button" onClick={() => onMove?.(-1)} aria-label="Previous image" disabled={total <= 1} className="shrink-0 rounded-xl bg-white/15 p-2 text-white hover:bg-white/25 disabled:opacity-30 sm:p-3">
            <MdChevronLeft className="text-2xl" />
          </button>
          <img src={image.image_url} alt={image.caption || `Progress image ${index + 1}`} className="max-h-full min-h-0 min-w-0 max-w-full flex-1 object-contain" />
          <button type="button" onClick={() => onMove?.(1)} aria-label="Next image" disabled={total <= 1} className="shrink-0 rounded-xl bg-white/15 p-2 text-white hover:bg-white/25 disabled:opacity-30 sm:p-3">
            <MdChevronRight className="text-2xl" />
          </button>
        </div>
        <p className="max-w-full truncate pb-3 text-center text-sm text-white/90" title={image.caption || ''}>
          {image.caption || 'No caption provided.'}
        </p>
      </div>
    </div>,
    document.body,
  )
}

const ProgressImageGallery = ({ images = [], emptyText = 'No progress images added yet.', onPreview }) => {
  const list = normalizeProgressImages(images).filter((image) => image.image_url)

  if (list.length === 0) {
    return (
      <div className="rounded-2xl border border-dashed border-slate-200 bg-slate-50 px-4 py-8 text-center text-sm text-slate-400">
        {emptyText}
      </div>
    )
  }

  return (
    <div className="grid gap-3 sm:grid-cols-2">
      {list.map((image, index) => (
        <a
          key={`${image.image_url}-${index}`}
          href={image.image_url}
          target={onPreview ? undefined : '_blank'}
          rel={onPreview ? undefined : 'noreferrer'}
          onClick={(event) => {
            if (!onPreview) return
            event.preventDefault()
            onPreview(images, image.image_url)
          }}
          aria-label={`Preview ${image.caption || `progress image ${index + 1}`}`}
          className="group overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm transition-shadow hover:shadow-md"
        >
          <img
            src={image.image_url}
            alt={image.caption || `Consultation progress ${index + 1}`}
            className="h-44 w-full object-cover bg-slate-100"
          />
          <div className="flex items-start justify-between gap-3 px-4 py-3">
            <div className="min-w-0">
              <p className="text-xs font-bold uppercase tracking-widest text-slate-400">Progress Image</p>
              <p className="mt-1 text-sm text-slate-700">
                {image.caption || 'No caption provided.'}
              </p>
              <span className={`mt-2 inline-flex rounded-full px-2 py-0.5 text-[10px] font-bold ${image.security_scan_status === 'approved' ? 'bg-emerald-50 text-emerald-700' : image.security_scan_status === 'bypassed' ? 'bg-amber-50 text-amber-800' : 'bg-slate-100 text-slate-500'}`}>
                {image.security_scan_status === 'approved' ? 'Security scan passed' : image.security_scan_status === 'bypassed' ? 'Not malware scanned' : 'Legacy image'}
              </span>
            </div>
            <MdOpenInNew className="mt-0.5 shrink-0 text-slate-300 transition-colors group-hover:text-slate-500" />
          </div>
        </a>
      ))}
    </div>
  )
}

const Doctor_Consultation = () => {
  const location = useLocation()
  const navigate = useNavigate()
  const [params] = useSearchParams()
  const { user } = useAuth()

  const apptFromState = location.state?.appointment
  const apptIdParam = params.get('id')

  const [appt, setAppt] = useState(apptFromState || null)
  const [isEditMode, setIsEditMode] = useState(false)
  const [initLoading, setInitLoading] = useState(Boolean(apptFromState?.id || apptIdParam))

  const [diagnosis, setDiagnosis] = useState('')
  const [notes, setNotes] = useState('')
  const [prescriptions, setPrescriptions] = useState([])
  const [prescriptionDecision, setPrescriptionDecision] = useState('not_recorded')
  const [progressImages, setProgressImages] = useState([])
  const [progressImagePreview, setProgressImagePreview] = useState(null)
  const [patientHistory, setPatientHistory] = useState([])
  const [saving, setSaving] = useState(false)
  const [tab, setTab] = useState('consultation')
  const [inventoryItems, setInventoryItems] = useState([])
  const [billingCatalog, setBillingCatalog] = useState([])
  const [billableServices, setBillableServices] = useState([])
  const [clinicSettings, setClinicSettings] = useState(null)
  const [uploadingIndex, setUploadingIndex] = useState(null)
  const [imageUploadStatus, setImageUploadStatus] = useState({})
  const [scanBypassPrompt, setScanBypassPrompt] = useState(null)
  const [pendingScanPrompt, setPendingScanPrompt] = useState(null)
  const [consultationStatus, setConsultationStatus] = useState('draft')
  const [lastSavedAt, setLastSavedAt] = useState(null)
  const [autoSaveError, setAutoSaveError] = useState('')
  const [autoSaveState, setAutoSaveState] = useState('idle')
  const [autosaveReady, setAutosaveReady] = useState(false)
  const autosaveInFlightRef = useRef(false)
  const autosaveQueuedRef = useRef(false)
  const lastSavedSignatureRef = useRef('')
  const latestDraftRef = useRef({ signature: '', payload: null })
  const finalizingRef = useRef(false)
  const [amendments, setAmendments] = useState([])
  const [amendmentReason, setAmendmentReason] = useState('')
  const [amendmentText, setAmendmentText] = useState('')
  const [addingAmendment, setAddingAmendment] = useState(false)
  const [extraConsumableOpen, setExtraConsumableOpen] = useState(false)
  const [extraConsumableSearch, setExtraConsumableSearch] = useState('')
  const [extraConsumableId, setExtraConsumableId] = useState('')
  const [extraConsumableQuantity, setExtraConsumableQuantity] = useState(1)

  const openProgressImagePreview = useCallback((images, imageUrl) => {
    const validImages = normalizeProgressImages(images).filter((image) => image.image_url)
    const initialIndex = validImages.findIndex((image) => image.image_url === imageUrl)
    if (initialIndex < 0) return
    setProgressImagePreview({ images: validImages, index: initialIndex })
  }, [])

  const closeProgressImagePreview = useCallback(() => setProgressImagePreview(null), [])
  const moveProgressImagePreview = useCallback((delta) => {
    setProgressImagePreview((current) => {
      if (!current?.images?.length) return current
      const count = current.images.length
      return { ...current, index: (current.index + delta + count) % count }
    })
  }, [])

  useEffect(() => {
    if (!progressImagePreview) return undefined
    const handlePreviewArrowKeys = (event) => {
      if (event.key === 'ArrowLeft') moveProgressImagePreview(-1)
      if (event.key === 'ArrowRight') moveProgressImagePreview(1)
    }
    document.addEventListener('keydown', handlePreviewArrowKeys)
    return () => document.removeEventListener('keydown', handlePreviewArrowKeys)
  }, [progressImagePreview, moveProgressImagePreview])

  const date = new Date().toLocaleDateString('en-PH', { month: 'long', day: 'numeric', year: 'numeric' })

  const loadHistory = async (patientId) => {
    if (!patientId) return
    try {
      const data = await getPatientHistory(patientId)
      setPatientHistory(Array.isArray(data) ? data : [])
    } catch {
      setPatientHistory([])
    }
  }

  const applyConsultationData = (consult) => {
    const nextStatus = consult.status || 'finalized'
    setConsultationStatus(nextStatus)
    setIsEditMode(nextStatus === 'finalized')
    setAmendments(Array.isArray(consult.amendments) ? consult.amendments : [])
    setDiagnosis(consult.diagnosis || '')
    setNotes(consult.notes || '')
    setProgressImages(normalizeProgressImages(consult.progress_images))
    try {
      const rx = typeof consult.prescription === 'string'
        ? JSON.parse(consult.prescription)
        : consult.prescription
      const normalizedRx = Array.isArray(rx) ? rx.map(normalizePrescription).filter(prescriptionHasContent) : []
      setPrescriptions(normalizedRx)
      setPrescriptionDecision(normalizePrescriptionDecision(consult.prescription_status, normalizedRx, nextStatus))
    } catch {
      setPrescriptions([])
      setPrescriptionDecision(normalizePrescriptionDecision(consult.prescription_status, [], nextStatus))
    }
    const serviceItems = Array.isArray(consult?.billing?.items) ? consult.billing.items.filter((item) => item.item_type === 'service') : []
    setBillableServices(serviceItems.map((item) => {
      let details = {}
      try { details = typeof item.details_json === 'string' ? JSON.parse(item.details_json) : (item.details_json || {}) } catch { details = {} }
      return { catalog_service_id: item.catalog_service_id, service_name: item.service_name, quantity: Number(item.quantity || 1), materials: Array.isArray(details?.materials) ? details.materials : [] }
    }))
  }

  useEffect(() => {
    if (apptFromState || !apptIdParam) return
    setInitLoading(true)
    setAutosaveReady(false)
    getConsultation(apptIdParam)
      .then((consult) => {
        setAppt({
          id: Number(apptIdParam),
          patient_id: consult.patient_id,
          patient_name: consult.patient_name,
          patient: consult.patient_name,
          patient_age: consult.patient_age,
          patient_sex: consult.patient_sex,
          patient_phone: consult.patient_phone,
          reason: consult.reason,
          requested_service_id: consult.requested_service_id,
          requested_service_name_snapshot: consult.requested_service_name_snapshot,
          requested_service_price_snapshot: consult.requested_service_price_snapshot,
          time: consult.time,
          type: consult.type,
          status: (consult.status || 'finalized') === 'finalized' ? 'completed' : 'in-progress',
        })
        applyConsultationData(consult)
        setIsEditMode((consult.status || 'finalized') === 'finalized')
      })
      .catch(() => {})
      .finally(() => { setAutosaveReady(true); setInitLoading(false) })
  }, [apptIdParam, apptFromState])

  useEffect(() => {
    if (!apptFromState?.id) return
    setInitLoading(true)
    setAutosaveReady(false)
    getConsultation(apptFromState.id)
      .then((consult) => applyConsultationData(consult))
      .catch(() => {
        // A consultation does not exist until the doctor starts entering clinical information.
        if (apptFromState.status === 'completed') setIsEditMode(true)
      })
      .finally(() => { setAutosaveReady(true); setInitLoading(false) })
  }, [apptFromState])

  useEffect(() => {
    if (!appt?.patient_id) return
    loadHistory(appt.patient_id)
  }, [appt?.patient_id])

  useEffect(() => {
    getInventoryItems()
      .then((data) => setInventoryItems(Array.isArray(data) ? data : []))
      .catch(() => setInventoryItems([]))
  }, [])

  useEffect(() => {
    getClinicSettings().then(setClinicSettings).catch(() => setClinicSettings(null))
  }, [])

  useEffect(() => {
    const clinicType = appt?.type || appt?.clinic_type || ''
    if (!clinicType) return
    getBillingCatalog(clinicType).then((rows) => {
      const catalog = Array.isArray(rows) ? rows : []
      setBillingCatalog(catalog)
      setBillableServices((current) => {
        if (consultationStatus === 'finalized') return current
        const requested = catalog.find((service) => Number(service.id) === Number(appt?.requested_service_id))
        if (!current.length) {
          if (!requested) return current
          return [{
            catalog_service_id: requested.id,
            service_name: requested.service_name,
            quantity: 1,
            materials: (requested.materials || []).map((material) => ({
              inventory_id: material.inventory_id,
              material_name: material.material_name || material.inventory_name,
              quantity: Number(material.quantity || 0),
              unit_label: material.inventory_base_unit || material.unit_label || material.inventory_unit || '',
            })),
          }]
        }

        return current.map((serviceLine) => {
          const catalogService = catalog.find((service) => Number(service.id) === Number(serviceLine.catalog_service_id))
          if (!catalogService) return serviceLine
          const existingIds = new Set((serviceLine.materials || []).map((material) => Number(material.inventory_id || 0)).filter(Boolean))
          const missingDefaults = (catalogService.materials || [])
            .filter((material) => Number(material.inventory_id || 0) > 0 && !existingIds.has(Number(material.inventory_id)))
            .map((material) => ({
              inventory_id: material.inventory_id,
              material_name: material.material_name || material.inventory_name,
              quantity: 0,
              unit_label: material.inventory_base_unit || material.unit_label || material.inventory_unit || '',
            }))
          return {
            ...serviceLine,
            service_name: serviceLine.service_name || catalogService.service_name,
            materials: [...(serviceLine.materials || []), ...missingDefaults],
          }
        })
      })
    }).catch(() => setBillingCatalog([]))
  }, [appt?.type, appt?.clinic_type, appt?.requested_service_id, consultationStatus])

  const currentPatient = appt ? {
    id: appt.patient_id,
    name: appt.patient_name || appt.patient,
    age: appt.patient_age || '—',
    sex: appt.patient_sex || '—',
    appointmentId: appt.id,
    reason: appt.reason,
    time: appt.time || appt.appointment_time,
    type: appt.type || appt.clinic_type,
  } : null

  const updateRx = (index, field, value) => (
    setPrescriptions((prev) => prev.map((rx, rxIndex) => (
      rxIndex === index ? { ...rx, [field]: value } : rx
    )))
  )

  const addRx = () => {
    setPrescriptionDecision('prescribed')
    setPrescriptions((prev) => prev.length >= 30 ? prev : [...prev, blankPrescription()])
  }

  const removeRx = (index) => setPrescriptions((prev) => prev.filter((_, rxIndex) => rxIndex !== index))

  const choosePrescriptionDecision = (decision) => {
    if (isEditMode) return
    if (decision === 'none') {
      if (prescriptions.some(prescriptionHasContent) && !window.confirm('Clear the medicines already entered and record No Prescription for this consultation?')) return
      setPrescriptionDecision('none')
      setPrescriptions([])
      return
    }
    setPrescriptionDecision('prescribed')
    setPrescriptions((current) => current.length ? current : [blankPrescription()])
  }

  const updateProgressImage = (index, field, value) => {
    setProgressImages((prev) => prev.map((image, imageIndex) => (
      imageIndex === index ? { ...image, [field]: value } : image
    )))
  }

  const removeProgressImage = (index) => {
    if (!window.confirm('Remove this progress image from the consultation? This change will be permanent once the consultation is saved.')) return
    setProgressImages((prev) => prev.filter((_, imageIndex) => imageIndex !== index))
    setImageUploadStatus((current) => {
      const next = { ...current }
      delete next[index]
      return next
    })
  }

  const setClinicalUploadStatus = (index, status) => {
    setImageUploadStatus((current) => ({ ...current, [index]: status }))
  }

  const applyClinicalUploadResult = (index, file, result) => {
    setProgressImages((current) => {
      const next = [...current]
      while (next.length <= index) next.push(createBlankProgressImage())
      const existing = next[index] || createBlankProgressImage()
      next[index] = {
        ...existing,
        image_url: result.url || existing.image_url,
        security_scan_status: result.scan_status || existing.security_scan_status || 'legacy',
        security_token: result.security_token || '',
        caption: existing.caption || '',
      }
      return next
    })
  }

  const handleUploadProgressImages = async (selectedFiles) => {
    const requestedFiles = Array.isArray(selectedFiles) ? selectedFiles : Array.from(selectedFiles || [])
    if (!requestedFiles.length) return

    const validFiles = requestedFiles.filter((file) => (
      ['image/png', 'image/jpeg'].includes(String(file.type || '').toLowerCase())
      && Number(file.size || 0) <= 10 * 1024 * 1024
    ))
    if (validFiles.length !== requestedFiles.length) {
      window.alert('Only PNG or JPG images up to 10 MB each can be uploaded.')
    }

    const remainingSlots = Math.max(0, 5 - progressImages.length)
    if (remainingSlots === 0) {
      window.alert('You can upload up to 5 progress images for this consultation.')
      return
    }

    const files = validFiles.slice(0, remainingSlots)
    if (validFiles.length > remainingSlots) {
      window.alert(`Only ${remainingSlots} more progress image${remainingSlots === 1 ? '' : 's'} can be added. The maximum is 5.`)
    }
    if (!files.length) return

    const start = progressImages.length
    setProgressImages((prev) => [...prev, ...files.map(() => createBlankProgressImage())])
    for (let offset = 0; offset < files.length; offset += 1) {
      await handleUploadProgressImage(start + offset, files[offset])
    }
  }

  const handleUploadProgressImage = async (index, file) => {
    if (!file) return
    if (!['image/png','image/jpeg'].includes(String(file.type || '').toLowerCase())) {
      setClinicalUploadStatus(index, { tone: 'danger', message: 'Select a PNG or JPG image.' })
      return
    }
    if (Number(file.size || 0) > 10 * 1024 * 1024) {
      setClinicalUploadStatus(index, { tone: 'danger', message: 'Clinical images must be 10 MB or smaller.' })
      return
    }
    setScanBypassPrompt(null)
    setPendingScanPrompt(null)
    setUploadingIndex(index)
    setClinicalUploadStatus(index, { tone: 'info', message: 'Uploading image securely…' })
    try {
      const result = await uploadClinicalImageSigned(file, appt?.id, {
        scanMode: 'scan',
        onStatus: (status) => setClinicalUploadStatus(index, status),
      })
      applyClinicalUploadResult(index, file, result)
      setClinicalUploadStatus(index, {
        tone: result.scan_status === 'bypassed' ? 'warning' : 'success',
        message: result.scan_status === 'bypassed' ? 'Upload complete without malware scanning.' : 'Upload complete. Security scan passed.',
      })
    } catch (err) {
      if (err.code === 'SCAN_UNAVAILABLE' || err.code === 'SCAN_LIMIT_REACHED') {
        const limitReached = err.code === 'SCAN_LIMIT_REACHED'
        setClinicalUploadStatus(index, { tone: 'warning', message: limitReached ? 'Security scanner usage limit reached — confirmation required.' : 'Security scanner unavailable — confirmation required.' })
        setScanBypassPrompt({ index, file, message: err.message, reason: limitReached ? 'usage_limit_reached' : 'scanner_unavailable', bypass_token: err.bypass_token || '' })
      } else if (err.code === 'SCAN_REJECTED') {
        setClinicalUploadStatus(index, { tone: 'danger', message: 'Unsafe image detected — upload blocked.' })
      } else if (err.code === 'SCAN_PENDING') {
        setClinicalUploadStatus(index, { tone: 'info', message: 'Security scan is taking longer than expected. The image is still quarantined and has not been attached.' })
        setPendingScanPrompt({ index, file, asset_id: err.asset_id, url: err.url, public_id: err.public_id, scan_token: err.scan_token })
      } else {
        setClinicalUploadStatus(index, { tone: 'danger', message: err.message || 'Failed to upload image.' })
      }
    } finally {
      setUploadingIndex(null)
    }
  }

  const checkPendingClinicalScan = async () => {
    if (!pendingScanPrompt?.asset_id || !Number.isInteger(pendingScanPrompt?.index)) return
    const { index, file, asset_id: assetId, url, scan_token: scanToken } = pendingScanPrompt
    setUploadingIndex(index)
    setClinicalUploadStatus(index, { tone: 'info', message: 'Checking security scan status…' })
    try {
      const result = await getClinicalImageScanStatus(appt?.id, assetId, scanToken)
      if (result.status === 'approved') {
        applyClinicalUploadResult(index, file, { url: result.secure_url || url, scan_status: 'approved', asset_id: assetId, security_token: result.security_token })
        setClinicalUploadStatus(index, { tone: 'success', message: 'Upload complete. Security scan passed.' })
        setPendingScanPrompt(null)
      } else if (result.status === 'rejected') {
        setClinicalUploadStatus(index, { tone: 'danger', message: 'Unsafe image detected — upload blocked.' })
        setPendingScanPrompt(null)
      } else if (result.status === 'unavailable') {
        setPendingScanPrompt(null)
        setScanBypassPrompt({ index, file, message: result.message, reason: result.reason || 'scanner_unavailable', bypass_token: result.bypass_token || '' })
        setClinicalUploadStatus(index, { tone: 'warning', message: 'Security scanner unavailable — confirmation required.' })
      } else {
        setClinicalUploadStatus(index, { tone: 'info', message: 'Security scan is still in progress. The image remains quarantined.' })
      }
    } catch (err) {
      setClinicalUploadStatus(index, { tone: 'danger', message: err.message || 'Could not check the security scan.' })
    } finally {
      setUploadingIndex(null)
    }
  }

  const continueClinicalUploadWithoutScan = async () => {
    if (!scanBypassPrompt?.file || !Number.isInteger(scanBypassPrompt?.index)) return
    const { index, file, bypass_token: bypassToken } = scanBypassPrompt
    if (!bypassToken) {
      setClinicalUploadStatus(index, { tone: 'danger', message: 'The server did not authorize an unscanned upload. Retry the security scan.' })
      return
    }
    setScanBypassPrompt(null)
    setUploadingIndex(index)
    try {
      const result = await uploadClinicalImageSigned(file, appt?.id, {
        scanMode: 'bypass',
        bypassToken,
        onStatus: (status) => setClinicalUploadStatus(index, status),
      })
      applyClinicalUploadResult(index, file, result)
      setClinicalUploadStatus(index, { tone: 'warning', message: 'Upload complete without malware scanning.' })
    } catch (err) {
      setClinicalUploadStatus(index, { tone: 'danger', message: err.message || 'Failed to upload image.' })
    } finally {
      setUploadingIndex(null)
    }
  }

  const updateServiceMaterial = (serviceId, materialIndex, quantity) => {
    if (isEditMode) return
    setBillableServices((prev) => prev.map((service) => Number(service.catalog_service_id) === Number(serviceId)
      ? { ...service, materials: (service.materials || []).map((material, index) => index === materialIndex ? { ...material, quantity: Math.max(0, Number(quantity) || 0) } : material) }
      : service))
  }

  const isDefaultServiceMaterial = (serviceId, inventoryId) => {
    const catalogService = billingCatalog.find((service) => Number(service.id) === Number(serviceId))
    if (!catalogService) return true
    return (catalogService.materials || []).some((material) => Number(material.inventory_id) === Number(inventoryId))
  }

  const removeExtraConsumable = (serviceId, materialIndex) => {
    if (isEditMode) return
    setBillableServices((prev) => prev.map((service) => Number(service.catalog_service_id) === Number(serviceId)
      ? { ...service, materials: (service.materials || []).filter((_, index) => index !== materialIndex) }
      : service))
  }

  const extraConsumableTarget = billableServices.find((service) => Number(service.catalog_service_id) === Number(appt?.requested_service_id)) || billableServices[0] || null
  const isExtraConsumable = (material) => material?.consultation_extra === true || Number(material?.consultation_extra || 0) === 1
  const extraConsumableRows = (extraConsumableTarget?.materials || [])
    .map((material, index) => ({ material, index }))
    .filter(({ material }) => isExtraConsumable(material))
  const extraConsumableSelected = inventoryItems.find((item) => Number(item.id) === Number(extraConsumableId)) || null
  const existingExtraConsumableIds = new Set(
    (extraConsumableTarget?.materials || [])
      .filter(isExtraConsumable)
      .map((material) => Number(material.inventory_id || 0))
      .filter(Boolean)
  )
  const availableExtraConsumables = inventoryItems
    .filter((item) => !existingExtraConsumableIds.has(Number(item.id)))
    .filter((item) => !currentPatient?.type || item.category === currentPatient.type)
    .filter((item) => {
      const needle = extraConsumableSearch.trim().toLowerCase()
      if (!needle) return true
      return [item.name, item.strength, item.dosage_form, item.item_type, item.uom, item.unit]
        .filter(Boolean)
        .some((value) => String(value).toLowerCase().includes(needle))
    })
    .slice(0, 80)

  const addExtraConsumable = () => {
    if (isEditMode || !extraConsumableTarget || !extraConsumableSelected) return
    const quantity = Math.max(0, Number(extraConsumableQuantity) || 0)
    if (quantity <= 0) {
      window.alert('Enter the additional quantity used for this extra consumable.')
      return
    }
    setBillableServices((current) => current.map((service) => Number(service.catalog_service_id) === Number(extraConsumableTarget.catalog_service_id)
      ? {
        ...service,
        materials: [...(service.materials || []), {
          inventory_id: extraConsumableSelected.id,
          material_name: extraConsumableSelected.name,
          quantity,
          unit_label: extraConsumableSelected.uom || extraConsumableSelected.unit || 'unit',
          consultation_extra: true,
        }],
      }
      : service))
    setExtraConsumableOpen(false)
    setExtraConsumableSearch('')
    setExtraConsumableId('')
    setExtraConsumableQuantity(1)
  }

  const handleAddAmendment = async () => {
    if (!appt?.id || !amendmentReason.trim() || !amendmentText.trim()) return
    setAddingAmendment(true)
    try {
      const result = await addConsultationAmendment(appt.id, {
        reason: amendmentReason.trim(),
        amendment_text: amendmentText.trim(),
      })
      setAmendments(Array.isArray(result.amendments) ? result.amendments : [])
      setAmendmentReason('')
      setAmendmentText('')
    } catch (err) {
      alert(err.message || 'Failed to add amendment.')
    } finally {
      setAddingAmendment(false)
    }
  }

  const draftPayload = useMemo(() => {
    const prescriptionItems = prescriptionDecision === 'prescribed'
      ? prescriptions.filter(prescriptionHasContent).map((entry) => serializePrescription(entry))
      : []
    return {
      diagnosis,
      notes,
      prescription_status: prescriptionDecision,
      prescription: JSON.stringify(prescriptionItems),
      images: normalizeProgressImages(progressImages).filter((image) => image.image_url),
      billable_services: billableServices,
    }
  }, [diagnosis, notes, prescriptionDecision, prescriptions, progressImages, billableServices, inventoryItems])

  const draftSignature = useMemo(() => JSON.stringify(draftPayload), [draftPayload])
  latestDraftRef.current = { signature: draftSignature, payload: draftPayload }

  const persistDraft = useCallback(async ({ force = false } = {}) => {
    if (!appt?.id || consultationStatus === 'finalized' || !autosaveReady || uploadingIndex !== null || finalizingRef.current) return false
    if (autosaveInFlightRef.current) {
      autosaveQueuedRef.current = true
      return false
    }

    autosaveInFlightRef.current = true
    let success = true
    try {
      let forceNext = force
      do {
        autosaveQueuedRef.current = false
        const current = latestDraftRef.current
        if (!current.payload || (!forceNext && current.signature === lastSavedSignatureRef.current)) break
        forceNext = false
        setAutoSaveState('saving')
        await saveConsultationDraft(appt.id, current.payload)
        lastSavedSignatureRef.current = current.signature
        setConsultationStatus('draft')
        setIsEditMode(false)
        setLastSavedAt(new Date())
        setAutoSaveError('')
        setAutoSaveState('saved')
      } while (autosaveQueuedRef.current || latestDraftRef.current.signature !== lastSavedSignatureRef.current)
    } catch (err) {
      success = false
      setAutoSaveError(err.message || 'Consultation progress could not be saved.')
      setAutoSaveState('error')
    } finally {
      autosaveInFlightRef.current = false
    }
    return success
  }, [appt?.id, consultationStatus, autosaveReady, uploadingIndex])

  const handleFinalize = async () => {
    if (!appt || consultationStatus === 'finalized') return
    if (prescriptionDecision === 'not_recorded') {
      setTab('prescriptions')
      window.alert('Choose either Prescribe Medicine or No Prescription before completing the consultation.')
      return
    }
    if (prescriptionDecision === 'prescribed' && !prescriptions.some((item) => String(item.medicine || '').trim())) {
      setTab('prescriptions')
      window.alert('Add at least one medicine or choose No Prescription before completing the consultation.')
      return
    }
    if (appt?.requested_service_id && !billableServices.some((service) => Number(service.catalog_service_id) === Number(appt.requested_service_id))) {
      setTab('consultation')
      window.alert('The booked service is missing from this consultation. Reload the page before completing the consultation.')
      return
    }
    if (!window.confirm('Complete consultation? This will finalize the clinical record, update the bill, deduct the actual recorded consumables, and mark the appointment completed. Further corrections must be recorded as an amendment.')) return
    finalizingRef.current = true
    setSaving(true)
    try {
      await finalizeConsultation(appt.id, latestDraftRef.current.payload)
      lastSavedSignatureRef.current = latestDraftRef.current.signature
      setConsultationStatus('finalized')
      setIsEditMode(true)
      setLastSavedAt(new Date())
      setAutoSaveError('')
      setAutoSaveState('saved')
      setAppt((prev) => (prev ? { ...prev, status: 'completed' } : prev))
      await loadHistory(appt.patient_id)
    } catch (err) {
      alert(err.message || 'Failed to complete consultation. The record has not been finalized.')
    } finally {
      finalizingRef.current = false
      setSaving(false)
    }
  }

  // Save shortly after the doctor stops typing/changing fields. The timer is intentionally
  // a timeout (not an interval tied to field dependencies), so edits do not keep resetting
  // a long 25-second countdown and progress is persisted promptly.
  useEffect(() => {
    if (!appt?.id || consultationStatus === 'finalized' || !autosaveReady || uploadingIndex !== null) return undefined
    if (draftSignature === lastSavedSignatureRef.current) return undefined
    if (autoSaveState !== 'saving') setAutoSaveState('pending')
    const timer = window.setTimeout(() => { persistDraft() }, 1500)
    return () => window.clearTimeout(timer)
  }, [appt?.id, consultationStatus, autosaveReady, uploadingIndex, draftSignature, persistDraft])

  // Periodic fallback catches transient failures or a field that remained unsaved after a
  // browser/network interruption without creating overlapping draft writes.
  useEffect(() => {
    if (!appt?.id || consultationStatus === 'finalized' || !autosaveReady) return undefined
    const timer = window.setInterval(() => { persistDraft() }, 30000)
    return () => window.clearInterval(timer)
  }, [appt?.id, consultationStatus, autosaveReady, persistDraft])

  useEffect(() => {
    if (consultationStatus === 'finalized' || draftSignature === lastSavedSignatureRef.current) return undefined
    const beforeUnload = (event) => {
      event.preventDefault()
      event.returnValue = ''
    }
    window.addEventListener('beforeunload', beforeUnload)
    return () => window.removeEventListener('beforeunload', beforeUnload)
  }, [consultationStatus, draftSignature])

  if (initLoading) {
    return (
      <div className="flex items-center justify-center h-[60vh] text-slate-400 text-sm">
        Loading consultation...
      </div>
    )
  }

  if (!appt) {
    return (
      <div className="flex flex-col items-center justify-center h-[60vh] text-center">
        <MdMedicalServices className="text-5xl text-slate-200 mb-4" />
        <h2 className="text-xl font-bold text-slate-800">No Active Consultation</h2>
        <p className="text-slate-500 mb-6">Please select a patient from your appointments.</p>
        <NavLink
          to="/doctor/appointments"
          className="bg-violet-600 text-white px-6 py-2.5 rounded-xl font-bold hover:bg-violet-700 transition-colors"
        >
          Go to Appointments
        </NavLink>
      </div>
    )
  }

  const typeLabel = currentPatient?.type === 'derma' ? 'Dermatology' : 'General Medicine'
  const TypeIcon = currentPatient?.type === 'derma' ? MdFace : MdMedicalServices
  const latestProgressImage = normalizeProgressImages(progressImages).filter((image) => image.image_url).slice(-1)[0]

  return (
    <>

      <div className="mx-auto w-full max-w-6xl space-y-5">
        <div className="flex items-center gap-3">
          <button
            onClick={() => navigate(-1)}
            className="w-9 h-9 flex items-center justify-center rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-600 transition-colors"
          >
            <MdArrowBack className="text-[18px]" />
          </button>
          <div className="flex-1 min-w-0">
            <h1 className="text-xl font-bold text-slate-800 flex items-center gap-2">
              {isEditMode && <MdEdit className="text-violet-500 text-[18px]" />}
              {consultationStatus === 'finalized' ? 'Finalized Consultation' : 'Consultation'}
              {consultationStatus === 'finalized' && (
                <span className="text-xs font-semibold bg-emerald-50 text-emerald-700 border border-emerald-200 px-2 py-0.5 rounded-full">
                  Finalized · Original locked
                </span>
              )}
            </h1>
            <p className="text-sm text-slate-500 mt-0.5">{date}</p>
          </div>
          {consultationStatus === 'finalized' && <button
            onClick={() => document.getElementById('consultation-amendments')?.scrollIntoView({ behavior: 'smooth', block: 'start' })}
            className="flex items-center gap-1.5 px-3 py-2 text-xs font-bold text-violet-700 border border-violet-200 bg-violet-50 rounded-xl hover:bg-violet-100 transition-colors"
          >
            <MdEdit className="text-[14px]" /> Edit / Amend Record
          </button>}
          <button
            onClick={() => printConsultationRecord({ patient: currentPatient, diagnosis, notes, prescriptions, doctorName: user?.full_name || user?.name || 'Doctor', clinicAssignment: doctorClinicLabel(user), prcLicense: user?.prc_license || '', date: formatDate(appt?.appointment_date || new Date().toISOString()), clinic: clinicSettings, services: billableServices })}
            className="flex items-center gap-1.5 px-3 py-2 text-xs font-bold text-slate-600 border border-slate-200 rounded-xl hover:bg-slate-50 transition-colors"
          >
            <MdPrint className="text-[14px]" /> Print
          </button>
        </div>

        <div className="bg-white rounded-2xl border border-slate-200 px-6 py-4">
          <div className="flex items-center gap-4 flex-wrap">
            <div className={`w-11 h-11 rounded-xl flex items-center justify-center shrink-0 ${currentPatient?.type === 'derma' ? 'bg-emerald-50' : 'bg-slate-100'}`}>
              <TypeIcon className={`text-[20px] ${currentPatient?.type === 'derma' ? 'text-emerald-600' : 'text-slate-500'}`} />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-base font-bold text-slate-800">{currentPatient?.name}</p>
              <div className="flex items-center gap-3 mt-0.5 text-xs text-slate-500 flex-wrap">
                <span>{currentPatient?.age} yrs · {currentPatient?.sex}</span>
                <span className="flex items-center gap-1"><MdAccessTime className="text-[12px]" /> {currentPatient?.time}</span>
                <span>{typeLabel}</span>
              </div>
            </div>
            {currentPatient?.reason && (
              <div className="shrink-0 bg-slate-50 border border-slate-200 rounded-xl px-3 py-1.5 text-xs">
                <span className="text-slate-400">Reason: </span>
                <span className="font-semibold text-slate-700">{currentPatient.reason}</span>
              </div>
            )}
          </div>

          {latestProgressImage?.image_url && (
            <div className="mt-4 border-t border-slate-100 pt-4">
              <p className="text-[10px] font-bold uppercase tracking-widest text-slate-400 mb-2">Most Recent Progress Image</p>
              <div className="flex items-center gap-3 rounded-2xl border border-slate-200 bg-slate-50 p-3">
                <button type="button" onClick={() => openProgressImagePreview(progressImages, latestProgressImage.image_url)} aria-label="Preview most recent progress image" className="shrink-0 rounded-xl focus-visible:outline focus-visible:outline-2 focus-visible:outline-violet-500">
                  <img
                    src={latestProgressImage.image_url}
                    alt={latestProgressImage.caption || 'Most recent progress'}
                    className="h-20 w-20 rounded-xl object-cover bg-white border border-slate-200"
                  />
                </button>
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-semibold text-slate-800">{latestProgressImage.caption || 'Recent image'}</p>
                  <button type="button" onClick={() => openProgressImagePreview(progressImages, latestProgressImage.image_url)} className="mt-1 inline-flex items-center gap-1 text-xs font-bold text-violet-600 hover:text-violet-700">
                    <MdVisibility className="text-[12px]" /> Preview
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>

        <div className="flex gap-1 bg-slate-100 p-1 rounded-xl w-fit">
          {[
            { key: 'consultation', label: 'Consultation', icon: MdMedicalServices },
            { key: 'prescriptions', label: 'Prescriptions', icon: MdLocalPharmacy },
            { key: 'history', label: 'Patient History', icon: MdHistory },
          ].map((tabItem) => (
            <button
              key={tabItem.key}
              onClick={() => setTab(tabItem.key)}
              className={`flex items-center gap-1.5 px-4 py-2 rounded-lg text-xs font-bold transition-all ${
                tab === tabItem.key ? 'bg-white shadow-sm text-slate-800' : 'text-slate-500 hover:text-slate-700'
              }`}
            >
              <tabItem.icon className="text-[13px]" /> {tabItem.label}
              {tabItem.key === 'prescriptions' && (
                <span className={`ml-1 rounded-full px-1.5 py-0.5 text-[9px] ${prescriptionDecision === 'not_recorded' ? 'bg-amber-100 text-amber-700' : prescriptionDecision === 'none' ? 'bg-slate-200 text-slate-600' : 'bg-emerald-100 text-emerald-700'}`}>
                  {prescriptionDecision === 'not_recorded' ? 'Action required' : prescriptionDecision === 'none' ? 'None' : `${prescriptions.filter((item) => String(item.medicine || '').trim()).length} Rx`}
                </span>
              )}
            </button>
          ))}
        </div>

        {tab === 'consultation' && (
          <div className="space-y-5">
            {consultationStatus === 'finalized' && (
              <div className="rounded-2xl border border-emerald-200 bg-emerald-50 px-5 py-4">
                <p className="text-sm font-bold text-emerald-800">Finalized medical record</p>
                <p className="mt-1 text-xs leading-relaxed text-emerald-700">The original diagnosis, notes, prescription, images, and recorded services are preserved. Corrections or additional information must be added as an amendment below.</p>
              </div>
            )}
            <fieldset disabled={consultationStatus === 'finalized'} className={`space-y-5 ${consultationStatus === 'finalized' ? 'opacity-90' : ''}`}>
            <div className="bg-white border border-slate-200 rounded-2xl p-6">
              <h2 className="text-sm font-bold text-slate-800 mb-4 flex items-center gap-2">
                <MdNotes className="text-violet-500 text-[16px]" /> Diagnosis & Notes
              </h2>
              <div className="space-y-4">
                <div>
                  <label className="text-xs font-bold text-slate-500 uppercase tracking-widest mb-1.5 block">Diagnosis</label>
                  <textarea
                    value={diagnosis}
                    onChange={(e) => setDiagnosis(e.target.value)}
                    maxLength={5000}
                    rows={3}
                    placeholder="e.g. Acne vulgaris (mild/moderate/severe)"
                    className="w-full text-sm bg-slate-50 border-2 border-slate-200 rounded-xl px-4 py-3 focus:outline-none focus:border-violet-400 resize-none transition-colors"
                  />
                </div>
                <div>
                  <label className="text-xs font-bold text-slate-500 uppercase tracking-widest mb-1.5 block">Clinical Notes</label>
                  <textarea
                    value={notes}
                    onChange={(e) => setNotes(e.target.value)}
                    maxLength={5000}
                    rows={3}
                    placeholder="Observations, findings, follow-up instructions..."
                    className="w-full text-sm bg-slate-50 border-2 border-slate-200 rounded-xl px-4 py-3 focus:outline-none focus:border-violet-400 resize-none transition-colors"
                  />
                </div>
              </div>
            </div>

            <div className="bg-white border border-slate-200 rounded-2xl p-6">
              <div className="flex flex-wrap items-center justify-between gap-3 mb-3">
                <div>
                  <h2 className="text-sm font-bold text-slate-800 flex items-center gap-2">
                    <MdImage className="text-violet-500 text-[16px]" /> Progress Images
                  </h2>
                  <p className="mt-1 text-xs text-slate-500">Upload up to 5 PNG or JPG images for this consultation. Each image is security scanned before it is attached.</p>
                </div>
                <label className={`flex items-center gap-1.5 rounded-xl border border-violet-200 bg-violet-50 px-3 py-2 text-xs font-bold text-violet-600 hover:bg-violet-100 ${uploadingIndex !== null || progressImages.length >= 5 ? 'pointer-events-none opacity-50' : 'cursor-pointer'}`}>
                  <MdUpload className="text-[14px]" /> {progressImages.length >= 5 ? '5 Images Uploaded' : 'Upload Progress Images'}
                  <input
                    type="file"
                    multiple
                    accept="image/png,image/jpeg,.png,.jpg,.jpeg"
                    className="hidden"
                    disabled={uploadingIndex !== null || progressImages.length >= 5}
                    onChange={(e) => { const files = Array.from(e.currentTarget.files || []); e.currentTarget.value = ''; void handleUploadProgressImages(files) }}
                  />
                </label>
              </div>

              <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                <div className="flex items-center justify-between gap-3">
                  <p className="text-xs font-bold text-violet-600">Uploaded Progress Images</p>
                  <span className="rounded-full bg-white px-2.5 py-1 text-[10px] font-bold text-slate-500">{progressImages.length}/5 images</span>
                </div>

                {progressImages.length === 0 ? (
                  <div className="mt-3 rounded-2xl border border-dashed border-slate-200 bg-white px-4 py-8 text-center">
                    <MdImage className="mx-auto mb-2 text-[30px] text-slate-300" />
                    <p className="text-sm font-semibold text-slate-600">No progress images uploaded</p>
                    <p className="mt-1 text-xs text-slate-400">Use Upload Progress Images to add up to 5 images for this visit.</p>
                  </div>
                ) : (
                  <div className="mt-3 grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
                    {progressImages.map((image, index) => (
                      <div key={index} className="overflow-hidden rounded-2xl border border-slate-200 bg-white">
                        <div className="relative">
                          {image.image_url ? (
                            <a
                              href={image.image_url}
                              onClick={(event) => {
                                event.preventDefault()
                                openProgressImagePreview(progressImages, image.image_url)
                              }}
                              aria-label={`Preview progress image ${index + 1}`}
                              className="block cursor-zoom-in"
                            >
                              <img src={image.image_url} alt={image.caption || `Progress image ${index + 1}`} className="h-40 w-full bg-slate-100 object-cover" />
                            </a>
                          ) : (
                            <div className="flex h-40 flex-col items-center justify-center bg-slate-50 text-slate-300">
                              <MdImage className="mb-2 text-[34px]" />
                              <p className="text-xs font-semibold">Preparing image...</p>
                            </div>
                          )}
                          <button
                            type="button"
                            onClick={() => removeProgressImage(index)}
                            className="absolute right-2 top-2 flex h-7 w-7 items-center justify-center rounded-lg bg-white/95 text-slate-400 shadow-sm hover:bg-red-50 hover:text-red-500"
                            aria-label={`Remove progress image ${index + 1}`}
                          >
                            <MdClose className="text-[14px]" />
                          </button>
                        </div>

                        <div className="space-y-3 p-3">
                          <div className="flex items-center justify-between gap-2">
                            <p className="text-[10px] font-bold uppercase tracking-widest text-slate-400">Image {index + 1}</p>
                            <div className="flex items-center gap-2">
                              {image.image_url && (
                                <a
                                  href={image.image_url}
                                  onClick={(event) => {
                                    event.preventDefault()
                                    openProgressImagePreview(progressImages, image.image_url)
                                  }}
                                  className="inline-flex items-center gap-1 rounded-lg border border-violet-200 px-2 py-1 text-[10px] font-bold text-violet-700 hover:bg-violet-50"
                                >
                                  <MdVisibility className="text-[12px]" /> Preview
                                </a>
                              )}
                              <label className={`inline-flex items-center gap-1 rounded-lg border border-slate-200 px-2 py-1 text-[10px] font-bold text-slate-500 hover:bg-slate-50 ${uploadingIndex !== null ? 'pointer-events-none opacity-50' : 'cursor-pointer'}`}>
                              <MdUpload className="text-[12px]" /> {uploadingIndex === index ? 'Uploading...' : 'Replace'}
                              <input type="file" accept="image/png,image/jpeg,.png,.jpg,.jpeg" className="hidden" disabled={uploadingIndex !== null} onChange={(e) => { const file = e.currentTarget.files?.[0] || null; e.currentTarget.value = ''; void handleUploadProgressImage(index, file) }} />
                              </label>
                            </div>
                          </div>

                          {imageUploadStatus[index] && (
                            <div className={`rounded-lg border px-2.5 py-2 text-[11px] font-semibold ${imageUploadStatus[index].tone === 'success' ? 'border-emerald-200 bg-emerald-50 text-emerald-700' : imageUploadStatus[index].tone === 'warning' ? 'border-amber-200 bg-amber-50 text-amber-800' : imageUploadStatus[index].tone === 'danger' ? 'border-rose-200 bg-rose-50 text-rose-700' : 'border-sky-200 bg-sky-50 text-sky-700'}`}>
                              {imageUploadStatus[index].message}
                            </div>
                          )}

                          {!imageUploadStatus[index] && image.image_url && (
                            <p className={`text-[11px] font-semibold ${image.security_scan_status === 'approved' ? 'text-emerald-600' : image.security_scan_status === 'bypassed' ? 'text-amber-700' : 'text-slate-400'}`}>
                              {image.security_scan_status === 'approved' ? 'Security scan passed.' : image.security_scan_status === 'bypassed' ? 'Uploaded without malware scanning.' : 'Legacy image.'}
                            </p>
                          )}

                          <div>
                            <label className="mb-1 block text-[10px] font-bold uppercase tracking-widest text-slate-400">Caption</label>
                            <input
                              type="text"
                              value={image.caption}
                              onChange={(e) => updateProgressImage(index, 'caption', e.target.value)}
                              placeholder="e.g. Before treatment"
                              className="w-full rounded-lg border border-slate-200 bg-white p-2 text-sm focus:border-violet-400 focus:outline-none"
                            />
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>

            <div className="bg-white border border-slate-200 rounded-2xl p-6">
              <div className="flex flex-wrap items-start justify-between gap-3 mb-4">
                <div>
                  <h2 className="text-sm font-bold text-slate-800 flex items-center gap-2"><MdMedicalServices className="text-violet-500 text-[16px]" /> Services Performed & Actual Consumables</h2>
                  <p className="mt-1 text-xs text-slate-500">The booked service and its configured consumables are fixed. Record any additional items separately under Extra Consumables. Inventory is checked and stocked out only when the consultation is completed.</p>
                </div>
                {isEditMode && <span className="rounded-full bg-slate-100 px-2.5 py-1 text-[10px] font-bold text-slate-500">Clinical usage locked after completion</span>}
              </div>

              {!billableServices.length ? (
                <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm font-semibold text-amber-800">The booked service could not be loaded. Reload this consultation before completing it.</div>
              ) : (
                <div className="space-y-4">
                  {billableServices.map((service) => {
                    const catalogService = billingCatalog.find((row) => Number(row.id) === Number(service.catalog_service_id))
                    const defaultMaterials = Array.isArray(catalogService?.materials) ? catalogService.materials : (service.materials || []).filter((material) => isDefaultServiceMaterial(service.catalog_service_id, material.inventory_id))
                    const booked = Number(service.catalog_service_id) === Number(appt?.requested_service_id)
                    return (
                      <div key={service.catalog_service_id || service.service_name} className="rounded-2xl border border-violet-200 bg-violet-50/30 p-4">
                        <div className="flex flex-wrap items-start justify-between gap-3">
                          <div className="flex min-w-0 items-start gap-3">
                            <div className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-violet-100 text-violet-700"><MdLock /></div>
                            <div className="min-w-0">
                              <div className="flex flex-wrap items-center gap-2">
                                <p className="font-bold text-slate-800">{service.service_name}</p>
                                {booked && <span className="rounded-full bg-violet-100 px-2 py-0.5 text-[10px] font-bold text-violet-700">Booked Service · Fixed</span>}
                              </div>
                              <p className="mt-0.5 text-xs text-slate-500">{catalogService?.category || 'Clinic service'} · Service quantity {Number(service.quantity || 1)}</p>
                            </div>
                          </div>
                        </div>

                        <div className="mt-4 border-t border-violet-100 pt-4">
                          <div>
                            <p className="text-[10px] font-bold uppercase tracking-widest text-slate-400">Service Consumables · Fixed</p>
                            <p className="mt-1 text-xs text-slate-500">These consumables and quantities come directly from the service setup and cannot be changed during consultation.</p>
                          </div>
                          {defaultMaterials.length ? (
                            <div className="mt-3 grid gap-2 sm:grid-cols-2">
                              {defaultMaterials.map((material) => {
                                const materialIndex = (service.materials || []).indexOf(material)
                                const inv = inventoryItems.find((row) => Number(row.id) === Number(material.inventory_id))
                                return (
                                  <div key={`${material.inventory_id || material.material_name}-${materialIndex}`} className="rounded-xl border border-slate-200 bg-white p-3">
                                    <div className="flex items-start justify-between gap-2">
                                      <div>
                                        <p className="text-xs font-semibold text-slate-700">{material.material_name}</p>
                                        <p className="mt-0.5 text-[10px] font-semibold text-slate-400">Configured consumable</p>
                                      </div>
                                      <MdLock className="shrink-0 text-slate-300" />
                                    </div>
                                    <div className="mt-3">
                                      <span className="text-[10px] font-bold uppercase tracking-widest text-slate-400">Configured Quantity</span>
                                      <div className="mt-1.5 flex items-center gap-2 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2">
                                        <strong className="text-sm text-slate-800">{Number(material.quantity || 0)}</strong>
                                        <span className="whitespace-nowrap text-xs text-slate-500">{material.unit_label || inv?.uom || 'unit'}</span>
                                      </div>
                                    </div>
                                  </div>
                                )
                              })}
                            </div>
                          ) : (
                            <div className="mt-3 rounded-xl border border-dashed border-slate-200 bg-white px-4 py-4 text-xs text-slate-400">This service has no configured consumables.</div>
                          )}
                        </div>
                      </div>
                    )
                  })}

                  <div className="rounded-2xl border border-amber-200 bg-amber-50/30 p-4">
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div>
                        <p className="text-sm font-bold text-slate-800">Extra Consumables</p>
                        <p className="mt-1 text-xs text-slate-500">Record the quantity used in addition to the fixed Service Consumables. You may add a different item or add more of the same consumable already included in the fixed service setup.</p>
                      </div>
                      {consultationStatus !== 'finalized' && extraConsumableTarget && (
                        <button type="button" onClick={() => setExtraConsumableOpen(true)} className="button-secondary">
                          <MdAdd /> Add Extra Consumable
                        </button>
                      )}
                    </div>

                    {extraConsumableRows.length ? (
                      <div className="mt-3 grid gap-2 sm:grid-cols-2">
                        {extraConsumableRows.map(({ material, index: materialIndex }) => {
                          const inv = inventoryItems.find((row) => Number(row.id) === Number(material.inventory_id))
                          const decimal = Number(inv?.uom_allow_decimal || 0) === 1
                          return (
                            <div key={`extra-${material.inventory_id || material.material_name}-${materialIndex}`} className="rounded-xl border border-amber-200 bg-white p-3">
                              <div className="flex items-start justify-between gap-2">
                                <div>
                                  <p className="text-xs font-semibold text-slate-700">{material.material_name}</p>
                                  <p className="mt-0.5 text-[10px] font-bold text-amber-700">Added during consultation</p>
                                </div>
                                {!isEditMode && <button type="button" onClick={() => removeExtraConsumable(extraConsumableTarget.catalog_service_id, materialIndex)} className="flex h-7 w-7 items-center justify-center rounded-lg text-slate-400 hover:bg-rose-50 hover:text-rose-600" aria-label={`Remove ${material.material_name}`}><MdClose /></button>}
                              </div>
                              <label className="mt-3 block">
                                <span className="text-[10px] font-bold uppercase tracking-widest text-slate-400">Additional Quantity Used</span>
                                <div className="mt-1.5 flex items-center gap-2">
                                  <input type="number" inputMode="decimal" min="0" step={decimal ? 0.01 : 1} disabled={isEditMode} value={material.quantity} onChange={(e) => updateServiceMaterial(extraConsumableTarget.catalog_service_id, materialIndex, Math.max(0, Number(e.target.value) || 0))} className="form-control h-9" />
                                  <span className="whitespace-nowrap text-xs text-slate-500">{material.unit_label || inv?.uom || 'unit'}</span>
                                </div>
                              </label>
                            </div>
                          )
                        })}
                      </div>
                    ) : (
                      <div className="mt-3 rounded-xl border border-dashed border-amber-200 bg-white px-4 py-5 text-xs text-slate-400">No extra consumables recorded.</div>
                    )}
                  </div>
                </div>
              )}
            </div>

            </fieldset>

            {consultationStatus === 'finalized' ? (
              <div id="consultation-amendments" className="rounded-2xl border border-violet-200 bg-white p-6 space-y-4 scroll-mt-6">
                <div>
                  <h2 className="text-sm font-bold text-slate-800">Medical Record Amendments</h2>
                  <p className="mt-1 text-xs text-slate-500">Amendments preserve the original finalized record and create a dated correction/addition trail.</p>
                </div>
                {amendments.length > 0 && (
                  <div className="space-y-3">
                    {amendments.map((item) => (
                      <div key={item.id} className="rounded-xl border border-slate-200 bg-slate-50 p-4">
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <p className="text-xs font-bold text-violet-700">{item.reason}</p>
                          <p className="text-[11px] text-slate-400">{item.doctor_name || 'Doctor'} · {formatDate(item.created_at)}</p>
                        </div>
                        <p className="mt-2 text-sm whitespace-pre-wrap text-slate-700">{item.amendment_text}</p>
                      </div>
                    ))}
                  </div>
                )}
                <div className="grid gap-3">
                  <input maxLength={255} value={amendmentReason} onChange={(e) => setAmendmentReason(e.target.value)} placeholder="Reason for amendment (required)" className="w-full rounded-xl border border-slate-200 px-4 py-3 text-sm outline-none focus:border-violet-400" />
                  <textarea maxLength={5000} value={amendmentText} onChange={(e) => setAmendmentText(e.target.value)} rows={4} placeholder="Correction or additional clinical information..." className="w-full rounded-xl border border-slate-200 px-4 py-3 text-sm outline-none focus:border-violet-400 resize-none" />
                  <div className="flex justify-end">
                    <button onClick={handleAddAmendment} disabled={addingAmendment || !amendmentReason.trim() || !amendmentText.trim()} className="rounded-xl bg-violet-600 px-5 py-2.5 text-sm font-bold text-white disabled:opacity-50">{addingAmendment ? 'Adding...' : 'Add Amendment'}</button>
                  </div>
                </div>
              </div>
            ) : (
              <div className="space-y-3">
                <div className="rounded-2xl border border-slate-200 bg-white px-4 py-3 text-xs">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div>
                      {autoSaveState === 'saving' && <span className="font-semibold text-sky-700">Saving consultation progress…</span>}
                      {autoSaveState === 'pending' && <span className="font-semibold text-slate-600">Changes detected — saving automatically…</span>}
                      {autoSaveState === 'error' && <span className="font-semibold text-rose-600">Could not save — the system will retry automatically. {autoSaveError}</span>}
                      {!['saving','pending','error'].includes(autoSaveState) && lastSavedAt && <span className="font-semibold text-emerald-700">✓ All consultation progress saved · Last saved {lastSavedAt.toLocaleTimeString('en-PH', { hour: 'numeric', minute: '2-digit' })}</span>}
                      {!['saving','pending','error'].includes(autoSaveState) && !lastSavedAt && <span className="font-semibold text-slate-600">Consultation progress saves automatically as you work.</span>}
                    </div>
                    <span className="text-slate-400">No inventory is reserved when an appointment is confirmed.</span>
                  </div>
                  <p className="mt-1 text-slate-400">Fixed service consumables and any Extra Consumables are stocked out only when you complete the consultation. Prescriptions do not affect inventory. Stock in this clinic's assigned treatment room is used first, with the Main Stockroom as fallback.</p>
                  <p className="mt-1 text-slate-400">Actual recorded medicines and consumables are stocked out only when you complete the consultation.</p>
                </div>
                <div className="flex flex-col-reverse gap-2 sm:flex-row sm:items-center sm:justify-end">
                  <button
                    type="button"
                    onClick={() => {
                      setTab('prescriptions')
                      window.scrollTo({ top: 0, behavior: 'smooth' })
                    }}
                    disabled={uploadingIndex !== null}
                    className="flex items-center justify-center gap-2 rounded-xl bg-violet-600 px-6 py-2.5 text-sm font-bold text-white hover:bg-violet-700 disabled:opacity-50"
                  >
                    Next: Prescriptions →
                  </button>
                </div>
              </div>
            )}
          </div>
        )}

        {tab === 'prescriptions' && (
          <div className="space-y-5">
            {consultationStatus === 'finalized' && (
              <div className="rounded-2xl border border-emerald-200 bg-emerald-50 px-5 py-4">
                <p className="text-sm font-bold text-emerald-800">Finalized prescription record</p>
                <p className="mt-1 text-xs leading-relaxed text-emerald-700">The original prescription decision is locked with the finalized consultation. Corrections must be recorded as a medical-record amendment from the Consultation tab.</p>
              </div>
            )}

            <fieldset disabled={consultationStatus === 'finalized'} className={consultationStatus === 'finalized' ? 'opacity-90' : ''}>
              <div className="space-y-5">
                <section className="rounded-2xl border border-slate-200 bg-white p-6">
                  <div>
                    <h2 className="flex items-center gap-2 text-sm font-bold text-slate-800"><MdLocalPharmacy className="text-violet-500" /> Prescription Decision</h2>
                    <p className="mt-1 text-xs text-slate-500">Choose one before completing the consultation. Prescriptions are medical instructions and do not deduct clinic inventory.</p>
                  </div>
                  <div className="mt-4 grid gap-3 sm:grid-cols-2">
                    <button
                      type="button"
                      onClick={() => choosePrescriptionDecision('prescribed')}
                      className={`rounded-2xl border p-4 text-left transition ${prescriptionDecision === 'prescribed' ? 'border-violet-400 bg-violet-50 ring-2 ring-violet-100' : 'border-slate-200 bg-white hover:bg-slate-50'}`}
                    >
                      <div className="flex items-center gap-2"><span className={`flex h-5 w-5 items-center justify-center rounded-full border ${prescriptionDecision === 'prescribed' ? 'border-violet-600 bg-violet-600 text-white' : 'border-slate-300'}`}>{prescriptionDecision === 'prescribed' && <MdCheck className="text-xs" />}</span><strong className="text-sm text-slate-800">Prescribe Medicine</strong></div>
                      <p className="mt-2 text-xs text-slate-500">Record one or more medicines for the patient.</p>
                    </button>
                    <button
                      type="button"
                      onClick={() => choosePrescriptionDecision('none')}
                      className={`rounded-2xl border p-4 text-left transition ${prescriptionDecision === 'none' ? 'border-slate-500 bg-slate-50 ring-2 ring-slate-100' : 'border-slate-200 bg-white hover:bg-slate-50'}`}
                    >
                      <div className="flex items-center gap-2"><span className={`flex h-5 w-5 items-center justify-center rounded-full border ${prescriptionDecision === 'none' ? 'border-slate-700 bg-slate-700 text-white' : 'border-slate-300'}`}>{prescriptionDecision === 'none' && <MdCheck className="text-xs" />}</span><strong className="text-sm text-slate-800">No Prescription</strong></div>
                      <p className="mt-2 text-xs text-slate-500">Explicitly record that no medicine was prescribed for this visit.</p>
                    </button>
                  </div>
                  {prescriptionDecision === 'not_recorded' && <div className="mt-4 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-xs font-semibold text-amber-800">Prescription decision is required before Complete Consultation.</div>}
                  {prescriptionDecision === 'none' && <div className="mt-4 rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-600">No prescription will be listed for this consultation.</div>}
                </section>

                {prescriptionDecision === 'prescribed' && (
                  <section className="rounded-2xl border border-slate-200 bg-white p-6">
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div>
                        <h2 className="flex items-center gap-2 text-sm font-bold text-slate-800"><MdLocalPharmacy className="text-violet-500" /> Medicines</h2>
                        <p className="mt-1 text-xs text-slate-500">Enter the prescribed medicine manually. Prescriptions are clinical instructions and are not linked to clinic inventory.</p>
                      </div>
                      <button type="button" onClick={addRx} disabled={prescriptions.length >= 30} className="button-secondary"><MdAdd /> {prescriptions.length >= 30 ? '30 Medicine Limit Reached' : 'Add Medicine'}</button>
                    </div>

                    {!prescriptions.length ? (
                      <div className="mt-4 rounded-2xl border border-dashed border-slate-200 bg-slate-50 px-5 py-8 text-center">
                        <MdLocalPharmacy className="mx-auto text-3xl text-slate-300" />
                        <p className="mt-2 text-sm font-semibold text-slate-600">No medicine added yet</p>
                        <button type="button" onClick={addRx} className="button-secondary mt-3"><MdAdd /> Add Medicine</button>
                      </div>
                    ) : (
                      <div className="mt-4 space-y-4">
                        {prescriptions.map((rx, index) => (
                          <div key={index} className="space-y-3 rounded-xl border border-slate-200 bg-slate-50 p-4">
                            <div className="flex items-center justify-between gap-3">
                              <p className="flex items-center gap-1 text-xs font-bold text-violet-600"><MdLocalPharmacy className="text-[12px]" /> Medicine #{index + 1}</p>
                              <button type="button" onClick={() => removeRx(index)} className="flex h-7 w-7 items-center justify-center rounded-lg text-slate-300 transition-colors hover:bg-red-50 hover:text-red-400" aria-label={`Remove medicine ${index + 1}`}><MdClose className="text-[13px]" /></button>
                            </div>

                            <div>
                              <label className="mb-1 block text-[10px] font-bold uppercase tracking-widest text-slate-400">Medicine *</label>
                              <input
                                type="text"
                                value={rx.medicine}
                                onChange={(e) => updateRx(index, 'medicine', e.target.value)}
                                maxLength={160}
                                placeholder="e.g. Amoxicillin 500 mg"
                                className="w-full rounded-lg border border-slate-200 bg-white p-2.5 text-sm outline-none focus:border-violet-400"
                              />
                              <p className="mt-1 text-[10px] text-slate-400">This field is free text and is not connected to Inventory.</p>
                            </div>

                            <div className="grid gap-3 sm:grid-cols-2">
                              <div>
                                <label className="mb-1 block text-[10px] font-bold uppercase tracking-widest text-slate-400">Quantity to Prescribe</label>
                                <input
                                  type="number"
                                  min="0"
                                  step="1"
                                  value={/^\d*\.?\d*$/.test(String(rx.quantity || '')) ? rx.quantity : ''}
                                  onChange={(e) => updateRx(index, 'quantity', e.target.value)}
                                  placeholder="0"
                                  className="w-full rounded-lg border border-slate-200 bg-white p-2 text-sm outline-none focus:border-violet-400 [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none"
                                />
                                <p className="mt-1 text-[10px] text-slate-400">Medical instruction only. It does not reserve or stock out clinic inventory.</p>
                              </div>
                              <div>
                                <label className="mb-1 block text-[10px] font-bold uppercase tracking-widest text-slate-400">Frequency</label>
                                <select value={isCustomOption(rx.frequency, FREQUENCIES) ? '__custom__' : rx.frequency} onChange={(e) => updateRx(index, 'frequency', e.target.value === '__custom__' ? 'Custom' : e.target.value)} className="w-full rounded-lg border border-slate-200 bg-white p-2 text-sm outline-none focus:border-violet-400">
                                  <option value="">Select...</option>{FREQUENCIES.map((frequency) => <option key={frequency}>{frequency}</option>)}<option value="__custom__">Custom…</option>
                                </select>
                                {isCustomOption(rx.frequency, FREQUENCIES) && <input type="text" value={rx.frequency === 'Custom' ? '' : rx.frequency} onChange={(e) => updateRx(index, 'frequency', e.target.value || 'Custom')} maxLength={120} placeholder="e.g. Every 6 hours" className="mt-2 w-full rounded-lg border border-violet-200 bg-white p-2 text-sm outline-none focus:border-violet-400" />}
                              </div>
                              <div className="sm:col-span-2">
                                <label className="mb-1 block text-[10px] font-bold uppercase tracking-widest text-slate-400">Notes</label>
                                <input type="text" value={rx.notes} onChange={(e) => updateRx(index, 'notes', e.target.value)} maxLength={500} placeholder="e.g. Take after meals" className="w-full rounded-lg border border-slate-200 bg-white p-2 text-sm outline-none focus:border-violet-400" />
                              </div>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </section>
                )}
              </div>
            </fieldset>

            {consultationStatus !== 'finalized' && (
              <div className="space-y-3">
                <div className="rounded-2xl border border-slate-200 bg-white px-4 py-3 text-xs">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div>
                      {autoSaveState === 'saving' && <span className="font-semibold text-sky-700">Saving consultation progress…</span>}
                      {autoSaveState === 'pending' && <span className="font-semibold text-slate-600">Changes detected — saving automatically…</span>}
                      {autoSaveState === 'error' && <span className="font-semibold text-rose-600">Could not save — the system will retry automatically. {autoSaveError}</span>}
                      {!['saving','pending','error'].includes(autoSaveState) && lastSavedAt && <span className="font-semibold text-emerald-700">✓ All consultation progress saved · Last saved {lastSavedAt.toLocaleTimeString('en-PH', { hour: 'numeric', minute: '2-digit' })}</span>}
                      {!['saving','pending','error'].includes(autoSaveState) && !lastSavedAt && <span className="font-semibold text-slate-600">Consultation progress saves automatically as you work.</span>}
                    </div>
                    <span className="text-slate-400">Prescriptions never reserve or deduct inventory.</span>
                  </div>
                </div>
                <div className="flex justify-end">
                  <button onClick={handleFinalize} disabled={saving || uploadingIndex !== null || autoSaveState === 'saving'} className="flex items-center justify-center gap-2 rounded-xl bg-violet-600 px-6 py-2.5 text-sm font-bold text-white hover:bg-violet-700 disabled:opacity-50"><MdCheck className="text-[15px]" /> {saving ? 'Completing…' : 'Complete Consultation'}</button>
                </div>
              </div>
            )}
          </div>
        )}

        {tab === 'history' && (
          <div className="bg-white border border-slate-200 rounded-2xl p-6">
            <h2 className="text-sm font-bold text-slate-800 mb-4 flex items-center gap-2">
              <MdHistory className="text-violet-500 text-[16px]" /> Previous Visits
            </h2>
            {patientHistory.length === 0 ? (
              <div className="py-12 text-center text-slate-400 text-sm">
                No previous visits recorded for this patient.
              </div>
            ) : (
              <div className="space-y-4">
                {patientHistory.map((visit, index) => (
                  <div key={visit.id || index} className="bg-slate-50 p-4 rounded-xl border border-slate-100 space-y-3">
                    <div className="flex items-center justify-between gap-2">
                      <p className="text-xs font-bold text-slate-500 flex items-center gap-1.5">
                        <MdCalendarToday className="text-[12px]" />
                        {formatDate(visit.date)} · <MdAccessTime className="text-[12px]" /> {visit.time || '—'}
                      </p>
                      <span className={`text-[10px] font-bold border px-2 py-0.5 rounded-full ${
                        visit.status === 'cancelled'
                          ? 'bg-red-50 text-red-500 border-red-200'
                          : 'bg-slate-100 text-slate-500 border-slate-200'
                      }`}>
                        {visit.status === 'cancelled' ? 'Cancelled' : 'Completed'}
                      </span>
                    </div>

                    {visit.status !== 'cancelled' && (
                      <>
                        {visit.diagnosis && (
                          <p className="text-sm font-semibold text-slate-800">{visit.diagnosis}</p>
                        )}
                        {visit.consultation_notes && (
                          <p className="text-xs text-slate-500 leading-relaxed">{visit.consultation_notes}</p>
                        )}
                        {visit.prescription_status === 'none' && (
                          <div className="rounded-lg bg-slate-100 px-3 py-2 text-xs font-semibold text-slate-500">No prescription recorded for this visit.</div>
                        )}
                        {visit.prescription && (() => {
                          try {
                            const rx = JSON.parse(visit.prescription)
                            if (!Array.isArray(rx) || rx.length === 0) return null
                            return (
                              <div>
                                <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-1">Rx</p>
                                {rx.map((medicine, medicineIndex) => (
                                  <p key={medicineIndex} className="text-xs text-slate-600">
                                    · {medicine.medicine} {(medicine.quantity ?? medicine.dosage) && `— ${medicine.quantity ?? medicine.dosage}${medicine.unit_label ? ` ${medicine.unit_label}` : ''}`} {medicine.frequency && `(${medicine.frequency})`}
                                  </p>
                                ))}
                              </div>
                            )
                          } catch {
                            return null
                          }
                        })()}
                        <div>
                          <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-2">Progress Images</p>
                          <ProgressImageGallery
                            images={visit.progress_images}
                            onPreview={openProgressImagePreview}
                            emptyText="No progress images saved for this visit."
                          />
                        </div>
                        {!visit.diagnosis && !visit.consultation_notes && (
                          <p className="text-xs text-slate-400 italic">No notes recorded.</p>
                        )}
                      </>
                    )}

                    {visit.reason && (
                      <p className="text-[11px] text-slate-400">Reason: {visit.reason}</p>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>

      {progressImagePreview && (
        <ProgressImagePreviewModal
          image={progressImagePreview.images[progressImagePreview.index]}
          index={progressImagePreview.index}
          total={progressImagePreview.images.length}
          onClose={closeProgressImagePreview}
          onMove={moveProgressImagePreview}
        />
      )}

      <Modal
        open={extraConsumableOpen}
        onClose={() => {
          setExtraConsumableOpen(false)
          setExtraConsumableSearch('')
          setExtraConsumableId('')
          setExtraConsumableQuantity(1)
        }}
        title="Add Extra Consumable"
        description="Record additional consumable quantity used during this consultation. The extra item may be different from, or the same as, a consumable already included in the booked service."
        size="lg"
      >
        <div className="space-y-4">
          <div className="rounded-xl border border-sky-200 bg-sky-50 px-4 py-3 text-xs text-sky-800">
            Adding an item here does not reserve or deduct stock. Inventory is checked only when Complete Consultation is clicked.
          </div>
          <div className="relative">
            <MdSearch className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <input value={extraConsumableSearch} onChange={(e) => setExtraConsumableSearch(e.target.value)} placeholder="Search consumable or medicine..." className="form-control pl-10" autoFocus />
          </div>
          <div className="max-h-72 overflow-y-auto rounded-2xl border border-slate-200 bg-white p-1">
            {availableExtraConsumables.map((item) => (
              <button
                type="button"
                key={item.id}
                onClick={() => {
                  setExtraConsumableId(String(item.id))
                  setExtraConsumableQuantity(1)
                }}
                className={`flex w-full items-start justify-between gap-3 rounded-xl px-3 py-3 text-left ${Number(extraConsumableId) === Number(item.id) ? 'bg-violet-50 ring-1 ring-violet-200' : 'hover:bg-slate-50'}`}
              >
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="truncate text-sm font-semibold text-slate-800">{item.name}</p>
                    {isDefaultServiceMaterial(extraConsumableTarget?.catalog_service_id, item.id) && (
                      <span className="rounded-full bg-violet-100 px-2 py-0.5 text-[9px] font-bold text-violet-700">Also in Service Setup</span>
                    )}
                  </div>
                  <p className="mt-0.5 text-[11px] text-slate-500">{[item.strength, item.dosage_form, item.item_type, item.uom || item.unit].filter(Boolean).join(' · ')}</p>
                </div>
                {Number(extraConsumableId) === Number(item.id) && <MdCheck className="mt-0.5 shrink-0 text-violet-600" />}
              </button>
            ))}
            {!availableExtraConsumables.length && <div className="px-4 py-8 text-center text-sm text-slate-400">No matching additional items for this clinic.</div>}
          </div>
          {extraConsumableSelected && (
            <label className="block rounded-2xl border border-slate-200 bg-slate-50 p-4">
              <span className="form-label">Additional Quantity Used *</span>
              <div className="mt-2 flex items-center gap-2">
                <input
                  type="number"
                  inputMode="decimal"
                  min="0"
                  step={Number(extraConsumableSelected.uom_allow_decimal || 0) === 1 ? 0.01 : 1}
                  className="form-control"
                  value={extraConsumableQuantity}
                  onChange={(e) => setExtraConsumableQuantity(e.target.value)}
                />
                <span className="shrink-0 text-sm font-semibold text-slate-500">{extraConsumableSelected.uom || extraConsumableSelected.unit || 'unit'}</span>
              </div>
            </label>
          )}
          <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
            <button type="button" className="button-secondary" onClick={() => { setExtraConsumableOpen(false); setExtraConsumableSearch(''); setExtraConsumableId(''); setExtraConsumableQuantity(1) }}>Cancel</button>
            <button type="button" className="button-primary" disabled={!extraConsumableSelected || !(Number(extraConsumableQuantity) > 0)} onClick={addExtraConsumable}><MdInventory2 /> Add Consumable</button>
          </div>
        </div>
      </Modal>

      <Modal
        open={Boolean(pendingScanPrompt)}
        onClose={() => uploadingIndex === null && setPendingScanPrompt(null)}
        closeDisabled={uploadingIndex !== null}
        title="Security scan still in progress"
        description="The image remains quarantined and has not been attached to the clinical record."
        size="md"
      >
        <div className="space-y-4">
          <div className="rounded-2xl border border-sky-300 bg-sky-50 p-4 text-sm text-sky-900">
            <p className="font-black">Perception Point is still scanning this image</p>
            <p className="mt-2 leading-relaxed">You can check the same uploaded image again. This does not create another upload or consume another scan request.</p>
          </div>
          <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
            <button type="button" className="button-secondary" disabled={uploadingIndex !== null} onClick={() => setPendingScanPrompt(null)}>Cancel</button>
            <button type="button" className="button-primary" disabled={uploadingIndex !== null} onClick={checkPendingClinicalScan}>Check Again</button>
          </div>
        </div>
      </Modal>

      <Modal
        open={Boolean(scanBypassPrompt)}
        onClose={() => uploadingIndex === null && setScanBypassPrompt(null)}
        closeDisabled={uploadingIndex !== null}
        title={scanBypassPrompt?.reason === 'usage_limit_reached' ? 'Security scanner usage limit reached' : 'Security scanner unavailable'}
        description="This clinical image could not be verified by the malware scanner."
        size="md"
      >
        <div className="space-y-4">
          <div className="rounded-2xl border border-amber-300 bg-amber-50 p-4 text-sm text-amber-900">
            <p className="font-black">Malware scan was not completed</p>
            <p className="mt-2 leading-relaxed">{scanBypassPrompt?.message || 'The Perception Point scanner may be temporarily unavailable or its usage allowance may have been reached.'}</p>
            <p className="mt-2 text-xs font-semibold">Only continue if this image comes from a trusted source. The saved clinical image will be marked as not malware scanned.</p>
          </div>
          <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
            <button type="button" className="button-secondary" disabled={uploadingIndex !== null} onClick={() => setScanBypassPrompt(null)}>Cancel Upload</button>
            <button type="button" className="button-primary" disabled={uploadingIndex !== null} onClick={continueClinicalUploadWithoutScan}>Continue Without Scan</button>
          </div>
        </div>
      </Modal>
    </>
  )
}

export default Doctor_Consultation





