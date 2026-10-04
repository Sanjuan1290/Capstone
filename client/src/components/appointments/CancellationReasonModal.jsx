import { useEffect, useMemo, useState } from 'react'
import { MdClose, MdEventBusy, MdWarningAmber } from 'react-icons/md'

const CancellationReasonModal = ({ open, appointment, loadReasons, onClose, onConfirm }) => {
  const [reasons, setReasons] = useState([])
  const [selected, setSelected] = useState('')
  const [details, setDetails] = useState('')
  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    if (!open) return
    setSelected('')
    setDetails('')
    setError('')
    setLoading(true)
    Promise.resolve(loadReasons?.())
      .then((rows) => setReasons(Array.isArray(rows) ? rows.filter((row) => Number(row.is_active ?? 1) === 1) : []))
      .catch((err) => setError(err.message || 'Could not load cancellation reasons.'))
      .finally(() => setLoading(false))
  }, [open, loadReasons])

  const usingOther = selected === 'other'
  const canSubmit = useMemo(() => Boolean(selected) && (!usingOther || details.trim()), [selected, usingOther, details])

  if (!open) return null

  const submit = async () => {
    if (!canSubmit || saving) return
    setSaving(true)
    setError('')
    try {
      const payload = usingOther
        ? { cancellation_reason_id: null, cancellation_reason_other: true, cancellation_details: details.trim() }
        : { cancellation_reason_id: Number(selected), cancellation_reason_other: false, cancellation_details: details.trim() || null }
      await onConfirm(payload)
      onClose()
    } catch (err) {
      setError(err.message || 'Could not cancel the appointment.')
    } finally {
      setSaving(false)
    }
  }

  const patientName = appointment?.patient_name || appointment?.patient || ''
  const doctorName = appointment?.doctor_name || appointment?.doctor || ''

  return (
    <>
      <div className="fixed inset-0 z-[70] bg-black/45 backdrop-blur-sm" onClick={saving ? undefined : onClose} />
      <div className="fixed inset-x-3 bottom-3 z-[71] mx-auto max-w-lg overflow-hidden rounded-3xl bg-white shadow-2xl sm:bottom-auto sm:top-1/2 sm:-translate-y-1/2">
        <div className="flex items-start justify-between gap-3 border-b border-slate-100 px-5 py-4">
          <div className="flex min-w-0 items-start gap-3">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-red-50 text-red-600"><MdEventBusy /></div>
            <div className="min-w-0">
              <h2 className="font-black text-slate-900">Cancel Appointment</h2>
              <p className="mt-0.5 truncate text-xs text-slate-500">{patientName || doctorName || `Appointment #${appointment?.id || ''}`}</p>
            </div>
          </div>
          <button type="button" disabled={saving} onClick={onClose} className="flex h-9 w-9 items-center justify-center rounded-xl text-slate-400 hover:bg-slate-100 disabled:opacity-40"><MdClose /></button>
        </div>

        <div className="space-y-4 px-5 py-5">
          <div className="flex items-start gap-2.5 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-xs leading-relaxed text-amber-900">
            <MdWarningAmber className="mt-0.5 shrink-0" />
            <p>Cancellation is recorded in the appointment history. Select the reason that best explains why this visit is being cancelled.</p>
          </div>

          <label className="block">
            <span className="form-label">Reason for Cancellation *</span>
            <select className="form-control mt-1.5" value={selected} disabled={loading || saving} onChange={(event) => setSelected(event.target.value)}>
              <option value="">{loading ? 'Loading reasons…' : 'Select a reason'}</option>
              {reasons.map((reason) => <option key={reason.id} value={reason.id}>{reason.label}</option>)}
              <option value="other">Other</option>
            </select>
          </label>

          <label className="block">
            <span className="form-label">{usingOther ? 'Please Explain *' : 'Additional Details (optional)'}</span>
            <textarea
              rows={4}
              maxLength={500}
              className="form-control mt-1.5 resize-none"
              value={details}
              disabled={saving}
              onChange={(event) => setDetails(event.target.value)}
              placeholder={usingOther ? 'Tell the clinic why you need to cancel…' : 'Add any useful context for the clinic…'}
            />
            <span className="mt-1 block text-right text-[10px] text-slate-400">{details.length}/500</span>
          </label>

          {error && <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-xs font-semibold text-red-700">{error}</div>}
        </div>

        <div className="flex justify-end gap-2 border-t border-slate-100 px-5 py-4">
          <button type="button" disabled={saving} onClick={onClose} className="button-secondary">Keep Appointment</button>
          <button type="button" disabled={!canSubmit || saving || loading} onClick={submit} className="button-primary !bg-red-600 hover:!bg-red-700 disabled:opacity-40">{saving ? 'Cancelling…' : 'Cancel Appointment'}</button>
        </div>
      </div>
    </>
  )
}

export default CancellationReasonModal
