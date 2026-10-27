const crypto = require('crypto')
const { getTodayDateOnly } = require('./date')

const PAYMENT_METHODS = new Set(['cash', 'gcash', 'maya', 'bank_transfer', 'qrph'])

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

// Preserve the global allocator only for displaying historical receipts;
// every new receipt MUST carry the verified billing-record branch ID.
const allocateReceiptNumber = async (executor, branchId, now = new Date()) => {
  const id = Number(branchId)
  if (!Number.isSafeInteger(id) || id <= 0) {
    throw Object.assign(new Error('Verified billing branch required for receipt allocation.'), { statusCode: 403, code: 'BRANCH_REQUIRED' })
  }
  const [[branch]] = await executor.query(
    'SELECT code FROM clinic_branches WHERE id=? AND is_active=1 LIMIT 1', [id]
  )
  if (!branch?.code) throw Object.assign(new Error('Branch is unavailable.'), { statusCode: 404, code: 'BRANCH_NOT_FOUND' })
  const branchCode = String(branch.code).toUpperCase().replace(/[^A-Z0-9-]/g, '')
  if (!branchCode) throw new Error('Invalid branch receipt prefix.')
  await executor.query('INSERT IGNORE INTO branch_receipt_sequences (branch_id,last_number) VALUES (?,0)', [id])
  const [result] = await executor.query(
    'UPDATE branch_receipt_sequences SET last_number=LAST_INSERT_ID(last_number+1) WHERE branch_id=?', [id]
  )
  const sequence = Number(result?.insertId)
  if (!Number.isSafeInteger(sequence) || sequence <= 0) {
    throw Object.assign(new Error('Unable to allocate a receipt number. Please retry.'), { statusCode: 503, code: 'RECEIPT_SEQUENCE_UNAVAILABLE' })
  }
  return { sequence, receiptNumber: `OR-${branchCode}-${clinicReceiptDate(now)}-${String(sequence).padStart(RECEIPT_SEQUENCE_DIGITS,'0')}` }
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


