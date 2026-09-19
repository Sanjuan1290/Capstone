const crypto = require('crypto')

const PAYMENT_METHODS = new Set(['cash', 'gcash', 'maya', 'bank_transfer'])

const isValidPaymentMethod = (value) => PAYMENT_METHODS.has(String(value || '').trim().toLowerCase())

const requiresPaymentReference = (value) => {
  const method = String(value || '').trim().toLowerCase()
  return method !== 'cash' && isValidPaymentMethod(method)
}

const makeReceiptNumber = (billingId, now = new Date(), randomHex) => {
  const date = now.toISOString().slice(0, 10).replace(/-/g, '')
  const suffix = String(randomHex || crypto.randomBytes(3).toString('hex')).slice(0, 6).toUpperCase()
  return `OR-${date}-${Number(billingId)}-${suffix}`
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
  calculatePaymentAmounts,
}
