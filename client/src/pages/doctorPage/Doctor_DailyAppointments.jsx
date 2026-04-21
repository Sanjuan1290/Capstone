// client/src/pages/doctorPage/Doctor_DailyAppointments.jsx
// IMPROVEMENTS:
// 1. Enhanced appointment cards — age, gender, reason, appointment type badge
// 2. Walk-in queue panel with "Call Next" and "Mark Done" buttons
// 3. "View / Edit Prescription" for completed appointments (opens modal)
// 4. Status indicators and quick actions on every row

import { useEffect, useState, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  getDailyAppointments, startConsultation,
  getMyQueue, callNextPatient, markQueueEntryDone,
  getConsultation, updateConsultation, getInventoryItems,
} from '../../services/doctor.service'
import usePolling from '../../hooks/usePolling'
import {
  MdCalendarToday, MdAccessTime, MdFace, MdMedicalServices,
  MdChevronRight, MdPerson, MdNotes, MdArrowBack,
  MdCheck, MdAdd, MdClose, MdSave,
  MdQueuePlayNext, MdSkipNext, MdWc, MdCake,
  MdLocalPharmacy, MdEdit, MdPhone,
} from 'react-icons/md'
import { getLocalDateOnly } from '../../utils/date'

// ── Helpers ───────────────────────────────────────────────────────────────────
const STATUS_CONFIG = {
  completed:   { label: 'Done',        badge: 'bg-slate-100  text-slate-500  border-slate-200',   row: 'border-l-slate-300'   },
  'in-progress':{ label: 'In Progress',badge: 'bg-violet-50  text-violet-700 border-violet-200',  row: 'border-l-violet-400'  },
  pending:     { label: 'Waiting',     badge: 'bg-amber-50   text-amber-700  border-amber-200',   row: 'border-l-amber-300'   },
  confirmed:   { label: 'Confirmed',   badge: 'bg-emerald-50 text-emerald-700 border-emerald-200',row: 'border-l-emerald-400' },
  cancelled:   { label: 'Cancelled',   badge: 'bg-red-50     text-red-500    border-red-200',     row: 'border-l-red-300'     },
}

const QUEUE_STATUS = {
  waiting:     { label: 'Waiting',     badge: 'bg-amber-50   text-amber-700  border-amber-200'  },
  'in-progress':{ label: 'In Progress',badge: 'bg-violet-50  text-violet-700 border-violet-200' },
}

function calcAge(birthdate) {
  if (!birthdate) return null
  const b = new Date(birthdate)
  const today = new Date()
  let age = today.getFullYear() - b.getFullYear()
  if (today.getMonth() < b.getMonth() || (today.getMonth() === b.getMonth() && today.getDate() < b.getDate())) age--
  return age
}

const FREQUENCIES = ['Once daily', 'Twice daily', 'Three times daily', 'Every 8 hours', 'Every 12 hours', 'As needed (PRN)']
const DURATIONS   = ['3 days', '5 days', '7 days', '2 weeks', '1 month', '3 months', 'Ongoing']
const getMedicineUnit = (medicineName, inventoryItems = []) =>
  inventoryItems.find(
    (entry) => entry.name?.trim().toLowerCase() === String(medicineName || '').trim().toLowerCase()
  )?.unit || ''

