'use strict'

const crypto = require('node:crypto')
const net = require('node:net')

const PROXY_HEADERS = [
  'x-forwarded-for', 'x-forwarded-host', 'x-forwarded-proto', 'forwarded', 'x-real-ip',
  'cf-connecting-ip', 'x-carait-client-ip', 'x-carait-proxy-time', 'x-carait-proxy-signature',
]
const MAX_SIGNATURE_AGE_SECONDS = 60

const signatureMessage = ({ timestamp, clientIp, method, target }) =>
  `${timestamp}\n${clientIp}\n${String(method || '').toUpperCase()}\n${target}`

function hasValidProxySignature(req, secret, nowMs = Date.now()) {
  if (secret.length < 32) return null
  const clientIp = String(req.headers['x-carait-client-ip'] || '')
  const timestamp = String(req.headers['x-carait-proxy-time'] || '')
  const signature = String(req.headers['x-carait-proxy-signature'] || '')
  if (!net.isIP(clientIp) || !/^\d{10}$/.test(timestamp) || !/^[a-f0-9]{64}$/i.test(signature)) return null
  if (Math.abs(Math.floor(nowMs / 1000) - Number(timestamp)) > MAX_SIGNATURE_AGE_SECONDS) return null

  const expected = crypto.createHmac('sha256', secret)
    .update(signatureMessage({ timestamp, clientIp, method: req.method, target: req.originalUrl || req.url || '/' }))
    .digest()
  const supplied = Buffer.from(signature, 'hex')
  if (supplied.length !== expected.length || !crypto.timingSafeEqual(supplied, expected)) return null
  return clientIp
}

function trustedProxyClientIp(req, _res, next) {
  const remoteAddress = String(req.socket?.remoteAddress || 'unknown')
  const secret = String(process.env.API_PROXY_SECRET || '')
  const trustedIp = hasValidProxySignature(req, secret) || remoteAddress

  // Remove all externally supplied proxy claims before any middleware, audit
  // helper, or limiter can observe them. Render's peer address is the fallback.
  for (const header of PROXY_HEADERS) delete req.headers[header]
  req.clientIp = trustedIp
  // Existing audit and rate-limit code consistently reads req.ip. Shadow
  // Express's proxy-aware getter with the value authenticated above.
  Object.defineProperty(req, 'ip', {
    configurable: true,
    enumerable: true,
    get() { return this.clientIp },
  })
  next()
}

module.exports = { trustedProxyClientIp, hasValidProxySignature, signatureMessage, MAX_SIGNATURE_AGE_SECONDS }
