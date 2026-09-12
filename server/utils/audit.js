const db = require('../db/connect')

const SENSITIVE_KEYS = new Set([
  'password', 'confirmPassword', 'otp', 'otp_code', 'code', 'token', 'resetToken',
  'authorization', 'cookie', 'session', 'api_key', 'apiKey', 'secret', 'jwt',
])

const maskBankAccount = (value) => {
  const text = String(value || '').replace(/\s+/g, '')
  if (!text) return null
  const tail = text.slice(-4)
  return `•••• •••• ${tail}`
}

const sanitizeAuditValue = (value, key = '') => {
  if (value === null || value === undefined) return value
  const normalizedKey = String(key || '').toLowerCase()
  if (SENSITIVE_KEYS.has(key) || [...SENSITIVE_KEYS].some((candidate) => normalizedKey === candidate.toLowerCase())) {
    return '[REDACTED]'
  }
  if (normalizedKey.includes('password') || normalizedKey.includes('token') || normalizedKey.includes('secret')) {
    return '[REDACTED]'
  }
  if (normalizedKey.includes('bank_account_number')) return maskBankAccount(value)
  if (Array.isArray(value)) return value.map((entry) => sanitizeAuditValue(entry))
  if (typeof value === 'object') {
    return Object.fromEntries(Object.entries(value).map(([childKey, childValue]) => [childKey, sanitizeAuditValue(childValue, childKey)]))
  }
  return value
}

const writeAuditLog = async ({
  userId = null,
  userRole = 'system',
  action,
  entityType,
  entityId = null,
  oldValues = null,
  newValues = null,
  ipAddress = null,
}, executor = db) => {
  if (!action || !entityType) return
  await executor.query(
    `INSERT INTO audit_logs
     (user_id, user_role, action, entity_type, entity_id, old_values, new_values, ip_address)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      userId || null,
      String(userRole || 'system'),
      String(action),
      String(entityType),
      entityId === null || entityId === undefined ? null : String(entityId),
      oldValues === null || oldValues === undefined ? null : JSON.stringify(sanitizeAuditValue(oldValues)),
      newValues === null || newValues === undefined ? null : JSON.stringify(sanitizeAuditValue(newValues)),
      ipAddress || null,
    ]
  )
}

module.exports = {
  sanitizeAuditValue,
  writeAuditLog,
}



