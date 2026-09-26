const db = require('../db/connect')
const bcrypt = require('bcrypt')
const { sendPasswordResetOtp } = require('../utils/emailService')
const { normalizePhilippinePhone } = require('../utils/phone')
const { sendPatientPasswordResetOtp } = require('../utils/smsService')
const { validatePassword } = require('../utils/accountSecurity')
const { makeNumericCode, makeRandomToken, hashSecret, timingSafeEqualHash } = require('../utils/securityCrypto')
const { revokeSessions } = require('../utils/sessionSecurity')

const NORMALIZED_PHONE_SQL = "REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(phone, '+', ''), '-', ''), ' ', ''), '(', ''), ')', '')"
const MAX_OTP_ATTEMPTS = 5

const ROLE_CONFIG = {
  patient: { table: 'patients' },
  doctor: { table: 'doctors', where: 'email = ? AND is_active = 1' },
  staff: { table: 'staff', where: "email = ? AND status = 'active'" },
  admin: { table: 'admins', where: 'email = ?' },
}

const normalizeEmail = (value) => String(value || '').trim().toLowerCase()

const getPhoneVariants = (value) => {
  const normalizedPhone = normalizePhilippinePhone(value)
  if (!normalizedPhone) return []
  return Array.from(new Set([normalizedPhone, `0${normalizedPhone.slice(2)}`, normalizedPhone.slice(2)]))
}

const findPatientByPhone = async (phone) => {
  const variants = getPhoneVariants(phone)
  if (!variants.length) return { normalizedPhone: null, rows: [] }
  const placeholders = variants.map(() => '?').join(', ')
  const [rows] = await db.query(
    `SELECT id, full_name, email, phone, email_verified_at, phone_verified_at
     FROM patients
     WHERE ${NORMALIZED_PHONE_SQL} IN (${placeholders})
       AND COALESCE(is_walk_in, 0) = 0`,
    variants
  )
  return { normalizedPhone: variants[0], rows }
}

const findPatientByEmail = async (email) => {
  const normalizedEmail = normalizeEmail(email)
  if (!normalizedEmail) return { normalizedEmail: null, rows: [] }
  const [rows] = await db.query(
    `SELECT id, full_name, email, phone, email_verified_at, phone_verified_at
     FROM patients
     WHERE LOWER(email) = ?
       AND COALESCE(is_walk_in, 0) = 0`,
    [normalizedEmail]
  )
  return { normalizedEmail, rows }
}

const maskEmail = (email) => {
  const normalized = normalizeEmail(email)
  const [local, domain] = normalized.split('@')
  if (!local || !domain) return 'your email address'
  const visible = local.length <= 2 ? local.slice(0, 1) : local.slice(0, 2)
  return `${visible}${'•'.repeat(Math.max(3, Math.min(8, local.length - visible.length)))}@${domain}`
}

const maskPhone = (phone) => {
  const normalized = normalizePhilippinePhone(phone)
  if (!normalized) return 'your mobile number'
  const local = `0${normalized.slice(2)}`
  return `${local.slice(0, 4)} ••• ${local.slice(-4)}`
}


const genericRecoveryResponse = (deliveryMethod, { email = '', phone = '' } = {}) => ({
  message: 'If an account matches the information provided, a verification code will be sent.',
  delivery_method: deliveryMethod,
  masked_destination: deliveryMethod === 'sms' ? maskPhone(phone) : maskEmail(email),
})

