const { otpRequestLimiter, resetRateLimitStores } = require('../../middlewares/rateLimit.middleware')

const invoke = (middleware, req) => new Promise((resolve, reject) => {
  let settled = false
  const res = {
    headers: {},
    setHeader(name, value) { this.headers[name] = value },
    status(code) { this.statusCode = code; return this },
    json(body) {
      if (!settled) { settled = true; resolve({ next: false, status: this.statusCode || 200, body, headers: this.headers }) }
      return this
    },
  }
  try {
    middleware(req, res, () => {
      if (!settled) { settled = true; resolve({ next: true, status: 200, headers: res.headers }) }
    })
  } catch (error) {
    reject(error)
  }
})

const smsRequest = ({ ip = '10.0.0.1', phone = '09171234567', email = 'first@example.com' } = {}) => ({
  ip,
  socket: { remoteAddress: ip },
  baseUrl: '/api/patient',
  path: '/register',
  body: {
    verification_method: 'sms',
    phone,
    email,
  },
})

describe('rate limit hardening', () => {
  beforeEach(() => {
    delete process.env.DISABLE_RATE_LIMITS
    resetRateLimitStores()
  })

  it('cannot bypass the SMS destination limit by rotating email addresses', async () => {
    for (let i = 0; i < 5; i += 1) {
      const result = await invoke(otpRequestLimiter, smsRequest({ email: `user${i}@example.com` }))
      expect(result.next).toBe(true)
    }

    const blocked = await invoke(otpRequestLimiter, smsRequest({ email: 'another@example.com' }))
    expect(blocked.status).toBe(429)
    expect(blocked.body?.code).toBe('RATE_LIMITED')
    expect(Number(blocked.headers['Retry-After'] || 0)).toBeGreaterThan(0)
  })

  it('also limits one IP that rotates many OTP destinations', async () => {
    for (let i = 0; i < 25; i += 1) {
      const phone = `0917${String(1000000 + i).slice(-7)}`
      const result = await invoke(otpRequestLimiter, smsRequest({ phone, email: `rotate${i}@example.com` }))
      expect(result.next).toBe(true)
    }

    const blocked = await invoke(otpRequestLimiter, smsRequest({ phone: '09179999999', email: 'last@example.com' }))
    expect(blocked.status).toBe(429)
    expect(blocked.body?.code).toBe('RATE_LIMITED')
  })
})
