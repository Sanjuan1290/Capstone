'use strict'
// TEST and LIVE use separate PayMongo key sets; live payment creation requires explicit activation.
const { configuredMode, supportsMode, isLiveCollectionEnabled } = require('./paymongoMode')
const API = 'https://api.paymongo.com/v1'
const fail = (message, statusCode = 502, code = 'PAYMONGO_ERROR') => Object.assign(new Error(message), { statusCode, code })
const credentials = () => {
  const mode = configuredMode()
  if (!supportsMode(mode)) throw fail('Configure PAYMONGO_MODE=test or live.', 503, 'PAYMONGO_DISABLED')
  const secret = String(process.env.PAYMONGO_SECRET_KEY || '')
  const publicKey = String(process.env.PAYMONGO_PUBLIC_KEY || '')
  if (!secret.startsWith(`sk_${mode}_`) || !publicKey.startsWith(`pk_${mode}_`)) {
    throw fail(`Configure matching PayMongo ${mode.toUpperCase()} credentials.`, 503, 'PAYMONGO_KEYS_MISMATCH')
  }
  return { secret, publicKey, mode }
}
const request = async (path, { body, keyType = 'secret', idempotencyKey } = {}) => {
  const keys = credentials()
  const key = keyType === 'public' ? keys.publicKey : keys.secret
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), 12000)
  try {
    const response = await fetch(`${API}${path}`, {
      method: body ? 'POST' : 'GET', signal: controller.signal,
      headers: { 'Authorization': `Basic ${Buffer.from(`${key}:`).toString('base64')}`, 'Content-Type': 'application/json',
        ...(idempotencyKey ? { 'Idempotency-Key': idempotencyKey } : {}) },
      ...(body ? { body: JSON.stringify({ data: { attributes: body } }) } : {}),
    })
    const json = await response.json().catch(() => null)
    if (!response.ok || !json?.data) throw fail(`PayMongo ${response.status} - could not process this QR payment.`, response.status >= 500 ? 502 : 409)
    return json.data
  } catch (error) {
    if (error.name === 'AbortError') throw fail('PayMongo request timed out; payment status needs review.', 503, 'PAYMONGO_TIMEOUT')
    throw error
  } finally { clearTimeout(timer) }
}
const createQr = async ({ amountCentavos, billId, attemptId, onIntentCreated }) => {
  const { mode } = credentials()
  if (mode === 'live' && !isLiveCollectionEnabled()) throw fail('Live QR collection is disabled until explicitly activated.', 503, 'PAYMONGO_LIVE_NOT_ENABLED')
  const intent = await request('/payment_intents', { body: {
    amount: amountCentavos, currency: 'PHP', payment_method_allowed: ['qrph'],
    description: `CARAIT bill ${billId} (attempt ${attemptId})`,
  }, idempotencyKey: `carait-qr-intent-${attemptId}` })
  if (intent.id && onIntentCreated) await onIntentCreated(intent.id)
  const clientKey = intent.attributes?.client_key
  if (!intent.id || !clientKey) throw fail('PayMongo did not supply a payment intent client key.')
  const paymentMethod = await request('/payment_methods', { keyType: 'public', body: { type: 'qrph' }, idempotencyKey: `carait-qr-method-${attemptId}` })
  if (!paymentMethod.id) throw fail('PayMongo did not supply a QR payment method.')
  const attached = await request(`/payment_intents/${encodeURIComponent(intent.id)}/attach`, {
    keyType: 'public', body: { payment_method: paymentMethod.id, client_key: clientKey }, idempotencyKey: `carait-qr-attach-${attemptId}`,
  })
  const code = attached.attributes?.next_action?.code
  const qrImage = String(code?.image_url || '')
  if (!qrImage || qrImage.length > 300000) throw fail('PayMongo did not return a usable QR image.')
  return { intentId: intent.id, qrImage: qrImage.startsWith('data:image/') ? qrImage : `data:image/png;base64,${qrImage}`,
    testUrl: mode === 'test' ? code?.test_url || attached.attributes?.next_action?.test_url || null : null,
    status: attached.attributes?.status }
}
const retrieveIntent = id => request(`/payment_intents/${encodeURIComponent(id)}`)
const retrieveRefund = id => request(`/refunds/${encodeURIComponent(id)}`)
module.exports = { credentials, createQr, retrieveIntent, retrieveRefund, fail }


