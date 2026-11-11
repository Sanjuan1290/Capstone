// Shared database-backed registration SMS quota (across /register and /register/resend).
// Invoke only after the request is valid, immediately before generating a new OTP.
const { createHmac } = require('node:crypto')
const db = require('../db/connect')

const HOUR_MS = 60 * 60 * 1000
const COOLDOWN_MS = 60 * 1000
const MAX_SENDS_PER_HOUR = 3

const databaseTimestampMs = value => {
  if (value instanceof Date) return value.getTime()
  if (typeof value !== 'string') return NaN
  const text = value.trim().replace(' ', 'T')
  if (/(?:Z|[+-]\d{2}:\d{2})$/i.test(text)) return new Date(text).getTime()
  // mysql2 dateStrings values carry no offset. Match connectionOptions rather
  // than interpreting Manila wall-clock time in the Node host's timezone.
  const configured = String(process.env.DB_TIME_ZONE || '')
  const offset = /^[+-]\d{2}:\d{2}$/.test(configured) ? configured : '+08:00'
  return new Date(`${text}${offset}`).getTime()
}

const makeLimitError = (seconds) => Object.assign(
  new Error(`Please wait ${seconds} seconds before asking for another SMS code.`),
  { statusCode: 429, code: 'SMS_LIMIT_REACHED', retryAfterSeconds: seconds }
)

const claimRegistrationSms = async (phone, { connection = null, now = new Date() } = {}) => {
  const secret = process.env.SMS_RATE_LIMIT_SECRET || process.env.JWT_SECRET
  if (!secret || secret.length < 16) {
    throw Object.assign(new Error('SMS verification is temporarily unavailable.'), { statusCode: 503, code: 'SMS_LIMIT_NOT_CONFIGURED' })
  }
  const hashed = createHmac('sha256', secret).update(String(phone)).digest('hex')
  const conn = connection || await db.getConnection()
  const ownsConnection = !connection
  try {
    if (ownsConnection) await conn.beginTransaction()
    // Idempotent row insert; the following FOR UPDATE serializes requests.
    await conn.query('INSERT IGNORE INTO registration_sms_limits (phone_hash, window_start, send_count) VALUES (?, ?, 0)', [hashed, now])
    const [[row]] = await conn.query(
      'SELECT window_start, send_count, last_sent_at FROM registration_sms_limits WHERE phone_hash = ? FOR UPDATE',
      [hashed]
    )
    const start = databaseTimestampMs(row.window_start)
    const last = row.last_sent_at ? databaseTimestampMs(row.last_sent_at) : 0
    const currentMs = new Date(now).getTime()
    const windowExpired = !Number.isFinite(start) || currentMs - start >= HOUR_MS
    const sends = windowExpired ? 0 : Number(row.send_count || 0)
    const cooldown = last && currentMs >= last ? COOLDOWN_MS - (currentMs - last) : 0
    const hourly = !windowExpired && sends >= MAX_SENDS_PER_HOUR ? HOUR_MS - (currentMs - start) : 0
    const remaining = Math.max(cooldown, hourly)
    if (remaining > 0) throw makeLimitError(Math.max(1, Math.ceil(remaining / 1000)))
    await conn.query(
      'UPDATE registration_sms_limits SET window_start = ?, send_count = ?, last_sent_at = ? WHERE phone_hash = ?',
      [windowExpired ? now : row.window_start, sends + 1, now, hashed]
    )
    if (ownsConnection) await conn.commit()
    return { allowed: true, remaining: Math.max(0, MAX_SENDS_PER_HOUR - sends - 1) }
  } catch (error) {
    if (ownsConnection) await conn.rollback()
    throw error
  } finally {
    if (ownsConnection) conn.release()
  }
}

module.exports = { claimRegistrationSms, MAX_SENDS_PER_HOUR, COOLDOWN_MS }
