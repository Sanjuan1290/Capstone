import { useEffect, useState } from 'react'
import { useLocation, useNavigate, useSearchParams, NavLink } from 'react-router-dom'
import { useAuth } from '../../context/AuthContext'
import { uploadToCloudinary } from '../../services/portal.service'
import {
  saveConsultation,
  updateConsultation,
  getConsultation,
  getPatientHistory,
  getInventoryItems,
} from '../../services/doctor.service'
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
})

const normalizeProgressImages = (images = []) => (
  Array.isArray(images)
    ? images.map((image) => ({
      image_url: String(image?.image_url || image?.url || '').trim(),
      caption: String(image?.caption || image?.notes || '').trim(),
    })).filter((image) => image.image_url || image.caption)
    : []
)

const PrintPrescription = ({ patient, diagnosis, prescriptions, doctorName, specialty, date }) => (
  <div id="print-area" className="hidden print:block font-sans p-8 max-w-lg mx-auto">
    <div className="text-center border-b-2 border-slate-800 pb-4 mb-4">
      <h1 className="text-xl font-bold text-slate-800 uppercase tracking-wide">Carait Medical & Dermatologic Clinics</h1>
      <p className="text-sm text-slate-600 mt-1">A. Bonifacio St., Brgy. Canlalay, Bian, Laguna</p>
      <div className="mt-3">
        <p className="text-base font-bold text-slate-800">{doctorName}</p>
        <p className="text-sm text-slate-600">{specialty} · PRC Lic. No. 0012345</p>
      </div>
    </div>
    <div className="grid grid-cols-2 gap-4 mb-4 text-sm">
      <div><span className="text-slate-500">Name:</span> <strong>{patient?.name}</strong></div>
      <div><span className="text-slate-500">Age/Sex:</span> <strong>{patient?.age} / {patient?.sex}</strong></div>
      <div><span className="text-slate-500">Date:</span> <strong>{date}</strong></div>
      <div><span className="text-slate-500">Appt #:</span> <strong>{patient?.appointmentId}</strong></div>
    </div>
    {diagnosis && (
      <div className="mb-4 p-3 border border-slate-300 rounded">
        <p className="text-xs font-bold text-slate-500 uppercase mb-1">Diagnosis</p>
        <p className="text-sm text-slate-800">{diagnosis}</p>
      </div>
    )}
    <div className="mb-6">
      <p className="text-2xl font-serif text-slate-800 mb-3">Rx</p>
      {prescriptions.map((rx, i) => (
        <div key={i} className="mb-3 pl-4 border-l-2 border-slate-400">
          <p className="text-sm font-bold text-slate-800">{i + 1}. {rx.medicine}</p>
          {rx.dosage && <p className="text-sm text-slate-600 ml-2">Dosage: {rx.dosage}</p>}
          {rx.frequency && <p className="text-sm text-slate-600 ml-2">Sig: {rx.frequency}</p>}
          {rx.duration && <p className="text-sm text-slate-600 ml-2">Duration: {rx.duration}</p>}
          {rx.notes && <p className="text-sm text-slate-500 ml-2 italic">{rx.notes}</p>}
        </div>
      ))}
    </div>
    <div className="mt-12 pt-4 border-t border-slate-300 flex justify-between items-end">
      <div>
        <div className="w-40 border-b border-slate-800 mb-1" />
        <p className="text-xs text-slate-600">Doctor&apos;s Signature</p>
      </div>
      <p className="text-xs text-slate-400 italic">Valid for 7 days.</p>
    </div>
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
  const [uploadingIndex, setUploadingIndex] = useState(null)

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

  const handleUploadProgressImage = async (index, file) => {
    if (!file) return
    setUploadingIndex(index)
    try {
      const imageUrl = await uploadToCloudinary(file)
      updateProgressImage(index, 'image_url', imageUrl)
      if (!progressImages[index]?.caption) {
        updateProgressImage(index, 'caption', file.name.replace(/\.[^.]+$/, ''))
      }
    } catch (err) {
      alert(err.message || 'Failed to upload image.')
    } finally {
      setUploadingIndex(null)
    }
  }

  const handleSave = async () => {
    if (!appt) return
    setSaving(true)

    const payload = {
      diagnosis,
      notes,
      prescription: JSON.stringify(prescriptions),
      images: normalizeProgressImages(progressImages).filter((image) => image.image_url),
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
        <p className="text-slate-500 mb-6">Please select a patient from your daily appointments.</p>
        <NavLink
          to="/doctor/daily-appointments"
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
        date={date}
      />

      <div className="max-w-5xl space-y-5">
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
              {isEditMode ? 'Edit Consultation' : 'Consultation'}
              {isEditMode && (
                <span className="text-xs font-semibold bg-violet-50 text-violet-700 border border-violet-200 px-2 py-0.5 rounded-full">
                  Completed
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
                <span className="flex items-center gap-1"><MdPerson className="text-[12px]" /> Appt #{currentPatient?.appointmentId}</span>
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
                Upload a photo or paste an image URL so progress can be reviewed during follow-up visits.
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
                          <div>
                            <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-1 block">Image URL</label>
                            <input
                              type="text"
                              value={image.image_url}
                              onChange={(e) => updateProgressImage(index, 'image_url', e.target.value)}
                              placeholder="Paste image URL"
                              className="w-full text-sm p-2.5 rounded-lg border border-slate-200 bg-white focus:outline-none focus:border-violet-400"
                            />
                          </div>

                          <div>
                            <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-1 block">Upload Image</label>
                            <label className="inline-flex cursor-pointer items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-bold text-slate-600 hover:bg-slate-50">
                              <MdUpload className="text-[14px]" />
                              {uploadingIndex === index ? 'Uploading...' : 'Choose File'}
                              <input
                                type="file"
                                accept="image/*"
                                className="hidden"
                                onChange={(e) => handleUploadProgressImage(index, e.target.files?.[0])}
                              />
                            </label>
                          </div>

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

            <div className="flex items-center justify-end gap-3">
              <button
                onClick={() => navigate(-1)}
                className="px-5 py-2.5 text-sm font-semibold text-slate-600 border border-slate-200 rounded-xl hover:bg-slate-50 transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleSave}
                disabled={saving || uploadingIndex !== null}
                className={`flex items-center gap-2 px-6 py-2.5 text-sm font-bold rounded-xl transition-colors ${
                  saved
                    ? 'bg-emerald-500 text-white'
                    : 'bg-violet-600 hover:bg-violet-700 text-white disabled:opacity-50'
                }`}
              >
                {saved
                  ? <><MdCheck className="text-[15px]" /> {isEditMode ? 'Updated!' : 'Saved!'}</>
                  : saving
                    ? 'Saving...'
                    : <><MdSave className="text-[15px]" /> {isEditMode ? 'Update Consultation' : 'Save & Complete'}</>
                }
              </button>
            </div>
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

      <style>{'@media print { body * { visibility: hidden; } #print-area, #print-area * { visibility: visible; } #print-area { position: absolute; left: 0; top: 0; width: 100%; } }'}</style>
    </>
  )
}

export default Doctor_Consultation
