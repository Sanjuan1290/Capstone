// client/src/pages/doctorPage/Doctor_Consultation.jsx
// FIX 1: Patient history now shows a properly formatted date (e.g. "Mar 29, 2026")
//         instead of the raw ISO string "2026-03-28T16:00:00.000Z".
// FIX 2: ℞ Prescription medicine list is now pulled from the real inventory
//         instead of a hardcoded static array.
// FIX 3: Reload-logout is fixed globally in AuthContext.jsx (Prompt 1).

import { useEffect, useState } from 'react'
import { useLocation, useNavigate, NavLink } from 'react-router-dom'
import { useAuth } from '../../context/AuthContext'
import { saveConsultation, getPatientHistory, getInventoryItems } from '../../services/doctor.service'
import {
  MdPerson, MdFace, MdCalendarToday, MdAccessTime,
  MdAdd, MdClose, MdPrint, MdCheck, MdSave,
  MdMedicalServices, MdNotes, MdHistory, MdArrowBack,
  MdInventory2, MdLocalPharmacy,
} from "react-icons/md"

// ── Helpers ───────────────────────────────────────────────────────────────────
// FIX 1: Safe date formatter — handles both 'YYYY-MM-DD' strings and
// any ISO timestamp (just takes the first 10 chars, avoids UTC-shift).
function formatDate(raw) {
  if (!raw) return '—'
  const str = typeof raw === 'string' ? raw : String(raw)
  const ymd = str.slice(0, 10)               // "2026-03-28"
  const [y, m, d] = ymd.split('-').map(Number)
  if (!y || !m || !d) return str
  return new Date(y, m - 1, d).toLocaleDateString('en-PH', {
    month: 'short', day: 'numeric', year: 'numeric',
  })
}

