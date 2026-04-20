import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  MdAdd,
  MdCheck,
  MdClose,
  MdMedicalServices,
  MdPerson,
  MdQueuePlayNext,
  MdRefresh,
  MdRemoveCircleOutline,
} from 'react-icons/md'
import {
  addToQueue,
  createWalkInPatient,
  getPatients,
  getDoctors,
  getQueue,
  updateQueueStatus,
} from '../../services/staff.service'

const QueueCard = ({ entry, onCall, onDone, onRemove }) => {
  const active = entry.status === 'in-progress'
  return (
    <div className="rounded-3xl border border-slate-200 bg-white p-4 shadow-sm">
      <div className="mb-3 flex items-start justify-between gap-3">
        <div>
          <p className="text-base font-bold text-slate-800">{entry.patient_name || entry.patient}</p>
          <p className="text-sm text-slate-500">{entry.doctor_name || entry.doctor}</p>
        </div>
        <span className={`rounded-full px-3 py-1 text-xs font-bold ${active ? 'bg-sky-50 text-sky-700' : entry.status === 'done' ? 'bg-emerald-50 text-emerald-700' : entry.status === 'removed' ? 'bg-red-50 text-red-600' : 'bg-amber-50 text-amber-700'}`}>
          {entry.status}
        </span>
      </div>
      <div className="mb-4 text-sm text-slate-600">
        Queue #{entry.queue_number || entry.queueNo} • {entry.type === 'derma' ? 'Derma' : 'Medical'}
      </div>
      {(entry.status === 'waiting' || entry.status === 'in-progress') && (
        <div className="flex gap-2">
          {entry.status === 'waiting' && (
            <button onClick={() => onCall(entry)} className="flex-1 rounded-2xl bg-sky-600 px-4 py-3 text-sm font-semibold text-white">
              Call
            </button>
          )}
          {entry.status === 'in-progress' && (
            <button onClick={() => onDone(entry)} className="flex-1 rounded-2xl bg-emerald-600 px-4 py-3 text-sm font-semibold text-white">
              Mark Done
            </button>
          )}
          <button onClick={() => onRemove(entry)} className="rounded-2xl border border-red-200 px-4 py-3 text-sm font-semibold text-red-600">
            Remove
          </button>
        </div>
      )}
    </div>
  )
}

