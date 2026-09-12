import { useEffect, useState } from 'react'
import { useLocation, useNavigate, useSearchParams, NavLink } from 'react-router-dom'
import { useAuth } from '../../context/AuthContext'
import { uploadClinicalImageSigned, getClinicalImageScanStatus } from '../../services/portal.service'
import Modal from '../../components/ui/Modal'
import {
  saveConsultation,
  updateConsultation,
  getConsultation,
  getPatientHistory,
  getInventoryItems,
  getBillingCatalog,
  addConsultationAmendment,
} from '../../services/doctor.service'
import { getClinicSettings } from '../../services/clinic.service'
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
  MdInventory2,
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
const DURATIONS = ['3 days', '5 days', '7 days', '2 weeks', '1 month', '3 months', 'Ongoing']

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

const PrintPrescription = ({ patient, diagnosis, prescriptions, doctorName, specialty, prcLicense, date, clinic }) => (
  <div id="print-area" className="hidden print:block font-sans p-8 max-w-lg mx-auto">
    <div className="text-center border-b-2 border-slate-800 pb-4 mb-4">
      <h1 className="text-xl font-bold text-slate-800 uppercase tracking-wide">{clinic?.clinic_name || 'CARAIT MEDICAL AND DERMATOLOGY CLINIC'}</h1>
      {clinic?.address && <p className="text-sm text-slate-600 mt-1">{clinic.address}</p>}
      {(clinic?.phone || clinic?.email) && <p className="text-xs text-slate-500 mt-1">{[clinic?.phone, clinic?.email].filter(Boolean).join(' • ')}</p>}
      <div className="mt-3">
        <p className="text-base font-bold text-slate-800">{doctorName}</p>
        <p className="text-sm text-slate-600">{specialty}{prcLicense ? ` • PRC Lic. No. ${prcLicense}` : ''}</p>
      </div>
    </div>
    <div className="grid grid-cols-2 gap-4 mb-4 text-sm">
      <div><span className="text-slate-500">Name:</span> <strong>{patient?.name}</strong></div>
      <div><span className="text-slate-500">Age/Sex:</span> <strong>{patient?.age} / {patient?.sex}</strong></div>
      <div><span className="text-slate-500">Date:</span> <strong>{date}</strong></div>
    </div>
    {diagnosis && <div className="mb-4 p-3 border border-slate-300 rounded"><p className="text-xs font-bold text-slate-500 uppercase mb-1">Diagnosis</p><p className="text-sm text-slate-800">{diagnosis}</p></div>}
    <div className="mb-6">
      <p className="text-2xl font-serif text-slate-800 mb-3">Rx</p>
      {prescriptions.filter((rx) => rx.medicine?.trim()).map((rx, i) => <div key={i} className="mb-3 pl-4 border-l-2 border-slate-400"><p className="text-sm font-bold text-slate-800">{i + 1}. {rx.medicine}</p>{rx.dosage && <p className="text-sm text-slate-600 ml-2">Dosage: {rx.dosage}</p>}{rx.frequency && <p className="text-sm text-slate-600 ml-2">Sig: {rx.frequency}</p>}{rx.duration && <p className="text-sm text-slate-600 ml-2">Duration: {rx.duration}</p>}{rx.notes && <p className="text-sm text-slate-500 ml-2 italic">{rx.notes}</p>}</div>)}
    </div>
    <div className="mt-12 pt-4 border-t border-slate-300"><div className="w-40 border-b border-slate-800 mb-1" /><p className="text-xs text-slate-600">Doctor&apos;s Signature</p></div>
  </div>
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
  const [prescriptions, setPrescriptions] = useState([{ medicine: '', dosage: '', frequency: '', duration: '', notes: '' }])
  const [progressImages, setProgressImages] = useState([])
  const [patientHistory, setPatientHistory] = useState([])
  const [saved, setSaved] = useState(false)
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
    setConsultationStatus(consult.status || 'finalized')
    setAmendments(Array.isArray(consult.amendments) ? consult.amendments : [])
    setDiagnosis(consult.diagnosis || '')
    setNotes(consult.notes || '')
    setProgressImages(normalizeProgressImages(consult.progress_images))
    try {
      const rx = typeof consult.prescription === 'string'
        ? JSON.parse(consult.prescription)
        : consult.prescription
      if (Array.isArray(rx) && rx.length > 0) {
        setPrescriptions(rx)
      } else {
        setPrescriptions([{ medicine: '', dosage: '', frequency: '', duration: '', notes: '' }])
      }
    } catch {
      setPrescriptions([{ medicine: '', dosage: '', frequency: '', duration: '', notes: '' }])
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
          time: consult.time,
          type: consult.type,
          status: 'completed',
        })
        applyConsultationData(consult)
        setIsEditMode(true)
      })
      .catch(() => {})
      .finally(() => setInitLoading(false))
  }, [apptIdParam, apptFromState])

  useEffect(() => {
    if (!apptFromState || apptFromState.status !== 'completed') return
    setIsEditMode(true)
    getConsultation(apptFromState.id)
      .then((consult) => applyConsultationData(consult))
      .catch(() => {})
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
    getBillingCatalog(clinicType).then((rows) => setBillingCatalog(Array.isArray(rows) ? rows : [])).catch(() => setBillingCatalog([]))
  }, [appt?.type, appt?.clinic_type])

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

  const addRx = () => setPrescriptions((prev) => [...prev, { medicine: '', dosage: '', frequency: '', duration: '', notes: '' }])
  const removeRx = (index) => setPrescriptions((prev) => prev.filter((_, rxIndex) => rxIndex !== index))

  const addProgressImage = () => setProgressImages((prev) => [...prev, createBlankProgressImage()])

  const updateProgressImage = (index, field, value) => {
    setProgressImages((prev) => prev.map((image, imageIndex) => (
      imageIndex === index ? { ...image, [field]: value } : image
    )))
  }

  const removeProgressImage = (index) => {
    setProgressImages((prev) => prev.filter((_, imageIndex) => imageIndex !== index))
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

  const handleUploadProgressImage = async (index, file) => {
    if (!file) return
    if (!String(file.type || '').startsWith('image/')) {
      setClinicalUploadStatus(index, { tone: 'danger', message: 'Select a valid image file.' })
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

  const handleSave = async () => {
    if (!appt) return
    if (consultationStatus === 'finalized') {
      alert('This medical record is finalized. Add an amendment instead of editing the original record.')
      return
    }
    setSaving(true)

    const payload = {
      diagnosis,
      notes,
      prescription: JSON.stringify(prescriptions),
      images: normalizeProgressImages(progressImages).filter((image) => image.image_url),
      ...(isEditMode ? {} : { billable_services: billableServices }),
    }

    try {
      if (isEditMode) {
        await updateConsultation(appt.id, payload)
      } else {
        await saveConsultation(appt.id, payload)
      }

      setSaved(true)
      setTimeout(() => setSaved(false), 2000)

      if (!isEditMode) {
        setIsEditMode(true)
        setConsultationStatus('finalized')
        setAppt((prev) => (prev ? { ...prev, status: 'completed' } : prev))
      }

      await loadHistory(appt.patient_id)
    } catch {
      alert('Failed to save consultation. Please try again.')
    } finally {
      setSaving(false)
    }
  }

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
      <PrintPrescription
        patient={currentPatient}
        diagnosis={diagnosis}
        prescriptions={prescriptions}
        doctorName={user?.full_name}
        specialty={user?.specialty}
        prcLicense={user?.prc_license}
        clinic={clinicSettings}
        date={date}
      />

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
          <button
            onClick={() => window.print()}
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
                    rows={3}
                    placeholder="Observations, findings, follow-up instructions..."
                    className="w-full text-sm bg-slate-50 border-2 border-slate-200 rounded-xl px-4 py-3 focus:outline-none focus:border-violet-400 resize-none transition-colors"
                  />
                </div>
              </div>
            </div>

            <div className="bg-white border border-slate-200 rounded-2xl p-6">
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-sm font-bold text-slate-800 flex items-center gap-2">
                  <MdImage className="text-violet-500 text-[16px]" /> Progress Images
                </h2>
                <button
                  onClick={addProgressImage}
                  className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold text-violet-600 bg-violet-50 border border-violet-200 hover:bg-violet-100 rounded-xl transition-colors"
                >
                  <MdAdd className="text-[14px]" /> Add Image
                </button>
              </div>

              <p className="text-xs text-slate-500 mb-4">
                Upload a clinical progress photo securely. Upload authorization is signed by the clinic server for this appointment.
              </p>

              {progressImages.length === 0 ? (
                <div className="rounded-2xl border border-dashed border-slate-200 bg-slate-50 px-4 py-8 text-center">
                  <MdImage className="mx-auto text-[30px] text-slate-300 mb-2" />
                  <p className="text-sm font-semibold text-slate-600">No progress images yet</p>
                  <p className="text-xs text-slate-400 mt-1">Add the first image to document the patient&apos;s progress.</p>
                </div>
              ) : (
                <div className="space-y-4">
                  {progressImages.map((image, index) => (
                    <div key={index} className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                      <div className="flex items-center justify-between gap-3">
                        <p className="text-xs font-bold text-violet-600">Progress Image #{index + 1}</p>
                        <button
                          onClick={() => removeProgressImage(index)}
                          className="w-7 h-7 flex items-center justify-center rounded-lg text-slate-300 hover:bg-red-50 hover:text-red-500 transition-colors"
                        >
                          <MdClose className="text-[14px]" />
                        </button>
                      </div>

                      <div className="mt-3 grid gap-4 lg:grid-cols-[160px_minmax(0,1fr)]">
                        <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white">
                          {image.image_url ? (
                            <img
                              src={image.image_url}
                              alt={image.caption || `Progress ${index + 1}`}
                              className="h-40 w-full object-cover bg-slate-100"
                            />
                          ) : (
                            <div className="h-40 flex flex-col items-center justify-center text-slate-300">
                              <MdImage className="text-[34px] mb-2" />
                              <p className="text-xs font-semibold">Preview</p>
                            </div>
                          )}
                        </div>

                        <div className="space-y-3">
                          <div className="rounded-xl border border-violet-100 bg-violet-50 px-3 py-2.5">
                            <p className="text-[10px] font-bold uppercase tracking-widest text-violet-500">Secure Clinical Upload</p>
                            <p className="mt-1 text-xs text-violet-700">
                              {image.image_url
                                ? image.security_scan_status === 'approved'
                                  ? 'Security scan passed. Image is ready to save with this consultation.'
                                  : image.security_scan_status === 'bypassed'
                                    ? 'This image was uploaded without malware scanning after an explicit warning.'
                                    : 'Legacy image. Malware scan status was not recorded when it was uploaded.'
                                : 'Choose an image file below. The image is scanned for malware before it is attached.'}
                            </p>
                          </div>

                          <div>
                            <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-1 block">Upload Image</label>
                            <label className={`inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-bold text-slate-600 hover:bg-slate-50 ${uploadingIndex !== null ? 'pointer-events-none opacity-60' : 'cursor-pointer'}`}>
                              <MdUpload className="text-[14px]" />
                              {uploadingIndex === index ? 'Uploading & scanning...' : image.image_url ? 'Replace Image' : 'Choose File'}
                              <input
                                type="file"
                                accept="image/*"
                                className="hidden"
                                disabled={uploadingIndex !== null}
                                onChange={(e) => { const file = e.target.files?.[0]; e.target.value = ''; handleUploadProgressImage(index, file) }}
                              />
                            </label>
                          </div>

                          {imageUploadStatus[index] && (
                            <div className={`rounded-xl border px-3 py-2 text-xs font-semibold ${imageUploadStatus[index].tone === 'success' ? 'border-emerald-200 bg-emerald-50 text-emerald-700' : imageUploadStatus[index].tone === 'warning' ? 'border-amber-200 bg-amber-50 text-amber-800' : imageUploadStatus[index].tone === 'danger' ? 'border-rose-200 bg-rose-50 text-rose-700' : 'border-sky-200 bg-sky-50 text-sky-700'}`}>
                              {imageUploadStatus[index].message}
                            </div>
                          )}

                          <div>
                            <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-1 block">Caption</label>
                            <input
                              type="text"
                              value={image.caption}
                              onChange={(e) => updateProgressImage(index, 'caption', e.target.value)}
                              placeholder="e.g. Before treatment, Week 2 follow-up"
                              className="w-full text-sm p-2.5 rounded-lg border border-slate-200 bg-white focus:outline-none focus:border-violet-400"
                            />
                          </div>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}

              <div className="mt-5">
                <p className="text-[10px] font-bold uppercase tracking-widest text-slate-400 mb-2">Current Gallery</p>
                <ProgressImageGallery images={progressImages} />
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
                  {selected && selected.materials?.length > 0 && <div className="mt-4 border-t border-violet-100 pt-3"><p className="mb-2 text-[10px] font-bold uppercase tracking-widest text-slate-400">Actual Material Usage</p><div className="grid gap-2 sm:grid-cols-2">{selected.materials.map((material, index) => <label key={`${material.inventory_id || material.material_name}-${index}`} className="rounded-xl border border-slate-200 bg-white p-3"><span className="text-xs font-semibold text-slate-700">{material.material_name}</span><div className="mt-2 flex items-center gap-2"><input type="number" min="0" step="0.01" disabled={isEditMode} value={material.quantity} onChange={(e) => updateServiceMaterial(service.id, index, e.target.value)} className="form-control h-9" /><span className="whitespace-nowrap text-xs text-slate-500">{material.unit_label || 'unit'}</span></div></label>)}</div></div>}
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
                  className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold text-violet-600 bg-violet-50 border border-violet-200 hover:bg-violet-100 rounded-xl transition-colors"
                >
                  <MdAdd className="text-[14px]" /> Add Medicine
                </button>
              </div>

              <datalist id="medicine-list-consult">
                {inventoryItems.map((item) => (
                  <option key={item.id} value={item.name}>
                    {item.category} · {item.stock} {item.unit}(s) in stock
                  </option>
                ))}
              </datalist>

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
                      <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-1 block">Medicine</label>
                      <input
                        type="text"
                        list="medicine-list-consult"
                        value={rx.medicine}
                        onChange={(e) => updateRx(index, 'medicine', e.target.value)}
                        placeholder="Type or select from inventory..."
                        className="w-full text-sm p-2.5 rounded-lg border border-slate-200 bg-white focus:outline-none focus:border-violet-400 transition-colors"
                      />
                      {rx.medicine && (() => {
                        const found = inventoryItems.find((item) => item.name.toLowerCase() === rx.medicine.toLowerCase())
                        return found ? (
                          <p className={`text-[10px] mt-1 flex items-center gap-1 font-medium ${found.stock <= (found.threshold || 5) ? 'text-red-500' : 'text-emerald-600'}`}>
                            <MdInventory2 className="text-[11px]" />
                            {found.stock} {found.unit}(s) in stock
                            {found.stock <= (found.threshold || 5) && ' - Low stock!'}
                          </p>
                        ) : null
                      })()}
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
                            className="w-full text-sm p-2 rounded-lg border border-slate-200 bg-white focus:outline-none focus:border-violet-400"
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
                        <select
                          value={rx.frequency}
                          onChange={(e) => updateRx(index, 'frequency', e.target.value)}
                          className="w-full text-sm p-2 rounded-lg border border-slate-200 bg-white focus:outline-none focus:border-violet-400"
                        >
                          <option value="">Select...</option>
                          {FREQUENCIES.map((frequency) => <option key={frequency}>{frequency}</option>)}
                        </select>
                      </div>
                      <div>
                        <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-1 block">Duration</label>
                        <select
                          value={rx.duration}
                          onChange={(e) => updateRx(index, 'duration', e.target.value)}
                          className="w-full text-sm p-2 rounded-lg border border-slate-200 bg-white focus:outline-none focus:border-violet-400"
                        >
                          <option value="">Select...</option>
                          {DURATIONS.map((duration) => <option key={duration}>{duration}</option>)}
                        </select>
                      </div>
                      <div>
                        <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-1 block">Notes</label>
                        <input
                          type="text"
                          value={rx.notes}
                          onChange={(e) => updateRx(index, 'notes', e.target.value)}
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
              <div className="rounded-2xl border border-violet-200 bg-white p-6 space-y-4">
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
                  <input value={amendmentReason} onChange={(e) => setAmendmentReason(e.target.value)} placeholder="Reason for amendment (required)" className="w-full rounded-xl border border-slate-200 px-4 py-3 text-sm outline-none focus:border-violet-400" />
                  <textarea value={amendmentText} onChange={(e) => setAmendmentText(e.target.value)} rows={4} placeholder="Correction or additional clinical information..." className="w-full rounded-xl border border-slate-200 px-4 py-3 text-sm outline-none focus:border-violet-400 resize-none" />
                  <div className="flex justify-end">
                    <button onClick={handleAddAmendment} disabled={addingAmendment || !amendmentReason.trim() || !amendmentText.trim()} className="rounded-xl bg-violet-600 px-5 py-2.5 text-sm font-bold text-white disabled:opacity-50">{addingAmendment ? 'Adding...' : 'Add Amendment'}</button>
                  </div>
                </div>
              </div>
            ) : (
              <div className="flex items-center justify-end gap-3">
                <button onClick={() => navigate(-1)} className="px-5 py-2.5 text-sm font-semibold text-slate-600 border border-slate-200 rounded-xl hover:bg-slate-50 transition-colors">Cancel</button>
                <button onClick={handleSave} disabled={saving || uploadingIndex !== null} className={`flex items-center gap-2 px-6 py-2.5 text-sm font-bold rounded-xl transition-colors ${saved ? 'bg-emerald-500 text-white' : 'bg-violet-600 hover:bg-violet-700 text-white disabled:opacity-50'}`}>
                  {saved ? <><MdCheck className="text-[15px]" /> Saved!</> : saving ? 'Saving...' : <><MdSave className="text-[15px]" /> Save & Complete</>}
                </button>
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

      <style>{'@media print { body * { visibility: hidden; } #print-area, #print-area * { visibility: visible; } #print-area { position: absolute; left: 0; top: 0; width: 100%; } }'}</style>
    </>
  )
}

export default Doctor_Consultation



