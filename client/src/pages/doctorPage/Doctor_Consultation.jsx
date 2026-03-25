import { useState, useRef } from "react"
import {
  MdPerson, MdFace, MdCalendarToday, MdAccessTime,
  MdAdd, MdClose, MdPrint, MdCheck, MdSave,
  MdMedicalServices, MdNotes, MdHistory, MdArrowBack
} from "react-icons/md"
import { NavLink } from "react-router-dom"

// ── Mock current patient in consultation ──────────────────────────────────────
const currentPatient = {
  id: "PAT-005", name: "Rosa Reyes", age: 24, sex: "Female",
  appointmentId: "APT-003", reason: "Initial Skin Assessment",
  time: "10:00 AM", type: "derma",
  history: [
    // First visit — no prior history
  ],
}

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
    {/* Clinic header */}
    <div className="text-center border-b-2 border-slate-800 pb-4 mb-4">
      <h1 className="text-xl font-bold text-slate-800 uppercase tracking-wide">Carait Medical & Dermatologic Clinics</h1>
      <p className="text-sm text-slate-600 mt-1">2F Dela Rosa Bldg., Quezon City · (02) 8123-4567</p>
      <div className="mt-3">
        <p className="text-base font-bold text-slate-800">{doctorName}</p>
        <p className="text-sm text-slate-600">{specialty} · PRC Lic. No. 0012345</p>
      </div>
    </div>

    {/* Patient info */}
    <div className="grid grid-cols-2 gap-4 mb-4 text-sm">
      <div><span className="text-slate-500">Name:</span> <strong>{patient.name}</strong></div>
      <div><span className="text-slate-500">Age/Sex:</span> <strong>{patient.age} / {patient.sex}</strong></div>
      <div><span className="text-slate-500">Date:</span> <strong>{date}</strong></div>
      <div><span className="text-slate-500">Appt:</span> <strong>{patient.appointmentId}</strong></div>
    </div>

    {/* Diagnosis */}
    {diagnosis && (
      <div className="mb-4 p-3 border border-slate-300 rounded">
        <p className="text-xs font-bold text-slate-500 uppercase mb-1">Diagnosis</p>
        <p className="text-sm text-slate-800">{diagnosis}</p>
      </div>
    )}

    {/* Rx */}
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

    {/* Footer */}
    <div className="mt-12 pt-4 border-t border-slate-300 flex justify-between items-end">
      <div>
        <div className="w-40 border-b border-slate-800 mb-1" />
        <p className="text-xs text-slate-600">Doctor's Signature</p>
      </div>
      <p className="text-xs text-slate-400">This prescription is valid for 7 days from date issued.</p>
    </div>
  </div>
)

