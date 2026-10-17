'use strict'
// A local admin note is never evidence that an external provider refunded money.
// Test-mode QR Ph: only accept a verified full provider refund for the exact payment.
const assertVerifiedQrRefund = (refund, attempt) => {
  const attrs = refund?.attributes || {}
  if (!/^ref_[a-zA-Z0-9_-]{4,115}$/.test(String(refund?.id || ''))
      || attrs.livemode !== false || attrs.status !== 'succeeded'
      || String(attrs.payment_id || '') !== String(attempt.provider_payment_id || '')
      || String(attrs.currency || '').toUpperCase() !== 'PHP'
      || Number(attrs.amount) !== Number(attempt.amount_centavos)) {
    const error = new Error('The PayMongo refund must be fully succeeded in test mode, and must match the exact payment ID, currency, and amount. A note or pending refund is not sufficient.')
    error.code = 'PROVIDER_REFUND_NOT_VERIFIED'
    error.statusCode = 409
    throw error
  }
  return { refundId: String(refund.id), paymentId: String(attrs.payment_id), amountCentavos: Number(attrs.amount) }
}
module.exports = { assertVerifiedQrRefund }
