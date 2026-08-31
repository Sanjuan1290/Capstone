const db = require('../db/connect')
const bcrypt = require('bcrypt')
const { sendPasswordResetOtp } = require('../utils/emailService')
const { normalizePhilippinePhone } = require('../utils/phone')
const { sendPatientPasswordResetOtp } = require('../utils/smsService')
const { validatePassword } = require('../utils/accountSecurity')
const { makeNumericCode, makeRandomToken, hashSecret, timingSafeEqualHash } = require('../utils/securityCrypto')
const { revokeSessions } = require('../utils/sessionSecurity')

const NORMALIZED_PHONE_SQL = "REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(phone, '+', ''), '-', ''), ' ', ''), '(', ''), ')', '')"
const GENERIC_SENT_MESSAGE = 'If an account matches the information provided, a verification code has been sent.'
const MAX_OTP_ATTEMPTS = 5

const ROLE_CONFIG = {
  patient: { table: 'patients' },
  doctor: { table: 'doctors', where: 'email = ? AND is_active = 1' },
  staff: { table: 'staff', where: "email = ? AND status = 'active'" },
  admin: { table: 'admins', where: 'email = ?' },
}

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
    `SELECT id, full_name, phone FROM patients WHERE ${NORMALIZED_PHONE_SQL} IN (${placeholders})`,
    variants
  )
  return { normalizedPhone: variants[0], rows }
}

const forgotPassword = async (req, res) => {
  const { email, phone, role } = req.body
  const config = ROLE_CONFIG[role]
  if (!config) return res.status(400).json({ message: 'A valid role is required.' })

  let account = null
  let identifier = null
  if (role === 'patient') {
    const patientMatch = await findPatientByPhone(phone)
    if (!patientMatch.normalizedPhone) return res.status(400).json({ message: 'Enter a valid Philippine mobile number.' })
    identifier = patientMatch.normalizedPhone
    if (patientMatch.rows.length === 1) account = patientMatch.rows[0]
  } else {
    if (!email) return res.status(400).json({ message: 'Email and valid role are required.' })
    identifier = String(email).trim().toLowerCase()
    const [rows] = await db.query(
      `SELECT id, full_name, email FROM ${config.table} WHERE ${config.where}`,
      [identifier]
    )
    if (rows.length === 1) account = rows[0]
  }

  // Do not reveal whether an account exists.
  if (!account) return res.json({ message: GENERIC_SENT_MESSAGE })

  const otp = makeNumericCode()
  const expires = new Date(Date.now() + 10 * 60 * 1000)
  await db.query('DELETE FROM password_resets WHERE role = ? AND identifier = ?', [role, identifier])
  await db.query(
    `INSERT INTO password_resets
     (email, identifier, account_id, token, role, expires_at, attempt_count, last_sent_at)
     VALUES (?, ?, ?, ?, ?, ?, 0, NOW())`,
    [role === 'patient' ? null : account.email, identifier, account.id, hashSecret(otp), role, expires]
  )

  try {
    if (role === 'patient') {
      await sendPatientPasswordResetOtp({ phone: identifier, code: otp, fullName: account.full_name })
    } else {
      await sendPasswordResetOtp(account.email, account.full_name, role, otp)
    }
  } catch (err) {
    console.error('[security] password-reset delivery failed', { role, accountId: account.id, message: err.message })
    await db.query('DELETE FROM password_resets WHERE role = ? AND identifier = ?', [role, identifier])
    return res.status(502).json({ message: 'Verification code could not be sent. Please try again later.' })
  }

  return res.json({ message: GENERIC_SENT_MESSAGE })
}

const verifyOtp = async (req, res) => {
  const { email, phone, role, otp } = req.body
  if (!ROLE_CONFIG[role] || !otp) return res.status(400).json({ message: 'Recovery identifier, role, and verification code are required.' })

  let identifier = String(email || '').trim().toLowerCase()
  if (role === 'patient') {
    identifier = normalizePhilippinePhone(phone)
    if (!identifier) return res.status(400).json({ message: 'Enter a valid Philippine mobile number.' })
  } else if (!identifier) {
    return res.status(400).json({ message: 'Email, role, and verification code are required.' })
  }

  const [rows] = await db.query(
    `SELECT * FROM password_resets WHERE identifier = ? AND role = ? AND expires_at > NOW() LIMIT 1`,
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
