const db = require('../db/connect')

const MAX_REASON_LABEL = 120
const MAX_DETAILS = 500

const makeInputError = (message, code = 'INVALID_CANCELLATION_REASON') => {
  const error = new Error(message)
  error.statusCode = 400
  error.code = code
  return error
}

const normalizeCancellationDetails = (value) => {
  const details = String(value || '').trim()
  if (details.length > MAX_DETAILS) throw makeInputError(`Cancellation details must be ${MAX_DETAILS} characters or fewer.`, 'CANCELLATION_DETAILS_TOO_LONG')
  return details || null
}

const listCancellationReasons = async ({ activeOnly = true, executor = db } = {}) => {
  const where = activeOnly ? 'WHERE is_active = 1' : ''
  const [rows] = await executor.query(
    `SELECT id, label, is_active, sort_order, created_at, updated_at
     FROM appointment_cancellation_reasons
     ${where}
     ORDER BY sort_order ASC, label ASC`
  )
  return rows
}

const resolveCancellationInput = async (body = {}, executor = db) => {
  const rawId = body?.cancellation_reason_id
  const useOther = body?.cancellation_reason_other === true
    || body?.cancellation_reason_other === 1
    || String(rawId || '').trim().toLowerCase() === 'other'
  const details = normalizeCancellationDetails(body?.cancellation_details)

  if (useOther) {
    if (!details) throw makeInputError('Please explain the cancellation reason when selecting Other.', 'OTHER_CANCELLATION_DETAILS_REQUIRED')
    return {
      cancellation_reason_id: null,
      cancellation_reason_snapshot: 'Other',
      cancellation_details: details,
    }
  }

  const reasonId = Number(rawId)
  if (!Number.isInteger(reasonId) || reasonId <= 0) {
    throw makeInputError('Select a reason for cancellation.', 'CANCELLATION_REASON_REQUIRED')
  }

  const [rows] = await executor.query(
    `SELECT id, label
     FROM appointment_cancellation_reasons
     WHERE id = ? AND is_active = 1
     LIMIT 1`,
    [reasonId]
  )
  const reason = rows[0]
  if (!reason) throw makeInputError('That cancellation reason is no longer available. Choose another reason.', 'CANCELLATION_REASON_INACTIVE')
  const label = String(reason.label || '').trim().slice(0, MAX_REASON_LABEL)

  return {
    cancellation_reason_id: reason.id,
    cancellation_reason_snapshot: label,
    cancellation_details: details,
  }
}

module.exports = {
  MAX_REASON_LABEL,
  MAX_DETAILS,
  listCancellationReasons,
  resolveCancellationInput,
}