const FREQUENCIES = ["Once daily", "Twice daily", "Three times daily", "Every 8 hours", "Every 12 hours", "As needed (PRN)"]
const DURATIONS   = ["3 days", "5 days", "7 days", "2 weeks", "1 month", "3 months", "Ongoing"]

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
  const location = useLocation()
  const navigate = useNavigate()
  const { user } = useAuth()
  const appt = location.state?.appointment

  const [diagnosis,      setDiagnosis]      = useState("")
  const [notes,          setNotes]          = useState("")
  const [prescriptions,  setPrescriptions]  = useState([{ medicine: "", dosage: "", frequency: "", duration: "", notes: "" }])
  const [patientHistory, setPatientHistory] = useState([])
  const [saved,          setSaved]          = useState(false)
  const [tab,            setTab]            = useState("consultation")

  // FIX 2: Inventory-backed medicine list
  const [inventoryItems,   setInventoryItems]   = useState([])
  const [inventoryLoading, setInventoryLoading] = useState(true)

  const date = new Date().toLocaleDateString("en-PH", { month: "long", day: "numeric", year: "numeric" })

  // Derived patient data
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

  // Fetch patient history
  useEffect(() => {
    if (!appt?.patient_id) return
    getPatientHistory(appt.patient_id)
      .then(data => setPatientHistory(Array.isArray(data) ? data : []))
      .catch(() => {})
  }, [appt?.patient_id])

  // FIX 2: Fetch inventory items for the medicine datalist
  useEffect(() => {
    getInventoryItems()
      .then(data => setInventoryItems(Array.isArray(data) ? data : []))
      .catch(() => setInventoryItems([]))
      .finally(() => setInventoryLoading(false))
  }, [])

  if (!appt) {
    return (
      <div className="flex flex-col items-center justify-center h-[60vh] text-center">
        <MdMedicalServices className="text-5xl text-slate-200 mb-4" />
        <h2 className="text-xl font-bold text-slate-800">No Active Consultation</h2>
        <p className="text-slate-500 mb-6">Please select a patient from your daily appointments.</p>
        <NavLink to="/doctor/daily-appointments" className="bg-violet-600 text-white px-6 py-2 rounded-xl font-bold">
          Go to Appointments
        </NavLink>
      </div>
    )
  }

  const handleSave = async () => {
    if (!diagnosis.trim()) { alert('Diagnosis is required.'); return }
    try {
      await saveConsultation(appt.id, {
        diagnosis,
        notes,
        prescription: JSON.stringify(prescriptions.filter(rx => rx.medicine)),
      })
      setSaved(true)
      setTimeout(() => setSaved(false), 2000)
    } catch (err) {
      alert(err.message || 'Failed to save.')
    }
  }

  const addRx    = () => setPrescriptions(p => [...p, { medicine: "", dosage: "", frequency: "", duration: "", notes: "" }])
  const removeRx = i => setPrescriptions(p => p.filter((_, idx) => idx !== i))
  const updateRx = (i, field, val) => setPrescriptions(p => p.map((rx, idx) => idx === i ? { ...rx, [field]: val } : rx))
  const filledRx = prescriptions.filter(rx => rx.medicine)

  return (
    <>
      <PrintPrescription
        patient={currentPatient}
        diagnosis={diagnosis}
        prescriptions={filledRx}
        doctorName={user?.full_name}
        specialty={user?.specialty || "Specialist"}
        date={date}
      />

      <div className="max-w-4xl space-y-5 print:hidden">

        {/* Header */}
        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div className="flex items-center gap-3">
            <button onClick={() => navigate(-1)}
              className="w-9 h-9 flex items-center justify-center rounded-xl border border-slate-200 hover:bg-slate-100 text-slate-500 transition-colors">
              <MdArrowBack className="text-[18px]" />
            </button>
            <div>
              <h1 className="text-2xl font-bold text-slate-800">Consultation</h1>
              <p className="text-sm text-slate-500 mt-0.5">{date} · {currentPatient.time}</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button onClick={() => window.print()} disabled={filledRx.length === 0}
              className="flex items-center gap-1.5 border border-slate-200 hover:bg-slate-50 text-slate-700 text-xs font-semibold px-4 py-2.5 rounded-xl transition-colors disabled:opacity-40">
              <MdPrint className="text-[15px]" /> Print Prescription
            </button>
            <button onClick={handleSave}
              className="flex items-center gap-1.5 bg-[#0b1a2c] hover:bg-[#122236] text-white text-xs font-semibold px-4 py-2.5 rounded-xl transition-colors">
              {saved
                ? <><MdCheck className="text-[15px]" /> Saved!</>
                : <><MdSave className="text-[15px]" /> Save Consultation</>
              }
            </button>
          </div>
        </div>

        {/* Patient chip */}
        <div className="bg-white border border-slate-200 rounded-2xl p-5 flex items-center gap-4 shadow-sm">
          <div className="w-12 h-12 rounded-xl bg-violet-600 flex items-center justify-center text-white font-bold shrink-0">
            {currentPatient.name.charAt(0)}
          </div>
          <div className="flex-1">
            <div className="flex items-center gap-2 flex-wrap">
              <p className="text-base font-bold text-slate-800">{currentPatient.name}</p>
              <span className="text-[11px] font-bold bg-violet-50 text-violet-700 px-2 py-0.5 rounded-full border border-violet-100">
                In Progress
              </span>
            </div>
            <p className="text-sm text-slate-500 mt-0.5">
              {currentPatient.age} yrs · {currentPatient.sex} · {currentPatient.reason}
            </p>
          </div>
        </div>

        {/* Tab switcher */}
        <div className="flex gap-1 bg-white border border-slate-200 rounded-xl p-1 w-fit">
          {[
            { key: "consultation", label: "Consultation", icon: MdMedicalServices },
            { key: "history",      label: "Patient History", icon: MdHistory      },
          ].map(({ key, label, icon: Icon }) => (
            <button key={key} onClick={() => setTab(key)}
              className={`flex items-center gap-1.5 px-4 py-2 rounded-lg text-xs font-bold transition-all
                ${tab === key ? "bg-[#0b1a2c] text-violet-400 shadow-sm" : "text-slate-500"}`}>
              <Icon className="text-[14px]" /> {label}
            </button>
          ))}
        </div>

        {/* ── Consultation Tab ─────────────────────────────────────────────── */}
        {tab === "consultation" && (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">

            {/* Diagnosis & Notes */}
            <div className="bg-white border border-slate-200 rounded-2xl p-5 space-y-4">
              <h2 className="text-sm font-bold text-slate-800">Diagnosis & Notes</h2>
              <div>
                <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-1.5 block">
                  Diagnosis <span className="text-red-400">*</span>
                </label>
                <textarea
                  value={diagnosis}
                  onChange={e => setDiagnosis(e.target.value)}
                  rows={4}
                  placeholder="Enter diagnosis…"
                  className="w-full text-sm bg-slate-50 border-2 border-slate-100 rounded-xl px-4 py-3 focus:border-violet-400 outline-none resize-none"
                />
              </div>
              <div>
                <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-1.5 block">
                  Doctor's Notes
                </label>
                <textarea
                  value={notes}
                  onChange={e => setNotes(e.target.value)}
                  rows={3}
                  placeholder="Additional notes…"
                  className="w-full text-sm bg-slate-50 border-2 border-slate-100 rounded-xl px-4 py-3 focus:border-violet-400 outline-none resize-none"
                />
              </div>
            </div>

            {/* ℞ Prescription — FIX 2: connected to inventory */}
            <div className="bg-white border border-slate-200 rounded-2xl p-5 space-y-4">
              <div className="flex justify-between items-center">
                <div>
                  <h2 className="text-sm font-bold text-slate-800">℞ Prescription</h2>
                  {/* Show how many inventory items are loaded */}
                  {!inventoryLoading && (
                    <p className="text-[10px] text-slate-400 mt-0.5 flex items-center gap-1">
                      <MdInventory2 className="text-[11px]" />
                      {inventoryItems.length} items from inventory
                    </p>
                  )}
                </div>
                <button onClick={addRx}
                  className="text-xs font-bold text-violet-600 flex items-center gap-1 hover:text-violet-700">
                  <MdAdd className="text-[15px]" /> Add
                </button>
              </div>

              <div className="space-y-4 overflow-y-auto max-h-[420px] pr-1">
                {prescriptions.map((rx, i) => (
                  <div key={i} className="bg-slate-50 p-4 rounded-xl border border-slate-100 relative">
                    {prescriptions.length > 1 && (
                      <button onClick={() => removeRx(i)}
                        className="absolute top-2 right-2 text-slate-400 hover:text-red-500 transition-colors">
                        <MdClose className="text-[15px]" />
                      </button>
                    )}

                    {/* FIX 2: Medicine input backed by inventory datalist */}
                    <div className="mb-2">
                      <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-1 block">
                        Medicine
                      </label>
                      <div className="relative">
                        <MdLocalPharmacy className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400 text-[14px]" />
                        <input
                          list={`meds-list-${i}`}
                          value={rx.medicine}
                          onChange={e => updateRx(i, "medicine", e.target.value)}
                          placeholder={inventoryLoading ? "Loading inventory…" : "Search or type medicine…"}
                          className="w-full text-sm pl-8 pr-3 py-2 rounded-lg border border-slate-200 bg-white focus:outline-none focus:border-violet-400 transition-colors"
                        />
                        {/* FIX 2: Populated from inventory */}
                        <datalist id={`meds-list-${i}`}>
                          {inventoryItems.map(item => (
                            <option key={item.id} value={item.name}>
                              {item.category} · {item.stock} {item.unit}(s) in stock
                            </option>
                          ))}
                        </datalist>
                      </div>
                      {/* Stock hint — show stock level for selected medicine */}
                      {rx.medicine && (() => {
                        const found = inventoryItems.find(
                          item => item.name.toLowerCase() === rx.medicine.toLowerCase()
                        )
                        return found ? (
                          <p className={`text-[10px] mt-1 flex items-center gap-1 font-medium
                            ${found.stock <= (found.threshold || 5) ? "text-red-500" : "text-emerald-600"}`}>
                            <MdInventory2 className="text-[11px]" />
                            {found.stock} {found.unit}(s) in stock
                            {found.stock <= (found.threshold || 5) && " — Low stock!"}
                          </p>
                        ) : null
                      })()}
                    </div>

                    <div className="grid grid-cols-2 gap-2">
                      <div>
                        <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-1 block">Dosage</label>
                        <input
                          type="text"
                          value={rx.dosage}
                          onChange={e => updateRx(i, "dosage", e.target.value)}
                          placeholder="e.g. 1 tablet"
                          className="w-full text-sm p-2 rounded-lg border border-slate-200 bg-white focus:outline-none focus:border-violet-400 transition-colors"
                        />
                      </div>
                      <div>
                        <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-1 block">Frequency</label>
                        <select
                          value={rx.frequency}
                          onChange={e => updateRx(i, "frequency", e.target.value)}
                          className="w-full text-sm p-2 rounded-lg border border-slate-200 bg-white focus:outline-none focus:border-violet-400 transition-colors">
                          <option value="">Select…</option>
                          {FREQUENCIES.map(f => <option key={f}>{f}</option>)}
                        </select>
                      </div>
                      <div>
                        <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-1 block">Duration</label>
                        <select
                          value={rx.duration}
                          onChange={e => updateRx(i, "duration", e.target.value)}
                          className="w-full text-sm p-2 rounded-lg border border-slate-200 bg-white focus:outline-none focus:border-violet-400 transition-colors">
                          <option value="">Select…</option>
                          {DURATIONS.map(d => <option key={d}>{d}</option>)}
                        </select>
                      </div>
                      <div>
                        <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-1 block">Notes</label>
                        <input
                          type="text"
                          value={rx.notes}
                          onChange={e => updateRx(i, "notes", e.target.value)}
                          placeholder="e.g. Take after meals"
                          className="w-full text-sm p-2 rounded-lg border border-slate-200 bg-white focus:outline-none focus:border-violet-400 transition-colors"
                        />
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* ── History Tab ──────────────────────────────────────────────────── */}
        {tab === "history" && (
          <div className="bg-white border border-slate-200 rounded-2xl p-6">
            <h2 className="text-sm font-bold text-slate-800 mb-4 flex items-center gap-2">
              <MdHistory className="text-violet-500 text-[16px]" />
              Previous Visits
            </h2>
            {patientHistory.length === 0 ? (
              <div className="py-12 text-center text-slate-400 text-sm">
                No previous visits recorded for this patient.
              </div>
            ) : (
              <div className="space-y-3">
                {patientHistory.map((h, i) => (
                  <div key={i} className="bg-slate-50 p-4 rounded-xl border border-slate-100">
                    {/* FIX 1: formatDate instead of raw h.date */}
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
                          <p className="text-sm font-semibold text-slate-800 mb-1">
                            {h.diagnosis}
                          </p>
                        )}
                        {h.consultation_notes && (
                          <p className="text-xs text-slate-500 leading-relaxed">
                            {h.consultation_notes}
                          </p>
                        )}
                        {!h.diagnosis && !h.consultation_notes && (
                          <p className="text-xs text-slate-400 italic">No notes recorded.</p>
                        )}
                      </>
                    )}

                    {h.reason && (
                      <p className="text-[11px] text-slate-400 mt-1.5">
                        Reason: {h.reason}
                      </p>
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