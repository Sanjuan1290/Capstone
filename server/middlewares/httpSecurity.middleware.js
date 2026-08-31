const getAllowedOrigins = () => new Set(
  String(process.env.CLIENT_URL || 'http://localhost:5173')
    .split(',')
    .map((value) => value.trim())
    .filter(Boolean)
)

const securityHeaders = (req, res, next) => {
  res.setHeader('X-Content-Type-Options', 'nosniff')
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin')
  res.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=()')
  res.setHeader('X-Frame-Options', 'DENY')
  res.setHeader(
    'Content-Security-Policy',
    "default-src 'self'; img-src 'self' data: blob: https://res.cloudinary.com; style-src 'self' 'unsafe-inline'; script-src 'self'; connect-src 'self' https://api.cloudinary.com; frame-src 'self' https://www.google.com https://maps.google.com; object-src 'none'; base-uri 'self'; frame-ancestors 'none'; form-action 'self'"
  )
  if (process.env.NODE_ENV === 'production') {
    res.setHeader('Strict-Transport-Security', 'max-age=31536000; includeSubDomains')
  }
  next()
}

const originGuard = (req, res, next) => {
  if (!['POST', 'PUT', 'PATCH', 'DELETE'].includes(req.method)) return next()
  if (process.env.NODE_ENV === 'test') return next()
  const origin = req.get('origin')
  // Non-browser same-host jobs and test/CLI requests may not include Origin. In production,
  // require it for requests carrying one of our auth cookies.
  const hasAuthCookie = ['admin_token', 'staff_token', 'doctor_token', 'patient_token'].some((name) => Boolean(req.cookies?.[name]))
  if (!origin) {
    if (process.env.NODE_ENV === 'production' && hasAuthCookie) {
      return res.status(403).json({ code: 'ORIGIN_REQUIRED', message: 'Request origin could not be verified.' })
    }
    return next()
  }
  if (!getAllowedOrigins().has(origin)) {
    console.warn('[security] rejected origin', { origin, method: req.method, path: req.originalUrl, ip: req.ip })
    return res.status(403).json({ code: 'ORIGIN_REJECTED', message: 'Request origin is not allowed.' })
  }
  next()
}

module.exports = { securityHeaders, originGuard, getAllowedOrigins }