// ── Main ──────────────────────────────────────────────────────────────────────
const Doctor_Consultation = () => {
  const [diagnosis,     setDiagnosis]     = useState("")
  const [notes,         setNotes]         = useState("")
  const [prescriptions, setPrescriptions] = useState([
    { medicine: "", dosage: "", frequency: "", duration: "", notes: "" }
  ])
  const [saved,   setSaved]   = useState(false)
  const [tab,     setTab]     = useState("consultation") // consultation | history

  const date = new Date().toLocaleDateString("en-PH", { month: "long", day: "numeric", year: "numeric" })

  const addRx = () => setPrescriptions(p => [...p, { medicine: "", dosage: "", frequency: "", duration: "", notes: "" }])
  const removeRx = i => setPrescriptions(p => p.filter((_, idx) => idx !== i))
  const updateRx = (i, field, val) =>
    setPrescriptions(p => p.map((rx, idx) => idx === i ? { ...rx, [field]: val } : rx))

  const handleSave = () => { setSaved(true); setTimeout(() => setSaved(false), 2000) }
  const handlePrint = () => window.print()

  const filledRx = prescriptions.filter(rx => rx.medicine)

  return (
    <>
      {/* Printable prescription — hidden on screen, visible on print */}
      <PrintPrescription
        patient={currentPatient}
        diagnosis={diagnosis}
        prescriptions={filledRx}
        doctorName="Dr. Maria Santos"
        specialty="Dermatologist"
        date={date}
      />

      {/* Main UI — hidden on print */}
      <div className="max-w-4xl space-y-5 print:hidden">

        {/* Header */}
        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div className="flex items-center gap-3">
            <NavLink to="/doctor/daily-appointments"
              className="w-9 h-9 flex items-center justify-center rounded-xl border border-slate-200 hover:bg-slate-100 text-slate-500 transition-colors shrink-0">
              <MdArrowBack className="text-[18px]" />
            </NavLink>
            <div>
              <h1 className="text-2xl font-bold text-slate-800">Consultation</h1>
              <p className="text-sm text-slate-500 mt-0.5">{date} · {currentPatient.time}</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button onClick={handlePrint} disabled={filledRx.length === 0}
              className="flex items-center gap-1.5 border border-slate-200 hover:bg-slate-50 text-slate-700
                text-xs font-semibold px-4 py-2.5 rounded-xl transition-colors disabled:opacity-40 disabled:cursor-not-allowed">
              <MdPrint className="text-[15px]" /> Print Prescription
            </button>
            <button onClick={handleSave}
              className="flex items-center gap-1.5 bg-[#0b1a2c] hover:bg-[#122236] text-white
                text-xs font-semibold px-4 py-2.5 rounded-xl transition-colors">
              {saved ? <><MdCheck className="text-[15px]" /> Saved!</> : <><MdSave className="text-[15px]" /> Save Consultation</>}
            </button>
          </div>
        </div>

        {/* Patient card */}
        <div className="bg-white border border-slate-200 rounded-2xl p-5 flex items-center gap-4">
          <div className="w-12 h-12 rounded-xl bg-[#0b1a2c] flex items-center justify-center text-violet-400 font-bold shrink-0">
            {currentPatient.name.split(" ").map(n => n[0]).join("").slice(0,2)}
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <p className="text-base font-bold text-slate-800">{currentPatient.name}</p>
              <span className="text-[10px] font-mono text-slate-400 bg-slate-100 px-2 py-0.5 rounded-md">{currentPatient.id}</span>
              <span className="text-[11px] font-bold bg-violet-50 text-violet-700 border border-violet-200 px-2.5 py-0.5 rounded-full">
                In Progress
              </span>
            </div>
            <p className="text-sm text-slate-500 mt-0.5">{currentPatient.age} yrs · {currentPatient.sex} · {currentPatient.reason}</p>
          </div>
          <div className="text-right shrink-0">
            <p className="text-xs font-mono text-slate-400">{currentPatient.appointmentId}</p>
            <p className="text-[11px] text-slate-400 mt-0.5">{currentPatient.time}</p>
          </div>
        </div>

        {/* Tabs */}
        <div className="flex gap-1 bg-white border border-slate-200 rounded-xl p-1 w-fit">
          {[
            { key: "consultation", label: "Consultation", icon: MdMedicalServices },
            { key: "history",      label: "Patient History", icon: MdHistory      },
          ].map(({ key, label, icon: Icon }) => (
            <button key={key} onClick={() => setTab(key)}
              className={`flex items-center gap-1.5 px-4 py-2 rounded-lg text-xs font-bold transition-all
                ${tab === key ? "bg-[#0b1a2c] text-violet-400 shadow-sm" : "text-slate-500 hover:text-slate-700"}`}>
              <Icon className="text-[14px]" /> {label}
            </button>
          ))}
        </div>

        {tab === "consultation" && (
          <div className="grid grid-cols-1 lg:grid-cols-[1fr_1fr] gap-5">

            {/* Left — Diagnosis & Notes */}
            <div className="space-y-4">
              <div className="bg-white border border-slate-200 rounded-2xl p-5 space-y-4">
                <h2 className="text-sm font-bold text-slate-800">Diagnosis & Notes</h2>
                <div>
                  <label className="text-xs font-bold text-slate-500 uppercase tracking-widest mb-1.5 block">
                    Diagnosis <span className="text-red-400">*</span>
                  </label>
                  <textarea value={diagnosis} onChange={e => setDiagnosis(e.target.value)}
                    rows={4} placeholder="e.g. Mild acne vulgaris with post-inflammatory hyperpigmentation."
                    className="w-full text-sm text-slate-700 placeholder-slate-300 bg-slate-50 border-2 border-slate-200
                      rounded-xl px-4 py-3 focus:outline-none focus:border-violet-400 transition-colors resize-none" />
                </div>
                <div>
                  <label className="text-xs font-bold text-slate-500 uppercase tracking-widest mb-1.5 block">
                    Doctor's Notes <span className="text-slate-400 font-normal normal-case">(optional)</span>
                  </label>
                  <textarea value={notes} onChange={e => setNotes(e.target.value)}
                    rows={3} placeholder="Follow-up instructions, lifestyle advice, referrals…"
                    className="w-full text-sm text-slate-700 placeholder-slate-300 bg-slate-50 border-2 border-slate-200
                      rounded-xl px-4 py-3 focus:outline-none focus:border-violet-400 transition-colors resize-none" />
                </div>
              </div>
            </div>

            {/* Right — Prescription */}
            <div className="bg-white border border-slate-200 rounded-2xl p-5 space-y-4">
              <div className="flex items-center justify-between">
                <h2 className="text-sm font-bold text-slate-800 flex items-center gap-2">
                  <span className="text-lg font-serif text-slate-600">℞</span> Prescription
                </h2>
                <button onClick={addRx}
                  className="flex items-center gap-1 text-xs font-bold text-violet-600 hover:text-violet-700 transition-colors">
                  <MdAdd className="text-[14px]" /> Add medicine
                </button>
              </div>

              <div className="space-y-4">
                {prescriptions.map((rx, i) => (
                  <div key={i} className="bg-slate-50 border border-slate-200 rounded-xl p-4 space-y-3">
                    <div className="flex items-center justify-between">
                      <p className="text-[11px] font-bold text-slate-400 uppercase tracking-widest">Medicine {i + 1}</p>
                      {prescriptions.length > 1 && (
                        <button onClick={() => removeRx(i)}
                          className="w-6 h-6 flex items-center justify-center rounded-lg hover:bg-red-50 text-slate-400 hover:text-red-500 transition-colors">
                          <MdClose className="text-[13px]" />
                        </button>
                      )}
                    </div>

                    {/* Medicine name */}
                    <div>
                      <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-1 block">Medicine</label>
                      <input list={`med-list-${i}`} value={rx.medicine}
                        onChange={e => updateRx(i, "medicine", e.target.value)}
                        placeholder="Search or type medicine name…"
                        className="w-full text-sm text-slate-700 placeholder-slate-300 bg-white border-2 border-slate-200
                          rounded-xl px-3 py-2 focus:outline-none focus:border-violet-400 transition-colors" />
                      <datalist id={`med-list-${i}`}>
                        {MEDICINE_LIST.map(m => <option key={m} value={m} />)}
                      </datalist>
                    </div>

                    <div className="grid grid-cols-2 gap-2">
                      <div>
                        <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-1 block">Dosage</label>
                        <input type="text" value={rx.dosage} onChange={e => updateRx(i, "dosage", e.target.value)}
                          placeholder="e.g. 500mg"
                          className="w-full text-sm text-slate-700 placeholder-slate-300 bg-white border-2 border-slate-200
                            rounded-xl px-3 py-2 focus:outline-none focus:border-violet-400 transition-colors" />
                      </div>
                      <div>
                        <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-1 block">Frequency</label>
                        <select value={rx.frequency} onChange={e => updateRx(i, "frequency", e.target.value)}
                          className="w-full text-sm text-slate-700 bg-white border-2 border-slate-200 rounded-xl px-3 py-2
                            focus:outline-none focus:border-violet-400 transition-colors">
                          <option value="">Select…</option>
                          {FREQUENCIES.map(f => <option key={f}>{f}</option>)}
                        </select>
                      </div>
                    </div>

                    <div>
                      <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-1 block">Duration</label>
                      <select value={rx.duration} onChange={e => updateRx(i, "duration", e.target.value)}
                        className="w-full text-sm text-slate-700 bg-white border-2 border-slate-200 rounded-xl px-3 py-2
                          focus:outline-none focus:border-violet-400 transition-colors">
                        <option value="">Select…</option>
                        {DURATIONS.map(d => <option key={d}>{d}</option>)}
                      </select>
                    </div>

                    <div>
                      <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-1 block">
                        Special Instructions <span className="font-normal text-slate-400 normal-case">(optional)</span>
                      </label>
                      <input type="text" value={rx.notes} onChange={e => updateRx(i, "notes", e.target.value)}
                        placeholder="e.g. Apply nightly, avoid sun exposure"
                        className="w-full text-sm text-slate-700 placeholder-slate-300 bg-white border-2 border-slate-200
                          rounded-xl px-3 py-2 focus:outline-none focus:border-violet-400 transition-colors" />
                    </div>
                  </div>
                ))}
              </div>

              {filledRx.length > 0 && (
                <div className="bg-violet-50 border border-violet-200 rounded-xl px-4 py-3 flex items-start gap-2">
                  <MdPrint className="text-violet-500 text-[14px] shrink-0 mt-0.5" />
                  <p className="text-xs text-violet-700">
                    {filledRx.length} medicine{filledRx.length > 1 ? "s" : ""} added. Click <strong>Print Prescription</strong> to generate a printable slip.
                    Patient may fill this at the clinic pharmacy or any outside pharmacy.
                  </p>
                </div>
              )}
            </div>
          </div>
        )}

        {tab === "history" && (
          <div className="bg-white border border-slate-200 rounded-2xl p-6">
            {currentPatient.history.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-12 text-center">
                <div className="w-14 h-14 rounded-2xl bg-slate-100 flex items-center justify-center mb-3">
                  <MdHistory className="text-[26px] text-slate-300" />
                </div>
                <p className="text-sm font-semibold text-slate-500">No previous visits</p>
                <p className="text-xs text-slate-400 mt-1">This is the patient's first consultation.</p>
              </div>
            ) : (
              <div className="space-y-4">
                {currentPatient.history.map((h, i) => (
                  <div key={i} className="bg-slate-50 rounded-2xl p-4">
                    <p className="text-sm font-bold text-slate-800">{h.date} · {h.reason}</p>
                    <p className="text-xs text-slate-500 mt-0.5">{h.diagnosis}</p>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>

      {/* Print-only styles */}
      <style>{`@media print { body * { visibility: hidden; } #print-area, #print-area * { visibility: visible; } #print-area { position: absolute; left: 0; top: 0; width: 100%; } }`}</style>
    </>
  )
}

export default Doctor_Consultation