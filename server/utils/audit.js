const db = require('../db/connect')

const SENSITIVE_KEYS = new Set([
  'password', 'confirmPassword', 'otp', 'otp_code', 'code', 'token', 'resetToken',
  'authorization', 'cookie', 'session', 'api_key', 'apiKey', 'secret', 'jwt',
])

// Audit entries must never become a second store of clinical notes or credentials.
// Keep structured identifiers and quantities; redact free-text medical/contact content.
const PROTECTED_FIELD = /(?:password|passphrase|otp|pin_code|authorization|cookie|session|api[_-]?key|secret|jwt|bearer|token|medical[_-]?history|diagnos|allerg|symptom|assessment|examination|vitals|treatment[_-]?plan|patient[_-]?history|prescription[_-]?(?:text|body|contents?)|clinical[_-]?notes?|treatment[_-]?notes?|progress[_-]?image|image[_-]?(?:url|data)|file[_-]?(?:url|data)|(?:signed_)?url$|attachment|signed[_-]?url|signature|birthdate|dob|contact[_-]?number|patient[_-]?name|phone|email|street|address|free[_-]?text|notes?$|reason$|message$)/i

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
  if (PROTECTED_FIELD.test(normalizedKey)) {
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
  branchId = null,
  outcome = null,
  actorName = null,
  targetName = null,
  requestId = null,
  correlationId = null,
  failureReasonCode = null,
}, executor = db) => {
  if (!action || !entityType) return
  const withBranch = branchId !== null && branchId !== undefined
  const eventOutcome = ['success', 'failure', 'denied', 'pending'].includes(outcome)
    ? outcome
    : /(?:needs_review|verification_requested|_pending)$/.test(String(action)) ? 'pending'
      : /(?:login_failed|_failed|_blocked|_denied|\.rejected)$/.test(String(action)) ? 'failure' : 'success'
  const compact = (value, maxLength) => value == null ? null : String(value).slice(0, maxLength)
  // Capture actor identity when the event is written; never substitute a future account name.
  // If the account has been removed, the user ID remains the stable reference.
  let actorSnapshot = actorName
  const safeTargetName = targetName || (['consultation','patient','patient_profile','prescription_document'].includes(entityType) ? null : newValues?.item_name || newValues?.service_name || newValues?.category_name || newValues?.name || oldValues?.item_name || oldValues?.service_name || oldValues?.name || null)
  if (!actorSnapshot && userId && ['admin','superadmin','staff','doctor','patient'].includes(userRole)) {
    const table = ({admin:'admins',superadmin:'admins',staff:'staff',doctor:'doctors',patient:'patients'})[userRole]
    try {
      const [[person]] = await executor.query(`SELECT full_name FROM ${table} WHERE id=? LIMIT 1`, [userId])
      if (typeof person?.full_name === 'string' && person.full_name.trim()) actorSnapshot = person.full_name.trim()
    } catch { /* Preserve the business audit even when an account lookup is unavailable. */ }
  }
  await executor.query(
    `INSERT INTO audit_logs
     (user_id, user_role, action, entity_type, entity_id, old_values, new_values, ip_address, outcome, actor_name_snapshot, target_name_snapshot, request_id, correlation_id, failure_reason_code${withBranch ? ', branch_id' : ''})
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?${withBranch ? ', ?' : ''})`,
    [
      userId || null,
      String(userRole || 'system'),
      String(action),
      String(entityType),
      entityId === null || entityId === undefined ? null : String(entityId),
      oldValues === null || oldValues === undefined ? null : JSON.stringify(sanitizeAuditValue(oldValues)),
      newValues === null || newValues === undefined ? null : JSON.stringify(sanitizeAuditValue(newValues)),
      ipAddress || null,
      eventOutcome, compact(actorSnapshot, 180), compact(safeTargetName, 255),
      compact(requestId, 80), compact(correlationId, 80), compact(failureReasonCode, 80),
      ...(withBranch ? [Number(branchId)] : []),
    ]
  )
}

module.exports = {
  sanitizeAuditValue,
  writeAuditLog,
}

