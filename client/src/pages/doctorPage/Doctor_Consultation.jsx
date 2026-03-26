import { useEffect, useState } from 'react'
import { useLocation, useNavigate, NavLink } from 'react-router-dom'
import { useAuth } from '../../context/AuthContext'
import { saveConsultation, getPatientHistory } from '../../services/doctor.service'
import {
  MdPerson, MdFace, MdCalendarToday, MdAccessTime,
  MdAdd, MdClose, MdPrint, MdCheck, MdSave,
  MdMedicalServices, MdNotes, MdHistory, MdArrowBack
} from "react-icons/md"

const MEDICINE_LIST = [
  "Tretinoin 0.025% Cream", "Clindamycin Gel 1%", "Hydroquinone 2% Cream",
  "Sunscreen SPF 50", "Amoxicillin 500mg", "Amlodipine 5mg",
  "Paracetamol 500mg", "Cetirizine 10mg", "Metformin 500mg",
]

const FREQUENCIES = ["Once daily", "Twice daily", "Three times daily", "Every 8 hours", "Every 12 hours", "As needed (PRN)"]
const DURATIONS   = ["3 days", "5 days", "7 days", "2 weeks", "1 month", "3 months", "Ongoing"]

// ── Printable Prescription ────────────────────────────────────────────────────
const PrintPrescription = ({ patient, diagnosis, prescriptions, doctorName, specialty, date }) => (
  <div id="print-area" className="hidden print:block font-sans p-8 max-w-lg mx-auto">
    <div className="text-center border-b-2 border-slate-800 pb-4 mb-4">
      <h1 className="text-xl font-bold text-slate-800 uppercase tracking-wide">Carait Medical & Dermatologic Clinics</h1>
      <p className="text-sm text-slate-600 mt-1">Clinic Building, Manila · (02) 8123-4567</p>
      <div className="mt-3">
        <p className="text-base font-bold text-slate-800">{doctorName}</p>
        <p className="text-sm text-slate-600">{specialty} · PRC Lic. No. 0012345</p>
      </div>
    </div>

    <div className="grid grid-cols-2 gap-4 mb-4 text-sm">
      <div><span className="text-slate-500">Name:</span> <strong>{patient?.name}</strong></div>
      <div><span className="text-slate-500">Age/Sex:</span> <strong>{patient?.age} / {patient?.sex}</strong></div>
      <div><span className="text-slate-500">Date:</span> <strong>{date}</strong></div>
      <div><span className="text-slate-500">Appt:</span> <strong>{patient?.appointmentId}</strong></div>
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

const Doctor_Consultation = () => {
  const location = useLocation()
  const navigate = useNavigate()
  const { user } = useAuth()
  const appt = location.state?.appointment

  const [diagnosis, setDiagnosis] = useState("")
  const [notes, setNotes] = useState("")
  const [prescriptions, setPrescriptions] = useState([{ medicine: "", dosage: "", frequency: "", duration: "", notes: "" }])
  const [patientHistory, setPatientHistory] = useState([])
  const [saved, setSaved] = useState(false)
  const [tab, setTab] = useState("consultation")

  const date = new Date().toLocaleDateString("en-PH", { month: "long", day: "numeric", year: "numeric" })

  // Derived patient data
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

  useEffect(() => {
    if (!appt?.patient_id) return
    getPatientHistory(appt.patient_id)
      .then(data => setPatientHistory(data))
      .catch(() => {})
  }, [appt?.patient_id])

  if (!appt) {
    return (
      <div className="flex flex-col items-center justify-center h-[60vh] text-center">
        <MdMedicalServices className="text-5xl text-slate-200 mb-4" />
        <h2 className="text-xl font-bold text-slate-800">No Active Consultation</h2>
        <p className="text-slate-500 mb-6">Please select a patient from your daily appointments.</p>
        <NavLink to="/doctor/daily-appointments" className="bg-violet-600 text-white px-6 py-2 rounded-xl font-bold">Go to Appointments</NavLink>
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

  const addRx = () => setPrescriptions(p => [...p, { medicine: "", dosage: "", frequency: "", duration: "", notes: "" }])
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
              {saved ? <><MdCheck className="text-[15px]" /> Saved!</> : <><MdSave className="text-[15px]" /> Save Consultation</>}
            </button>
          </div>
        </div>

        <div className="bg-white border border-slate-200 rounded-2xl p-5 flex items-center gap-4 shadow-sm">
          <div className="w-12 h-12 rounded-xl bg-violet-600 flex items-center justify-center text-white font-bold shrink-0">
            {currentPatient.name.charAt(0)}
          </div>
          <div className="flex-1">
            <div className="flex items-center gap-2">
              <p className="text-base font-bold text-slate-800">{currentPatient.name}</p>
              <span className="text-[11px] font-bold bg-violet-50 text-violet-700 px-2 py-0.5 rounded-full border border-violet-100">In Progress</span>
            </div>
            <p className="text-sm text-slate-500 mt-0.5">{currentPatient.age} yrs · {currentPatient.sex} · {currentPatient.reason}</p>
          </div>
        </div>

        <div className="flex gap-1 bg-white border border-slate-200 rounded-xl p-1 w-fit">
          {[{ key: "consultation", label: "Consultation", icon: MdMedicalServices }, { key: "history", label: "Patient History", icon: MdHistory }].map(({ key, label, icon: Icon }) => (
            <button key={key} onClick={() => setTab(key)}
              className={`flex items-center gap-1.5 px-4 py-2 rounded-lg text-xs font-bold transition-all ${tab === key ? "bg-[#0b1a2c] text-violet-400 shadow-sm" : "text-slate-500"}`}>
              <Icon className="text-[14px]" /> {label}
            </button>
          ))}
        </div>

        {tab === "consultation" ? (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
            <div className="bg-white border border-slate-200 rounded-2xl p-5 space-y-4">
              <h2 className="text-sm font-bold text-slate-800">Diagnosis & Notes</h2>
              <textarea value={diagnosis} onChange={e => setDiagnosis(e.target.value)} rows={4} placeholder="Diagnosis..." className="w-full text-sm bg-slate-50 border-2 border-slate-100 rounded-xl px-4 py-3 focus:border-violet-400 outline-none" />
              <textarea value={notes} onChange={e => setNotes(e.target.value)} rows={3} placeholder="Doctor's notes..." className="w-full text-sm bg-slate-50 border-2 border-slate-100 rounded-xl px-4 py-3 focus:border-violet-400 outline-none" />
            </div>

            <div className="bg-white border border-slate-200 rounded-2xl p-5 space-y-4">
              <div className="flex justify-between items-center">
                <h2 className="text-sm font-bold text-slate-800">℞ Prescription</h2>
                <button onClick={addRx} className="text-xs font-bold text-violet-600 flex items-center gap-1"><MdAdd /> Add</button>
              </div>
              <div className="space-y-4 overflow-y-auto max-h-[400px]">
                {prescriptions.map((rx, i) => (
                  <div key={i} className="bg-slate-50 p-4 rounded-xl border border-slate-100 relative">
                    {prescriptions.length > 1 && <button onClick={() => removeRx(i)} className="absolute top-2 right-2 text-slate-400 hover:text-red-500"><MdClose /></button>}
                    <input list="meds" value={rx.medicine} onChange={e => updateRx(i, "medicine", e.target.value)} placeholder="Medicine" className="w-full text-sm p-2 mb-2 rounded border border-slate-200" />
                    <datalist id="meds">{MEDICINE_LIST.map(m => <option key={m} value={m} />)}</datalist>
                    <div className="grid grid-cols-2 gap-2">
                      <input type="text" value={rx.dosage} onChange={e => updateRx(i, "dosage", e.target.value)} placeholder="Dosage" className="text-sm p-2 rounded border border-slate-200" />
                      <select value={rx.frequency} onChange={e => updateRx(i, "frequency", e.target.value)} className="text-sm p-2 rounded border border-slate-200">
                        <option value="">Frequency</option>
                        {FREQUENCIES.map(f => <option key={f}>{f}</option>)}
                      </select>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        ) : (
          <div className="bg-white border border-slate-200 rounded-2xl p-6">
            {patientHistory.length === 0 ? (
              <div className="py-12 text-center text-slate-400 text-sm">No previous visits recorded.</div>
            ) : (
              <div className="space-y-4">
                {patientHistory.map((h, i) => (
                  <div key={i} className="bg-slate-50 p-4 rounded-xl border border-slate-100">
                    <p className="text-sm font-bold text-slate-800">{h.date} · {h.diagnosis}</p>
                    <p className="text-xs text-slate-500 mt-1">{h.notes}</p>
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