const crypto = require('crypto')
const { getTodayDateOnly } = require('./date')

const PAYMENT_METHODS = new Set(['cash', 'gcash', 'maya', 'bank_transfer'])

const isValidPaymentMethod = (value) => PAYMENT_METHODS.has(String(value || '').trim().toLowerCase())

const requiresPaymentReference = (value) => {
  const method = String(value || '').trim().toLowerCase()
  return method !== 'cash' && isValidPaymentMethod(method)
}

// Clinic-local (Asia/Manila) calendar date as YYYYMMDD. toISOString() is UTC and
// would stamp payments made before 8:00 AM Manila time with the previous day.
const clinicReceiptDate = (now = new Date()) => getTodayDateOnly(now).replace(/-/g, '')

// Legacy format kept for older callers/tests. New payments use allocateReceiptNumber().
const makeReceiptNumber = (billingId, now = new Date(), randomHex) => {
  const date = clinicReceiptDate(now)
  const suffix = String(randomHex || crypto.randomBytes(3).toString('hex')).slice(0, 6).toUpperCase()
  return `OR-${date}-${Number(billingId)}-${suffix}`
}

const RECEIPT_SEQUENCE_DIGITS = 6

const formatSequentialReceiptNumber = (sequence, now = new Date()) => {
  const number = Math.max(1, Math.trunc(Number(sequence) || 0))
  return `OR-${clinicReceiptDate(now)}-${String(number).padStart(RECEIPT_SEQUENCE_DIGITS, '0')}`
}

// Allocates the next receipt number from one clinic-wide counter. It must run inside
// the payment transaction: the counter row stays locked until commit, so receipts are
// issued strictly in order, and a rolled-back payment also rolls back its number
// (no gaps, no duplicates).
const allocateReceiptNumber = async (executor, now = new Date()) => {
  await executor.query('INSERT IGNORE INTO billing_receipt_sequence (id, last_number) VALUES (1, 0)')
  const [result] = await executor.query(
    'UPDATE billing_receipt_sequence SET last_number = LAST_INSERT_ID(last_number + 1) WHERE id = 1'
  )
  const sequence = Number(result?.insertId || 0)
  if (!sequence) throw Object.assign(new Error('Unable to allocate a receipt number. Please retry.'), { statusCode: 503, code: 'RECEIPT_SEQUENCE_UNAVAILABLE' })
  return { sequence, receiptNumber: formatSequentialReceiptNumber(sequence, now) }
}

const calculatePaymentAmounts = ({ totalAmount, amountReceived }) => {
  const total = Math.max(0, Math.round((Number(totalAmount) || 0) * 100) / 100)
  const received = amountReceived === '' || amountReceived === null || amountReceived === undefined
    ? total
    : Math.max(0, Math.round((Number(amountReceived) || 0) * 100) / 100)

  return {
    total,
    amountReceived: received,
    changeAmount: Math.max(0, Math.round((received - total) * 100) / 100),
    isSufficient: received >= total,
  }
}

module.exports = {
  PAYMENT_METHODS,
  isValidPaymentMethod,
  requiresPaymentReference,
  makeReceiptNumber,
  formatSequentialReceiptNumber,
  allocateReceiptNumber,
  calculatePaymentAmounts,
}



