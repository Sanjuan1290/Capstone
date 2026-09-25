import { useEffect, useMemo, useState } from 'react'
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
  MdSave,
  MdUpload,
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
  delete next.duration
  return next
}

const getMedicineUnit = (medicineName, inventoryItems = []) => (
  inventoryItems.find(
    (entry) => entry.name?.trim().toLowerCase() === String(medicineName || '').trim().toLowerCase()
  )?.unit || ''
)

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

const ProgressImageGallery = ({ images = [], emptyText = 'No progress images added yet.' }) => {
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
          target="_blank"
          rel="noreferrer"
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
  const [initLoading, setInitLoading] = useState(!apptFromState && !!apptIdParam)

  const [diagnosis, setDiagnosis] = useState('')
  const [notes, setNotes] = useState('')
  const [prescriptions, setPrescriptions] = useState([{ medicine: '', dosage: '', frequency: '', notes: '' }])
  const [progressImages, setProgressImages] = useState([])
  const [patientHistory, setPatientHistory] = useState([])
  const [saved, setSaved] = useState(false)
  const [saving, setSaving] = useState(false)
  const [tab, setTab] = useState('consultation')
  const [inventoryItems, setInventoryItems] = useState([])
  const [inventoryBlocker, setInventoryBlocker] = useState(null)
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
  const [amendments, setAmendments] = useState([])
  const [amendmentReason, setAmendmentReason] = useState('')
  const [amendmentText, setAmendmentText] = useState('')
  const [addingAmendment, setAddingAmendment] = useState(false)

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
      if (Array.isArray(rx) && rx.length > 0) {
        setPrescriptions(rx.map(normalizePrescription))
      } else {
        setPrescriptions([{ medicine: '', dosage: '', frequency: '', notes: '' }])
      }
    } catch {
      setPrescriptions([{ medicine: '', dosage: '', frequency: '', notes: '' }])
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
      .finally(() => setInitLoading(false))
  }, [apptIdParam, apptFromState])

  useEffect(() => {
    if (!apptFromState?.id) return
    getConsultation(apptFromState.id)
      .then((consult) => applyConsultationData(consult))
      .catch(() => {
        // A consultation does not exist until the doctor saves the first draft.
        if (apptFromState.status === 'completed') setIsEditMode(true)
      })
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
      if (consultationStatus !== 'finalized' && appt?.requested_service_id) {
        const requested = catalog.find((service) => Number(service.id) === Number(appt.requested_service_id))
        if (requested) {
          setBillableServices((current) => current.length > 0 ? current : [{
            catalog_service_id: requested.id,
            service_name: requested.service_name,
            quantity: 1,
            materials: (requested.materials || []).map((material) => ({
              inventory_id: material.inventory_id,
              material_name: material.material_name || material.inventory_name,
              quantity: Number(material.quantity || 0),
              unit_label: material.inventory_base_unit || material.unit_label || material.inventory_unit || '',
            })),
          }])
        }
      }
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

  const addRx = () => setPrescriptions((prev) => prev.length >= 30 ? prev : [...prev, { inventory_id: '', medicine: '', dosage: '', frequency: '', notes: '' }])
  const removeRx = (index) => setPrescriptions((prev) => prev.filter((_, rxIndex) => rxIndex !== index))


  const updateProgressImage = (index, field, value) => {
    setProgressImages((prev) => prev.map((image, imageIndex) => (
      imageIndex === index ? { ...image, [field]: value } : image
    )))
  }

  const removeProgressImage = (index) => {
    if (!window.confirm('Remove this progress image from the consultation? This change will be permanent once the consultation is saved.')) return
    setProgressImages((prev) => prev.filter((_, imageIndex) => imageIndex !== index))
    setImageUploadStatus({})
  }

  const setClinicalUploadStatus = (index, status) => {
    setImageUploadStatus((current) => ({ ...current, [index]: status }))
  }

  const applyClinicalUploadResult = (index, file, result) => {
    updateProgressImage(index, 'image_url', result.url)
    updateProgressImage(index, 'security_scan_status', result.scan_status)
    updateProgressImage(index, 'security_token', result.security_token || '')
    if (!progressImages[index]?.caption) {
      updateProgressImage(index, 'caption', file.name.replace(/\.[^.]+$/, ''))
    }
  }

  const handleUploadProgressImages = async (fileList) => {
    const requestedFiles = Array.from(fileList || [])
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
    setClinicalUploadStatus(index, { tone: 'info', message: 'Preparing image for security scanning…' })
    try {
      const result = await uploadClinicalImageSigned(file, appt?.id, {
        scanMode: 'scan',
        onStatus: (status) => setClinicalUploadStatus(index, status),
      })
      applyClinicalUploadResult(index, file, result)
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
        setClinicalUploadStatus(index, { tone: 'success', message: 'Security scan passed.' })
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
      setClinicalUploadStatus(index, { tone: 'warning', message: 'Uploaded without malware scanning.' })
    } catch (err) {
      setClinicalUploadStatus(index, { tone: 'danger', message: err.message || 'Failed to upload image.' })
    } finally {
      setUploadingIndex(null)
    }
  }

  const toggleService = (service) => {
    if (isEditMode) return
    setBillableServices((prev) => {
      const exists = prev.some((entry) => Number(entry.catalog_service_id) === Number(service.id))
      if (exists) return prev.filter((entry) => Number(entry.catalog_service_id) !== Number(service.id))
      return [...prev, {
        catalog_service_id: service.id,
        service_name: service.service_name,
        quantity: 1,
        materials: (service.materials || []).map((material) => ({
          inventory_id: material.inventory_id,
          material_name: material.material_name || material.inventory_name,
          quantity: Number(material.quantity || 0),
          unit_label: material.inventory_base_unit || material.unit_label || material.inventory_unit || '',
        })),
      }]
    })
  }

  const updateServiceMaterial = (serviceId, materialIndex, quantity) => {
    if (isEditMode) return
    setBillableServices((prev) => prev.map((service) => Number(service.catalog_service_id) === Number(serviceId)
      ? { ...service, materials: service.materials.map((material, index) => index === materialIndex ? { ...material, quantity: Math.max(0, Number(quantity) || 0) } : material) }
      : service))
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

  const clinicalDeductionPlan = useMemo(() => {
    const totals = new Map()
    for (const service of billableServices) for (const material of (service.materials || [])) {
      const id = Number(material.inventory_id || 0)
      const qty = Math.max(0, Number(material.quantity || 0))
      if (!id || qty <= 0) continue
      const current = totals.get(id) || { quantity: 0, unit: material.unit_label || null }
      current.quantity += qty
      if (!current.unit && material.unit_label) current.unit = material.unit_label
      totals.set(id, current)
    }
    return Array.from(totals.entries()).map(([id, usage]) => {
      const item = inventoryItems.find((inv) => Number(inv.id) === id)
      let remaining = Number(usage.quantity || 0)
      const allocations = []
      const batches = [...(Array.isArray(item?.treatment_room_batches) ? item.treatment_room_batches : [])]
        .sort((a, b) => {
          const aExpiry = a.expiration_date ? String(a.expiration_date).slice(0, 10) : '9999-12-31'
          const bExpiry = b.expiration_date ? String(b.expiration_date).slice(0, 10) : '9999-12-31'
          return aExpiry.localeCompare(bExpiry) || Number(a.batch_id || 0) - Number(b.batch_id || 0)
        })
      for (const batch of batches) {
        if (remaining <= 0) break
        const available = Math.max(0, Number(batch.available || 0))
        if (available <= 0) continue
        const quantity = Math.min(remaining, available)
        allocations.push({ ...batch, quantity })
        remaining -= quantity
      }
      return {
        inventory_id: id,
        name: item?.name || 'Inventory item',
        requested: Number(usage.quantity || 0),
        available: Number(item?.treatment_room_stock || 0),
        unit: usage.unit || item?.uom || item?.unit || 'unit',
        location: item?.treatment_room_name || (appt?.clinic_type === 'derma' ? 'Dermatology Room' : 'General Medicine Room'),
        allocations,
        shortage: Math.max(0, remaining),
      }
    })
  }, [billableServices, inventoryItems, appt?.clinic_type])

  const validateClinicalInventory = () => {
    const blocked = clinicalDeductionPlan.find((entry) => entry.shortage > 0.0001)
    return blocked || null
  }

  const buildPayload = () => ({
    diagnosis,
    notes,
    prescription: JSON.stringify(prescriptions.map(normalizePrescription)),
    images: normalizeProgressImages(progressImages).filter((image) => image.image_url),
    billable_services: billableServices,
  })

  const handleSave = async ({ silent = false } = {}) => {
    if (!appt || consultationStatus === 'finalized' || uploadingIndex !== null) return false
    if (!silent) setSaving(true)
    try {
      await saveConsultationDraft(appt.id, buildPayload())
      setConsultationStatus('draft')
      setIsEditMode(false)
      setSaved(true)
      setLastSavedAt(new Date())
      setAutoSaveError('')
      if (!silent) setTimeout(() => setSaved(false), 2000)
      await loadHistory(appt.patient_id)
      return true
    } catch (err) {
      setAutoSaveError(err.message || 'Draft could not be saved.')
      if (!silent) alert(err.message || 'Failed to save draft. Your changes are still on this page.')
      return false
    } finally {
      if (!silent) setSaving(false)
    }
  }

  const handleFinalize = async () => {
    if (!appt || consultationStatus === 'finalized') return
    const stockError = validateClinicalInventory()
    if (stockError) {
      setInventoryBlocker(stockError)
      return
    }
    setInventoryBlocker(null)
    if (!window.confirm('Complete consultation? This will finalize the clinical record, update the bill, deduct recorded medicines and consumables, and mark the appointment completed. Further corrections must be recorded as an amendment.')) return
    setSaving(true)
    try {
      await finalizeConsultation(appt.id, buildPayload())
      setConsultationStatus('finalized')
      setIsEditMode(true)
      setSaved(true)
      setLastSavedAt(new Date())
      setAutoSaveError('')
      setAppt((prev) => (prev ? { ...prev, status: 'completed' } : prev))
      await loadHistory(appt.patient_id)
    } catch (err) {
      if (err.code === 'CLINICAL_ROOM_STOCK_REQUIRED' || err.code === 'INVENTORY_INSUFFICIENT') {
        setInventoryBlocker({
          inventory_id: err.inventory_id || null,
          name: err.inventory_name || 'Required inventory item',
          requested: err.requested,
          available: err.available,
          unit: err.unit || 'unit',
          location: err.location || (appt?.clinic_type === 'derma' ? 'Dermatology Room' : 'General Medicine Room'),
          message: err.message,
        })
      } else {
        alert(err.message || 'Failed to complete consultation. The record has not been finalized.')
      }
    } finally {
      setSaving(false)
    }
  }

  useEffect(() => {
    if (!appt?.id || consultationStatus === 'finalized') return undefined
    const timer = window.setInterval(() => {
      handleSave({ silent: true })
    }, 25000)
    return () => window.clearInterval(timer)
  }, [appt?.id, consultationStatus, diagnosis, notes, prescriptions, progressImages, billableServices, uploadingIndex])

  useEffect(() => {
    if (consultationStatus === 'finalized') return undefined
    const beforeUnload = (event) => {
      event.preventDefault()
      event.returnValue = ''
    }
    window.addEventListener('beforeunload', beforeUnload)
    return () => window.removeEventListener('beforeunload', beforeUnload)
  }, [consultationStatus])

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
  const medicineItems = inventoryItems.filter((item) => String(item.item_type || 'medicine').toLowerCase() === 'medicine')
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
            onClick={() => printConsultationRecord({ patient: currentPatient, diagnosis, notes, prescriptions, doctorName: user?.full_name || user?.name || 'Doctor', specialty: user?.specialty || '', prcLicense: user?.prc_license || '', date: formatDate(appt?.appointment_date || new Date().toISOString()), clinic: clinicSettings, services: billableServices })}
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
                <img
                  src={latestProgressImage.image_url}
                  alt={latestProgressImage.caption || 'Most recent progress'}
                  className="h-20 w-20 rounded-xl object-cover bg-white border border-slate-200"
                />
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-semibold text-slate-800">{latestProgressImage.caption || 'Recent image'}</p>
                  <a
                    href={latestProgressImage.image_url}
                    target="_blank"
                    rel="noreferrer"
                    className="mt-1 inline-flex items-center gap-1 text-xs font-bold text-violet-600 hover:text-violet-700"
                  >
                    View full image <MdOpenInNew className="text-[12px]" />
                  </a>
                </div>
              </div>
            </div>
          )}
        </div>

        <div className="flex gap-1 bg-slate-100 p-1 rounded-xl w-fit">
          {[
            { key: 'consultation', label: 'Consultation', icon: MdLocalPharmacy },
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
                    onChange={(e) => { const files = e.target.files; e.target.value = ''; handleUploadProgressImages(files) }}
                  />
                </label>
              </div>

              <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                <div className="flex items-center justify-between gap-3">
                  <p className="text-xs font-bold text-violet-600">Progress Image #1</p>
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
                            <img src={image.image_url} alt={image.caption || `Progress image ${index + 1}`} className="h-40 w-full bg-slate-100 object-cover" />
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
                            <label className={`inline-flex items-center gap-1 rounded-lg border border-slate-200 px-2 py-1 text-[10px] font-bold text-slate-500 hover:bg-slate-50 ${uploadingIndex !== null ? 'pointer-events-none opacity-50' : 'cursor-pointer'}`}>
                              <MdUpload className="text-[12px]" /> {uploadingIndex === index ? 'Uploading...' : 'Replace'}
                              <input type="file" accept="image/png,image/jpeg,.png,.jpg,.jpeg" className="hidden" disabled={uploadingIndex !== null} onChange={(e) => { const file = e.target.files?.[0]; e.target.value = ''; handleUploadProgressImage(index, file) }} />
                            </label>
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
                <div><h2 className="text-sm font-bold text-slate-800 flex items-center gap-2"><MdMedicalServices className="text-violet-500 text-[16px]" /> Services Performed & Actual Consumables</h2><p className="mt-1 text-xs text-slate-500">Record what was actually performed. Consumable quantities are deducted when the consultation is completed.</p></div>
                {isEditMode && <span className="rounded-full bg-slate-100 px-2.5 py-1 text-[10px] font-bold text-slate-500">Clinical usage locked after completion</span>}
              </div>
              {billingCatalog.length === 0 ? <div className="rounded-xl bg-slate-50 p-4 text-sm text-slate-400">No active services are configured for this clinic type.</div> : <div className="space-y-3">{billingCatalog.map((service) => {
                const selected = billableServices.find((entry) => Number(entry.catalog_service_id) === Number(service.id))
                return <div key={service.id} className={`rounded-2xl border p-4 ${selected ? 'border-violet-200 bg-violet-50/40' : 'border-slate-200 bg-white'}`}>
                  <label className="flex cursor-pointer items-start gap-3"><input type="checkbox" disabled={isEditMode} checked={Boolean(selected)} onChange={() => toggleService(service)} className="mt-1 h-4 w-4 rounded border-slate-300 text-violet-600" /><div className="min-w-0 flex-1"><div className="flex flex-wrap items-center justify-between gap-2"><div><p className="font-bold text-slate-800">{service.service_name}</p><p className="text-xs text-slate-500">{service.category || 'Clinic service'}</p></div></div></div></label>
                  {selected && selected.materials?.length > 0 && <div className="mt-4 border-t border-violet-100 pt-3"><p className="mb-2 text-[10px] font-bold uppercase tracking-widest text-slate-400">Actual Material Usage</p><div className="grid gap-2 sm:grid-cols-2">{selected.materials.map((material, index) => { const inv = inventoryItems.find((row) => Number(row.id) === Number(material.inventory_id)); const decimal = Number(inv?.uom_allow_decimal || 0) === 1; const precision = decimal ? Math.max(1, Number(inv?.uom_decimal_precision || 2)) : 0; const step = decimal ? 1 / (10 ** precision) : 1; const roomStock = Math.max(0, Number(inv?.treatment_room_stock || 0)); return <label key={`${material.inventory_id || material.material_name}-${index}`} className="rounded-xl border border-slate-200 bg-white p-3"><span className="text-xs font-semibold text-slate-700">{material.material_name}</span><div className="mt-2 flex items-center gap-2"><input type="number" inputMode="decimal" min="0" max={roomStock} step={step} disabled={isEditMode} value={material.quantity} onChange={(e) => updateServiceMaterial(service.id, index, Math.min(roomStock, Math.max(0, Number(e.target.value) || 0)))} className="form-control h-9" /><span className="whitespace-nowrap text-xs text-slate-500">{material.unit_label || inv?.uom || 'unit'}</span></div></label> })}</div></div>}
                </div>
              })}</div>}
            </div>

            <div className="bg-white border border-slate-200 rounded-2xl p-6">
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-sm font-bold text-slate-800 flex items-center gap-2">
                  <MdLocalPharmacy className="text-violet-500 text-[16px]" /> Prescriptions
                </h2>
                <button
                  onClick={addRx}
                  disabled={prescriptions.length >= 30}
                  className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold text-violet-600 bg-violet-50 border border-violet-200 hover:bg-violet-100 rounded-xl transition-colors"
                >
                  <MdAdd className="text-[14px]" /> {prescriptions.length >= 30 ? '30 Medicine Limit Reached' : 'Add Medicine'}
                </button>
              </div>



              <div className="space-y-4">
                {prescriptions.map((rx, index) => (
                  <div key={index} className="bg-slate-50 rounded-xl p-4 border border-slate-200 space-y-3">
                    <div className="flex items-center justify-between">
                      <p className="text-xs font-bold text-violet-600 flex items-center gap-1">
                        <MdLocalPharmacy className="text-[12px]" /> Medicine #{index + 1}
                      </p>
                      {prescriptions.length > 1 && (
                        <button
                          onClick={() => removeRx(index)}
                          className="w-6 h-6 flex items-center justify-center rounded-lg hover:bg-red-50 text-slate-300 hover:text-red-400 transition-colors"
                        >
                          <MdClose className="text-[13px]" />
                        </button>
                      )}
                    </div>

                    <div>
                      <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-1 block">Medicine *</label>
                      <select
                        value={rx.inventory_id || (medicineItems.find((item) => item.name?.trim().toLowerCase() === String(rx.medicine || '').trim().toLowerCase())?.id ?? (rx.medicine ? '__other__' : ''))}
                        onChange={(e) => {
                          const value = e.target.value
                          if (value === '__other__') {
                            setPrescriptions((prev) => prev.map((entry, rxIndex) => rxIndex === index ? { ...entry, inventory_id: '__other__', medicine: '' } : entry))
                            return
                          }
                          const selected = medicineItems.find((item) => String(item.id) === String(value))
                          setPrescriptions((prev) => prev.map((entry, rxIndex) => rxIndex === index ? { ...entry, inventory_id: value, medicine: selected?.name || '' } : entry))
                        }}
                        className="w-full text-sm p-2.5 rounded-lg border border-slate-200 bg-white focus:outline-none focus:border-violet-400 transition-colors"
                      >
                        <option value="">Select medicine from inventory...</option>
                        <optgroup label="General Medicine">
                          {medicineItems.filter((item) => item.category === 'medical').map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}
                        </optgroup>
                        <optgroup label="Dermatology">
                          {medicineItems.filter((item) => item.category === 'derma').map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}
                        </optgroup>
                        <option value="__other__">Other / Not in Inventory</option>
                      </select>
                      {(rx.inventory_id === '__other__' || (!rx.inventory_id && rx.medicine && !medicineItems.some((item) => item.name?.trim().toLowerCase() === String(rx.medicine).trim().toLowerCase()))) && (
                        <div className="mt-2"><label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-1 block">Medicine Name *</label><input type="text" value={rx.medicine} onChange={(e) => updateRx(index, 'medicine', e.target.value)} maxLength={160} placeholder="Enter medicine name..." className="w-full text-sm p-2.5 rounded-lg border border-slate-200 bg-white focus:outline-none focus:border-violet-400" /></div>
                      )}
                    </div>

                    <div className="grid grid-cols-2 gap-2">
                      <div>
                        <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-1 block">Dosage</label>
                        <div className="flex items-center gap-2">
                          <input
                            type="number"
                            min="0"
                            step="0.01"
                            value={/^\d*\.?\d*$/.test(String(rx.dosage || '')) ? rx.dosage : ''}
                            onChange={(e) => updateRx(index, 'dosage', e.target.value)}
                            placeholder="0"
                            className="w-full text-sm p-2 rounded-lg border border-slate-200 bg-white focus:outline-none focus:border-violet-400 [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                          />
                          {getMedicineUnit(rx.medicine, inventoryItems) && (
                            <span className="shrink-0 text-xs font-medium text-slate-500">
                              {getMedicineUnit(rx.medicine, inventoryItems)}
                            </span>
                          )}
                        </div>
                        {rx.dosage && !/^\d*\.?\d*$/.test(String(rx.dosage || '')) && (
                          <p className="mt-1 text-[10px] text-amber-600">
                            Existing dosage &quot;{rx.dosage}&quot; is not numeric. Update it to save changes.
                          </p>
                        )}
                      </div>
                      <div>
                        <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-1 block">Frequency</label>
                        <select value={isCustomOption(rx.frequency, FREQUENCIES) ? '__custom__' : rx.frequency} onChange={(e) => updateRx(index, 'frequency', e.target.value === '__custom__' ? 'Custom' : e.target.value)} className="w-full text-sm p-2 rounded-lg border border-slate-200 bg-white focus:outline-none focus:border-violet-400">
                          <option value="">Select...</option>{FREQUENCIES.map((frequency) => <option key={frequency}>{frequency}</option>)}<option value="__custom__">Custom…</option>
                        </select>
                        {isCustomOption(rx.frequency, FREQUENCIES) && <input type="text" value={rx.frequency === 'Custom' ? '' : rx.frequency} onChange={(e) => updateRx(index, 'frequency', e.target.value || 'Custom')} maxLength={120} placeholder="e.g. Every 6 hours" className="mt-2 w-full text-sm p-2 rounded-lg border border-violet-200 bg-white focus:outline-none focus:border-violet-400" />}
                      </div>
                      <div className="col-span-2">
                        <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-1 block">Notes</label>
                        <input
                          type="text"
                          value={rx.notes}
                          onChange={(e) => updateRx(index, 'notes', e.target.value)}
                          maxLength={500}
                          placeholder="e.g. Take after meals"
                          className="w-full text-sm p-2 rounded-lg border border-slate-200 bg-white focus:outline-none focus:border-violet-400"
                        />
                      </div>
                    </div>
                  </div>
                ))}
              </div>
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
                {clinicalDeductionPlan.length > 0 && (
                  <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4 text-sm text-slate-700">
                    <div className="flex flex-wrap items-start justify-between gap-2"><div><p className="font-black text-slate-900">Inventory deduction on completion</p><p className="mt-1 text-xs text-slate-500">Expected FEFO batches are shown below. Stock is revalidated when you complete the consultation.</p></div><span className="rounded-full bg-white px-2.5 py-1 text-[10px] font-black uppercase tracking-wider text-slate-500">Preview</span></div>
                    <div className="mt-3 space-y-3">{clinicalDeductionPlan.map((entry) => <div key={entry.inventory_id} className={`rounded-xl border bg-white p-3 ${entry.shortage > 0.0001 ? 'border-rose-200' : 'border-slate-200'}`}><div className="flex flex-wrap items-center justify-between gap-2"><strong>{entry.name}</strong><span className={`text-xs font-black ${entry.shortage > 0.0001 ? 'text-rose-700' : 'text-emerald-700'}`}>{entry.requested} {entry.unit}</span></div><p className="mt-1 text-xs text-slate-500">From {entry.location}</p>{entry.allocations.length > 0 ? <div className="mt-2 flex flex-wrap gap-2">{entry.allocations.map((allocation) => <span key={`${entry.inventory_id}-${allocation.batch_id}`} className="rounded-lg bg-slate-100 px-2 py-1 text-[11px] font-semibold text-slate-700">{allocation.batch_code}: {allocation.quantity} {entry.unit}{allocation.expiration_date ? ` · exp ${String(allocation.expiration_date).slice(0,10)}` : ''}</span>)}</div> : <p className="mt-2 text-xs font-bold text-rose-700">No usable batch stock is available in this treatment room.</p>}{entry.shortage > 0.0001 && <p className="mt-2 text-xs font-bold text-rose-700">Short by {entry.shortage} {entry.unit}. Request a stock transfer before completion.</p>}</div>)}</div>
                  </div>
                )}
                {inventoryBlocker && (
                  <div className="rounded-2xl border border-amber-300 bg-amber-50 p-4 text-sm text-amber-950">
                    <p className="font-black">Stock transfer required before completing this consultation</p>
                    <p className="mt-1">{inventoryBlocker.message || `${inventoryBlocker.name} requires ${inventoryBlocker.requested} ${inventoryBlocker.unit}, but only ${inventoryBlocker.available} are available in ${inventoryBlocker.location}.`}</p>
                    <p className="mt-1 text-xs text-amber-800">Clinical use can only deduct stock already transferred into the treatment room. Main Stockroom is not used as an automatic fallback.</p>
                    <button type="button" onClick={() => navigate('/doctor/request/stock-transfer')} className="mt-3 inline-flex items-center rounded-xl bg-amber-600 px-4 py-2 text-xs font-black text-white hover:bg-amber-700">Request Stock Transfer</button>
                  </div>
                )}
                <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
                  <div>
                    {lastSavedAt ? <span className="font-semibold text-emerald-700">Draft saved at {lastSavedAt.toLocaleTimeString('en-PH', { hour: 'numeric', minute: '2-digit' })}</span> : <span className="text-slate-400">Draft autosaves every 25 seconds.</span>}
                    {autoSaveError && <span className="ml-2 font-semibold text-rose-600">{autoSaveError}</span>}
                  </div>
                  <span className="text-slate-400">Saving a draft does not complete the visit or deduct inventory.</span>
                </div>
                <div className="flex flex-col-reverse gap-2 sm:flex-row sm:items-center sm:justify-end">
                  <button onClick={() => handleSave()} disabled={saving || uploadingIndex !== null} className={`flex items-center justify-center gap-2 px-6 py-2.5 text-sm font-bold rounded-xl transition-colors ${saved ? 'bg-emerald-500 text-white' : 'bg-white border border-violet-200 text-violet-700 hover:bg-violet-50 disabled:opacity-50'}`}>
                    {saved ? <><MdCheck className="text-[15px]" /> Draft Saved</> : saving ? 'Saving...' : <><MdSave className="text-[15px]" /> Save Draft</>}
                  </button>
                  <button onClick={handleFinalize} disabled={saving || uploadingIndex !== null} className="flex items-center justify-center gap-2 rounded-xl bg-violet-600 px-6 py-2.5 text-sm font-bold text-white hover:bg-violet-700 disabled:opacity-50">
                    <MdCheck className="text-[15px]" /> Complete Consultation
                  </button>
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
                        {visit.prescription && (() => {
                          try {
                            const rx = JSON.parse(visit.prescription)
                            if (!Array.isArray(rx) || rx.length === 0) return null
                            return (
                              <div>
                                <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-1">Rx</p>
                                {rx.map((medicine, medicineIndex) => (
                                  <p key={medicineIndex} className="text-xs text-slate-600">
                                    · {medicine.medicine} {medicine.dosage && `— ${medicine.dosage}`} {medicine.frequency && `(${medicine.frequency})`}
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




