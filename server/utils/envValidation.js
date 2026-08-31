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
  if (production) required.push('DB_PASS', 'CLIENT_URL')

  for (const key of required) {
    if (!isNonEmpty(process.env[key])) errors.push(`${key} is required${production ? ' in production' : ''}.`)
  }

  if (production) {
    const clientOrigins = String(process.env.CLIENT_URL || '').split(',').map((value) => value.trim()).filter(Boolean)
    if (clientOrigins.some((origin) => !validateUrl(origin))) {
      errors.push('Every CLIENT_URL entry must be a valid http(s) origin.')
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
    if (String(process.env.ADMIN_MFA_ENABLED || 'true').toLowerCase() !== 'false') {
      if (!isNonEmpty(process.env.EMAIL_USER) || !isNonEmpty(process.env.EMAIL_PASS)) {
        errors.push('EMAIL_USER and EMAIL_PASS are required when administrator MFA is enabled.')
      }
    }
    if (String(process.env.SMS_PROVIDER || 'semaphore').toLowerCase() === 'semaphore' && !isNonEmpty(process.env.SEMAPHORE_API_KEY)) {
      warnings.push('SEMAPHORE_API_KEY is empty; patient SMS verification/reminders will not work.')
    }
    if (![process.env.CLOUDINARY_CLOUD_NAME, process.env.CLOUDINARY_API_KEY, process.env.CLOUDINARY_API_SECRET].every(isNonEmpty)) {
      warnings.push('Cloudinary signed-upload credentials are incomplete; consultation/progress image uploads will be unavailable.')
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
