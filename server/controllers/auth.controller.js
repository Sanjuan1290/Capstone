const db = require('../db/connect')
const bcrypt = require('bcrypt')
const crypto = require('crypto')
const { sendPasswordResetOtp } = require('../utils/emailService')
const { normalizePhilippinePhone } = require('../utils/phone')
const { sendPatientPasswordResetOtp } = require('../utils/smsService')

const NORMALIZED_PHONE_SQL = "REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(phone, '+', ''), '-', ''), ' ', ''), '(', ''), ')', '')"

const ROLE_CONFIG = {
  patient: {
    table: 'patients',
    lookupField: 'phone',
    missingMessage: 'No patient account is registered with that phone number.',
  },
  doctor: {
    table: 'doctors',
    lookupField: 'email',
    where: 'email = ? AND is_active = 1',
    missingMessage: 'No active doctor account is registered with that email.',
  },
  staff: {
    table: 'staff',
    lookupField: 'email',
    where: "email = ? AND status = 'active'",
    missingMessage: 'No active staff account is registered with that email.',
  },
}

const getPhoneVariants = (value) => {
  const normalizedPhone = normalizePhilippinePhone(value)
  if (!normalizedPhone) return []

  return Array.from(new Set([
    normalizedPhone,
    `0${normalizedPhone.slice(2)}`,
    normalizedPhone.slice(2),
  ]))
}

const findPatientByPhone = async (phone) => {
  const variants = getPhoneVariants(phone)
  if (variants.length === 0) {
    return { normalizedPhone: null, rows: [] }
  }

  const placeholders = variants.map(() => '?').join(', ')
  const [rows] = await db.query(
    `SELECT id, full_name, phone
     FROM patients
     WHERE ${NORMALIZED_PHONE_SQL} IN (${placeholders})`,
    variants
  )

  return {
    normalizedPhone: variants[0],
    rows,
  }
}

const forgotPassword = async (req, res) => {
  const { email, phone, role } = req.body
  const config = ROLE_CONFIG[role]

  if (!config) {
    return res.status(400).json({ message: 'A valid role is required.' })
  }

  let account
  let identifier

  if (role === 'patient') {
    if (!phone) {
      return res.status(400).json({ message: 'Phone number and valid role are required.' })
    }

    const patientMatch = await findPatientByPhone(phone)
    if (!patientMatch.normalizedPhone) {
      return res.status(400).json({ message: 'Enter a valid Philippine mobile number.' })
    }
    if (patientMatch.rows.length > 1) {
      return res.status(409).json({
        message: 'Multiple patient records use this phone number. Please contact the clinic to resolve the duplicate records.',
      })
    }
    if (patientMatch.rows.length === 0) {
      return res.status(404).json({ message: config.missingMessage })
    }

    identifier = patientMatch.normalizedPhone
    account = patientMatch.rows[0]
  } else {
    if (!email) {
      return res.status(400).json({ message: 'Email and valid role are required.' })
    }

    const [rows] = await db.query(
      `SELECT id, full_name, email FROM ${config.table} WHERE ${config.where}`,
      [email]
    )

    if (rows.length === 0) {
      return res.status(404).json({ message: config.missingMessage })
    }

    identifier = email
    account = rows[0]
  }

  const otp = String(Math.floor(100000 + Math.random() * 900000))
  const expires = new Date(Date.now() + 10 * 60 * 1000)

  await db.query('DELETE FROM password_resets WHERE role = ? AND (identifier = ? OR email = ?)', [role, identifier, identifier])
  await db.query(
    'INSERT INTO password_resets (email, identifier, account_id, token, role, expires_at) VALUES (?, ?, ?, ?, ?, ?)',
    [role === 'patient' ? identifier : account.email, identifier, account.id, otp, role, expires]
  )

  if (role === 'patient') {
    try {
      await sendPatientPasswordResetOtp({
        phone: identifier,
        code: otp,
        fullName: account.full_name,
      })
    } catch (err) {
      console.error('Patient password reset OTP SMS failed:', err.message)
      await db.query('DELETE FROM password_resets WHERE role = ? AND identifier = ?', [role, identifier])
      return res.status(500).json({ message: 'Failed to send verification code. Please try again.' })
    }

    return res.json({ message: 'Verification code sent by SMS.' })
  }

  try {
    await sendPasswordResetOtp(identifier, account.full_name, role, otp)
  } catch (err) {
    console.error('Password reset OTP email failed:', err.message)
    await db.query('DELETE FROM password_resets WHERE role = ? AND identifier = ?', [role, identifier])
    return res.status(500).json({ message: 'Failed to send verification code. Please try again.' })
  }

  return res.json({ message: 'Verification code sent.' })
}

const verifyOtp = async (req, res) => {
  const { email, phone, role, otp } = req.body

  if (!role || !otp) {
    return res.status(400).json({ message: 'Recovery identifier, role, and OTP are required.' })
  }

  let identifier = email
  if (role === 'patient') {
    const normalizedPhone = normalizePhilippinePhone(phone)
    if (!normalizedPhone) {
      return res.status(400).json({ message: 'Enter a valid Philippine mobile number.' })
    }
    identifier = normalizedPhone
  } else if (!email) {
    return res.status(400).json({ message: 'Email, role, and OTP are required.' })
  }

  const [rows] = await db.query(
    'SELECT * FROM password_resets WHERE identifier = ? AND role = ? AND token = ? AND expires_at > NOW()',
    [identifier, role, String(otp)]
  )

  if (rows.length === 0) {
    return res.status(400).json({ message: 'Invalid or expired verification code.' })
  }

  const resetToken = crypto.randomBytes(32).toString('hex')
  const newExpiry = new Date(Date.now() + 60 * 60 * 1000)

  await db.query(
    'UPDATE password_resets SET token = ?, expires_at = ? WHERE id = ?',
    [resetToken, newExpiry, rows[0].id]
  )

  return res.json({ message: 'Code verified.', resetToken })
}

const resetPassword = async (req, res) => {
  const { resetToken, password } = req.body

  if (!resetToken || !password) {
    return res.status(400).json({ message: 'Reset token and new password are required.' })
  }

  if (password.length < 6) {
    return res.status(400).json({ message: 'Password must be at least 6 characters.' })
  }

  const [rows] = await db.query(
    'SELECT * FROM password_resets WHERE token = ? AND expires_at > NOW()',
    [resetToken]
  )

  if (rows.length === 0) {
    return res.status(400).json({ message: 'Reset session expired. Please start over.' })
  }

  const { email, role } = rows[0]
  const config = ROLE_CONFIG[role]
  const identifier = rows[0].identifier || email

  if (!config) {
    return res.status(400).json({ message: 'Invalid role in reset token.' })
  }

  const hashed = await bcrypt.hash(password, 10)
  if (role === 'patient') {
    if (!rows[0].account_id) {
      return res.status(400).json({ message: 'Reset session is missing the patient account reference. Please start over.' })
    }
    await db.query('UPDATE patients SET password = ? WHERE id = ?', [hashed, rows[0].account_id])
  } else {
    await db.query(`UPDATE ${config.table} SET password = ? WHERE email = ?`, [hashed, identifier])
  }
  await db.query('DELETE FROM password_resets WHERE token = ?', [resetToken])

  return res.json({ message: 'Password reset successfully. You can now log in.' })
}

module.exports = { forgotPassword, verifyOtp, resetPassword }
