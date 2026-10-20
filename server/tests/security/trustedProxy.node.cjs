'use strict'

const test = require('node:test')
const assert = require('node:assert/strict')
const crypto = require('node:crypto')
const { trustedProxyClientIp, signatureMessage } = require('../../middlewares/trustedProxy.middleware')
const { loginLimiter, resetRateLimitStores } = require('../../middlewares/rateLimit.middleware')

const secret = 'trusted-proxy-test-secret-at-least-32-characters'
const nowSeconds = String(Math.floor(Date.now() / 1000))
const originalProxySecret = process.env.API_PROXY_SECRET
process.env.API_PROXY_SECRET = secret

const requestFor = ({
  clientIp = '198.51.100.10',
  remoteAddress = '10.0.0.8',
  method = 'POST',
  target = '/api/auth/login',
  timestamp = nowSeconds,
  signingSecret = secret,
  signatureMethod = method,
  signatureTarget = target,
  email = 'one@example.test',
  spoofedForwardedIp = '203.0.113.99',
} = {}) => {
  const signature = crypto.createHmac('sha256', signingSecret)
    .update(signatureMessage({ timestamp, clientIp, method: signatureMethod, target: signatureTarget }))
    .digest('hex')
  const req = {
    method,
    originalUrl: target,
    url: target,
    socket: { remoteAddress },
    headers: {
      'x-carait-client-ip': clientIp,
      'x-carait-proxy-time': timestamp,
      'x-carait-proxy-signature': signature,
      'x-forwarded-for': spoofedForwardedIp,
      'cf-connecting-ip': spoofedForwardedIp,
    },
    body: { role: 'patient', email },
  }
  const next = () => { req.nextCalled = true }
  trustedProxyClientIp(req, {}, next)
  assert.equal(req.nextCalled, true)
  return req
}

test('authenticated Pages IP is used for req.ip and forwarded headers are removed', () => {
  const req = requestFor({ clientIp: '2001:db8::7' })
  assert.equal(req.ip, '2001:db8::7')
  assert.equal(req.clientIp, '2001:db8::7')
  for (const name of ['x-forwarded-for', 'cf-connecting-ip', 'x-carait-client-ip', 'x-carait-proxy-signature']) {
    assert.equal(req.headers[name], undefined)
  }
})

test('direct Render requests cannot spoof client IP with forwarded or invalid signed headers', () => {
  const req = requestFor({ signingSecret: 'attacker-controlled-invalid-secret', spoofedForwardedIp: '192.0.2.77' })
  assert.equal(req.ip, '10.0.0.8')
  assert.equal(req.headers['x-forwarded-for'], undefined)
  assert.equal(req.headers['cf-connecting-ip'], undefined)
})

test('expired signatures and signatures for a different method or URL are not trusted', () => {
  const expired = String(Math.floor(Date.now() / 1000) - 120)
  assert.equal(requestFor({ timestamp: expired }).ip, '10.0.0.8')
  assert.equal(requestFor({ method: 'GET', signatureMethod: 'POST' }).ip, '10.0.0.8')
  assert.equal(requestFor({ target: '/api/auth/login?role=admin', signatureTarget: '/api/auth/login' }).ip, '10.0.0.8')
})

test('shared-network users retain separate account rate limits while sharing authenticated IP attribution', async () => {
  resetRateLimitStores()
  for (let attempt = 0; attempt < 8; attempt += 1) {
    const req = requestFor({ clientIp: '198.51.100.55', email: 'first@example.test' })
    const result = await invokeLogin(req)
    assert.equal(result.next, true)
  }
  const firstAccountBlocked = await invokeLogin(requestFor({ clientIp: '198.51.100.55', email: 'first@example.test' }))
  assert.equal(firstAccountBlocked.status, 429)

  const secondUser = requestFor({ clientIp: '198.51.100.55', email: 'second@example.test' })
  assert.equal(secondUser.ip, '198.51.100.55')
  assert.equal((await invokeLogin(secondUser)).next, true)
})

test('restore proxy secret used by the rest of this process', () => {
  if (originalProxySecret === undefined) delete process.env.API_PROXY_SECRET
  else process.env.API_PROXY_SECRET = originalProxySecret
})

function invokeLogin(req) {
  return new Promise((resolve, reject) => {
    const res = {
      headers: {},
      setHeader(name, value) { this.headers[name] = value },
      status(code) { this.statusCode = code; return this },
      json(body) { resolve({ next: false, status: this.statusCode || 200, body }); return this },
    }
    try {
      loginLimiter(req, res, () => resolve({ next: true, status: 200 }))
    } catch (error) { reject(error) }
  })
}
