const stores = new Map()

const normalizePart = (value) => String(value ?? '').trim().toLowerCase().slice(0, 220)
const getClientIp = (req) => normalizePart(req.ip || req.socket?.remoteAddress || 'unknown')
const routeScope = (req) => normalizePart(`${req.baseUrl || ''}${req.path || req.originalUrl || ''}`)
const normalizePhoneKey = (value) => String(value || '').replace(/\D/g, '').slice(-15)

const pruneStore = (store, now, maxEntries) => {
  for (const [key, value] of store) {
    if (!value || Number(value.resetAt || 0) <= now) store.delete(key)
  }
  while (store.size > maxEntries) {
    const firstKey = store.keys().next().value
    if (firstKey === undefined) break
    store.delete(firstKey)
  }
}

const createRateLimiter = ({
  name,
  windowMs,
  max,
  keyGenerator,
  message = 'Too many requests. Please try again later.',
  maxEntries = 10000,
}) => {
  if (!stores.has(name)) stores.set(name, new Map())
  const store = stores.get(name)
  let lastPruneAt = 0

  return (req, res, next) => {
    // Tests should exercise rate limiting by default. Use this explicit escape hatch
    // only for suites that intentionally need to disable all limiter state.
    if (String(process.env.DISABLE_RATE_LIMITS || '') === '1') return next()

    const now = Date.now()
    if (now - lastPruneAt >= Math.min(windowMs, 60 * 1000) || store.size > maxEntries) {
      pruneStore(store, now, maxEntries)
      lastPruneAt = now
    }

    const generatedKey = keyGenerator ? keyGenerator(req) : getClientIp(req)
    const key = normalizePart(generatedKey) || 'unknown'
    const current = store.get(key)

    if (!current || current.resetAt <= now) {
      store.set(key, { count: 1, resetAt: now + windowMs })
      return next()
    }

    current.count += 1
    if (current.count > max) {
      const retryAfter = Math.max(1, Math.ceil((current.resetAt - now) / 1000))
      res.setHeader('Retry-After', String(retryAfter))
      res.setHeader('Cache-Control', 'no-store')
      return res.status(429).json({
        code: 'RATE_LIMITED',
        message,
        retry_after_seconds: retryAfter,
      })
    }

    return next()
  }
}

const combineLimiters = (...limiters) => (req, res, next) => {
  let index = 0
  const run = () => {
    const limiter = limiters[index++]
    if (!limiter) return next()
    return limiter(req, res, run)
  }
  return run()
}

const loginIdentityKey = (req) => {
  const body = req.body || {}
  const phone = normalizePhoneKey(body.phone)
  const identity = normalizePart(body.email) || phone || normalizePart(body.username) || normalizePart(body.role) || 'unknown-account'
  return `${normalizePart(body.role || 'account')}:${identity}`
}

const otpChannel = (req) => {
  const body = req.body || {}
  const explicit = normalizePart(body.verification_method || body.delivery_method || body.method)
  if (explicit === 'sms' || explicit === 'email') return explicit
  if (body.phone && !body.email) return 'sms'
  return 'email'
}

const otpDestinationKey = (req) => {
  const body = req.body || {}
  const channel = otpChannel(req)
  let identity = ''

  if (channel === 'sms') identity = normalizePhoneKey(body.phone)
  else identity = normalizePart(body.email)

  identity = identity
    || normalizePart(body.identifier)
    || normalizePart(body.challenge_token)
    || normalizePart(body.resetToken)
    || (req.user?.id ? `${normalizePart(req.user.role)}:${req.user.id}` : '')
    || normalizePart(body.role)
    || 'anonymous'

  return `${routeScope(req)}:${channel}:${identity}`
}

const clinicalUploadKey = (req) => `${req.user?.id || 'anonymous'}:${Number(req.query?.appointment_id || req.body?.appointment_id || 0) || 'no-appointment'}`

const loginIpLimiter = createRateLimiter({
  name: 'login-ip',
  windowMs: 15 * 60 * 1000,
  max: 30,
  keyGenerator: getClientIp,
  message: 'Too many sign-in attempts from this connection. Please wait 15 minutes and try again.',
})
const loginAccountLimiter = createRateLimiter({
  name: 'login-account',
  windowMs: 15 * 60 * 1000,
  max: 8,
  keyGenerator: loginIdentityKey,
  message: 'Too many sign-in attempts for this account. Please wait 15 minutes and try again.',
})
const loginLimiter = combineLimiters(loginIpLimiter, loginAccountLimiter)

const otpRequestIpLimiter = createRateLimiter({
  name: 'otp-request-ip',
  windowMs: 60 * 60 * 1000,
  max: 25,
  keyGenerator: getClientIp,
  message: 'Too many verification-code requests from this connection. Please try again later.',
})
const otpRequestDestinationLimiter = createRateLimiter({
  name: 'otp-request-destination',
  windowMs: 60 * 60 * 1000,
  max: 5,
  keyGenerator: otpDestinationKey,
  message: 'Too many verification-code requests for this destination. Please try again later.',
})
const otpRequestLimiter = combineLimiters(otpRequestIpLimiter, otpRequestDestinationLimiter)

const otpVerifyIpLimiter = createRateLimiter({
  name: 'otp-verify-ip',
  windowMs: 15 * 60 * 1000,
  max: 40,
  keyGenerator: getClientIp,
  message: 'Too many verification attempts from this connection. Please request a new code later.',
})
const otpVerifyDestinationLimiter = createRateLimiter({
  name: 'otp-verify-destination',
  windowMs: 15 * 60 * 1000,
  max: 10,
  keyGenerator: otpDestinationKey,
  message: 'Too many verification attempts. Please request a new code.',
})
const otpVerifyLimiter = combineLimiters(otpVerifyIpLimiter, otpVerifyDestinationLimiter)

const queueDisplayLimiter = createRateLimiter({
  name: 'queue-display',
  windowMs: 15 * 60 * 1000,
  max: 8,
  keyGenerator: getClientIp,
  message: 'Too many queue display PIN attempts. Please wait 15 minutes and try again.',
})

const clinicalUploadIpLimiter = createRateLimiter({
  name: 'clinical-upload-ip',
  windowMs: 15 * 60 * 1000,
  max: 60,
  keyGenerator: getClientIp,
  message: 'Too many clinical image uploads from this connection. Please wait before trying again.',
})
const clinicalUploadDoctorLimiter = createRateLimiter({
  name: 'clinical-upload-doctor-appointment',
  windowMs: 15 * 60 * 1000,
  max: 20,
  keyGenerator: clinicalUploadKey,
  message: 'Too many clinical image uploads for this appointment. Please wait before trying again.',
})
const clinicalUploadLimiter = combineLimiters(clinicalUploadIpLimiter, clinicalUploadDoctorLimiter)

// Scan status is polled by the client, so it receives a much larger but still bounded allowance.
const clinicalUploadStatusLimiter = createRateLimiter({
  name: 'clinical-upload-status',
  windowMs: 15 * 60 * 1000,
  max: 180,
  keyGenerator: clinicalUploadKey,
  message: 'Too many clinical image scan checks. Please wait before trying again.',
})

const resetRateLimitStores = () => {
  for (const store of stores.values()) store.clear()
}

module.exports = {
  createRateLimiter,
  combineLimiters,
  loginLimiter,
  otpRequestLimiter,
  otpVerifyLimiter,
  queueDisplayLimiter,
  clinicalUploadLimiter,
  clinicalUploadStatusLimiter,
  getClientIp,
  resetRateLimitStores,
}