const WalkInModal = ({ doctors, onClose, onSubmit }) => {
  const [mode, setMode] = useState('existing')
  const [patientSearch, setPatientSearch] = useState('')
  const [patientResults, setPatientResults] = useState([])
  const [selectedPatient, setSelectedPatient] = useState(null)
  const [form, setForm] = useState({
    full_name: '',
    birthdate: '',
    sex: '',
    civil_status: 'Single',
    phone: '',
    address: '',
    email: '',
    clinic_type: 'medical',
    reason: '',
    doctor_id: '',
    consent_given: false,
  })
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    if (mode !== 'existing' || patientSearch.trim().length < 2) {
      setPatientResults([])
      return
    }
    const timeout = window.setTimeout(() => {
      getPatients(patientSearch)
        .then((rows) => setPatientResults(Array.isArray(rows) ? rows : []))
        .catch(() => setPatientResults([]))
    }, 250)
    return () => window.clearTimeout(timeout)
  }, [mode, patientSearch])

  const filteredDoctors = useMemo(() => {
    return doctors.filter((doctor) => {
      const specialty = (doctor.specialty || '').toLowerCase()
      return form.clinic_type === 'derma' ? specialty.includes('derm') : !specialty.includes('derm')
    })
  }, [doctors, form.clinic_type])

  const updateField = (key, value) => setForm((prev) => ({ ...prev, [key]: value }))

  const handleSubmit = async () => {
    if (mode === 'new' && !form.consent_given) {
      alert('Consent is required before continuing.')
      return
    }
    if (mode === 'existing' && !selectedPatient?.id) {
      alert('Select an existing patient first.')
      return
    }
    if (!form.doctor_id) {
      alert('Select a doctor before adding to queue.')
      return
    }
    setSaving(true)
    try {
      await onSubmit({ ...form, mode, selectedPatient })
      onClose()
    } finally {
      setSaving(false)
    }
  }

  return (
    <>
      <div className="fixed inset-0 z-40 bg-black/40" onClick={onClose} />
      <div className="fixed inset-x-0 bottom-0 z-50 max-h-[92vh] overflow-auto rounded-t-3xl bg-white p-5 shadow-2xl sm:left-1/2 sm:top-1/2 sm:bottom-auto sm:w-full sm:max-w-2xl sm:-translate-x-1/2 sm:-translate-y-1/2 sm:rounded-3xl">
        <div className="mb-4 flex items-center justify-between">
          <div>
            <p className="text-sm font-bold text-slate-800">Register Walk-in Patient</p>
            <p className="text-xs text-slate-500">Create the patient record first, then add to queue.</p>
          </div>
          <button onClick={onClose} className="rounded-xl p-2 text-slate-400 hover:bg-slate-100"><MdClose /></button>
        </div>

        <div className="mb-4 grid grid-cols-2 gap-2 rounded-2xl bg-slate-100 p-1">
          <button
            onClick={() => setMode('existing')}
            className={`rounded-xl px-3 py-2 text-sm font-semibold ${mode === 'existing' ? 'bg-white text-slate-800 shadow-sm' : 'text-slate-500'}`}
          >
            Existing Patient
          </button>
          <button
            onClick={() => setMode('new')}
            className={`rounded-xl px-3 py-2 text-sm font-semibold ${mode === 'new' ? 'bg-white text-slate-800 shadow-sm' : 'text-slate-500'}`}
          >
            Register New
          </button>
        </div>

        {mode === 'existing' ? (
          <div className="space-y-4">
            <label className="block">
              <span className="mb-1 block text-xs font-bold uppercase tracking-widest text-slate-400">Search Patient</span>
              <input
                type="text"
                value={patientSearch}
                onChange={(e) => {
                  setPatientSearch(e.target.value)
                  setSelectedPatient(null)
                }}
                placeholder="Type name or email"
                className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm outline-none focus:border-sky-400"
              />
            </label>
            {patientResults.length > 0 && (
              <div className="max-h-44 overflow-auto rounded-2xl border border-slate-200">
                {patientResults.map((patient) => (
                  <button
                    key={patient.id}
                    onClick={() => {
                      setSelectedPatient(patient)
                      setPatientSearch(patient.full_name || patient.name)
                      setPatientResults([])
                    }}
                    className="block w-full border-b border-slate-100 px-4 py-2.5 text-left text-sm text-slate-700 last:border-b-0 hover:bg-slate-50"
                  >
                    {patient.full_name || patient.name}
                  </button>
                ))}
              </div>
            )}
            {selectedPatient && (
              <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4 text-sm text-slate-700">
                <p className="font-semibold">{selectedPatient.full_name || selectedPatient.name}</p>
                <p className="text-xs text-slate-500 mt-1">{selectedPatient.phone || 'No phone'} • {selectedPatient.email || 'No email'}</p>
              </div>
            )}

            <div className="grid gap-4 sm:grid-cols-2">
              <label className="block">
                <span className="mb-1 block text-xs font-bold uppercase tracking-widest text-slate-400">Clinic Type</span>
                <select value={form.clinic_type} onChange={(e) => updateField('clinic_type', e.target.value)} className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm outline-none focus:border-sky-400">
                  <option value="medical">Medical</option>
                  <option value="derma">Derma</option>
                </select>
              </label>
              <label className="block">
                <span className="mb-1 block text-xs font-bold uppercase tracking-widest text-slate-400">Doctor</span>
                <select value={form.doctor_id} onChange={(e) => updateField('doctor_id', e.target.value)} className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm outline-none focus:border-sky-400">
                  <option value="">Select doctor</option>
                  {filteredDoctors.map((doctor) => (
                    <option key={doctor.id} value={doctor.id}>{doctor.full_name || doctor.name}</option>
                  ))}
                </select>
              </label>
              <label className="block sm:col-span-2">
                <span className="mb-1 block text-xs font-bold uppercase tracking-widest text-slate-400">Reason for Visit</span>
                <input type="text" value={form.reason} onChange={(e) => updateField('reason', e.target.value)} className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm outline-none focus:border-sky-400" />
              </label>
            </div>
          </div>
        ) : (
        <div className="grid gap-4 sm:grid-cols-2">
          {[
            ['Full Name', 'full_name', 'text', true],
            ['Birthdate', 'birthdate', 'date', true],
            ['Phone Number', 'phone', 'text', true],
            ['Address', 'address', 'text', true],
            ['Email Address', 'email', 'email', false],
            ['Reason for Visit', 'reason', 'text', false],
          ].map(([label, key, type]) => (
            <label key={key} className={`block ${key === 'address' || key === 'reason' || key === 'full_name' ? 'sm:col-span-2' : ''}`}>
              <span className="mb-1 block text-xs font-bold uppercase tracking-widest text-slate-400">{label}</span>
              <input type={type} value={form[key]} onChange={(e) => updateField(key, e.target.value)} className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm outline-none focus:border-sky-400" />
            </label>
          ))}

          <label className="block">
            <span className="mb-1 block text-xs font-bold uppercase tracking-widest text-slate-400">Sex</span>
            <select value={form.sex} onChange={(e) => updateField('sex', e.target.value)} className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm outline-none focus:border-sky-400">
              <option value="">Select sex</option>
              <option value="Male">Male</option>
              <option value="Female">Female</option>
              <option value="Other">Other</option>
            </select>
          </label>

          <label className="block">
            <span className="mb-1 block text-xs font-bold uppercase tracking-widest text-slate-400">Civil Status</span>
            <select value={form.civil_status} onChange={(e) => updateField('civil_status', e.target.value)} className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm outline-none focus:border-sky-400">
              <option value="Single">Single</option>
              <option value="Married">Married</option>
              <option value="Widowed">Widowed</option>
              <option value="Divorced">Divorced</option>
            </select>
          </label>

          <label className="block">
            <span className="mb-1 block text-xs font-bold uppercase tracking-widest text-slate-400">Clinic Type</span>
            <select value={form.clinic_type} onChange={(e) => updateField('clinic_type', e.target.value)} className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm outline-none focus:border-sky-400">
              <option value="medical">Medical</option>
              <option value="derma">Derma</option>
            </select>
          </label>

          <label className="block">
            <span className="mb-1 block text-xs font-bold uppercase tracking-widest text-slate-400">Doctor</span>
            <select value={form.doctor_id} onChange={(e) => updateField('doctor_id', e.target.value)} className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm outline-none focus:border-sky-400">
              <option value="">Select doctor</option>
              {filteredDoctors.map((doctor) => (
                <option key={doctor.id} value={doctor.id}>{doctor.full_name || doctor.name}</option>
              ))}
            </select>
          </label>

          <label className="flex gap-3 rounded-2xl border border-slate-200 bg-slate-50 p-4 text-sm text-slate-600 sm:col-span-2">
            <input type="checkbox" checked={form.consent_given} onChange={(e) => updateField('consent_given', e.target.checked)} className="mt-1 h-4 w-4 rounded border-slate-300 text-sky-600" />
            <span>I consent to the collection and processing of my personal data in accordance with Republic Act 10173 (Data Privacy Act of 2012).</span>
          </label>
        </div>
        )}

        <div className="mt-5 flex gap-3">
          <button onClick={onClose} className="flex-1 rounded-2xl border border-slate-200 py-3 text-sm font-semibold text-slate-600">Cancel</button>
          <button onClick={handleSubmit} disabled={saving} className="flex-1 rounded-2xl bg-[#0b1a2c] py-3 text-sm font-semibold text-white disabled:opacity-60">
            {saving ? 'Saving...' : mode === 'existing' ? 'Add to Queue' : 'Register & Add to Queue'}
          </button>
        </div>
      </div>
    </>
  )
}