// ── Prescription View/Edit Modal ──────────────────────────────────────────────
const PrescriptionModal = ({ appointmentId, patientName, onClose, onOpenFullRecord }) => {
  const [loading,       setLoading]       = useState(true)
  const [saving,        setSaving]        = useState(false)
  const [diagnosis,     setDiagnosis]     = useState('')
  const [notes,         setNotes]         = useState('')
  const [prescriptions, setPrescriptions] = useState([{ medicine: '', dosage: '', frequency: '', duration: '', notes: '' }])
  const [inventoryItems,setInventoryItems]= useState([])
  const [error,         setError]         = useState('')
  const [saved,         setSaved]         = useState(false)

  useEffect(() => {
    Promise.all([getConsultation(appointmentId), getInventoryItems()])
      .then(([consult, inv]) => {
        setDiagnosis(consult.diagnosis || '')
        setNotes(consult.notes || '')
        try {
          const rx = typeof consult.prescription === 'string'
            ? JSON.parse(consult.prescription)
            : consult.prescription
          if (Array.isArray(rx) && rx.length > 0) setPrescriptions(rx)
        } catch {
          // Ignore invalid stored prescription payloads and keep the editable defaults.
        }
        setInventoryItems(Array.isArray(inv) ? inv : [])
      })
      .catch(() => setError('Failed to load consultation.'))
      .finally(() => setLoading(false))
  }, [appointmentId])

  const updateRx = (i, field, val) => {
    setPrescriptions(prev => prev.map((rx, idx) => idx === i ? { ...rx, [field]: val } : rx))
  }
  const addRx = () => setPrescriptions(prev => [...prev, { medicine: '', dosage: '', frequency: '', duration: '', notes: '' }])
  const removeRx = (i) => setPrescriptions(prev => prev.filter((_, idx) => idx !== i))

  const handleSave = async () => {
    setSaving(true)
    setError('')
    try {
      await updateConsultation(appointmentId, {
        diagnosis,
        notes,
        prescription: JSON.stringify(prescriptions),
      })
      setSaved(true)
      setTimeout(() => setSaved(false), 2000)
    } catch {
      setError('Failed to save. Please try again.')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm px-4"
      onClick={onClose}>
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl max-h-[92vh] flex flex-col"
        onClick={e => e.stopPropagation()}>

        {/* Header */}
        <div className="flex items-center justify-between px-6 py-5 border-b border-slate-100 shrink-0">
          <div>
            <p className="text-sm font-bold text-slate-800 flex items-center gap-2">
              <MdLocalPharmacy className="text-violet-500" />
              Prescription — {patientName}
            </p>
            <p className="text-xs text-slate-400 mt-0.5">View or edit this consultation's records</p>
          </div>
          <button onClick={onClose}
            className="w-8 h-8 flex items-center justify-center rounded-xl hover:bg-slate-100 text-slate-400">
            <MdClose />
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto px-6 py-5 space-y-5">
          {loading ? (
            <div className="py-12 text-center text-slate-400 text-sm">Loading consultation…</div>
          ) : error ? (
            <div className="py-12 text-center text-red-400 text-sm">{error}</div>
          ) : (
            <>
              {/* Diagnosis */}
              <div>
                <label className="text-xs font-bold text-slate-500 uppercase tracking-widest mb-1.5 block">Diagnosis</label>
                <textarea
                  value={diagnosis}
                  onChange={e => setDiagnosis(e.target.value)}
                  rows={2}
                  className="w-full text-sm bg-slate-50 border-2 border-slate-200 rounded-xl px-3 py-2.5 focus:outline-none focus:border-violet-400 resize-none"
                  placeholder="e.g. Acne vulgaris (mild)"
                />
              </div>

              {/* Prescriptions */}
              <div>
                <div className="flex items-center justify-between mb-2">
                  <label className="text-xs font-bold text-slate-500 uppercase tracking-widest">Prescriptions</label>
                  <button onClick={addRx}
                    className="flex items-center gap-1 text-xs font-bold text-violet-600 bg-violet-50 border border-violet-200 px-2.5 py-1 rounded-lg hover:bg-violet-100 transition-colors">
                    <MdAdd className="text-[13px]" /> Add Medicine
                  </button>
                </div>

                <datalist id="medicine-list">
                  {inventoryItems.map(item => (
                    <option key={item.id} value={item.name}>
                      {item.category} · {item.stock} {item.unit}(s) in stock
                    </option>
                  ))}
                </datalist>

                <div className="space-y-3">
                  {prescriptions.map((rx, i) => (
                    <div key={i} className="bg-slate-50 rounded-xl p-4 border border-slate-200 space-y-3">
                      <div className="flex items-center justify-between">
                        <p className="text-xs font-bold text-violet-600">#{i + 1}</p>
                        {prescriptions.length > 1 && (
                          <button onClick={() => removeRx(i)}
                            className="text-red-400 hover:text-red-600 transition-colors">
                            <MdClose className="text-[14px]" />
                          </button>
                        )}
                      </div>
                      <div>
                        <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-1 block">Medicine</label>
                        <input
                          type="text"
                          list="medicine-list"
                          value={rx.medicine}
                          onChange={e => updateRx(i, 'medicine', e.target.value)}
                          placeholder="Type or select medicine…"
                          className="w-full text-sm p-2 rounded-lg border border-slate-200 bg-white focus:outline-none focus:border-violet-400"
                        />
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
                              onChange={e => updateRx(i, 'dosage', e.target.value)}
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
                              Existing dosage "{rx.dosage}" is not numeric. Update it to save changes.
                            </p>
                          )}
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

              {/* Notes */}
              <div>
                <label className="text-xs font-bold text-slate-500 uppercase tracking-widest mb-1.5 block">Consultation Notes</label>
                <textarea
                  value={notes}
                  onChange={e => setNotes(e.target.value)}
                  rows={3}
                  className="w-full text-sm bg-slate-50 border-2 border-slate-200 rounded-xl px-3 py-2.5 focus:outline-none focus:border-violet-400 resize-none"
                  placeholder="Additional clinical notes…"
                />
              </div>
            </>
          )}
        </div>

        {/* Footer */}
        {!loading && !error && (
          <div className="px-6 pb-5 pt-3 border-t border-slate-100 flex gap-3 shrink-0">
            <button onClick={() => onOpenFullRecord(appointmentId)}
              className="flex-1 py-2.5 text-sm font-semibold text-violet-700 border border-violet-200 bg-violet-50 rounded-xl hover:bg-violet-100">
              Open Full Record
            </button>
            <button onClick={onClose}
              className="flex-1 py-2.5 text-sm font-semibold text-slate-600 border border-slate-200 rounded-xl hover:bg-slate-50">
              Close
            </button>
            <button onClick={handleSave} disabled={saving}
              className={`flex-1 py-2.5 text-sm font-bold rounded-xl flex items-center justify-center gap-2 transition-colors
                ${saved
                  ? 'bg-emerald-500 text-white'
                  : 'bg-violet-600 hover:bg-violet-700 text-white disabled:opacity-50'}`}>
              {saved ? <><MdCheck /> Saved!</> : saving ? 'Saving…' : <><MdSave className="text-[14px]" /> Save Changes</>}
            </button>
          </div>
        )}
      </div>
    </div>
  )
}

// ── Appointment Row ───────────────────────────────────────────────────────────
const AppointmentRow = ({ appt, isSelected, onSelect }) => {
  const cfg  = STATUS_CONFIG[appt.status] || STATUS_CONFIG.pending
  const Icon = appt.type === 'derma' ? MdFace : MdMedicalServices
  const age  = appt.patient_age ?? calcAge(appt.birthdate)

  return (
    <button onClick={() => onSelect(appt)}
      className={`w-full flex items-center gap-3 px-4 py-3.5 border-l-[3px] text-left transition-all duration-150
        ${isSelected ? `${cfg.row} bg-slate-50` : 'border-l-transparent hover:bg-slate-50/70'}`}>
      <div className={`w-9 h-9 rounded-xl flex items-center justify-center shrink-0
        ${appt.type === 'derma' ? 'bg-emerald-50' : 'bg-slate-100'}`}>
        <Icon className={`text-[16px] ${appt.type === 'derma' ? 'text-emerald-600' : 'text-slate-500'}`} />
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 mb-0.5 flex-wrap">
          <p className="text-sm font-bold text-slate-800 truncate">{appt.patient_name || appt.patient}</p>
          <span className={`text-[10px] font-bold border px-2 py-0.5 rounded-full whitespace-nowrap ${cfg.badge}`}>
            {cfg.label}
          </span>
        </div>
        <p className="text-xs text-slate-500 truncate">{appt.reason || 'No reason provided'}</p>
        <div className="flex items-center gap-3 mt-0.5 text-[11px] text-slate-400 font-medium flex-wrap">
          <span className="flex items-center gap-0.5"><MdAccessTime className="text-[11px]" /> {appt.time}</span>
          {age !== null && <span className="flex items-center gap-0.5"><MdCake className="text-[11px]" /> {age} yrs</span>}
          {appt.patient_sex && <span className="flex items-center gap-0.5"><MdWc className="text-[11px]" /> {appt.patient_sex}</span>}
        </div>
      </div>
      <MdChevronRight className={`text-[16px] shrink-0 ${isSelected ? 'text-slate-500' : 'text-slate-300'}`} />
    </button>
  )
}

// ── Detail Panel ──────────────────────────────────────────────────────────────
const DetailPanel = ({ appt, onClose, onStart, onViewPrescription }) => {
  if (!appt) return null
  const cfg  = STATUS_CONFIG[appt.status] || STATUS_CONFIG.pending
  const Icon = appt.type === 'derma' ? MdFace : MdMedicalServices
  const age  = appt.patient_age ?? calcAge(appt.birthdate)

  const typeLabel = appt.type === 'derma' ? 'Dermatology' : 'General Medicine'

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="flex items-center gap-3 px-6 py-5 border-b border-slate-100 shrink-0">
        <button onClick={onClose}
          className="w-8 h-8 flex items-center justify-center rounded-xl hover:bg-slate-100 text-slate-400 lg:hidden">
          <MdArrowBack className="text-[18px]" />
        </button>
        <div className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0
          ${appt.type === 'derma' ? 'bg-emerald-50' : 'bg-slate-100'}`}>
          <Icon className={`text-[18px] ${appt.type === 'derma' ? 'text-emerald-600' : 'text-slate-500'}`} />
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-bold text-slate-800 truncate">{appt.patient_name || appt.patient}</p>
          <p className="text-xs text-slate-500">Appt #{appt.id} · {typeLabel}</p>
        </div>
        <span className={`text-[11px] font-bold border px-2.5 py-0.5 rounded-full shrink-0 ${cfg.badge}`}>
          {cfg.label}
        </span>
      </div>

      {/* Body */}
      <div className="flex-1 overflow-y-auto px-6 py-4 space-y-4">

        {/* Patient Info */}
        <div className="bg-slate-50 rounded-2xl p-4 space-y-3">
          <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Patient Information</p>
          <div className="grid grid-cols-2 gap-3">
            {age !== null && (
              <div className="flex items-start gap-2">
                <div className="w-6 h-6 rounded-lg bg-white border border-slate-200 flex items-center justify-center shrink-0 mt-0.5">
                  <MdCake className="text-[11px] text-slate-400" />
                </div>
                <div>
                  <p className="text-[10px] text-slate-400">Age</p>
                  <p className="text-sm font-semibold text-slate-800">{age} years old</p>
                </div>
              </div>
            )}
            {appt.patient_sex && (
              <div className="flex items-start gap-2">
                <div className="w-6 h-6 rounded-lg bg-white border border-slate-200 flex items-center justify-center shrink-0 mt-0.5">
                  <MdWc className="text-[11px] text-slate-400" />
                </div>
                <div>
                  <p className="text-[10px] text-slate-400">Sex</p>
                  <p className="text-sm font-semibold text-slate-800">{appt.patient_sex}</p>
                </div>
              </div>
            )}
            {appt.patient_phone && (
              <div className="flex items-start gap-2 col-span-2">
                <div className="w-6 h-6 rounded-lg bg-white border border-slate-200 flex items-center justify-center shrink-0 mt-0.5">
                  <MdPhone className="text-[11px] text-slate-400" />
                </div>
                <div>
                  <p className="text-[10px] text-slate-400">Phone</p>
                  <p className="text-sm font-semibold text-slate-800">{appt.patient_phone}</p>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Visit Info */}
        <div className="bg-slate-50 rounded-2xl p-4 space-y-3">
          <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Visit Information</p>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <p className="text-[11px] text-slate-400 flex items-center gap-1 mb-0.5">
                <MdAccessTime className="text-[11px]" /> Time Scheduled
              </p>
              <p className="text-sm font-semibold text-slate-800">{appt.time}</p>
            </div>
            <div>
              <p className="text-[11px] text-slate-400 mb-0.5">Type</p>
              <p className="text-sm font-semibold text-slate-800">{typeLabel}</p>
            </div>
          </div>
          <div>
            <p className="text-[11px] text-slate-400 flex items-center gap-1 mb-0.5">
              <MdPerson className="text-[11px]" /> Reason for Visit
            </p>
            <p className="text-sm font-semibold text-slate-800">{appt.reason || '—'}</p>
          </div>
          {appt.notes && (
            <div>
              <p className="text-[11px] text-slate-400 flex items-center gap-1 mb-0.5">
                <MdNotes className="text-[11px]" /> Pre-visit Notes
              </p>
              <p className="text-sm text-slate-700 leading-relaxed">{appt.notes}</p>
            </div>
          )}
        </div>
      </div>

      {/* Actions */}
      <div className="px-6 pb-6 pt-4 border-t border-slate-100 shrink-0 space-y-2">
        {appt.status === 'in-progress' && (
          <button onClick={() => onStart(appt)}
            className="w-full flex items-center justify-center gap-2 py-2.5 text-xs font-bold
              text-white bg-violet-600 hover:bg-violet-700 rounded-xl transition-colors">
            <MdMedicalServices className="text-[14px]" /> Resume Consultation
          </button>
        )}
        {(appt.status === 'pending' || appt.status === 'confirmed') && (
          <button onClick={() => onStart(appt)}
            className="w-full flex items-center justify-center gap-2 py-2.5 text-xs font-bold
              text-white bg-[#0b1a2c] hover:bg-[#122236] rounded-xl transition-colors">
            <MdCheck className="text-[14px]" /> Start Consultation
          </button>
        )}
        {appt.status === 'completed' && (
          <>
            <div className="flex items-center justify-center gap-2 py-1 text-xs font-semibold text-emerald-600">
              <MdCheck className="text-[14px]" /> Consultation Completed
            </div>
            <button onClick={() => onViewPrescription(appt)}
              className="w-full flex items-center justify-center gap-2 py-2.5 text-xs font-bold
                text-violet-700 bg-violet-50 border border-violet-200 hover:bg-violet-100 rounded-xl transition-colors">
              <MdEdit className="text-[14px]" /> View / Edit Prescription
            </button>
          </>
        )}
      </div>
    </div>
  )
}

// ── Walk-in Queue Panel ───────────────────────────────────────────────────────
const WalkInPanel = ({ queue, onCallNext, onMarkDone, onConsultWalkIn, calling }) => (
  <div className="bg-white border border-slate-200 rounded-2xl overflow-hidden">
    <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100">
      <div>
        <h2 className="text-sm font-bold text-slate-800 flex items-center gap-2">
          <MdQueuePlayNext className="text-amber-500" /> Walk-in Queue
        </h2>
        <p className="text-xs text-slate-400 mt-0.5">{queue.length} patient{queue.length !== 1 ? 's' : ''} waiting</p>
      </div>
      <button
        onClick={onCallNext}
        disabled={calling || queue.length === 0}
        className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold text-white bg-amber-500 hover:bg-amber-600
          disabled:opacity-40 disabled:cursor-not-allowed rounded-xl transition-colors">
        <MdSkipNext className="text-[15px]" />
        {calling ? 'Calling…' : 'Call Next'}
      </button>
    </div>

    <div className="divide-y divide-slate-100">
      {queue.length === 0 ? (
        <div className="flex flex-col items-center py-8">
          <MdQueuePlayNext className="text-slate-200 text-[32px] mb-2" />
          <p className="text-xs text-slate-400">No walk-in patients in queue</p>
        </div>
      ) : queue.map((q, idx) => {
        const qcfg = QUEUE_STATUS[q.status] || QUEUE_STATUS.waiting
        return (
          <div key={q.id} className={`flex items-center gap-3 px-4 py-3 ${q.status === 'in-progress' ? 'bg-violet-50/50' : ''}`}>
            <div className={`w-9 h-9 rounded-xl flex items-center justify-center font-black text-sm shrink-0
              ${q.status === 'in-progress' ? 'bg-violet-100 text-violet-700' : 'bg-amber-100 text-amber-700'}`}>
              {q.queue_number}
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-semibold text-slate-800 truncate">{q.patient_name}</p>
              <div className="flex items-center gap-2 mt-0.5">
                <span className={`text-[10px] font-bold border px-1.5 py-0.5 rounded-full ${qcfg.badge}`}>
                  {qcfg.label}
                </span>
                <span className="text-[10px] text-slate-400">{q.arrivedAt || ''}</span>
              </div>
            </div>
            {q.status === 'in-progress' && (
              <div className="flex items-center gap-2 shrink-0">
                {q.appointment_id && (
                  <button onClick={() => onConsultWalkIn(q)}
                    className="text-[11px] font-bold text-violet-700 bg-violet-50 border border-violet-200
                      px-2.5 py-1 rounded-lg hover:bg-violet-100 transition-colors">
                    Consult
                  </button>
                )}
                <button onClick={() => onMarkDone(q.id)}
                  className="text-[11px] font-bold text-emerald-700 bg-emerald-50 border border-emerald-200
                    px-2.5 py-1 rounded-lg hover:bg-emerald-100 transition-colors">
                  Done
                </button>
              </div>
            )}
            {q.status === 'waiting' && idx === 0 && (
              <span className="text-[10px] font-bold text-amber-600 shrink-0">Up next</span>
            )}
          </div>
        )
      })}
    </div>
  </div>
)

// ── Main Component ────────────────────────────────────────────────────────────
const Doctor_DailyAppointments = () => {
  const navigate = useNavigate()
  const [appointments,  setAppointments]  = useState([])
  const [selected,      setSelected]      = useState(null)
  const [loading,       setLoading]       = useState(true)
  const [walkInQueue,   setWalkInQueue]   = useState([])
  const [calling,       setCalling]       = useState(false)
  const [prescModal,    setPrescModal]    = useState(null) // { id, patientName }
  const today = getLocalDateOnly()

  // ── Load appointments ──────────────────────────────────────────────────────
  const loadAppointments = useCallback(() => {
    getDailyAppointments(today)
      .then(data => {
        const arr = Array.isArray(data) ? data : []
        setAppointments(arr)
        // Keep selected in sync if it already exists
        setSelected(prev => prev ? (arr.find(a => a.id === prev.id) || arr[0] || null) : (arr[0] || null))
      })
      .catch(err => console.error('Fetch error:', err))
      .finally(() => setLoading(false))
  }, [today])

  // ── Load walk-in queue ─────────────────────────────────────────────────────
  const loadQueue = useCallback(() => {
    getMyQueue()
      .then(data => setWalkInQueue(Array.isArray(data) ? data : []))
      .catch(() => {})
  }, [])

  // Poll both every 15 seconds
  usePolling(loadAppointments, 15_000)
  usePolling(loadQueue, 10_000)

  // ── Handlers ──────────────────────────────────────────────────────────────
  const handleStart = async (appt) => {
    try {
      if (appt.status !== 'in-progress') {
        await startConsultation(appt.id)
        setAppointments(prev => prev.map(a => a.id === appt.id ? { ...a, status: 'in-progress' } : a))
      }
      navigate('/doctor/consultation', { state: { appointment: { ...appt, status: 'in-progress' } } })
    } catch (err) {
      console.error('Failed to start consultation', err)
    }
  }

  const handleCallNext = async () => {
    setCalling(true)
    try {
      await callNextPatient()
      loadQueue()
    } catch (err) {
      console.error('Call next failed', err)
    } finally {
      setCalling(false)
    }
  }

  const handleMarkDone = async (id) => {
    try {
      await markQueueEntryDone(id)
      loadQueue()
    } catch (err) {
      console.error('Mark done failed', err)
    }
  }

  const handleViewPrescription = (appt) => {
    setPrescModal({ id: appt.id, patientName: appt.patient_name || appt.patient })
  }

  const handleConsultWalkIn = async (entry) => {
    if (!entry?.appointment_id) {
      alert('This walk-in does not have a linked appointment record yet.')
      return
    }

    const walkInAppt = {
      id: entry.appointment_id,
      patient_id: entry.patient_id,
      patient_name: entry.patient_name,
      patient: entry.patient_name,
      patient_age: entry.patient_age,
      patient_sex: entry.patient_sex,
      patient_phone: entry.patient_phone,
      reason: entry.reason || 'Walk-in consultation',
      time: entry.time || entry.arrivedAt,
      type: entry.type,
      status: 'in-progress',
    }

    try {
      await startConsultation(entry.appointment_id)
      navigate('/doctor/consultation', { state: { appointment: walkInAppt } })
    } catch (err) {
      console.error('Failed to open walk-in consultation', err)
      alert('Failed to open walk-in consultation. Please try again.')
    }
  }

  const openConsultationRecord = (appointmentId) => {
    setPrescModal(null)
    navigate(`/doctor/consultation?id=${appointmentId}`)
  }

  // ── Stats ──────────────────────────────────────────────────────────────────
  const done           = appointments.filter(a => a.status === 'completed').length
  const inProgressCount= appointments.filter(a => a.status === 'in-progress').length
  const waitingCount   = appointments.filter(a => a.status === 'pending' || a.status === 'confirmed').length

  if (loading) return (
    <div className="flex items-center justify-center h-64 text-slate-400 text-sm">
      Loading schedule…
    </div>
  )

  return (
    <>
      <div className="max-w-6xl space-y-5">

        {/* Header */}
        <div className="flex items-start justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold text-slate-800">Daily Appointments</h1>
            <p className="text-sm text-slate-500 mt-0.5">
              {new Date().toLocaleDateString('en-PH', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' })}
            </p>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            {/* Stat pills */}
            <span className="text-[11px] font-bold bg-amber-50 text-amber-700 border border-amber-200 px-2.5 py-1 rounded-full">
              {waitingCount} waiting
            </span>
            {inProgressCount > 0 && (
              <span className="text-[11px] font-bold bg-violet-50 text-violet-700 border border-violet-200 px-2.5 py-1 rounded-full">
                {inProgressCount} in progress
              </span>
            )}
            <span className="text-[11px] font-bold bg-slate-100 text-slate-500 border border-slate-200 px-2.5 py-1 rounded-full">
              {done}/{appointments.length} done
            </span>
          </div>
        </div>

        {/* Main grid: appointment list + detail | walk-in panel */}
        <div className="grid grid-cols-1 lg:grid-cols-[1fr_320px] gap-5 items-start">

          {/* LEFT: Appointments + Detail */}
          <div className="bg-white border border-slate-200 rounded-2xl overflow-hidden flex"
            style={{ minHeight: '560px' }}>

            {/* List */}
            <div className="flex flex-col border-r border-slate-100 w-full lg:w-[360px] shrink-0">
              <div className="px-4 py-3 border-b border-slate-100 bg-slate-50/70">
                <p className="text-[11px] font-bold text-slate-400 uppercase tracking-widest">
                  {appointments.length} scheduled today
                </p>
              </div>
              <div className="flex-1 overflow-y-auto divide-y divide-slate-100">
                {appointments.length === 0 ? (
                  <div className="flex flex-col items-center py-12 text-center px-6">
                    <MdCalendarToday className="text-slate-200 text-[32px] mb-2" />
                    <p className="text-xs text-slate-400">No appointments scheduled for today.</p>
                  </div>
                ) : appointments.map(appt => (
                  <AppointmentRow key={appt.id} appt={appt}
                    isSelected={selected?.id === appt.id}
                    onSelect={setSelected} />
                ))}
              </div>
            </div>

            {/* Detail */}
            <div className="hidden lg:flex flex-col flex-1 min-w-0">
              {selected ? (
                <DetailPanel
                  appt={selected}
                  onClose={() => setSelected(null)}
                  onStart={handleStart}
                  onViewPrescription={handleViewPrescription}
                />
              ) : (
                <div className="flex flex-col items-center justify-center flex-1 text-center px-8">
                  <div className="w-14 h-14 rounded-2xl bg-slate-50 border border-slate-100 flex items-center justify-center mb-3">
                    <MdCalendarToday className="text-[24px] text-slate-300" />
                  </div>
                  <p className="text-sm font-semibold text-slate-500">Select a patient</p>
                  <p className="text-xs text-slate-400 mt-1">Click any appointment on the left to see details and actions.</p>
                </div>
              )}
            </div>
          </div>

          {/* RIGHT: Walk-in queue panel */}
          <WalkInPanel
            queue={walkInQueue}
            onCallNext={handleCallNext}
            onMarkDone={handleMarkDone}
            onConsultWalkIn={handleConsultWalkIn}
            calling={calling}
          />
        </div>
      </div>

      {/* Prescription Modal */}
      {prescModal && (
        <PrescriptionModal
          appointmentId={prescModal.id}
          patientName={prescModal.patientName}
          onClose={() => setPrescModal(null)}
          onOpenFullRecord={openConsultationRecord}
        />
      )}
    </>
  )
}

export default Doctor_DailyAppointments
