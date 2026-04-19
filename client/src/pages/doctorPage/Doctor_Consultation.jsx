// client/src/pages/doctorPage/Doctor_Consultation.jsx
// UPDATED:
// - Loads existing consultation data if appointment is already completed
// - Supports editing/updating prescriptions after completion
// - Gracefully handles missing appointment state by trying query param ?id=

import { useEffect, useState } from 'react'
import { useLocation, useNavigate, useSearchParams, NavLink } from 'react-router-dom'
import { useAuth } from '../../context/AuthContext'
import {
  saveConsultation, updateConsultation,
  getConsultation, getPatientHistory, getInventoryItems,
} from '../../services/doctor.service'
import {
  MdPerson, MdFace, MdCalendarToday, MdAccessTime,
  MdAdd, MdClose, MdPrint, MdCheck, MdSave,
  MdMedicalServices, MdNotes, MdHistory, MdArrowBack,
  MdInventory2, MdLocalPharmacy, MdEdit,
} from 'react-icons/md'

// ── Helpers ───────────────────────────────────────────────────────────────────
function formatDate(raw) {
  if (!raw) return '—'
  const str = typeof raw === 'string' ? raw : String(raw)
  const ymd = str.slice(0, 10)
  const [y, m, d] = ymd.split('-').map(Number)
  if (!y || !m || !d) return str
  return new Date(y, m - 1, d).toLocaleDateString('en-PH', { month: 'short', day: 'numeric', year: 'numeric' })
}

const FREQUENCIES = ['Once daily', 'Twice daily', 'Three times daily', 'Every 8 hours', 'Every 12 hours', 'As needed (PRN)']
const DURATIONS   = ['3 days', '5 days', '7 days', '2 weeks', '1 month', '3 months', 'Ongoing']

// ── Printable Prescription ────────────────────────────────────────────────────
const PrintPrescription = ({ patient, diagnosis, prescriptions, doctorName, specialty, date }) => (
  <div id="print-area" className="hidden print:block font-sans p-8 max-w-lg mx-auto">
    <div className="text-center border-b-2 border-slate-800 pb-4 mb-4">
      <h1 className="text-xl font-bold text-slate-800 uppercase tracking-wide">Carait Medical & Dermatologic Clinics</h1>
      <p className="text-sm text-slate-600 mt-1">A. Bonifacio St., Brgy. Canlalay, Biñan, Laguna</p>
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
      <p className="text-2xl font-serif text-slate-800 mb-3">℞</p>
      {prescriptions.map((rx, i) => (
        <div key={i} className="mb-3 pl-4 border-l-2 border-slate-400">
          <p className="text-sm font-bold text-slate-800">{i + 1}. {rx.medicine}</p>
          {rx.dosage    && <p className="text-sm text-slate-600 ml-2">Dosage: {rx.dosage}</p>}
          {rx.frequency && <p className="text-sm text-slate-600 ml-2">Sig: {rx.frequency}</p>}
          {rx.duration  && <p className="text-sm text-slate-600 ml-2">Duration: {rx.duration}</p>}
          {rx.notes     && <p className="text-sm text-slate-500 ml-2 italic">{rx.notes}</p>}
        </div>
      ))}
    </div>
    <div className="mt-12 pt-4 border-t border-slate-300 flex justify-between items-end">
      <div>
        <div className="w-40 border-b border-slate-800 mb-1" />
        <p className="text-xs text-slate-600">Doctor's Signature</p>
      </div>
      <p className="text-xs text-slate-400 italic">Valid for 7 days.</p>
    </div>
  </div>
)