const forgotPassword = async (req, res) => {
  const { email, phone, role } = req.body
  const config = ROLE_CONFIG[role]
  if (!config) return res.status(400).json({ message: 'A valid role is required.' })

  const requestedMethod = String(req.body.delivery_method || '').toLowerCase()
  const deliveryMethod = role === 'patient' && requestedMethod === 'sms' ? 'sms' : 'email'
  const normalizedInputEmail = normalizeEmail(email)
  const normalizedInputPhone = normalizePhilippinePhone(phone)

  if (deliveryMethod === 'sms' && !normalizedInputPhone) {
    return res.status(400).json({ message: 'Enter a valid Philippine mobile number.' })
  }
  if (deliveryMethod === 'email' && !normalizedInputEmail) {
    return res.status(400).json({ message: 'Enter a valid email address.' })
  }

  const generic = genericRecoveryResponse(deliveryMethod, {
    email: normalizedInputEmail,
    phone: normalizedInputPhone,
  })

  let account = null
  let identifier = deliveryMethod === 'sms' ? normalizedInputPhone : normalizedInputEmail

  if (role === 'patient') {
    const patientMatch = deliveryMethod === 'sms'
      ? await findPatientByPhone(normalizedInputPhone)
      : await findPatientByEmail(normalizedInputEmail)

    if (patientMatch.rows.length !== 1) {
      if (patientMatch.rows.length > 1) {
        console.warn('[security] password recovery matched duplicate patient records', {
          deliveryMethod,
          identifier,
          count: patientMatch.rows.length,
        })
      }
      return res.json(generic)
    }

    account = patientMatch.rows[0]
    const channelVerified = deliveryMethod === 'sms'
      ? Boolean(account.phone_verified_at)
      : Boolean(account.email_verified_at)
    if (!channelVerified) return res.json(generic)
  } else {
    const [rows] = await db.query(
      `SELECT id, full_name, email FROM ${config.table} WHERE ${config.where}`,
      [normalizedInputEmail]
    )
    if (rows.length !== 1) return res.json(generic)
    account = rows[0]
  }

  const otp = makeNumericCode()
  const expires = new Date(Date.now() + 10 * 60 * 1000)

  // Only one password-reset challenge is active per account and role. This is
  // separate from account_security_codes, whose purposes may coexist.
  await db.query('DELETE FROM password_resets WHERE role = ? AND account_id = ?', [role, account.id])
  await db.query(
    `INSERT INTO password_resets
     (email, identifier, account_id, token, role, expires_at, attempt_count, last_sent_at)
     VALUES (?, ?, ?, ?, ?, ?, 0, NOW())`,
    [account.email || null, identifier, account.id, hashSecret(otp), role, expires]
  )

  try {
    if (role === 'patient' && deliveryMethod === 'sms') {
      await sendPatientPasswordResetOtp({ phone: account.phone, code: otp, fullName: account.full_name })
    } else {
      await sendPasswordResetOtp(account.email, account.full_name, role, otp)
    }
  } catch (err) {
    // Do not reveal account existence or provider state to an unauthenticated caller.
    // The failed challenge is removed so a later retry can create a fresh code.
    console.error('[security] password-reset delivery failed', {
      role,
      accountId: account.id,
      deliveryMethod,
      message: err.message,
    })
    await db.query('DELETE FROM password_resets WHERE role = ? AND account_id = ?', [role, account.id])
  }

  return res.json(generic)
}

const verifyOtp = async (req, res) => {
  const { email, phone, role, otp } = req.body
  if (!ROLE_CONFIG[role] || !otp) {
    return res.status(400).json({ message: 'Recovery identifier, role, and verification code are required.' })
  }

  const requestedMethod = String(req.body.delivery_method || '').toLowerCase()
  const deliveryMethod = role === 'patient' && requestedMethod === 'sms' ? 'sms' : 'email'

  let identifier = normalizeEmail(email)
  if (role === 'patient' && deliveryMethod === 'sms') {
    identifier = normalizePhilippinePhone(phone)
    if (!identifier) return res.status(400).json({ message: 'Enter a valid Philippine mobile number.' })
  } else if (!identifier) {
    return res.status(400).json({ message: 'Email, role, and verification code are required.' })
  }

  const [rows] = await db.query(
    `SELECT * FROM password_resets
     WHERE identifier = ? AND role = ? AND expires_at > NOW()
     LIMIT 1`,
    [identifier, role]
  )
  const reset = rows[0]

  if (!reset || Number(reset.attempt_count || 0) >= MAX_OTP_ATTEMPTS || !timingSafeEqualHash(otp, reset.token)) {
    if (reset) {
      const nextAttempts = Number(reset.attempt_count || 0) + 1
      if (nextAttempts >= MAX_OTP_ATTEMPTS) await db.query('DELETE FROM password_resets WHERE id = ?', [reset.id])
      else await db.query('UPDATE password_resets SET attempt_count = ? WHERE id = ?', [nextAttempts, reset.id])
    }
    return res.status(400).json({ message: 'Invalid or expired verification code.' })
  }

  const resetToken = makeRandomToken(32)
  const newExpiry = new Date(Date.now() + 60 * 60 * 1000)
  await db.query(
    `UPDATE password_resets SET token = ?, expires_at = ?, verified_at = NOW() WHERE id = ?`,
    [resetToken, newExpiry, reset.id]
  )
  return res.json({ message: 'Code verified.', resetToken })
}

const resetPassword = async (req, res) => {
  const { resetToken, password } = req.body
  if (!resetToken || !password) return res.status(400).json({ message: 'Reset token and new password are required.' })
  const passwordError = validatePassword(password)
  if (passwordError) return res.status(400).json({ message: passwordError })

  const [rows] = await db.query(
    `SELECT * FROM password_resets WHERE token = ? AND verified_at IS NOT NULL AND expires_at > NOW() LIMIT 1`,
    [resetToken]
  )
  if (!rows.length) return res.status(400).json({ message: 'Reset session expired. Please start over.' })

  const reset = rows[0]
  const config = ROLE_CONFIG[reset.role]
  if (!config || !reset.account_id) return res.status(400).json({ message: 'Reset session is invalid. Please start over.' })

  const hashed = await bcrypt.hash(password, 10)
  const extra = ['staff', 'doctor'].includes(reset.role) ? ', must_change_password = 0, password_changed_at = NOW()' : ''
  await db.query(`UPDATE ${config.table} SET password = ?${extra} WHERE id = ?`, [hashed, reset.account_id])
  await revokeSessions(reset.role, reset.account_id)
  await db.query('DELETE FROM password_resets WHERE id = ?', [reset.id])

  return res.json({ message: 'Password reset successfully. You can now log in.' })
}

module.exports = { forgotPassword, verifyOtp, resetPassword }
