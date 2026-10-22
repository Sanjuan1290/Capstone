'use strict'
const crypto = require('node:crypto')
const verifyPaymongoSignature = (raw, header, secret, nowSeconds = Date.now()/1000, mode = 'test') => {
  if (!Buffer.isBuffer(raw) || raw.length > 256*1024 || !secret || !header) return false
  const fields = Object.fromEntries(String(header).split(',').map(pair => pair.trim().split('=').map(s => s.trim())).filter(pair => pair.length === 2))
  const signatureField = mode === 'live' ? 'li' : mode === 'test' ? 'te' : ''
  if (!signatureField || !/^\d{9,12}$/.test(fields.t || '') || !/^[a-f0-9]{64}$/i.test(fields[signatureField] || '')) return false
  if (Math.abs(nowSeconds - Number(fields.t)) > 300) return false
  const expected = crypto.createHmac('sha256', secret).update(`${fields.t}.`).update(raw).digest()
  const signed = Buffer.from(fields[signatureField], 'hex')
  return signed.length === expected.length && crypto.timingSafeEqual(expected, signed)
}
module.exports = { verifyPaymongoSignature }