// ── Main ──────────────────────────────────────────────────────────────────────
const Doctor_Consultation = () => {
  const location      = useLocation()
  const navigate      = useNavigate()
  const [params]      = useSearchParams()
  const { user }      = useAuth()

  // Appointment can come from navigation state OR from a query param ?id=
  const apptFromState = location.state?.appointment
  const apptIdParam   = params.get('id')

  const [appt,           setAppt]           = useState(apptFromState || null)
  const [isEditMode,     setIsEditMode]     = useState(false) // true = editing a completed consultation
  const [initLoading,    setInitLoading]    = useState(!apptFromState && !!apptIdParam)

  const [diagnosis,      setDiagnosis]      = useState('')
  const [notes,          setNotes]          = useState('')
  const [prescriptions,  setPrescriptions]  = useState([{ medicine: '', dosage: '', frequency: '', duration: '', notes: '' }])
  const [patientHistory, setPatientHistory] = useState([])
  const [saved,          setSaved]          = useState(false)
  const [saving,         setSaving]         = useState(false)
  const [tab,            setTab]            = useState('consultation')
  const [inventoryItems, setInventoryItems] = useState([])

  const date = new Date().toLocaleDateString('en-PH', { month: 'long', day: 'numeric', year: 'numeric' })

  // ── If no state but ?id= param, load consultation from backend ────────────
  useEffect(() => {
    if (apptFromState || !apptIdParam) return
    setInitLoading(true)
    getConsultation(apptIdParam)
      .then(consult => {
        // Reconstruct a minimal appointment object from consultation data
        setAppt({
          id:           Number(apptIdParam),
          patient_id:   consult.patient_id,
          patient_name: consult.patient_name,
          patient:      consult.patient_name,
          patient_age:  consult.patient_age,
          patient_sex:  consult.patient_sex,
          patient_phone:consult.patient_phone,
          reason:       consult.reason,
          time:         consult.time,
          type:         consult.type,
          status:       'completed',
        })
        setDiagnosis(consult.diagnosis || '')
        setNotes(consult.notes || '')
        try {
          const rx = typeof consult.prescription === 'string'
            ? JSON.parse(consult.prescription)
            : consult.prescription
          if (Array.isArray(rx) && rx.length > 0) setPrescriptions(rx)
        } catch {
          // Ignore invalid stored prescription payloads and keep the default editor state.
        }
        setIsEditMode(true)
      })
      .catch(() => {})
      .finally(() => setInitLoading(false))
  }, [apptIdParam, apptFromState])

  // ── If appointment is already completed, preload existing consultation ─────
  useEffect(() => {
    if (!apptFromState) return
    if (apptFromState.status === 'completed') {
      setIsEditMode(true)
      getConsultation(apptFromState.id)
        .then(consult => {
          setDiagnosis(consult.diagnosis || '')
          setNotes(consult.notes || '')
          try {
            const rx = typeof consult.prescription === 'string'
              ? JSON.parse(consult.prescription)
              : consult.prescription
            if (Array.isArray(rx) && rx.length > 0) setPrescriptions(rx)
          } catch {
            // Ignore invalid stored prescription payloads and keep the default editor state.
          }
        })
        .catch(() => {})
    }
  }, [apptFromState])

  // ── Fetch patient history ─────────────────────────────────────────────────
  useEffect(() => {
    const pid = appt?.patient_id
    if (!pid) return
    getPatientHistory(pid)
      .then(data => setPatientHistory(Array.isArray(data) ? data : []))
      .catch(() => {})
  }, [appt?.patient_id])

  // ── Fetch inventory for medicine datalist ─────────────────────────────────
  useEffect(() => {
    getInventoryItems()
      .then(data => setInventoryItems(Array.isArray(data) ? data : []))
      .catch(() => setInventoryItems([]))
  }, [])

  // ── Derived ───────────────────────────────────────────────────────────────
  const currentPatient = appt ? {
    id:            appt.patient_id,
    name:          appt.patient_name || appt.patient,
    age:           appt.patient_age || '—',
    sex:           appt.patient_sex || '—',
    appointmentId: appt.id,
    reason:        appt.reason,
    time:          appt.time || appt.appointment_time,
    type:          appt.type || appt.clinic_type,
  } : null

  // ── Rx helpers ────────────────────────────────────────────────────────────
  const updateRx = (i, field, val) =>
    setPrescriptions(prev => prev.map((rx, idx) => idx === i ? { ...rx, [field]: val } : rx))
  const addRx    = () => setPrescriptions(prev => [...prev, { medicine: '', dosage: '', frequency: '', duration: '', notes: '' }])
  const removeRx = (i) => setPrescriptions(prev => prev.filter((_, idx) => idx !== i))

  // ── Save ──────────────────────────────────────────────────────────────────
  const handleSave = async () => {
    if (!appt) return
    setSaving(true)
    const payload = { diagnosis, notes, prescription: JSON.stringify(prescriptions) }
    try {
      if (isEditMode) {
        await updateConsultation(appt.id, payload)
      } else {
        await saveConsultation(appt.id, payload)
      }
      setSaved(true)
      if (!isEditMode) {
        setIsEditMode(true)
        setAppt(prev => prev ? { ...prev, status: 'completed' } : prev)
        setTimeout(() => setSaved(false), 2000)
      } else {
        setTimeout(() => setSaved(false), 2000)
      }
    } catch {
      alert('Failed to save consultation. Please try again.')
    } finally {
      setSaving(false)
    }
  }

  // ── No appointment ────────────────────────────────────────────────────────
  if (initLoading) {
    return (
      <div className="flex items-center justify-center h-[60vh] text-slate-400 text-sm">
        Loading consultation…
      </div>
    )
  }

  if (!appt) {
    return (
      <div className="flex flex-col items-center justify-center h-[60vh] text-center">
        <MdMedicalServices className="text-5xl text-slate-200 mb-4" />
        <h2 className="text-xl font-bold text-slate-800">No Active Consultation</h2>
        <p className="text-slate-500 mb-6">Please select a patient from your daily appointments.</p>
        <NavLink to="/doctor/daily-appointments"
          className="bg-violet-600 text-white px-6 py-2.5 rounded-xl font-bold hover:bg-violet-700 transition-colors">
          Go to Appointments
        </NavLink>
      </div>
    )
  }

  const typeLabel = currentPatient?.type === 'derma' ? 'Dermatology' : 'General Medicine'
  const TypeIcon  = currentPatient?.type === 'derma' ? MdFace : MdMedicalServices

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

        {/* Header */}
        <div className="flex items-center gap-3">
          <button onClick={() => navigate(-1)}
            className="w-9 h-9 flex items-center justify-center rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-600 transition-colors">
            <MdArrowBack className="text-[18px]" />
          </button>
          <div className="flex-1 min-w-0">
            <h1 className="text-xl font-bold text-slate-800 flex items-center gap-2">
              {isEditMode && <MdEdit className="text-violet-500 text-[18px]" />}
              {isEditMode ? 'Edit Prescription' : 'Consultation'}
              {isEditMode && (
                <span className="text-xs font-semibold bg-violet-50 text-violet-700 border border-violet-200 px-2 py-0.5 rounded-full">
                  Completed
                </span>
              )}
            </h1>
            <p className="text-sm text-slate-500 mt-0.5">{date}</p>
          </div>
          <button onClick={() => window.print()}
            className="flex items-center gap-1.5 px-3 py-2 text-xs font-bold text-slate-600 border border-slate-200 rounded-xl hover:bg-slate-50 transition-colors">
            <MdPrint className="text-[14px]" /> Print
          </button>
        </div>

        {/* Patient Info Banner */}
        <div className="bg-white rounded-2xl border border-slate-200 px-6 py-4">
          <div className="flex items-center gap-4 flex-wrap">
            <div className={`w-11 h-11 rounded-xl flex items-center justify-center shrink-0
              ${currentPatient?.type === 'derma' ? 'bg-emerald-50' : 'bg-slate-100'}`}>
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
        </div>

        {/* Tabs */}
        <div className="flex gap-1 bg-slate-100 p-1 rounded-xl w-fit">
          {[
            { key: 'consultation', label: 'Consultation', icon: MdLocalPharmacy },
            { key: 'history',      label: 'Patient History', icon: MdHistory },
          ].map((tabItem) => (
            <button key={tabItem.key} onClick={() => setTab(tabItem.key)}
              className={`flex items-center gap-1.5 px-4 py-2 rounded-lg text-xs font-bold transition-all
                ${tab === tabItem.key ? 'bg-white shadow-sm text-slate-800' : 'text-slate-500 hover:text-slate-700'}`}>
              <tabItem.icon className="text-[13px]" /> {tabItem.label}
            </button>
          ))}
        </div>

        {/* ── Consultation Tab ───────────────────────────────────────────────── */}
        {tab === 'consultation' && (
          <div className="space-y-5">

            {/* Diagnosis */}
            <div className="bg-white border border-slate-200 rounded-2xl p-6">
              <h2 className="text-sm font-bold text-slate-800 mb-4 flex items-center gap-2">
                <MdNotes className="text-violet-500 text-[16px]" /> Diagnosis & Notes
              </h2>
              <div className="space-y-4">
                <div>
                  <label className="text-xs font-bold text-slate-500 uppercase tracking-widest mb-1.5 block">Diagnosis</label>
                  <textarea
                    value={diagnosis}
                    onChange={e => setDiagnosis(e.target.value)}
                    rows={3}
                    placeholder="e.g. Acne vulgaris (mild/moderate/severe)"
                    className="w-full text-sm bg-slate-50 border-2 border-slate-200 rounded-xl px-4 py-3 focus:outline-none focus:border-violet-400 resize-none transition-colors"
                  />
                </div>
                <div>
                  <label className="text-xs font-bold text-slate-500 uppercase tracking-widest mb-1.5 block">Clinical Notes</label>
                  <textarea
                    value={notes}
                    onChange={e => setNotes(e.target.value)}
                    rows={3}
                    placeholder="Observations, findings, follow-up instructions…"
                    className="w-full text-sm bg-slate-50 border-2 border-slate-200 rounded-xl px-4 py-3 focus:outline-none focus:border-violet-400 resize-none transition-colors"
                  />
                </div>
              </div>
            </div>

            {/* Prescription */}
            <div className="bg-white border border-slate-200 rounded-2xl p-6">
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-sm font-bold text-slate-800 flex items-center gap-2">
                  <MdLocalPharmacy className="text-violet-500 text-[16px]" /> Prescriptions
                </h2>
                <button onClick={addRx}
                  className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold text-violet-600
                    bg-violet-50 border border-violet-200 hover:bg-violet-100 rounded-xl transition-colors">
                  <MdAdd className="text-[14px]" /> Add Medicine
                </button>
              </div>

              <datalist id="medicine-list-consult">
                {inventoryItems.map(item => (
                  <option key={item.id} value={item.name}>
                    {item.category} · {item.stock} {item.unit}(s) in stock
                  </option>
                ))}
              </datalist>

              <div className="space-y-4">
                {prescriptions.map((rx, i) => (
                  <div key={i} className="bg-slate-50 rounded-xl p-4 border border-slate-200 space-y-3">
                    <div className="flex items-center justify-between">
                      <p className="text-xs font-bold text-violet-600 flex items-center gap-1">
                        <MdLocalPharmacy className="text-[12px]" /> Medicine #{i + 1}
                      </p>
                      {prescriptions.length > 1 && (
                        <button onClick={() => removeRx(i)}
                          className="w-6 h-6 flex items-center justify-center rounded-lg hover:bg-red-50 text-slate-300 hover:text-red-400 transition-colors">
                          <MdClose className="text-[13px]" />
                        </button>
                      )}
                    </div>

                    {/* Medicine name */}
                    <div>
                      <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-1 block">Medicine</label>
                      <input
                        type="text"
                        list="medicine-list-consult"
                        value={rx.medicine}
                        onChange={e => updateRx(i, 'medicine', e.target.value)}
                        placeholder="Type or select from inventory…"
                        className="w-full text-sm p-2.5 rounded-lg border border-slate-200 bg-white focus:outline-none focus:border-violet-400 transition-colors"
                      />
                      {/* Stock hint */}
                      {rx.medicine && (() => {
                        const found = inventoryItems.find(
                          item => item.name.toLowerCase() === rx.medicine.toLowerCase()
                        )
                        return found ? (
                          <p className={`text-[10px] mt-1 flex items-center gap-1 font-medium
                            ${found.stock <= (found.threshold || 5) ? 'text-red-500' : 'text-emerald-600'}`}>
                            <MdInventory2 className="text-[11px]" />
                            {found.stock} {found.unit}(s) in stock
                            {found.stock <= (found.threshold || 5) && ' — Low stock!'}
                          </p>
                        ) : null
                      })()}
                    </div>

                    <div className="grid grid-cols-2 gap-2">
                      <div>
                        <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-1 block">Dosage</label>
                        <input type="text" value={rx.dosage}
                          onChange={e => updateRx(i, 'dosage', e.target.value)}
                          placeholder="e.g. 1 tablet"
                          className="w-full text-sm p-2 rounded-lg border border-slate-200 bg-white focus:outline-none focus:border-violet-400"
                        />
                      </div>
                      <div>
                        <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-1 block">Frequency</label>
                        <select value={rx.frequency} onChange={e => updateRx(i, 'frequency', e.target.value)}
                          className="w-full text-sm p-2 rounded-lg border border-slate-200 bg-white focus:outline-none focus:border-violet-400">
                          <option value="">Select…</option>
                          {FREQUENCIES.map(f => <option key={f}>{f}</option>)}
                        </select>
                      </div>
                      <div>
                        <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-1 block">Duration</label>
                        <select value={rx.duration} onChange={e => updateRx(i, 'duration', e.target.value)}
                          className="w-full text-sm p-2 rounded-lg border border-slate-200 bg-white focus:outline-none focus:border-violet-400">
                          <option value="">Select…</option>
                          {DURATIONS.map(d => <option key={d}>{d}</option>)}
                        </select>
                      </div>
                      <div>
                        <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-1 block">Notes</label>
                        <input type="text" value={rx.notes}
                          onChange={e => updateRx(i, 'notes', e.target.value)}
                          placeholder="e.g. Take after meals"
                          className="w-full text-sm p-2 rounded-lg border border-slate-200 bg-white focus:outline-none focus:border-violet-400"
                        />
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Save Button */}
            <div className="flex items-center justify-end gap-3">
              <button onClick={() => navigate(-1)}
                className="px-5 py-2.5 text-sm font-semibold text-slate-600 border border-slate-200 rounded-xl hover:bg-slate-50 transition-colors">
                Cancel
              </button>
              <button onClick={handleSave} disabled={saving}
                className={`flex items-center gap-2 px-6 py-2.5 text-sm font-bold rounded-xl transition-colors
                  ${saved
                    ? 'bg-emerald-500 text-white'
                    : 'bg-violet-600 hover:bg-violet-700 text-white disabled:opacity-50'}`}>
                {saved
                  ? <><MdCheck className="text-[15px]" /> {isEditMode ? 'Updated!' : 'Saved!'}</>
                  : saving
                    ? 'Saving…'
                    : <><MdSave className="text-[15px]" /> {isEditMode ? 'Update Prescription' : 'Save & Complete'}</>
                }
              </button>
            </div>
          </div>
        )}

        {/* ── History Tab ───────────────────────────────────────────────────── */}
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
              <div className="space-y-3">
                {patientHistory.map((h, i) => (
                  <div key={i} className="bg-slate-50 p-4 rounded-xl border border-slate-100">
                    <div className="flex items-center justify-between gap-2 mb-1.5">
                      <p className="text-xs font-bold text-slate-500 flex items-center gap-1.5">
                        <MdCalendarToday className="text-[12px]" />
                        {formatDate(h.date)} &nbsp;·&nbsp;
                        <MdAccessTime className="text-[12px]" />
                        {h.time || '—'}
                      </p>
                      <span className={`text-[10px] font-bold border px-2 py-0.5 rounded-full
                        ${h.status === 'cancelled'
                          ? 'bg-red-50 text-red-500 border-red-200'
                          : 'bg-slate-100 text-slate-500 border-slate-200'
                        }`}>
                        {h.status === 'cancelled' ? 'Cancelled' : 'Completed'}
                      </span>
                    </div>
                    {h.status !== 'cancelled' && (
                      <>
                        {h.diagnosis && (
                          <p className="text-sm font-semibold text-slate-800 mb-1">{h.diagnosis}</p>
                        )}
                        {h.consultation_notes && (
                          <p className="text-xs text-slate-500 leading-relaxed">{h.consultation_notes}</p>
                        )}
                        {h.prescription && (() => {
                          try {
                            const rx = JSON.parse(h.prescription)
                            if (!Array.isArray(rx) || rx.length === 0) return null
                            return (
                              <div className="mt-2">
                                <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-1">Rx</p>
                                {rx.map((r, j) => (
                                  <p key={j} className="text-xs text-slate-600">· {r.medicine} {r.dosage && `— ${r.dosage}`} {r.frequency && `(${r.frequency})`}</p>
                                ))}
                              </div>
                            )
                          } catch { return null }
                        })()}
                        {!h.diagnosis && !h.consultation_notes && (
                          <p className="text-xs text-slate-400 italic">No notes recorded.</p>
                        )}
                      </>
                    )}
                    {h.reason && (
                      <p className="text-[11px] text-slate-400 mt-1.5">Reason: {h.reason}</p>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

      </div>

      <style>{`@media print { body * { visibility: hidden; } #print-area, #print-area * { visibility: visible; } #print-area { position: absolute; left: 0; top: 0; width: 100%; } }`}</style>
    </>
  )
}

export default Doctor_Consultation
