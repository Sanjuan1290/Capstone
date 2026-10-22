const isNonEmpty = (value) => String(value || '').trim().length > 0

const validateUrl = (value) => {
  try {
    const url = new URL(String(value || '').trim())
    return ['http:', 'https:'].includes(url.protocol)
  } catch {
    return false
  }
}

const validateRuntimeConfig = ({ production = process.env.NODE_ENV === 'production' } = {}) => {
  const errors = []
  const warnings = []
  const required = ['DB_HOST', 'DB_USER', 'DB_NAME', 'JWT_SECRET']
  if (production) required.push('CLIENT_URL')

  for (const key of required) {
    if (!isNonEmpty(process.env[key])) errors.push(`${key} is required${production ? ' in production' : ''}.`)
  }

  if (production && !isNonEmpty(process.env.DB_PASSWORD) && !isNonEmpty(process.env.DB_PASS)) {
    errors.push('DB_PASSWORD or DB_PASS is required in production.')
  }

  if (String(process.env.DB_PROVIDER || 'mysql').toLowerCase() === 'tidb' && String(process.env.DB_SSL || 'true').toLowerCase() !== 'true') {
    errors.push('DB_SSL=true is required for TiDB Cloud.')
  }
  if (process.env.DB_PORT && (!/^\d+$/.test(process.env.DB_PORT) || Number(process.env.DB_PORT) < 1 || Number(process.env.DB_PORT) > 65535)) {
    errors.push('DB_PORT must be between 1 and 65535.')
  }
  const paymentMode = String(process.env.PAYMONGO_MODE || '').trim().toLowerCase()
  if (paymentMode && !['test', 'live'].includes(paymentMode)) errors.push('PAYMONGO_MODE must be empty, test, or live.')
  const paymongoCredentialsConfigured = ['PAYMONGO_SECRET_KEY', 'PAYMONGO_PUBLIC_KEY', 'PAYMONGO_WEBHOOK_SECRET']
    .some((key) => isNonEmpty(process.env[key]))
  if (!paymentMode && paymongoCredentialsConfigured) {
    errors.push('PAYMONGO_MODE is required when any PayMongo credential is configured.')
  }
  if (paymentMode && !String(process.env.PAYMONGO_SECRET_KEY || '').startsWith(`sk_${paymentMode}_`)) {
    errors.push(`PAYMONGO_SECRET_KEY must match PAYMONGO_MODE=${paymentMode}.`)
  }
  if (paymentMode && !String(process.env.PAYMONGO_PUBLIC_KEY || '').startsWith(`pk_${paymentMode}_`)) {
    errors.push(`PAYMONGO_PUBLIC_KEY must match PAYMONGO_MODE=${paymentMode}.`)
  }
  if (paymentMode && !String(process.env.PAYMONGO_WEBHOOK_SECRET || '').startsWith('whsk_')) {
    errors.push('PAYMONGO_WEBHOOK_SECRET must be configured for the selected PayMongo mode.')
  }
  const liveEnabledValue = String(process.env.PAYMONGO_LIVE_ENABLED ?? 'false').trim()
  if (!['true', 'false'].includes(liveEnabledValue)) {
    errors.push('PAYMONGO_LIVE_ENABLED must be true or false.')
  }
  if (liveEnabledValue === 'true' && paymentMode !== 'live') {
    errors.push('PAYMONGO_LIVE_ENABLED=true requires PAYMONGO_MODE=live.')
  }
  if (paymentMode === 'live' && liveEnabledValue !== 'true') {
    warnings.push('PayMongo LIVE credentials configured; creating new live QR payments remains disabled until PAYMONGO_LIVE_ENABLED=true.')
  }
  if (String(process.env.TRUST_PROXY || '').toLowerCase() === 'true') {
    errors.push('TRUST_PROXY=true is not supported. Use the signed Cloudflare Pages proxy boundary instead.')
  }

  if (String(process.env.EMAIL_PROVIDER || 'resend').toLowerCase() !== 'resend') {
    errors.push('EMAIL_PROVIDER must be resend; SMTP is not supported.')
  }
  if (production) {
    if (String(process.env.API_PROXY_SECRET || '').length < 32) {
      errors.push('API_PROXY_SECRET must be at least 32 characters in production and match the Cloudflare Pages Function secret.')
    }
    const clientOrigins = String(process.env.CLIENT_URL || '').split(',').map((value) => value.trim()).filter(Boolean)
    if (clientOrigins.some((origin) => !validateUrl(origin) || new URL(origin).protocol !== 'https:' || new URL(origin).origin !== origin)) {
      errors.push('Every production CLIENT_URL entry must be an HTTPS origin without a path or trailing slash.')
    }
    if (clientOrigins.some((origin) => /localhost|127\.0\.0\.1/i.test(origin))) {
      errors.push('CLIENT_URL must not point to localhost in production.')
    }
    if (String(process.env.JWT_SECRET || '').length < 32) {
      errors.push('JWT_SECRET must be at least 32 characters in production.')
    }
    if (String(process.env.RUN_SCHEMA_MIGRATIONS_ON_STARTUP || 'false').toLowerCase() === 'true') {
      warnings.push('RUN_SCHEMA_MIGRATIONS_ON_STARTUP=true. Prefer running `npm run migrate` before starting production traffic.')
    }
    if (!isNonEmpty(process.env.RESEND_API_KEY) || !isNonEmpty(process.env.EMAIL_FROM)) {
      errors.push('RESEND_API_KEY and EMAIL_FROM are required for production email delivery.')
    }
    const queueDisplayPin = String(process.env.QUEUE_DISPLAY_PIN || '').trim()
    if (!/^\d{6,12}$/.test(queueDisplayPin)) {
      errors.push('QUEUE_DISPLAY_PIN must be a 6-12 digit PIN in production.')
    } else if (queueDisplayPin === '123456') {
      errors.push('QUEUE_DISPLAY_PIN must not use the local-development default 123456 in production.')
    }
    if (String(process.env.SMS_PROVIDER || 'semaphore').toLowerCase() === 'semaphore' && !isNonEmpty(process.env.SEMAPHORE_API_KEY)) {
      warnings.push('SEMAPHORE_API_KEY is empty; patient SMS verification/reminders will not work.')
    }
    if (![process.env.CLOUDINARY_CLOUD_NAME, process.env.CLOUDINARY_API_KEY, process.env.CLOUDINARY_API_SECRET].every(isNonEmpty)) {
      warnings.push('Cloudinary signed-upload credentials are incomplete; clinical and payment QR image uploads will be unavailable.')
    }
  }

  if (errors.length) {
    const error = new Error(`Invalid runtime configuration:\n- ${errors.join('\n- ')}`)
    error.code = 'INVALID_RUNTIME_CONFIG'
    error.details = errors
    error.warnings = warnings
    throw error
  }

  return { warnings }
}

module.exports = { validateRuntimeConfig }