const StaffWalkInQueue = () => {
  const [queue, setQueue] = useState([])
  const [doctors, setDoctors] = useState([])
  const [loading, setLoading] = useState(true)
  const [showModal, setShowModal] = useState(false)
  const today = new Date().toISOString().slice(0, 10)

  const loadData = useCallback(async () => {
    setLoading(true)
    try {
      const [queueRows, doctorRows] = await Promise.all([getQueue(today), getDoctors()])
      setQueue(Array.isArray(queueRows) ? queueRows : [])
      setDoctors(Array.isArray(doctorRows) ? doctorRows : [])
    } finally {
      setLoading(false)
    }
  }, [today])

  useEffect(() => {
    loadData()
  }, [loadData])

  useEffect(() => {
    const refresh = () => loadData()
    window.addEventListener('clinic:refresh', refresh)
    return () => window.removeEventListener('clinic:refresh', refresh)
  }, [loadData])

  const handleRegisterWalkIn = async (payload) => {
    let patient = payload.selectedPatient
    if (payload.mode === 'new') {
      patient = await createWalkInPatient({
        full_name: payload.full_name,
        birthdate: payload.birthdate,
        sex: payload.sex,
        civil_status: payload.civil_status,
        phone: payload.phone,
        address: payload.address,
        email: payload.email || null,
        consent_given: payload.consent_given,
      })
      if (!patient?.id) {
        alert(patient?.message || 'Failed to register walk-in patient.')
        return
      }
    }

    const queueEntry = await addToQueue({
      patient_id: patient.id,
      patient_name: patient.full_name || patient.name,
      doctor_id: Number(payload.doctor_id),
      type: payload.clinic_type,
      reason: payload.reason || 'Walk-in consultation',
    })

    if (!queueEntry?.id) {
      alert(queueEntry?.message || 'Patient was registered, but queueing failed.')
      return
    }

    await loadData()
  }

  const handleCall = async (entry) => {
    const active = queue.find((item) => item.status === 'in-progress')
    if (active) await updateQueueStatus(active.id, 'done')
    await updateQueueStatus(entry.id, 'in-progress')
    await loadData()
  }

  const handleDone = async (entry) => {
    await updateQueueStatus(entry.id, 'done')
    await loadData()
  }

  const handleRemove = async (entry) => {
    if (!window.confirm('Remove this patient from the queue?')) return
    await updateQueueStatus(entry.id, 'removed')
    await loadData()
  }

  const activeQueue = queue.filter((entry) => ['waiting', 'in-progress'].includes(entry.status))
  const completedQueue = queue.filter((entry) => ['done', 'removed'].includes(entry.status))

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-bold text-slate-800">
            <MdQueuePlayNext className="text-sky-500" /> Walk-in Queue
          </h1>
          <p className="mt-1 text-sm text-slate-500">Register walk-in patients, collect consent, and manage today’s queue.</p>
        </div>
        <div className="flex gap-2">
          <button onClick={loadData} className="inline-flex items-center gap-2 rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm font-semibold text-slate-600 hover:bg-slate-50">
            <MdRefresh /> Refresh
          </button>
          <button onClick={() => setShowModal(true)} className="inline-flex items-center gap-2 rounded-2xl bg-[#0b1a2c] px-4 py-3 text-sm font-semibold text-white">
            <MdAdd /> Register Walk-in Patient
          </button>
        </div>
      </div>

      <div className="grid gap-3 sm:grid-cols-3">
        {[
          ['Waiting', activeQueue.filter((entry) => entry.status === 'waiting').length, 'bg-amber-50 text-amber-700'],
          ['In Progress', activeQueue.filter((entry) => entry.status === 'in-progress').length, 'bg-sky-50 text-sky-700'],
          ['Completed', completedQueue.filter((entry) => entry.status === 'done').length, 'bg-emerald-50 text-emerald-700'],
        ].map(([label, value, tone]) => (
          <div key={label} className={`rounded-3xl border border-slate-200 p-5 ${tone}`}>
            <p className="text-3xl font-black">{value}</p>
            <p className="mt-1 text-sm font-semibold">{label}</p>
          </div>
        ))}
      </div>

      {loading ? (
        <div className="flex h-64 items-center justify-center rounded-3xl border border-slate-200 bg-white">
          <div className="h-8 w-8 animate-spin rounded-full border-4 border-slate-200 border-t-sky-500" />
        </div>
      ) : (
        <>
          <section className="space-y-3">
            <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-widest text-slate-400">
              <MdMedicalServices /> Active Queue
            </div>
            <div className="grid gap-4 lg:grid-cols-2">
              {activeQueue.length === 0 ? (
                <div className="rounded-3xl border border-slate-200 bg-white p-8 text-center text-sm text-slate-400">No active walk-ins yet.</div>
              ) : activeQueue.map((entry) => (
                <QueueCard key={entry.id} entry={entry} onCall={handleCall} onDone={handleDone} onRemove={handleRemove} />
              ))}
            </div>
          </section>

          <section className="space-y-3">
            <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-widest text-slate-400">
              <MdCheck /> Completed / Removed
            </div>
            <div className="grid gap-4 lg:grid-cols-2">
              {completedQueue.length === 0 ? (
                <div className="rounded-3xl border border-slate-200 bg-white p-8 text-center text-sm text-slate-400">No completed entries yet.</div>
              ) : completedQueue.map((entry) => (
                <div key={entry.id} className="rounded-3xl border border-slate-200 bg-white p-4 text-sm text-slate-600 shadow-sm">
                  <div className="mb-2 flex items-start justify-between gap-3">
                    <div>
                      <p className="font-bold text-slate-800">{entry.patient_name || entry.patient}</p>
                      <p className="text-slate-500">{entry.doctor_name || entry.doctor}</p>
                    </div>
                    <span className={`rounded-full px-3 py-1 text-xs font-bold ${entry.status === 'done' ? 'bg-emerald-50 text-emerald-700' : 'bg-red-50 text-red-600'}`}>
                      {entry.status}
                    </span>
                  </div>
                  <p>Queue #{entry.queue_number} • {entry.type}</p>
                </div>
              ))}
            </div>
          </section>
        </>
      )}

      {showModal && <WalkInModal doctors={doctors} onClose={() => setShowModal(false)} onSubmit={handleRegisterWalkIn} />}
    </div>
  )
}

export default StaffWalkInQueue
