// Display-only queue labels; database queue_number remains numeric.
export const formatQueueLabel = ({ queueNo, queue_number, type } = {}) => {
  const numeric = Number(queueNo ?? queue_number)
  if (!Number.isSafeInteger(numeric) || numeric < 1) return '—'
  const prefix = type === 'derma' ? 'DER' : 'MED'
  return `${prefix}-${String(numeric).padStart(3, '0')}`
}
