const stores = new Map()

const normalizePart = (value) => String(value || '').trim().toLowerCase().slice(0, 160)
const getClientIp = (req) => normalizePart(req.ip || req.socket?.remoteAddress || 'unknown')

const createRateLimiter = ({ name, windowMs, max, keyGenerator, message = 'Too many requests. Please try again later.' }) => {
  if (!stores.has(name)) stores.set(name, new Map())
  const store = stores.get(name)

  return (req, res, next) => {
    if (process.env.NODE_ENV === 'test') return next()
    const now = Date.now()
    const key = normalizePart(keyGenerator ? keyGenerator(req) : getClientIp(req)) || 'unknown'
    const current = store.get(key)
    if (!current || current.resetAt <= now) {
      store.set(key, { count: 1, resetAt: now + windowMs })
      return next()
    }
    current.count += 1
    if (current.count > max) {
      const retryAfter = Math.max(1, Math.ceil((current.resetAt - now) / 1000))
      res.setHeader('Retry-After', String(retryAfter))
      return res.status(429).json({ code: 'RATE_LIMITED', message, retry_after_seconds: retryAfter })
    }
    return next()
  }
}

const accountKey = (req) => {
  const identity = req.body?.email || req.body?.phone || req.body?.role || ''
  return `${getClientIp(req)}:${normalizePart(identity)}`
}

const loginLimiter = createRateLimiter({ name: 'login', windowMs: 15 * 60 * 1000, max: 5, keyGenerator: accountKey, message: 'Too many sign-in attempts. Please wait 15 minutes and try again.' })
const otpRequestLimiter = createRateLimiter({ name: 'otp-request', windowMs: 60 * 60 * 1000, max: 5, keyGenerator: accountKey, message: 'Too many verification-code requests. Please try again later.' })
const otpVerifyLimiter = createRateLimiter({ name: 'otp-verify', windowMs: 15 * 60 * 1000, max: 10, keyGenerator: accountKey, message: 'Too many verification attempts. Please request a new code.' })
const queueDisplayLimiter = createRateLimiter({ name: 'queue-display', windowMs: 15 * 60 * 1000, max: 8, keyGenerator: getClientIp, message: 'Too many queue display PIN attempts. Please wait 15 minutes and try again.' })

module.exports = { createRateLimiter, loginLimiter, otpRequestLimiter, otpVerifyLimiter, queueDisplayLimiter, getClientIp }
