// Display-only queue labels; database queue_number remains numeric.
export const formatQueueLabel = ({ queueNo, queue_number, type, doctorId, doctor_id } = {}) => {
  const numeric = Number(queueNo ?? queue_number)
  if (!Number.isSafeInteger(numeric) || numeric < 1) return '—'
  const prefix = type === 'derma' ? 'DER' : 'MED'
  const doctor = Number(doctorId ?? doctor_id)
  const doctorPart = Number.isSafeInteger(doctor) && doctor > 0 ? `-D${doctor}` : ''
  return `${prefix}${doctorPart}-${String(numeric).padStart(3, '0')}`
}
